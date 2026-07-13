import React, { createContext, useContext, useEffect, useState } from 'react';
import type { User, Session } from '@supabase/supabase-js';
import { hasSupabaseConfig, supabase } from './supabase';
import type { DbUserProfile, RoleId } from './supabase';
import { api } from './api';
import { hasPermission } from './db/rbac';
import type { RbacAction, ExpandedPermissions, RbacModule } from './db/rbac';

const AUTH_TIMEOUT_MS = Number(import.meta.env.VITE_AUTH_TIMEOUT_MS ?? 15000);

function withTimeout<T>(promise: Promise<T>, timeoutMs: number, message: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const timeoutId = setTimeout(() => reject(new Error(message)), timeoutMs);
    promise
      .then((value) => {
        clearTimeout(timeoutId);
        resolve(value);
      })
      .catch((err) => {
        clearTimeout(timeoutId);
        reject(err);
      });
  });
}

/* ──────────────────────────────────────────────────
   Types
────────────────────────────────────────────────── */
interface AuthState {
  user: User | null;
  session: Session | null;
  profile: DbUserProfile | null;
  loading: boolean;
}

interface AuthContextValue extends AuthState {
  signIn: (email: string, password: string) => Promise<{ error: string | null }>;
  signUp: (email: string, password: string, meta: { first_name: string; last_name: string }) => Promise<{ error: string | null; needsEmailConfirm: boolean }>;
  signOut: () => Promise<void>;
  refreshProfile: () => Promise<void>;
  // Permission helpers
  can: (module: RbacModule, action: 'read' | 'write' | 'delete') => boolean;
  canRead: (module: RbacModule) => boolean;
  canWrite: (module: RbacModule) => boolean;
  canDelete: (module: RbacModule) => boolean;
  role: RoleId | null;
  roleName: string | null;
  isSystemRole: boolean;
  permissions: ExpandedPermissions | null;
  hasCompany: boolean;
  onboardingCompleted: boolean;
}

