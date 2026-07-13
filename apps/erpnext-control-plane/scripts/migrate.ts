import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { pool } from '../src/db.js';

const path = fileURLToPath(new URL('../db/migrations/001_control_plane.sql', import.meta.url));
await pool.query(await readFile(path, 'utf8'));
await pool.end();
console.log('ERPNext control-plane schema is current.');
