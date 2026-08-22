import { Router, type Request, type Response } from 'express';
import { z } from 'zod';
import { pool } from '../../db.js';
import { authJwt } from '../../middleware/authJwt.js';
import { requirePermission } from '../../rbac.js';

export const crmRouter = Router();
export const catalogRouter = Router();
crmRouter.use(authJwt);
catalogRouter.use(authJwt);

const uuid = z.string().uuid();
const nullableText = (max = 300) => z.string().trim().max(max).nullable().optional();
const listSchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  offset: z.coerce.number().int().min(0).default(0),
  q: z.string().trim().max(200).optional(),
});

const accountSchema = z.object({
  name: z.string().trim().min(1).max(200),
  lifecycle: z.enum(['prospect', 'customer', 'inactive']).default('prospect'),
  industry: nullableText(160), territory: nullableText(160), marketSegment: nullableText(160),
  employeeCount: z.number().int().nonnegative().nullable().optional(),
  annualRevenue: z.number().nonnegative().nullable().optional(),
  billingEmail: z.string().trim().email().max(320).nullable().optional(), billingPhone: nullableText(80),
  billingAddress: nullableText(2000), taxRegistration: nullableText(500),
});
const contactSchema = z.object({
  accountId: uuid.nullable().optional(), firstName: z.string().trim().min(1).max(140),
  lastName: nullableText(140), email: z.string().trim().email().max(320).nullable().optional(),
  phone: nullableText(80), title: nullableText(160),
});
const leadSchema = z.object({
  accountId: uuid.nullable().optional(), contactId: uuid.nullable().optional(),
  name: z.string().trim().min(1).max(200), email: z.string().trim().email().max(320).nullable().optional(),
  phone: nullableText(80), source: nullableText(160),
  status: z.enum(['new', 'contacted', 'qualified', 'converted', 'disqualified']).default('new'),
});
const dealSchema = z.object({
  accountId: uuid, primaryContactId: uuid.nullable().optional(), name: z.string().trim().min(1).max(200),
  stage: z.enum(['qualification', 'discovery', 'proposal', 'negotiation', 'won', 'lost']).default('qualification'),
  value: z.number().nonnegative().default(0), currency: z.string().trim().length(3).transform(v => v.toUpperCase()).optional(),
  probability: z.number().int().min(0).max(100).default(10),
  expectedCloseDate: z.string().date().nullable().optional(), lostReason: nullableText(1000),
});
const groupSchema = z.object({ parentId: uuid.nullable().optional(), name: z.string().trim().min(1).max(160) });
const productSchema = z.object({
  groupId: uuid.nullable().optional(), code: z.string().trim().min(1).max(80), name: z.string().trim().min(1).max(200),
  description: nullableText(5000), unit: z.string().trim().min(1).max(40).default('unit'), active: z.boolean().default(true),
  priceAmount: z.number().nonnegative().nullable().optional(),
  currency: z.string().trim().length(3).transform(v => v.toUpperCase()).nullable().optional(),
});
const inventorySchema = z.object({ productId: uuid, warehouseName: z.string().trim().min(1).max(160), quantity: z.number() });

function companyId(req: Request): string | null { return req.auth?.companyId ?? null; }
function noCompany(res: Response) { return res.status(403).json({ error: 'no_company' }); }
function validation(res: Response, error: z.ZodError) { return res.status(400).json({ error: 'invalid_request', details: error.flatten() }); }
function dbError(res: Response, error: unknown, fallback: string) {
  const pg = error as { code?: string; constraint?: string };
  if (pg.code === '23503') return res.status(409).json({ error: 'record_in_use_or_invalid_reference' });
  if (pg.code === '23505') return res.status(409).json({ error: 'duplicate_record' });
  console.error(`[native-business] ${fallback}`, error);
  return res.status(500).json({ error: fallback });
}
async function currencyFor(company: string): Promise<string> {
  const { rows } = await pool.query<{ currency: string | null }>('select currency from public.companies where id=$1', [company]);
  return rows[0]?.currency?.toUpperCase() || 'INR';
}
function patchSql(table: string, company: string, id: string, values: Record<string, unknown>) {
  const entries = Object.entries(values).filter(([, value]) => value !== undefined);
  if (!entries.length) return null;
  const assignments = entries.map(([column], index) => `${column}=$${index + 3}`);
  return { text: `update public.${table} set ${assignments.join(',')},updated_at=now() where company_id=$1 and id=$2 returning *`, params: [company, id, ...entries.map(([, value]) => value)] };
}
function commonList(req: Request) {
  const parsed = listSchema.safeParse(req.query);
  return parsed.success ? parsed.data : null;
}

