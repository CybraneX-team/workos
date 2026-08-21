import { api } from '../api';

export type Account = { id:string; name:string; lifecycle:'prospect'|'customer'|'inactive'; industry:string|null; territory:string|null; market_segment:string|null; employee_count:number|null; annual_revenue:number|null; billing_email:string|null; billing_phone:string|null; billing_address:string|null; tax_registration:string|null };
export type Contact = { id:string; account_id:string|null; first_name:string; last_name:string|null; email:string|null; phone:string|null; title:string|null };
export type Lead = { id:string; account_id:string|null; contact_id:string|null; name:string; email:string|null; phone:string|null; source:string|null; status:'new'|'contacted'|'qualified'|'converted'|'disqualified' };
export type Deal = { id:string; account_id:string; primary_contact_id:string|null; name:string; stage:'qualification'|'discovery'|'proposal'|'negotiation'|'won'|'lost'; value:number; currency:string; probability:number; expected_close_date:string|null; lost_reason:string|null };
export type CatalogGroup = { id:string; parent_id:string|null; name:string };
export type CatalogProduct = { id:string; group_id:string|null; code:string; name:string; description:string|null; unit:string; active:boolean; price_amount:number|null; currency:string|null; stock_quantity?:number; priced?:boolean };
export type InventoryBalance = { id:string; product_id:string; warehouse_name:string; quantity:number; product_code:string; product_name:string };
export type ListResult<T> = { items:T[]; total:number };
export type CrmSummary = { metrics:{accountCount:number;leadCount:number;dealCount:number;openPipelineValue:number;conversionRate:number}; accounts:Array<{lifecycle:string;count:number}>; accountSegments:Array<{industry:string;territory:string;count:number}>; leads:Array<{status:string;count:number}>; deals:Array<{stage:string;count:number;value:number}>; recent:Array<{id:string;name:string;kind:'lead'|'deal';stage:string|null;status:string|null;value:number|null;updated_at:string}>; recommendations:Array<{code:string;label:string;detail:string}> };
export type CatalogTreeNode = CatalogGroup & { children:CatalogTreeNode[]; products:CatalogProduct[] };
export type CatalogPortfolio = { status:'ready'|'empty'; generatedAt:string; groups:CatalogGroup[]; products:CatalogProduct[]; tree:CatalogTreeNode[] };
export type CatalogReadiness = { entity:'group'|'product'; id:string; metrics:{products:number;enabled:number;active:number;priced:number;unpriced:number;lowStock:number;zeroStock:number}; signals:Array<{productId:string;severity:'warning'|'info';label:string}> };

export const nativeBusiness = {
  accounts: () => api.get<ListResult<Account>>('/api/crm/accounts'),
  contacts: () => api.get<ListResult<Contact>>('/api/crm/contacts'),
  leads: () => api.get<ListResult<Lead>>('/api/crm/leads'),
  deals: () => api.get<ListResult<Deal>>('/api/crm/deals'),
  summary: () => api.get<CrmSummary>('/api/crm/summary'),
  createAccount: (body:object) => api.post<Account>('/api/crm/accounts',body),
  updateAccount: (id:string,body:object) => api.patch<Account>(`/api/crm/accounts/${id}`,body),
  deleteAccount: (id:string) => api.delete<void>(`/api/crm/accounts/${id}`),
  createContact: (body:object) => api.post<Contact>('/api/crm/contacts',body),
  updateContact: (id:string,body:object) => api.patch<Contact>(`/api/crm/contacts/${id}`,body),
  deleteContact: (id:string) => api.delete<void>(`/api/crm/contacts/${id}`),
  createLead: (body:object) => api.post<Lead>('/api/crm/leads',body),
  updateLead: (id:string,body:object) => api.patch<Lead>(`/api/crm/leads/${id}`,body),
  deleteLead: (id:string) => api.delete<void>(`/api/crm/leads/${id}`),
  convertLead: (id:string,body:object) => api.post(`/api/crm/leads/${id}/convert`,body),
  createDeal: (body:object) => api.post<Deal>('/api/crm/deals',body),
  updateDeal: (id:string,body:object) => api.patch<Deal>(`/api/crm/deals/${id}`,body),
  deleteDeal: (id:string) => api.delete<void>(`/api/crm/deals/${id}`),
  stageDeal: (id:string,body:object) => api.patch<Deal>(`/api/crm/deals/${id}/stage`,body),
  groups: () => api.get<ListResult<CatalogGroup>>('/api/catalog/groups'),
  products: () => api.get<ListResult<CatalogProduct>>('/api/catalog/products'),
  inventory: () => api.get<ListResult<InventoryBalance>>('/api/catalog/inventory'),
  portfolio: () => api.get<CatalogPortfolio>('/api/catalog/portfolio'),
  readiness: (entity:'group'|'product',id:string) => api.get<CatalogReadiness>(`/api/catalog/readiness?entity=${entity}&id=${encodeURIComponent(id)}`),
  createGroup: (body:object) => api.post<CatalogGroup>('/api/catalog/groups',body),
  updateGroup: (id:string,body:object) => api.patch<CatalogGroup>(`/api/catalog/groups/${id}`,body),
  deleteGroup: (id:string) => api.delete<void>(`/api/catalog/groups/${id}`),
  createProduct: (body:object) => api.post<CatalogProduct>('/api/catalog/products',body),
  updateProduct: (id:string,body:object) => api.patch<CatalogProduct>(`/api/catalog/products/${id}`,body),
  deleteProduct: (id:string) => api.delete<void>(`/api/catalog/products/${id}`),
  setInventory: (body:object) => api.put<InventoryBalance>('/api/catalog/inventory',body),
};
