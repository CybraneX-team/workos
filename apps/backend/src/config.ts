import 'dotenv/config';
import { z } from 'zod';

const EnvSchema = z.object({
  PORT: z.string().default('8080'),
  SUPABASE_URL: z.string().url(),
  SUPABASE_ANON_KEY: z.string().min(1),
  SUPABASE_SERVICE_ROLE_KEY: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  WORKER_ID: z.string().default(`w-${process.pid}`),
  GEMINI_API_KEY: z.string().optional(),
  GEMINI_MODEL: z.string().default('gemini-2.5-flash'),
  // ERPNext inventory + CRM chat — per-company site provisioning (see erpnextProvision.ts).
  // Shared nginx endpoint every per-company site is reached through (site selection
  // happens via the X-Frappe-Site-Name header, not the URL).
  ERPNEXT_NGINX_URL: z.string().default('http://localhost:8081'),
  // Local path to the frappe_docker checkout (infra/erpnext) — needed to shell out
  // `docker compose exec` for site provisioning. Local dev only; set FRAPPE_DOCKER_DIR
  // XOR ERPNEXT_PROVISION_URL depending on environment (see erpnextProvision.ts).
  FRAPPE_DOCKER_DIR: z.string().optional(),
  FRAPPE_DB_ROOT_PASSWORD: z.string().optional(),
  FRAPPE_SITE_ADMIN_PASSWORD: z.string().optional(),
  // Production provisioning: the backend has no docker socket access on Azure Container
  // Apps, so it calls a small remote shim (running on the ERPNext VM) over HTTPS instead
  // of shelling out to `docker compose exec` locally.
  ERPNEXT_PROVISION_URL: z.string().optional(),
  ERPNEXT_PROVISION_SECRET: z.string().optional(),
  // SSO into per-company ERPNext desk UI (see routes/oidc.ts, lib/erpnextRoleMapping.ts).
  // Only wired up on the remote-provisioning (Azure) path — local dev has no per-company
  // subdomain routing (Phase 1 was built against the ERPNext VM only), so a Social Login
  // Key would have nowhere reachable to redirect to. Frappe Users + roles are still
  // provisioned locally; only the SSO bridge itself is skipped.
  OIDC_ISSUER_URL: z.string().optional(),
  ERPNEXT_SUBDOMAIN_BASE: z.string().default('erp.os.cybranex.com'),
  OPENAI_API_KEY: z.string().optional(),
  OPENAI_RESPONSES_MODEL: z.string().default('gpt-4.1-mini'),
  OPENAI_RESPONSES_MAX_OUTPUT_TOKENS: z.coerce.number().int().positive().default(12000),
  OPENAI_RESPONSES_MAX_RESEARCH_TOKENS: z.coerce.number().int().positive().default(16000),
  RUN_WORKER: z
    .enum(['true', 'false'])
    .default('true')
    .transform((v) => v === 'true'),
  // Encryption key for storing OAuth tokens: 64 hex chars (32 bytes)
  // Generate with: openssl rand -hex 32
  ENCRYPTION_KEY: z.string().length(64).optional(),
  // Google OAuth — required for live Google Analytics connections
  GOOGLE_CLIENT_ID: z.string().optional(),
  GOOGLE_CLIENT_SECRET: z.string().optional(),
  GOOGLE_REDIRECT_URI: z.string().optional(),
  // Meta (Facebook) OAuth — required for live Meta Ads connections
  META_APP_ID: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_REDIRECT_URI: z.string().optional(),
  // Frontend URL — used for CORS and OAuth redirect back
  FRONTEND_URL: z.string().default('http://localhost:5173'),
  // Secret shared with Unicorn Simulator backend to authenticate provision calls
  SIMULATOR_SECRET: z.string().default('change-me-in-production'),
  // SMTP — used for join-request and invite-credential emails
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.string().default('587'),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().default('Startup Digital Twin <no-reply@startup-digital-twin.com>'),
});

export const env = EnvSchema.parse(process.env);

// Which environment this backend provisions ERPNext sites for. Mirrors the actual
// provisioning path in erpnextProvision.ts: a backend with ERPNEXT_PROVISION_URL set
// creates sites on the remote VM shim ('remote'); one without it shells out to local
// docker ('local'). Used to scope the SHARED erpnext_provision_jobs queue so a local
// dev worker can't claim (and mis-provision) a prod signup's job — see migration 033.
export const provisionEnv: 'remote' | 'local' = env.ERPNEXT_PROVISION_URL ? 'remote' : 'local';
