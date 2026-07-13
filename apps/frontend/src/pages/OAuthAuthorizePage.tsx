import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { supabase } from '../lib/supabase';
import { api } from '../lib/api';

// Bridge page for ERPNext SSO: Frappe redirects the browser here (a plain GET
// navigation, so client_id/redirect_uri/state arrive as query params — see
// backend's routes/oidc.ts) when a user clicks "Login with workos" on a
// company's Frappe login page. This page runs same-origin with the already-
// logged-in WorkOS app, so the Supabase session is available in localStorage
// here in a way a bare backend redirect never could be — that's the reason
// this step has to be a frontend page and not just another backend route.
export default function OAuthAuthorizePage() {
  const [params] = useSearchParams();
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const clientId = params.get('client_id');
    const redirectUri = params.get('redirect_uri');
    const state = params.get('state');

    if (!clientId || !redirectUri) {
      setError('Missing client_id or redirect_uri.');
      return;
    }

    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) {
        // Rare path — see OAuthAuthorizePage's file comment. Send them to log
        // in; clicking "Open WorkOS" again afterward starts a fresh flow.
        window.location.href = '/auth';
        return;
      }

      try {
        const { code } = await api.post<{ code: string }>('/api/oidc/authorize', {
          client_id: clientId,
          redirect_uri: redirectUri,
          state,
        });
        const url = new URL(redirectUri);
        url.searchParams.set('code', code);
        if (state) url.searchParams.set('state', state);
        window.location.href = url.toString();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to complete login.');
      }
    })();
  }, [params]);

  return (
    <div style={{
      minHeight: '100vh', display: 'flex', flexDirection: 'column', alignItems: 'center',
      justifyContent: 'center', gap: 16, background: '#0a0a0f', color: '#fff',
    }}>
      {error ? (
        <>
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.6)' }}>Couldn't complete WorkOS login</div>
          <div style={{ fontSize: 12, color: 'rgba(255,80,80,0.8)' }}>{error}</div>
        </>
      ) : (
        <>
          <Loader2 size={20} className="animate-spin" />
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)' }}>Connecting to WorkOS…</div>
        </>
      )}
    </div>
  );
}