crmRouter.get('/accounts', requirePermission('twin', 'read'), async (req, res) => {
  const company = companyId(req); if (!company) return noCompany(res); const list = commonList(req); if (!list) return res.status(400).json({ error: 'invalid_query' });
  const lifecycle = typeof req.query.lifecycle === 'string' ? req.query.lifecycle : null;
  const params: unknown[] = [company]; const where = ['company_id=$1'];
  if (list.q) { params.push(`%${list.q}%`); where.push(`name ilike $${params.length}`); }
  if (lifecycle) { params.push(lifecycle); where.push(`lifecycle=$${params.length}`); }
  params.push(list.limit, list.offset);
  const { rows } = await pool.query(`select *,count(*) over()::int as _total from public.crm_accounts where ${where.join(' and ')} order by updated_at desc,id limit $${params.length - 1} offset $${params.length}`, params);
  return res.json({ items: rows.map(({ _total: _ignored, ...row }) => row), total: Number(rows[0]?._total ?? 0) });
});
crmRouter.post('/accounts', requirePermission('twin', 'write'), async (req, res) => {
  const company = companyId(req); if (!company) return noCompany(res); const parsed = accountSchema.safeParse(req.body); if (!parsed.success) return validation(res, parsed.error); const v = parsed.data;
  try { const { rows } = await pool.query(`insert into public.crm_accounts(company_id,name,lifecycle,industry,territory,market_segment,employee_count,annual_revenue,billing_email,billing_phone,billing_address,tax_registration) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) returning *`, [company,v.name,v.lifecycle,v.industry??null,v.territory??null,v.marketSegment??null,v.employeeCount??null,v.annualRevenue??null,v.billingEmail??null,v.billingPhone??null,v.billingAddress??null,v.taxRegistration??null]); return res.status(201).json(rows[0]); } catch (e) { return dbError(res,e,'account_create_failed'); }
});
crmRouter.get('/accounts/:id', requirePermission('twin', 'read'), async (req, res) => entityGet(res,'crm_accounts',companyId(req),req.params.id));
crmRouter.patch('/accounts/:id', requirePermission('twin', 'write'), async (req, res) => {
  const company=companyId(req); if(!company)return noCompany(res); const parsed=accountSchema.partial().safeParse(req.body); if(!parsed.success)return validation(res,parsed.error); const v=parsed.data;
  const query=patchSql('crm_accounts',company,req.params.id,{name:v.name,lifecycle:v.lifecycle,industry:v.industry,territory:v.territory,market_segment:v.marketSegment,employee_count:v.employeeCount,annual_revenue:v.annualRevenue,billing_email:v.billingEmail,billing_phone:v.billingPhone,billing_address:v.billingAddress,tax_registration:v.taxRegistration}); return runPatch(res,query,'account_not_found');
});
crmRouter.delete('/accounts/:id', requirePermission('twin', 'delete'), async (req,res)=>entityDelete(res,'crm_accounts',companyId(req),req.params.id));

crmRouter.get('/contacts', requirePermission('twin', 'read'), async (req,res)=>listContacts(req,res));
crmRouter.post('/contacts', requirePermission('twin', 'write'), async (req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=contactSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;
  try{const {rows}=await pool.query(`insert into public.crm_contacts(company_id,account_id,first_name,last_name,email,phone,title) values($1,$2,$3,$4,$5,$6,$7) returning *`,[company,v.accountId??null,v.firstName,v.lastName??null,v.email??null,v.phone??null,v.title??null]);return res.status(201).json(rows[0]);}catch(e){return dbError(res,e,'contact_create_failed');}
});
crmRouter.get('/contacts/:id',requirePermission('twin','read'),async(req,res)=>entityGet(res,'crm_contacts',companyId(req),req.params.id));
crmRouter.patch('/contacts/:id',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=contactSchema.partial().safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;
  return runPatch(res,patchSql('crm_contacts',company,req.params.id,{account_id:v.accountId,first_name:v.firstName,last_name:v.lastName,email:v.email,phone:v.phone,title:v.title}),'contact_not_found');
});
crmRouter.delete('/contacts/:id',requirePermission('twin','delete'),async(req,res)=>entityDelete(res,'crm_contacts',companyId(req),req.params.id));

