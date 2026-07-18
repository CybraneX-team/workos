import type {
  MetaAdsAssignee,
  MetaAdsDecisionInbox,
  MetaAdsDeliverySummary,
  MetaAdsExperiment,
  MetaAdsExperimentConfidence,
  MetaAdsExperimentEvent,
  MetaAdsExperimentMetrics,
  MetaAdsExperimentOutcome,
  MetaAdsFinding,
  MetaAdsRecommendation,
} from '@cybranex/shared-types';
import { pool } from '../../db.js';

export class MetaAdsWorkflowError extends Error {
  constructor(public readonly status: number, message: string) {
    super(message);
  }
}

function fail(status: number, message: string): never {
  throw new MetaAdsWorkflowError(status, message);
}

function isoDate(value: string | Date): string {
  if (typeof value === 'string') return value.slice(0, 10);
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function shiftDate(value: string, days: number): string {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function localDate(now: Date, timezone: string): string {
  try {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return `${values.year}-${values.month}-${values.day}`;
  } catch {
    return now.toISOString().slice(0, 10);
  }
}

function round(value: number, places = 2): number {
  const factor = 10 ** places;
  return Math.round(value * factor) / factor;
}

function actionTotal(actions: Record<string, number> | null | undefined, action: string | null): number {
  return action && actions ? Number(actions[action]) || 0 : 0;
}

function purchaseCount(actions: Record<string, number> | null | undefined): number {
  return Object.entries(actions ?? {}).reduce((sum, [key, value]) => (
    key.toLowerCase() === 'purchase' || key.toLowerCase().endsWith('.purchase') ? sum + (Number(value) || 0) : sum
  ), 0);
}

function percentageChange(current: number | null, previous: number | null): number | null {
  if (current == null || previous == null || previous === 0) return null;
  return round(((current - previous) / Math.abs(previous)) * 100, 1);
}

function adsManagerUrl(accountId: string, scope: string, scopeId: string, recommendation?: MetaAdsRecommendation | null): string {
  if (recommendation?.adsManagerUrl) return recommendation.adsManagerUrl;
  const url = new URL('https://www.facebook.com/adsmanager/manage/campaigns');
  url.searchParams.set('act', accountId.replace(/^act_/, ''));
  if (scope === 'campaign') url.searchParams.set('selected_campaign_ids', scopeId);
  if (scope === 'adset') url.searchParams.set('selected_adset_ids', scopeId);
  if (scope === 'ad') url.searchParams.set('selected_ad_ids', scopeId);
  return url.toString();
}

type StoredMetricRow = {
  metric_date: string | Date;
  spend: string | number;
  impressions: string | number;
  clicks: string | number;
  purchase_roas: string | number;
  actions: Record<string, number> | null;
};

function aggregate(rows: StoredMetricRow[], selectedAction: string | null, from: string, through: string): MetaAdsExperimentMetrics {
  const spend = rows.reduce((sum, row) => sum + Number(row.spend || 0), 0);
  const impressions = rows.reduce((sum, row) => sum + Number(row.impressions || 0), 0);
  const clicks = rows.reduce((sum, row) => sum + Number(row.clicks || 0), 0);
  const conversions = rows.reduce((sum, row) => sum + actionTotal(row.actions, selectedAction), 0);
  const purchases = rows.reduce((sum, row) => sum + purchaseCount(row.actions), 0);
  const weightedRoas = rows.reduce((sum, row) => sum + Number(row.purchase_roas || 0) * Number(row.spend || 0), 0);
  return {
    periodStart: from,
    periodEnd: through,
    spend: round(spend),
    impressions,
    clicks,
    ctr: impressions > 0 ? round((clicks / impressions) * 100) : 0,
    cpc: clicks > 0 ? round(spend / clicks) : 0,
    purchaseRoas: spend > 0 ? round(weightedRoas / spend) : 0,
    purchaseCount: round(purchases),
    selectedConversions: round(conversions),
    cpa: conversions > 0 ? round(spend / conversions) : null,
  };
}

async function measurementMetrics(input: {
  companyId: string;
  accountId: string;
  scope: 'account' | 'campaign' | 'adset';
  scopeId: string;
  from: string;
  through: string;
  selectedAction: string | null;
}): Promise<MetaAdsExperimentMetrics> {
  let query = '';
  let params: unknown[] = [];
  if (input.scope === 'account') {
    query = `SELECT metric_date,spend,impressions,clicks,purchase_roas,actions FROM public.meta_ads_account_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4 ORDER BY metric_date`;
    params = [input.companyId, input.accountId, input.from, input.through];
  } else if (input.scope === 'campaign') {
    query = `SELECT metric_date,spend,impressions,clicks,purchase_roas,actions FROM public.meta_ads_campaign_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND campaign_id=$3 AND metric_date BETWEEN $4 AND $5 ORDER BY metric_date`;
    params = [input.companyId, input.accountId, input.scopeId, input.from, input.through];
  } else {
    query = `SELECT metric_date,spend,impressions,clicks,purchase_roas,actions FROM public.meta_ads_delivery_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND level='adset' AND entity_id=$3 AND metric_date BETWEEN $4 AND $5 ORDER BY metric_date`;
    params = [input.companyId, input.accountId, input.scopeId, input.from, input.through];
  }
  const { rows } = await pool.query<StoredMetricRow>(query, params);
  return aggregate(rows, input.selectedAction, input.from, input.through);
}

async function accountDayCount(companyId: string, accountId: string, from: string, through: string): Promise<number> {
  const { rows } = await pool.query(
    `SELECT COUNT(DISTINCT metric_date)::int AS days FROM public.meta_ads_account_daily
      WHERE company_id=$1 AND ad_account_id=$2 AND metric_date BETWEEN $3 AND $4`,
    [companyId, accountId, from, through],
  );
  return Number(rows[0]?.days ?? 0);
}

async function accountContext(companyId: string) {
  const { rows } = await pool.query(
    `SELECT c.account_name,c.last_synced_at,c.metadata,
            (SELECT MAX(metric_date) FROM public.meta_ads_account_daily h
              WHERE h.company_id=c.company_id AND h.ad_account_id=c.metadata->>'ad_account_id') AS data_through
       FROM public.integration_connections c WHERE c.company_id=$1 AND c.integration_id='int-meta'`,
    [companyId],
  );
  if (!rows[0]) return null;
  const metadata = (rows[0].metadata ?? {}) as Record<string, unknown>;
  return {
    accountId: String(metadata.ad_account_id ?? ''),
    accountName: rows[0].account_name ? String(rows[0].account_name).replace(/^Meta Ads · /, '') : null,
    timezone: String(metadata.timezone ?? 'UTC'),
    selectedAction: typeof metadata.meta_conversion_action_type === 'string' ? metadata.meta_conversion_action_type : null,
    dataThrough: rows[0].data_through ? isoDate(rows[0].data_through) : null,
    lastSyncedAt: rows[0].last_synced_at ? new Date(rows[0].last_synced_at).toISOString() : null,
  };
}

function shapeFinding(row: Record<string, unknown>): MetaAdsFinding {
  return {
    id: String(row.id), fingerprint: String(row.fingerprint), severity: row.severity as MetaAdsFinding['severity'],
    scope: row.scope as MetaAdsFinding['scope'], kind: String(row.kind), title: String(row.title), explanation: String(row.explanation),
    affectedPeriod: { start: row.period_start ? isoDate(row.period_start as string | Date) : null, end: row.period_end ? isoDate(row.period_end as string | Date) : null },
    evidence: (row.evidence ?? {}) as MetaAdsFinding['evidence'], estimatedSpendExposure: Number(row.estimated_spend_exposure),
    action: { kind: row.action_kind as MetaAdsFinding['action']['kind'], label: String(row.action_label), href: String(row.action_href) },
    firstDetectedAt: new Date(String(row.first_detected_at)).toISOString(), lastDetectedAt: new Date(String(row.last_detected_at)).toISOString(),
    episode: Number(row.episode ?? 0), confidence: row.confidence as MetaAdsFinding['confidence'],
    diagnosis: (row.diagnosis ?? null) as MetaAdsFinding['diagnosis'], recommendation: (row.recommendation ?? null) as MetaAdsFinding['recommendation'],
    workflowState: (row.workflow_state ?? 'open') as MetaAdsFinding['workflowState'],
  };
}

function metricFromJson(value: unknown): MetaAdsExperimentMetrics | null {
  return value && typeof value === 'object' ? value as MetaAdsExperimentMetrics : null;
}

function shapeExperiment(row: Record<string, unknown>, events?: MetaAdsExperimentEvent[]): MetaAdsExperiment {
  const recommendation = (row.recommendation_snapshot ?? {}) as MetaAdsRecommendation;
  const nowDate = localDate(new Date(), String(row.timezone_snapshot ?? row.account_timezone ?? 'UTC'));
  const status = row.status as MetaAdsExperiment['status'];
  const ownerMissing = !row.owner_member_id || row.owner_status !== 'active';
  const appliedLocalDate = row.applied_local_date ? isoDate(row.applied_local_date as string | Date) : null;
  const dataThrough = row.data_through ? isoDate(row.data_through as string | Date) : null;
  let progress: MetaAdsExperiment['measurementProgress'] = null;
  if (status === 'measuring' && appliedLocalDate && dataThrough) {
    const start = shiftDate(appliedLocalDate, 1);
    const completeDays = Math.max(0, Math.floor((new Date(`${dataThrough}T00:00:00Z`).getTime() - new Date(`${start}T00:00:00Z`).getTime()) / 86_400_000) + 1);
    progress = { completeDays: Math.min(completeDays, Number(row.evaluation_days) === 14 ? 14 : 7), targetDays: Number(row.evaluation_days) === 14 ? 14 : 7 };
  }
  return {
    id: String(row.id), findingId: String(row.finding_id), findingEpisode: Number(row.finding_episode),
    accountId: String(row.ad_account_id),
    accountName: row.account_name_snapshot ? String(row.account_name_snapshot) : row.account_name ? String(row.account_name).replace(/^Meta Ads · /, '') : null,
    formerAccount: String(row.current_account_id ?? '') !== String(row.ad_account_id),
    status, outcome: (row.outcome ?? null) as MetaAdsExperiment['outcome'], title: String(row.title), hypothesis: String(row.hypothesis),
    recommendedChange: String(row.recommended_change), scope: row.scope as MetaAdsExperiment['scope'], scopeId: String(row.scope_id), scopeName: String(row.scope_name),
    measurementScope: row.measurement_scope as MetaAdsExperiment['measurementScope'], measurementScopeId: String(row.measurement_scope_id), measurementScopeName: String(row.measurement_scope_name),
    primaryMetric: row.primary_metric as MetaAdsExperiment['primaryMetric'], primaryDirection: row.primary_direction as MetaAdsExperiment['primaryDirection'],
    guardrailMetric: String(row.guardrail_metric ?? ''), selectedConversionAction: row.selected_conversion_action ? String(row.selected_conversion_action) : null,
    recommendation, sourceEvidence: (row.source_evidence ?? {}) as Record<string, unknown>,
    owner: { memberId: ownerMissing ? null : String(row.owner_member_id), name: String(row.owner_name_snapshot), missing: ownerMissing },
    dueDate: isoDate(row.due_date as string | Date), overdue: status === 'planned' && isoDate(row.due_date as string | Date) < nowDate,
    createdAt: new Date(String(row.created_at)).toISOString(), appliedAt: row.applied_at ? new Date(String(row.applied_at)).toISOString() : null,
    appliedLocalDate, implementationNote: row.implementation_note ? String(row.implementation_note) : null,
    keptBudgetConstant: row.kept_budget_constant == null ? null : Boolean(row.kept_budget_constant),
    baseline7: metricFromJson(row.baseline_7), baseline14: metricFromJson(row.baseline_14),
    evaluationStart: row.evaluation_start ? isoDate(row.evaluation_start as string | Date) : null,
    evaluationDue7: row.evaluation_due_7 ? isoDate(row.evaluation_due_7 as string | Date) : null,
    evaluationDue14: row.evaluation_due_14 ? isoDate(row.evaluation_due_14 as string | Date) : null,
    measurementProgress: progress, evaluationDays: row.evaluation_days ? Number(row.evaluation_days) as 7 | 14 : null,
    resultMetrics: metricFromJson(row.result_metrics), resultExplanation: row.result_explanation ? String(row.result_explanation) : null,
    confidence: (row.confidence ?? null) as MetaAdsExperiment['confidence'], completedAt: row.completed_at ? new Date(String(row.completed_at)).toISOString() : null,
    cancelledAt: row.cancelled_at ? new Date(String(row.cancelled_at)).toISOString() : null, cancelReason: row.cancel_reason ? String(row.cancel_reason) : null,
    adsManagerUrl: adsManagerUrl(String(row.ad_account_id), String(row.scope), String(row.scope_id), recommendation), events,
  };
}

async function experimentRows(companyId: string, where = '', params: unknown[] = []) {
  return pool.query(
    `SELECT e.*,c.account_name,c.metadata->>'timezone' AS account_timezone,owner.status AS owner_status,
            (SELECT current_connection.metadata->>'ad_account_id' FROM public.integration_connections current_connection
              WHERE current_connection.company_id=e.company_id AND current_connection.integration_id='int-meta') AS current_account_id,
            (SELECT MAX(metric_date) FROM public.meta_ads_account_daily h WHERE h.company_id=e.company_id AND h.ad_account_id=e.ad_account_id) AS data_through
       FROM public.meta_ads_experiments e
       LEFT JOIN public.integration_connections c ON c.company_id=e.company_id AND c.integration_id='int-meta' AND c.metadata->>'ad_account_id'=e.ad_account_id
       LEFT JOIN public.company_members owner ON owner.id=e.owner_member_id AND owner.company_id=e.company_id
      WHERE e.company_id=$1 ${where}`,
    [companyId, ...params],
  );
}

async function addEvent(input: { companyId: string; experimentId: string; type: MetaAdsExperimentEvent['type']; actorUserId?: string | null; actorName?: string | null; payload?: Record<string, unknown>; idempotencyKey?: string }) {
  await pool.query(
    `INSERT INTO public.meta_ads_experiment_events
       (company_id,experiment_id,event_type,actor_user_id,actor_name_snapshot,payload,idempotency_key)
     VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7) ON CONFLICT DO NOTHING`,
    [input.companyId, input.experimentId, input.type, input.actorUserId ?? null, input.actorName ?? null, JSON.stringify(input.payload ?? {}), input.idempotencyKey ?? null],
  );
}

async function actorName(userId: string): Promise<string> {
  const { rows } = await pool.query(`SELECT TRIM(CONCAT(first_name,' ',last_name)) AS name FROM public.user_profiles WHERE id=$1`, [userId]);
  return String(rows[0]?.name || 'Team member');
}

export async function listMetaAdsAssignees(companyId: string, currentUserId: string): Promise<MetaAdsAssignee[]> {
  const { rows } = await pool.query(
    `SELECT cm.id,cm.user_id,cm.role,TRIM(CONCAT(up.first_name,' ',up.last_name)) AS name,up.avatar_url
       FROM public.company_members cm LEFT JOIN public.user_profiles up ON up.id=cm.user_id
      WHERE cm.company_id=$1 AND cm.status='active' ORDER BY COALESCE(up.first_name,''),COALESCE(up.last_name,''),cm.joined_at`,
    [companyId],
  );
  return rows.map((row) => ({ memberId: String(row.id), name: String(row.name || 'Team member'), role: String(row.role), avatarUrl: row.avatar_url ? String(row.avatar_url) : null, isCurrentUser: String(row.user_id) === currentUserId }));
}

export async function startMetaAdsExperiment(input: {
  companyId: string; userId: string; findingId: string; ownerMemberId: string; dueDate: string; idempotencyKey: string;
}): Promise<MetaAdsExperiment> {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(input.dueDate)) fail(400, 'invalid_due_date');
  const existing = await experimentRows(input.companyId, `AND e.idempotency_key=$2`, [input.idempotencyKey]);
  if (existing.rows[0]) return shapeExperiment(existing.rows[0]);
  const context = await accountContext(input.companyId);
  if (!context?.accountId || !context.dataThrough) fail(409, 'meta_history_not_ready');
  const ageHours = context.lastSyncedAt ? (Date.now() - new Date(context.lastSyncedAt).getTime()) / 3_600_000 : Infinity;
  if (ageHours >= 36) fail(409, 'stale_recommendation');
  if (input.dueDate < localDate(new Date(), context.timezone)) fail(400, 'due_date_in_past');
  const { rows: findings } = await pool.query(
    `SELECT * FROM public.meta_ads_findings WHERE id=$1 AND company_id=$2 AND ad_account_id=$3 AND active=TRUE FOR UPDATE`,
    [input.findingId, input.companyId, context.accountId],
  );
  const finding = findings[0];
  if (!finding) fail(404, 'finding_not_found');
  if (!finding.recommendation || !finding.diagnosis || Number(finding.episode) < 1) fail(409, 'finding_not_experiment_eligible');
  const dismissed = await pool.query(`SELECT 1 FROM public.meta_ads_finding_decisions WHERE finding_id=$1 AND finding_episode=$2`, [finding.id, finding.episode]);
  if (dismissed.rowCount) fail(409, 'finding_already_handled');
  const recommendation = finding.recommendation as MetaAdsRecommendation;
  const diagnosis = finding.diagnosis as MetaAdsFinding['diagnosis'];
  const owner = await pool.query(
    `SELECT cm.id,TRIM(CONCAT(up.first_name,' ',up.last_name)) AS name FROM public.company_members cm
       LEFT JOIN public.user_profiles up ON up.id=cm.user_id
      WHERE cm.id=$1 AND cm.company_id=$2 AND cm.status='active'`,
    [input.ownerMemberId, input.companyId],
  );
  if (!owner.rows[0]) fail(400, 'owner_not_active_member');
  try {
    const { rows } = await pool.query(
      `INSERT INTO public.meta_ads_experiments
         (company_id,ad_account_id,account_name_snapshot,timezone_snapshot,finding_id,finding_episode,scope,scope_id,scope_name,measurement_scope,
          measurement_scope_id,measurement_scope_name,title,hypothesis,recommended_change,primary_metric,
          primary_direction,guardrail_metric,selected_conversion_action,recommendation_snapshot,source_evidence,
          owner_member_id,owner_name_snapshot,due_date,created_by,idempotency_key)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20::jsonb,$21::jsonb,$22,$23,$24,$25,$26)
       RETURNING *`,
      [input.companyId, context.accountId, context.accountName ?? context.accountId, context.timezone,
        finding.id, finding.episode, finding.scope, finding.scope_id,
        diagnosis?.affectedObject.name ?? finding.title, recommendation.measurementScope, recommendation.measurementScopeId,
        recommendation.measurementScopeName, finding.title, recommendation.hypothesis, recommendation.change,
        recommendation.primaryMetric, recommendation.primaryDirection, recommendation.guardrailMetric,
        context.selectedAction, JSON.stringify(recommendation), JSON.stringify(finding.evidence ?? {}),
        owner.rows[0].id, String(owner.rows[0].name || 'Team member'), input.dueDate, input.userId, input.idempotencyKey],
    );
    await addEvent({ companyId: input.companyId, experimentId: String(rows[0].id), type: 'started', actorUserId: input.userId, actorName: await actorName(input.userId), payload: { ownerMemberId: input.ownerMemberId, dueDate: input.dueDate }, idempotencyKey: `${input.idempotencyKey}:event` });
    const shaped = await experimentRows(input.companyId, `AND e.id=$2`, [rows[0].id]);
    return shapeExperiment(shaped.rows[0]);
  } catch (error) {
    if (/meta_ads_experiments_active_episode_unique|duplicate key/i.test(error instanceof Error ? error.message : String(error))) fail(409, 'finding_already_handled');
    throw error;
  }
}

export async function dismissMetaAdsFinding(input: { companyId: string; userId: string; findingId: string; reason: string; note?: string; idempotencyKey: string }) {
  const reasons = ['not_relevant', 'already_addressed', 'insufficient_context', 'other'];
  if (!reasons.includes(input.reason)) fail(400, 'invalid_dismiss_reason');
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  const existingDecision = await pool.query(
    `SELECT id,decided_at FROM public.meta_ads_finding_decisions WHERE company_id=$1 AND idempotency_key=$2`,
    [input.companyId, input.idempotencyKey],
  );
  if (existingDecision.rows[0]) {
    return { id: String(existingDecision.rows[0].id), decidedAt: new Date(existingDecision.rows[0].decided_at).toISOString() };
  }
  const context = await accountContext(input.companyId);
  if (!context?.accountId) fail(409, 'meta_not_connected');
  const { rows } = await pool.query(
    `SELECT * FROM public.meta_ads_findings WHERE id=$1 AND company_id=$2 AND ad_account_id=$3 AND active=TRUE`,
    [input.findingId, input.companyId, context.accountId],
  );
  const finding = rows[0];
  if (!finding) fail(404, 'finding_not_found');
  if (['sync_failure', 'stale_data', 'missing_conversion_configuration'].includes(String(finding.kind))) fail(409, 'operational_alert_not_dismissible');
  try {
    const result = await pool.query(
      `INSERT INTO public.meta_ads_finding_decisions
         (company_id,ad_account_id,finding_id,finding_episode,decision,reason,note,decided_by,idempotency_key)
       VALUES ($1,$2,$3,$4,'dismissed',$5,$6,$7,$8)
       RETURNING id,decided_at`,
      [input.companyId, context.accountId, finding.id, finding.episode, input.reason, input.note?.trim() || null, input.userId, input.idempotencyKey],
    );
    return { id: String(result.rows[0].id), decidedAt: new Date(result.rows[0].decided_at).toISOString() };
  } catch (error) {
    if (/duplicate key|meta_ads_finding_decisions/i.test(error instanceof Error ? error.message : String(error))) fail(409, 'finding_already_handled');
    throw error;
  }
}

export async function updateMetaAdsExperiment(input: { companyId: string; userId: string; experimentId: string; ownerMemberId?: string; dueDate?: string; idempotencyKey: string }) {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  const row = await experimentRows(input.companyId, `AND e.id=$2`, [input.experimentId]);
  if (!row.rows[0]) fail(404, 'experiment_not_found');
  if (row.rows[0].status !== 'planned') fail(409, 'invalid_experiment_transition');
  let ownerId = row.rows[0].owner_member_id;
  let ownerName = row.rows[0].owner_name_snapshot;
  if (input.ownerMemberId) {
    const owner = await pool.query(
      `SELECT cm.id,TRIM(CONCAT(up.first_name,' ',up.last_name)) AS name FROM public.company_members cm LEFT JOIN public.user_profiles up ON up.id=cm.user_id
        WHERE cm.id=$1 AND cm.company_id=$2 AND cm.status='active'`, [input.ownerMemberId, input.companyId],
    );
    if (!owner.rows[0]) fail(400, 'owner_not_active_member');
    ownerId = owner.rows[0].id; ownerName = owner.rows[0].name || 'Team member';
  }
  const dueDate = input.dueDate ?? isoDate(row.rows[0].due_date);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) fail(400, 'invalid_due_date');
  const context = await accountContext(input.companyId);
  if (context && dueDate < localDate(new Date(), context.timezone)) fail(400, 'due_date_in_past');
  await pool.query(`UPDATE public.meta_ads_experiments SET owner_member_id=$2,owner_name_snapshot=$3,due_date=$4,updated_at=NOW() WHERE id=$1`, [input.experimentId, ownerId, ownerName, dueDate]);
  await addEvent({ companyId: input.companyId, experimentId: input.experimentId, type: 'updated', actorUserId: input.userId, actorName: await actorName(input.userId), payload: { ownerMemberId: ownerId, dueDate }, idempotencyKey: input.idempotencyKey });
  return getMetaAdsExperiment(input.companyId, input.experimentId);
}

