-- Native structured Form nodes. Forms are user-authored resource children of
-- persisted BDT workspaces; their schema is deliberately frozen at first use.
ALTER TABLE public.department_bdt_nodes DROP CONSTRAINT IF EXISTS department_bdt_nodes_node_level_check;
ALTER TABLE public.department_bdt_nodes ADD CONSTRAINT department_bdt_nodes_node_level_check
  CHECK (node_level = ANY (ARRAY['level1','branch','internal','action','form']));

CREATE UNIQUE INDEX IF NOT EXISTS department_bdt_nodes_company_id_id_key ON public.department_bdt_nodes(company_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_id_id_key ON public.company_members(company_id,id);

CREATE TABLE public.bdt_form_nodes (
  node_id uuid PRIMARY KEY,
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  parent_node_id uuid NOT NULL,
  schema_locked_at timestamptz,
  next_record_number bigint NOT NULL DEFAULT 1 CHECK (next_record_number >= 1),
  created_by_member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,node_id),
  FOREIGN KEY(company_id,department_id,node_id) REFERENCES public.department_bdt_nodes(company_id,department_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,parent_node_id) REFERENCES public.department_bdt_nodes(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,created_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX bdt_form_nodes_company_department_parent_idx ON public.bdt_form_nodes(company_id,department_id,parent_node_id);

CREATE TABLE public.bdt_form_fields (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  form_node_id uuid NOT NULL,
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 160),
  field_type text NOT NULL CHECK (field_type IN ('short_text','long_text','number','date','checkbox','single_select','url','email')),
  required boolean NOT NULL DEFAULT false,
  position integer NOT NULL CHECK (position >= 0),
  options jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,form_node_id,position),
  FOREIGN KEY(company_id,form_node_id) REFERENCES public.bdt_form_nodes(company_id,node_id) ON DELETE CASCADE,
  CHECK (jsonb_typeof(options) IS NULL OR jsonb_typeof(options)='array'),
  CHECK ((field_type='single_select' AND options IS NOT NULL AND jsonb_array_length(options) BETWEEN 1 AND 50) OR (field_type<>'single_select' AND options IS NULL))
);
CREATE UNIQUE INDEX bdt_form_fields_case_label_idx ON public.bdt_form_fields(company_id,form_node_id,lower(label));

CREATE TABLE public.bdt_form_records (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  form_node_id uuid NOT NULL,
  record_number bigint NOT NULL CHECK (record_number >= 1),
  values jsonb NOT NULL CHECK (jsonb_typeof(values)='object'),
  created_by_member_id uuid NOT NULL,
  updated_by_member_id uuid NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,form_node_id,record_number),
  FOREIGN KEY(company_id,form_node_id) REFERENCES public.bdt_form_nodes(company_id,node_id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,created_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,updated_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT
);
CREATE INDEX bdt_form_records_node_number_idx ON public.bdt_form_records(company_id,form_node_id,record_number DESC);

CREATE TRIGGER bdt_form_nodes_updated_at BEFORE UPDATE ON public.bdt_form_nodes FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bdt_form_fields_updated_at BEFORE UPDATE ON public.bdt_form_fields FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();
CREATE TRIGGER bdt_form_records_updated_at BEFORE UPDATE ON public.bdt_form_records FOR EACH ROW EXECUTE FUNCTION public.set_updated_at();

REVOKE ALL PRIVILEGES ON TABLE public.bdt_form_nodes, public.bdt_form_fields, public.bdt_form_records FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.bdt_form_nodes, public.bdt_form_fields, public.bdt_form_records TO service_role;
