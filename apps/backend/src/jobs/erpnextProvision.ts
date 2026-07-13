import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { env, provisionEnv } from '../config.js';
import { pool, supabaseAdmin } from '../db.js';
import { encrypt } from '../lib/crypto.js';
import { log } from '../lib/logger.js';
import { computeFrappeRoles } from '../lib/erpnextRoleMapping.js';
import { applyWorkosBranding, upsertFrappeUser, upsertSocialLoginKey, type ErpNextCreds } from '../adapters/erpnext.js';
import { registerOidcClient } from '../routes/oidc.js';
import type { RoleId } from '../rbac.js';

const execFileAsync = promisify(execFile);

const LOCK_MINUTES = 5;
const POLL_MS = 3000;
const BACKEND_SERVICE = 'backend'; // matches infra/erpnext/pwd.yml's bench container service name

interface ProvisionJob {
  id: string;
  company_id: string;
  payload: { company_slug: string };
  attempts: number;
  max_attempts: number;
}

function parseGenerateKeysOutput(stdout: string): { apiKey: string; apiSecret: string } {
  // `bench execute frappe.core.doctype.user.user.generate_keys` prints a single-line
  // JSON object — confirmed empirically 2026-07-04 (`{"api_key": "...", "api_secret": "..."}`).
  const parsed = JSON.parse(stdout.trim());
  if (!parsed.api_key || !parsed.api_secret) {
    throw new Error(`generate_keys_unexpected_output:${stdout.slice(0, 200)}`);
  }
  return { apiKey: parsed.api_key, apiSecret: parsed.api_secret };
}

async function provisionViaLocalExec(
  composeDir: string,
  siteName: string,
): Promise<{ apiKey: string; apiSecret: string }> {
  await execFileAsync('docker', [
    'compose', '-f', 'pwd.yml', 'exec', '-T', BACKEND_SERVICE,
    'bench', 'new-site', siteName,
    '--mariadb-root-password', env.FRAPPE_DB_ROOT_PASSWORD ?? 'admin',
    '--admin-password', env.FRAPPE_SITE_ADMIN_PASSWORD ?? 'admin',
    '--install-app', 'erpnext',
  ], { cwd: composeDir, timeout: 180_000 });

  const { stdout } = await execFileAsync('docker', [
    'compose', '-f', 'pwd.yml', 'exec', '-T', BACKEND_SERVICE,
    'bench', '--site', siteName, 'execute',
    'frappe.core.doctype.user.user.generate_keys',
    '--kwargs', JSON.stringify({ user: 'Administrator' }),
  ], { cwd: composeDir, timeout: 60_000 });

  return parseGenerateKeysOutput(stdout);
}

