import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { env } from '../src/config.js';
import { pool } from '../src/db.js';

const execFileAsync = promisify(execFile);
type SeedKind = 'sales' | 'operations';

function argument(name: string): string | undefined {
  const prefix = `--${name}=`;
  return process.argv.find(value => value.startsWith(prefix))?.slice(prefix.length);
}

async function resolveSite(companyId?: string, siteName?: string): Promise<string> {
  const values: string[] = [env.ERPNEXT_ENV];
  let where = 'environment=$1 and status=\'ready\'';
  if (companyId) { values.push(companyId); where += ` and company_id=$${values.length}`; }
  if (siteName) { values.push(siteName); where += ` and site_name=$${values.length}`; }
  const { rows } = await pool.query<{ site_name: string }>(`select site_name from erpnext.tenants where ${where} order by updated_at desc limit 1`, values);
  if (!rows[0]?.site_name) throw new Error('No matching ready ERPNext tenant found. Pass --company-id or --site-name.');
  return rows[0].site_name;
}

async function main() {
  if (env.ERPNEXT_ENV !== 'local') throw new Error('Seed scripts are local-only.');
  if (!env.FRAPPE_DOCKER_DIR) throw new Error('FRAPPE_DOCKER_DIR is not configured.');
  const kind = argument('kind') as SeedKind | undefined;
  if (kind !== 'sales' && kind !== 'operations') throw new Error('--kind=sales or --kind=operations is required.');
  const siteName = await resolveSite(argument('company-id'), argument('site-name'));
  const filename = `erpnext_${kind}_seed.py`;
  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), filename);
  const containerPath = `/home/frappe/frappe-bench/apps/frappe/frappe/${kind}_seed.py`;
  await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'cp', scriptPath, `backend:${containerPath}`], { cwd: env.FRAPPE_DOCKER_DIR, timeout: 30_000 });
  const { stdout, stderr } = await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', '--site', siteName,
    'execute', `frappe.${kind}_seed.seed`], { cwd: env.FRAPPE_DOCKER_DIR, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 });
  if (stderr.trim()) process.stderr.write(stderr);
  process.stdout.write(stdout);
}

main().catch(error => { console.error(error instanceof Error ? error.message : error); process.exitCode = 1; }).finally(() => pool.end());