crmRouter.get('/leads',requirePermission('twin','read'),async(req,res)=>simpleList(req,res,'crm_leads',['name','email','source'],'status'));
crmRouter.post('/leads',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=leadSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;
  if(v.status==='converted')return res.status(400).json({error:'use_lead_conversion_endpoint'});
  try{const {rows}=await pool.query(`insert into public.crm_leads(company_id,account_id,contact_id,name,email,phone,source,status) values($1,$2,$3,$4,$5,$6,$7,$8) returning *`,[company,v.accountId??null,v.contactId??null,v.name,v.email??null,v.phone??null,v.source??null,v.status]);return res.status(201).json(rows[0]);}catch(e){return dbError(res,e,'lead_create_failed');}
});
crmRouter.get('/leads/:id',requirePermission('twin','read'),async(req,res)=>entityGet(res,'crm_leads',companyId(req),req.params.id));
crmRouter.patch('/leads/:id',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=leadSchema.partial().safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;
  if(v.status==='converted')return res.status(400).json({error:'use_lead_conversion_endpoint'});
  return runPatch(res,patchSql('crm_leads',company,req.params.id,{account_id:v.accountId,contact_id:v.contactId,name:v.name,email:v.email,phone:v.phone,source:v.source,status:v.status}),'lead_not_found');
});
crmRouter.delete('/leads/:id',requirePermission('twin','delete'),async(req,res)=>entityDelete(res,'crm_leads',companyId(req),req.params.id));

const convertSchema=z.object({accountId:uuid.optional(),accountName:z.string().trim().min(1).max(200).optional(),dealName:z.string().trim().min(1).max(200),value:z.number().nonnegative().default(0),currency:z.string().trim().length(3).transform(v=>v.toUpperCase()).default('INR'),expectedCloseDate:z.string().date().nullable().optional()}).refine(v=>v.accountId||v.accountName,{message:'accountId or accountName is required'});
crmRouter.post('/leads/:id/convert',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=convertSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const client=await pool.connect();
  try{await client.query('begin');const leadResult=await client.query(`select * from public.crm_leads where company_id=$1 and id=$2 for update`,[company,req.params.id]);const lead=leadResult.rows[0];if(!lead){await client.query('rollback');return res.status(404).json({error:'lead_not_found'});}if(lead.status==='converted'||lead.converted_deal_id){await client.query('rollback');return res.status(409).json({error:'lead_already_converted'});}
    let accountId=parsed.data.accountId;let account=null;if(accountId){const found=await client.query(`select * from public.crm_accounts where company_id=$1 and id=$2`,[company,accountId]);account=found.rows[0];if(!account)throw Object.assign(new Error('account_not_found'),{status:404});}else{const created=await client.query(`insert into public.crm_accounts(company_id,name) values($1,$2) returning *`,[company,parsed.data.accountName]);account=created.rows[0];accountId=account.id;}
    let contact=null;if(lead.contact_id){const found=await client.query(`select * from public.crm_contacts where company_id=$1 and id=$2`,[company,lead.contact_id]);contact=found.rows[0]??null;}else if(lead.email||lead.phone){const parts=String(lead.name).trim().split(/\s+/);const created=await client.query(`insert into public.crm_contacts(company_id,account_id,first_name,last_name,email,phone) values($1,$2,$3,$4,$5,$6) returning *`,[company,accountId,parts.shift()||lead.name,parts.join(' ')||null,lead.email,lead.phone]);contact=created.rows[0];}
    const dealResult=await client.query(`insert into public.crm_deals(company_id,account_id,primary_contact_id,name,value,currency,expected_close_date) values($1,$2,$3,$4,$5,$6,$7) returning *`,[company,accountId,contact?.id??null,parsed.data.dealName,parsed.data.value,parsed.data.currency,parsed.data.expectedCloseDate??null]);const deal=dealResult.rows[0];
    const updated=await client.query(`update public.crm_leads set account_id=$3,contact_id=$4,status='converted',converted_deal_id=$5,updated_at=now() where company_id=$1 and id=$2 returning *`,[company,lead.id,accountId,contact?.id??null,deal.id]);await client.query('commit');return res.json({lead:updated.rows[0],account,contact,deal});
  }catch(e){await client.query('rollback');if((e as {status?:number}).status===404)return res.status(404).json({error:'account_not_found'});return dbError(res,e,'lead_conversion_failed');}finally{client.release();}
});

