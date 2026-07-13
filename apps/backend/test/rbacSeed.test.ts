import assert from 'node:assert/strict';
import test from 'node:test';
import { readFileSync } from 'node:fs';
import { SEED_PATH, generateRoleInsertsBlock } from '../scripts/genRbacSeed.js';

/**
 * Guards against drift between the SYSTEM_ROLE_PERMISSIONS matrix (the single
 * source of truth in @cybranex/permissions) and the committed SQL seed. If this
 * fails, run `pnpm --filter backend gen:rbac-seed` to regenerate the seed.
 */
test('baseline_reference_seed.sql role block matches SYSTEM_ROLE_PERMISSIONS', () => {
  const sql = readFileSync(SEED_PATH, 'utf8');
  const region = /-- System roles\n(?:INSERT INTO public\.roles [^\n]*\n?)+/;
  const match = sql.match(region);
  assert.ok(match, 'could not find the system-roles INSERT block in the seed');

  const committed = match[0].trimEnd();
  const generated = generateRoleInsertsBlock().trimEnd();
  assert.equal(committed, generated, 'seed role block is out of date — run `pnpm --filter backend gen:rbac-seed`');
});
