import { pool } from '../db.js';
import { decrypt } from './crypto.js';
import { fetchMetaAdsMetrics, type MetaAdsMetrics } from '../adapters/metaAds.js';
import { recomputeCanonicalRollups, scoreMetric, type MetricDirection } from './canonicalMetrics.js';

export type MetaMetricKey = 'roas_30d' | 'cost_per_conversion_30d' | 'selected_conversions_30d';

const META_METRICS: Record<MetaMetricKey, {
  name: string;
  unit: (currency: string) => string;
  valueType: 'ratio' | 'currency' | 'count';
  direction: MetricDirection;
  nodeSourceKey: string;
  value: (metrics: MetaAdsMetrics) => number | null;
}> = {
  roas_30d: {
    name: 'Meta ROAS (30d)', unit: () => 'x', valueType: 'ratio', direction: 'higher_is_better',
    nodeSourceKey: 'mkt_paid_acquisition_ad_performance', value: metrics => metrics.roas,
  },
  cost_per_conversion_30d: {
    name: 'Meta cost per conversion (30d)', unit: currency => currency, valueType: 'currency', direction: 'lower_is_better',
    nodeSourceKey: 'mkt_paid_acquisition_ad_performance', value: metrics => metrics.cpa,
  },
  selected_conversions_30d: {
    name: 'Meta attributed conversions (30d)', unit: () => '', valueType: 'count', direction: 'higher_is_better',
    nodeSourceKey: 'mkt_paid_acquisition_ad_performance', value: metrics => metrics.conversions30d,
  },
};

export function isMetaMetricKey(value: string): value is MetaMetricKey {
  return Object.prototype.hasOwnProperty.call(META_METRICS, value);
}

async function configuredMetaMetrics(companyId: string) {
  const { rows } = await pool.query(
    `SELECT m.*, s.integration_id, s.source_key, s.external_account_id, s.currency,
            s.status AS source_status, s.last_attempted_at, s.last_synced_at, s.last_error,
            COALESCE(jsonb_agg(DISTINCT to_jsonb(ml)) FILTER (WHERE ml.id IS NOT NULL), '[]') AS links
       FROM public.metrics m
       JOIN public.metric_sources s ON s.metric_id = m.id
       LEFT JOIN public.metric_links ml ON ml.metric_id = m.id
      WHERE m.company_id = $1 AND s.integration_id = 'int-meta'
      GROUP BY m.id, s.id ORDER BY s.source_key`,
    [companyId],
  );
  return rows;
}