export async function applyMetaAdsExperiment(input: {
  companyId: string; userId: string; experimentId: string; implementationNote: string; confirmedRecommendedChange: boolean; keptBudgetConstant: boolean; idempotencyKey: string;
}) {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  if (!input.confirmedRecommendedChange) fail(400, 'recommended_change_confirmation_required');
  if (input.implementationNote.trim().length < 3) fail(400, 'implementation_note_required');
  const result = await experimentRows(input.companyId, `AND e.id=$2`, [input.experimentId]);
  const experiment = result.rows[0];
  if (!experiment) fail(404, 'experiment_not_found');
  if (experiment.status === 'measuring' && experiment.implementation_note) return shapeExperiment(experiment);
  if (experiment.status !== 'planned') fail(409, 'invalid_experiment_transition');
  const context = await accountContext(input.companyId);
  if (!context || context.accountId !== String(experiment.ad_account_id) || !context.dataThrough) fail(409, 'meta_account_changed');
  const appliedLocalDate = localDate(new Date(), context.timezone);
  if (context.dataThrough < shiftDate(appliedLocalDate, -1)) fail(409, 'meta_data_not_current');
  const baselineStart = shiftDate(appliedLocalDate, -14);
  const baselineEnd = shiftDate(appliedLocalDate, -1);
  if (await accountDayCount(input.companyId, context.accountId, baselineStart, baselineEnd) < 14) {
    fail(409, 'fourteen_day_baseline_not_ready');
  }
  const common = {
    companyId: input.companyId, accountId: context.accountId,
    scope: experiment.measurement_scope as 'account' | 'campaign' | 'adset', scopeId: String(experiment.measurement_scope_id),
    selectedAction: experiment.selected_conversion_action ? String(experiment.selected_conversion_action) : null,
  };
  const baseline7 = await measurementMetrics({ ...common, from: shiftDate(appliedLocalDate, -7), through: shiftDate(appliedLocalDate, -1) });
  const baseline14 = await measurementMetrics({ ...common, from: baselineStart, through: baselineEnd });
  const evaluationStart = shiftDate(appliedLocalDate, 1);
  await pool.query(
    `UPDATE public.meta_ads_experiments SET status='measuring',applied_by=$2,applied_at=NOW(),applied_local_date=$3,
            implementation_note=$4,kept_budget_constant=$5,baseline_7=$6::jsonb,baseline_14=$7::jsonb,
            evaluation_start=$8,evaluation_due_7=$9,evaluation_due_14=$10,evaluation_days=7,updated_at=NOW()
      WHERE id=$1`,
    [input.experimentId, input.userId, appliedLocalDate, input.implementationNote.trim(), input.keptBudgetConstant,
      JSON.stringify(baseline7), JSON.stringify(baseline14), evaluationStart, shiftDate(evaluationStart, 6), shiftDate(evaluationStart, 13)],
  );
  await addEvent({ companyId: input.companyId, experimentId: input.experimentId, type: 'applied', actorUserId: input.userId, actorName: await actorName(input.userId), payload: { implementationNote: input.implementationNote.trim(), keptBudgetConstant: input.keptBudgetConstant, appliedLocalDate }, idempotencyKey: input.idempotencyKey });
  return getMetaAdsExperiment(input.companyId, input.experimentId);
}

