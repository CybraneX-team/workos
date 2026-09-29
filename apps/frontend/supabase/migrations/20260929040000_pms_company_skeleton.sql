-- Phase 1 — Per-company EDITABLE supercycle skeleton.
--
-- The catalogue in pms_archetype_templates (Phase 0) is only a seed source.
-- Each company gets its own copy of the skeleton here, which it then owns and
-- can rename / add to / remove. Seeding happens lazily in the backend the first
-- time a company touches the supercycle (see routes/pmsSupercycle.ts).
--
-- Stable client ids (NOT the uuid PKs) are what cycles / department cycles /
-- instances reference, so they match the frontend's existing string ids:
--   node.client_id      e.g. 'product'
--   subnode.client_id   e.g. 'product_core_product'
--   stage.client_id     e.g. 'Build'   (stage label doubles as its id today)
--
-- Additive: nothing writes to these tables yet except the lazy seeder; the GET
-- route reads them back to hand the frontend a DB-driven skeleton.

-- Department nodes (the 5 planets on the ring) --------------------------------
CREATE TABLE public.pms_sc_nodes (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id      uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  archetype_id    text NOT NULL
    CHECK (archetype_id IN ('b2b_saas','deep_tech','d2c','manufacturing','consulting','education')),
  client_id       text NOT NULL,                 -- e.g. 'product'
  label           text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  color           text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  slot            integer NOT NULL DEFAULT 0 CHECK (slot BETWEEN 0 AND 4),
  sub_cycle_label text NOT NULL DEFAULT '',
  position        integer NOT NULL DEFAULT 0,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id, archetype_id, client_id)
);
CREATE INDEX pms_sc_nodes_company_arch_idx ON public.pms_sc_nodes(company_id, archetype_id);

-- Sub-nodes (major responsibilities inside a node) ----------------------------
CREATE TABLE public.pms_sc_subnodes (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  node_id     uuid NOT NULL REFERENCES public.pms_sc_nodes(id) ON DELETE CASCADE,
  client_id   text NOT NULL,                      -- e.g. 'product_core_product'
  label       text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(node_id, client_id)
);
CREATE INDEX pms_sc_subnodes_node_idx ON public.pms_sc_subnodes(node_id);
CREATE INDEX pms_sc_subnodes_company_idx ON public.pms_sc_subnodes(company_id);

-- Stages (the ordered loop inside a node's sub-cycle, e.g. Build) --------------
CREATE TABLE public.pms_sc_stages (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id  uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  node_id     uuid NOT NULL REFERENCES public.pms_sc_nodes(id) ON DELETE CASCADE,
  client_id   text NOT NULL,                      -- e.g. 'Build' (label is the id today)
  label       text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  position    integer NOT NULL DEFAULT 0,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE(node_id, client_id)
);
CREATE INDEX pms_sc_stages_node_idx ON public.pms_sc_stages(node_id);
CREATE INDEX pms_sc_stages_company_idx ON public.pms_sc_stages(company_id);

-- updated_at triggers ---------------------------------------------------------
CREATE TRIGGER pms_sc_nodes_updated_at BEFORE UPDATE ON public.pms_sc_nodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pms_sc_subnodes_updated_at BEFORE UPDATE ON public.pms_sc_subnodes
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER pms_sc_stages_updated_at BEFORE UPDATE ON public.pms_sc_stages
  FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

-- Backend-only (service role); browser roles denied. --------------------------
REVOKE ALL PRIVILEGES ON TABLE
  public.pms_sc_nodes, public.pms_sc_subnodes, public.pms_sc_stages
  FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE
  public.pms_sc_nodes, public.pms_sc_subnodes, public.pms_sc_stages
  TO service_role;
