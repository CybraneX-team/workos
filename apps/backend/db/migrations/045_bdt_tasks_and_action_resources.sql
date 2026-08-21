-- Shared BDT tasks and information resources. This migration replaces the
-- uncommitted commercial-only task migration; local development data is reset.
CREATE UNIQUE INDEX IF NOT EXISTS department_bdt_nodes_company_department_id_key ON public.department_bdt_nodes(company_id,department_id,id);
CREATE UNIQUE INDEX IF NOT EXISTS company_members_company_id_id_key ON public.company_members(company_id,id);

CREATE TABLE public.bdt_tasks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  node_id uuid NOT NULL,
  title text NOT NULL CHECK (length(trim(title)) BETWEEN 1 AND 160),
  instructions text,
  priority text NOT NULL DEFAULT 'normal' CHECK (priority IN ('low','normal','high')),
  status text NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','in_progress','blocked','done','cancelled')),
  assignee_member_id uuid NOT NULL,
  assigned_by_member_id uuid NOT NULL,
  work_note text,
  blocked_reason text,
  completed_at timestamptz,
  cancelled_at timestamptz,
  cancellation_reason text,
  due_on date,
  related_record_type text CHECK (related_record_type IN ('product','account','lead','deal','quote','order','invoice')),
  related_record_label text,
  product_id uuid, account_id uuid, lead_id uuid, deal_id uuid, quote_id uuid, order_id uuid, invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(), updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,department_id,node_id) REFERENCES public.department_bdt_nodes(company_id,department_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,assignee_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,assigned_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,product_id) REFERENCES public.catalog_products(company_id,id) ON DELETE SET NULL (product_id),
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE SET NULL (account_id),
  FOREIGN KEY(company_id,lead_id) REFERENCES public.crm_leads(company_id,id) ON DELETE SET NULL (lead_id),
  FOREIGN KEY(company_id,deal_id) REFERENCES public.crm_deals(company_id,id) ON DELETE SET NULL (deal_id),
  FOREIGN KEY(company_id,quote_id) REFERENCES public.sales_quotes(company_id,id) ON DELETE SET NULL (quote_id),
  FOREIGN KEY(company_id,order_id) REFERENCES public.sales_orders(company_id,id) ON DELETE SET NULL (order_id),
  FOREIGN KEY(company_id,invoice_id) REFERENCES public.sales_invoices(company_id,id) ON DELETE SET NULL (invoice_id),
  CHECK (num_nonnulls(product_id,account_id,lead_id,deal_id,quote_id,order_id,invoice_id) <= 1),
  CHECK ((status = 'blocked') = (blocked_reason IS NOT NULL AND length(trim(blocked_reason)) > 0)),
  CHECK ((status = 'done') = (completed_at IS NOT NULL)),
  CHECK ((status = 'cancelled') = (cancelled_at IS NOT NULL AND cancellation_reason IS NOT NULL AND length(trim(cancellation_reason)) > 0))
);
CREATE INDEX bdt_tasks_company_node_status_idx ON public.bdt_tasks(company_id,node_id,status,created_at DESC);
CREATE INDEX bdt_tasks_assignee_status_idx ON public.bdt_tasks(company_id,assignee_member_id,status,due_on);

CREATE TABLE public.bdt_action_resources (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  department_id uuid NOT NULL,
  node_id uuid NOT NULL,
  kind text NOT NULL CHECK (kind IN ('file','link')),
  label text NOT NULL CHECK (length(trim(label)) BETWEEN 1 AND 255),
  created_by_member_id uuid NOT NULL,
  storage_path text,
  original_name text,
  mime_type text,
  byte_size integer,
  checksum text,
  external_url text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,department_id,node_id) REFERENCES public.department_bdt_nodes(company_id,department_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,created_by_member_id) REFERENCES public.company_members(company_id,id) ON DELETE RESTRICT,
  CHECK ((kind='file' AND storage_path IS NOT NULL AND original_name IS NOT NULL AND mime_type IS NOT NULL AND byte_size IS NOT NULL AND checksum IS NOT NULL AND external_url IS NULL)
      OR (kind='link' AND external_url IS NOT NULL AND storage_path IS NULL AND original_name IS NULL AND mime_type IS NULL AND byte_size IS NULL AND checksum IS NULL)),
  CHECK (byte_size IS NULL OR byte_size > 0),
  CHECK (external_url IS NULL OR external_url ~ '^https://')
);
CREATE UNIQUE INDEX bdt_action_resources_file_checksum_idx ON public.bdt_action_resources(company_id,node_id,checksum) WHERE kind='file';
CREATE INDEX bdt_action_resources_node_idx ON public.bdt_action_resources(company_id,node_id,created_at);

CREATE OR REPLACE FUNCTION public.cancel_removed_member_bdt_tasks() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF OLD.status = 'active' AND NEW.status = 'removed' THEN
    UPDATE public.bdt_tasks SET status='cancelled', cancelled_at=now(), cancellation_reason='assignee_removed', blocked_reason=NULL, completed_at=NULL, updated_at=now()
      WHERE company_id=NEW.company_id AND assignee_member_id=NEW.id AND status IN ('todo','in_progress','blocked');
  END IF;
  RETURN NEW;
END;
$$;
DROP TRIGGER IF EXISTS commercial_tasks_cancel_removed_member ON public.company_members;
DROP TRIGGER IF EXISTS bdt_tasks_cancel_removed_member ON public.company_members;
CREATE TRIGGER bdt_tasks_cancel_removed_member AFTER UPDATE OF status ON public.company_members FOR EACH ROW EXECUTE FUNCTION public.cancel_removed_member_bdt_tasks();

REVOKE ALL PRIVILEGES ON TABLE public.bdt_tasks FROM anon, authenticated;
REVOKE ALL PRIVILEGES ON TABLE public.bdt_action_resources FROM anon, authenticated;
GRANT ALL PRIVILEGES ON TABLE public.bdt_tasks TO service_role;
GRANT ALL PRIVILEGES ON TABLE public.bdt_action_resources TO service_role;

DO $$ BEGIN
  IF to_regclass('storage.buckets') IS NOT NULL THEN
    INSERT INTO storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
    VALUES ('bdt-action-resources','bdt-action-resources',FALSE,26214400,NULL)
    ON CONFLICT (id) DO UPDATE SET public=FALSE,file_size_limit=EXCLUDED.file_size_limit,allowed_mime_types=EXCLUDED.allowed_mime_types;
  END IF;
END $$;
