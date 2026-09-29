-- Item 1.1 — Supercycle persistence.
-- Moves the Supercycle screen's data (selected archetype, value cycles,
-- department sub-cycles, live instances) out of browser localStorage
-- (key `workos_pms_v1:<companyId>`) into company-scoped Postgres.
--
-- This backend is intentionally AGNOSTIC to the archetype catalogue: it stores
-- whatever the client sends (archetype id + node ids as text) and returns it.
-- Defaults are still generated client-side, so a company that never edited
-- anything self-seeds the server on first load. No seeding logic lives here.
--
-- Node/department ids here are the archetype template node ids (e.g. 'sales',
-- 'finance') — NOT public.departments UUIDs. This matches the frontend model.

-- Selected archetype per company -------------------------------------------------
CREATE TABLE public.pms_supercycle_settings (
  company_id   uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  archetype_id text NOT NULL DEFAULT 'b2b_saas'
    CHECK (archetype_id IN ('b2b_saas','deep_tech','d2c','manufacturing','consulting','education')),
  created_at   timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now()
);

-- Value cycles (the coloured rings/routes the user sees & edits) -----------------
CREATE TABLE public.pms_supercycle_cycles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id      text NOT NULL,                 -- the id the frontend uses (e.g. cycle_default_b2b_saas / cycle_...)
  archetype_id   text NOT NULL
    CHECK (archetype_id IN ('b2b_saas','deep_tech','d2c','manufacturing','consulting','education')),
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color          text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  department_ids text[] NOT NULL DEFAULT '{}',  -- archetype node ids
  sub_node_ids   text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, client_id)
);
CREATE INDEX pms_supercycle_cycles_company_arch_idx
  ON public.pms_supercycle_cycles(company_id, archetype_id);

-- Nested department sub-cycles --------------------------------------------------
CREATE TABLE public.pms_supercycle_department_cycles (
  id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id     uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id      text NOT NULL,
  archetype_id   text NOT NULL
    CHECK (archetype_id IN ('b2b_saas','deep_tech','d2c','manufacturing','consulting','education')),
  department_id  text NOT NULL,                 -- archetype node id
  name           text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  color          text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  stage_ids      text[] NOT NULL DEFAULT '{}',
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, client_id)
);
CREATE INDEX pms_supercycle_dept_cycles_company_arch_idx
  ON public.pms_supercycle_department_cycles(company_id, archetype_id);

-- Live execution instances placed on the ring -----------------------------------
CREATE TABLE public.pms_supercycle_instances (
  id                 uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id         uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  client_id          text NOT NULL,
  name               text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 160),
  department_node_id text NOT NULL,
  sub_node_id        text,
  template_id        text NOT NULL,
  stage_index        integer NOT NULL DEFAULT 0 CHECK (stage_index >= 0),
  status             text NOT NULL DEFAULT 'active'
    CHECK (status IN ('active','paused','completed')),
  object_type        text
    CHECK (object_type IS NULL OR object_type IN ('customer','opportunity','product','programme','contract','campaign')),
  object_id          text,
  created_at         timestamptz NOT NULL DEFAULT now(),
  updated_at         timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, client_id)
);
CREATE INDEX pms_supercycle_instances_company_idx
  ON public.pms_supercycle_instances(company_id);

-- updated_at triggers (public.set_updated_at already exists in this schema) -------
CREATE TRIGGER pms_supercycle_settings_updated_at BEFORE UPDATE ON public.pms_supercycle_settings
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pms_supercycle_cycles_updated_at BEFORE UPDATE ON public.pms_supercycle_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pms_supercycle_department_cycles_updated_at BEFORE UPDATE ON public.pms_supercycle_department_cycles
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pms_supercycle_instances_updated_at BEFORE UPDATE ON public.pms_supercycle_instances
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Native business tables are backend-only (service role). Deny browser roles. ----
REVOKE ALL PRIVILEGES ON TABLE
  public.pms_supercycle_settings,
  public.pms_supercycle_cycles,
  public.pms_supercycle_department_cycles,
  public.pms_supercycle_instances
  FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.pms_supercycle_settings,
  public.pms_supercycle_cycles,
  public.pms_supercycle_department_cycles,
  public.pms_supercycle_instances
  TO service_role;