export async function cancelMetaAdsExperiment(input: { companyId: string; userId: string; experimentId: string; reason: string; note?: string; idempotencyKey: string }) {
  if (!input.idempotencyKey || input.idempotencyKey.length < 8) fail(400, 'invalid_idempotency_key');
  const reasons = ['not_applied', 'recommendation_stale', 'priorities_changed', 'other'];
  if (!reasons.includes(input.reason)) fail(400, 'invalid_cancel_reason');
  const result = await experimentRows(input.companyId, `AND e.id=$2`, [input.experimentId]);
  const experiment = result.rows[0];
  if (!experiment) fail(404, 'experiment_not_found');
  if (experiment.status === 'cancelled') return shapeExperiment(experiment);
  if (!['planned', 'measuring'].includes(String(experiment.status))) fail(409, 'invalid_experiment_transition');
  await pool.query(`UPDATE public.meta_ads_experiments SET status='cancelled',cancelled_at=NOW(),cancel_reason=$2,cancel_note=$3,updated_at=NOW() WHERE id=$1`, [input.experimentId, input.reason, input.note?.trim() || null]);
  await addEvent({ companyId: input.companyId, experimentId: input.experimentId, type: 'cancelled', actorUserId: input.userId, actorName: await actorName(input.userId), payload: { reason: input.reason, note: input.note?.trim() || null }, idempotencyKey: input.idempotencyKey });
  return getMetaAdsExperiment(input.companyId, input.experimentId);
}

