// Minimal SQL runner — applies a .sql file to DATABASE_URL (from apps/backend/.env).
// Usage (from apps/backend):  node scripts/apply-sql.mjs db/migrations/048_pms_supercycle.sql
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import 'dotenv/config';
import pg from 'pg';

const { Pool } = pg;

const file = process.argv[2];
if (!file) {
  console.error('usage: node scripts/apply-sql.mjs <path-to-sql-file>');
  process.exit(1);
}
const url = process.env.DATABASE_URL;
if (!url) {
  console.error('DATABASE_URL is not set — run this from apps/backend so it reads apps/backend/.env');
  process.exit(1);
}

const sql = readFileSync(resolve(process.cwd(), file), 'utf8');
const needsSsl = /supabase\.(com|co)/i.test(url) || /sslmode=(require|verify)/i.test(url);
const pool = new Pool({ connectionString: url, ...(needsSsl ? { ssl: { rejectUnauthorized: false } } : {}) });

try {
  await pool.query(sql);
  console.log('✅ applied:', file);
} catch (err) {
  console.error('❌ failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