crmRouter.get('/deals',requirePermission('twin','read'),async(req,res)=>simpleList(req,res,'crm_deals',['name'],'stage'));
crmRouter.post('/deals',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=dealSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;if(v.stage==='lost'&&!v.lostReason)return res.status(400).json({error:'lost_reason_required'});const client=await pool.connect();
  try{await client.query('begin');const terminal=v.stage==='won'||v.stage==='lost';const {rows}=await client.query(`insert into public.crm_deals(company_id,account_id,primary_contact_id,name,stage,value,currency,probability,expected_close_date,closed_at,lost_reason) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,[company,v.accountId,v.primaryContactId??null,v.name,v.stage,v.value,v.currency??await currencyFor(company),v.probability,v.expectedCloseDate??null,terminal?new Date():null,v.lostReason??null]);await client.query('commit');return res.status(201).json(rows[0]);}catch(e){await client.query('rollback');return dbError(res,e,'deal_create_failed');}finally{client.release();}
});
crmRouter.get('/deals/:id',requirePermission('twin','read'),async(req,res)=>entityGet(res,'crm_deals',companyId(req),req.params.id));
crmRouter.patch('/deals/:id',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=dealSchema.partial().omit({stage:true}).safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;
  return runPatch(res,patchSql('crm_deals',company,req.params.id,{account_id:v.accountId,primary_contact_id:v.primaryContactId,name:v.name,value:v.value,currency:v.currency,probability:v.probability,expected_close_date:v.expectedCloseDate,lost_reason:v.lostReason}),'deal_not_found');
});
crmRouter.patch('/deals/:id/stage',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=z.object({stage:z.enum(['qualification','discovery','proposal','negotiation','won','lost']),lostReason:nullableText(1000)}).safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);if(parsed.data.stage==='lost'&&!parsed.data.lostReason)return res.status(400).json({error:'lost_reason_required'});const client=await pool.connect();
  try{await client.query('begin');const terminal=['won','lost'].includes(parsed.data.stage);const {rows}=await client.query(`update public.crm_deals set stage=$3,closed_at=$4,lost_reason=$5,updated_at=now() where company_id=$1 and id=$2 returning *`,[company,req.params.id,parsed.data.stage,terminal?new Date():null,parsed.data.stage==='lost'?parsed.data.lostReason??null:null]);if(!rows[0]){await client.query('rollback');return res.status(404).json({error:'deal_not_found'});}if(parsed.data.stage==='won')await client.query(`update public.crm_accounts set lifecycle='customer',updated_at=now() where company_id=$1 and id=$2`,[company,rows[0].account_id]);await client.query('commit');return res.json(rows[0]);}catch(e){await client.query('rollback');return dbError(res,e,'deal_stage_update_failed');}finally{client.release();}
});
crmRouter.delete('/deals/:id',requirePermission('twin','delete'),async(req,res)=>entityDelete(res,'crm_deals',companyId(req),req.params.id));

crmRouter.get('/summary',requirePermission('twin','read'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);
  const [accounts,segments,leads,deals,recent]=await Promise.all([
    pool.query(`select lifecycle,count(*)::int count from public.crm_accounts where company_id=$1 group by lifecycle`,[company]),
    pool.query(`select coalesce(nullif(industry,''),'Unspecified') industry,coalesce(nullif(territory,''),'Unspecified') territory,count(*)::int count from public.crm_accounts where company_id=$1 group by 1,2 order by count desc,industry,territory`,[company]),
    pool.query(`select status,count(*)::int count from public.crm_leads where company_id=$1 group by status`,[company]),
    pool.query(`select stage,count(*)::int count,coalesce(sum(value),0)::float value from public.crm_deals where company_id=$1 group by stage`,[company]),
    pool.query(`select id,name,stage,status,value,updated_at,kind from (select id,name,stage,null::text status,value,updated_at,'deal' kind from public.crm_deals where company_id=$1 union all select id,name,null,status,null,updated_at,'lead' from public.crm_leads where company_id=$1) x order by updated_at desc limit 10`,[company]),
  ]);
  const converted=Number(leads.rows.find(row=>row.status==='converted')?.count??0);
  const totalLeads=leads.rows.reduce((n,row)=>n+Number(row.count),0);
  const openDeals=deals.rows.filter(row=>!['won','lost'].includes(row.stage));
  const recommendations:Array<{code:string;label:string;detail:string}>=[];
  if(Number(leads.rows.find(row=>row.status==='new')?.count??0)>0)recommendations.push({code:'contact_new_leads',label:'Contact new leads',detail:'New leads are waiting for first contact.'});
  if(openDeals.length===0)recommendations.push({code:'build_pipeline',label:'Build the pipeline',detail:'There are no open deals yet.'});
  if(Number(accounts.rows.find(row=>row.lifecycle==='prospect')?.count??0)>0)recommendations.push({code:'qualify_prospects',label:'Qualify prospects',detail:'Review prospect accounts and link active opportunities.'});
  return res.json({
    generatedAt:new Date().toISOString(),accounts:accounts.rows,accountSegments:segments.rows,leads:leads.rows,deals:deals.rows,recent:recent.rows,recommendations,
    metrics:{accountCount:accounts.rows.reduce((n,row)=>n+Number(row.count),0),leadCount:totalLeads,dealCount:deals.rows.reduce((n,row)=>n+Number(row.count),0),openPipelineValue:openDeals.reduce((n,row)=>n+Number(row.value),0),conversionRate:totalLeads?Math.round(converted/totalLeads*100):0},
  });
});
catalogRouter.get('/groups',requirePermission('twin','read'),async(req,res)=>simpleList(req,res,'catalog_groups',['name']));
catalogRouter.post('/groups',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=groupSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);try{const {rows}=await pool.query(`insert into public.catalog_groups(company_id,parent_id,name) values($1,$2,$3) returning *`,[company,parsed.data.parentId??null,parsed.data.name]);return res.status(201).json(rows[0]);}catch(e){return dbError(res,e,'catalog_group_create_failed');}
});
catalogRouter.patch('/groups/:id',requirePermission('twin','write'),async(req,res)=>{const company=companyId(req);if(!company)return noCompany(res);const parsed=groupSchema.partial().safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);if(parsed.data.parentId){const cycle=await pool.query(`with recursive descendants as (select id from public.catalog_groups where company_id=$1 and id=$2 union select g.id from public.catalog_groups g join descendants d on g.parent_id=d.id where g.company_id=$1) select 1 from descendants where id=$3`,[company,req.params.id,parsed.data.parentId]);if(cycle.rowCount)return res.status(409).json({error:'catalog_group_cycle'});}return runPatch(res,patchSql('catalog_groups',company,req.params.id,{parent_id:parsed.data.parentId,name:parsed.data.name}),'catalog_group_not_found');});
catalogRouter.delete('/groups/:id',requirePermission('twin','delete'),async(req,res)=>entityDelete(res,'catalog_groups',companyId(req),req.params.id));

catalogRouter.get('/products',requirePermission('twin','read'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const list=commonList(req);if(!list)return res.status(400).json({error:'invalid_query'});const params:unknown[]=[company];const where=['company_id=$1'];
  if(list.q){params.push(`%${list.q}%`);where.push(`(code ilike $${params.length} or name ilike $${params.length})`);}if(typeof req.query.active==='string'){params.push(req.query.active==='true');where.push(`active=$${params.length}`);}if(typeof req.query.groupId==='string'){params.push(req.query.groupId);where.push(`group_id=$${params.length}`);}params.push(list.limit,list.offset);
  const {rows}=await pool.query(`select *,count(*) over()::int _total from public.catalog_products where ${where.join(' and ')} order by updated_at desc,id limit $${params.length-1} offset $${params.length}`,params);return res.json({items:rows.map(({_total:_ignored,...row})=>row),total:Number(rows[0]?._total??0)});
});
catalogRouter.post('/products',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=productSchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;const currency=v.priceAmount!=null?(v.currency||await currencyFor(company)):v.currency??null;
  try{const {rows}=await pool.query(`insert into public.catalog_products(company_id,group_id,code,name,description,unit,active,price_amount,currency) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[company,v.groupId??null,v.code,v.name,v.description??null,v.unit,v.active,v.priceAmount??null,currency]);return res.status(201).json(rows[0]);}catch(e){return dbError(res,e,'product_create_failed');}
});
catalogRouter.get('/products/:id',requirePermission('twin','read'),async(req,res)=>entityGet(res,'catalog_products',companyId(req),req.params.id));
catalogRouter.patch('/products/:id',requirePermission('twin','write'),async(req,res)=>{const company=companyId(req);if(!company)return noCompany(res);const parsed=productSchema.partial().safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;return runPatch(res,patchSql('catalog_products',company,req.params.id,{group_id:v.groupId,code:v.code,name:v.name,description:v.description,unit:v.unit,active:v.active,price_amount:v.priceAmount,currency:v.currency}),'product_not_found');});
catalogRouter.delete('/products/:id',requirePermission('twin','delete'),async(req,res)=>entityDelete(res,'catalog_products',companyId(req),req.params.id));

