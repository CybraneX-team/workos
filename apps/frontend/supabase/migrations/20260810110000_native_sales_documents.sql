-- Phase 2: operational quote-to-cash records. These are commercial workflow
-- documents, not an accounting ledger or jurisdiction-specific tax system.

ALTER TABLE public.crm_accounts
  ADD COLUMN billing_email text,
  ADD COLUMN billing_phone text,
  ADD COLUMN billing_address text,
  ADD COLUMN tax_registration text;

CREATE TABLE public.commercial_profiles (
  company_id uuid PRIMARY KEY REFERENCES public.companies(id) ON DELETE CASCADE,
  seller_name text NOT NULL CHECK (length(trim(seller_name)) BETWEEN 1 AND 200),
  seller_email text,
  seller_phone text,
  seller_address text,
  registration_text text,
  tax_registration text,
  quote_prefix text NOT NULL DEFAULT 'Q' CHECK (quote_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  order_prefix text NOT NULL DEFAULT 'SO' CHECK (order_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  invoice_prefix text NOT NULL DEFAULT 'INV' CHECK (invoice_prefix ~ '^[A-Za-z0-9-]{1,10}$'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE public.sales_document_sequences (
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('quote','order','invoice')),
  document_year integer NOT NULL CHECK (document_year BETWEEN 2000 AND 9999),
  next_value integer NOT NULL DEFAULT 1 CHECK (next_value > 0),
  PRIMARY KEY(company_id,document_type,document_year)
);

CREATE TABLE public.sales_quotes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  account_id uuid NOT NULL,
  contact_id uuid,
  deal_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','accepted','rejected','cancelled')),
  issue_date date NOT NULL DEFAULT current_date,
  valid_until date,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(seller_snapshot)='object'),
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(buyer_snapshot)='object'),
  notes text,
  terms text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_name text,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  sent_at timestamptz,
  accepted_at timestamptz,
  rejected_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,document_number),
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,contact_id) REFERENCES public.crm_contacts(company_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY(company_id,deal_id) REFERENCES public.crm_deals(company_id,id) ON DELETE SET NULL (deal_id),
  CHECK (valid_until IS NULL OR valid_until >= issue_date)
);
CREATE INDEX sales_quotes_company_status_idx ON public.sales_quotes(company_id,status,updated_at DESC);
CREATE INDEX sales_quotes_company_account_idx ON public.sales_quotes(company_id,account_id,updated_at DESC);
CREATE INDEX sales_quotes_company_deal_idx ON public.sales_quotes(company_id,deal_id) WHERE deal_id IS NOT NULL;

CREATE TABLE public.sales_quote_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  quote_id uuid NOT NULL,
  product_id uuid,
  position integer NOT NULL CHECK (position >= 0),
  product_code text,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  line_total numeric(18,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,quote_id,position),
  FOREIGN KEY(company_id,quote_id) REFERENCES public.sales_quotes(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,product_id) REFERENCES public.catalog_products(company_id,id) ON DELETE SET NULL (product_id)
);

CREATE TABLE public.sales_orders (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  quote_id uuid,
  account_id uuid NOT NULL,
  contact_id uuid,
  deal_id uuid,
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','confirmed','cancelled')),
  issue_date date NOT NULL DEFAULT current_date,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(seller_snapshot)='object'),
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(buyer_snapshot)='object'),
  notes text,
  terms text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_name text,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  confirmed_at timestamptz,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,document_number),
  UNIQUE(company_id,quote_id),
  FOREIGN KEY(company_id,quote_id) REFERENCES public.sales_quotes(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,contact_id) REFERENCES public.crm_contacts(company_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY(company_id,deal_id) REFERENCES public.crm_deals(company_id,id) ON DELETE SET NULL (deal_id)
);
CREATE INDEX sales_orders_company_status_idx ON public.sales_orders(company_id,status,updated_at DESC);
CREATE INDEX sales_orders_company_account_idx ON public.sales_orders(company_id,account_id,updated_at DESC);

CREATE TABLE public.sales_order_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  order_id uuid NOT NULL,
  product_id uuid,
  position integer NOT NULL CHECK (position >= 0),
  product_code text,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  line_total numeric(18,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,order_id,position),
  FOREIGN KEY(company_id,order_id) REFERENCES public.sales_orders(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,product_id) REFERENCES public.catalog_products(company_id,id) ON DELETE SET NULL (product_id)
);

