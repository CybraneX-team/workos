import { randomBytes } from 'node:crypto';
import express, { Router } from 'express';
import { pool, supabaseAdmin } from '../db.js';
import { authJwt } from '../middleware/authJwt.js';
import { encrypt, decrypt } from '../lib/crypto.js';

export const oidcRouter = Router();

const AUTH_CODE_TTL_MS = 60_000;
const ACCESS_TOKEN_TTL_MS = 5 * 60_000;

function genToken(): string {
  return randomBytes(32).toString('hex');
}

function parseBasicAuth(req: express.Request): { id: string; secret: string } | null {
  const header = req.header('authorization') || '';
  if (!header.startsWith('Basic ')) return null;
  const [id, secret] = Buffer.from(header.slice(6), 'base64').toString('utf8').split(':');
  return id && secret ? { id, secret } : null;
}

// Step 1 (browser, same-origin as the logged-in WorkOS SPA — see frontend's
// /oauth/authorize bridge page): mint a short-lived one-time code for the
// already-authenticated Supabase user, scoped to the requesting client's company.
oidcRouter.post('/authorize', authJwt, async (req, res) => {
  const { client_id, redirect_uri, state } = req.body ?? {};
  if (!client_id || !redirect_uri) {
    return res.status(400).json({ error: 'invalid_request' });
  }
  if (!req.auth?.userId || !req.auth?.companyId) {
    return res.status(403).json({ error: 'no_active_company' });
  }

  const { rows: [client] } = await pool.query(
    `select client_id, company_id, redirect_uri from public.oidc_clients where client_id = $1`,
    [client_id],
  );
  if (!client || client.company_id !== req.auth.companyId || client.redirect_uri !== redirect_uri) {
    return res.status(403).json({ error: 'unauthorized_client' });
  }

  const { data: userResult, error: userErr } = await supabaseAdmin.auth.admin.getUserById(req.auth.userId);
  if (userErr || !userResult?.user?.email) {
    return res.status(500).json({ error: 'user_lookup_failed' });
  }

  const code = genToken();
  await pool.query(
    `insert into public.oidc_auth_codes (code, client_id, user_id, company_id, email, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '1 millisecond' * $6)`,
    [code, client_id, req.auth.userId, req.auth.companyId, userResult.user.email, AUTH_CODE_TTL_MS],
  );

  res.json({ code, state });
});

// Step 2 (server-to-server, Frappe -> us): standard OAuth2 authorization_code
// grant. Client-authenticated via client_id/client_secret (body or HTTP Basic).
oidcRouter.post('/token', express.urlencoded({ extended: true }), async (req, res) => {
  const basic = parseBasicAuth(req);
  const clientId = req.body?.client_id ?? basic?.id;
  const clientSecret = req.body?.client_secret ?? basic?.secret;
  const { grant_type, code, redirect_uri } = req.body ?? {};

  if (grant_type !== 'authorization_code' || !code || !clientId || !clientSecret) {
    return res.status(400).json({ error: 'invalid_request' });
  }

  const { rows: [client] } = await pool.query(
    `select client_id, client_secret_enc, redirect_uri from public.oidc_clients where client_id = $1`,
    [clientId],
  );
  if (!client || decrypt(client.client_secret_enc) !== clientSecret) {
    return res.status(401).json({ error: 'invalid_client' });
  }
  if (redirect_uri && redirect_uri !== client.redirect_uri) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  const { rows: [authCode] } = await pool.query(
    `update public.oidc_auth_codes
        set used_at = now()
      where code = $1 and client_id = $2 and used_at is null and expires_at > now()
      returning user_id, company_id, email`,
    [code, clientId],
  );
  if (!authCode) {
    return res.status(400).json({ error: 'invalid_grant' });
  }

  const accessToken = genToken();
  await pool.query(
    `insert into public.oidc_access_tokens (token, client_id, user_id, company_id, email, expires_at)
     values ($1, $2, $3, $4, $5, now() + interval '1 millisecond' * $6)`,
    [accessToken, clientId, authCode.user_id, authCode.company_id, authCode.email, ACCESS_TOKEN_TTL_MS],
  );

  res.json({ access_token: accessToken, token_type: 'bearer', expires_in: ACCESS_TOKEN_TTL_MS / 1000 });
});

// Step 3 (server-to-server, Frappe -> us): resolve the access token to an
// identity. `email` doubles as `sub` — Frappe's Social Login Key should be
// configured with User ID Property = email, matching how we pre-provision
// each company's Frappe Users (see erpnextProvision.ts).
oidcRouter.get('/userinfo', async (req, res) => {
  const auth = req.header('authorization') || '';
  const token = auth.startsWith('Bearer ') ? auth.slice(7) : '';
  if (!token) return res.status(401).json({ error: 'invalid_token' });

  const { rows: [row] } = await pool.query(
    `select email from public.oidc_access_tokens where token = $1 and expires_at > now()`,
    [token],
  );
  if (!row) return res.status(401).json({ error: 'invalid_token' });

  res.json({ sub: row.email, email: row.email, name: row.email });
});

export async function registerOidcClient(companyId: string, redirectUri: string): Promise<{ clientId: string; clientSecret: string }> {
  return getOrCreateOidcClient(companyId, 'remote', 'workos', redirectUri);
}

export async function getOrCreateOidcClient(
  companyId: string,
  environment: 'local' | 'remote',
  providerName: string,
  redirectUri: string,
): Promise<{ clientId: string; clientSecret: string }> {
  const existing = await pool.query<{ client_id: string; client_secret_enc: string }>(
    `select client_id,client_secret_enc from public.oidc_clients where company_id=$1 and environment=$2 and provider_name=$3`,
    [companyId, environment, providerName],
  );
  if (existing.rows[0]) {
    await pool.query('update public.oidc_clients set redirect_uri=$2 where client_id=$1', [existing.rows[0].client_id, redirectUri]);
    return { clientId: existing.rows[0].client_id, clientSecret: decrypt(existing.rows[0].client_secret_enc) };
  }
  const clientId = `wos_${randomBytes(16).toString('hex')}`;
  const clientSecret = randomBytes(32).toString('hex');
  await pool.query(`insert into public.oidc_clients(client_id,client_secret_enc,company_id,redirect_uri,environment,provider_name)
    values($1,$2,$3,$4,$5,$6) on conflict(company_id,environment,provider_name) do nothing`,
    [clientId, encrypt(clientSecret), companyId, redirectUri, environment, providerName]);
  const created = await pool.query<{ client_id: string; client_secret_enc: string }>(
    `select client_id,client_secret_enc from public.oidc_clients where company_id=$1 and environment=$2 and provider_name=$3`,
    [companyId, environment, providerName],
  );
  return { clientId: created.rows[0].client_id, clientSecret: decrypt(created.rows[0].client_secret_enc) };
}