catalogRouter.get('/inventory',requirePermission('twin','read'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const list=commonList(req);if(!list)return res.status(400).json({error:'invalid_query'});const params:unknown[]=[company];const where=['b.company_id=$1'];if(typeof req.query.productId==='string'){params.push(req.query.productId);where.push(`b.product_id=$${params.length}`);}if(list.q){params.push(`%${list.q}%`);where.push(`(p.code ilike $${params.length} or p.name ilike $${params.length} or b.warehouse_name ilike $${params.length})`);}params.push(list.limit,list.offset);const {rows}=await pool.query(`select b.*,p.code product_code,p.name product_name,count(*) over()::int _total from public.inventory_balances b join public.catalog_products p on p.company_id=b.company_id and p.id=b.product_id where ${where.join(' and ')} order by b.updated_at desc,b.id limit $${params.length-1} offset $${params.length}`,params);return res.json({items:rows.map(({_total:_ignored,...row})=>row),total:Number(rows[0]?._total??0)});
});
catalogRouter.put('/inventory',requirePermission('twin','write'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const parsed=inventorySchema.safeParse(req.body);if(!parsed.success)return validation(res,parsed.error);const v=parsed.data;try{const {rows}=await pool.query(`insert into public.inventory_balances(company_id,product_id,warehouse_name,quantity) values($1,$2,$3,$4) on conflict(company_id,product_id,warehouse_name) do update set quantity=excluded.quantity,updated_at=now() returning *`,[company,v.productId,v.warehouseName,v.quantity]);return res.json(rows[0]);}catch(e){return dbError(res,e,'inventory_upsert_failed');}
});

