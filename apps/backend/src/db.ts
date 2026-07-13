import { createClient } from '@supabase/supabase-js';
import { Pool, type PoolConfig } from 'pg';
import { env } from './config.js';

function createPoolConfig(): PoolConfig {
  const connectionString = env.DATABASE_URL;
  const sslMode = (() => {
    try {
      const normalized = connectionString.replace(/^postgresql:/, 'postgres:');
      return new URL(normalized).searchParams.get('sslmode');
    } catch {
      return null;
    }
  })();
  const needsSsl =
    /supabase\.com/i.test(connectionString) ||
    sslMode === 'require' ||
    sslMode === 'verify-ca' ||
    sslMode === 'verify-full';

  return {
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
    keepAlive: true,
    ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}),
  };
}

export const pool = new Pool(createPoolConfig());

// Supabase pooler may drop idle connections; without this handler the process crashes.
pool.on('error', (err) => {
  console.error('[db] idle pool client error (discarding connection):', err.message);
});

export const supabaseAdmin = createClient(
  env.SUPABASE_URL,
  env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { persistSession: false } },
);

export function supabaseForUser(jwt: string) {
  return createClient(env.SUPABASE_URL, env.SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${jwt}` } },
    auth: { persistSession: false },
  });
}

