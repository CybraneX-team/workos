import type { PoolClient } from 'pg';

// `scoreMetric` (per-metric normalization) now lives in @cybranex/metrics, the
// single source of truth shared with the frontend. Re-export it here so existing
// backend importers of this module keep working.
export { scoreMetric, type MetricDirection } from '@cybranex/metrics';

/**
 * Rebuilds materialized rollups from canonical metrics only. Stored manual BDT
 * scores remain untouched; API readers overlay these computed rows.
 *
 * The weighted-mean below — ROUND(SUM(normalized_score * weight) /
 * NULLIF(SUM(weight), 0)) — is the SQL twin of `rollupHealth()` in
 * @cybranex/metrics, and the final AVG(goal scores) is `strategicScore()`.
 * Keep the two in sync; `test/rollupParity.test.ts` guards the formula.
 */
export async function recomputeCanonicalRollups(client: PoolClient, companyId: string): Promise<void> {
  await client.query(`DELETE FROM public.metric_rollups WHERE company_id = $1`, [companyId]);

  // Direct BDT node scores. V4 focus workspaces may own their own metrics;
  // generated descendant inheritance is intentionally not part of this model.
  await client.query(
    `INSERT INTO public.metric_rollups
       (company_id, target_type, target_id, health_score, metric_count,
        source_confidence, covered_node_count, eligible_node_count)
     SELECT ml.company_id, 'bdt_node', ml.target_id,
            ROUND(SUM(m.normalized_score * ml.weight) / NULLIF(SUM(ml.weight), 0))::int,
            COUNT(DISTINCT m.id)::int,
            AVG(m.source_confidence), 1, 1
       FROM public.metric_links ml
       JOIN public.metrics m ON m.id = ml.metric_id
      WHERE ml.company_id = $1
        AND ml.target_type = 'bdt_node'
        AND ml.is_core = true
        AND m.status = 'active'
        AND m.normalized_score IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.metric_sources disabled
           WHERE disabled.metric_id = m.id AND disabled.status <> 'active'
        )
      GROUP BY ml.company_id, ml.target_id`,
    [companyId],
  );

  // V4 has no generated branch/action descendants. Department health is the
  // direct department metric set plus direct metrics on its single focus node.
  // Keeping this explicit avoids a legacy hierarchy silently changing scores.
  await client.query(
    `WITH linked AS (
       SELECT d.id AS department_id, m.id AS metric_id, m.normalized_score,
              m.source_confidence, ml.weight
         FROM public.departments d
         JOIN public.metric_links ml
           ON ml.company_id=d.company_id
          AND ml.target_type='department'
          AND ml.target_id=d.id
          AND ml.is_core=true
         JOIN public.metrics m ON m.id=ml.metric_id
        WHERE d.company_id=$1
          AND m.status='active' AND m.normalized_score IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.metric_sources disabled
             WHERE disabled.metric_id=m.id AND disabled.status <> 'active'
          )
       UNION ALL
       SELECT d.id AS department_id, m.id AS metric_id, m.normalized_score,
              m.source_confidence, ml.weight
         FROM public.departments d
         JOIN public.department_bdt_nodes n
           ON n.department_id=d.id AND n.company_id=d.company_id
          AND n.metadata->>'taxonomyVersion'='v4'
          AND n.metadata->>'workspaceKind'='focus'
         JOIN public.metric_links ml
           ON ml.company_id=d.company_id
          AND ml.target_type='bdt_node'
          AND ml.target_id=n.id
          AND ml.is_core=true
         JOIN public.metrics m ON m.id=ml.metric_id
        WHERE d.company_id=$1
          AND m.status='active' AND m.normalized_score IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.metric_sources disabled
             WHERE disabled.metric_id=m.id AND disabled.status <> 'active'
          )
     )
     INSERT INTO public.metric_rollups
       (company_id, target_type, target_id, health_score, metric_count,
        source_confidence, covered_node_count, eligible_node_count)
     SELECT $1, 'department', department_id,
            ROUND(SUM(normalized_score * weight) / NULLIF(SUM(weight), 0))::int,
            COUNT(DISTINCT metric_id)::int, AVG(source_confidence),
            COUNT(DISTINCT metric_id)::int, COUNT(DISTINCT metric_id)::int
       FROM linked
      GROUP BY department_id`,
    [companyId],
  );

  // Goal progress is explicit only; department health never implicitly changes
  // strategic score.
  await client.query(
    `INSERT INTO public.metric_rollups
       (company_id, target_type, target_id, health_score, metric_count,
        source_confidence, covered_node_count, eligible_node_count)
     SELECT ml.company_id, 'goal', ml.target_id,
            ROUND(SUM(m.normalized_score * ml.weight) / NULLIF(SUM(ml.weight), 0))::int,
            COUNT(DISTINCT m.id)::int, AVG(m.source_confidence), 0, 0
       FROM public.metric_links ml
       JOIN public.metrics m ON m.id = ml.metric_id
      WHERE ml.company_id = $1 AND ml.target_type = 'goal' AND ml.is_core = true
        AND m.status = 'active' AND m.normalized_score IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.metric_sources disabled
           WHERE disabled.metric_id = m.id AND disabled.status <> 'active'
        )
      GROUP BY ml.company_id, ml.target_id`,
    [companyId],
  );

  const { rows } = await client.query<{ score: number | null; count: number }>(
    `SELECT ROUND(AVG(health_score))::int AS score, COUNT(*)::int AS count
       FROM public.metric_rollups
      WHERE company_id = $1 AND target_type = 'goal'`,
    [companyId],
  );
  const strategicScore = rows[0]?.count ? rows[0].score : null;
  if (strategicScore != null) {
    await client.query(
      `INSERT INTO public.metric_rollups
         (company_id, target_type, target_id, health_score, metric_count,
          source_confidence, covered_node_count, eligible_node_count)
       SELECT $1, 'company', $1, $2, COALESCE(SUM(metric_count), 0),
              COALESCE(AVG(source_confidence), 0), 0, 0
         FROM public.metric_rollups WHERE company_id = $1 AND target_type = 'goal'`,
      [companyId, strategicScore],
    );
  }
  await client.query(`UPDATE public.companies SET strategic_score = $2 WHERE id = $1`, [companyId, strategicScore]);
}
