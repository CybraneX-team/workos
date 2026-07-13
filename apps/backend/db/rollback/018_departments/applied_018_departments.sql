-- ================================================================
-- FounderOS — Canonical departments and BDT internals
-- ================================================================

CREATE TABLE IF NOT EXISTS public.departments (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  source_key  TEXT,
  label       TEXT NOT NULL,
  slug        TEXT NOT NULL,
  domain      TEXT NOT NULL CHECK (domain IN ('direction', 'build', 'delivery', 'market', 'control', 'people')),
  cluster     TEXT NOT NULL DEFAULT '',
  score       INTEGER NOT NULL DEFAULT 75 CHECK (score BETWEEN 0 AND 100),
  metrics     JSONB NOT NULL DEFAULT '{"performance":75,"efficiency":75,"capacity":75,"alignment":75,"risk":25}'::jsonb,
  sort_order  INTEGER NOT NULL DEFAULT 0,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE (company_id, slug)
);

ALTER TABLE public.company_members
  ADD COLUMN IF NOT EXISTS department_id UUID REFERENCES public.departments(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_departments_company_order
  ON public.departments(company_id, sort_order, label);

CREATE INDEX IF NOT EXISTS idx_company_members_department
  ON public.company_members(department_id);

CREATE TABLE IF NOT EXISTS public.department_bdt_nodes (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     UUID NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id  UUID NOT NULL REFERENCES public.departments(id) ON DELETE CASCADE,
  parent_node_id UUID REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  source_key     TEXT,
  label          TEXT NOT NULL,
  node_type      TEXT NOT NULL CHECK (node_type IN ('team', 'process', 'project', 'resource', 'decision', 'risk', 'metric')),
  score          INTEGER NOT NULL DEFAULT 75 CHECK (score BETWEEN 0 AND 100),
  sort_order     INTEGER NOT NULL DEFAULT 0,
  metadata       JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_department_bdt_nodes_dept_parent
  ON public.department_bdt_nodes(department_id, parent_node_id, sort_order);

CREATE TABLE IF NOT EXISTS public.department_teams (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  member_count INTEGER NOT NULL DEFAULT 0 CHECK (member_count >= 0),
  role_templates TEXT[] NOT NULL DEFAULT '{}',
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_projects (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  description TEXT,
  status TEXT,
  deadline TEXT,
  budget TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_processes (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  description TEXT,
  owner TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_resources (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  resource_type TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_decisions (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  status TEXT,
  decided_at TIMESTAMPTZ,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_risks (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  status TEXT NOT NULL DEFAULT 'active',
  impact TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS public.department_metric_links (
  node_id UUID PRIMARY KEY REFERENCES public.department_bdt_nodes(id) ON DELETE CASCADE,
  metric_key TEXT,
  company_metric_definition_id UUID REFERENCES public.company_metric_definitions(id) ON DELETE SET NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb
);

ALTER TABLE public.departments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_bdt_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_teams ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_processes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_resources ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_decisions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_risks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.department_metric_links ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS departments_company_read ON public.departments;
CREATE POLICY departments_company_read ON public.departments
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS department_nodes_company_read ON public.department_bdt_nodes;
CREATE POLICY department_nodes_company_read ON public.department_bdt_nodes
  FOR SELECT USING (
    company_id IN (
      SELECT cm.company_id FROM public.company_members cm
      WHERE cm.user_id = auth.uid() AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS department_detail_read ON public.department_teams;
CREATE POLICY department_detail_read ON public.department_teams
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.department_bdt_nodes n
      JOIN public.company_members cm ON cm.company_id = n.company_id
      WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'
    )
  );

DROP POLICY IF EXISTS department_projects_read ON public.department_projects;
CREATE POLICY department_projects_read ON public.department_projects
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));
DROP POLICY IF EXISTS department_processes_read ON public.department_processes;
CREATE POLICY department_processes_read ON public.department_processes
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));
DROP POLICY IF EXISTS department_resources_read ON public.department_resources;
CREATE POLICY department_resources_read ON public.department_resources
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));
DROP POLICY IF EXISTS department_decisions_read ON public.department_decisions;
CREATE POLICY department_decisions_read ON public.department_decisions
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));
DROP POLICY IF EXISTS department_risks_read ON public.department_risks;
CREATE POLICY department_risks_read ON public.department_risks
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));
DROP POLICY IF EXISTS department_metric_links_read ON public.department_metric_links;
CREATE POLICY department_metric_links_read ON public.department_metric_links
  FOR SELECT USING (EXISTS (SELECT 1 FROM public.department_bdt_nodes n JOIN public.company_members cm ON cm.company_id = n.company_id WHERE n.id = node_id AND cm.user_id = auth.uid() AND cm.status = 'active'));

