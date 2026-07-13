/**
 * Delete a user account by email — Supabase auth.users + all dependent rows.
 *
 * Usage:
 *   npx tsx scripts/delete-account-by-email.ts <email>              # dry run (default, no changes)
 *   npx tsx scripts/delete-account-by-email.ts <email> --confirm     # actually deletes
 *
 * What this does:
 *   1. Looks up the user by exact email match in auth.users.
 *   2. Reports every row across the schema that references this user
 *      (own rows that will cascade-delete, and rows where they're just
 *      referenced as inviter/reviewer/creator that would otherwise block
 *      the delete with a foreign-key violation).
 *   3. In --confirm mode only: inside a single Postgres transaction,
 *      nulls out / removes those non-cascading references, then calls
 *      Supabase's admin deleteUser (which cascades user_profiles,
 *      company_members, join_requests, onboarding_progress for THIS user
 *      via ON DELETE CASCADE).
 *
 * Without --confirm, nothing is written to the database — it only prints
 * what it found. Review the dry-run output carefully before re-running
 * with --confirm.
 */
import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { Pool } from 'pg';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const DATABASE_URL = process.env.DATABASE_URL;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !DATABASE_URL) {
  console.error('Error: SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, or DATABASE_URL missing from environment.');
  process.exit(1);
}

const supabaseAdmin = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const pool = new Pool({ connectionString: DATABASE_URL });

// Tables where this user is referenced as inviter/reviewer/creator, NOT as
// the row's own subject. These have no ON DELETE CASCADE, so they must be
// cleared before auth.users can be deleted, or Postgres will reject it.
const NULLABLE_REFERENCE_CLEANUPS: { table: string; column: string }[] = [
  { table: 'company_members',    column: 'invited_by' },
  { table: 'company_members',    column: 'approved_by' },
  { table: 'join_requests',      column: 'reviewed_by' },
  { table: 'investor_pipeline',  column: 'created_by' },
  { table: 'investor_updates',   column: 'created_by' },
  { table: 'vc_mentors',         column: 'added_by' },
  { table: 'mentor_sessions',    column: 'created_by' },
];

// workspace_invites.created_by is NOT NULL with no cascade — these are the
// user's own invite links, so the only safe option is to delete them.
const OWN_ROWS_TO_DELETE: { table: string; column: string }[] = [
  { table: 'workspace_invites',   column: 'created_by' },
  { table: 'onboarding_progress', column: 'user_id' },
];

// Rows that already cascade automatically when auth.users is deleted —
// listed here only so the dry-run report can show them.
const CASCADING_TABLES: { table: string; column: string }[] = [
  { table: 'user_profiles',   column: 'id' },
  { table: 'company_members', column: 'user_id' },
  { table: 'join_requests',   column: 'user_id' },
];

async function findUserIdByEmail(email: string): Promise<string | null> {
  const { rows } = await pool.query<{ id: string }>(
    'SELECT id FROM auth.users WHERE email = $1 LIMIT 1',
    [email],
  );
  return rows[0]?.id ?? null;
}

async function countRows(table: string, column: string, userId: string): Promise<number> {
  const { rows } = await pool.query<{ count: string }>(
    `SELECT COUNT(*)::text AS count FROM ${table} WHERE ${column} = $1`,
    [userId],
  );
  return Number(rows[0]?.count ?? 0);
}

async function printDryRunReport(userId: string, email: string) {
  console.log(`\nDry run — no changes will be made. Account: ${email} (${userId})\n`);

  console.log('Rows that will be deleted automatically (ON DELETE CASCADE):');
  for (const { table, column } of CASCADING_TABLES) {
    console.log(`  ${table}: ${await countRows(table, column, userId)}`);
  }

  console.log('\nRows that will be deleted (own data, no cascade defined):');
  for (const { table, column } of OWN_ROWS_TO_DELETE) {
    console.log(`  ${table}: ${await countRows(table, column, userId)}`);
  }

  console.log('\nReferences that will be set to NULL (this user was inviter/reviewer/creator, row itself belongs to someone else):');
  for (const { table, column } of NULLABLE_REFERENCE_CLEANUPS) {
    console.log(`  ${table}.${column}: ${await countRows(table, column, userId)}`);
  }

  console.log('\nNo changes made. Re-run with --confirm to perform the deletion.');
}

async function performDeletion(userId: string, email: string) {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');

    for (const { table, column } of NULLABLE_REFERENCE_CLEANUPS) {
      await client.query(`UPDATE ${table} SET ${column} = NULL WHERE ${column} = $1`, [userId]);
    }
    for (const { table, column } of OWN_ROWS_TO_DELETE) {
      await client.query(`DELETE FROM ${table} WHERE ${column} = $1`, [userId]);
    }

    await client.query('COMMIT');
    console.log('Dependent-row cleanup committed.');
  } catch (err) {
    await client.query('ROLLBACK');
    console.error('Cleanup failed, rolled back. Auth user was NOT deleted.', err);
    throw err;
  } finally {
    client.release();
  }

  const { error } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (error) {
    console.error('auth.admin.deleteUser failed after cleanup committed. You may need to retry just the deleteUser step.', error);
    process.exit(1);
  }

  console.log(`\nDeleted account ${email} (${userId}). user_profiles, company_members, join_requests, and onboarding_progress for this user are gone.`);
}

async function main() {
  const email = process.argv[2];
  const confirm = process.argv.includes('--confirm');

  if (!email || email.startsWith('--')) {
    console.error('Usage: npx tsx scripts/delete-account-by-email.ts <email> [--confirm]');
    process.exit(1);
  }

  const userId = await findUserIdByEmail(email);
  if (!userId) {
    console.log(`No account found for ${email}. Nothing to do.`);
    process.exit(0);
  }

  if (!confirm) {
    await printDryRunReport(userId, email);
    return;
  }

  await printDryRunReport(userId, email);
  console.log('\n--confirm passed — proceeding with deletion in 3 seconds... (Ctrl+C to abort)');
  await new Promise(resolve => setTimeout(resolve, 3000));
  await performDeletion(userId, email);
}

main()
  .catch(err => {
    console.error('Unexpected error:', err);
    process.exit(1);
  })
  .finally(() => pool.end());
