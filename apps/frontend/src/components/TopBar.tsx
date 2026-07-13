    import { useState, useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Hexagon, LogOut, LogIn, Bookmark } from 'lucide-react';
import { useAuth } from '../lib/auth';
import { useSavedWorkflows } from '../lib/useSavedWorkflows';
import { useBdtSavedTrails } from '../lib/useBdtSavedTrails';
import { api } from '../lib/api';

export default function TopBar() {
  const location = useLocation();
  const navigate  = useNavigate();
  const { user, profile, signOut, loading, canRead, canWrite } = useAuth();

  const isData      = location.pathname === '/twin/data';
  const is3D        = location.pathname === '/3d';
  const isTwin      = (location.pathname.startsWith('/twin') || location.pathname === '/3d') && !isData;
  const isOverview  = location.pathname.startsWith('/overview');
  const isUniversal = location.pathname === '/universal';

  const [isSaved, setIsSaved] = useState(false);
  useEffect(() => {
    const handler = (e: any) => setIsSaved(e.detail);
    window.addEventListener('saved_workflows_toggled', handler);
    return () => window.removeEventListener('saved_workflows_toggled', handler);
  }, []);

  const isAuthed     = !!user;
  const activeRole = localStorage.getItem('active_role');
  const isBypassUser = !!user && (activeRole === 'vc' || activeRole === 'incubator');
  // Bypass users (VC/Incubator) may have a stray profile.company_id from prior
  // testing as another persona — never treat that as "their" workspace.
  const hasCompany   = !isBypassUser && !!profile?.company_id;
  const canManageTeam = canWrite('team');

  const { totalCount: workspaceSavedCount } = useSavedWorkflows();
  const { totalCount: bdtSavedCount } = useBdtSavedTrails();
  const savedCount = isUniversal ? bdtSavedCount : workspaceSavedCount;

  // On /3d, hide the bookmark button until the user has entered a company planet
  const [companyEnteredIn3D, setCompanyEnteredIn3D] = useState(
    () => !!sessionStorage.getItem('company_entered_in_3d')
  );
  useEffect(() => {
    const handler = () => setCompanyEnteredIn3D(true);
    window.addEventListener('company_entered_in_3d', handler);
    return () => window.removeEventListener('company_entered_in_3d', handler);
  }, []);

  // Bookmark button is visible when: not on /3d, OR on /3d and a company has been entered, OR there are saved workflows
  const showBookmark = !is3D || companyEnteredIn3D || savedCount > 0;

  const initials = profile?.first_name
    ? `${profile.first_name[0]}${profile.last_name?.[0] ?? ''}`.toUpperCase()
    : user?.email?.[0]?.toUpperCase() ?? '?';

  async function handleSignOut() {
    localStorage.removeItem('active_role');
    await signOut();
    navigate('/');
  }

  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  useEffect(() => {
    const handler = (e: any) => setWorkspaceOpen(e.detail);
    window.addEventListener('workspace_toggled', handler);
    return () => window.removeEventListener('workspace_toggled', handler);
  }, []);

  // ── Pending join-request badge on Team tab ────────────────────────────────
  const [pendingJoinCount, setPendingJoinCount] = useState(0);
  useEffect(() => {
    const companyId = profile?.company_id;
    if (!companyId || !canManageTeam) { setPendingJoinCount(0); return; }
    let cancelled = false;
    api.get<{ count: number }>('/api/join-requests/count')
      .then(({ count }) => { if (!cancelled) setPendingJoinCount(count ?? 0); })
      .catch(() => { if (!cancelled) setPendingJoinCount(0); });
    return () => { cancelled = true; };
  }, [profile?.company_id, location.pathname, canManageTeam]);

  if (workspaceOpen) return null;

  // ── Tabs ─────────────────────────────────────────────────────────────────
  const tabs = activeRole === 'incubator'
    ? [
        { path: '/3d',                    label: '3D Twin',       active: is3D },
        { path: '/incubator/discover',     label: 'Find Startups', active: location.pathname === '/incubator/discover' },
        { path: '/incubator/dashboard',    label: 'Manage',        active: location.pathname === '/incubator/dashboard' },
        { path: '/incubator/portfolio',    label: 'My Portfolio',  active: location.pathname === '/incubator/portfolio' },
      ]
    : isBypassUser
    ? [
        { path: '/3d',           label: '3D Twin',       active: is3D },
        { path: '/vc/find',      label: 'Find Startups', active: location.pathname === '/vc/find' },
        { path: '/vc/manage',    label: 'Manage',        active: location.pathname === '/vc/manage' },
        { path: '/vc/portfolio', label: 'My Portfolio',  active: location.pathname === '/vc/portfolio' },
      ]
    : [
        { path: '/overview',  label: 'Home',     active: isOverview },
        { path: '/3d',        label: '3D Twin',  active: is3D },
        { path: '/universal', label: 'BDT',      active: location.pathname === '/universal' },
        ...(canRead('team')     ? [{ path: '/twin/team' as const,  label: 'Team' as const,     active: location.pathname === '/twin/team', badge: pendingJoinCount }] : []),
        ...(canWrite('data')    ? [{ path: '/twin/data' as const,  label: 'Data' as const,     active: isData }] : []),
        ...(canRead('settings') ? [{ path: '/settings' as const,   label: 'Settings' as const, active: location.pathname === '/settings' }] : []),
      ];

  return (
    <header
      className="fixed top-0 left-0 right-0 z-50 h-14 flex items-center px-5 gap-4"
      style={{
        background: 'transparent',
        backdropFilter: isUniversal ? undefined : 'blur(20px)',
        WebkitBackdropFilter: isUniversal ? undefined : 'blur(20px)',
      }}
    >
      {/* ── Brand ── */}
      <div
        className="flex items-center gap-2.5 shrink-0 cursor-pointer select-none"
        onClick={() => navigate(isAuthed && hasCompany ? '/overview' : '/')}
      >
        <div
          className="w-7 h-7 rounded-lg flex items-center justify-center shrink-0"
          style={{
            background: 'linear-gradient(135deg, #F9C6FF 0%, #C1AEFF 100%)',
            boxShadow: '0 0 14px rgba(193,174,255,0.45)',
          }}
        >
          <Hexagon className="w-4 h-4" style={{ color: '#0d0b1e' }} strokeWidth={2.5} />
        </div>
        <span className="text-sm font-semibold text-white tracking-wide">WorkOS</span>
        <span
          className="text-[9px] font-medium px-1.5 py-0.5 rounded-full"
          style={{
            color: '#8B7FCC',
            background: 'rgba(139,127,204,0.12)',
            border: '1px solid rgba(139,127,204,0.2)',
          }}
        >
          beta
        </span>
      </div>

      {/* ── Center tabs ── */}
      <div className="flex-1 flex items-center justify-center overflow-hidden">
        {isAuthed && !loading && (
          <nav
            className="flex items-center rounded-full p-1 shrink-0"
            style={{
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.08)',
              backdropFilter: 'blur(12px)',
              boxShadow: 'inset 0 1px 0 rgba(255,255,255,0.06), 0 4px 24px rgba(0,0,0,0.4)',
            }}
          >
            {tabs.map(({ path, label, active, badge } : any) => (
              <button
                key={path}
                onClick={() => navigate(path)}
                className="relative flex items-center gap-1.5 px-5 py-1.5 rounded-full text-xs font-medium transition-all duration-200 select-none"
                style={{
                  background: active
                    ? 'linear-gradient(135deg, rgba(249,198,255,0.22) 0%, rgba(193,174,255,0.22) 100%)'
                    : 'transparent',
                  color: active ? '#EDD9FF' : 'rgba(255,255,255,0.38)',
                  boxShadow: active
                    ? '0 0 16px rgba(193,174,255,0.25), inset 0 1px 0 rgba(255,255,255,0.15)'
                    : 'none',
                  border: active
                    ? '1px solid rgba(193,174,255,0.3)'
                    : '1px solid transparent',
                  letterSpacing: '0.02em',
                }}
                onMouseEnter={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)';
                }}
                onMouseLeave={e => {
                  if (!active) (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.38)';
                }}
              >
                {active && (
                  <span
                    className="absolute inset-0 rounded-full pointer-events-none"
                    style={{
                      background: 'linear-gradient(135deg, rgba(249,198,255,0.08) 0%, rgba(193,174,255,0.08) 100%)',
                    }}
                  />
                )}
                {label}
                {badge > 0 && (
                  <span
                    className="ml-0.5 flex items-center justify-center rounded-full text-[9px] font-bold leading-none"
                    style={{
                      background: '#f59e0b',
                      color: '#000',
                      minWidth: '14px',
                      height: '14px',
                      padding: '0 3px',
                    }}
                  >
                    {badge}
                  </span>
                )}
              </button>
            ))}
          </nav>
        )}
      </div>

      {/* ── Right side ── */}
      <div className="flex items-center gap-2 shrink-0">
        {/* Back to graph button */}
        {isTwin && location.pathname !== '/3d' && location.pathname !== '/twin' && (
          <button
            onClick={() => navigate('/3d')}
            className="text-[10px] px-3 py-1.5 rounded-full transition-all font-medium"
            style={{
              color: '#C1AEFF',
              background: 'rgba(193,174,255,0.08)',
              border: '1px solid rgba(193,174,255,0.15)',
            }}
            onMouseEnter={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(193,174,255,0.15)';
            }}
            onMouseLeave={e => {
              (e.currentTarget as HTMLElement).style.background = 'rgba(193,174,255,0.08)';
            }}
          >
            ← Graph
          </button>
        )}

        {isAuthed && !loading ? (
          <>
            {/* Workspace badge */}
            {hasCompany && (
              <div
                className="hidden sm:flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium"
                style={{
                  background: 'rgba(193,174,255,0.06)',
                  border: '1px solid rgba(193,174,255,0.12)',
                  color: 'rgba(193,174,255,0.7)',
                }}
              >
                <span className="w-1.5 h-1.5 rounded-full" style={{ background: '#34d399', boxShadow: '0 0 6px #34d399' }} />
                {profile?.first_name ? `${profile.first_name}'s workspace` : 'My workspace'}
              </div>
            )}

            {/* Saved Workflows bookmark button — hidden on /3d until a company is entered */}
            {showBookmark && (
              <button
                onClick={() => window.dispatchEvent(new CustomEvent('saved_workflows_toggled', { detail: !isSaved }))}
                className="relative w-8 h-8 rounded-lg flex items-center justify-center transition-all"
                style={{
                  color: isSaved ? '#C1AEFF' : 'rgba(255,255,255,0.35)',
                  background: isSaved ? 'rgba(193,174,255,0.12)' : 'rgba(255,255,255,0.04)',
                  border: isSaved ? '1px solid rgba(193,174,255,0.25)' : '1px solid rgba(255,255,255,0.06)',
                  boxShadow: isSaved ? '0 0 12px rgba(193,174,255,0.2)' : 'none',
                }}
                onMouseEnter={e => {
                  if (!isSaved) {
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.65)';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.08)';
                  }
                }}
                onMouseLeave={e => {
                  if (!isSaved) {
                    (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.35)';
                    (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                  }
                }}
                title={`Saved Workflows${savedCount > 0 ? ` (${savedCount})` : ''}`}
              >
                <Bookmark className="w-4 h-4" />
                {savedCount > 0 && (
                  <span
                    className="absolute -top-1 -right-1 min-w-[14px] h-[14px] rounded-full flex items-center justify-center text-[8px] font-bold px-0.5"
                    style={{
                      background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)',
                      color: '#0d0b1e',
                      boxShadow: '0 0 6px rgba(193,174,255,0.6)',
                    }}
                  >
                    {savedCount > 99 ? '99+' : savedCount}
                  </span>
                )}
              </button>
            )}

            {/* Avatar */}
            <div
              className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold cursor-pointer shrink-0 select-none"
              style={{
                background: 'linear-gradient(135deg, #F9C6FF 0%, #C1AEFF 100%)',
                color: '#0d0b1e',
                boxShadow: '0 0 12px rgba(193,174,255,0.35)',
              }}
              title={user?.email}
            >
              {initials}
            </div>

            {/* Sign out */}
            <button
              onClick={handleSignOut}
              className="w-8 h-8 rounded-lg flex items-center justify-center transition-all"
              style={{
                color: 'rgba(255,255,255,0.25)',
                background: 'rgba(255,255,255,0.04)',
                border: '1px solid rgba(255,255,255,0.06)',
              }}
              onMouseEnter={e => {
                (e.currentTarget as HTMLElement).style.color = '#f87171';
                (e.currentTarget as HTMLElement).style.background = 'rgba(248,113,113,0.08)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(248,113,113,0.2)';
              }}
              onMouseLeave={e => {
                (e.currentTarget as HTMLElement).style.color = 'rgba(255,255,255,0.25)';
                (e.currentTarget as HTMLElement).style.background = 'rgba(255,255,255,0.04)';
                (e.currentTarget as HTMLElement).style.borderColor = 'rgba(255,255,255,0.06)';
              }}
              title="Sign out"
            >
              <LogOut className="w-4 h-4" />
            </button>
          </>
        ) : (
          !loading && (
            <button
              onClick={() => navigate('/auth')}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-full text-xs font-semibold transition-all"
              style={{
                background: 'linear-gradient(135deg, #F9C6FF 0%, #C1AEFF 100%)',
                color: '#0d0b1e',
                boxShadow: '0 0 16px rgba(193,174,255,0.4)',
              }}
            >
              <LogIn className="w-3.5 h-3.5" />
              Sign In
            </button>
          )
        )}
      </div>
    </header>
  );
}
