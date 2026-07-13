import { test, expect } from '@playwright/test';
import {
  createRbacFixture,
  cleanupRbacFixture,
  signInUser,
  type RbacFixture,
} from '../rbac/helpers/fixture';

// All routes require twin:write. The founder role has it — no extra grants needed.
// Requires same env as RBAC tests: RBAC_E2E_ALLOW_SHARED_DEV=true when using remote Supabase.

const backendUrl = process.env.E2E_BACKEND_URL ?? 'http://127.0.0.1:8080';
const base = (companyId: string) => `${backendUrl}/api/bdt-metrics/${companyId}`;

test.describe('BDT Metric Propagation Chain', () => {
  let fixture: RbacFixture;
  let token: string;
  let companyId: string;

  // ids set by earlier tests and read by later ones
  let metricId: string;
  let goalId: string;
  let impactId: string;

  test.beforeAll(async () => {
    fixture = await createRbacFixture();
    companyId = fixture.companyId;
    const session = await signInUser(fixture.users.founder);
    token = session.accessToken;
  });

  test.afterAll(async () => {
    await cleanupRbacFixture(fixture);
  });

  function auth() {
    return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
  }

  // ── 1. Create metric ─────────────────────────────────────────────────────────

  test('1: POST metric → 201, id returned, value=0', async ({ request }) => {
    const res = await request.post(`${base(companyId)}/metrics`, {
      headers: auth(),
      data: {
        name: 'E2E MRR',
        scope: 'company',
        value: 0,
        target: 100,
        baseline: 0,
        unit: '$',
        higher_is_better: true,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    metricId = body.id;
    // Postgres NUMERIC fields come back as strings in JSON
    expect(Number(body.value)).toBe(0);
  });

  // ── 2. Create goal ───────────────────────────────────────────────────────────

  test('2: POST goal → 201, id returned', async ({ request }) => {
    const res = await request.post(`${base(companyId)}/goals`, {
      headers: auth(),
      data: { title: 'E2E Revenue Goal', horizon: 'quarterly' },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    goalId = body.id;
  });

  // ── 3. Link goal → metric ────────────────────────────────────────────────────

  test('3: POST goal-metric link → 201', async ({ request }) => {
    const res = await request.post(`${base(companyId)}/goals/${goalId}/links`, {
      headers: auth(),
      data: { metric_id: metricId, contribution_weight: 1.0 },
    });
    expect(res.status()).toBe(201);
  });

  // ── 4. Strategic score baseline ──────────────────────────────────────────────

  test('4: GET strategic-score → linked goal present in response', async ({ request }) => {
    const res = await request.get(`${base(companyId)}/strategic-score`, {
      headers: auth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(Array.isArray(body.goals)).toBe(true);
    const linked = body.goals.find((g: { id: string }) => g.id === goalId);
    expect(linked).toBeTruthy();
  });

  // ── 5. Create impact ─────────────────────────────────────────────────────────

  test('5: POST impact → 201, unresolved', async ({ request }) => {
    const res = await request.post(`${base(companyId)}/impacts`, {
      headers: auth(),
      data: {
        metric_id: metricId,
        estimated_delta: 50,
        estimated_confidence: 0.8,
      },
    });
    expect(res.status()).toBe(201);
    const body = await res.json();
    expect(typeof body.id).toBe('string');
    impactId = body.id;
    expect(body.resolved_at).toBeNull();
  });

  // ── 6. Resolve impact → propagation fires ────────────────────────────────────

  test('6: PATCH resolve → metric.value=40, variance=-10, resolved_at set', async ({ request }) => {
    const res = await request.patch(`${base(companyId)}/impacts/${impactId}/resolve`, {
      headers: auth(),
      data: { actual_delta: 40, reason: 'E2E propagation test' },
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    // baseline=0, actual_delta=40 → value should be 40
    expect(Number(body.metric.value)).toBe(40);
    // variance = actual_delta - estimated_delta = 40 - 50 = -10
    expect(Number(body.impact.variance)).toBe(-10);
    expect(body.impact.resolved_at).not.toBeNull();
  });

  // ── 7. Metric persisted ───────────────────────────────────────────────────────

  test('7: GET metrics → value persisted as 40', async ({ request }) => {
    const res = await request.get(`${base(companyId)}/metrics`, {
      headers: auth(),
    });
    expect(res.status()).toBe(200);
    const metrics: Array<{ id: string; value: number | string }> = await res.json();
    const m = metrics.find(m => m.id === metricId);
    expect(m).toBeTruthy();
    expect(Number(m!.value)).toBe(40);
  });

  // ── 8. Strategic score updated ────────────────────────────────────────────────

  test('8: GET strategic-score → non-null score, goal_progress > 0', async ({ request }) => {
    const res = await request.get(`${base(companyId)}/strategic-score`, {
      headers: auth(),
    });
    expect(res.status()).toBe(200);
    const body = await res.json();
    expect(body.strategic_score).not.toBeNull();
    const linked = body.goals.find((g: { id: string; goal_progress: number | null }) => g.id === goalId);
    expect(linked).toBeTruthy();
    expect(Number(linked!.goal_progress)).toBeGreaterThan(0);
  });
});