export function hasMetaAdsExperimentVolume(metric: string, values: MetaAdsExperimentMetrics): boolean {
  if (metric === 'ctr') return values.impressions >= 2_000;
  if (metric === 'cpa') return values.selectedConversions >= 5;
  return values.purchaseCount >= 3;
}

function metricValue(metric: string, values: MetaAdsExperimentMetrics): number | null {
  if (metric === 'ctr') return values.ctr;
  if (metric === 'cpa') return values.cpa;
  return values.purchaseRoas;
}

export function classifyMetaAdsExperimentOutcome(row: Record<string, unknown>, baseline: MetaAdsExperimentMetrics, result: MetaAdsExperimentMetrics): { outcome: MetaAdsExperimentOutcome; confidence: MetaAdsExperimentConfidence; explanation: string } {
  const primary = String(row.primary_metric);
  const direction = String(row.primary_direction);
  const rawChange = percentageChange(metricValue(primary, result), metricValue(primary, baseline));
  if (rawChange == null) return { outcome: 'inconclusive', confidence: 'medium', explanation: 'The primary metric did not have a usable baseline.' };
  const favorable = direction === 'higher' ? rawChange : -rawChange;
  const spendChange = percentageChange(result.spend, baseline.spend);
  if (row.kept_budget_constant === false) {
    return { outcome: 'inconclusive', confidence: 'medium', explanation: 'The prescribed stable-budget guardrail was reported as changed.' };
  }
  if (row.kept_budget_constant && spendChange != null && Math.abs(spendChange) > 30) {
    return { outcome: 'inconclusive', confidence: 'medium', explanation: `Spend changed ${Math.abs(spendChange).toFixed(1)}%, exceeding the 30% controlled-test guardrail.` };
  }
  let guardrailWorsened = false;
  if (row.guardrail_metric === 'cpc') {
    const change = percentageChange(result.cpc, baseline.cpc); guardrailWorsened = change != null && change > 10;
  } else if (row.guardrail_metric === 'selected_conversions') {
    const change = percentageChange(result.selectedConversions, baseline.selectedConversions); guardrailWorsened = change != null && change < -10;
  } else if (row.guardrail_metric === 'purchase_count') {
    const change = percentageChange(result.purchaseCount, baseline.purchaseCount); guardrailWorsened = change != null && change < -10;
  }
  const outcome: MetaAdsExperimentOutcome = guardrailWorsened || favorable <= -10 ? 'worsened' : favorable >= 10 ? 'improved' : 'no_clear_change';
  const volumeHigh = primary === 'ctr' ? result.impressions >= 4_000 : primary === 'cpa' ? result.selectedConversions >= 10 : result.purchaseCount >= 6;
  const confidence: MetaAdsExperimentConfidence = volumeHigh && Math.abs(rawChange) >= 20 ? 'high' : 'medium';
  const label = primary === 'purchase_roas' ? 'Purchase ROAS' : primary.toUpperCase();
  const guardrailText = guardrailWorsened ? ' A guardrail also deteriorated.' : '';
  return { outcome, confidence, explanation: `${label} changed ${rawChange > 0 ? '+' : ''}${rawChange.toFixed(1)}% over the controlled comparison.${guardrailText}` };
}

