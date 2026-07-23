import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from './config.js';
import { pool } from './db.js';
import { encrypt } from './crypto.js';
import { applyBranding, completeSetup, type TenantCredentials } from './frappe/client.js';

const execFileAsync = promisify(execFile);

interface Job {
  id: string; company_id: string; company_slug: string; attempts: number; max_attempts: number;
  company_name: string | null; country: string | null; currency: string | null;
  fy_start_date: Date | string | null; fy_end_date: Date | string | null; timezone: string | null;
}

/** `date` columns come back as Date from pg; ERPNext wants plain ISO calendar dates. */
function isoDate(value: Date | string | null): string | null {
  if (!value) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : String(value).slice(0, 10);
}

async function localProvision(slug: string) {
  if (!env.FRAPPE_DOCKER_DIR) throw new Error('frappe_docker_dir_not_configured');
  const siteName = `erp-${slug}.localhost`;
  const { stdout: sites } = await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', 'list-sites'],
    { cwd: env.FRAPPE_DOCKER_DIR, timeout: 30_000 });
  if (!sites.split(/\s+/).includes(siteName)) {
    await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', 'new-site', siteName,
      '--mariadb-user-host-login-scope=%', '--mariadb-root-password', env.FRAPPE_DB_ROOT_PASSWORD ?? 'admin',
      '--admin-password', env.FRAPPE_SITE_ADMIN_PASSWORD ?? 'admin',
      // erpnext first: crm declares no required_apps, so install order is not
      // enforced for us, and the CRM Deal -> Customer/Quotation hand-off
      // ("ERPNext CRM Settings") needs erpnext present on the site.
      '--install-app', 'erpnext', '--install-app', 'crm'], { cwd: env.FRAPPE_DOCKER_DIR, timeout: 300_000 });
  }
  const { stdout } = await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', '--site', siteName,
    'execute', 'frappe.core.doctype.user.user.generate_keys', '--kwargs', JSON.stringify({ user: 'Administrator' })],
  { cwd: env.FRAPPE_DOCKER_DIR, timeout: 60_000 });
  const keys = JSON.parse(stdout.trim()) as { api_key: string; api_secret: string };
  const url = `http://${siteName}:8081`;
  return { siteName, apiUrl: url, deskUrl: url, apiKey: keys.api_key, apiSecret: keys.api_secret };
}

async function remoteProvision(slug: string) {
  if (!env.ERPNEXT_PROVISION_URL || !env.ERPNEXT_PROVISION_SECRET) throw new Error('remote_provisioning_not_configured');
  const response = await fetch(`${env.ERPNEXT_PROVISION_URL.replace(/\/$/, '')}/provision`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.ERPNEXT_PROVISION_SECRET}` },
    body: JSON.stringify({ slug }), signal: AbortSignal.timeout(200_000),
  });
  const body = await response.json() as { siteName?: string; apiKey?: string; apiSecret?: string };
  if (!response.ok || !body.siteName || !body.apiKey || !body.apiSecret) throw new Error(`remote_provision_failed:${response.status}`);
  return { siteName: body.siteName, apiUrl: env.ERPNEXT_NGINX_URL, deskUrl: `https://${slug}.${env.ERPNEXT_SUBDOMAIN_BASE}`, apiKey: body.apiKey, apiSecret: body.apiSecret };
}

// 15 minutes, not 5: the lock has to outlast bench new-site *plus* the ERPNext
// setup wizard (chart of accounts + crm demo data), or a second worker reclaims
// the job mid-setup and provisions the same site concurrently.
async function pick(): Promise<Job | null> {
  const { rows } = await pool.query<Job>(`update erpnext.provision_jobs set status='running', attempts=attempts+1, locked_by=$1, locked_until=now()+interval '15 minutes'
    where id=(select id from erpnext.provision_jobs where environment=$2 and status in ('pending','running') and (locked_until is null or locked_until<now()) order by created_at for update skip locked limit 1) returning *`, [env.WORKER_ID, env.ERPNEXT_ENV]);
  return rows[0] ?? null;
}

async function run(job: Job) {
  await pool.query(`insert into erpnext.tenants(environment,company_id,status) values($1,$2,'provisioning') on conflict(environment,company_id) do update set status='provisioning',last_error=null,updated_at=now()`, [env.ERPNEXT_ENV, job.company_id]);
  try {
    const fyStartDate = isoDate(job.fy_start_date);
    const fyEndDate = isoDate(job.fy_end_date);
    // Jobs enqueued before migration 002 have no locale facts. Fail loudly rather
    // than provision a site that would strand its owner on /desk/setup-wizard.
    if (!job.company_name || !job.country || !job.currency || !fyStartDate || !fyEndDate) {
      const error = new Error('setup_args_missing') as Error & { retryable?: boolean };
      error.retryable = false;
      throw error;
    }

    const provisioned = env.ERPNEXT_ENV === 'local' ? await localProvision(job.company_slug) : await remoteProvision(job.company_slug);
    const creds: TenantCredentials = provisioned;
    // Setup before branding: the wizard writes Website Settings and workspaces, so
    // branding applied first would be overwritten. Both precede status='ready', so
    // 'ready' means the tenant is actually usable — resolveErpNextCreds() and the
    // BDT's erpConnected gate key off that.
    await completeSetup(creds, {
      companyName: job.company_name, country: job.country, currency: job.currency,
      fyStartDate, fyEndDate, timezone: job.timezone,
    });
    await applyBranding(creds);
    await pool.query(`update erpnext.tenants set status='ready',site_name=$3,api_url=$4,desk_url=$5,api_key_enc=$6,api_secret_enc=$7,last_error=null,updated_at=now() where environment=$1 and company_id=$2`,
      [env.ERPNEXT_ENV, job.company_id, provisioned.siteName, provisioned.apiUrl, provisioned.deskUrl, encrypt(provisioned.apiKey), encrypt(provisioned.apiSecret)]);
    await pool.query(`update erpnext.provision_jobs set status='complete',completed_at=now(),locked_by=null,locked_until=null where id=$1`, [job.id]);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[erpnext-worker] provisioning failed', { companyId: job.company_id, attempt: job.attempts, error: message });
    // A job whose setup args are missing can never succeed by being retried, so
    // honour an explicit retryable=false the way the backend outbox does.
    const retry = (error as { retryable?: boolean }).retryable !== false && job.attempts < job.max_attempts;
    await pool.query(`update erpnext.provision_jobs set status=$2,last_error=$3,locked_by=null,locked_until=case when $2='pending' then now()+interval '10 seconds' else null end where id=$1`, [job.id, retry ? 'pending' : 'failed', message.slice(0, 500)]);
    await pool.query(`update erpnext.tenants set status=$3,last_error=$4,updated_at=now() where environment=$1 and company_id=$2`, [env.ERPNEXT_ENV, job.company_id, retry ? 'provisioning' : 'failed', message.slice(0, 500)]);
  }
}

export function startProvisionWorker() {
  let active = true;
  process.on('SIGINT', () => { active = false; }); process.on('SIGTERM', () => { active = false; });
  void (async () => { while (active) { const job = await pick().catch(err => { console.error('[erpnext-worker]', err); return null; }); if (job) await run(job); else await new Promise(r => setTimeout(r, 3000)); } })();
}
