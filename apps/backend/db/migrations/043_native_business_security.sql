-- Native CRM/catalogue records are served only by the authenticated Express API.
-- The baseline grants browser roles broad access for legacy Supabase clients, so
-- explicitly remove direct PostgREST access to this backend-owned domain.

REVOKE ALL PRIVILEGES ON TABLE
  public.crm_accounts,
  public.crm_contacts,
  public.crm_leads,
  public.crm_deals,
  public.catalog_groups,
  public.catalog_products,
  public.inventory_balances,
  public.meta_lead_form_bindings
FROM anon, authenticated;

GRANT ALL PRIVILEGES ON TABLE
  public.crm_accounts,
  public.crm_contacts,
  public.crm_leads,
  public.crm_deals,
  public.catalog_groups,
  public.catalog_products,
  public.inventory_balances,
  public.meta_lead_form_bindings
TO service_role;
