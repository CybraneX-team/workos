import { readFile, readdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

// Applies every migration in filename order, not just 001 — each file is written
// to be idempotent (CREATE/ALTER ... IF NOT EXISTS), so re-running is a no-op and
// no applied-migrations ledger is needed.
const directory = fileURLToPath(new URL('../db/migrations/', import.meta.url));
const files = (await readdir(directory)).filter(name => name.endsWith('.sql')).sort();

for (const file of files) {
  await pool.query(await readFile(new URL(file, `file://${directory}`), 'utf8'));
  console.log(`applied ${file}`);
}

await pool.end();
console.log(`ERPNext control-plane schema is current (${files.length} migration${files.length === 1 ? '' : 's'}).`);