/* ──────────────────────────────────────────────────
   Context
────────────────────────────────────────────────── */
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<AuthState>({
    user: null,
    session: null,
    profile: null,
    loading: true,
  });

  /* Load profile from DB */
  async function loadProfile(userId: string): Promise<DbUserProfile | null> {
    try {
      return await api.get<DbUserProfile>('/api/me');
    } catch (error) {
      console.error('[auth] loadProfile', userId, error);
      return null;
    }
  }

  async function refreshProfile() {
    if (!state.user) return;
    const profile = await loadProfile(state.user.id);
    setState(s => ({ ...s, profile }));
  }

  /* Bootstrap session */
  useEffect(() => {
    let cancelled = false;
    let timeoutId: ReturnType<typeof setTimeout>;

    const setAuthState = (session: Session | null, profile: DbUserProfile | null) => {
      if (cancelled) return;
      clearTimeout(timeoutId);
      setState({ user: session?.user ?? null, session, profile, loading: false });
    };

    // Safety net: if session restore hangs (e.g. expired token refresh), unblock
    // the UI after 8s so AuthGuard can redirect to /auth instead of spinning forever.
    timeoutId = setTimeout(() => {
      if (!cancelled) setState(s => s.loading ? { ...s, loading: false } : s);
    }, 8000);

    const bootstrap = async () => {
      try {
        const { data: { session }, error } = await supabase.auth.getSession();
        if (error) console.error('[auth] getSession', error);
        const profile = session?.user ? await loadProfile(session.user.id) : null;
        setAuthState(session, profile);
      } catch (err) {
        console.error('[auth] bootstrap failed', err);
        setAuthState(null, null);
      }
    };

    void bootstrap();

    // Skip INITIAL_SESSION — bootstrap() handles the initial state.
    // Only process subsequent auth events (sign-in, sign-out, token refresh).
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (event, session) => {
        if (event === 'INITIAL_SESSION') return;

        // Keep this callback synchronous. Async Supabase calls inside this handler
        // can deadlock auth requests in supabase-js.
        setTimeout(() => {
          void (async () => {
            try {
              const profile = session?.user ? await loadProfile(session.user.id) : null;
              setAuthState(session, profile);
            } catch (err) {
              console.error('[auth] onAuthStateChange failed', err);
              setAuthState(session, null);
            }
          })();
        }, 0);
      }
    );

    return () => {
      cancelled = true;
      clearTimeout(timeoutId);
      subscription.unsubscribe();
    };
  }, []);

  /* Auth actions */
  async function signIn(email: string, password: string) {
    if (!hasSupabaseConfig) {
      return { error: 'Auth is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.' };
    }
    try {
      const { error } = await withTimeout(
        supabase.auth.signInWithPassword({ email, password }),
        AUTH_TIMEOUT_MS,
        `Sign in timed out after ${AUTH_TIMEOUT_MS}ms`,
      );
      return { error: error?.message ?? null };
    } catch (err) {
      console.error('[auth] signIn failed', err);
      return { error: err instanceof Error ? err.message : 'Sign in failed. Please try again.' };
    }
  }

  async function signUp(
    email: string,
    password: string,
    meta: { first_name: string; last_name: string },
  ) {
    if (!hasSupabaseConfig) {
      return {
        error: 'Auth is not configured. Missing VITE_SUPABASE_URL or VITE_SUPABASE_ANON_KEY.',
        needsEmailConfirm: false,
      };
    }
    try {
      const { data, error } = await withTimeout(
        supabase.auth.signUp({
          email,
          password,
          options: { data: meta },
        }),
        AUTH_TIMEOUT_MS,
        `Sign up timed out after ${AUTH_TIMEOUT_MS}ms`,
      );
      // TEMP DEBUG: report the raw Supabase response to the backend so it's visible in
      // backend logs — identities.length === 0 means this email already exists (Supabase's
      // anti-enumeration signUp() returns a fake "success" with no error/session in that case).
      void api.post('/api/debug/log', {
        event: 'signup_attempt',
        email,
        hasError: !!error,
        errorMessage: error?.message ?? null,
        errorStatus: (error as { status?: number } | null)?.status ?? null,
        errorCode: (error as { code?: string } | null)?.code ?? null,
        hasSession: !!data.session,
        userId: data.user?.id ?? null,
        identitiesLength: data.user?.identities?.length ?? null,
        userCreatedAt: data.user?.created_at ?? null,
        userConfirmedAt: data.user?.email_confirmed_at ?? null,
      }).catch(() => { /* debug endpoint failure shouldn't block signup UX */ });
      // If session is returned, email confirmation is disabled — user is already signed in
      return { error: error?.message ?? null, needsEmailConfirm: !data.session && !error };
    } catch (err) {
      console.error('[auth] signUp failed', err);
      return {
        error: err instanceof Error ? err.message : 'Sign up failed. Please try again.',
        needsEmailConfirm: false,
      };
    }
  }

  async function signOut() {
    await supabase.auth.signOut();
    
    // Preserve saved workflows across sessions
    const savedWorkflows = localStorage.getItem('industry_os_saved_workflows_v1');
    
    localStorage.clear();
    sessionStorage.clear();
    
    if (savedWorkflows) {
      localStorage.setItem('industry_os_saved_workflows_v1', savedWorkflows);
    }
    
    setState({ user: null, session: null, profile: null, loading: false });
  }

  /* Permission bindings */
  const role = state.profile?.role ?? null;
  const permissions = state.profile?.permissions ?? null;

  const value: AuthContextValue = {
    ...state,
    signIn,
    signUp,
    signOut,
    refreshProfile,
    role,
    roleName: state.profile?.roleName ?? null,
    isSystemRole: state.profile?.isSystemRole ?? false,
    permissions,
    hasCompany: !!state.profile?.company_id,
    onboardingCompleted: state.profile?.onboarding_completed ?? false,
    can: (module, action: RbacAction) => hasPermission(permissions, module, action),
    canRead: (module) => hasPermission(permissions, module, 'read'),
    canWrite: (module) => hasPermission(permissions, module, 'write'),
    canDelete: (module) => hasPermission(permissions, module, 'delete'),
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/* ──────────────────────────────────────────────────
   Hook
────────────────────────────────────────────────── */
export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
