import 'dotenv/config';
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createClient, type User } from '@supabase/supabase-js';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const CONFIRMATION = 'DELETE_SHARED_WORKOS_DEVELOPMENT_DATA';
const argument = (name: string) => process.argv.find(value => value.startsWith(`--${name}=`))?.slice(name.length + 3);
function requiredEnvironment(name: string) { const value = process.env[name]; if (!value) throw new Error(`${name} is required`); return value; }

async function listAuthUsers(admin: ReturnType<typeof createClient>): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function main() {
  const databaseUrl = requiredEnvironment('DATABASE_URL');
  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const execute = process.argv.includes('--execute');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const users = await listAuthUsers(admin);
  const { rows } = await pool.query<{ count: string }>('select count(*)::text count from public.companies');
  console.log(JSON.stringify({ mode: execute ? 'execute' : 'dry-run', sharedSupabaseProjectRef: projectRef, companies: Number(rows[0]?.count ?? 0), authUsers: users.length }, null, 2));
  if (!execute) { console.log(`Dry run only. Execute with --execute --confirm=${CONFIRMATION} --project-ref=${projectRef}`); await pool.end(); return; }
  if (argument('confirm') !== CONFIRMATION) throw new Error(`Exact --confirm=${CONFIRMATION} is required`);
  if (argument('project-ref') !== projectRef) throw new Error(`--project-ref must exactly match displayed shared project ref ${projectRef}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = path.resolve('../../backups/development-reset');
  const databaseBackup = path.join(backupDirectory, `workos-${projectRef}-${timestamp}.dump`);
  await mkdir(backupDirectory, { recursive: true });
  const database = new URL(databaseUrl);
  await execFileAsync('pg_dump', ['--format=custom', '--file', databaseBackup], { env: { ...process.env, PGHOST: database.hostname, PGPORT: database.port || '5432', PGUSER: decodeURIComponent(database.username), PGPASSWORD: decodeURIComponent(database.password), PGDATABASE: decodeURIComponent(database.pathname.replace(/^\//, '')), PGSSLMODE: database.searchParams.get('sslmode') ?? 'require' }, timeout: 10 * 60_000 });

  await pool.query('truncate table public.companies cascade');
  await pool.query(`do $auth_refs$ declare ref record; begin
    for ref in select n.nspname schema_name,c.relname table_name,a.attname column_name,a.attnotnull from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace join unnest(con.conkey) key(attnum) on true join pg_attribute a on a.attrelid=c.oid and a.attnum=key.attnum where con.contype='f' and con.confrelid='auth.users'::regclass and n.nspname='public' loop
      if ref.attnotnull then execute format('truncate table %I.%I cascade',ref.schema_name,ref.table_name); else execute format('update %I.%I set %I=null where %I is not null',ref.schema_name,ref.table_name,ref.column_name,ref.column_name); end if;
    end loop;
  end $auth_refs$;`);
  let fallback = false;
  for (const user of users) { const { error } = await admin.auth.admin.deleteUser(user.id); if (error) { fallback = true; break; } }
  if (fallback) await pool.query('delete from auth.users');
  const referenceSeedPath = path.resolve('../frontend/supabase/migrations/20260628210100_baseline_reference_seed.sql');
  const roleSeed = (await readFile(referenceSeedPath, 'utf8')).split('\n').filter(line => line.startsWith('INSERT INTO public.roles ')).map(line => line.replace(/;\s*$/, ' ON CONFLICT (id) DO NOTHING;')).join('\n');
  if (!roleSeed) throw new Error(`System role seed not found at ${referenceSeedPath}`);
  await pool.query(roleSeed);
  await pool.end();
  console.log(`Development reset complete for shared Supabase project ${projectRef}. Backup: ${databaseBackup}. Removed ${users.length} auth users.`);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; });