CREATE TABLE public.sales_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  document_number text NOT NULL,
  order_id uuid,
  account_id uuid NOT NULL,
  contact_id uuid,
  deal_id uuid,
  state text NOT NULL DEFAULT 'draft' CHECK (state IN ('draft','issued','void')),
  issue_date date NOT NULL DEFAULT current_date,
  due_date date,
  currency text NOT NULL CHECK (currency ~ '^[A-Z]{3}$'),
  seller_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(seller_snapshot)='object'),
  buyer_snapshot jsonb NOT NULL DEFAULT '{}'::jsonb CHECK (jsonb_typeof(buyer_snapshot)='object'),
  notes text,
  terms text,
  subtotal numeric(18,2) NOT NULL DEFAULT 0 CHECK (subtotal >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  discount_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (discount_amount >= 0),
  tax_name text,
  tax_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (tax_rate BETWEEN 0 AND 100),
  tax_amount numeric(18,2) NOT NULL DEFAULT 0 CHECK (tax_amount >= 0),
  total numeric(18,2) NOT NULL DEFAULT 0 CHECK (total >= 0),
  issued_at timestamptz,
  voided_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,document_number),
  UNIQUE(company_id,order_id),
  FOREIGN KEY(company_id,order_id) REFERENCES public.sales_orders(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,account_id) REFERENCES public.crm_accounts(company_id,id) ON DELETE RESTRICT,
  FOREIGN KEY(company_id,contact_id) REFERENCES public.crm_contacts(company_id,id) ON DELETE SET NULL (contact_id),
  FOREIGN KEY(company_id,deal_id) REFERENCES public.crm_deals(company_id,id) ON DELETE SET NULL (deal_id),
  CHECK (due_date IS NULL OR due_date >= issue_date)
);
CREATE INDEX sales_invoices_company_state_idx ON public.sales_invoices(company_id,state,updated_at DESC);
CREATE INDEX sales_invoices_company_due_idx ON public.sales_invoices(company_id,due_date) WHERE state='issued';
CREATE INDEX sales_invoices_company_account_idx ON public.sales_invoices(company_id,account_id,updated_at DESC);

CREATE TABLE public.sales_invoice_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  product_id uuid,
  position integer NOT NULL CHECK (position >= 0),
  product_code text,
  name text NOT NULL CHECK (length(trim(name)) BETWEEN 1 AND 200),
  description text,
  unit text NOT NULL DEFAULT 'unit',
  quantity numeric(18,4) NOT NULL CHECK (quantity > 0),
  unit_price numeric(18,2) NOT NULL CHECK (unit_price >= 0),
  discount_rate numeric(5,2) NOT NULL DEFAULT 0 CHECK (discount_rate BETWEEN 0 AND 100),
  line_total numeric(18,2) NOT NULL CHECK (line_total >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  UNIQUE(company_id,invoice_id,position),
  FOREIGN KEY(company_id,invoice_id) REFERENCES public.sales_invoices(company_id,id) ON DELETE CASCADE,
  FOREIGN KEY(company_id,product_id) REFERENCES public.catalog_products(company_id,id) ON DELETE SET NULL (product_id)
);

CREATE TABLE public.sales_invoice_payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid NOT NULL REFERENCES public.companies(id) ON DELETE CASCADE,
  invoice_id uuid NOT NULL,
  amount numeric(18,2) NOT NULL CHECK (amount > 0),
  paid_on date NOT NULL DEFAULT current_date,
  method text CHECK (method IS NULL OR method IN ('cash','bank','card','other')),
  reference text,
  note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(company_id,id),
  FOREIGN KEY(company_id,invoice_id) REFERENCES public.sales_invoices(company_id,id) ON DELETE CASCADE
);
CREATE INDEX sales_invoice_payments_invoice_idx ON public.sales_invoice_payments(company_id,invoice_id,paid_on DESC,created_at DESC);

REVOKE ALL PRIVILEGES ON TABLE
  public.commercial_profiles,
  public.sales_document_sequences,
  public.sales_quotes,
  public.sales_quote_items,
  public.sales_orders,
  public.sales_order_items,
  public.sales_invoices,
  public.sales_invoice_items,
  public.sales_invoice_payments
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.commercial_profiles,
  public.sales_document_sequences,
  public.sales_quotes,
  public.sales_quote_items,
  public.sales_orders,
  public.sales_order_items,
  public.sales_invoices,
  public.sales_invoice_items,
  public.sales_invoice_payments
TO service_role;
