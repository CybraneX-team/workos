import { Router, type Request, type Response } from 'express';
import { pool } from '../../db.js';
import { log } from '../../lib/logger.js';
import { authJwt } from '../../middleware/authJwt.js';
import { accessAllows, getDepartmentAccessMap } from '../../departmentAccess.js';
import { requirePermission } from '../../rbac.js';
import { isGeminiUnavailable } from './classify.js';
import { buildPlaybook, type PlaybookResult } from './playbook.js';
import { PlaybookRequestSchema, type PlaybookRequest } from './schemas.js';

// Each generation is two Gemini calls, so limits are deliberately modest. They are counted from the
// usage table so they hold across server instances and restarts.
export const USER_HOURLY_LIMIT = 20;
export const COMPANY_DAILY_LIMIT = 300;

export interface RunCounts {
  userLastHour: number;
  companyLastDay: number;
  /** Seconds until the oldest counted run for this user leaves the hourly window. */
  userRetryAfterSeconds: number;
}

export type LimitVerdict = { ok: true } | { ok: false; scope: 'user' | 'company'; retryAfterSeconds: number };

export function evaluateLimits(c: RunCounts): LimitVerdict {
  if (c.userLastHour >= USER_HOURLY_LIMIT) return { ok: false, scope: 'user', retryAfterSeconds: Math.max(1, c.userRetryAfterSeconds) };
  if (c.companyLastDay >= COMPANY_DAILY_LIMIT) return { ok: false, scope: 'company', retryAfterSeconds: 3600 };
  return { ok: true };
}

export interface PlaybookHandlerDeps {
  build: (req: PlaybookRequest) => Promise<PlaybookResult>;
  countRuns: (companyId: string, userId: string) => Promise<RunCounts>;
  recordRun: (companyId: string, userId: string, taskKey: string, result: PlaybookResult) => Promise<void>;
}

export const dbDeps: PlaybookHandlerDeps = {
  build: (req) => buildPlaybook(req),
  async countRuns(companyId, userId) {
    const { rows } = await pool.query<{ u: string; c: string; retry: string | null }>(
      `select
         count(*) filter (where user_id = $2 and created_at > now() - interval '1 hour') as u,
         count(*) as c,
         extract(epoch from (min(created_at) filter (where user_id = $2 and created_at > now() - interval '1 hour') + interval '1 hour' - now())) as retry
       from public.object_space_playbook_runs
       where company_id = $1 and created_at > now() - interval '24 hours'`,
      [companyId, userId],
    );
    const r = rows[0];
    return { userLastHour: Number(r?.u ?? 0), companyLastDay: Number(r?.c ?? 0), userRetryAfterSeconds: Math.ceil(Number(r?.retry ?? 0)) };
  },
  async recordRun(companyId, userId, taskKey, result) {
    await pool.query(
      `insert into public.object_space_playbook_runs
         (company_id, user_id, task_key, archetypes, confidence, broad_classification, fallback, fallback_reason,
          model, prompt_version, archetype_version, step_count, latency_ms)
       values ($1,$2,$3,$4::jsonb,$5,$6,$7,$8,$9,$10,$11,$12,$13)`,
      [
        companyId, userId, taskKey.slice(0, 120), JSON.stringify(result.archetypes), result.confidence,
        result.meta.broadClassification, result.meta.fallback, result.meta.fallbackReason ?? null,
        result.meta.model, result.meta.promptVersion, result.meta.archetypeVersion, result.steps.length, result.meta.latencyMs,
      ],
    );
  },
};

/**
 * POST /playbook handler. Dependencies are injected so the limit, dedupe and error mapping can be
 * tested without a database or Gemini. company_id and user always come from the verified JWT.
 */
