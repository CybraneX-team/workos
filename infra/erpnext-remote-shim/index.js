const express = require('express');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);

const PORT = process.env.PORT || 3001;
const PROVISION_SECRET = process.env.PROVISION_SECRET;
const FRAPPE_DOCKER_DIR = process.env.FRAPPE_DOCKER_DIR || '/home/erpadmin/frappe_docker';
const FRAPPE_DB_ROOT_PASSWORD = process.env.FRAPPE_DB_ROOT_PASSWORD || 'admin';
const FRAPPE_SITE_ADMIN_PASSWORD = process.env.FRAPPE_SITE_ADMIN_PASSWORD || 'admin';
const BACKEND_SERVICE = 'backend'; // matches pwd.yml's bench container service name

if (!PROVISION_SECRET) {
  console.error('PROVISION_SECRET not set, refusing to start');
  process.exit(1);
}

const SLUG_RE = /^[a-z0-9-]{1,63}$/;
const ONDEMAND_DOMAIN_RE = /^([a-z0-9-]{1,63})\.erp\.os\.cybranex\.com$/;

function parseGenerateKeysOutput(stdout) {
  const parsed = JSON.parse(stdout.trim());
  if (!parsed.api_key || !parsed.api_secret) {
    throw new Error(`generate_keys_unexpected_output:${stdout.slice(0, 200)}`);
  }
  return { apiKey: parsed.api_key, apiSecret: parsed.api_secret };
}

async function siteExists(siteName) {
  try {
    await execFileAsync('docker', [
      'compose', '-f', 'pwd.yml', 'exec', '-T', BACKEND_SERVICE,
      'test', '-d', `sites/${siteName}`,
    ], { cwd: FRAPPE_DOCKER_DIR, timeout: 10_000 });
    return true;
  } catch {
    return false;
  }
}

const app = express();
app.use(express.json());

app.get('/health', (req, res) => res.json({ ok: true }));

// Called by Caddy's on_demand_tls before issuing a cert for a new subdomain —
// only allow issuance for hostnames matching an actually-provisioned site, so
// arbitrary/garbage subdomains can't be used to spam Let's Encrypt on our behalf.
app.get('/ondemand-ask', async (req, res) => {
  const domain = String(req.query.domain || '');
  const match = ONDEMAND_DOMAIN_RE.exec(domain);
  if (!match) return res.sendStatus(403);
  const siteName = `erp-${match[1]}.localhost`;
  res.sendStatus((await siteExists(siteName)) ? 200 : 403);
});

app.use((req, res, next) => {
  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (token !== PROVISION_SECRET) {
    return res.status(401).json({ error: 'unauthorized' });
  }
  next();
});

app.post('/provision', async (req, res) => {
  const slug = String(req.body?.slug || '');
  if (!SLUG_RE.test(slug)) {
    return res.status(400).json({ error: 'invalid_slug' });
  }
  const siteName = `erp-${slug}.localhost`;

  try {
    await execFileAsync('docker', [
      'compose', '-f', 'pwd.yml', 'exec', '-T', BACKEND_SERVICE,
      'bench', 'new-site', siteName,
      '--mariadb-root-password', FRAPPE_DB_ROOT_PASSWORD,
      '--admin-password', FRAPPE_SITE_ADMIN_PASSWORD,
      // Keep this app list in sync with localProvision() in
      // apps/erpnext-control-plane/src/provisionWorker.ts.
      '--install-app', 'erpnext',
      '--install-app', 'crm',
    ], { cwd: FRAPPE_DOCKER_DIR, timeout: 300_000 });

    const { stdout } = await execFileAsync('docker', [
      'compose', '-f', 'pwd.yml', 'exec', '-T', BACKEND_SERVICE,
      'bench', '--site', siteName, 'execute',
      'frappe.core.doctype.user.user.generate_keys',
      '--kwargs', JSON.stringify({ user: 'Administrator' }),
    ], { cwd: FRAPPE_DOCKER_DIR, timeout: 60_000 });

    const { apiKey, apiSecret } = parseGenerateKeysOutput(stdout);
    res.json({ siteName, apiKey, apiSecret });
  } catch (err) {
    console.error('provision failed', err);
    res.status(500).json({ error: 'provision_failed', message: String(err.message || err).slice(0, 500) });
  }
});

app.listen(PORT, '127.0.0.1', () => {
  console.log(`provision shim listening on 127.0.0.1:${PORT}`);
});
