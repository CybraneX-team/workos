import express from 'express';
import {
  ConfigureSsoRequestSchema, ProvisionTenantRequestSchema, RecordQueryBatchRequestSchema,
  ReconcileUsersRequestSchema, type ErpNextEnvironment, serviceError,
} from '@cybranex/erpnext-contracts';
import { env } from './config.js';
import { pool } from './db.js';
import { configureSso, disableUser, getRecords, upsertUser } from './frappe/client.js';
import { credentials, tenantRow, toStatus } from './tenantStore.js';
import { startProvisionWorker } from './provisionWorker.js';

const app = express();
app.use(express.json({ limit: '1mb' }));
app.get('/healthz', (_req, res) => res.json({ ok: true, environment: env.ERPNEXT_ENV }));
app.use('/internal/v1', (req, res, next) => {
  if (req.header('authorization') !== `Bearer ${env.INTERNAL_SERVICE_TOKEN}`) return res.status(401).json(serviceError('unauthorized', 'Invalid service token.', false));
  next();
});

function ensureEnvironment(value: ErpNextEnvironment, res: express.Response): boolean {
  if (value === env.ERPNEXT_ENV) return true;
  res.status(409).json(serviceError('environment_mismatch', `This control-plane serves ${env.ERPNEXT_ENV}, not ${value}.`, false));
  return false;
}

app.post('/internal/v1/tenants/:companyId/provision', async (req, res) => {
  const parsed = ProvisionTenantRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(serviceError('invalid_request', parsed.error.message, false));
  if (!ensureEnvironment(parsed.data.environment, res)) return;
  const client = await pool.connect();
  try {
    await client.query('begin');
    const { rows } = await client.query(`insert into erpnext.provision_jobs(environment,company_id,company_slug,idempotency_key) values($1,$2,$3,$4)
      on conflict(environment,idempotency_key) do update set company_slug=excluded.company_slug returning id,status`,
      [parsed.data.environment, req.params.companyId, parsed.data.companySlug, parsed.data.idempotencyKey]);
    await client.query(`insert into erpnext.tenants(environment,company_id,status) values($1,$2,'provisioning')
      on conflict(environment,company_id) do update set status=case when erpnext.tenants.status='ready' then 'ready' else 'provisioning' end,updated_at=now()`,
      [parsed.data.environment, req.params.companyId]);
    await client.query('commit');
    return res.status(202).json({ accepted: true, jobId: rows[0].id, status: rows[0].status });
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }
});

app.get('/internal/v1/tenants/:companyId/status', async (req, res) => {
  const environment = String(req.query.environment ?? env.ERPNEXT_ENV) as ErpNextEnvironment;
  if (!ensureEnvironment(environment, res)) return;
  const row = await tenantRow(req.params.companyId, environment);
  if (!row) return res.json({ companyId: req.params.companyId, environment, status: 'not_configured' });
  return res.json(toStatus(row));
});

app.get('/internal/v1/tenants', async (req, res) => {
  const environment = String(req.query.environment ?? env.ERPNEXT_ENV) as ErpNextEnvironment;
  if (!ensureEnvironment(environment, res)) return;
  const { rows } = await pool.query('select * from erpnext.tenants where environment=$1 order by created_at', [environment]);
  return res.json({ tenants: rows.map(toStatus) });
});

app.post('/internal/v1/tenants/:companyId/records/query-batch', async (req, res) => {
  const parsed = RecordQueryBatchRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(serviceError('invalid_request', parsed.error.message, false));
  if (!ensureEnvironment(parsed.data.environment, res)) return;
  const creds = await credentials(req.params.companyId, parsed.data.environment);
  if (!creds) return res.status(409).json(serviceError('tenant_not_ready', 'ERPNext tenant is not ready.', true));
  const results = await Promise.all(parsed.data.queries.map(async query => {
    try { return { id: query.id, ok: true as const, rows: await getRecords(creds, query.doctype, query.fields, query.filters, query.limit, query.pageSize) }; }
    catch (error) { return { id: query.id, ok: false as const, rows: [] as [], error: serviceError('frappe_read_failed', error instanceof Error ? error.message : String(error), true) }; }
  }));
  return res.json({ results });
});

