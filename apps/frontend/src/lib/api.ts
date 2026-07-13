import { supabase } from './supabase';

const rawBase = String(import.meta.env.VITE_BACKEND_URL ?? 'http://localhost:8080');
const BASE = rawBase.replace(/\/+$/, '');
const rawTimeout = Number(import.meta.env.VITE_BACKEND_TIMEOUT_MS);
const REQUEST_TIMEOUT_MS = Number.isFinite(rawTimeout) && rawTimeout > 0 ? rawTimeout : 30000;

async function authed<T>(path: string, init: RequestInit = {}): Promise<T> {
  const { data: { session } } = await supabase.auth.getSession();
  const token = session?.access_token;

  const headers = new Headers(init.headers ?? {});
  if (token) {
    headers.set('Authorization', `Bearer ${token}`);
  }
  if (!(init.body instanceof FormData) && !headers.has('Content-Type') && init.body) {
    headers.set('Content-Type', 'application/json');
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const response = await fetch(`${BASE}${path}`, {
      ...init,
      headers,
      signal: controller.signal,
    });
    if (!response.ok) {
      throw new Error(`${response.status}: ${await response.text()}`);
    }
    return response.json();
  } catch (err) {
    if (err instanceof Error && err.name === 'AbortError') {
      throw new Error(`Request timed out after ${REQUEST_TIMEOUT_MS}ms`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

export const api = {
  get:    <T>(path: string) => authed<T>(path),
  post:   <T>(path: string, body?: FormData | object) =>
    authed<T>(path, {
      method: 'POST',
      body: body instanceof FormData ? body : JSON.stringify(body ?? {}),
    }),
  patch:  <T>(path: string, body?: object) =>
    authed<T>(path, {
      method: 'PATCH',
      body: JSON.stringify(body ?? {}),
    }),
  put:    <T>(path: string, body?: object) =>
    authed<T>(path, {
      method: 'PUT',
      body: JSON.stringify(body ?? {}),
    }),
  delete: <T>(path: string) => authed<T>(path, { method: 'DELETE' }),
};
