import {
  Zap,
  Target,
  Brain,
  Shield,
  TrendingUp,
  Layers,
  GitBranch,
  BarChart3,
  Network,
  Handshake,
  Rocket,
  CheckCircle2,
  ArrowRight,
  Sparkles,
  Activity,
  Globe,
} from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';

/* ── capability cards data ── */
interface Capability {
  icon: typeof Zap;
  title: string;
  description: string;
  status: 'live' | 'beta' | 'planned';
  route?: string;
  metrics?: { label: string; value: string }[];
}

const capabilities: Capability[] = [
  {
    icon: Target,
    title: 'Continuous Strategic Alignment',
    description: 'Real-time strategy mapping across departments and teams, ensuring every function aligns with company goals.',
    status: 'live',
    route: '/twin/strategy',
    metrics: [
      { label: 'Alignment Score', value: '87%' },
      { label: 'Goals Tracked', value: '24' },
    ],
  },
  {
    icon: Brain,
    title: 'Faster, Higher-Quality Decisions',
    description: 'AI-augmented decision flow with multi-origin inputs, weighted evaluation, and quantum-inspired optimization.',
    status: 'live',
    route: '/twin',
    metrics: [
      { label: 'Decisions/Month', value: '18' },
      { label: 'Avg Resolution', value: '2.3 days' },
    ],
  },
  {
    icon: Shield,
    title: 'Institutional Memory',
    description: 'Structured execution history, mentor session records, and decision audit trails that persist across team changes.',
    status: 'live',
    metrics: [
      { label: 'Records', value: '340+' },
      { label: 'Retention', value: '100%' },
    ],
  },
  {
    icon: Globe,
    title: 'Scenario Planning vs. Market Signals',
    description: 'Simulate strategies against real competitor moves, market trends, and environmental shifts visible in the 3D twin.',
    status: 'live',
    route: '/twin',
    metrics: [
      { label: 'Scenarios Run', value: '42' },
      { label: 'Competitors Tracked', value: '4' },
    ],
  },
  {
    icon: Layers,
    title: 'AI-Augmented Departments',
    description: 'Each department has AI copilots that surface insights, automate reports, and recommend actions based on live data.',
    status: 'beta',
    metrics: [
      { label: 'Departments', value: '6' },
      { label: 'AI Actions/Week', value: '35' },
    ],
  },
  {
    icon: TrendingUp,
    title: 'Funding Stage Readiness',
    description: 'Track measurable progress toward funding milestones, with investor-grade metrics dashboards and gap analysis.',
    status: 'live',
    route: '/twin/benchmarks',
    metrics: [
      { label: 'Stage', value: 'Seed → A' },
      { label: 'Readiness', value: '72%' },
    ],
  },
  {
    icon: Handshake,
    title: 'VC & Mentor Workflows',
    description: 'Investor pipeline tracking, structured monthly updates, controlled metric sharing, and mentor session workflows.',
    status: 'live',
    route: '/ecosystem/vc-connect',
    metrics: [
      { label: 'Active Investors', value: '4' },
      { label: 'Mentors', value: '4' },
    ],
  },
  {
    icon: Network,
    title: 'Ecosystem Connectivity',
    description: 'Startup-to-startup networking for outsourcing, partnerships, hiring referrals, and anonymised peer benchmarking.',
    status: 'live',
    route: '/ecosystem/network',
    metrics: [
      { label: 'Peer Startups', value: '6' },
      { label: 'Active Links', value: '3' },
    ],
  },
];

