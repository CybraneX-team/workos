import 'dotenv/config';
import { execFile } from 'node:child_process';
import { mkdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { promisify } from 'node:util';
import { createClient, type User } from '@supabase/supabase-js';
import pg from 'pg';

const execFileAsync = promisify(execFile);
const CONFIRMATION = 'DELETE_SHARED_WORKOS_DEVELOPMENT_DATA';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

function requiredEnvironment(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is required`);
  return value;
}

async function listAuthUsers(admin: ReturnType<typeof createClient>): Promise<User[]> {
  const users: User[] = [];
  for (let page = 1; ; page += 1) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 1000 });
    if (error) throw error;
    users.push(...data.users);
    if (data.users.length < 1000) return users;
  }
}

async function localSites(composeDirectory: string): Promise<string[]> {
  const { stdout } = await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', 'list-sites'], {
    cwd: composeDirectory,
    timeout: 30_000,
  });
  return stdout.split(/\s+/).filter(site => /^erp-[a-z0-9-]+\.localhost$/.test(site));
}

async function main() {
  const databaseUrl = requiredEnvironment('DATABASE_URL');
  const supabaseUrl = requiredEnvironment('SUPABASE_URL');
  const serviceRoleKey = requiredEnvironment('SUPABASE_SERVICE_ROLE_KEY');
  const projectRef = new URL(supabaseUrl).hostname.split('.')[0];
  const composeDirectory = path.resolve(argument('frappe-dir') ?? process.env.FRAPPE_DOCKER_DIR ?? '../../../infra/erpnext');
  const execute = process.argv.includes('--execute');
  const confirmedPhrase = argument('confirm');
  const confirmedProject = argument('project-ref');

  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  const admin = createClient(supabaseUrl, serviceRoleKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const users = await listAuthUsers(admin);
  const { rows: companyRows } = await pool.query<{ count: string }>('select count(*)::text as count from public.companies');
  const sites = await localSites(composeDirectory);

  console.log(JSON.stringify({
    mode: execute ? 'execute' : 'dry-run',
    sharedSupabaseProjectRef: projectRef,
    companies: Number(companyRows[0]?.count ?? 0),
    authUsers: users.length,
    localFrappeSites: sites,
    productionFrappeSitesWillBeDeleted: false,
  }, null, 2));

  if (!execute) {
    console.log(`Dry run only. Execute with --execute --confirm=${CONFIRMATION} --project-ref=${projectRef}`);
    await pool.end();
    return;
  }
  if (confirmedPhrase !== CONFIRMATION) throw new Error(`Exact --confirm=${CONFIRMATION} is required`);
  if (confirmedProject !== projectRef) throw new Error(`--project-ref must exactly match displayed shared project ref ${projectRef}`);

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const backupDirectory = path.resolve('../../backups/development-reset');
  const databaseBackup = path.join(backupDirectory, `workos-${projectRef}-${timestamp}.dump`);
  await mkdir(backupDirectory, { recursive: true });
  const database = new URL(databaseUrl);
  await execFileAsync('pg_dump', ['--format=custom', '--file', databaseBackup], {
    env: {
      ...process.env,
      PGHOST: database.hostname,
      PGPORT: database.port || '5432',
      PGUSER: decodeURIComponent(database.username),
      PGPASSWORD: decodeURIComponent(database.password),
      PGDATABASE: decodeURIComponent(database.pathname.replace(/^\//, '')),
      PGSSLMODE: database.searchParams.get('sslmode') ?? 'require',
    },
    timeout: 10 * 60_000,
  });
  for (const site of sites) {
    await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', '--site', site, 'backup', '--with-files'], {
      cwd: composeDirectory,
      timeout: 5 * 60_000,
    });
  }
  console.log(`Backups completed: ${databaseBackup}${sites.length ? ' plus Frappe site backups in the sites volume' : ''}`);

  const client = await pool.connect();
  try {
    await client.query('begin');
    await client.query(`do $reset$
      declare table_name text;
      begin
        foreach table_name in array array[
          'public.oidc_auth_codes','public.oidc_access_tokens','public.oidc_clients',
          'public.erpnext_command_outbox','public.erpnext_provision_jobs','public.integration_connections',
          'public.company_members','public.profiles','public.companies'
        ] loop
          if to_regclass(table_name) is not null then
            execute format('truncate table %s cascade', table_name);
          end if;
        end loop;
        if exists(select 1 from pg_namespace where nspname='erpnext') then
          for table_name in select quote_ident(schemaname)||'.'||quote_ident(tablename) from pg_tables where schemaname='erpnext' loop
            execute format('truncate table %s cascade', table_name);
          end loop;
        end if;
      end $reset$;`);
    await client.query('commit');
  } catch (error) {
    await client.query('rollback');
    throw error;
  } finally {
    client.release();
  }

  // Some application-owned records (for example incubator cohorts) are owned
  // directly by auth.users rather than by a company FK. Discover those edges
  // from PostgreSQL instead of maintaining a brittle table list. Required
  // owner references make the row user-owned, so truncate that table; optional
  // audit references can be nulled while retaining shared reference catalogs.
  await pool.query(`do $auth_refs$
    declare ref record;
    begin
      for ref in
        select n.nspname as schema_name, c.relname as table_name, a.attname as column_name, a.attnotnull
        from pg_constraint con
        join pg_class c on c.oid=con.conrelid
        join pg_namespace n on n.oid=c.relnamespace
        join unnest(con.conkey) key(attnum) on true
        join pg_attribute a on a.attrelid=c.oid and a.attnum=key.attnum
        where con.contype='f' and con.confrelid='auth.users'::regclass and n.nspname='public'
      loop
        if ref.attnotnull then
          execute format('truncate table %I.%I cascade', ref.schema_name, ref.table_name);
        else
          execute format('update %I.%I set %I=null where %I is not null', ref.schema_name, ref.table_name, ref.column_name, ref.column_name);
        end if;
      end loop;
    end $auth_refs$;`);

  let authApiFailed = false;
  for (const user of users) {
    const { error } = await admin.auth.admin.deleteUser(user.id);
    if (error) {
      authApiFailed = true;
      console.warn(`Supabase Auth Admin API deletion failed for ${user.id}; falling back to the project owner's direct auth.users deletion.`);
      break;
    }
  }
  if (authApiFailed) {
    await pool.query('delete from auth.users');
  }
  const referenceSeedPath = path.resolve('../frontend/supabase/migrations/20260628210100_baseline_reference_seed.sql');
  const roleSeed = (await readFile(referenceSeedPath, 'utf8'))
    .split('\n')
    .filter(line => line.startsWith('INSERT INTO public.roles '))
    .map(line => line.replace(/;\s*$/, ' ON CONFLICT (id) DO NOTHING;'))
    .join('\n');
  if (!roleSeed) throw new Error(`System role seed not found at ${referenceSeedPath}`);
  await pool.query(roleSeed);
  for (const site of sites) {
    await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', 'drop-site', site,
      '--force', '--no-backup', '--mariadb-root-password', process.env.FRAPPE_DB_ROOT_PASSWORD ?? 'admin'], {
      cwd: composeDirectory,
      timeout: 2 * 60_000,
    });
  }
  await pool.end();
  console.log(`Development reset complete for shared Supabase project ${projectRef}. Removed ${users.length} auth users and ${sites.length} local Frappe sites.`);
}

main().catch(error => {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
});
