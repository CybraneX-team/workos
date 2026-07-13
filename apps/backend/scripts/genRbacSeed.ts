/**
 * Regenerates the system-role INSERT block in the baseline reference seed from
 * `SYSTEM_ROLE_PERMISSIONS` — the single source of truth in @cybranex/permissions.
 *
 *   pnpm --filter backend gen:rbac-seed
 *
 * The role rows in baseline_reference_seed.sql are the ONLY thing this touches;
 * every other reference row (industries, reference companies, …) is left as-is.
 * A drift test (test/rbacSeed.test.ts) asserts the committed file matches this
 * generator's output so the seed and the runtime matrix can never diverge.
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  SYSTEM_ROLE_ORDER,
  SYSTEM_ROLE_META,
  SYSTEM_ROLE_PERMISSIONS,
  serializePermissions,
} from '@cybranex/permissions';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendRoot = path.resolve(__dirname, '..');
const repoRoot = path.resolve(backendRoot, '../..');

export const SEED_PATH = path.resolve(
  repoRoot,
  'apps/frontend/supabase/migrations/20260628210100_baseline_reference_seed.sql',
);

/** SQL-escape a single-quoted string literal. */
function sqlString(value: string): string {
  return value.replace(/'/g, "''");
}

/** One `INSERT INTO public.roles …` statement for a system role. */
function roleInsert(id: string): string {
  const meta = SYSTEM_ROLE_META[id as keyof typeof SYSTEM_ROLE_META];
  const permissions = SYSTEM_ROLE_PERMISSIONS[id as keyof typeof SYSTEM_ROLE_PERMISSIONS];
  const json = JSON.stringify(serializePermissions(permissions));
  return (
    `INSERT INTO public.roles (id, name, description, permissions, is_system, is_archived) ` +
    `VALUES ('${sqlString(id)}', '${sqlString(meta.name)}', '${sqlString(meta.description)}', ` +
    `'${sqlString(json)}'::jsonb, 't', 'f');`
  );
}

/**
 * The full role block, including its `-- System roles` header. Roles are emitted
 * in a stable alphabetical-by-id order for a deterministic diff. This exact
 * string is what the generator writes and the drift test compares against.
 */
export function generateRoleInsertsBlock(): string {
  const ids = [...SYSTEM_ROLE_ORDER].sort();
  return ['-- System roles', ...ids.map(roleInsert)].join('\n');
}

/** Replace the role block in the seed file in place, leaving everything else untouched. */
export function regenerateSeedFile(): { changed: boolean } {
  const original = readFileSync(SEED_PATH, 'utf8');
  const block = generateRoleInsertsBlock();
  // Match the `-- System roles` header plus the contiguous run of role INSERTs
  // that follows it (up to the first line that is not a role INSERT).
  const region = /-- System roles\n(?:INSERT INTO public\.roles [^\n]*\n?)+/;
  if (!region.test(original)) {
    throw new Error(`Could not locate the "-- System roles" INSERT block in ${SEED_PATH}`);
  }
  const next = original.replace(region, `${block}\n`);
  const changed = next !== original;
  if (changed) writeFileSync(SEED_PATH, next);
  return { changed };
}

// Run as a script (not when imported by the drift test).
if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { changed } = regenerateSeedFile();
  console.log(
    changed
      ? `[gen:rbac-seed] Updated role INSERTs in ${path.relative(repoRoot, SEED_PATH)}`
      : `[gen:rbac-seed] Role INSERTs already up to date in ${path.relative(repoRoot, SEED_PATH)}`,
  );
}
