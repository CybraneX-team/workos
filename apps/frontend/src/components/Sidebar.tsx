import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Network,
  FlaskConical,
  Database,
  BarChart3,
  ShieldCheck,
  GitBranch,
  Target,
  Settings,
  Orbit,
  Activity,
} from 'lucide-react';

const navItems = [
  { to: '/', icon: LayoutDashboard, label: 'Overview' },
  { to: '/3d', icon: Network, label: 'Twin' },
  { to: '/rbac', icon: ShieldCheck, label: 'Team & RBAC' },
  { to: '/decisions', icon: GitBranch, label: 'Decisions' },
  { to: '/goals', icon: Target, label: 'Goals' },
  { to: '/metrics', icon: Activity, label: 'Metrics' },
  { to: '/simulation', icon: FlaskConical, label: 'Simulation' },
  { to: '/data', icon: Database, label: 'Data Ingestion' },
  { to: '/benchmarks', icon: BarChart3, label: 'Benchmarks' },
];

export default function Sidebar() {
  return (
    <aside className="w-64 min-h-screen flex flex-col border-r border-sky-900/20"
      style={{
        background: 'linear-gradient(180deg, #08082a 0%, #0a0a2e 50%, #06061a 100%)',
      }}
    >
      <div className="p-6 border-b border-sky-900/20">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{
              background: 'linear-gradient(135deg, rgba(14,165,233,0.25), rgba(34,211,238,0.15))',
              boxShadow: '0 0 20px rgba(14,165,233,0.2)',
            }}
          >
            <Orbit className="w-5 h-5 text-sky-300" />
          </div>
          <div>
            <h1 className="text-sm font-bold text-white tracking-tight">WorkOS</h1>
            <p className="text-xs text-sky-400/60">Digital Twin v2.0</p>
          </div>
        </div>
      </div>

      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.to === '/'}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all ${
                isActive
                  ? 'bg-sky-600/15 text-sky-300 font-medium shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                  : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
              }`
            }
          >
            <item.icon className="w-4 h-4" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      <div className="p-4 border-t border-sky-900/20">
        <NavLink
          to="/settings"
          className="flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm text-gray-400 hover:text-gray-200 hover:bg-white/[0.04] transition-all"
        >
          <Settings className="w-4 h-4" />
          Settings
        </NavLink>
        <div className="mt-4 px-3">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full bg-emerald-500 status-pulse" />
            <span className="text-xs text-sky-400/50">Twin Synced</span>
          </div>
        </div>
      </div>
    </aside>
  );
}