CREATE OR REPLACE FUNCTION public.slugify_department_label(p_label TEXT)
RETURNS TEXT LANGUAGE sql IMMUTABLE AS $$
  SELECT trim(both '-' from regexp_replace(lower(coalesce(p_label, 'department')), '[^a-z0-9]+', '-', 'g'))
$$;

CREATE OR REPLACE FUNCTION public.seed_default_departments_for_company(p_company_id UUID)
RETURNS VOID LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  d RECORD;
  v_department_id UUID;
  v_group_id UUID;
  v_child_id UUID;
  v_sort_order INTEGER := 0;
BEGIN
  IF EXISTS (SELECT 1 FROM public.departments WHERE company_id = p_company_id) THEN
    RETURN;
  END IF;

  FOR d IN
    SELECT * FROM jsonb_to_recordset('[
      {"source_key":"dept_engineering","label":"Engineering","domain":"build","cluster":"Build","score":91,"metrics":{"performance":91,"efficiency":85,"capacity":78,"alignment":88,"risk":14}},
      {"source_key":"dept_product","label":"Product","domain":"direction","cluster":"Direction","score":91,"metrics":{"performance":93,"efficiency":90,"capacity":85,"alignment":95,"risk":8}},
      {"source_key":"dept_sales","label":"Sales","domain":"market","cluster":"Market","score":78,"metrics":{"performance":80,"efficiency":74,"capacity":82,"alignment":76,"risk":22}},
      {"source_key":"dept_marketing","label":"Marketing","domain":"market","cluster":"Market","score":72,"metrics":{"performance":75,"efficiency":68,"capacity":74,"alignment":72,"risk":26}},
      {"source_key":"dept_hr","label":"People & HR","domain":"people","cluster":"People","score":84,"metrics":{"performance":86,"efficiency":82,"capacity":80,"alignment":88,"risk":12}},
      {"source_key":"dept_finance","label":"Finance","domain":"control","cluster":"Control","score":93,"metrics":{"performance":95,"efficiency":92,"capacity":90,"alignment":94,"risk":6}},
      {"source_key":"dept_operations","label":"Operations","domain":"delivery","cluster":"Delivery","score":61,"metrics":{"performance":63,"efficiency":58,"capacity":65,"alignment":60,"risk":38}},
      {"source_key":"dept_data","label":"Data & Analytics","domain":"build","cluster":"Build","score":76,"metrics":{"performance":78,"efficiency":74,"capacity":72,"alignment":79,"risk":20}},
      {"source_key":"dept_design","label":"Design","domain":"build","cluster":"Build","score":88,"metrics":{"performance":91,"efficiency":87,"capacity":83,"alignment":90,"risk":10}},
      {"source_key":"dept_security","label":"Security","domain":"control","cluster":"Control","score":69,"metrics":{"performance":71,"efficiency":65,"capacity":68,"alignment":73,"risk":32}},
      {"source_key":"dept_customer_success","label":"Customer Success","domain":"delivery","cluster":"Delivery","score":82,"metrics":{"performance":84,"efficiency":80,"capacity":81,"alignment":85,"risk":16}},
      {"source_key":"dept_legal","label":"Legal & Compliance","domain":"control","cluster":"Control","score":87,"metrics":{"performance":88,"efficiency":85,"capacity":82,"alignment":90,"risk":12}},
      {"source_key":"dept_strategy","label":"Strategy","domain":"direction","cluster":"Direction","score":94,"metrics":{"performance":95,"efficiency":92,"capacity":90,"alignment":96,"risk":7}}
    ]'::jsonb) AS x(source_key TEXT, label TEXT, domain TEXT, cluster TEXT, score INT, metrics JSONB)
  LOOP
    INSERT INTO public.departments (company_id, source_key, label, slug, domain, cluster, score, metrics, sort_order)
    VALUES (p_company_id, d.source_key, d.label, public.slugify_department_label(d.label), d.domain, d.cluster, d.score, d.metrics, v_sort_order)
    ON CONFLICT (company_id, slug) DO UPDATE
      SET label = EXCLUDED.label
    RETURNING id INTO v_department_id;

    INSERT INTO public.department_bdt_nodes (company_id, department_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, d.source_key || ':teams', 'Teams', 'team', greatest(d.score - 2, 0), 0)
    RETURNING id INTO v_group_id;
    INSERT INTO public.department_teams (node_id, member_count, role_templates)
    VALUES (v_group_id, 0, '{}') ON CONFLICT (node_id) DO NOTHING;
    INSERT INTO public.department_bdt_nodes (company_id, department_id, parent_node_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, v_group_id, d.source_key || ':core-team', d.label || ' Team', 'team', d.score, 0)
    RETURNING id INTO v_child_id;
    INSERT INTO public.department_teams (node_id, member_count, role_templates)
    VALUES (v_child_id, 0, '{}') ON CONFLICT (node_id) DO NOTHING;

    INSERT INTO public.department_bdt_nodes (company_id, department_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, d.source_key || ':projects', 'Projects', 'project', greatest(d.score - 4, 0), 1)
    RETURNING id INTO v_group_id;
    INSERT INTO public.department_projects (node_id, status, description)
    VALUES (v_group_id, 'Active', d.label || ' initiatives') ON CONFLICT (node_id) DO NOTHING;
    INSERT INTO public.department_bdt_nodes (company_id, department_id, parent_node_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, v_group_id, d.source_key || ':priority-project', d.label || ' Roadmap', 'project', d.score, 0)
    RETURNING id INTO v_child_id;
    INSERT INTO public.department_projects (node_id, status, description)
    VALUES (v_child_id, 'Planning', 'Seeded from the current BDT mock data') ON CONFLICT (node_id) DO NOTHING;

    INSERT INTO public.department_bdt_nodes (company_id, department_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, d.source_key || ':processes', 'Processes', 'process', greatest(d.score - 6, 0), 2)
    RETURNING id INTO v_group_id;
    INSERT INTO public.department_processes (node_id, description)
    VALUES (v_group_id, d.label || ' operating system') ON CONFLICT (node_id) DO NOTHING;
    INSERT INTO public.department_bdt_nodes (company_id, department_id, parent_node_id, source_key, label, node_type, score, sort_order)
    VALUES (p_company_id, v_department_id, v_group_id, d.source_key || ':health-metric', d.label || ' Health', 'metric', d.score, 0)
    RETURNING id INTO v_child_id;
    INSERT INTO public.department_metric_links (node_id, metric_key, metadata)
    VALUES (v_child_id, 'headcount', jsonb_build_object('seeded', true)) ON CONFLICT (node_id) DO NOTHING;

    v_sort_order := v_sort_order + 1;
  END LOOP;
END;
$$;

DO $$
DECLARE
  c RECORD;
BEGIN
  FOR c IN SELECT id FROM public.companies LOOP
    PERFORM public.seed_default_departments_for_company(c.id);
  END LOOP;
END $$;
