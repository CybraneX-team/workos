import type { RecordFilter } from '@cybranex/erpnext-contracts';
import { queryRecords } from '../lib/erpnextControlPlane.js';

// Compatibility handle used by existing WorkOS projections. It contains only safe
// tenant metadata; Frappe credentials stay inside the control-plane.
export interface ErpNextCreds { companyId: string; siteName: string; deskUrl?: string; siteUrl: string }
export interface ErpNextGenericRecord { name: string; status?: string | null; docstatus?: number | null; modified?: string | null; creation?: string | null; [key: string]: string | number | null | undefined }

async function read<T>(creds: ErpNextCreds, doctype: string, fields: string[], filters: RecordFilter[] = [], limit = 50, pageSize = 1000): Promise<T[]> {
  const [result] = await queryRecords(creds.companyId, [{ id: 'read', doctype, fields: Array.from(new Set(['name', ...fields])), filters, limit, pageSize }]);
  if (!result || !result.ok) throw new Error(result?.error.message ?? 'erpnext_read_failed');
  return result.rows as T[];
}

export function getErpNextRecords(creds: ErpNextCreds, resource: string, fields: string[], limit = 50, filters: unknown[] = [], maxLimit = 100) {
  return read<ErpNextGenericRecord>(creds, resource, fields, filters as RecordFilter[], Math.max(1, Math.min(maxLimit, limit)), maxLimit);
}

function fuzzyLike(term: string) { return `%${term.trim().split(/\s+/).filter(Boolean).join('%')}%`; }
export interface StockBalance { item_code: string; warehouse: string; actual_qty: number }
export interface ItemSummary { item_code: string; item_name: string; stock_uom: string }
export interface WarehouseSummary { name: string; warehouse_name: string | null; is_group: 0 | 1; disabled: 0 | 1 }
export interface MaterialRequestSummary { name: string; status: string | null; material_request_type: string | null; transaction_date: string | null; schedule_date: string | null }
export interface PurchaseOrderSummary { name: string; status: string | null; supplier: string | null; transaction_date: string | null; grand_total: number | null }
export interface PurchaseReceiptSummary { name: string; status: string | null; supplier: string | null; posting_date: string | null; grand_total: number | null }
export interface DeliveryNoteSummary { name: string; status: string | null; customer: string | null; posting_date: string | null; grand_total: number | null }
export interface PickListSummary { name: string; status: string | null; purpose: string | null; modified: string | null }
export interface ShipmentSummary { name: string; status: string | null; modified: string | null }
// Leads/deals live in Frappe CRM (CRM Lead / CRM Deal), not the native ERPNext
// Lead/Opportunity doctypes. Field names differ accordingly.
export interface LeadSummary { name: string; lead_name: string; organization: string | null; status: string; email: string | null }
export interface OpportunitySummary { name: string; organization: string; deal_value: number; probability: number; status: string }
export interface CustomerSummary { name: string; customer_name: string; customer_group: string | null; territory: string | null }

export function getStockBalance(creds: ErpNextCreds, itemCode?: string, warehouse?: string) { const filters: RecordFilter[] = []; if (itemCode?.trim()) filters.push(['item_code','like',fuzzyLike(itemCode)]); if (warehouse?.trim()) filters.push(['warehouse','like',fuzzyLike(warehouse)]); return read<StockBalance>(creds,'Bin',['item_code','warehouse','actual_qty'],filters,50); }
export function getItemList(creds: ErpNextCreds, search?: string) { const filters: RecordFilter[] = search?.trim() ? [['item_name','like',fuzzyLike(search)]] : []; return read<ItemSummary>(creds,'Item',['item_code','item_name','stock_uom'],filters,50); }
export function getLowStockItems(creds: ErpNextCreds, threshold = 10) { return read<StockBalance>(creds,'Bin',['item_code','warehouse','actual_qty'],[['actual_qty','<',threshold > 0 ? threshold : 10]],50); }
export function getWarehouses(creds: ErpNextCreds, limit = 50) { return read<WarehouseSummary>(creds,'Warehouse',['warehouse_name','is_group','disabled'],[['disabled','=',0]],limit); }
export function getStockBalances(creds: ErpNextCreds, limit = 50) { return read<StockBalance>(creds,'Bin',['item_code','warehouse','actual_qty'],[],limit); }
export function getMaterialRequests(creds: ErpNextCreds, limit = 50) { return read<MaterialRequestSummary>(creds,'Material Request',['status','material_request_type','transaction_date','schedule_date'],[['docstatus','<',2]],limit); }
export function getPurchaseOrders(creds: ErpNextCreds, limit = 50) { return read<PurchaseOrderSummary>(creds,'Purchase Order',['status','supplier','transaction_date','grand_total'],[['docstatus','<',2]],limit); }
export function getPurchaseReceipts(creds: ErpNextCreds, limit = 50) { return read<PurchaseReceiptSummary>(creds,'Purchase Receipt',['status','supplier','posting_date','grand_total'],[['docstatus','<',2]],limit); }
export function getDeliveryNotes(creds: ErpNextCreds, limit = 50) { return read<DeliveryNoteSummary>(creds,'Delivery Note',['status','customer','posting_date','grand_total'],[['docstatus','<',2]],limit); }
export function getPickLists(creds: ErpNextCreds, limit = 50) { return read<PickListSummary>(creds,'Pick List',['status','purpose','modified'],[['docstatus','<',2]],limit); }
export function getShipments(creds: ErpNextCreds, limit = 50) { return read<ShipmentSummary>(creds,'Shipment',['status','modified'],[],limit); }
export function getLeads(creds: ErpNextCreds, search?: string) { return read<LeadSummary>(creds,'CRM Lead',['lead_name','organization','status','email'],search?.trim() ? [['lead_name','like',fuzzyLike(search)]] : [],50); }
export function getOpportunities(creds: ErpNextCreds, search?: string) { return read<OpportunitySummary>(creds,'CRM Deal',['organization','deal_value','probability','status'],search?.trim() ? [['organization','like',fuzzyLike(search)]] : [],50); }
export function getCustomers(creds: ErpNextCreds, search?: string) { return read<CustomerSummary>(creds,'Customer',['customer_name','customer_group','territory'],search?.trim() ? [['customer_name','like',fuzzyLike(search)]] : [],50); }
