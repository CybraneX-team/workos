import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

const root = path.resolve(import.meta.dirname, '../../..');

async function sourceFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const nested = await Promise.all(entries.map(async entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) return sourceFiles(target);
    return /\.(ts|tsx)$/.test(entry.name) ? [target] : [];
  }));
  return nested.flat();
}

test('native migration owns the Phase 1 tables and destructive cleanup', async () => {
  const sql = await readFile(path.join(root, 'apps/backend/db/migrations/042_native_crm_catalog.sql'), 'utf8');
  for (const table of ['crm_accounts', 'crm_contacts', 'crm_leads', 'crm_deals', 'catalog_groups', 'catalog_products', 'inventory_balances', 'meta_lead_form_bindings']) {
    assert.match(sql, new RegExp(`CREATE TABLE public\\.${table}\\b`));
  }
  for (const obsolete of ['erpnext_command_outbox', 'erpnext_provision_jobs', 'oidc_auth_codes', 'oidc_access_tokens', 'oidc_clients']) {
    assert.match(sql, new RegExp(`DROP TABLE IF EXISTS public\\.${obsolete}\\b`));
  }
  assert.match(sql, /UNIQUE\(company_id,product_id,warehouse_name\)/);
  assert.match(sql, /FOREIGN KEY\(company_id,converted_deal_id\)/);
});

test('native tables are backend-only after the broad baseline grant', async () => {
  const sql = await readFile(path.join(root, 'apps/backend/db/migrations/043_native_business_security.sql'), 'utf8');
  for (const table of ['crm_accounts', 'crm_contacts', 'crm_leads', 'crm_deals', 'catalog_groups', 'catalog_products', 'inventory_balances', 'meta_lead_form_bindings']) {
    assert.match(sql, new RegExp(`public\\.${table}\\b`));
  }
  assert.match(sql, /REVOKE ALL PRIVILEGES[\s\S]*FROM anon, authenticated/i);
  assert.match(sql, /GRANT ALL PRIVILEGES[\s\S]*TO service_role/i);
  const mirror = await readFile(path.join(root, 'apps/frontend/supabase/migrations/20260810100000_native_business_security.sql'), 'utf8');
  assert.equal(mirror, sql);
});

test('runtime source cannot restore the removed integration surface', async () => {
  const files = [...await sourceFiles(path.join(root, 'apps/backend/src')), ...await sourceFiles(path.join(root, 'apps/frontend/src'))];
  const forbidden = [/ERPNEXT_/i, /FRAPPE_/i, /\/api\/erpnext/i, /\/api\/resource/i, /control-plane/i, /erpnext credential/i];
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    for (const pattern of forbidden) assert.equal(pattern.test(source), false, `${path.relative(root, file)} contains ${pattern}`);
  }
});

test('workspace manifests cannot restore removed ERP packages or scripts', async () => {
  for (const relative of ['package.json', 'pnpm-workspace.yaml', 'apps/backend/package.json', 'apps/frontend/package.json']) {
    const source = await readFile(path.join(root, relative), 'utf8');
    assert.doesNotMatch(source, /erpnext|frappe|control-plane/i, `${relative} restores a removed dependency`);
  }
});