const STATUS_CFG = {
  live:    { label: 'Live',    color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  beta:    { label: 'Beta',    color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  planned: { label: 'Planned', color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
};

/* ── evolution stages ── */
const stages = [
  { label: 'Digital Twin', description: 'Living 3D model of your startup', done: true },
  { label: 'Strategy Engine', description: 'Goals, metrics & scenario simulation', done: true },
  { label: 'Decision Intelligence', description: 'AI-ranked options with optimization', done: true },
  { label: 'Team & RBAC', description: 'Role-based access & department AI', done: true },
  { label: 'Investor Layer', description: 'VC pipeline, updates & mentor flows', done: true },
  { label: 'Network Layer', description: 'Peer connect, benchmarking & partnerships', done: true },
  { label: 'IPO Readiness', description: 'Full audit trail & governance', done: false },
];

export default function PlatformOverview() {
  const navigate = useNavigate();

  const liveCount = capabilities.filter((c) => c.status === 'live').length;
  const betaCount = capabilities.filter((c) => c.status === 'beta').length;

  return (
    <div>
      <PageHeader
        title="Platform Overview"
        subtitle="What Unicorn Simulator enables — a living operating system for startups"
        icon={<Rocket className="w-6 h-6" />}
        badge="Vision"
      />

      {/* ── Hero stats ── */}
      <div className="grid grid-cols-4 gap-4 mb-8">
        {[
          { icon: Zap, label: 'Capabilities Live', value: `${liveCount}`, color: 'text-emerald-400', bg: 'from-emerald-500/10 to-emerald-500/5' },
          { icon: Activity, label: 'In Beta', value: `${betaCount}`, color: 'text-amber-400', bg: 'from-amber-500/10 to-amber-500/5' },
          { icon: GitBranch, label: 'Evolution Stage', value: '6 / 7', color: 'text-violet-400', bg: 'from-violet-500/10 to-violet-500/5' },
          { icon: BarChart3, label: 'Data Sources', value: '12+', color: 'text-cyan-400', bg: 'from-cyan-500/10 to-cyan-500/5' },
        ].map(({ icon: Icon, label, value, color, bg }) => (
          <div key={label} className={`glass-card p-4 bg-gradient-to-br ${bg}`}>
            <Icon className={`w-5 h-5 ${color} mb-2`} />
            <p className="text-2xl font-bold text-white">{value}</p>
            <p className="text-xs text-gray-400">{label}</p>
          </div>
        ))}
      </div>

      {/* ── Evolution timeline ── */}
      <div className="glass-card p-6 mb-8">
        <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
          <GitBranch className="w-4 h-4 text-violet-400" />
          Platform Evolution
        </h3>
        <div className="flex items-center gap-0">
          {stages.map((s, i) => (
            <div key={s.label} className="flex items-center flex-1">
              <div className="flex flex-col items-center text-center flex-1">
                <div className={`w-8 h-8 rounded-full flex items-center justify-center mb-2 ${
                  s.done
                    ? 'bg-emerald-500/20 border border-emerald-500/40'
                    : 'bg-white/[0.04] border border-white/10'
                }`}>
                  {s.done ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  ) : (
                    <span className="text-xs text-gray-500">{i + 1}</span>
                  )}
                </div>
                <p className={`text-[11px] font-medium ${s.done ? 'text-white' : 'text-gray-500'}`}>{s.label}</p>
                <p className="text-[9px] text-gray-600 mt-0.5 max-w-[100px]">{s.description}</p>
              </div>
              {i < stages.length - 1 && (
                <div className={`h-px w-full mt-[-24px] ${
                  s.done && stages[i + 1].done ? 'bg-emerald-500/40' : 'bg-white/10'
                }`} />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Capability cards grid ── */}
      <h3 className="text-sm font-semibold text-white mb-4 flex items-center gap-2">
        <Sparkles className="w-4 h-4 text-violet-400" />
        Core Capabilities
      </h3>
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        {capabilities.map((cap) => {
          const Icon = cap.icon;
          const scfg = STATUS_CFG[cap.status];
          return (
            <div
              key={cap.title}
              className={`glass-card p-5 flex flex-col justify-between transition-all ${
                cap.route ? 'cursor-pointer hover:border-violet-500/30 hover:bg-violet-600/[0.03]' : ''
              }`}
              onClick={() => cap.route && navigate(cap.route)}
            >
              <div>
                <div className="flex items-center justify-between mb-3">
                  <div className="w-9 h-9 rounded-lg bg-violet-500/10 flex items-center justify-center">
                    <Icon className="w-4.5 h-4.5 text-violet-400" />
                  </div>
                  <span className={`text-[9px] px-1.5 py-0.5 rounded-full font-medium ${scfg.bg} ${scfg.color} ${scfg.border} border`}>
                    {scfg.label}
                  </span>
                </div>
                <h4 className="text-sm font-semibold text-white mb-1.5">{cap.title}</h4>
                <p className="text-xs text-gray-400 leading-relaxed mb-3">{cap.description}</p>
              </div>
              {cap.metrics && (
                <div className="flex gap-3 mt-auto pt-3 border-t border-white/5">
                  {cap.metrics.map((m) => (
                    <div key={m.label}>
                      <p className="text-xs font-semibold text-white">{m.value}</p>
                      <p className="text-[9px] text-gray-500">{m.label}</p>
                    </div>
                  ))}
                </div>
              )}
              {cap.route && (
                <div className="flex items-center gap-1 mt-3 text-[10px] text-violet-400">
                  Open <ArrowRight className="w-3 h-3" />
                </div>
              )}
            </div>
          );
        })}
      </div>

      {/* ── Bottom CTA / vision statement ── */}
      <div className="glass-card p-8 text-center bg-gradient-to-br from-violet-600/5 to-cyan-600/5 border-violet-500/15">
        <Rocket className="w-8 h-8 text-violet-400 mx-auto mb-3" />
        <h3 className="text-lg font-bold text-white mb-2">From Idea to IPO</h3>
        <p className="text-sm text-gray-400 max-w-xl mx-auto leading-relaxed">
          Unicorn Simulator is a living operating system that gives startups continuous strategic alignment,
          faster decisions, institutional memory, scenario planning against real market signals,
          AI-augmented departments, and credible investor/mentor workflows — all in one platform.
        </p>
        <div className="flex justify-center gap-3 mt-5">
          <button
            onClick={() => navigate('/twin')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-violet-600/20 text-violet-300 text-sm font-medium hover:bg-violet-600/30 transition-all border border-violet-500/20"
          >
            <Globe className="w-4 h-4" /> Explore Twin
          </button>
          <button
            onClick={() => navigate('/ecosystem/vc-connect')}
            className="flex items-center gap-2 px-5 py-2.5 rounded-lg bg-cyan-600/15 text-cyan-300 text-sm font-medium hover:bg-cyan-600/25 transition-all border border-cyan-500/20"
          >
            <Handshake className="w-4 h-4" /> Ecosystem
          </button>
        </div>
      </div>
    </div>
  );
}
