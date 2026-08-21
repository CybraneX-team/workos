import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config.js';
import { pool, supabaseAdmin } from '../src/db.js';
import { initializeRbac } from '../src/rbac.js';
import { crmRouter, catalogRouter } from '../src/domains/native-business/router.js';
import { runNativeBusinessTool } from '../src/domains/native-business/assistant.js';
import { runNativeMetaLeadSweep, syncNativeMetaLeadBinding } from '../src/domains/meta-ads/nativeLeadSync.js';
import { encrypt } from '../src/lib/crypto.js';

const dbDescribe = process.env.NATIVE_BUSINESS_DB_TESTS === '1' ? describe : describe.skip;

dbDescribe('native CRM and catalogue against disposable local Postgres', { concurrency: 1 }, () => {
  const suffix = randomUUID().slice(0, 8);
  const companyIds: string[] = [];
  const userIds: string[] = [];
  const tokens: string[] = [];
  let baseUrl = '';
  let server: ReturnType<ReturnType<typeof express>['listen']>;

  async function createTenant(index: number) {
    const company = await pool.query(
      `insert into public.companies(name,slug,stage,country,description,status,is_public,offset_3d,currency)
       values($1,$2,'Seed','India','Disposable native business test','active',false,'{"x":0,"y":0,"z":0}'::jsonb,'INR') returning id`,
      [`Native ${suffix} ${index}`, `native-${suffix}-${index}`],
    );
    const companyId = String(company.rows[0].id);
    const email = `native-${suffix}-${index}@example.com`;
    const password = `Native-${suffix}-${index}-safe-123!`;
    const created = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true });
    if (created.error || !created.data.user) throw new Error(`test_user_create_failed:${created.error?.message}`);
    const userId = created.data.user.id;
    await pool.query(
      `insert into public.user_profiles(id,company_id,role,first_name,last_name,onboarding_completed)
       values($1,$2,'super_admin','Native','Tester',true)
       on conflict(id) do update set company_id=excluded.company_id,role=excluded.role,onboarding_completed=true`,
      [userId, companyId],
    );
    await pool.query(
      `insert into public.company_members(company_id,user_id,role,status,approved_at)
       values($1,$2,'super_admin','active',now())`,
      [companyId, userId],
    );
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const signed = await client.auth.signInWithPassword({ email, password });
    if (signed.error || !signed.data.session) throw new Error(`test_signin_failed:${signed.error?.message}`);
    companyIds.push(companyId); userIds.push(userId); tokens.push(signed.data.session.access_token);
  }

  async function request(tenant: number, method: string, path: string, body?: unknown) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: { authorization: `Bearer ${tokens[tenant]}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await response.text();
    return { status: response.status, body: text ? JSON.parse(text) : null };
  }

  before(async () => {
    const dbUrl = new URL(env.DATABASE_URL.replace(/^postgresql:/, 'postgres:'));
    assert.ok(['127.0.0.1', 'localhost'].includes(dbUrl.hostname), 'native DB tests refuse non-local DATABASE_URL');
    await createTenant(0);
    await createTenant(1);
    await initializeRbac();
    const app = express();
    app.use(express.json());
    app.use('/api/crm', crmRouter);
    app.use('/api/catalog', catalogRouter);
    server = app.listen(0, '127.0.0.1');
    await new Promise<void>((resolve) => server.once('listening', resolve));
    const address = server.address();
    if (!address || typeof address === 'string') throw new Error('test_server_address_missing');
    baseUrl = `http://127.0.0.1:${address.port}`;
  });

  after(async () => {
    if (server) await new Promise<void>((resolve, reject) => server.close(error => error ? reject(error) : resolve()));
    for (const companyId of companyIds) await pool.query('delete from public.companies where id=$1', [companyId]);
    for (const userId of userIds) await supabaseAdmin.auth.admin.deleteUser(userId);
    await pool.end();
  });

  test('browser roles have no direct native-table privileges', async () => {
    const { rows } = await pool.query(
      `select grantee,table_name,privilege_type from information_schema.role_table_grants
       where table_schema='public' and grantee in ('anon','authenticated')
       and table_name = any($1::text[])`,
      [['crm_accounts','crm_contacts','crm_leads','crm_deals','catalog_groups','catalog_products','inventory_balances','meta_lead_form_bindings']],
    );
    assert.deepEqual(rows, []);
  });

  test('CRM CRUD, pagination, tenant isolation, conversion rollback, and stage invariants', async () => {
    const account = await request(0, 'POST', '/api/crm/accounts', { name: 'Acme', industry: 'Software', territory: 'India' });
    assert.equal(account.status, 201);
    const foreign = await request(1, 'GET', `/api/crm/accounts/${account.body.id}`);
    assert.equal(foreign.status, 404);
    const badContact = await request(1, 'POST', '/api/crm/contacts', { firstName: 'Cross', accountId: account.body.id });
    assert.equal(badContact.status, 409);
    const lead = await request(0, 'POST', '/api/crm/leads', { name: 'Ada Lovelace', email: 'ada@example.com', source: 'Website' });
    assert.equal(lead.status, 201);
    const filtered = await request(0, 'GET', '/api/crm/leads?q=Ada&status=new&limit=1&offset=0');
    assert.equal(filtered.status, 200); assert.equal(filtered.body.total, 1); assert.equal(filtered.body.items[0].id, lead.body.id);
    const failed = await request(0, 'POST', `/api/crm/leads/${lead.body.id}/convert`, { accountId: randomUUID(), dealName: 'Must roll back' });
    assert.equal(failed.status, 404);
    assert.equal((await request(0, 'GET', `/api/crm/leads/${lead.body.id}`)).body.status, 'new');
    const converted = await request(0, 'POST', `/api/crm/leads/${lead.body.id}/convert`, { accountId: account.body.id, dealName: 'Acme opportunity', value: 1200 });
    assert.equal(converted.status, 200); assert.equal(converted.body.lead.status, 'converted'); assert.ok(converted.body.contact.id);
    assert.equal((await request(0, 'POST', `/api/crm/leads/${lead.body.id}/convert`, { accountId: account.body.id, dealName: 'Duplicate' })).status, 409);
    assert.equal((await request(0, 'PATCH', `/api/crm/deals/${converted.body.deal.id}/stage`, { stage: 'lost' })).status, 400);
    const lost = await request(0, 'PATCH', `/api/crm/deals/${converted.body.deal.id}/stage`, { stage: 'lost', lostReason: 'Budget' });
    assert.equal(lost.status, 200); assert.ok(lost.body.closed_at); assert.equal(lost.body.lost_reason, 'Budget');
    const reopened = await request(0, 'PATCH', `/api/crm/deals/${converted.body.deal.id}/stage`, { stage: 'discovery' });
    assert.equal(reopened.status, 200); assert.equal(reopened.body.closed_at, null); assert.equal(reopened.body.lost_reason, null);
    const won = await request(0, 'PATCH', `/api/crm/deals/${converted.body.deal.id}/stage`, { stage: 'won' });
    assert.equal(won.status, 200); assert.ok(won.body.closed_at);
    assert.equal((await request(0, 'GET', `/api/crm/accounts/${account.body.id}`)).body.lifecycle, 'customer');
    const summary = await request(0, 'GET', '/api/crm/summary');
    assert.equal(summary.status, 200); assert.equal(summary.body.metrics.conversionRate, 100); assert.ok(summary.body.recent.length); assert.ok(Array.isArray(summary.body.recommendations));
  });

  test('catalogue hierarchy, uniqueness, readiness, stock upsert, and tenant isolation', async () => {
    const root = await request(0, 'POST', '/api/catalog/groups', { name: 'Software' });
    const child = await request(0, 'POST', '/api/catalog/groups', { name: 'Subscriptions', parentId: root.body.id });
    assert.equal(root.status, 201); assert.equal(child.status, 201);
    assert.equal((await request(0, 'PATCH', `/api/catalog/groups/${root.body.id}`, { parentId: child.body.id })).status, 409);
    const product = await request(0, 'POST', '/api/catalog/products', { groupId: child.body.id, code: 'SaaS-1', name: 'Starter', priceAmount: 99, currency: 'inr' });
    assert.equal(product.status, 201); assert.equal(product.body.currency, 'INR');
    assert.equal((await request(0, 'POST', '/api/catalog/products', { code: 'saas-1', name: 'Duplicate' })).status, 409);
    assert.equal((await request(1, 'PUT', '/api/catalog/inventory', { productId: product.body.id, warehouseName: 'Main', quantity: 2 })).status, 409);
    await request(0, 'PUT', '/api/catalog/inventory', { productId: product.body.id, warehouseName: 'Main', quantity: 2 });
    await request(0, 'PUT', '/api/catalog/inventory', { productId: product.body.id, warehouseName: 'Main', quantity: 7 });
    const inventory = await request(0, 'GET', `/api/catalog/inventory?productId=${product.body.id}`);
    assert.equal(inventory.body.total, 1); assert.equal(Number(inventory.body.items[0].quantity), 7);
    const readiness = await request(0, 'GET', `/api/catalog/readiness?entity=group&id=${root.body.id}`);
    assert.deepEqual(readiness.body.metrics, { products: 1, enabled: 1, active: 1, priced: 1, unpriced: 0, lowStock: 1, zeroStock: 0 });
    const portfolio = await request(0, 'GET', '/api/catalog/portfolio');
    assert.equal(portfolio.body.tree[0].children[0].products[0].id, product.body.id);
    assert.equal((await request(0, 'DELETE', `/api/catalog/groups/${root.body.id}`)).status, 409);
  });

  test('assistant tools and Meta ingestion remain company-scoped and idempotent', async () => {
    const accountRows = await runNativeBusinessTool(companyIds[0], 'get_accounts', { search: 'Acme' }) as Array<{ name: string }>;
    assert.deepEqual(accountRows.map(row => row.name), ['Acme']);
    assert.deepEqual(await runNativeBusinessTool(companyIds[1], 'get_accounts', { search: 'Acme' }), []);
    const binding = await pool.query(
      `insert into public.meta_lead_form_bindings(company_id,meta_page_id,meta_form_id,field_mapping)
       values($1,'page-test','form-test',$2::jsonb) returning id,last_synced_at`,
      [companyIds[0], JSON.stringify({ full_name: 'full_name', email: 'email', phone_number: 'phone' })],
    );
    const fakeFetch = async () => new Response(JSON.stringify({ data: [{ id: 'meta-1', created_time: '2026-08-10T10:00:00Z', ad_id: 'ad-1', field_data: [{ name: 'full_name', values: ['Grace Hopper'] }, { name: 'email', values: ['grace@example.com'] }, { name: 'phone_number', values: ['123'] }] }] }), { status: 200, headers: { 'content-type': 'application/json' } });
    const row = binding.rows[0];
    const input = { id: row.id, company_id: companyIds[0], meta_form_id: 'form-test', field_mapping: { full_name: 'full_name', email: 'email', phone_number: 'phone' }, last_synced_at: null, access_token_enc: encrypt('fake-token') };
    assert.equal(await syncNativeMetaLeadBinding(input, fakeFetch), 1);
    assert.equal(await syncNativeMetaLeadBinding(input, fakeFetch), 1);
    const synced = await pool.query(`select name,email,phone,meta_ad_id,raw_answers from public.crm_leads where company_id=$1 and meta_lead_id='meta-1'`, [companyIds[0]]);
    assert.equal(synced.rowCount, 1); assert.deepEqual(synced.rows[0], { name: 'Grace Hopper', email: 'grace@example.com', phone: '123', meta_ad_id: 'ad-1', raw_answers: { full_name: 'Grace Hopper', email: 'grace@example.com', phone_number: '123' } });
    const cursor = await pool.query('select last_synced_at,last_error from public.meta_lead_form_bindings where id=$1', [row.id]);
    assert.equal(new Date(cursor.rows[0].last_synced_at).toISOString(), '2026-08-10T10:00:00.000Z'); assert.equal(cursor.rows[0].last_error, null);
  });

  test('Meta pagination is atomic and one failed binding does not stop another', async () => {
    for (const [index, companyId] of companyIds.entries()) {
      await pool.query(
        `insert into public.integration_connections(company_id,integration_id,account_name,sandbox_mode,access_token_enc,metadata,connected_at)
         values($1,'int-meta',$2,true,$3,'{}'::jsonb,now())`,
        [companyId, `Meta native test ${index}`, encrypt(`token-${index}`)],
      );
    }
    const failing = await pool.query(
      `insert into public.meta_lead_form_bindings(company_id,meta_page_id,meta_form_id,field_mapping,last_synced_at)
       values($1,'page-fail','form-fail','{}'::jsonb,'2026-08-09T00:00:00Z') returning id`,
      [companyIds[1]],
    );
    let calls = 0;
    const pagedFetch = async (input: string | URL | Request) => {
      calls += 1;
      const url = String(input);
      if (url.includes('form-fail')) return new Response(JSON.stringify({ error: { message: 'x'.repeat(800) } }), { status: 500 });
      if (url.includes('page=2')) return new Response(JSON.stringify({ data: [{ id: 'meta-page-2', created_time: '2026-08-10T12:00:00Z', field_data: [{ name: 'email', values: ['page2@example.com'] }] }] }), { status: 200 });
      return new Response(JSON.stringify({ data: [{ id: 'meta-page-1', created_time: '2026-08-10T11:00:00Z', field_data: [{ name: 'email', values: ['page1@example.com'] }] }], paging: { next: 'https://graph.example.test/page=2' } }), { status: 200 });
    };
    await runNativeMetaLeadSweep(pagedFetch);
    assert.ok(calls >= 3);
    const successful = await pool.query(`select meta_lead_id from public.crm_leads where company_id=$1 and meta_lead_id in ('meta-page-1','meta-page-2') order by meta_lead_id`, [companyIds[0]]);
    assert.deepEqual(successful.rows.map(row => row.meta_lead_id), ['meta-page-1', 'meta-page-2']);
    const failed = await pool.query('select last_synced_at,last_error from public.meta_lead_form_bindings where id=$1', [failing.rows[0].id]);
    assert.equal(new Date(failed.rows[0].last_synced_at).toISOString(), '2026-08-09T00:00:00.000Z');
    assert.ok(String(failed.rows[0].last_error).length <= 500);
    assert.match(String(failed.rows[0].last_error), /meta_leads_500/);
  });
});
