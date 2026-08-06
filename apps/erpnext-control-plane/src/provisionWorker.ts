import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env } from './config.js';
import { pool } from './db.js';
import { encrypt } from './crypto.js';
import { activateSameSiteCrmIntegration, applyBranding, completeSetup, verifySetup, type TenantCredentials } from './frappe/client.js';

const execFileAsync = promisify(execFile);

type ProvisioningStage =
  | 'inspect_sites'
  | 'create_site'
  | 'generate_admin_keys'
  | 'remote_provision'
  | 'complete_setup'
  | 'apply_branding';

type ExecFailure = Error & {
  code?: number | string | null;
  signal?: string | null;
  killed?: boolean;
  stderr?: string | Buffer;
};

/**
 * Provisioning diagnostics are stored in the tenant/job state and emitted to
 * stdout. Keep them useful for local Docker failures without leaking Frappe
 * credentials, passwords, bearer tokens, or generated API keys.
 */
function redactDiagnostic(value: unknown): string {
  let text = String(value ?? '');
  const knownSecrets = [
    env.FRAPPE_DB_ROOT_PASSWORD,
    env.FRAPPE_SITE_ADMIN_PASSWORD,
    env.INTERNAL_SERVICE_TOKEN,
    env.ERPNEXT_CREDENTIALS_KEY,
    env.ERPNEXT_PROVISION_SECRET,
  ].filter((secret): secret is string => Boolean(secret));
  for (const secret of knownSecrets) text = text.replaceAll(secret, '[redacted]');
  return text
    .replace(/(Authorization:\s*Bearer\s+)[^\s]+/gi, '$1[redacted]')
    .replace(/(https?:\/\/)[^\s/@]+:[^\s/@]+@/gi, '$1[redacted]@')
    .replace(/\s+/g, ' ')
    .trim();
}

function boundedDiagnostic(value: unknown, maxLength = 360): string {
  const redacted = redactDiagnostic(value);
  return redacted.length > maxLength ? `${redacted.slice(0, maxLength)}…` : redacted;
}

class ProvisioningFailure extends Error {
  constructor(readonly diagnostic: string, readonly retryable = true, readonly consumeAttempt = true) {
    super(diagnostic);
    this.name = 'ProvisioningFailure';
  }
}

function commandFailure(stage: ProvisioningStage, error: unknown): ProvisioningFailure {
  const failure = error as ExecFailure;
  const details = [
    `stage=${stage}`,
    'command=docker_compose_exec',
    failure.code !== undefined && failure.code !== null ? `exit_code=${failure.code}` : null,
    failure.signal ? `signal=${failure.signal}` : null,
    failure.killed ? 'killed=true' : null,
    failure.stderr ? `stderr=${boundedDiagnostic(failure.stderr)}` : null,
  ].filter(Boolean).join('; ');
  return new ProvisioningFailure(details, true, !(stage === 'create_site' && failure.code === 75));
}

function logProvisionEvent(event: string, job: Job, fields: Record<string, string | number | boolean | null | undefined> = {}) {
  console.info(`[erpnext-worker] ${event}`, {
    jobId: job.id,
    companyId: job.company_id,
    attempt: job.attempts,
    ...fields,
  });
}

async function runLocalCompose(job: Job, stage: Extract<ProvisioningStage, 'inspect_sites' | 'create_site' | 'generate_admin_keys'>, args: string[], timeout: number) {
  const startedAt = Date.now();
  logProvisionEvent('local_command_started', job, { stage, timeoutMs: timeout });
  try {
    const result = await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', ...args], {
      cwd: env.FRAPPE_DOCKER_DIR,
      timeout,
    });
    logProvisionEvent('local_command_completed', job, { stage, elapsedMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logProvisionEvent('local_command_failed', job, { stage, elapsedMs: Date.now() - startedAt, error: boundedDiagnostic(error) });
    throw commandFailure(stage, error);
  }
}

async function atStage<T>(stage: Extract<ProvisioningStage, 'remote_provision' | 'complete_setup' | 'apply_branding'>, operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    if (error instanceof ProvisioningFailure) throw error;
    throw new ProvisioningFailure(`stage=${stage}; error=${boundedDiagnostic(error instanceof Error ? error.message : error)}`);
  }
}

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

