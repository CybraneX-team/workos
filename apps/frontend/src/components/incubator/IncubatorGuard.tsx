import { Navigate, Outlet } from 'react-router-dom';
import { useAuth } from '../../lib/auth';
import { useIncubatorMe } from '../../lib/db/incubator';
import type { IncubatorProfile } from '../../lib/db/incubator';

export interface IncubatorOutletContext {
  incubator: IncubatorProfile;
  refreshIncubator: () => Promise<void>;
}

function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0c10' }}>
      <div className="w-8 h-8 rounded-full animate-spin" style={{ border: '2px solid #a78bfa', borderTopColor: 'transparent' }} />
    </div>
  );
}

/**
 * Gates the /incubator/* surface (except /incubator/onboarding itself).
 * - Not authenticated at all → /auth (defensive; App.tsx also wraps with AuthGuard)
 * - Authenticated but no incubator record yet → /incubator/onboarding
 * - Otherwise → renders the shell/pages with the incubator profile available
 *   via useOutletContext<IncubatorOutletContext>()
 */
export default function IncubatorGuard() {
  const { user, loading: authLoading } = useAuth();
  const { incubator, loading: incubatorLoading, notOnboarded, refresh } = useIncubatorMe();

  if (authLoading || incubatorLoading) return <FullPageLoader />;
  if (!user) return <Navigate to="/auth" replace />;
  if (notOnboarded || !incubator) return <Navigate to="/incubator/onboarding" replace />;

  return <Outlet context={{ incubator, refreshIncubator: refresh } satisfies IncubatorOutletContext} />;
}
