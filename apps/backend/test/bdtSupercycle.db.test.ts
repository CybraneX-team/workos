import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { after, before, describe, test } from 'node:test';
import express from 'express';
import { createClient } from '@supabase/supabase-js';
import { env } from '../src/config.js';
import { pool, supabaseAdmin } from '../src/db.js';
import { initializeRbac } from '../src/rbac.js';
import { bdtSupercycleRouter } from '../src/routes/bdtSupercycle.js';

const dbDescribe = process.env.BDT_SUPERCYCLE_DB_TESTS === '1' ? describe : describe.skip;

dbDescribe('shared BDT Supercycle', { concurrency: 1 }, () => {
  const suffix = randomUUID().slice(0, 8); const companies: string[] = []; const users: string[] = []; const tokens: string[] = [];
  let baseUrl = ''; let server: ReturnType<express.Express['listen']>;
  const created: Array<{ departments: string[]; nodes: string[] }> = [];

  async function tenant(index: number) {
    const company = await pool.query(`insert into public.companies(name,slug,stage,country,description,status,is_public,offset_3d,currency) values($1,$2,'Seed','India','Supercycle test','active',false,'{"x":0,"y":0,"z":0}'::jsonb,'INR') returning id`, [`Supercycle ${suffix} ${index}`, `supercycle-${suffix}-${index}`]);
    const companyId = String(company.rows[0].id); const email = `supercycle-${suffix}-${index}@example.com`; const password = `Supercycle-${suffix}-${index}-safe-123!`;
    const auth = await supabaseAdmin.auth.admin.createUser({ email, password, email_confirm: true }); if (auth.error || !auth.data.user) throw new Error(`create_user:${auth.error?.message}`);
    const userId = auth.data.user.id;
    await pool.query(`insert into public.user_profiles(id,company_id,role,first_name,last_name,onboarding_completed) values($1,$2,'super_admin','Super','Cycle',true)`, [userId, companyId]);
    const membership = await pool.query(`insert into public.company_members(company_id,user_id,role,status,approved_at) values($1,$2,'super_admin','active',now()) returning id`, [companyId, userId]);
    const departments: string[] = []; const nodes: string[] = [];
    for (const [order, label] of ['Product', 'Sales'].entries()) {
      const department = await pool.query(`insert into public.departments(company_id,label,slug,domain,cluster,sort_order) values($1,$2,$3,'market','Market',$4) returning id`, [companyId, label, `${label.toLowerCase()}-${suffix}-${index}`, order]);
      departments.push(String(department.rows[0].id));
      const node = await pool.query(`insert into public.department_bdt_nodes(company_id,department_id,label,node_type,node_level,score,sort_order,metadata) values($1,$2,$3,'process','level1',75,0,'{"workspaceKind":"focus"}'::jsonb) returning id`, [companyId, department.rows[0].id, `${label} workspace`]);
      nodes.push(String(node.rows[0].id));
    }
    companies.push(companyId); users.push(userId); created.push({ departments, nodes });
    const client = createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, { auth: { persistSession: false } }); const signed = await client.auth.signInWithPassword({ email, password }); if (signed.error || !signed.data.session) throw new Error('signin_failed'); tokens.push(signed.data.session.access_token);
    return membership.rows[0].id;
  }
  async function request(tenantIndex: number, method: string, path: string, body?: unknown) { const response = await fetch(`${baseUrl}${path}`, { method, headers: { authorization: `Bearer ${tokens[tenantIndex]}`, ...(body === undefined ? {} : { 'content-type': 'application/json' }) }, body: body === undefined ? undefined : JSON.stringify(body) }); const text = await response.text(); return { status: response.status, body: text ? JSON.parse(text) : null }; }

  before(async () => {
    const db = new URL(env.DATABASE_URL.replace(/^postgresql:/, 'postgres:')); assert.ok(['127.0.0.1', 'localhost'].includes(db.hostname), 'tests require local Postgres');
    await tenant(0); await tenant(1); await initializeRbac(); const app = express(); app.use(express.json()); app.use('/api/bdt/supercycle', bdtSupercycleRouter); server = app.listen(0, '127.0.0.1'); await new Promise<void>((resolve) => server.once('listening', resolve)); const address = server.address(); if (!address || typeof address === 'string') throw new Error('server_address_missing'); baseUrl = `http://127.0.0.1:${address.port}`;
  });
  after(async () => { if (server) await new Promise<void>((resolve, reject) => server.close((error) => error ? reject(error) : resolve())); for (const company of companies) await pool.query(`delete from public.companies where id=$1`, [company]); for (const user of users) await supabaseAdmin.auth.admin.deleteUser(user); await pool.end(); });

  test('saves overlapping tenant-scoped routes and rejects invalid/cross-tenant nodes', async () => {
    const first = created[0]; const body = { departments: [{ departmentId: first.departments[0], nodeIds: [first.nodes[0]] }, { departmentId: first.departments[1], nodeIds: [first.nodes[1]] }], routes: [{ label: 'Acquire', color: '#4fd8ff', departmentIds: [first.departments[0], first.departments[1]] }, { label: 'Improve', color: '#a78bfa', departmentIds: [first.departments[1], first.departments[0]] }] };
    const saved = await request(0, 'PUT', '/api/bdt/supercycle', body);
    assert.equal(saved.status, 200); assert.equal(saved.body.configured, true); assert.deepEqual(saved.body.departments.map((department: any) => department.id), first.departments);
    assert.deepEqual(saved.body.routes.map((route: any) => route.label), ['Acquire', 'Improve']);
    assert.deepEqual(saved.body.routes[0].departmentIds, first.departments);
    assert.deepEqual(saved.body.routes[1].departmentIds, [...first.departments].reverse());
    assert.equal((await request(1, 'GET', '/api/bdt/supercycle')).body.configured, false);
    const foreign = await request(1, 'PUT', '/api/bdt/supercycle', { departments: [{ departmentId: first.departments[0], nodeIds: [first.nodes[0]] }], routes: [{ label: 'Foreign', color: '#4fd8ff', departmentIds: [first.departments[0], first.departments[0]] }] }); assert.equal(foreign.status, 403);
    const child = await pool.query(`insert into public.department_bdt_nodes(company_id,department_id,parent_node_id,label,node_type,node_level,score,sort_order,metadata) values($1,$2,$3,'Action child','action','action',75,0,'{}'::jsonb) returning id`, [companies[0], first.departments[0], first.nodes[0]]);
    const invalid = await request(0, 'PUT', '/api/bdt/supercycle', { departments: [{ departmentId: first.departments[0], nodeIds: [child.rows[0].id] }, { departmentId: first.departments[1], nodeIds: [first.nodes[1]] }], routes: [{ label: 'Bad node', color: '#4fd8ff', departmentIds: first.departments }] }); assert.equal(invalid.status, 409);
    await pool.query(`delete from public.department_bdt_nodes where company_id=$1 and id=$2`, [companies[0], first.nodes[0]]);
    const afterNodeRemoval = await request(0, 'GET', '/api/bdt/supercycle'); assert.deepEqual(afterNodeRemoval.body.departments.map((department: any) => department.id), [first.departments[1]]);
  });
});
