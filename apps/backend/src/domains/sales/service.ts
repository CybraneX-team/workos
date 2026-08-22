import { Decimal } from 'decimal.js';
import type { PoolClient, QueryResultRow } from 'pg';
import { pool } from '../../db.js';

export type SalesDocumentKind = 'quote' | 'order' | 'invoice';
export type SalesItemInput = { productId?: string | null; name?: string; description?: string | null; unit?: string; quantity: number; unitPrice?: number; discountRate?: number };
export type SalesItem = { product_id: string | null; product_code: string | null; name: string; description: string | null; unit: string; quantity: string; unit_price: string; discount_rate: string; line_total: string; position: number };

const money = (value: Decimal.Value) => new Decimal(value).toDecimalPlaces(2, Decimal.ROUND_HALF_UP);
const fixed = (value: Decimal.Value) => money(value).toFixed(2);

function dateOnly(value: unknown) {
  if (value == null) return value;
  if (value instanceof Date) return `${value.getFullYear()}-${String(value.getMonth()+1).padStart(2,'0')}-${String(value.getDate()).padStart(2,'0')}`;
  return String(value).slice(0, 10);
}

export function normalizeSalesDates<T extends QueryResultRow>(row: T): T {
  const normalized: QueryResultRow = { ...row };
  for (const key of ['issue_date','valid_until','due_date','paid_on']) if (key in normalized) normalized[key] = dateOnly(normalized[key]);
  return normalized as T;
}

export function calculateSalesDocument(items: Array<Pick<SalesItem,'quantity'|'unit_price'|'discount_rate'>>, discountRate = 0, taxRate = 0) {
  const lines = items.map(item => money(new Decimal(item.quantity).mul(item.unit_price).mul(new Decimal(100).minus(item.discount_rate)).div(100)));
  const subtotal = money(lines.reduce((sum, value) => sum.plus(value), new Decimal(0)));
  const discountAmount = money(subtotal.mul(discountRate).div(100));
  const taxable = subtotal.minus(discountAmount);
  const taxAmount = money(taxable.mul(taxRate).div(100));
  return { lines: lines.map(value => value.toFixed(2)), subtotal: subtotal.toFixed(2), discountAmount: discountAmount.toFixed(2), taxAmount: taxAmount.toFixed(2), total: money(taxable.plus(taxAmount)).toFixed(2) };
}

export async function hydrateSalesItems(companyId: string, inputs: SalesItemInput[], client: PoolClient): Promise<SalesItem[]> {
  const productIds = [...new Set(inputs.map(item => item.productId).filter((id): id is string => Boolean(id)))];
  const products = productIds.length ? await client.query(
    `select id,code,name,description,unit,price_amount,currency from public.catalog_products where company_id=$1 and id=any($2::uuid[])`,
    [companyId, productIds],
  ) : { rows: [] as QueryResultRow[] };
  if (products.rows.length !== productIds.length) throw Object.assign(new Error('invalid_product_reference'), { status: 409 });
  const byId = new Map(products.rows.map(row => [String(row.id), row]));
  const hydrated = inputs.map((input, position) => {
    const product = input.productId ? byId.get(input.productId) : null;
    const name = String(product?.name ?? input.name ?? '').trim();
    const unitPrice = product?.price_amount == null ? input.unitPrice : Number(product.price_amount);
    if (!name) throw Object.assign(new Error('item_name_required'), { status: 400 });
    if (unitPrice == null) throw Object.assign(new Error('item_price_required'), { status: 400 });
    return {
      product_id: input.productId ?? null,
      product_code: product?.code == null ? null : String(product.code),
      name,
      description: product?.description == null ? input.description ?? null : String(product.description),
      unit: String(product?.unit ?? input.unit ?? 'unit').trim() || 'unit',
      quantity: new Decimal(input.quantity).toFixed(4),
      unit_price: fixed(unitPrice),
      discount_rate: fixed(input.discountRate ?? 0),
      line_total: '0.00',
      position,
    } satisfies SalesItem;
  });
  const totals = calculateSalesDocument(hydrated);
  return hydrated.map((item, index) => ({ ...item, line_total: totals.lines[index] }));
}

