import { api } from '../api';

export type SalesKind = 'quotes' | 'orders' | 'invoices';
export type SalesLine = { id?:string; product_id:string|null; product_code:string|null; name:string; description:string|null; unit:string; quantity:number|string; unit_price:number|string; discount_rate:number|string; line_total:number|string };
export type SalesPayment = { id:string; amount:number|string; paid_on:string; method:'cash'|'bank'|'card'|'other'|null; reference:string|null; note:string|null };
export type SalesDocument = {
  id:string; document_number:string; account_id:string; account_name?:string; contact_id:string|null; deal_id:string|null;
  quote_id?:string|null; order_id?:string|null; status:string; state?:string; issue_date:string; valid_until?:string|null; due_date?:string|null;
  currency:string; seller_snapshot:Record<string,string|null>; buyer_snapshot:Record<string,string|null>; notes:string|null; terms:string|null;
  subtotal:number|string; discount_rate:number|string; discount_amount:number|string; tax_name:string|null; tax_rate:number|string; tax_amount:number|string; total:number|string;
  paid_amount?:number|string; balance?:number|string; items?:SalesLine[]; payments?:SalesPayment[];
};
export type SalesProfile = { seller_name:string; seller_email:string|null; seller_phone:string|null; seller_address:string|null; registration_text:string|null; tax_registration:string|null; quote_prefix:string; order_prefix:string; invoice_prefix:string };
export type SalesSummary = { generatedAt:string; metrics:{open_quote_value:number;confirmed_bookings:number;invoiced_amount:number;collected_amount:number;outstanding_balance:number;overdue_count:number;quote_count:number;order_count:number;invoice_count:number} };
export type SalesDocumentBody = {
  accountId:string; contactId?:string|null; dealId?:string|null; issueDate:string; validUntil?:string|null; dueDate?:string|null; currency:string;
  notes?:string|null; terms?:string|null; discountRate:number; taxName?:string|null; taxRate:number;
  seller?:Record<string,string|null>; buyer?:Record<string,string|null>;
  items:Array<{productId?:string|null;name?:string;description?:string|null;unit?:string;quantity:number;unitPrice?:number;discountRate:number}>;
};

const path = (kind:SalesKind,id?:string) => `/api/sales/${kind}${id?`/${id}`:''}`;
export const salesDocuments = {
  list: (kind:SalesKind) => api.get<{items:SalesDocument[];total:number}>(path(kind)),
  get: (kind:SalesKind,id:string) => api.get<SalesDocument>(path(kind,id)),
  create: (kind:SalesKind,body:SalesDocumentBody) => api.post<SalesDocument>(path(kind),body),
  update: (kind:SalesKind,id:string,body:SalesDocumentBody) => api.put<SalesDocument>(path(kind,id),body),
  remove: (kind:SalesKind,id:string) => api.delete<void>(path(kind,id)),
  action: (kind:SalesKind,id:string,action:string) => api.post<SalesDocument>(`${path(kind,id)}/${action}`,{}),
  payments: (invoiceId:string) => api.get<{items:SalesPayment[];total:number}>(`${path('invoices',invoiceId)}/payments`),
  addPayment: (invoiceId:string,body:object) => api.post<SalesPayment>(`${path('invoices',invoiceId)}/payments`,body),
  removePayment: (invoiceId:string,paymentId:string) => api.delete<void>(`${path('invoices',invoiceId)}/payments/${paymentId}`),
  summary: () => api.get<SalesSummary>('/api/sales/summary'),
  profile: () => api.get<SalesProfile>('/api/sales/profile'),
  saveProfile: (body:object) => api.put<SalesProfile>('/api/sales/profile',body),
  downloadPdf: async (kind:SalesKind,document:Pick<SalesDocument,'id'|'document_number'>) => {
    const blob = await api.getBlob(`${path(kind,document.id)}/pdf`);
    const url = URL.createObjectURL(blob); const anchor = window.document.createElement('a');
    anchor.href=url; anchor.download=`${document.document_number}.pdf`; anchor.click(); URL.revokeObjectURL(url);
  },
};
