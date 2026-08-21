import { Router } from 'express';
import { env } from '../../config.js';
import { pool } from '../../db.js';
import { authJwt } from '../../middleware/authJwt.js';
import { requirePermission } from '../../rbac.js';

export const businessAssistantRouter = Router();
businessAssistantRouter.use(authJwt, requirePermission('twin', 'read'));

export const nativeBusinessToolDeclarations = [
  ['get_stock_balance', 'List current product quantities, optionally filtered by product or warehouse.', { search: { type: 'string' }, warehouse: { type: 'string' } }],
  ['get_item_list', 'List products, prices, activity and stock totals.', { search: { type: 'string' } }],
  ['get_low_stock_items', 'List products whose total stock is below a threshold.', { threshold: { type: 'number' } }],
  ['get_leads', 'List CRM leads by name, email or source.', { search: { type: 'string' } }],
  ['get_deals', 'List CRM deals with account, value and stage.', { search: { type: 'string' } }],
  ['get_accounts', 'List prospect and customer accounts.', { search: { type: 'string' } }],
  ['get_quotes', 'List operational quotes and totals.', { search: { type: 'string' } }],
  ['get_orders', 'List sales orders and booking status.', { search: { type: 'string' } }],
  ['get_invoices', 'List operational invoices and balances.', { search: { type: 'string' } }],
  ['get_collections', 'Summarize manually recorded invoice payments.', {}],
  ['get_outstanding_invoices', 'List issued invoices with a remaining balance.', {}],
  ['get_overdue_invoices', 'List past-due issued invoices with a remaining balance.', {}],
].map(([name, description, properties]) => ({ name, description, parameters: { type: 'object', properties } }));

export async function runNativeBusinessTool(companyId: string, name: string, args: Record<string, unknown>) {
  const search = typeof args.search === 'string' && args.search.trim() ? `%${args.search.trim()}%` : null;
  switch (name) {
    case 'get_stock_balance': {
      const warehouse = typeof args.warehouse === 'string' && args.warehouse.trim() ? `%${args.warehouse.trim()}%` : null;
      const { rows } = await pool.query(`select p.code,p.name,b.warehouse_name,b.quantity from public.inventory_balances b join public.catalog_products p on p.company_id=b.company_id and p.id=b.product_id where b.company_id=$1 and ($2::text is null or p.code ilike $2 or p.name ilike $2) and ($3::text is null or b.warehouse_name ilike $3) order by p.name,b.warehouse_name limit 50`, [companyId, search, warehouse]);
      return rows;
    }
    case 'get_item_list': {
      const { rows } = await pool.query(`select p.code,p.name,p.active,p.price_amount,p.currency,coalesce(sum(b.quantity),0)::float stock_quantity from public.catalog_products p left join public.inventory_balances b on b.company_id=p.company_id and b.product_id=p.id where p.company_id=$1 and ($2::text is null or p.code ilike $2 or p.name ilike $2) group by p.id order by p.name limit 50`, [companyId, search]);
      return rows;
    }
    case 'get_low_stock_items': {
      const threshold = typeof args.threshold === 'number' && Number.isFinite(args.threshold) ? args.threshold : 10;
      const { rows } = await pool.query(`select p.code,p.name,coalesce(sum(b.quantity),0)::float stock_quantity from public.catalog_products p left join public.inventory_balances b on b.company_id=p.company_id and b.product_id=p.id where p.company_id=$1 group by p.id having coalesce(sum(b.quantity),0)<$2 order by stock_quantity,p.name limit 50`, [companyId, threshold]);
      return rows;
    }
    case 'get_leads': {
      const { rows } = await pool.query(`select name,email,phone,source,status,updated_at from public.crm_leads where company_id=$1 and ($2::text is null or name ilike $2 or email ilike $2 or source ilike $2) order by updated_at desc limit 50`, [companyId, search]);
      return rows;
    }
    case 'get_deals': {
      const { rows } = await pool.query(`select d.name,a.name account,d.stage,d.value,d.currency,d.probability,d.expected_close_date from public.crm_deals d join public.crm_accounts a on a.company_id=d.company_id and a.id=d.account_id where d.company_id=$1 and ($2::text is null or d.name ilike $2 or a.name ilike $2) order by d.updated_at desc limit 50`, [companyId, search]);
      return rows;
    }
    case 'get_accounts': {
      const { rows } = await pool.query(`select name,lifecycle,industry,territory,market_segment from public.crm_accounts where company_id=$1 and ($2::text is null or name ilike $2) order by updated_at desc limit 50`, [companyId, search]);
      return rows;
    }
    case 'get_quotes': {
      const { rows } = await pool.query(`select q.document_number,a.name account,q.status,q.issue_date,q.valid_until,q.total,q.currency from public.sales_quotes q join public.crm_accounts a on a.company_id=q.company_id and a.id=q.account_id where q.company_id=$1 and ($2::text is null or q.document_number ilike $2 or a.name ilike $2) order by q.updated_at desc limit 50`,[companyId,search]); return rows;
    }
    case 'get_orders': {
      const { rows } = await pool.query(`select o.document_number,a.name account,o.status,o.issue_date,o.total,o.currency from public.sales_orders o join public.crm_accounts a on a.company_id=o.company_id and a.id=o.account_id where o.company_id=$1 and ($2::text is null or o.document_number ilike $2 or a.name ilike $2) order by o.updated_at desc limit 50`,[companyId,search]); return rows;
    }
    case 'get_invoices': {
      const { rows } = await pool.query(`select i.document_number,a.name account,i.state,i.issue_date,i.due_date,i.total,i.currency,coalesce(p.paid,0)::float paid_amount,(i.total-coalesce(p.paid,0))::float balance from public.sales_invoices i join public.crm_accounts a on a.company_id=i.company_id and a.id=i.account_id left join lateral(select sum(amount) paid from public.sales_invoice_payments where company_id=i.company_id and invoice_id=i.id)p on true where i.company_id=$1 and ($2::text is null or i.document_number ilike $2 or a.name ilike $2) order by i.updated_at desc limit 50`,[companyId,search]); return rows;
    }
    case 'get_collections': {
      const { rows } = await pool.query(`select coalesce(sum(p.amount),0)::float collected_amount,count(*)::int payment_count,min(p.paid_on) first_payment_date,max(p.paid_on) latest_payment_date from public.sales_invoice_payments p join public.sales_invoices i on i.company_id=p.company_id and i.id=p.invoice_id where p.company_id=$1 and i.state='issued'`,[companyId]); return rows[0];
    }
    case 'get_outstanding_invoices':
    case 'get_overdue_invoices': {
      const overdue=name==='get_overdue_invoices'; const { rows }=await pool.query(`select i.document_number,a.name account,i.due_date,i.currency,i.total,(i.total-coalesce(p.paid,0))::float balance from public.sales_invoices i join public.crm_accounts a on a.company_id=i.company_id and a.id=i.account_id left join lateral(select sum(amount) paid from public.sales_invoice_payments where company_id=i.company_id and invoice_id=i.id)p on true where i.company_id=$1 and i.state='issued' and i.total>coalesce(p.paid,0) and ($2::boolean=false or i.due_date<current_date) order by i.due_date nulls last limit 50`,[companyId,overdue]); return rows;
    }
    default: throw new Error(`unknown_tool:${name}`);
  }
}