export async function nextSalesDocumentNumber(companyId: string, kind: SalesDocumentKind, issueDate: string, client: PoolClient): Promise<string> {
  const year = Number(issueDate.slice(0, 4));
  const prefixColumn = kind === 'quote' ? 'quote_prefix' : kind === 'order' ? 'order_prefix' : 'invoice_prefix';
  const profile = await client.query(`select ${prefixColumn} prefix from public.commercial_profiles where company_id=$1`, [companyId]);
  const fallback = kind === 'quote' ? 'Q' : kind === 'order' ? 'SO' : 'INV';
  const prefix = String(profile.rows[0]?.prefix ?? fallback).toUpperCase();
  const sequence = await client.query<{ value: number }>(
    `insert into public.sales_document_sequences(company_id,document_type,document_year,next_value)
     values($1,$2,$3,2)
     on conflict(company_id,document_type,document_year) do update
       set next_value=public.sales_document_sequences.next_value+1
     returning next_value-1 value`,
    [companyId, kind, year],
  );
  return `${prefix}-${year}-${String(sequence.rows[0].value).padStart(4, '0')}`;
}

export async function salesSnapshots(companyId: string, accountId: string, contactId: string | null | undefined, client: PoolClient) {
  const seller = await client.query(
    `select coalesce(p.seller_name,c.name) name,p.seller_email email,p.seller_phone phone,p.seller_address address,p.registration_text registration,p.tax_registration
       from public.companies c left join public.commercial_profiles p on p.company_id=c.id where c.id=$1`,
    [companyId],
  );
  const buyer = await client.query(
    `select a.name,a.billing_email email,a.billing_phone phone,a.billing_address address,a.tax_registration,
            ct.first_name,ct.last_name,ct.email contact_email,ct.phone contact_phone
       from public.crm_accounts a left join public.crm_contacts ct on ct.company_id=a.company_id and ct.id=$3
      where a.company_id=$1 and a.id=$2`,
    [companyId, accountId, contactId ?? null],
  );
  if (!buyer.rows[0]) throw Object.assign(new Error('account_not_found'), { status: 404 });
  return { seller: seller.rows[0] ?? {}, buyer: buyer.rows[0] };
}

export async function detailedSalesDocument(companyId: string, kind: SalesDocumentKind, id: string, client: PoolClient | typeof pool = pool) {
  const table = kind === 'quote' ? 'sales_quotes' : kind === 'order' ? 'sales_orders' : 'sales_invoices';
  const itemTable = kind === 'quote' ? 'sales_quote_items' : kind === 'order' ? 'sales_order_items' : 'sales_invoice_items';
  const parentColumn = `${kind}_id`;
  const document = await client.query(`select * from public.${table} where company_id=$1 and id=$2`, [companyId, id]);
  if (!document.rows[0]) return null;
  const row = normalizeSalesDates(document.rows[0]);
  const items = await client.query(`select * from public.${itemTable} where company_id=$1 and ${parentColumn}=$2 order by position,id`, [companyId, id]);
  if (kind === 'quote') {
    const validUntil = String(row.valid_until ?? '');
    const status = row.status === 'sent' && validUntil && validUntil < new Date().toISOString().slice(0, 10) ? 'expired' : row.status;
    return { ...row, status, items: items.rows };
  }
  if (kind === 'order') return { ...row, items: items.rows };
  const payments = await client.query(`select * from public.sales_invoice_payments where company_id=$1 and invoice_id=$2 order by paid_on desc,created_at desc`, [companyId, id]);
  const paid = payments.rows.reduce((sum, row) => sum.plus(row.amount), new Decimal(0));
  const balance = Decimal.max(new Decimal(row.total).minus(paid), 0);
  const state = row.state;
  const paymentStatus = state === 'void' ? 'void' : state === 'draft' ? 'draft' : balance.eq(0) ? 'paid' : paid.gt(0) ? 'partial' : row.due_date && String(row.due_date) < new Date().toISOString().slice(0,10) ? 'overdue' : 'unpaid';
  return { ...row, status: paymentStatus, paid_amount: paid.toFixed(2), balance: balance.toFixed(2), items: items.rows, payments: payments.rows.map(normalizeSalesDates) };
}

export async function insertSalesItems(companyId: string, kind: SalesDocumentKind, documentId: string, items: SalesItem[], client: PoolClient) {
  const table = kind === 'quote' ? 'sales_quote_items' : kind === 'order' ? 'sales_order_items' : 'sales_invoice_items';
  const parentColumn = `${kind}_id`;
  for (const item of items) {
    await client.query(
      `insert into public.${table}(company_id,${parentColumn},product_id,position,product_code,name,description,unit,quantity,unit_price,discount_rate,line_total)
       values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)`,
      [companyId, documentId, item.product_id, item.position, item.product_code, item.name, item.description, item.unit, item.quantity, item.unit_price, item.discount_rate, item.line_total],
    );
  }
}
