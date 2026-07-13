import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { promisify } from 'node:util';
import { env } from '../src/config.js';
import { pool } from '../src/db.js';
import { resolveErpNextCreds } from '../src/lib/erpnextConnection.js';

const execFileAsync = promisify(execFile);

interface Args {
  companyId?: string;
  siteName?: string;
}

function parseArgs(): Args {
  const args: Args = {};
  for (const raw of process.argv.slice(2)) {
    const [key, value] = raw.split('=');
    if (key === '--company-id') args.companyId = value;
    if (key === '--site-name') args.siteName = value;
  }
  return args;
}

async function latestErpNextCompanyId(): Promise<string> {
  const { rows } = await pool.query<{ company_id: string }>(
    `select company_id
       from public.integration_connections
      where integration_id = 'int-erpnext'
      order by connected_at desc nulls last
      limit 1`,
  );
  if (!rows[0]?.company_id) throw new Error('No ERPNext integration connection found.');
  return rows[0].company_id;
}

async function companyIdForSite(siteName: string): Promise<string> {
  const { rows } = await pool.query<{ company_id: string }>(
    `select company_id
       from public.integration_connections
      where integration_id = 'int-erpnext'
        and metadata->>'site_name' = $1
      limit 1`,
    [siteName],
  );
  if (!rows[0]?.company_id) throw new Error(`No ERPNext connection found for site ${siteName}.`);
  return rows[0].company_id;
}

async function main() {
  if (!env.FRAPPE_DOCKER_DIR) throw new Error('FRAPPE_DOCKER_DIR is not configured.');
  const args = parseArgs();
  const companyId = args.companyId ?? (args.siteName ? await companyIdForSite(args.siteName) : await latestErpNextCompanyId());
  const creds = await resolveErpNextCreds(companyId);
  if (!creds) throw new Error(`ERPNext credentials not found for company ${companyId}.`);

  const scriptPath = path.join(path.dirname(fileURLToPath(import.meta.url)), 'erpnext_sales_seed.py');
  const containerPath = '/home/frappe/frappe-bench/apps/frappe/frappe/sales_seed.py';

  await execFileAsync('docker', ['compose', '-f', 'pwd.yml', 'cp', scriptPath, `backend:${containerPath}`], {
    cwd: env.FRAPPE_DOCKER_DIR,
    timeout: 30_000,
  });

  const { stdout, stderr } = await execFileAsync(
    'docker',
    ['compose', '-f', 'pwd.yml', 'exec', '-T', 'backend', 'bench', '--site', creds.siteName, 'execute', 'frappe.sales_seed.seed'],
    { cwd: env.FRAPPE_DOCKER_DIR, timeout: 300_000, maxBuffer: 20 * 1024 * 1024 },
  );

  if (stderr.trim()) process.stderr.write(stderr);
  process.stdout.write(stdout);
}

main()
  .catch((err) => {
    console.error(err instanceof Error ? err.message : err);
    process.exitCode = 1;
  })
  .finally(async () => {
    await pool.end();
  });