export async function applyStoredMetaCanonicalMetrics(
  companyId: string,
  accountId: string,
  preview: MetaAdsMetrics,
  syncedAt: string,
  dataThrough = syncedAt.slice(0, 10),
  markSuccessfulSync = true,
) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`meta-canonical:${companyId}`]);
    const { rows: connections } = await client.query(
      `SELECT metadata FROM public.integration_connections
        WHERE company_id=$1 AND integration_id='int-meta' FOR UPDATE`,
      [companyId],
    );
    if (!connections.length || String((connections[0].metadata ?? {}).ad_account_id ?? '') !== accountId) {
      throw new Error('account_changed');
    }
    const { rows: sources } = await client.query(
      `SELECT s.id AS source_id, s.metric_id, s.source_key, s.status,
              m.baseline_value, m.target_value, m.direction
         FROM public.metric_sources s JOIN public.metrics m ON m.id = s.metric_id
        WHERE s.company_id = $1 AND s.integration_id = 'int-meta' FOR UPDATE`,
      [companyId],
    );
    for (const source of sources) {
      const sourceKey = String(source.source_key);
      if (!isMetaMetricKey(sourceKey) || source.status !== 'active') continue;
      const definition = META_METRICS[sourceKey];
      const value = definition.value(preview);
      const score = scoreMetric(value, Number(source.baseline_value), Number(source.target_value), source.direction);
      await client.query(
        `UPDATE public.metrics SET current_value = $1, normalized_score = $2, updated_at = NOW()
          WHERE id = $3 AND company_id = $4`,
        [value, score, source.metric_id, companyId],
      );
      if (value == null) continue;
      await client.query(
        `INSERT INTO public.metric_values
           (metric_id, company_id, raw_value, normalized_score, period_start, period_end,
            source_type, source_id, source_confidence, reason, updated_at)
         VALUES ($1,$2,$3,$4,($5::date - INTERVAL '29 days')::date,$5::date,
                 'integration',$6,1,'Meta Ads stored rolling 30-day snapshot',NOW())
         ON CONFLICT (metric_id) WHERE source_type = 'integration'
         DO UPDATE SET raw_value = EXCLUDED.raw_value,
                       normalized_score = EXCLUDED.normalized_score,
                       period_start = EXCLUDED.period_start,
                       period_end = EXCLUDED.period_end,
                       source_id = EXCLUDED.source_id,
                       reason = EXCLUDED.reason,
                       updated_at = NOW()`,
        [source.metric_id, companyId, value, score, dataThrough, source.source_id],
      );
    }
    if (markSuccessfulSync) {
      await client.query(
        `UPDATE public.metric_sources
            SET external_account_id = $2, currency = $3, last_synced_at = $4,
                last_attempted_at = $4, last_error = NULL
          WHERE company_id = $1 AND integration_id = 'int-meta'`,
        [companyId, accountId, preview.currency, syncedAt],
      );
      await client.query(
        `UPDATE public.integration_connections SET last_synced_at = $2
          WHERE company_id = $1 AND integration_id = 'int-meta'`,
        [companyId, syncedAt],
      );
    } else {
      await client.query(
        `UPDATE public.metric_sources SET external_account_id=$2,currency=$3
          WHERE company_id=$1 AND integration_id='int-meta'`,
        [companyId, accountId, preview.currency],
      );
    }
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function syncMetaCanonicalMetrics(companyId: string) {
  const requestedAt = new Date();
  const client = await pool.connect();
  let began = false;
  try {
    await client.query('BEGIN');
    began = true;
    await client.query(`SELECT pg_advisory_xact_lock(hashtext($1))`, [`meta-sync:${companyId}`]);
    const { rows: connections } = await client.query(
      `SELECT * FROM public.integration_connections
        WHERE company_id = $1 AND integration_id = 'int-meta' FOR UPDATE`,
      [companyId],
    );
    if (!connections.length) {
      await client.query('ROLLBACK');
      began = false;
      throw new Error('meta_not_connected');
    }
    const connection = connections[0];
    const lastSynced = connection.last_synced_at ? new Date(connection.last_synced_at) : null;
    if (lastSynced && lastSynced >= requestedAt) {
      await client.query('COMMIT');
      began = false;
      return { fresh: true, deduplicated: true, syncedAt: connection.last_synced_at, accountId: String((connection.metadata ?? {}).ad_account_id ?? ''), preview: null, metrics: await configuredMetaMetrics(companyId) };
    }

    const metadata = (connection.metadata ?? {}) as Record<string, unknown>;
    const adAccountId = String(metadata.ad_account_id ?? '');
    if (!adAccountId) throw new Error('meta_account_missing');
    const selectedAction = typeof metadata.meta_conversion_action_type === 'string'
      ? metadata.meta_conversion_action_type
      : null;

    await client.query(
      `UPDATE public.metric_sources SET last_attempted_at = NOW(), last_error = NULL
        WHERE company_id = $1 AND integration_id = 'int-meta'`,
      [companyId],
    );

    const started = Date.now();
    const preview = await fetchMetaAdsMetrics(decrypt(connection.access_token_enc), adAccountId, selectedAction);
    const syncedAt = new Date().toISOString();
    const { rows: sources } = await client.query(
      `SELECT s.id AS source_id, s.metric_id, s.source_key, s.status,
              m.baseline_value, m.target_value, m.direction
         FROM public.metric_sources s JOIN public.metrics m ON m.id = s.metric_id
        WHERE s.company_id = $1 AND s.integration_id = 'int-meta' FOR UPDATE`,
      [companyId],
    );
    for (const source of sources) {
      const sourceKey = String(source.source_key);
      if (!isMetaMetricKey(sourceKey) || source.status !== 'active') continue;
      const definition = META_METRICS[sourceKey];
      const value = definition.value(preview);
      const score = scoreMetric(value, Number(source.baseline_value), Number(source.target_value), source.direction);
      await client.query(
        `UPDATE public.metrics SET current_value = $1, normalized_score = $2, updated_at = NOW()
          WHERE id = $3 AND company_id = $4`,
        [value, score, source.metric_id, companyId],
      );
      if (value != null) {
        await client.query(
          `INSERT INTO public.metric_values
             (metric_id, company_id, raw_value, normalized_score, period_start, period_end,
              source_type, source_id, source_confidence, reason, updated_at)
           VALUES ($1,$2,$3,$4,(CURRENT_DATE - INTERVAL '30 days')::date,CURRENT_DATE,
                   'integration',$5,1,'Meta Ads rolling 30-day sync',NOW())
           ON CONFLICT (metric_id) WHERE source_type = 'integration'
           DO UPDATE SET raw_value = EXCLUDED.raw_value,
                         normalized_score = EXCLUDED.normalized_score,
                         period_start = EXCLUDED.period_start,
                         period_end = EXCLUDED.period_end,
                         source_id = EXCLUDED.source_id,
                         reason = EXCLUDED.reason,
                         updated_at = NOW()`,
          [source.metric_id, companyId, value, score, source.source_id],
        );
      }
    }
    await client.query(
      `UPDATE public.metric_sources
          SET external_account_id = $2, currency = $3, last_synced_at = $4,
              last_attempted_at = $4, last_error = NULL
        WHERE company_id = $1 AND integration_id = 'int-meta'`,
      [companyId, adAccountId, preview.currency, syncedAt],
    );
    await client.query(
      `UPDATE public.integration_connections SET last_synced_at = $2
        WHERE company_id = $1 AND integration_id = 'int-meta'`,
      [companyId, syncedAt],
    );
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
    began = false;
    console.info(JSON.stringify({ event: 'meta_metric_sync', companyId, durationMs: Date.now() - started, ok: true }));
    return { fresh: true, deduplicated: false, syncedAt, accountId: adAccountId, preview, metrics: await configuredMetaMetrics(companyId) };
  } catch (error) {
    if (began) await client.query('ROLLBACK');
    const message = error instanceof Error ? error.message : String(error);
    await pool.query(
      `UPDATE public.metric_sources SET last_attempted_at = NOW(), last_error = $2
        WHERE company_id = $1 AND integration_id = 'int-meta'`,
      [companyId, message],
    ).catch(() => {});
    const cached = await configuredMetaMetrics(companyId).catch(() => []);
    if (cached.length) return { fresh: false, deduplicated: false, syncedAt: cached[0]?.last_synced_at ?? null, accountId: cached[0]?.external_account_id ?? '', preview: null, metrics: cached, syncError: message };
    throw error;
  } finally {
    client.release();
  }
}

