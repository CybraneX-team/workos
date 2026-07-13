import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import path from 'node:path';
import test from 'node:test';

async function sourceFiles(directory: string): Promise<string[]> {
  const result: string[] = [];
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const full = path.join(directory, entry.name);
    if (entry.isDirectory()) result.push(...await sourceFiles(full));
    else if (/\.(ts|tsx)$/.test(entry.name)) result.push(full);
  }
  return result;
}

test('WorkOS runtime has no direct Frappe credential or resource access', async () => {
  const root = path.resolve(import.meta.dirname, '../src');
  const files = await sourceFiles(root);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /X-Frappe-Site-Name|\/api\/resource\/|FRAPPE_(?:DOCKER|DB|SITE)|ERPNEXT_NGINX_URL/, file);
    if (!file.endsWith('config.ts')) assert.doesNotMatch(source, /apiSecret|apiKeyEnc|apiSecretEnc/, file);
  }
});

test('control-plane has no WorkOS-domain imports or database reads', async () => {
  const root = path.resolve(import.meta.dirname, '../../erpnext-control-plane/src');
  const files = await sourceFiles(root);
  for (const file of files) {
    const source = await readFile(file, 'utf8');
    assert.doesNotMatch(source, /apps\/backend|\.\.\/\.\.\/backend|public\.(?:companies|company_members|profiles|departments|oidc_|bdt_)/, file);
    assert.doesNotMatch(source, /supabaseAdmin|SUPABASE_(?:URL|SERVICE_ROLE_KEY|ANON_KEY)/, file);
  }
});
