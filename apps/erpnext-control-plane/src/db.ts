import { Pool, type PoolConfig } from 'pg';
import { env } from './config.js';

function config(): PoolConfig {
  const ssl = /supabase\.com/i.test(env.DATABASE_URL) || /sslmode=(require|verify-ca|verify-full)/i.test(env.DATABASE_URL);
  return { connectionString: env.DATABASE_URL, max: 10, connectionTimeoutMillis: 10_000, idleTimeoutMillis: 30_000, ...(ssl ? { ssl: { rejectUnauthorized: false } } : {}) };
}

export const pool = new Pool(config());
pool.on('error', err => console.error('[erpnext-control-plane][db]', err.message));