catalogRouter.get('/portfolio',requirePermission('twin','read'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const [groups,products,balances]=await Promise.all([pool.query(`select * from public.catalog_groups where company_id=$1 order by name`,[company]),pool.query(`select * from public.catalog_products where company_id=$1 order by name`,[company]),pool.query(`select product_id,coalesce(sum(quantity),0)::float stock_quantity from public.inventory_balances where company_id=$1 group by product_id`,[company])]);const stock=new Map(balances.rows.map(row=>[row.product_id,Number(row.stock_quantity)]));const items=products.rows.map(row=>({...row,stock_quantity:stock.get(row.id)??0,priced:row.price_amount!==null}));type TreeNode=Record<string,unknown>&{id:string;parent_id:string|null;children:TreeNode[];products:Record<string,unknown>[]};const nodes=new Map<string,TreeNode>(groups.rows.map(group=>[String(group.id),{...group,id:String(group.id),parent_id:group.parent_id?String(group.parent_id):null,children:[],products:items.filter(product=>product.group_id===group.id)}]));const tree:TreeNode[]=[];for(const node of nodes.values()){const parent=node.parent_id?nodes.get(node.parent_id):null;if(parent)parent.children.push(node);else tree.push(node);}return res.json({status:items.length?'ready':'empty',generatedAt:new Date().toISOString(),groups:groups.rows,products:items,tree});
});
catalogRouter.get('/readiness',requirePermission('twin','read'),async(req,res)=>{
  const company=companyId(req);if(!company)return noCompany(res);const entity=req.query.entity;const id=typeof req.query.id==='string'?req.query.id:'';if(!['group','product'].includes(String(entity))||!id)return res.status(400).json({error:'entity_and_id_required'});let rows;if(entity==='product'){rows=(await pool.query(`select p.*,coalesce(sum(b.quantity),0)::float stock_quantity from public.catalog_products p left join public.inventory_balances b on b.company_id=p.company_id and b.product_id=p.id where p.company_id=$1 and p.id=$2 group by p.id`,[company,id])).rows;}else{rows=(await pool.query(`with recursive descendants as (select id from public.catalog_groups where company_id=$1 and id=$2 union select g.id from public.catalog_groups g join descendants d on g.parent_id=d.id where g.company_id=$1) select p.*,coalesce(sum(b.quantity),0)::float stock_quantity from public.catalog_products p join descendants d on d.id=p.group_id left join public.inventory_balances b on b.company_id=p.company_id and b.product_id=p.id where p.company_id=$1 group by p.id`,[company,id])).rows;const exists=await pool.query(`select 1 from public.catalog_groups where company_id=$1 and id=$2`,[company,id]);if(!exists.rowCount)return res.status(404).json({error:'catalog_entity_not_found'});}if(entity==='product'&&!rows[0])return res.status(404).json({error:'catalog_entity_not_found'});return res.json({entity,id,metrics:{products:rows.length,enabled:rows.filter(r=>r.active).length,active:rows.filter(r=>r.active).length,priced:rows.filter(r=>r.price_amount!==null).length,unpriced:rows.filter(r=>r.price_amount===null).length,lowStock:rows.filter(r=>Number(r.stock_quantity)>0&&Number(r.stock_quantity)<=10).length,zeroStock:rows.filter(r=>Number(r.stock_quantity)<=0).length},signals:rows.flatMap(r=>[...(!r.active?[{productId:r.id,severity:'warning',label:'Inactive product'}]:[]),...(r.price_amount===null?[{productId:r.id,severity:'warning',label:'Missing price'}]:[]),...(Number(r.stock_quantity)<=0?[{productId:r.id,severity:'warning',label:'No stock'}]:Number(r.stock_quantity)<=10?[{productId:r.id,severity:'info',label:'Low stock'}]:[])])});
});