export async function setMetaConversionAction(companyId: string, actionType: string) {
  const action = actionType.trim();
  if (!action) throw new Error('conversion_action_required');
  const { rows } = await pool.query(
    `WITH connection AS (
       UPDATE public.integration_connections
          SET metadata = metadata || jsonb_build_object('meta_conversion_action_type', $2::text)
        WHERE company_id = $1 AND integration_id = 'int-meta'
          AND COALESCE(metadata->>'ad_account_id','') <> ''
       RETURNING company_id, metadata->>'ad_account_id' AS ad_account_id
     ), sources AS (
       UPDATE public.metric_sources
          SET status = 'needs_configuration'
        WHERE company_id = $1 AND integration_id = 'int-meta'
          AND source_key IN ('cost_per_conversion_30d','selected_conversions_30d')
          AND EXISTS (SELECT 1 FROM connection)
       RETURNING id
     ), invalidated_findings AS (
       UPDATE public.meta_ads_findings
          SET active=FALSE,clear_count=0,resolved_at=NOW(),updated_at=NOW()
        WHERE company_id=$1
          AND ad_account_id=(SELECT ad_account_id FROM connection)
          AND active=TRUE
          AND kind IN (
            'missing_conversion_configuration','zero_selected_conversions','cpa_increase',
            'target_gap_widening','conversion_efficiency_outlier'
          )
       RETURNING id
     ), recalculation AS (
       INSERT INTO public.meta_ads_recalculation_jobs
         (company_id,ad_account_id,selected_action)
       SELECT company_id,ad_account_id,$2::text FROM connection
       ON CONFLICT (company_id,ad_account_id) DO UPDATE SET
         selected_action=EXCLUDED.selected_action,
         generation=meta_ads_recalculation_jobs.generation+1,
         status=CASE WHEN meta_ads_recalculation_jobs.status='running' THEN 'running' ELSE 'pending' END,
         attempt=CASE WHEN meta_ads_recalculation_jobs.status='running' THEN meta_ads_recalculation_jobs.attempt ELSE 0 END,
         requested_at=NOW(),available_at=NOW(),completed_at=NULL,
         error_code=NULL,error_message=NULL,
         locked_at=CASE WHEN meta_ads_recalculation_jobs.status='running' THEN meta_ads_recalculation_jobs.locked_at ELSE NULL END,
         locked_until=CASE WHEN meta_ads_recalculation_jobs.status='running' THEN meta_ads_recalculation_jobs.locked_until ELSE NULL END,
         locked_by=CASE WHEN meta_ads_recalculation_jobs.status='running' THEN meta_ads_recalculation_jobs.locked_by ELSE NULL END
       RETURNING id
     )
     SELECT EXISTS (SELECT 1 FROM connection) AS configured,
            (SELECT COUNT(*)::int FROM sources) AS invalidated_sources,
            (SELECT COUNT(*)::int FROM invalidated_findings) AS invalidated_findings,
            EXISTS (SELECT 1 FROM recalculation) AS recalculation_queued`,
    [companyId, action],
  );
  if (!rows[0]?.configured) throw new Error('meta_not_connected');
  return { configured: true };
}

