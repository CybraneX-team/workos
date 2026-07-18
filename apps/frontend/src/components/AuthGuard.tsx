import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import type { RbacModule } from '../lib/db/rbac';

interface AuthGuardProps {
  children: React.ReactNode;
  /** If true, redirect to onboarding when company is not set up */
  requireOnboarding?: boolean;
  /** If set, user must have read access to this module */
  requiredModule?: RbacModule;
  /** Permission action required for the module. Defaults to read. */
  requiredAction?: 'read' | 'write' | 'delete';
}

/**
 * Protects routes that require authentication.
 * - Not authenticated  → /auth (with `from` state to redirect back)
 * - Authenticated but no company + requireOnboarding=true → /onboarding or /pending
 * - Missing module permission → /overview with denied notice
 * - Otherwise → renders children
 */
export default function AuthGuard({ children, requireOnboarding = false, requiredModule, requiredAction = 'read' }: AuthGuardProps) {
  const { user, loading, hasCompany, onboardingCompleted, can: canAccess } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#161618' }}>
        <div className="w-8 h-8 rounded-full animate-spin"
          style={{ border: '2px solid #C1AEFF', borderTopColor: 'transparent' }} />
      </div>
    );
  }

  if (!user) {
    return (
      <Navigate
        to="/auth"
        state={{ from: `${location.pathname}${location.search}${location.hash}` }}
        replace
      />
    );
  }

  const activeRole = localStorage.getItem('active_role');
  const isBypassUser = !!user && (activeRole === 'vc' || activeRole === 'incubator');

  if (requireOnboarding && !isBypassUser) {
    // Onboarding completed but no company = waiting for workspace approval
    if (onboardingCompleted && !hasCompany) {
      return <Navigate to="/pending" replace />;
    }
    // Not onboarded yet → go complete onboarding
    if (!hasCompany || !onboardingCompleted) {
      return <Navigate to="/onboarding" replace />;
    }
  }

  // Role-based module gating
  if (requiredModule && !canAccess(requiredModule, requiredAction)) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#161618' }}>
        <div className="text-center px-6">
          <p className="text-white text-lg font-semibold mb-2">Access Restricted</p>
          <p className="text-sm" style={{ color: '#5E5E5E' }}>
            Your role does not have permission to view this page.
          </p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