// Production path: the backend runs on Azure Container Apps with no docker socket
// access, so site creation happens via a small remote shim on the ERPNext VM instead
// (same bench commands as provisionViaLocalExec, just run over HTTPS+bearer-auth).
async function provisionViaRemoteShim(
  provisionUrl: string,
  provisionSecret: string,
  slug: string,
): Promise<{ siteName: string; apiKey: string; apiSecret: string }> {
  const res = await fetch(`${provisionUrl.replace(/\/$/, '')}/provision`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${provisionSecret}` },
    body: JSON.stringify({ slug }),
    signal: AbortSignal.timeout(200_000),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`erpnext_provision_shim_failed:${res.status}:${JSON.stringify(body).slice(0, 300)}`);
  }
  if (!body.siteName || !body.apiKey || !body.apiSecret) {
    throw new Error(`erpnext_provision_shim_unexpected_response:${JSON.stringify(body).slice(0, 300)}`);
  }
  return body;
}

export async function provisionErpnextSite(job: ProvisionJob): Promise<void> {
  const { company_id, payload } = job;
  const slug = payload.company_slug;

  let siteName: string;
  let apiKey: string;
  let apiSecret: string;

  if (env.ERPNEXT_PROVISION_URL) {
    if (!env.ERPNEXT_PROVISION_SECRET) throw new Error('erpnext_provision_secret_not_configured');
    ({ siteName, apiKey, apiSecret } = await provisionViaRemoteShim(
      env.ERPNEXT_PROVISION_URL,
      env.ERPNEXT_PROVISION_SECRET,
      slug,
    ));
  } else {
    const composeDir = env.FRAPPE_DOCKER_DIR;
    if (!composeDir) throw new Error('frappe_docker_dir_not_configured');
    siteName = `erp-${slug}.localhost`;
    ({ apiKey, apiSecret } = await provisionViaLocalExec(composeDir, siteName));
  }

  // Browser-facing deep links ("Open Lead list", "Create Lead", etc. in erpnextSales.ts)
  // must NOT use ERPNEXT_NGINX_URL — that shared hostname's Caddy vhost has no
  // header_up X-Frappe-Site-Name, so it relies on the caller sending that header
  // explicitly, which only server-to-server fetch() calls do. A browser navigating
  // there directly gets a Frappe "does not exist" 404 (no site could be resolved).
  // The per-company subdomain's Caddy vhost injects the header itself from the
  // subdomain, so it works for plain browser navigation — same subdomain used for
  // the SSO redirect below. Only set in production (ERPNEXT_PROVISION_URL); local
  // dev's ERPNEXT_NGINX_URL is already a real browser-reachable localhost URL.
  const deskUrl = env.ERPNEXT_PROVISION_URL ? `https://${slug}.${env.ERPNEXT_SUBDOMAIN_BASE}` : undefined;

  const { error } = await supabaseAdmin.from('integration_connections').upsert({
    company_id,
    integration_id: 'int-erpnext',
    account_name: `WorkOS · ${siteName}`,
    sandbox_mode: false,
    access_token_enc: encrypt(apiKey),
    refresh_token_enc: encrypt(apiSecret),
    metadata: { site_url: env.ERPNEXT_NGINX_URL, site_name: siteName, desk_url: deskUrl },
  }, { onConflict: 'company_id,integration_id' });

  if (error) throw new Error(`erpnext_provision_persist_failed:${error.message}`);

  const creds: ErpNextCreds = { siteUrl: env.ERPNEXT_NGINX_URL, siteName, apiKey, apiSecret, deskUrl };
  await applyWorkosBranding(creds);
  await provisionUsersAndRoles(company_id, creds);

  if (env.ERPNEXT_PROVISION_URL && env.OIDC_ISSUER_URL) {
    await provisionSsoBridge(company_id, slug, creds);
  }
}

// Pre-provisions a real Frappe System User (with roles from the Phase 0
// mapping) for every active member who should have ERPNext access at all —
// deliberately not left to Frappe's own OAuth auto-provisioning, which only
// supports one static default role for everyone (see erpnextRoleMapping.ts
// and Social Login Key's sign_ups=Deny in adapters/erpnext.ts).
async function provisionUsersAndRoles(companyId: string, creds: ErpNextCreds): Promise<void> {
  const { rows: members } = await pool.query<{ user_id: string; role: RoleId }>(
    `select user_id, role from public.company_members where company_id = $1 and status = 'active'`,
    [companyId],
  );

  for (const member of members) {
    const roles = await computeFrappeRoles(companyId, member.user_id, member.role);
    if (!roles || roles.length === 0) continue; // viewer/investor, or no department grants at all

    const { data: userResult, error: userErr } = await supabaseAdmin.auth.admin.getUserById(member.user_id);
    if (userErr || !userResult?.user?.email) {
      log.error({ companyId, userId: member.user_id, err: String(userErr) }, 'erpnext role sync: user lookup failed, skipping');
      continue;
    }
    const meta = userResult.user.user_metadata ?? {};
    await upsertFrappeUser(creds, {
      email: userResult.user.email,
      firstName: String(meta.first_name ?? userResult.user.email.split('@')[0]),
      lastName: meta.last_name ? String(meta.last_name) : undefined,
      roles,
    });
  }
}

async function provisionSsoBridge(companyId: string, slug: string, creds: ErpNextCreds): Promise<void> {
  const redirectUrl = `https://${slug}.${env.ERPNEXT_SUBDOMAIN_BASE}/api/method/frappe.integrations.oauth2_logins.custom/workos`;
  const { clientId, clientSecret } = await registerOidcClient(companyId, redirectUrl);
  await upsertSocialLoginKey(creds, {
    providerName: 'workos',
    clientId,
    clientSecret,
    authorizeUrl: `${env.FRONTEND_URL}/oauth/authorize`,
    oidcBaseUrl: `${env.OIDC_ISSUER_URL}`,
    redirectUrl,
  });
}

// ── Dedicated poller — deliberately separate from src/jobs/runner.ts's loop, since
// that one is tied to public.ingestion_jobs (file_id NOT NULL, kind locked to
// 'normalize' by a CHECK constraint) and can't be reused for a non-file-based job
// without altering a table another feature depends on. ──

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function pickOneProvisionJob(): Promise<ProvisionJob | null> {
  const { rows } = await pool.query(
    `
    update public.erpnext_provision_jobs
       set status = 'running',
           attempts = attempts + 1,
           started_at = coalesce(started_at, now()),
           locked_until = now() + ($2 || ' minutes')::interval,
           locked_by = $1
     where id = (
       select id
         from public.erpnext_provision_jobs
        where target_env = $3
          and (
          (status = 'pending' and (locked_until is null or locked_until < now()))
          or (status = 'running' and locked_until is not null and locked_until < now())
        )
        order by created_at
        for update skip locked
        limit 1
     )
     returning *;
    `,
    [env.WORKER_ID, String(LOCK_MINUTES), provisionEnv],
  );
  return rows[0] ?? null;
}

async function finishProvisionOk(jobId: string) {
  await pool.query(
    `update public.erpnext_provision_jobs
        set status = 'complete', completed_at = now(), locked_until = null, locked_by = null
      where id = $1`,
    [jobId],
  );
}

async function finishProvisionErr(job: ProvisionJob, err: Error) {
  const shouldRetry = job.attempts < job.max_attempts;
  const nextStatus = shouldRetry ? 'pending' : 'failed';
  const backoffMs = Math.min(30000, 2000 * 2 ** job.attempts);

  await pool.query(
    `
    update public.erpnext_provision_jobs
       set status = $2,
           last_error = $3,
           locked_until = case when $2 = 'pending' then now() + interval '1 millisecond' * $4 else null end,
           locked_by = null
     where id = $1
    `,
    [job.id, nextStatus, err.message.slice(0, 500), backoffMs],
  );
}

export function startErpnextProvisionWorker() {
  let running = true;
  process.on('SIGINT', () => { running = false; });
  process.on('SIGTERM', () => { running = false; });

  // Only claims jobs tagged for this environment — a local worker never touches
  // 'remote' (prod) jobs and vice-versa (see config.ts provisionEnv + migration 033).
  log.info({ provisionEnv }, 'erpnext provision worker started');

  (async () => {
    while (running) {
      try {
        const job = await pickOneProvisionJob();
        if (!job) {
          await sleep(POLL_MS);
          continue;
        }

        log.info({ jobId: job.id, companyId: job.company_id }, 'picked erpnext provision job');
        try {
          await provisionErpnextSite(job);
          await finishProvisionOk(job.id);
          log.info({ jobId: job.id }, 'erpnext provision job complete');
        } catch (err: any) {
          await finishProvisionErr(job, err instanceof Error ? err : new Error(String(err)));
          log.error({ jobId: job.id, err: String(err) }, 'erpnext provision job failed');
        }
      } catch (err: any) {
        log.error({ err: String(err) }, 'erpnext provision worker loop iteration failed');
        await sleep(POLL_MS);
      }
    }
  })();
}
