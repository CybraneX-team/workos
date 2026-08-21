-- A Supercycle is a company-scoped representation of existing BDT departments
-- and level-one workspace nodes. It never creates a second department tree.
-- Older deployed schemas predate these composite tenant keys. They are needed
-- for every company-safe foreign key declared below.
CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_id_id_key ON public.company_members(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS departments_company_id_id_key ON public.departments(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS department_bdt_nodes_company_department_id_key ON public.department_bdt_nodes(company_id,department_id,id);

CREATE TABLE public.bdt_supercycle_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL UNIQUE REFERENCES public.companies(id) ON DELETE CASCADE,
  created_by_member_id uuid NOT NULL,
  updated_by_member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,created_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,updated_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT
);

CREATE TABLE public.bdt_supercycle_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  config_id uuid NOT NULL,
  department_id uuid NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  UNIQUE(company_id,id),
  UNIQUE(company_id,id,department_id),
  UNIQUE(company_id,config_id,id),
  UNIQUE(config_id,department_id),
  UNIQUE(config_id,sort_order),
  FOREIGN KEY(company_id,config_id) REFERENCES public.bdt_supercycle_configs(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,department_id) REFERENCES public.departments(company_id,id) ON DELETE CASCADE
);

CREATE TABLE public.bdt_supercycle_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  supercycle_department_id uuid NOT NULL,
  department_id uuid NOT NULL,
  node_id uuid NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  UNIQUE(company_id,id),
  UNIQUE(supercycle_department_id,node_id),
  UNIQUE(supercycle_department_id,sort_order),
  FOREIGN KEY(company_id,supercycle_department_id,department_id) REFERENCES public.bdt_supercycle_departments(company_id,id,department_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,department_id,node_id) REFERENCES public.department_bdt_nodes(company_id,department_id,id) ON DELETE CASCADE
);

-- Routes are visual paths over the selected real departments. They are not
-- workflows: overlapping membership is intentional and does not create state.
CREATE TABLE public.bdt_supercycle_routes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  config_id uuid NOT NULL,
  label text NOT NULL CHECK (char_length(btrim(label)) BETWEEN 1 AND 80),
  color text NOT NULL CHECK (color ~ '^#[0-9A-Fa-f]{6}$'),
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,config_id,id),
  UNIQUE(config_id,sort_order),
  FOREIGN KEY(company_id,config_id) REFERENCES public.bdt_supercycle_configs(company_id,id) ON DELETE CASCADE
);

CREATE TABLE public.bdt_supercycle_route_departments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL,
  config_id uuid NOT NULL,
  route_id uuid NOT NULL,
  supercycle_department_id uuid NOT NULL,
  sort_order integer NOT NULL CHECK (sort_order >= 0),
  UNIQUE(company_id,id),
  UNIQUE(route_id,supercycle_department_id),
  UNIQUE(route_id,sort_order),
  FOREIGN KEY(company_id,config_id,route_id) REFERENCES public.bdt_supercycle_routes(company_id,config_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,config_id,supercycle_department_id) REFERENCES public.bdt_supercycle_departments(company_id,config_id,id) ON DELETE CASCADE
);

CREATE INDEX bdt_supercycle_departments_config_order_idx ON public.bdt_supercycle_departments(config_id,sort_order);
CREATE INDEX bdt_supercycle_nodes_member_order_idx ON public.bdt_supercycle_nodes(supercycle_department_id,sort_order);
CREATE INDEX bdt_supercycle_routes_config_order_idx ON public.bdt_supercycle_routes(config_id,sort_order);
CREATE UNIQUE INDEX bdt_supercycle_routes_config_label_key ON public.bdt_supercycle_routes(config_id,lower(label));
CREATE INDEX bdt_supercycle_route_departments_route_order_idx ON public.bdt_supercycle_route_departments(route_id,sort_order);
CREATE TRIGGER bdt_supercycle_configs_updated_at BEFORE UPDATE ON public.bdt_supercycle_configs FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bdt_supercycle_routes_updated_at BEFORE UPDATE ON public.bdt_supercycle_routes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

CREATE OR REPLACE FUNCTION public.prune_empty_bdt_supercycle_department() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  DELETE FROM public.bdt_supercycle_departments member
   WHERE member.company_id=OLD.company_id AND member.id=OLD.supercycle_department_id
     AND NOT EXISTS (SELECT 1 FROM public.bdt_supercycle_nodes node WHERE node.supercycle_department_id=member.id);
  RETURN OLD;
END;
$$;
CREATE TRIGGER bdt_supercycle_nodes_prune_empty_department
  AFTER DELETE ON public.bdt_supercycle_nodes
  FOR EACH ROW EXECUTE FUNCTION public.prune_empty_bdt_supercycle_department();

-- A configuration made before routes were introduced is represented by the
-- same single ordered route it previously drew. This makes the schema change
-- safe for disposable local configurations without inventing new BDT records.
INSERT INTO public.bdt_supercycle_routes(company_id,config_id,label,color,sort_order)
SELECT config.company_id,config.id,'Primary route','#67e8f9',0
  FROM public.bdt_supercycle_configs config
 WHERE EXISTS (SELECT 1 FROM public.bdt_supercycle_departments member WHERE member.config_id=config.id)
   AND NOT EXISTS (SELECT 1 FROM public.bdt_supercycle_routes route WHERE route.config_id=config.id);

INSERT INTO public.bdt_supercycle_route_departments(company_id,config_id,route_id,supercycle_department_id,sort_order)
SELECT member.company_id,member.config_id,route.id,member.id,member.sort_order
  FROM public.bdt_supercycle_departments member
  JOIN public.bdt_supercycle_routes route ON route.company_id=member.company_id AND route.config_id=member.config_id AND route.sort_order=0
 WHERE NOT EXISTS (SELECT 1 FROM public.bdt_supercycle_route_departments route_member WHERE route_member.route_id=route.id);

REVOKE ALL PRIVILEGES ON TABLE public.bdt_supercycle_configs, public.bdt_supercycle_departments, public.bdt_supercycle_nodes, public.bdt_supercycle_routes, public.bdt_supercycle_route_departments FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.bdt_supercycle_configs, public.bdt_supercycle_departments, public.bdt_supercycle_nodes, public.bdt_supercycle_routes, public.bdt_supercycle_route_departments TO service_role;
