import { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { Agentation } from 'agentation';
import { AuthProvider, useAuth } from './lib/auth';
import AuthGuard from './components/AuthGuard';
import TopBar from './components/TopBar';
import Overview from './pages/Overview';
import Twin from './pages/Twin';
import Universe3D from './pages/Universe3D';
import Strategy from './pages/Strategy';
import DataIngestion from './pages/DataIngestion';
import Benchmarks from './pages/Benchmarks';
import RBAC from './pages/RBAC';
import Analytics from './pages/Analytics';
import SettingsPage from './pages/SettingsPage';
import VCConnect from './pages/VCConnect';
import StartupNetwork from './pages/StartupNetwork';
import AuthPage from './pages/AuthPage';
import Onboarding from './pages/Onboarding';
import JoinWorkspace from './pages/JoinWorkspace';
import PendingApproval from './pages/PendingApproval';
import VCFindStartups from './pages/VCFindStartups';
import VCPortfolio from './pages/VCPortfolio';
import VCManage from './pages/VCManage';
import VCAuthPage from './pages/VCAuthPage';
import IncubatorAuthPage from './pages/IncubatorAuthPage';
import LandingNew from './pages/LandingNew';
import PolytopePage from './pages/PolytopePage';
import UniversalPage from './pages/UniversalPage';
import WorkspacePage from './pages/WorkspacePage';
import SavedWorkflows from './pages/SavedWorkflows';
import JoinStartupInvite from './pages/JoinStartupInvite';
import IncubatorGuard from './components/incubator/IncubatorGuard';
import IncubatorShell from './components/incubator/IncubatorShell';
import IncubatorOnboarding from './pages/incubator/IncubatorOnboarding';
import IncubatorDashboard from './pages/incubator/IncubatorDashboard';
import IncubatorDiscover from './pages/incubator/IncubatorDiscover';
import IncubatorRosterImport from './pages/incubator/IncubatorRosterImport';
import IncubatorPortfolio from './pages/incubator/IncubatorPortfolio';
import IncubatorInvites from './pages/incubator/IncubatorInvites';
import IncubatorCohorts from './pages/incubator/IncubatorCohorts';
import IncubatorCohortDetail from './pages/incubator/IncubatorCohortDetail';
import IncubatorSettings from './pages/incubator/IncubatorSettings';
import OAuthAuthorizePage from './pages/OAuthAuthorizePage';
import { VoiceProvider } from './context/VoiceContext';


function FullPageLoader() {
  return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#161618' }}>
      <div className="w-8 h-8 rounded-full animate-spin"
        style={{ border: '2px solid #C1AEFF', borderTopColor: 'transparent' }} />
    </div>
  );
}

