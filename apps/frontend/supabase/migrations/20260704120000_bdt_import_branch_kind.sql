-- Persist generated/imported BDT branch taxonomy during company onboarding.
-- Existing rows are intentionally not backfilled; this affects future imports.

CREATE OR REPLACE FUNCTION public.insert_bdt_node_from_json(
  p_company_id uuid,
  p_department_id uuid,
  p_parent_node_id uuid,
  p_node jsonb,
  p_sort_order integer
) RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_node_id UUID;
  v_type TEXT;
  v_branch_kind TEXT;
  v_node_level TEXT;
  v_mapped_category TEXT;
  v_meta JSONB;
  child JSONB;
  v_child_sort INTEGER := 0;
BEGIN
  v_type := coalesce(p_node->>'type', 'team');
  v_branch_kind := p_node->>'branchKind';
  v_node_level := p_node->>'nodeLevel';
  v_mapped_category := p_node->>'mappedUniversalCategory';

  v_meta := coalesce(p_node->'metadata', '{}'::jsonb)
    || jsonb_strip_nulls(jsonb_build_object(
      'owner', p_node->>'owner',
      'dueDate', p_node->>'dueDate',
      'status', p_node->>'status',
      'output', p_node->>'output',
      'metricImpact', p_node->>'metricImpact',
      'dependencies', p_node->'dependencies',
      'workflowSteps', p_node->'workflowSteps',
      'interrelatedDepartments', p_node->'interrelatedDepartments',
      'members', p_node->'members',
      'memberCount', p_node->'memberCount',
      'projectDetails', p_node->'projectDetails',
      'signalDetails', p_node->'signalDetails',
      'decisionDetails', p_node->'decisionDetails',
      'metricDetails', p_node->'metricDetails',
      'actionDetails', p_node->'actionDetails'
    ));

  INSERT INTO public.department_bdt_nodes (
    company_id, department_id, parent_node_id, source_key, label,
    node_type, branch_kind, node_level, mapped_universal_category,
    score, sort_order, metadata
  )
  VALUES (
    p_company_id,
    p_department_id,
    p_parent_node_id,
    p_node->>'id',
    coalesce(p_node->>'label', 'Node'),
    v_type,
    v_branch_kind,
    v_node_level,
    v_mapped_category,
    coalesce((p_node->>'score')::INTEGER, 75),
    p_sort_order,
    v_meta
  )
  RETURNING id INTO v_node_id;

  -- Only metric nodes keep a side table; all other detail lives in metadata.
  IF v_type = 'metric' THEN
    INSERT INTO public.department_metric_links (node_id, metric_key, metadata)
    VALUES (v_node_id, p_node->>'metricKey', v_meta)
    ON CONFLICT (node_id) DO UPDATE
      SET metric_key = EXCLUDED.metric_key, metadata = EXCLUDED.metadata;
  END IF;

  FOR child IN SELECT * FROM jsonb_array_elements(coalesce(p_node->'children', '[]'::jsonb))
  LOOP
    PERFORM public.insert_bdt_node_from_json(
      p_company_id, p_department_id, v_node_id, child, v_child_sort
    );
    v_child_sort := v_child_sort + 1;
  END LOOP;

  RETURN v_node_id;
END;
$$;
