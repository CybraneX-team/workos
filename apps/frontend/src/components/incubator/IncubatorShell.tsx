import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Building2,
  Users,
  UploadCloud,
  Mail,
  Settings,
  LogOut,
  Compass,
  Orbit,
} from 'lucide-react';
import { useAuth } from '../../lib/auth';
import { useIncubatorMe } from '../../lib/db/incubator';
import { ACCENT } from './ui';

const NAV_ITEMS = [
  { to: '/incubator/dashboard', icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/incubator/discover', icon: Compass, label: 'Discover' },
  { to: '/incubator/portfolio', icon: Building2, label: 'Portfolio' },
  { to: '/incubator/cohorts', icon: Users, label: 'Cohorts' },
  { to: '/incubator/import', icon: UploadCloud, label: 'Import Roster' },
  { to: '/incubator/invites', icon: Mail, label: 'Invites' },
];

export default function IncubatorShell() {
  const { signOut } = useAuth();
  const navigate = useNavigate();
  const { incubator } = useIncubatorMe();

  async function handleSignOut() {
    await signOut();
    navigate('/auth/incubator');
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#0c0c10' }}>
      <aside
        className="w-64 min-h-screen flex flex-col border-r border-white/[0.08] backdrop-blur-xl"
        style={{ background: 'rgba(17,17,20,0.85)' }}
      >
        <div className="p-6 border-b border-white/[0.08]">
          <div className="flex items-center gap-3">
            <div
              className="w-10 h-10 rounded-xl flex items-center justify-center"
              style={{
                background: 'linear-gradient(135deg, rgba(167,139,250,0.18), rgba(124,58,237,0.1))',
                border: '1px solid rgba(167,139,250,0.28)',
              }}
            >
              <Building2 className="w-5 h-5" style={{ color: ACCENT }} />
            </div>
            <div className="min-w-0">
              <h1 className="text-sm font-bold text-white tracking-tight truncate">{incubator?.name ?? 'WorkOS'}</h1>
              <p className="text-xs text-white/40">Incubator Portal</p>
            </div>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                  isActive
                    ? 'bg-[#a78bfa]/15 text-[#c4b5fd] font-medium shadow-[0_0_16px_rgba(167,139,250,0.12)]'
                    : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
                }`
              }
            >
              <item.icon className="w-4 h-4" />
              {item.label}
            </NavLink>
          ))}

          <div className="pt-2 mt-2 border-t border-white/[0.06]">
            <Link
              to="/3d"
              className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
            >
              <Orbit className="w-4 h-4" />
              Universe
            </Link>
          </div>
        </nav>

        <div className="p-4 border-t border-white/[0.08] space-y-1">
          <NavLink
            to="/incubator/settings"
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive ? 'bg-[#a78bfa]/15 text-[#c4b5fd] font-medium' : 'text-white/50 hover:text-white/80 hover:bg-white/[0.04]'
              }`
            }
          >
            <Settings className="w-4 h-4" />
            Settings
          </NavLink>
          <button
            onClick={handleSignOut}
            className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-white/50 hover:text-white/80 hover:bg-white/[0.04] transition-all"
          >
            <LogOut className="w-4 h-4" />
            Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 min-w-0 overflow-y-auto">
        <Outlet />
      </main>
    </div>
  );
}