export async function configureMetaMetric(companyId: string, userId: string, key: MetaMetricKey, input: {
  target: number;
  ownerMemberId: string;
  weight: number;
  goalLinks: Array<{ goalId: string; weight: number }>;
}, stored?: { preview: MetaAdsMetrics; accountId: string }) {
  const synced = stored ? { ...stored, fresh: true } : await syncMetaCanonicalMetrics(companyId);
  if (!synced.preview) throw new Error('fresh_meta_preview_required');
  const definition = META_METRICS[key];
  const value = definition.value(synced.preview);
  if (value == null) throw new Error('meta_metric_not_scorable');
  if (!Number.isFinite(input.target) || input.target === value) throw new Error('invalid_target');
  if (definition.direction === 'higher_is_better' && input.target < value) throw new Error('target_must_exceed_baseline');
  if (definition.direction === 'lower_is_better' && input.target > value) throw new Error('target_must_be_below_baseline');
  if (!Number.isFinite(input.weight) || input.weight <= 0) throw new Error('invalid_weight');

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const [{ rows: owners }, { rows: nodes }] = await Promise.all([
      client.query(`SELECT 1 FROM public.company_members WHERE id = $1 AND company_id = $2 AND status = 'active'`, [input.ownerMemberId, companyId]),
      // Matched on the content-derived metadata.sourceKey, not the positional source_key column
      // (see genBdtSeed.ts's buildMetadata) — stable across tree reorders. Branch/action/metric
      // siblings share the same metadata object, so node_type='metric' disambiguates to the one
      // leaf that actually opens in the workspace.
      client.query(
        `SELECT id FROM public.department_bdt_nodes
          WHERE company_id = $1 AND node_type = 'metric' AND metadata->>'sourceKey' = $2`,
        [companyId, definition.nodeSourceKey],
      ),
    ]);
    if (!owners.length) throw new Error('owner_not_found');
    if (!nodes.length) throw new Error('meta_bdt_node_not_found');
    for (const goal of input.goalLinks) {
      const { rowCount } = await client.query(`SELECT 1 FROM public.bdt_goals WHERE id = $1 AND company_id = $2`, [goal.goalId, companyId]);
      if (!rowCount || !Number.isFinite(goal.weight) || goal.weight <= 0) throw new Error('invalid_goal_link');
    }

    const { rows: existing } = await client.query(
      `SELECT m.id FROM public.metrics m JOIN public.metric_sources s ON s.metric_id = m.id
        WHERE m.company_id = $1 AND s.integration_id = 'int-meta' AND s.source_key = $2 FOR UPDATE`,
      [companyId, key],
    );
    let metricId = existing[0]?.id as string | undefined;
    const score = scoreMetric(value, value, input.target, definition.direction);
    if (metricId) {
      await client.query(
        `UPDATE public.metrics SET name=$3, unit=$4, value_type=$5, direction=$6,
                baseline_value=$7, target_value=$8, current_value=$7, normalized_score=$9,
                owner_member_id=$10, status='active', source_confidence=1, updated_by=$11, updated_at=NOW()
          WHERE id=$1 AND company_id=$2`,
        [metricId, companyId, definition.name, definition.unit(synced.preview.currency), definition.valueType,
         definition.direction, value, input.target, score, input.ownerMemberId, userId],
      );
      await client.query(
        `UPDATE public.metric_sources SET status='active', external_account_id=$3, currency=$4,
                last_error=NULL, last_synced_at=NOW()
          WHERE metric_id=$1 AND company_id=$2`,
        [metricId, companyId, synced.accountId, synced.preview.currency],
      );
      await client.query(`DELETE FROM public.metric_links WHERE metric_id=$1 AND target_type IN ('bdt_node','goal')`, [metricId]);
    } else {
      const { rows } = await client.query(
        `INSERT INTO public.metrics
           (company_id,name,description,unit,value_type,direction,baseline_value,target_value,
            current_value,normalized_score,owner_member_id,cadence,status,source_confidence,created_by,updated_by)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$7,$9,$10,'on_refresh','active',1,$11,$11) RETURNING id`,
        [companyId, definition.name, 'Latest Meta Ads rolling 30-day metric', definition.unit(synced.preview.currency),
         definition.valueType, definition.direction, value, input.target, score, input.ownerMemberId, userId],
      );
      metricId = rows[0].id;
      await client.query(
        `INSERT INTO public.metric_sources
           (metric_id,company_id,source_type,label,config,confidence,created_by,
            integration_id,source_key,external_account_id,currency,status,last_attempted_at,last_synced_at)
         VALUES ($1,$2,'integration','Meta Ads','{}',1,$3,'int-meta',$4,$5,$6,'active',NOW(),NOW())`,
        [metricId, companyId, userId, key, synced.accountId, synced.preview.currency],
      );
    }
    await client.query(
      `INSERT INTO public.metric_links
         (metric_id,company_id,target_type,target_id,relation,weight,is_core,created_by)
       VALUES ($1,$2,'bdt_node',$3,'health_component',$4,true,$5)`,
      [metricId, companyId, nodes[0].id, input.weight, userId],
    );
    for (const goal of input.goalLinks) {
      await client.query(
        `INSERT INTO public.metric_links
           (metric_id,company_id,target_type,target_id,relation,weight,is_core,created_by)
         VALUES ($1,$2,'goal',$3,'drives',$4,true,$5)`,
        [metricId, companyId, goal.goalId, goal.weight, userId],
      );
    }
    const { rows: sourceRows } = await client.query(`SELECT id FROM public.metric_sources WHERE metric_id=$1`, [metricId]);
    await client.query(
      `INSERT INTO public.metric_values
         (metric_id,company_id,raw_value,normalized_score,period_start,period_end,
          source_type,source_id,source_confidence,reason,updated_at)
       VALUES ($1,$2,$3,$4,(CURRENT_DATE - INTERVAL '30 days')::date,CURRENT_DATE,
               'integration',$5,1,'Meta metric configured',NOW())
       ON CONFLICT (metric_id) WHERE source_type='integration'
       DO UPDATE SET raw_value=EXCLUDED.raw_value, normalized_score=EXCLUDED.normalized_score,
                     source_id=EXCLUDED.source_id, period_start=EXCLUDED.period_start,
                     period_end=EXCLUDED.period_end, updated_at=NOW()`,
      [metricId, companyId, value, score, sourceRows[0].id],
    );
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
    return configuredMetaMetrics(companyId);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function disconnectMetaMetricSources(companyId: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE public.metric_sources SET status='disconnected'
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [companyId],
    );
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    client.release();
  }
}

export async function reconnectMetaMetricSources(companyId: string, accountId: string, currency: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    await client.query(
      `UPDATE public.metric_sources
          SET external_account_id=$2, currency=$3,
              status=CASE
                WHEN source_key='cost_per_conversion_30d' AND metric_sources.currency IS NOT NULL AND metric_sources.currency <> $3 THEN 'needs_configuration'
                WHEN status='disconnected' THEN 'active'
                ELSE status
              END,
              last_error=NULL
        WHERE company_id=$1 AND integration_id='int-meta'`,
      [companyId, accountId, currency],
    );
    await recomputeCanonicalRollups(client, companyId);
    await client.query('COMMIT');
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally { client.release(); }
}