async function localProvision(job: Job) {
  if (!env.FRAPPE_DOCKER_DIR) throw new Error('frappe_docker_dir_not_configured');
  const slug = job.company_slug;
  const siteName = `erp-${slug}.localhost`;
  // The lock and timeout must live *inside* the backend container. Killing the
  // outer docker CLI alone leaves bench running and causes later attempts to
  // collide with it. A busy lock is a short retry and must not consume an
  // attempt because another worker/process is demonstrably making progress.
  const createSiteScript = `set -eu
lock="$1"; site="$2"; root="$3"; admin="$4"
flock -n -E 75 "$lock" sh -c '
  set -eu
  site="$1"; root="$2"; admin="$3"
  if bench list-sites | grep -Fqx "$site"; then exit 0; fi
  exec timeout --signal=TERM --kill-after=30s 25m bench new-site "$site" --mariadb-user-host-login-scope=% --mariadb-root-password "$root" --admin-password "$admin" --install-app erpnext --install-app crm --install-app workos_frappe_integration
' workos-site-create "$site" "$root" "$admin"`;
  try {
    await runLocalCompose(job, 'create_site', [
      'sh', '-lc', createSiteScript,
      'workos-site-create', `/tmp/workos-site-${siteName}.lock`, siteName,
      env.FRAPPE_DB_ROOT_PASSWORD ?? 'admin', env.FRAPPE_SITE_ADMIN_PASSWORD ?? 'admin',
    ], 26 * 60_000);
  } catch (error) {
    if (error instanceof ProvisioningFailure && error.consumeAttempt === false) {
      throw new ProvisioningFailure('stage=create_site; error=site_creation_in_progress', true, false);
    }
    throw error;
  }
  const { stdout: installedApps } = await runLocalCompose(job, 'inspect_sites', ['bench', '--site', siteName, 'list-apps', '--format', 'json'], 60_000);
  if (!['frappe', 'erpnext', 'crm', 'workos_frappe_integration'].every(app => installedApps.includes(`"${app}"`))) {
    throw new ProvisioningFailure('stage=create_site; error=site_missing_required_apps');
  }
  const { stdout } = await runLocalCompose(job, 'generate_admin_keys', ['bench', '--site', siteName,
    'execute', 'frappe.core.doctype.user.user.generate_keys', '--kwargs', JSON.stringify({ user: 'Administrator' })],
  60_000);
  let keys: { api_key: string; api_secret: string };
  try {
    keys = JSON.parse(stdout.trim()) as { api_key: string; api_secret: string };
  } catch {
    // stdout can contain generated credentials; report only its size.
    throw new ProvisioningFailure(`stage=generate_admin_keys; error=invalid_key_response; stdout_length=${stdout.length}`);
  }
  if (!keys.api_key || !keys.api_secret) {
    throw new ProvisioningFailure('stage=generate_admin_keys; error=missing_generated_keys');
  }
  const url = `http://${siteName}:8081`;
  return { siteName, apiUrl: url, deskUrl: url, apiKey: keys.api_key, apiSecret: keys.api_secret };
}

