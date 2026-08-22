import assert from 'node:assert/strict';
import test from 'node:test';
import { Pool } from 'pg';

const enabled = process.env.BDT_TASKS_DB_TESTS === '1';
const maybe = enabled ? test : test.skip;

maybe('BDT task schema is backend-only and enforces task invariants', async () => {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });
  try {
    const { rows } = await pool.query<{ has_table: boolean; has_resources: boolean; has_old_table: boolean; browser_access: boolean }>(`
      select to_regclass('public.bdt_tasks') is not null as has_table,
        to_regclass('public.bdt_action_resources') is not null as has_resources,
        to_regclass('public.commercial_tasks') is not null as has_old_table,
        has_table_privilege('authenticated','public.bdt_tasks','select') as browser_access`);
    assert.equal(rows[0].has_table, true);
    assert.equal(rows[0].has_resources, true);
    assert.equal(rows[0].has_old_table, false);
    assert.equal(rows[0].browser_access, false);
    const checks = await pool.query<{ conname: string }>(`
      select conname from pg_constraint where conrelid='public.bdt_tasks'::regclass and contype='c'`);
    assert.ok(checks.rows.length >= 4);
  } finally {
    await pool.end();
  }
});