app.put('/internal/v1/tenants/:companyId/users', async (req, res) => {
  const parsed = ReconcileUsersRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(serviceError('invalid_request', parsed.error.message, false));
  if (!ensureEnvironment(parsed.data.environment, res)) return;
  const creds = await credentials(req.params.companyId, parsed.data.environment);
  if (!creds) return res.status(409).json(serviceError('tenant_not_ready', 'ERPNext tenant is not ready.', true));
  const { rows: existing } = await pool.query<{ external_user_id: string; email: string }>('select external_user_id,email from erpnext.managed_users where environment=$1 and company_id=$2 and enabled=true', [parsed.data.environment, req.params.companyId]);
  const desiredIds = new Set(parsed.data.users.map(user => user.externalUserId));
  let disabled = 0;
  for (const user of existing) if (!desiredIds.has(user.external_user_id)) { await disableUser(creds, user.email); disabled++; }
  for (const user of parsed.data.users) await upsertUser(creds, user);
  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query('update erpnext.managed_users set enabled=false,updated_at=now() where environment=$1 and company_id=$2', [parsed.data.environment, req.params.companyId]);
    for (const user of parsed.data.users) await client.query(`insert into erpnext.managed_users(environment,company_id,external_user_id,email,roles,enabled) values($1,$2,$3,$4,$5::jsonb,true)
      on conflict(environment,company_id,external_user_id) do update set email=excluded.email,roles=excluded.roles,enabled=true,updated_at=now()`, [parsed.data.environment, req.params.companyId, user.externalUserId, user.email, JSON.stringify(user.roles)]);
    await client.query(`insert into erpnext.command_receipts(environment,company_id,command_kind,idempotency_key) values($1,$2,'reconcile_users',$3) on conflict do nothing`, [parsed.data.environment, req.params.companyId, parsed.data.idempotencyKey]);
    await client.query('commit');
  } catch (error) { await client.query('rollback'); throw error; } finally { client.release(); }
  return res.json({ applied: parsed.data.users.length, disabled });
});

app.put('/internal/v1/tenants/:companyId/sso', async (req, res) => {
  const parsed = ConfigureSsoRequestSchema.safeParse(req.body);
  if (!parsed.success) return res.status(400).json(serviceError('invalid_request', parsed.error.message, false));
  if (!ensureEnvironment(parsed.data.environment, res)) return;
  const receipt = await pool.query('select 1 from erpnext.command_receipts where environment=$1 and company_id=$2 and command_kind=$3 and idempotency_key=$4', [parsed.data.environment, req.params.companyId, 'configure_sso', parsed.data.idempotencyKey]);
  if (receipt.rowCount) return res.json({ applied: true });
  const creds = await credentials(req.params.companyId, parsed.data.environment);
  if (!creds) return res.status(409).json(serviceError('tenant_not_ready', 'ERPNext tenant is not ready.', true));
  await configureSso(creds, parsed.data);
  await pool.query(`insert into erpnext.command_receipts(environment,company_id,command_kind,idempotency_key) values($1,$2,'configure_sso',$3)`, [parsed.data.environment, req.params.companyId, parsed.data.idempotencyKey]);
  return res.json({ applied: true });
});

app.use((error: unknown, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error('[erpnext-control-plane]', error);
  res.status(500).json(serviceError('internal_error', error instanceof Error ? error.message : 'Internal error.', true));
});

app.listen(env.PORT, () => { console.log(`[erpnext-control-plane] listening on :${env.PORT} (${env.ERPNEXT_ENV})`); if (env.RUN_PROVISION_WORKER) startProvisionWorker(); });
