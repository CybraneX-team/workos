import fs from 'node:fs';
import path from 'node:path';

export interface RbacE2EEnv {
  appUrl: string;
  backendUrl: string;
  supabaseUrl: string;
  supabaseAnonKey: string;
  supabaseServiceRoleKey: string;
}

let cached: RbacE2EEnv | null = null;

function parseEnvFile(filePath: string): Record<string, string> {
  if (!fs.existsSync(filePath)) return {};

  const out: Record<string, string> = {};
  const lines = fs.readFileSync(filePath, 'utf8').split(/\r?\n/);

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;

    const equalsAt = line.indexOf('=');
    if (equalsAt === -1) continue;

    const key = line.slice(0, equalsAt).trim();
    let value = line.slice(equalsAt + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    out[key] = value;
  }

  return out;
}

function loadLocalEnvFiles() {
  const frontendRoot = process.cwd();
  const backendRoot = path.resolve(frontendRoot, '..', 'startup_digital_twin_backend');

  const localValues = {
    ...parseEnvFile(path.join(frontendRoot, '.env.local')),
    ...parseEnvFile(path.join(backendRoot, '.env')),
  };

  for (const [key, value] of Object.entries(localValues)) {
    process.env[key] ??= value;
  }
}

function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(`Missing ${name}. RBAC E2E tests need frontend .env.local and backend .env values.`);
  }
  return value;
}

function isLocalSupabase(url: string): boolean {
  return /^https?:\/\/(localhost|127\.0\.0\.1|0\.0\.0\.0)(:\d+)?/i.test(url);
}

function assertSafeTarget(env: RbacE2EEnv) {
  const allowSharedDev =
    process.env.RBAC_E2E_ALLOW_SHARED_DEV === 'true' ||
    process.env.RBAC_E2E_ALLOW_SHARED_DEV === '1';

  const allowProd =
    process.env.RBAC_E2E_ALLOW_PROD === 'true' ||
    process.env.RBAC_E2E_ALLOW_PROD === '1';

  if (!isLocalSupabase(env.supabaseUrl) && !allowSharedDev) {
    throw new Error(
      [
        'RBAC E2E refused to run against a remote Supabase project.',
        'These tests create and delete users, companies, memberships, invites, and join requests.',
        'Use local Supabase, or explicitly set RBAC_E2E_ALLOW_SHARED_DEV=true for the shared development project.',
      ].join(' '),
    );
  }

  if (/prod|production/i.test(env.supabaseUrl) && !allowProd) {
    throw new Error(
      'RBAC E2E target looks production-like. Refusing to run without RBAC_E2E_ALLOW_PROD=true.',
    );
  }
}

export function getRbacE2EEnv(): RbacE2EEnv {
  if (cached) return cached;

  loadLocalEnvFiles();

  const appUrl = process.env.E2E_BASE_URL ?? 'http://127.0.0.1:5173';
  const backendUrl = process.env.E2E_BACKEND_URL ?? process.env.VITE_BACKEND_URL ?? 'http://127.0.0.1:8080';

  cached = {
    appUrl,
    backendUrl: backendUrl.replace(/\/+$/, ''),
    supabaseUrl: required(
      'SUPABASE_URL or VITE_SUPABASE_URL',
      process.env.E2E_SUPABASE_URL ?? process.env.SUPABASE_URL ?? process.env.VITE_SUPABASE_URL,
    ),
    supabaseAnonKey: required(
      'SUPABASE_ANON_KEY or VITE_SUPABASE_ANON_KEY',
      process.env.E2E_SUPABASE_ANON_KEY ?? process.env.SUPABASE_ANON_KEY ?? process.env.VITE_SUPABASE_ANON_KEY,
    ),
    supabaseServiceRoleKey: required(
      'SUPABASE_SERVICE_ROLE_KEY',
      process.env.E2E_SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  };

  assertSafeTarget(cached);
  return cached;
}