async function remoteProvision(job: Job) {
  const slug = job.company_slug;
  const provisionUrl = env.ERPNEXT_PROVISION_URL;
  const provisionSecret = env.ERPNEXT_PROVISION_SECRET;
  if (!provisionUrl || !provisionSecret) throw new Error('remote_provisioning_not_configured');
  const startedAt = Date.now();
  logProvisionEvent('remote_request_started', job, { stage: 'remote_provision', timeoutMs: 27 * 60_000 });
  let response: Response;
  try {
    response = await atStage('remote_provision', () => fetch(`${provisionUrl.replace(/\/$/, '')}/provision`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provisionSecret}` },
      // The remote shim bounds site creation inside its backend container at 25
      // minutes. The caller must wait longer than that bound or it recreates the
      // old orphan-process failure by abandoning a still-live remote request.
      body: JSON.stringify({ slug }), signal: AbortSignal.timeout(27 * 60_000),
    }));
    logProvisionEvent('remote_request_completed', job, { stage: 'remote_provision', httpStatus: response.status, elapsedMs: Date.now() - startedAt });
  } catch (error) {
    logProvisionEvent('remote_request_failed', job, { stage: 'remote_provision', elapsedMs: Date.now() - startedAt, error: boundedDiagnostic(error) });
    throw error;
  }
  let body: { siteName?: string; apiKey?: string; apiSecret?: string; error?: string };
  try {
    body = await response.json() as { siteName?: string; apiKey?: string; apiSecret?: string };
  } catch {
    throw new ProvisioningFailure(`stage=remote_provision; error=invalid_response; http_status=${response.status}`);
  }
  if (response.status === 409 && body.error === 'provision_in_progress') {
    throw new ProvisioningFailure('stage=remote_provision; error=site_creation_in_progress', true, false);
  }
  if (!response.ok || !body.siteName || !body.apiKey || !body.apiSecret) throw new ProvisioningFailure(`stage=remote_provision; error=failed_response; http_status=${response.status}`);
  return { siteName: body.siteName, apiUrl: env.ERPNEXT_NGINX_URL, deskUrl: `https://${slug}.${env.ERPNEXT_SUBDOMAIN_BASE}`, apiKey: body.apiKey, apiSecret: body.apiSecret };
}

// 15 minutes, not 5: the lock has to outlast bench new-site *plus* the ERPNext
// setup wizard (chart of accounts + crm demo data), or a second worker reclaims
// the job mid-setup and provisions the same site concurrently.
async function pick(): Promise<Job | null> {
  const { rows } = await pool.query<Job>(`update erpnext.provision_jobs set status='running', attempts=attempts+1, locked_by=$1, locked_until=now()+interval '30 minutes', current_stage='claimed', stage_started_at=now(), heartbeat_at=now(), updated_at=now()
    where id=(select id from erpnext.provision_jobs where environment=$2 and status in ('pending','running') and (locked_until is null or locked_until<now()) order by created_at for update skip locked limit 1) returning *`, [env.WORKER_ID, env.ERPNEXT_ENV]);
  return rows[0] ?? null;
}

async function setStage(job: Job, stage: ProvisioningStage): Promise<void> {
  await pool.query(`update erpnext.provision_jobs set current_stage=$3,stage_started_at=now(),heartbeat_at=now(),updated_at=now()
    where id=$1 and locked_by=$2 and status='running'`, [job.id, env.WORKER_ID, stage]);
  logProvisionEvent('stage_started', job, { stage });
}

async function runProvisionStage<T>(job: Job, stage: ProvisioningStage, operation: () => Promise<T>): Promise<T> {
  await setStage(job, stage);
  const startedAt = Date.now();
  try {
    const result = await operation();
    logProvisionEvent('stage_completed', job, { stage, elapsedMs: Date.now() - startedAt });
    return result;
  } catch (error) {
    logProvisionEvent('stage_failed', job, { stage, elapsedMs: Date.now() - startedAt, error: boundedDiagnostic(error) });
    throw error;
  }
}

function startLeaseHeartbeat(job: Job): () => void {
  const timer = setInterval(() => {
    void pool.query(`update erpnext.provision_jobs set locked_until=now()+interval '30 minutes',heartbeat_at=now(),updated_at=now()
      where id=$1 and locked_by=$2 and status='running'`, [job.id, env.WORKER_ID])
      .catch(error => console.error('[erpnext-worker] heartbeat failed', { jobId: job.id, error: boundedDiagnostic(error) }));
  }, 30_000);
  timer.unref();
  return () => clearInterval(timer);
}

async function run(job: Job) {
  const stopHeartbeat = startLeaseHeartbeat(job);
  const startedAt = Date.now();
  let activeStage: ProvisioningStage | 'claimed' = 'claimed';
  await pool.query(`insert into erpnext.tenants(environment,company_id,status) values($1,$2,'provisioning') on conflict(environment,company_id) do update set status='provisioning',last_error=null,updated_at=now()`, [env.ERPNEXT_ENV, job.company_id]);
  logProvisionEvent('provisioning_started', job, { environment: env.ERPNEXT_ENV });
  try {
    const fyStartDate = isoDate(job.fy_start_date);
    const fyEndDate = isoDate(job.fy_end_date);
    // Jobs enqueued before migration 002 have no locale facts. Fail loudly rather
    // than provision a site that would strand its owner on /desk/setup-wizard.
    const companyName = job.company_name;
    const country = job.country;
    const currency = job.currency;
    if (!companyName || !country || !currency || !fyStartDate || !fyEndDate) {
      const error = new Error('setup_args_missing') as Error & { retryable?: boolean };
      error.retryable = false;
      throw error;
    }

    activeStage = env.ERPNEXT_ENV === 'local' ? 'create_site' : 'remote_provision';
    const provisioned = await runProvisionStage(job, activeStage, () => env.ERPNEXT_ENV === 'local' ? localProvision(job) : remoteProvision(job));
    const creds: TenantCredentials = provisioned;
    // Setup before branding: the wizard writes Website Settings and workspaces, so
    // branding applied first would be overwritten. Both precede status='ready', so
    // 'ready' means the tenant is actually usable — resolveErpNextCreds() and the
    // BDT's erpConnected gate key off that.
    activeStage = 'complete_setup';
    await runProvisionStage(job, activeStage, async () => {
      await atStage('complete_setup', () => completeSetup(creds, {
      companyName, country, currency,
      fyStartDate, fyEndDate, timezone: job.timezone,
      }));
      await atStage('complete_setup', () => verifySetup(creds, companyName));
      await atStage('complete_setup', () => activateSameSiteCrmIntegration(creds, companyName));
    });
    activeStage = 'apply_branding';
    await runProvisionStage(job, activeStage, () => atStage('apply_branding', () => applyBranding(creds)));
    await pool.query(`update erpnext.tenants set status='ready',site_name=$3,api_url=$4,desk_url=$5,api_key_enc=$6,api_secret_enc=$7,last_error=null,updated_at=now() where environment=$1 and company_id=$2`,
      [env.ERPNEXT_ENV, job.company_id, provisioned.siteName, provisioned.apiUrl, provisioned.deskUrl, encrypt(provisioned.apiKey), encrypt(provisioned.apiSecret)]);
    await pool.query(`update erpnext.provision_jobs set status='complete',current_stage='complete',completed_at=now(),locked_by=null,locked_until=null,last_error=null,heartbeat_at=now(),updated_at=now() where id=$1`, [job.id]);
    logProvisionEvent('provisioning_completed', job, { elapsedMs: Date.now() - startedAt });
  } catch (error) {
    const message = error instanceof ProvisioningFailure
      ? error.diagnostic
      : `stage=unknown; error=${boundedDiagnostic(error instanceof Error ? error.message : error)}`;
    console.error('[erpnext-worker] provisioning failed', { jobId: job.id, companyId: job.company_id, attempt: job.attempts, stage: activeStage, elapsedMs: Date.now() - startedAt, error: message });
    // A job whose setup args are missing can never succeed by being retried, so
    // honour an explicit retryable=false the way the backend outbox does.
    const provisionFailure = error as ProvisioningFailure;
    const retry = provisionFailure.retryable !== false && job.attempts < job.max_attempts;
    const delay = provisionFailure.consumeAttempt === false ? '30 seconds' : '10 seconds';
    await pool.query(`update erpnext.provision_jobs set status=$2,current_stage=case when $2='pending' then current_stage else 'failed' end,last_error=$3,
      attempts=case when $4=false then greatest(attempts-1,0) else attempts end,locked_by=null,locked_until=case when $2='pending' then now()+$5::interval else null end,heartbeat_at=now(),updated_at=now() where id=$1`,
      [job.id, retry ? 'pending' : 'failed', message.slice(0, 500), provisionFailure.consumeAttempt !== false, delay]);
    await pool.query(`update erpnext.tenants set status=$3,last_error=$4,updated_at=now() where environment=$1 and company_id=$2`, [env.ERPNEXT_ENV, job.company_id, retry ? 'provisioning' : 'failed', message.slice(0, 500)]);
  } finally { stopHeartbeat(); }
}

export function startProvisionWorker() {
  let active = true;
  console.info('[erpnext-worker] started', { environment: env.ERPNEXT_ENV, workerId: env.WORKER_ID });
  void (async () => {
    while (active) {
      const job = await pick().catch(err => {
        console.error('[erpnext-worker] claim failed', { error: boundedDiagnostic(err instanceof Error ? err.message : err) });
        return null;
      });
      if (!job) {
        await new Promise(resolve => setTimeout(resolve, 3000));
        continue;
      }
      console.info('[erpnext-worker] claimed job', { jobId: job.id, companyId: job.company_id, attempt: job.attempts });
      try {
        await run(job);
      } catch (error) {
        // run() persists ordinary provisioning failures itself. This catches a
        // secondary database/runtime failure so the worker loop cannot die silently.
        console.error('[erpnext-worker] job handler crashed', {
          jobId: job.id,
          companyId: job.company_id,
          error: boundedDiagnostic(error instanceof Error ? error.message : error),
        });
      }
    }
  })();
  return { stop: () => { active = false; } };
}