async function finishExperiment(row: Record<string, unknown>, outcome: MetaAdsExperimentOutcome, result: MetaAdsExperimentMetrics | null, explanation: string, confidence: MetaAdsExperimentConfidence, days: 7 | 14) {
  await pool.query(
    `UPDATE public.meta_ads_experiments SET status='completed',outcome=$2,result_metrics=$3::jsonb,result_explanation=$4,
            confidence=$5,evaluation_days=$6,completed_at=NOW(),updated_at=NOW() WHERE id=$1`,
    [row.id, outcome, result ? JSON.stringify(result) : null, explanation, confidence, days],
  );
  await addEvent({ companyId: String(row.company_id), experimentId: String(row.id), type: 'evaluated', payload: { outcome, confidence, evaluationDays: days, explanation } });
}

export async function evaluateMeasuringMetaAdsExperiments(companyId: string, accountId: string, dataThrough: string) {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_experiments WHERE company_id=$1 AND ad_account_id=$2 AND status='measuring' ORDER BY applied_at`, [companyId, accountId]);
  for (const row of rows) {
    const due7 = isoDate(row.evaluation_due_7 as string | Date);
    const due14 = isoDate(row.evaluation_due_14 as string | Date);
    if (dataThrough < due7) continue;
    const common = { companyId, accountId, scope: row.measurement_scope as 'account' | 'campaign' | 'adset', scopeId: String(row.measurement_scope_id), selectedAction: row.selected_conversion_action ? String(row.selected_conversion_action) : null };
    const evaluationStart = isoDate(row.evaluation_start as string | Date);
    const result7 = await measurementMetrics({ ...common, from: evaluationStart, through: due7 });
    const baseline7 = metricFromJson(row.baseline_7)!;
    const completeSevenDays = await accountDayCount(companyId, accountId, evaluationStart, due7) === 7;
    if (completeSevenDays && hasMetaAdsExperimentVolume(String(row.primary_metric), baseline7) && hasMetaAdsExperimentVolume(String(row.primary_metric), result7)) {
      const evaluated = classifyMetaAdsExperimentOutcome(row, baseline7, result7);
      await finishExperiment(row, evaluated.outcome, result7, evaluated.explanation, evaluated.confidence, 7);
      continue;
    }
    if (dataThrough < due14) {
      if (Number(row.evaluation_days) !== 14) {
        await pool.query(`UPDATE public.meta_ads_experiments SET evaluation_days=14,updated_at=NOW() WHERE id=$1`, [row.id]);
        await addEvent({ companyId, experimentId: String(row.id), type: 'extended', payload: { reason: 'insufficient_seven_day_volume', evaluationDue14: due14 } });
      }
      continue;
    }
    const result14 = await measurementMetrics({ ...common, from: evaluationStart, through: due14 });
    const baseline14 = metricFromJson(row.baseline_14)!;
    const completeFourteenDays = await accountDayCount(companyId, accountId, evaluationStart, due14) === 14;
    if (!completeFourteenDays) {
      await finishExperiment(row, 'inconclusive', result14, 'The fourteen-day measurement window contains missing account data.', 'medium', 14);
      continue;
    }
    if (!hasMetaAdsExperimentVolume(String(row.primary_metric), baseline14) || !hasMetaAdsExperimentVolume(String(row.primary_metric), result14)) {
      await finishExperiment(row, 'inconclusive', result14, 'Fourteen complete days still did not meet the primary metric volume guard.', 'medium', 14);
      continue;
    }
    const evaluated = classifyMetaAdsExperimentOutcome(row, baseline14, result14);
    await finishExperiment(row, evaluated.outcome, result14, evaluated.explanation, evaluated.confidence, 14);
  }
}

export async function reconcileDetachedMetaAdsExperiments(companyId: string, currentAccountId: string | null) {
  const { rows } = await pool.query(
    `SELECT * FROM public.meta_ads_experiments WHERE company_id=$1 AND status IN ('planned','measuring') AND ($2::text IS NULL OR ad_account_id<>$2)`,
    [companyId, currentAccountId],
  );
  for (const row of rows) {
    if (row.status === 'planned') {
      await pool.query(`UPDATE public.meta_ads_experiments SET status='cancelled',cancelled_at=NOW(),cancel_reason='account_changed',updated_at=NOW() WHERE id=$1`, [row.id]);
      await addEvent({ companyId, experimentId: String(row.id), type: 'cancelled', payload: { reason: 'account_changed' } });
    } else {
      await finishExperiment(row, 'inconclusive', null, 'The Meta ad account was disconnected or changed before measurement completed.', 'medium', Number(row.evaluation_days) === 14 ? 14 : 7);
    }
  }
}

export async function reconcileRemovedMetaAdsExperimentOwners(companyId: string) {
  const { rows } = await pool.query(
    `SELECT e.id,e.owner_member_id,e.owner_name_snapshot
       FROM public.meta_ads_experiments e
       LEFT JOIN public.company_members owner ON owner.id=e.owner_member_id AND owner.company_id=e.company_id
      WHERE e.company_id=$1 AND e.status IN ('planned','measuring') AND e.owner_member_id IS NOT NULL
        AND (owner.id IS NULL OR owner.status<>'active')`,
    [companyId],
  );
  for (const row of rows) {
    await pool.query(`UPDATE public.meta_ads_experiments SET owner_member_id=NULL,updated_at=NOW() WHERE id=$1 AND owner_member_id=$2`, [row.id, row.owner_member_id]);
    await addEvent({
      companyId,
      experimentId: String(row.id),
      type: 'owner_removed',
      payload: { ownerMemberId: String(row.owner_member_id), ownerName: String(row.owner_name_snapshot) },
      idempotencyKey: `owner-removed:${row.id}:${row.owner_member_id}`,
    });
  }
  return rows.length;
}

async function loadEvents(companyId: string, experimentId: string): Promise<MetaAdsExperimentEvent[]> {
  const { rows } = await pool.query(`SELECT * FROM public.meta_ads_experiment_events WHERE company_id=$1 AND experiment_id=$2 ORDER BY created_at,id`, [companyId, experimentId]);
  return rows.map((row) => ({ id: String(row.id), type: row.event_type as MetaAdsExperimentEvent['type'], actorName: row.actor_name_snapshot ? String(row.actor_name_snapshot) : null, payload: (row.payload ?? {}) as Record<string, unknown>, createdAt: new Date(row.created_at).toISOString() }));
}

export async function getMetaAdsExperiment(companyId: string, experimentId: string): Promise<MetaAdsExperiment> {
  const result = await experimentRows(companyId, `AND e.id=$2`, [experimentId]);
  if (!result.rows[0]) fail(404, 'experiment_not_found');
  return shapeExperiment(result.rows[0], await loadEvents(companyId, experimentId));
}

export async function listMetaAdsExperiments(companyId: string, view: 'active' | 'history', cursor?: string, limit = 25) {
  const bounded = Math.max(1, Math.min(50, limit));
  const statuses = view === 'active' ? ['planned', 'measuring'] : ['completed', 'cancelled'];
  const cursorClause = cursor ? `AND e.created_at<$3::timestamptz` : '';
  const params: unknown[] = cursor ? [statuses, cursor, bounded + 1] : [statuses, bounded + 1];
  const limitPosition = cursor ? '$4' : '$3';
  const rows = await experimentRows(companyId, `AND e.status=ANY($2::text[]) ${cursorClause} ORDER BY e.created_at DESC,e.id DESC LIMIT ${limitPosition}`, params);
  const items = rows.rows.slice(0, bounded).map((row) => shapeExperiment(row));
  return { items, nextCursor: rows.rows.length > bounded ? new Date(rows.rows[bounded - 1].created_at).toISOString() : null };
}

async function deliveryDrivers(companyId: string, accountId: string, dataThrough: string, selectedAction: string | null): Promise<MetaAdsDeliverySummary[]> {
  const { rows } = await pool.query(
    `SELECT w.*,e.effective_status,e.creative_id,e.creative_name,e.creative_format,e.thumbnail_url,
            SUM(w.spend) OVER () AS total_spend
       FROM public.meta_ads_delivery_windows w LEFT JOIN public.meta_ads_delivery_entities e
        ON e.company_id=w.company_id AND e.ad_account_id=w.ad_account_id AND e.level=w.level AND e.entity_id=w.entity_id
      WHERE w.company_id=$1 AND w.ad_account_id=$2 AND w.level='ad' AND w.window_start=$3 AND w.window_end=$4
      ORDER BY w.spend DESC LIMIT 20`,
    [companyId, accountId, shiftDate(dataThrough, -6), dataThrough],
  );
  return rows.map((row) => {
    const spend = Number(row.spend); const impressions = Number(row.impressions); const clicks = Number(row.clicks);
    const actions = (row.actions ?? {}) as Record<string, number>; const conversions = actionTotal(actions, selectedAction);
    const outbound = Number(row.outbound_clicks); const lpv = Number(row.landing_page_views);
    return {
      scope: 'ad', id: String(row.entity_id), name: String(row.entity_name), status: String(row.effective_status ?? 'UNKNOWN'),
      campaignId: String(row.campaign_id), campaignName: String(row.campaign_name), adsetId: row.adset_id ? String(row.adset_id) : null,
      adsetName: row.adset_name ? String(row.adset_name) : null, creativeId: row.creative_id ? String(row.creative_id) : null,
      creativeName: row.creative_name ? String(row.creative_name) : null, creativeFormat: row.creative_format ? String(row.creative_format) : null,
      thumbnailUrl: row.thumbnail_url ? String(row.thumbnail_url) : null, spend: round(spend), spendShare: Number(row.total_spend) ? round(spend / Number(row.total_spend), 4) : 0,
      impressions, clicks, ctr: round(Number(row.ctr)), cpc: round(Number(row.cpc)), cpm: round(Number(row.cpm)), reach: Number(row.reach),
      frequency: round(Number(row.frequency)), outboundClicks: outbound, landingPageViews: lpv, landingPageViewRate: outbound > 0 ? round(lpv / outbound, 4) : null,
      purchaseRoas: round(Number(row.purchase_roas)), selectedConversions: round(conversions), cpa: conversions > 0 ? round(spend / conversions) : null,
      adsManagerUrl: adsManagerUrl(accountId, 'ad', String(row.entity_id), null),
    };
  });
}

export async function buildMetaAdsDecisionInbox(companyId: string): Promise<MetaAdsDecisionInbox> {
  const context = await accountContext(companyId);
  if (!context?.accountId) {
    return { generatedAt: new Date().toISOString(), accountId: null, accountName: null, timezone: null, dataThrough: null, coverage: 'not_started', coverageWarnings: [], counts: { open: 0, planned: 0, measuring: 0, overdue: 0, completed: 0 }, findings: [], activeExperiments: [], recentResults: [], deliveryDrivers: [] };
  }
  const { rows: runRows } = await pool.query(`SELECT diagnostic_coverage,warnings FROM public.meta_ads_sync_runs WHERE company_id=$1 AND ad_account_id=$2 ORDER BY requested_at DESC LIMIT 1`, [companyId, context.accountId]);
  const { rows: findings } = await pool.query(
    `SELECT f.*,'open' AS workflow_state FROM public.meta_ads_findings f
      WHERE f.company_id=$1 AND f.ad_account_id=$2 AND f.active=TRUE
        AND NOT EXISTS (SELECT 1 FROM public.meta_ads_finding_decisions d WHERE d.finding_id=f.id AND d.finding_episode=f.episode)
        AND NOT EXISTS (SELECT 1 FROM public.meta_ads_experiments e WHERE e.finding_id=f.id AND e.finding_episode=f.episode)
      ORDER BY CASE f.severity WHEN 'critical' THEN 0 WHEN 'warning' THEN 1 ELSE 2 END,f.estimated_spend_exposure DESC`,
    [companyId, context.accountId],
  );
  const activeRows = await experimentRows(companyId, `AND e.ad_account_id=$2 AND e.status IN ('planned','measuring') ORDER BY CASE e.status WHEN 'planned' THEN 0 ELSE 1 END,e.due_date,e.created_at`, [context.accountId]);
  const resultRows = await experimentRows(companyId, `AND e.ad_account_id=$2 AND e.status IN ('completed','cancelled') ORDER BY COALESCE(e.completed_at,e.cancelled_at) DESC LIMIT 10`, [context.accountId]);
  const active = activeRows.rows.map((row) => shapeExperiment(row));
  const results = resultRows.rows.map((row) => shapeExperiment(row));
  return {
    generatedAt: new Date().toISOString(), accountId: context.accountId, accountName: context.accountName, timezone: context.timezone, dataThrough: context.dataThrough,
    coverage: (runRows[0]?.diagnostic_coverage ?? 'not_started') as MetaAdsDecisionInbox['coverage'],
    coverageWarnings: Array.isArray(runRows[0]?.warnings) ? runRows[0].warnings.map(String) : [],
    counts: { open: findings.length, planned: active.filter((item) => item.status === 'planned').length, measuring: active.filter((item) => item.status === 'measuring').length, overdue: active.filter((item) => item.overdue).length, completed: results.filter((item) => item.status === 'completed').length },
    findings: findings.map(shapeFinding), activeExperiments: active, recentResults: results,
    deliveryDrivers: context.dataThrough ? await deliveryDrivers(companyId, context.accountId, context.dataThrough, context.selectedAction) : [],
  };
}

export async function getMetaAdsDecisionAttention(companyId: string) {
  const { rows } = await pool.query(
    `WITH current_account AS (
       SELECT metadata->>'ad_account_id' AS ad_account_id
         FROM public.integration_connections
        WHERE company_id=$1 AND integration_id='int-meta'
     )
     SELECT
       (SELECT COUNT(*)::int
          FROM public.meta_ads_findings f,current_account c
         WHERE f.company_id=$1 AND f.ad_account_id=c.ad_account_id AND f.active=TRUE
           AND NOT EXISTS (
             SELECT 1 FROM public.meta_ads_finding_decisions d
              WHERE d.finding_id=f.id AND d.finding_episode=f.episode
           )
           AND NOT EXISTS (
             SELECT 1 FROM public.meta_ads_experiments e
              WHERE e.finding_id=f.id AND e.finding_episode=f.episode
           )) AS decision_count,
       (SELECT COUNT(*)::int
          FROM public.meta_ads_experiments e,current_account c
         WHERE e.company_id=$1 AND e.ad_account_id=c.ad_account_id AND e.status='planned'
           AND e.due_date < (CURRENT_TIMESTAMP AT TIME ZONE COALESCE(NULLIF(e.timezone_snapshot,''),'UTC'))::date
       ) AS overdue_count`,
    [companyId],
  );
  return {
    decisionCount: Number(rows[0]?.decision_count ?? 0),
    overdueCount: Number(rows[0]?.overdue_count ?? 0),
  };
}