function VCGuard({ children }: { children: React.ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  if (!user || localStorage.getItem('active_role') !== 'vc') {
    return <Navigate to="/overview" replace />;
  }
  return <>{children}</>;
}

function AuthPageRoute() {
  const { user, profile, loading } = useAuth();
  const location = useLocation();
  const from = (location.state as { from?: string })?.from ?? '/overview';

  if (loading) return <FullPageLoader />;
  if (user && profile?.onboarding_completed && profile?.company_id) return <Navigate to={from} replace />;
  if (user && profile?.onboarding_completed && !profile?.company_id) return <Navigate to="/pending" replace />;
  if (user && !profile?.onboarding_completed) return <Navigate to="/onboarding" replace />;
  return <AuthPage />;
}

function RootRoute() {
  const { user, profile, loading } = useAuth();
  if (loading) return <FullPageLoader />;
  // Fully onboarded users with a company go straight to the dashboard
  if (user && profile?.onboarding_completed && profile?.company_id) return <Navigate to="/overview" replace />;
  // Join-request users waiting for approval
  if (user && profile?.onboarding_completed && !profile?.company_id) return <Navigate to="/pending" replace />;
  // Everyone else (unauthenticated OR authenticated but not yet onboarded) sees the landing page.
  // The landing page's CTA buttons guide them to /auth → /onboarding.
  return <LandingNew />;
}

function AppRoutes() {
  const location = useLocation();
  const { user, profile } = useAuth();

  const [savedOpen, setSavedOpen] = useState(false);
  useEffect(() => {
    const handler = (e: any) => setSavedOpen(e.detail);
    window.addEventListener('saved_workflows_toggled', handler);
    return () => window.removeEventListener('saved_workflows_toggled', handler);
  }, []);

  // / — public landing (custom nav, no default TopBar)
  if (location.pathname === '/' || location.pathname === '/landing') {
    return (
      <Routes>
        <Route path="/" element={<RootRoute />} />
        <Route path="/landing" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // Auth + onboarding pages are full-screen without TopBar
  if (location.pathname === '/auth' || location.pathname === '/auth/vc' || location.pathname === '/auth/incubator') {
    return (
      <Routes>
        <Route path="/auth" element={<AuthPageRoute />} />
        <Route path="/auth/vc" element={<VCAuthPage />} />
        <Route path="/auth/incubator" element={<IncubatorAuthPage />} />
      </Routes>
    );
  }

  if (location.pathname === '/onboarding') {
    return (
      <Routes>
        <Route
          path="/onboarding"
          element={
            <AuthGuard>
              <Onboarding />
            </AuthGuard>
          }
        />
      </Routes>
    );
  }

  // /join — invite link landing page (no TopBar, no layout)
  if (location.pathname === '/join') {
    return (
      <Routes>
        <Route path="/join" element={<JoinWorkspace />} />
      </Routes>
    );
  }

  // /pending — waiting for workspace approval (no TopBar)
  if (location.pathname === '/pending') {
    return (
      <Routes>
        <Route path="/pending" element={<PendingApproval />} />
      </Routes>
    );
  }

  // /oauth/authorize — ERPNext SSO bridge page (no TopBar, no AuthGuard —
  // it does its own session check; see OAuthAuthorizePage's file comment)
  if (location.pathname === '/oauth/authorize') {
    return (
      <Routes>
        <Route path="/oauth/authorize" element={<OAuthAuthorizePage />} />
      </Routes>
    );
  }

  // /join-startup — incubator invite landing page (no TopBar, no layout)
  if (location.pathname === '/join-startup') {
    return (
      <Routes>
        <Route path="/join-startup" element={<JoinStartupInvite />} />
      </Routes>
    );
  }

  // /incubator/* — entirely separate shell from the founder app (own sidebar,
  // no TopBar, no persistent-overlay logic). /onboarding is only AuthGuard'd
  // (not IncubatorGuard'd) since IncubatorGuard itself redirects a
  // not-yet-onboarded incubator to this same route — wrapping it too would loop.
  if (location.pathname.startsWith('/incubator')) {
    return (
      <Routes>
        <Route
          path="/incubator/onboarding"
          element={
            <AuthGuard>
              <IncubatorOnboarding />
            </AuthGuard>
          }
        />
        <Route
          element={
            <AuthGuard>
              <IncubatorGuard />
            </AuthGuard>
          }
        >
          <Route element={<IncubatorShell />}>
            <Route path="/incubator/dashboard" element={<IncubatorDashboard />} />
            <Route path="/incubator/discover" element={<IncubatorDiscover />} />
            <Route path="/incubator/portfolio" element={<IncubatorPortfolio />} />
            <Route path="/incubator/cohorts" element={<IncubatorCohorts />} />
            <Route path="/incubator/cohorts/:cohortId" element={<IncubatorCohortDetail />} />
            <Route path="/incubator/import" element={<IncubatorRosterImport />} />
            <Route path="/incubator/invites" element={<IncubatorInvites />} />
            <Route path="/incubator/settings" element={<IncubatorSettings />} />
            <Route path="/incubator" element={<Navigate to="/incubator/dashboard" replace />} />
          </Route>
        </Route>
      </Routes>
    );
  }

  const isTwinGraph = location.pathname === '/twin';
  const is3DUniverse = location.pathname === '/3d';
  const isUniversal = location.pathname === '/universal';
  // Bypass users (VC / Incubator) are authed but have no company — still let them see /3d
  const activeRole = localStorage.getItem('active_role');
  const isBypassUser = !!user && (activeRole === 'vc' || activeRole === 'incubator');
  // Universe3D stays mounted for fully-authed users so camera/galaxy state persists across navigation
  const isFullyAuthed = (!!user && !!profile?.onboarding_completed && !!profile?.company_id) || isBypassUser;

  return (
    <VoiceProvider>
      <>
        {savedOpen && (
          <AuthGuard>
            <SavedWorkflows onClose={() => window.dispatchEvent(new CustomEvent('saved_workflows_toggled', { detail: false }))} />
          </AuthGuard>
        )}

        {/* Persistent 3D universe — always mounted for authed users, shown/hidden via CSS.
          Uses visibility instead of display so the canvas has correct viewport dimensions
          from the start (display:none causes 0×0 init, breaking ResizeObserver). */}
        {isFullyAuthed && (
          <div
            className="fixed inset-0 z-40"
            style={{
              visibility: is3DUniverse ? 'visible' : 'hidden',
              pointerEvents: is3DUniverse ? 'auto' : 'none',
            }}
          >
            <TopBar />
            <Universe3D />
          </div>
        )}

        {/* Persistent Universal Page (BDT) — always mounted so state persists */}
        {isFullyAuthed && (
          <div
            className="fixed inset-0 z-40"
            style={{
              visibility: isUniversal ? 'visible' : 'hidden',
              pointerEvents: isUniversal ? 'auto' : 'none',
            }}
          >
            <TopBar />
            <UniversalPage />
          </div>
        )}

        {/* Normal app shell — removed from layout entirely when on /3d or /universal */}
        <div
          style={{
            display: (isFullyAuthed && (is3DUniverse || isUniversal)) ? 'none' : 'block',
            position: 'relative',
            zIndex: 45,
          }}
        >
          <div className="min-h-screen cosmos-bg">
            <TopBar />
            {isTwinGraph ? (
              <Routes>
                <Route
                  path="/twin"
                  element={
                    <AuthGuard requireOnboarding>
                      <Twin />
                    </AuthGuard>
                  }
                />
              </Routes>
            ) : (
              <main className={isUniversal ? 'overflow-hidden' : 'pt-14 pb-10 px-8 overflow-y-auto'}>
                <Routes>
                  {/* Authenticated app routes */}
                  <Route path="/overview" element={
                    <AuthGuard requireOnboarding>
                      <Overview />
                    </AuthGuard>
                  } />
                  <Route path="/twin/strategy" element={
                    <AuthGuard requireOnboarding requiredModule="strategy">
                      <Strategy />
                    </AuthGuard>
                  } />
                  <Route path="/twin/data" element={
                    <AuthGuard requireOnboarding requiredModule="data" requiredAction="write">
                      <DataIngestion />
                    </AuthGuard>
                  } />
                  <Route path="/twin/benchmarks" element={
                    <AuthGuard requireOnboarding requiredModule="benchmarks">
                      <Benchmarks />
                    </AuthGuard>
                  } />
                  <Route path="/twin/team" element={
                    <AuthGuard requireOnboarding requiredModule="team">
                      <RBAC />
                    </AuthGuard>
                  } />
                  <Route path="/twin/analytics" element={
                    <AuthGuard requireOnboarding requiredModule="analytics">
                      <Analytics />
                    </AuthGuard>
                  } />

                  {/* Ecosystem (accessed through Twin) */}
                  <Route path="/ecosystem/vc-connect" element={
                    <AuthGuard requireOnboarding requiredModule="ecosystem">
                      <VCConnect />
                    </AuthGuard>
                  } />
                  <Route path="/ecosystem/network" element={
                    <AuthGuard requireOnboarding requiredModule="ecosystem">
                      <StartupNetwork />
                    </AuthGuard>
                  } />

                  {/* Settings */}
                  <Route path="/settings" element={
                    <AuthGuard requiredModule="settings">
                      <SettingsPage />
                    </AuthGuard>
                  } />

                  {/* VC pages */}
                  <Route path="/vc/find" element={
                    <VCGuard>
                      <VCFindStartups />
                    </VCGuard>
                  } />
                  <Route path="/vc/portfolio" element={
                    <VCGuard>
                      <VCPortfolio />
                    </VCGuard>
                  } />
                  <Route path="/vc/manage" element={
                    <VCGuard>
                      <VCManage />
                    </VCGuard>
                  } />

                  {/* /3d — redirect unauthenticated users to /auth via AuthGuard */}
                  <Route path="/3d" element={<AuthGuard requireOnboarding><></></AuthGuard>} />

                  {/* /polytope — standalone polytope viewer */}
                  <Route path="/polytope" element={
                    <AuthGuard requireOnboarding>
                      <PolytopePage />
                    </AuthGuard>
                  } />

                  {/* /universal is handled as a persistent overlay above, but we keep an empty route so router is happy if needed */}
                  <Route path="/universal" element={<AuthGuard requireOnboarding><></></AuthGuard>} />

                  {/* /workspace — standalone action node workspace */}
                  <Route path="/workspace" element={
                    <AuthGuard>
                      <WorkspacePage />
                    </AuthGuard>
                  } />

                </Routes>
              </main>
            )}
          </div>
        </div>

      </>
    </VoiceProvider>
  );
}

function App() {
  return (
    <BrowserRouter>
      <AuthProvider>
        <AppRoutes />
      </AuthProvider>
      {import.meta.env.DEV && <Agentation />}
    </BrowserRouter>
  );
}

export default App;