interface Part { text?: string; functionCall?: { name: string; args?: Record<string, unknown> }; functionResponse?: { name: string; response: Record<string, unknown> } }
interface Content { role: 'user' | 'model'; parts: Part[] }

async function gemini(contents: Content[]): Promise<Part[]> {
  if (!env.GEMINI_API_KEY) throw new Error('gemini_not_configured');
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL)}:generateContent`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
    body: JSON.stringify({
      contents,
      tools: [{ functionDeclarations: nativeBusinessToolDeclarations }],
      systemInstruction: { parts: [{ text: 'You are the WorkOS business assistant. Answer only from the native CRM, catalogue and current-stock tools. Always call a tool before making factual claims. Keep answers concise and concrete.' }] },
      generationConfig: { temperature: 0.2 },
    }),
  });
  const body = await response.json() as { candidates?: Array<{ content?: { parts?: Part[] } }>; error?: { message?: string } };
  if (!response.ok) throw new Error(`gemini_failed:${body.error?.message ?? response.statusText}`);
  return body.candidates?.[0]?.content?.parts ?? [];
}

businessAssistantRouter.post('/chat', async (req, res) => {
  const companyId = req.auth?.companyId;
  if (!companyId) return res.status(403).json({ error: 'no_company' });
  const input: Array<{ sender: 'user' | 'assistant'; text: string }> = Array.isArray(req.body?.messages) ? req.body.messages.slice(-20).filter((entry: unknown): entry is { sender: 'user' | 'assistant'; text: string } => Boolean(entry && typeof (entry as { text?: unknown }).text === 'string')) : [];
  if (!input.length || input.at(-1)?.sender !== 'user') return res.status(400).json({ error: 'messages_must_end_with_user' });
  const contents: Content[] = input.map(message => ({ role: message.sender === 'assistant' ? 'model' : 'user', parts: [{ text: message.text }] }));
  const toolCalls: Array<{ name: string; args: Record<string, unknown> }> = [];
  try {
    for (let round = 0; round < 4; round++) {
      const parts = await gemini(contents); const call = parts.find(part => part.functionCall)?.functionCall;
      if (!call) return res.json({ reply: parts.map(part => part.text ?? '').join('').trim() || 'I could not generate a response.', toolCalls });
      const args = call.args ?? {}; toolCalls.push({ name: call.name, args });
      let result: unknown; try { result = await runNativeBusinessTool(companyId, call.name, args); } catch (error) { result = { error: error instanceof Error ? error.message : 'tool_failed' }; }
      contents.push({ role: 'model', parts: [{ functionCall: call }] }, { role: 'user', parts: [{ functionResponse: { name: call.name, response: { result } } }] });
    }
    return res.json({ reply: 'I looked up the data but could not finish reasoning about it in time.', toolCalls });
  } catch (error) {
    console.error('[business-assistant]', error);
    return res.status(500).json({ error: error instanceof Error ? error.message : 'business_assistant_failed' });
  }
});
