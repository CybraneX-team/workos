-- Partial unique index so that upsert by (company_id, metric_key) works
-- for standard metrics (std-mrr, std-burn, etc.) while allowing ad-hoc metrics
-- with no metric_key (NULL) to coexist without uniqueness conflicts.
CREATE UNIQUE INDEX IF NOT EXISTS bdt_metrics_company_metric_key_unique
  ON bdt_metrics (company_id, metric_key)
  WHERE metric_key IS NOT NULL;
