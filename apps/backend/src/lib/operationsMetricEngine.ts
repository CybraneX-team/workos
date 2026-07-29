import type { PoolClient } from 'pg';
import { pool } from '../db.js';
import { readOperationsMetricSnapshot } from '../domains/workos-erp/erpnextOperations.js';
import { recomputeCanonicalRollups, scoreMetric, type MetricDirection } from './canonicalMetrics.js';

/** Integration identity used by the canonical metric tables, not a browser OAuth connection. */
export const ERPNEXT_OPERATIONS_INTEGRATION_ID = 'int-erpnext-operations';

export const OPERATIONS_METRIC_KEYS = [
  'open_material_requests',
  'open_purchase_orders',
  'low_stock_positions',
  'open_work_orders',
  'work_order_completion_percent',
  'failed_quality_checks',
] as const;

export type OperationsMetricKey = typeof OPERATIONS_METRIC_KEYS[number];

type OperationsMetricDefinition = {
  name: string;
  description: string;
  unit: string;
  valueType: 'count' | 'percent';
  direction: MetricDirection;
  snapshotValue: (snapshot: Awaited<ReturnType<typeof readOperationsMetricSnapshot>>) => number | null;
  needsLowStockThreshold?: boolean;
};

const DEFINITIONS: Record<OperationsMetricKey, OperationsMetricDefinition> = {
  open_material_requests: {
    name: 'Open material requests',
    description: 'ERPNext material requests that are still open.',
    unit: 'requests', valueType: 'count', direction: 'lower_is_better',
    snapshotValue: snapshot => snapshot.openMaterialRequests,
  },
  open_purchase_orders: {
    name: 'Open purchase orders',
    description: 'ERPNext purchase orders that are still open.',
    unit: 'orders', valueType: 'count', direction: 'lower_is_better',
    snapshotValue: snapshot => snapshot.openPurchaseOrders,
  },
  low_stock_positions: {
    name: 'Low-stock positions',
    description: 'ERPNext item/warehouse positions below this metric’s configured stock threshold.',
    unit: 'positions', valueType: 'count', direction: 'lower_is_better',
    snapshotValue: snapshot => snapshot.lowStockPositions,
    needsLowStockThreshold: true,
  },
  open_work_orders: {
    name: 'Open work orders',
    description: 'ERPNext work orders that are still open.',
    unit: 'work orders', valueType: 'count', direction: 'lower_is_better',
    snapshotValue: snapshot => snapshot.openWorkOrders,
  },
  work_order_completion_percent: {
    name: 'Work-order completion',
    description: 'Produced quantity as a percentage of planned quantity for ERPNext work orders.',
    unit: '%', valueType: 'percent', direction: 'higher_is_better',
    snapshotValue: snapshot => snapshot.workOrderCompletionPercent,
  },
  failed_quality_checks: {
    name: 'Failed or rejected quality checks',
    description: 'ERPNext quality inspections marked failed or rejected.',
    unit: 'checks', valueType: 'count', direction: 'lower_is_better',
    snapshotValue: snapshot => snapshot.failedQualityChecks,
  },
};

type OperationsMetricRow = {
  metric_id: string;
  source_id: string;
  source_key: OperationsMetricKey;
  source_status: 'active' | 'disconnected' | 'needs_configuration';
  source_config: Record<string, unknown>;
  baseline_value: string | number;
  target_value: string | number;
  direction: MetricDirection;
};

export function isOperationsMetricKey(value: string): value is OperationsMetricKey {
  return (OPERATIONS_METRIC_KEYS as readonly string[]).includes(value);
}

/** Exposed for contract tests and UI labels; snapshot/DB wiring remains private. */
export function operationsMetricDefinition(key: OperationsMetricKey) {
  return DEFINITIONS[key];
}