export function createPlaybookHandler(deps: PlaybookHandlerDeps) {
  // A double-click or a React remount must not pay for two generations of the same task.
  const inFlight = new Map<string, Promise<PlaybookResult>>();

  return async (req: Request, res: Response) => {
    const companyId = req.auth?.companyId;
    const userId = req.auth?.userId;
    if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });

    const parsed = PlaybookRequestSchema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({ error: 'invalid_request', issues: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join('.'), message: i.message })) });
    }
    const input = parsed.data;
    const key = `${companyId}:${userId}:${input.taskKey}`;

    try {
      let pending = inFlight.get(key);
      if (!pending) {
        const verdict = evaluateLimits(await deps.countRuns(companyId, userId));
        if (!verdict.ok) {
          res.setHeader('Retry-After', String(verdict.retryAfterSeconds));
          return res.status(429).json({ error: 'playbook_rate_limited', scope: verdict.scope, retryAfterSeconds: verdict.retryAfterSeconds });
        }
        pending = deps.build(input).finally(() => inFlight.delete(key));
        inFlight.set(key, pending);
        // Failed generations are reported by the catch below; only a failed usage-log write is reported here.
        void pending.then(
          (result) =>
            deps
              .recordRun(companyId, userId, input.taskKey, result)
              .catch((error) => log.error({ err: String(error), taskKey: input.taskKey }, 'object_space_playbook_run_log_failed')),
          () => undefined,
        );
      }
      return res.json(await pending);
    } catch (error) {
      if (error instanceof Error && error.message === 'gemini_api_key_not_configured') return res.status(503).json({ error: 'gemini_not_configured' });
      if (isGeminiUnavailable(error)) {
        log.error({ err: String(error).slice(0, 200), taskKey: input.taskKey }, 'object_space_playbook_ai_unavailable');
        return res.status(503).json({ error: 'ai_unavailable', retryable: true });
      }
      log.error({ err: String(error).slice(0, 300), taskKey: input.taskKey }, 'object_space_playbook_failed');
      return res.status(500).json({ error: 'playbook_failed' });
    }
  };
}

export interface ObjectSpaceContext {
  departments: Array<{ id: string; label: string; domain: string }>;
  /** The caller's own details from the DB, used to pre-fill the create-task form. */
  me: { jobTitle: string | null; departmentId: string | null };
}

/**
 * Small, lazily-fetched context for the create-task form: the departments this user can see, plus the
 * caller's own job title (user_profiles.title) and department (company_members.department_id).
 */
export async function readObjectSpaceContext(auth: { companyId: string; userId: string; role: any }): Promise<ObjectSpaceContext> {
  const [accessMap, depts, me] = await Promise.all([
    getDepartmentAccessMap(auth),
    pool.query<{ id: string; label: string; domain: string }>(
      `select id, label, domain from public.departments where company_id = $1 order by sort_order, label`,
      [auth.companyId],
    ),
    pool.query<{ department_id: string | null; title: string | null }>(
      `select m.department_id, p.title
         from public.company_members m
         left join public.user_profiles p on p.id = m.user_id
        where m.company_id = $1 and m.user_id = $2 and m.status = 'active'
        limit 1`,
      [auth.companyId, auth.userId],
    ),
  ]);
  const departments = depts.rows.filter((d) => accessAllows(accessMap.get(d.id) ?? { read: false, write: false, delete: false, manage: false }, 'read'));
  const row = me.rows[0];
  const departmentId = row?.department_id && departments.some((d) => d.id === row.department_id) ? row.department_id : null;
  return { departments, me: { jobTitle: row?.title?.trim() || null, departmentId } };
}

export const objectSpaceRouter = Router();
objectSpaceRouter.use(authJwt, requirePermission('twin', 'read'));
objectSpaceRouter.get('/context', async (req: Request, res: Response) => {
  const { companyId, userId, role } = req.auth ?? {};
  if (!companyId || !userId) return res.status(403).json({ error: 'no_company' });
  try {
    return res.json(await readObjectSpaceContext({ companyId, userId, role }));
  } catch (error) {
    log.error({ err: String(error).slice(0, 300) }, 'object_space_context_failed');
    return res.status(500).json({ error: 'context_failed' });
  }
});
objectSpaceRouter.post('/playbook', createPlaybookHandler(dbDeps));
