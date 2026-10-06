import assert from 'node:assert/strict';
import test from 'node:test';
import {
  COMPANY_DAILY_LIMIT, USER_HOURLY_LIMIT, createPlaybookHandler, evaluateLimits,
  type PlaybookHandlerDeps,
} from '../src/domains/object-space/router.js';
import type { PlaybookResult } from '../src/domains/object-space/playbook.js';

const body = {
  taskKey: 'task-1', title: 'Follow up with Lumina Cloud',
  assignee: { name: 'Alex', jobTitle: 'Outbound SDR' }, department: { name: 'Outbound Sales & BDR' },
};

const result = (): PlaybookResult => ({
  archetypes: [{ key: 'follow_up', weight: 1 }], confidence: 0.9, steps: [],
  meta: { model: 'm', promptVersion: 'p1', archetypeVersion: 'v1', fallback: false, broadClassification: false, latencyMs: 5 },
});

function call(handler: ReturnType<typeof createPlaybookHandler>, req: Record<string, unknown>) {
  return new Promise<{ status: number; json: any; headers: Record<string, string> }>((resolve) => {
    const out = { status: 200, headers: {} as Record<string, string> };
    const res: any = {
      setHeader: (k: string, v: string) => { out.headers[k] = v; },
      status(code: number) { out.status = code; return res; },
      json(payload: unknown) { resolve({ ...out, json: payload }); return res; },
    };
    handler(req as any, res);
  });
}

function deps(over: Partial<PlaybookHandlerDeps> = {}) {
  const recorded: unknown[] = [];
  const d: PlaybookHandlerDeps = {
    build: async () => result(),
    countRuns: async () => ({ userLastHour: 0, companyLastDay: 0, userRetryAfterSeconds: 0 }),
    recordRun: async (...args) => { recorded.push(args); },
    ...over,
  };
  return { d, recorded };
}

const auth = { auth: { userId: 'u1', companyId: 'c1' } };

test('limits: user hourly and company daily, with retry-after', () => {
  assert.deepEqual(evaluateLimits({ userLastHour: 0, companyLastDay: 0, userRetryAfterSeconds: 0 }), { ok: true });
  assert.deepEqual(evaluateLimits({ userLastHour: USER_HOURLY_LIMIT, companyLastDay: 1, userRetryAfterSeconds: 120 }), { ok: false, scope: 'user', retryAfterSeconds: 120 });
  assert.deepEqual(evaluateLimits({ userLastHour: 0, companyLastDay: COMPANY_DAILY_LIMIT, userRetryAfterSeconds: 0 }), { ok: false, scope: 'company', retryAfterSeconds: 3600 });
});

test('rejects requests with no company, and malformed bodies', async () => {
  const { d } = deps();
  const h = createPlaybookHandler(d);
  assert.equal((await call(h, { body, auth: { userId: 'u1', companyId: null } })).status, 403);
  const bad = await call(h, { body: { ...body, title: '' }, ...auth });
  assert.equal(bad.status, 400);
  assert.equal(bad.json.error, 'invalid_request');
});

test('success returns the playbook and logs the run with company and user from the JWT', async () => {
  const { d, recorded } = deps();
  const r = await call(createPlaybookHandler(d), { body, ...auth });
  assert.equal(r.status, 200);
  assert.equal(r.json.archetypes[0].key, 'follow_up');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(recorded.length, 1);
  assert.deepEqual((recorded[0] as unknown[]).slice(0, 3), ['c1', 'u1', 'task-1']);
});

test('over the limit returns 429 with Retry-After and does not call the model', async () => {
  let built = 0;
  const { d } = deps({
    build: async () => { built += 1; return result(); },
    countRuns: async () => ({ userLastHour: USER_HOURLY_LIMIT, companyLastDay: 5, userRetryAfterSeconds: 90 }),
  });
  const r = await call(createPlaybookHandler(d), { body, ...auth });
  assert.equal(r.status, 429);
  assert.equal(r.headers['Retry-After'], '90');
  assert.equal(r.json.error, 'playbook_rate_limited');
  assert.equal(built, 0);
});

test('concurrent identical requests share one generation', async () => {
  let built = 0;
  let release!: () => void;
  const gate = new Promise<void>((r) => { release = r; });
  const { d } = deps({ build: async () => { built += 1; await gate; return result(); } });
  const h = createPlaybookHandler(d);
  const a = call(h, { body, ...auth });
  await new Promise((resolve) => setImmediate(resolve));
  const b = call(h, { body, ...auth });
  await new Promise((resolve) => setImmediate(resolve));
  release();
  const [ra, rb] = await Promise.all([a, b]);
  assert.equal(built, 1);
  assert.equal(ra.status, 200);
  assert.equal(rb.status, 200);
});

test('Gemini availability errors map to 503, other failures to 500, and a log failure does not break the response', async () => {
  const unconfigured = await call(createPlaybookHandler(deps({ build: async () => { throw new Error('gemini_api_key_not_configured'); } }).d), { body, ...auth });
  assert.deepEqual([unconfigured.status, unconfigured.json.error], [503, 'gemini_not_configured']);
  const quota = await call(createPlaybookHandler(deps({ build: async () => { throw new Error('gemini_failed:429:quota'); } }).d), { body, ...auth });
  assert.deepEqual([quota.status, quota.json.error, quota.json.retryable], [503, 'ai_unavailable', true]);
  const boom = await call(createPlaybookHandler(deps({ build: async () => { throw new Error('boom'); } }).d), { body, ...auth });
  assert.equal(boom.status, 500);
  const logFail = await call(createPlaybookHandler(deps({ recordRun: async () => { throw new Error('db down'); } }).d), { body, ...auth });
  assert.equal(logFail.status, 200);
});