function numberOrNull(value: unknown): number | null {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function configuredLowStockThreshold(config: Record<string, unknown>): number | undefined {
  const value = numberOrNull(config.lowStockThreshold);
  return value == null || value < 0 ? undefined : value;
}

function snapshotError(warnings: string[]): Error | null {
  return warnings.length ? new Error('erpnext_operations_snapshot_incomplete') : null;
}

async function operationsDepartment(client: PoolClient, companyId: string): Promise<{ id: string }> {
  const { rows } = await client.query<{ id: string }>(
    `SELECT id FROM public.departments
      WHERE company_id=$1 AND source_key='dept_operations'
      LIMIT 1 FOR UPDATE`,
    [companyId],
  );
  if (!rows.length) throw new Error('operations_department_not_found');
  return rows[0];
}

async function sourceRows(client: PoolClient, companyId: string): Promise<OperationsMetricRow[]> {
  const { rows } = await client.query<OperationsMetricRow>(
    `SELECT m.id AS metric_id, s.id AS source_id, s.source_key, s.status AS source_status,
            s.config AS source_config, m.baseline_value, m.target_value, m.direction
       FROM public.metric_sources s
       JOIN public.metrics m ON m.id=s.metric_id
      WHERE s.company_id=$1 AND s.integration_id=$2
      FOR UPDATE`,
    [companyId, ERPNEXT_OPERATIONS_INTEGRATION_ID],
  );
  return rows.filter(row => isOperationsMetricKey(row.source_key));
}

async function lockCompany(client: PoolClient, companyId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_lock(hashtext($1))`, [`operations-canonical:${companyId}`]);
}

async function unlockCompany(client: PoolClient, companyId: string): Promise<void> {
  await client.query(`SELECT pg_advisory_unlock(hashtext($1))`, [`operations-canonical:${companyId}`]);
}

async function shapedOperationsMetrics(companyId: string) {
  const { rows } = await pool.query(
    `SELECT m.*,
            COALESCE(jsonb_agg(DISTINCT to_jsonb(ml)) FILTER (WHERE ml.id IS NOT NULL), '[]'::jsonb) AS links,
            COALESCE(jsonb_agg(DISTINCT to_jsonb(ms)) FILTER (WHERE ms.id IS NOT NULL), '[]'::jsonb) AS sources
       FROM public.metrics m
       JOIN public.metric_sources own_source
         ON own_source.metric_id=m.id
        AND own_source.company_id=m.company_id
        AND own_source.integration_id=$2
       LEFT JOIN public.metric_links ml ON ml.metric_id=m.id
       LEFT JOIN public.metric_sources ms ON ms.metric_id=m.id
      WHERE m.company_id=$1
      GROUP BY m.id, own_source.source_key
      ORDER BY own_source.source_key`,
    [companyId, ERPNEXT_OPERATIONS_INTEGRATION_ID],
  );
  return rows;
}

async function insertMetric(
  client: PoolClient,
  companyId: string,
  departmentId: string,
  userId: string,
  key: OperationsMetricKey,
  value: number | null,
): Promise<void> {
  const definition = DEFINITIONS[key];
  // Low stock has no raw value before its owner supplies a rule. Other values
  // are persisted as an initial, explicitly unscored baseline.
  const baseline = value ?? 0;
  const { rows } = await client.query<{ id: string }>(
    `INSERT INTO public.metrics
       (company_id,name,description,unit,value_type,direction,baseline_value,target_value,
        current_value,normalized_score,cadence,status,source_confidence,created_by,updated_by)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$7,$8,NULL,'on_refresh','active',1,$9,$9)
     RETURNING id`,
    [companyId, definition.name, definition.description, definition.unit, definition.valueType,
     definition.direction, baseline, value, userId],
  );
  const metricId = rows[0].id;
  await client.query(
    `INSERT INTO public.metric_sources
       (metric_id,company_id,source_type,label,config,confidence,created_by,
        integration_id,source_key,status,last_attempted_at,last_synced_at)
     VALUES ($1,$2,'integration','ERPNext Operations',$3,1,$4,$5,$6,'needs_configuration',NOW(),NOW())`,
    [metricId, companyId,
     JSON.stringify(definition.needsLowStockThreshold
       ? { metricKey: key, lowStockThreshold: null }
       : { metricKey: key }),
     userId, ERPNEXT_OPERATIONS_INTEGRATION_ID, key],
  );
  await client.query(
    `INSERT INTO public.metric_links
       (metric_id,company_id,target_type,target_id,relation,weight,is_core,created_by)
     VALUES ($1,$2,'department',$3,'health_component',1,true,$4)`,
    [metricId, companyId, departmentId, userId],
  );
  // `metric_values.normalized_score` is intentionally non-null at the database
  // level. Until a user configures a target, keep the raw current/baseline
  // values on `metrics` and do not create a scored history row.
}

async function ensureOperationsMetrics(
  client: PoolClient,
  companyId: string,
  userId: string,
  snapshot: Awaited<ReturnType<typeof readOperationsMetricSnapshot>>,
): Promise<OperationsMetricRow[]> {
  const department = await operationsDepartment(client, companyId);
  const existing = await sourceRows(client, companyId);
  const keys = new Set(existing.map(row => row.source_key));
  for (const key of OPERATIONS_METRIC_KEYS) {
    if (!keys.has(key)) await insertMetric(client, companyId, department.id, userId, key, DEFINITIONS[key].snapshotValue(snapshot));
  }
  return sourceRows(client, companyId);
}

async function applySnapshot(
  client: PoolClient,
  companyId: string,
  userId: string,
  rows: OperationsMetricRow[],
  snapshot: Awaited<ReturnType<typeof readOperationsMetricSnapshot>>,
  reason: string,
): Promise<void> {
  for (const row of rows) {
    const definition = DEFINITIONS[row.source_key];
    // Callers pass a thresholded snapshot only for an already configured
    // low-stock source. All other values come from the one shared batch.
    const value = definition.snapshotValue(snapshot);
    // A low-stock rule has no raw value until the user creates it. Do not turn
    // that absence into a zero or a health score.
    if (value == null) continue;
    const configured = row.source_status === 'active';
    const score = configured
      ? scoreMetric(value, Number(row.baseline_value), Number(row.target_value), row.direction)
      : null;
    await client.query(
      `UPDATE public.metrics
          SET current_value=$3, normalized_score=$4,
              baseline_value=CASE WHEN normalized_score IS NULL AND current_value IS NULL THEN $3 ELSE baseline_value END,
              updated_by=$5, updated_at=NOW()
        WHERE id=$1 AND company_id=$2`,
      [row.metric_id, companyId, value, score, userId],
    );
    // Historical values are scored records. Do not write an unconfigured KPI
    // with a made-up zero score merely to satisfy the table constraint.
    if (configured) {
      await client.query(
        `INSERT INTO public.metric_values
           (metric_id,company_id,raw_value,normalized_score,source_type,source_id,source_confidence,reason,recorded_by,updated_at)
         VALUES ($1,$2,$3,$4,'integration',$5,1,$6,$7,NOW())
         ON CONFLICT (metric_id) WHERE source_type='integration'
         DO UPDATE SET raw_value=EXCLUDED.raw_value,normalized_score=EXCLUDED.normalized_score,
                       source_id=EXCLUDED.source_id,reason=EXCLUDED.reason,recorded_by=EXCLUDED.recorded_by,updated_at=NOW()`,
        [row.metric_id, companyId, value, score, row.source_id, reason, userId],
      );
    }
    await client.query(
      `UPDATE public.metric_sources
          SET last_attempted_at=NOW(), last_synced_at=NOW(), last_error=NULL
        WHERE id=$1`,
      [row.source_id],
    );
  }
}

async function snapshotForRows(companyId: string, rows: OperationsMetricRow[], traceId?: string) {
  // One batch contains all non-thresholded metrics. A configured low-stock
  // metric needs its own thresholded snapshot because the threshold is data,
  // not an application default.
  console.info('[operations-metrics] snapshot_start', { traceId, companyId, configuredSourceCount: rows.length });
  const snapshotStartedAt = Date.now();
  const snapshot = await readOperationsMetricSnapshot(companyId, { traceId });
  console.info('[operations-metrics] snapshot_complete', { traceId, companyId, elapsedMs: Date.now() - snapshotStartedAt, warningCount: snapshot.warnings.length });
  const error = snapshotError(snapshot.warnings);
  if (error) throw error;
  const lowStock = rows.find(row => row.source_key === 'low_stock_positions');
  if (lowStock && configuredLowStockThreshold(lowStock.source_config ?? {}) !== undefined) {
    const thresholdedStartedAt = Date.now();
    const thresholded = await readOperationsMetricSnapshot(companyId, {
      lowStockThreshold: configuredLowStockThreshold(lowStock.source_config ?? {})!,
      traceId,
    });
    console.info('[operations-metrics] thresholded_snapshot_complete', { traceId, companyId, elapsedMs: Date.now() - thresholdedStartedAt, warningCount: thresholded.warnings.length });
    const thresholdError = snapshotError(thresholded.warnings);
    if (thresholdError) throw thresholdError;
    return { snapshot, thresholded };
  }
  return { snapshot, thresholded: snapshot };
}

export async function bootstrapOperationsCanonicalMetrics(companyId: string, userId: string, traceId?: string) {
  const client = await pool.connect();
  const startedAt = Date.now();
  console.info('[operations-metrics] bootstrap_start', { traceId, companyId });
  try {
    await lockCompany(client, companyId);
    console.info('[operations-metrics] bootstrap_lock_acquired', { traceId, companyId, elapsedMs: Date.now() - startedAt });
    await client.query('BEGIN');
    let rows = await sourceRows(client, companyId);
    const { snapshot } = await snapshotForRows(companyId, rows, traceId);
    rows = await ensureOperationsMetrics(client, companyId, userId, snapshot);
    console.info('[operations-metrics] bootstrap_seed_complete', { traceId, companyId, elapsedMs: Date.now() - startedAt, metricCount: rows.length });
    await applySnapshot(client, companyId, userId, rows, snapshot, 'ERPNext Operations bootstrap snapshot');
    console.info('[operations-metrics] bootstrap_values_complete', { traceId, companyId, elapsedMs: Date.now() - startedAt });
    await recomputeCanonicalRollups(client, companyId);
    console.info('[operations-metrics] bootstrap_rollups_complete', { traceId, companyId, elapsedMs: Date.now() - startedAt });
    await client.query('COMMIT');
    console.info('[operations-metrics] bootstrap_complete', { traceId, companyId, elapsedMs: Date.now() - startedAt, metricCount: rows.length });
    return shapedOperationsMetrics(companyId);
  } catch (error) {
    console.error('[operations-metrics] bootstrap_failed', { traceId, companyId, elapsedMs: Date.now() - startedAt, error: error instanceof Error ? error.message : String(error) });
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await unlockCompany(client, companyId).catch(() => undefined);
    client.release();
  }
}

export async function refreshOperationsCanonicalMetrics(companyId: string, userId: string, traceId?: string) {
  const client = await pool.connect();
  try {
    await lockCompany(client, companyId);
    await client.query('BEGIN');
    const rows = await sourceRows(client, companyId);
    if (rows.length !== OPERATIONS_METRIC_KEYS.length) throw new Error('operations_metrics_not_bootstrapped');
    const { snapshot, thresholded } = await snapshotForRows(companyId, rows, traceId);
    await applySnapshot(client, companyId, userId, rows, snapshot, 'ERPNext Operations refresh');
    const lowStock = rows.find(row => row.source_key === 'low_stock_positions');
    if (lowStock && thresholded !== snapshot) {
      await applySnapshot(client, companyId, userId, [lowStock], thresholded, 'ERPNext Operations refresh');
    }
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
    return shapedOperationsMetrics(companyId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await unlockCompany(client, companyId).catch(() => undefined);
    client.release();
  }
}

export async function configureOperationsCanonicalMetric(
  companyId: string,
  userId: string,
  key: OperationsMetricKey,
  input: { target: number; ownerMemberId: string; weight: number; lowStockThreshold?: number },
  traceId?: string,
) {
  const definition = DEFINITIONS[key];
  if (!Number.isFinite(input.target)) throw new Error('invalid_target');
  if (!Number.isFinite(input.weight) || input.weight <= 0) throw new Error('invalid_weight');
  if (definition.needsLowStockThreshold && (!Number.isFinite(input.lowStockThreshold) || (input.lowStockThreshold as number) < 0)) {
    throw new Error('low_stock_threshold_required');
  }
  const client = await pool.connect();
  try {
    await lockCompany(client, companyId);
    await client.query('BEGIN');
    const { rows: owners } = await client.query(
      `SELECT 1 FROM public.company_members WHERE id=$1 AND company_id=$2 AND status='active'`,
      [input.ownerMemberId, companyId],
    );
    if (!owners.length) throw new Error('owner_not_found');
    const rows = await sourceRows(client, companyId);
    const row = rows.find(item => item.source_key === key);
    if (!row) throw new Error('operations_metric_not_bootstrapped');
    const sourceConfig = definition.needsLowStockThreshold
      ? { ...(row.source_config ?? {}), metricKey: key, lowStockThreshold: input.lowStockThreshold }
      : { ...(row.source_config ?? {}), metricKey: key };
    const snapshot = await readOperationsMetricSnapshot(companyId, definition.needsLowStockThreshold
      ? { lowStockThreshold: input.lowStockThreshold, traceId }
      : { traceId });
    const error = snapshotError(snapshot.warnings);
    if (error) throw error;
    const value = definition.snapshotValue(snapshot);
    if (value == null) throw new Error('operations_metric_value_unavailable');
    // A low-stock metric has no raw value until its user-defined threshold is
    // known. Its first thresholded read is therefore its honest baseline.
    const baseline = row.source_status === 'needs_configuration'
      ? value
      : (numberOrNull(row.baseline_value) ?? value);
    if (baseline === input.target && definition.direction !== 'target_band') throw new Error('target_must_differ_from_baseline');
    const score = scoreMetric(value, baseline, input.target, definition.direction);
    await client.query(
      `UPDATE public.metrics
          SET target_value=$3,current_value=$4,normalized_score=$5,owner_member_id=$6,status='active',source_confidence=1,updated_by=$7,updated_at=NOW()
        WHERE id=$1 AND company_id=$2`,
      [row.metric_id, companyId, input.target, value, score, input.ownerMemberId, userId],
    );
    await client.query(
      `UPDATE public.metric_sources
          SET status='active',config=$3,last_attempted_at=NOW(),last_synced_at=NOW(),last_error=NULL
        WHERE id=$1 AND company_id=$2`,
      [row.source_id, companyId, JSON.stringify(sourceConfig)],
    );
    await client.query(
      `UPDATE public.metric_links SET weight=$3,is_core=true
        WHERE metric_id=$1 AND company_id=$2 AND target_type='department' AND relation='health_component'`,
      [row.metric_id, companyId, input.weight],
    );
    await client.query(
      `INSERT INTO public.metric_values
         (metric_id,company_id,raw_value,normalized_score,source_type,source_id,source_confidence,reason,recorded_by,updated_at)
       VALUES ($1,$2,$3,$4,'integration',$5,1,'ERPNext Operations metric configured',$6,NOW())
       ON CONFLICT (metric_id) WHERE source_type='integration'
       DO UPDATE SET raw_value=EXCLUDED.raw_value,normalized_score=EXCLUDED.normalized_score,
                     source_id=EXCLUDED.source_id,reason=EXCLUDED.reason,recorded_by=EXCLUDED.recorded_by,updated_at=NOW()`,
      [row.metric_id, companyId, value, score, row.source_id, userId],
    );
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
    return shapedOperationsMetrics(companyId);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => undefined);
    throw error;
  } finally {
    await unlockCompany(client, companyId).catch(() => undefined);
    client.release();
  }
}
