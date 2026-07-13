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

  // Direct BDT node scores. A metric may have one core BDT link, while goal
  // links remain independent and therefore cannot double-count node health.
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

  // Every ancestor node is based directly on all scored descendant metrics,
  // preserving metric weights instead of weighting by arbitrary tree shape.
  await client.query(
    `WITH RECURSIVE ancestry AS (
       SELECT n.id AS descendant_id, n.parent_node_id AS ancestor_id
         FROM public.department_bdt_nodes n
        WHERE n.company_id = $1 AND n.parent_node_id IS NOT NULL
       UNION ALL
       SELECT a.descendant_id, parent.parent_node_id
         FROM ancestry a
         JOIN public.department_bdt_nodes parent ON parent.id = a.ancestor_id
        WHERE parent.parent_node_id IS NOT NULL
     ), scored AS (
       SELECT a.ancestor_id AS target_id,
              ROUND(SUM(m.normalized_score * ml.weight) / NULLIF(SUM(ml.weight), 0))::int AS health_score,
              COUNT(DISTINCT m.id)::int AS metric_count,
              AVG(m.source_confidence) AS confidence,
              COUNT(DISTINCT ml.target_id)::int AS covered_nodes
         FROM ancestry a
         JOIN public.metric_links ml ON ml.target_id = a.descendant_id
          AND ml.target_type = 'bdt_node' AND ml.is_core = true
         JOIN public.metrics m ON m.id = ml.metric_id
        WHERE m.company_id = $1 AND m.status = 'active' AND m.normalized_score IS NOT NULL
          AND NOT EXISTS (
            SELECT 1 FROM public.metric_sources disabled
             WHERE disabled.metric_id = m.id AND disabled.status <> 'active'
          )
        GROUP BY a.ancestor_id
     ), eligible AS (
       SELECT parent.id AS target_id, COUNT(DISTINCT child.id)::int AS eligible_nodes
         FROM public.department_bdt_nodes parent
         JOIN public.department_bdt_nodes child ON child.company_id = parent.company_id
        WHERE parent.company_id = $1
          AND child.node_level = 'branch'
          AND child.parent_node_id = parent.id
        GROUP BY parent.id
     )
     INSERT INTO public.metric_rollups
       (company_id, target_type, target_id, health_score, metric_count,
        source_confidence, covered_node_count, eligible_node_count)
     SELECT $1, 'bdt_node', s.target_id, s.health_score, s.metric_count,
            s.confidence, s.covered_nodes, GREATEST(COALESCE(e.eligible_nodes, s.covered_nodes), s.covered_nodes)
       FROM scored s LEFT JOIN eligible e ON e.target_id = s.target_id
     ON CONFLICT (company_id, target_type, target_id) DO UPDATE SET
       health_score = EXCLUDED.health_score,
       metric_count = EXCLUDED.metric_count,
       source_confidence = EXCLUDED.source_confidence,
       covered_node_count = EXCLUDED.covered_node_count,
       eligible_node_count = EXCLUDED.eligible_node_count,
       calculated_at = NOW()`,
    [companyId],
  );

  // Department health likewise aggregates descendant core metrics directly.
  await client.query(
    `WITH eligible AS (
       SELECT department_id, COUNT(*)::int AS node_count
         FROM public.department_bdt_nodes
        WHERE company_id = $1 AND node_level = 'branch'
        GROUP BY department_id
     )
     INSERT INTO public.metric_rollups
       (company_id, target_type, target_id, health_score, metric_count,
        source_confidence, covered_node_count, eligible_node_count)
     SELECT d.company_id, 'department', d.id,
            ROUND(SUM(m.normalized_score * ml.weight) / NULLIF(SUM(ml.weight), 0))::int,
            COUNT(DISTINCT m.id)::int, AVG(m.source_confidence),
            COUNT(DISTINCT ml.target_id)::int,
            MAX(COALESCE(eligible.node_count, 0))::int
       FROM public.departments d
       JOIN public.department_bdt_nodes target ON target.department_id = d.id
       JOIN public.metric_links ml ON ml.target_id = target.id
        AND ml.target_type = 'bdt_node' AND ml.is_core = true
       JOIN public.metrics m ON m.id = ml.metric_id
       LEFT JOIN eligible ON eligible.department_id = d.id
      WHERE d.company_id = $1 AND m.status = 'active' AND m.normalized_score IS NOT NULL
        AND NOT EXISTS (
          SELECT 1 FROM public.metric_sources disabled
           WHERE disabled.metric_id = m.id AND disabled.status <> 'active'
        )
      GROUP BY d.company_id, d.id`,
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
