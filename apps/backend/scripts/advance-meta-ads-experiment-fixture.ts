import { pool } from '../src/db.js';
import { evaluateMeasuringMetaAdsExperiments } from '../src/domains/meta-ads/decisionInbox.js';

const outcomes = new Set(['improved', 'worsened', 'no-clear-change', 'day-7-low-volume', 'day-14-inconclusive']);
const args = new Map(process.argv.slice(2).map((arg) => {
  const [key, value = 'true'] = arg.replace(/^--/, '').split('=');
  return [key, value];
}));
const experimentId = args.get('experiment-id') ?? '';
const outcome = args.get('outcome') ?? 'improved';
const execute = args.get('execute') === 'true';
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

if (process.env.NODE_ENV === 'production') throw new Error('fixture_seeding_disabled_in_production');
if (!uuid.test(experimentId)) throw new Error('Pass --experiment-id=<uuid>.');
if (!outcomes.has(outcome)) throw new Error(`Unknown outcome "${outcome}". Use: ${[...outcomes].join(', ')}.`);

const { rows } = await pool.query(
  `SELECT e.*,
          c.metadata->>'ad_account_id' AS current_account_id,
          c.metadata->>'fixture_scenario' AS fixture_scenario,
          (SELECT MAX(metric_date) FROM public.meta_ads_account_daily h
            WHERE h.company_id=e.company_id AND h.ad_account_id=e.ad_account_id) AS data_through
     FROM public.meta_ads_experiments e
     LEFT JOIN public.integration_connections c ON c.company_id=e.company_id AND c.integration_id='int-meta'
    WHERE e.id=$1`,
  [experimentId],
);
const experiment = rows[0];
if (!experiment) throw new Error('experiment_not_found');
if (experiment.status !== 'measuring') throw new Error('experiment_must_be_measuring');
if (String(experiment.current_account_id ?? '') !== String(experiment.ad_account_id)) throw new Error('experiment_account_is_not_current');
if (!experiment.fixture_scenario) throw new Error('advance_requires_a_fixture_meta_connection');
if (experiment.measurement_scope !== 'adset' || experiment.primary_metric !== 'ctr') {
  throw new Error('advance_currently_supports_fixture_adset_ctr_experiments_only');
}
if (!experiment.data_through) throw new Error('fixture_account_history_missing');

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

const through = isoDate(experiment.data_through as string | Date);
const fourteenDay = outcome === 'day-14-inconclusive';
const evaluationStart = shiftDate(through, fourteenDay ? -13 : -6);
const appliedLocalDate = shiftDate(evaluationStart, -1);
const due7 = fourteenDay ? shiftDate(evaluationStart, 6) : through;
const due14 = fourteenDay ? through : shiftDate(evaluationStart, 13);
const impressions = outcome === 'day-7-low-volume' || fourteenDay ? 100 : 1_000;
const clicks = outcome === 'improved' ? 30 : outcome === 'worsened' ? 10 : outcome === 'no-clear-change' ? 21 : 2;

console.log(JSON.stringify({
  dryRun: !execute,
  experimentId,
  companyId: String(experiment.company_id),
  accountId: String(experiment.ad_account_id),
  outcome,
  evaluationStart,
  dataThrough: through,
  warning: 'Execution rewrites fixture-only post-change delivery dates and runs the deterministic evaluator.',
}, null, 2));

if (!execute) {
  console.log('Dry run only. Re-run with --execute after verifying the experiment, company, and fixture account.');
  await pool.end();
  process.exit(0);
}

const client = await pool.connect();
try {
  await client.query('BEGIN');
  const updated = await client.query(
    `UPDATE public.meta_ads_delivery_daily
        SET impressions=$6::bigint,clicks=$7::bigint,
            ctr=CASE WHEN $6::bigint>0 THEN ($7::numeric/$6::numeric)*100 ELSE 0 END,
            cpc=CASE WHEN $7::bigint>0 THEN spend/$7::numeric ELSE 0 END
      WHERE company_id=$1 AND ad_account_id=$2 AND level='adset' AND entity_id=$3
        AND metric_date BETWEEN $4 AND $5`,
    [experiment.company_id, experiment.ad_account_id, experiment.measurement_scope_id, evaluationStart, through, impressions, clicks],
  );
  const expectedDays = fourteenDay ? 14 : 7;
  if (updated.rowCount !== expectedDays) throw new Error(`expected_${expectedDays}_fixture_delivery_days_found_${updated.rowCount}`);
  await client.query(
    `UPDATE public.meta_ads_experiments
        SET applied_local_date=$2,evaluation_start=$3,evaluation_due_7=$4,evaluation_due_14=$5,
            evaluation_days=$6,updated_at=NOW()
      WHERE id=$1 AND status='measuring'`,
    [experimentId, appliedLocalDate, evaluationStart, due7, due14, fourteenDay ? 14 : 7],
  );
  await client.query('COMMIT');
} catch (error) {
  await client.query('ROLLBACK');
  throw error;
} finally {
  client.release();
}

await evaluateMeasuringMetaAdsExperiments(String(experiment.company_id), String(experiment.ad_account_id), through);
const result = await pool.query(
  `SELECT status,outcome,evaluation_days,result_explanation FROM public.meta_ads_experiments WHERE id=$1`,
  [experimentId],
);
console.log(JSON.stringify(result.rows[0], null, 2));
await pool.end();