async function entityGet(res:Response,table:string,company:string|null,id:string){if(!company)return noCompany(res);const {rows}=await pool.query(`select * from public.${table} where company_id=$1 and id=$2`,[company,id]);return rows[0]?res.json(rows[0]):res.status(404).json({error:'record_not_found'});}
async function entityDelete(res:Response,table:string,company:string|null,id:string){if(!company)return noCompany(res);try{const result=await pool.query(`delete from public.${table} where company_id=$1 and id=$2`,[company,id]);return result.rowCount?res.status(204).send():res.status(404).json({error:'record_not_found'});}catch(e){return dbError(res,e,'delete_failed');}}
async function runPatch(res:Response,query:ReturnType<typeof patchSql>,notFound:string){if(!query)return res.status(400).json({error:'empty_patch'});try{const {rows}=await pool.query(query.text,query.params);return rows[0]?res.json(rows[0]):res.status(404).json({error:notFound});}catch(e){return dbError(res,e,'update_failed');}}
async function simpleList(req:Request,res:Response,table:string,searchFields:string[],filterField?:string){const company=companyId(req);if(!company)return noCompany(res);const list=commonList(req);if(!list)return res.status(400).json({error:'invalid_query'});const params:unknown[]=[company];const where=['company_id=$1'];if(list.q){params.push(`%${list.q}%`);where.push(`(${searchFields.map(field=>`${field} ilike $${params.length}`).join(' or ')})`);}if(filterField&&typeof req.query[filterField]==='string'){params.push(req.query[filterField]);where.push(`${filterField}=$${params.length}`);}params.push(list.limit,list.offset);const {rows}=await pool.query(`select *,count(*) over()::int _total from public.${table} where ${where.join(' and ')} order by updated_at desc,id limit $${params.length-1} offset $${params.length}`,params);return res.json({items:rows.map(({_total:_ignored,...row})=>row),total:Number(rows[0]?._total??0)});}
async function listContacts(req:Request,res:Response){return simpleList(req,res,'crm_contacts',['first_name','last_name','email']);}
