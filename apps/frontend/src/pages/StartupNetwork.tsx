import { useState } from 'react';
import {
  Network,
  ArrowRightLeft,
  Users,
  BarChart3,
  Handshake,
  Send,
  ExternalLink,
  Shield,
  ShieldCheck,
  ChevronRight,
  MapPin,
  Briefcase,
  TrendingUp,
  TrendingDown,
  Minus,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { startupPeers, peerConnections, peerBenchmarks } from '../data/mockData';
import type { ConnectionType, ConnectionStatus, PeerBenchmark } from '../types';

/* ── config maps ── */
const CONN_TYPE_CFG: Record<ConnectionType, { label: string; color: string; bg: string }> = {
  outsourcing:        { label: 'Outsourcing',        color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  partnership:        { label: 'Partnership',        color: 'text-sky-400',  bg: 'bg-sky-500/10' },
  'hiring-referral':  { label: 'Hiring Referral',    color: 'text-cyan-400',    bg: 'bg-cyan-500/10' },
  'knowledge-exchange': { label: 'Knowledge Exchange', color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
};

const CONN_STATUS_CFG: Record<ConnectionStatus, { label: string; color: string; bg: string }> = {
  active:   { label: 'Active',   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  pending:  { label: 'Pending',  color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  proposed: { label: 'Proposed', color: 'text-gray-400',    bg: 'bg-gray-500/10' },
};

function BenchmarkTrend({ b }: { b: PeerBenchmark }) {
  // For burn rate and churn, lower is better
  const lowerIsBetter = ['Burn Rate', 'CAC', 'Churn'].includes(b.metric);
  const isGood = lowerIsBetter ? b.you <= b.peerMedian : b.you >= b.peerMedian;
  const isTop = lowerIsBetter ? b.you <= b.peerTop : b.you >= b.peerTop;
  const Icon = isGood ? TrendingUp : TrendingDown;
  const color = isTop ? 'text-emerald-400' : isGood ? 'text-cyan-400' : 'text-amber-400';

  const fmt = (v: number) => {
    if (b.unit === '$' && v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
    if (b.unit === '$/mo' && v >= 1000) return `$${(v / 1000).toFixed(0)}K/mo`;
    return `${v}${b.unit ? ` ${b.unit}` : ''}`;
  };

  const pct = Math.min(100, Math.max(0, ((b.you - b.peerMedian) / (b.peerTop - b.peerMedian || 1)) * 100));
  const barPct = lowerIsBetter ? 100 - Math.abs(pct) : Math.max(10, Math.min(100, 50 + pct * 0.5));

  return (
    <div className="glass-card p-4">
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <h4 className="text-sm font-medium text-white">{b.metric}</h4>
          {b.anonymised && (
            <span title="Anonymised">
              <Shield className="w-3 h-3 text-gray-500" />
            </span>
          )}
        </div>
        <Icon className={`w-4 h-4 ${color}`} />
      </div>
      <div className="grid grid-cols-3 gap-2 text-xs mb-3">
        <div>
          <p className="text-gray-500">You</p>
          <p className={`font-semibold ${color}`}>{fmt(b.you)}</p>
        </div>
        <div>
          <p className="text-gray-500">Peer Median</p>
          <p className="text-gray-300 font-medium">{fmt(b.peerMedian)}</p>
        </div>
        <div>
          <p className="text-gray-500">Peer Top</p>
          <p className="text-gray-300 font-medium">{fmt(b.peerTop)}</p>
        </div>
      </div>
      <div className="h-1.5 rounded-full bg-white/5 overflow-hidden">
        <div
          className={`h-full rounded-full transition-all ${isTop ? 'bg-emerald-500' : isGood ? 'bg-cyan-500' : 'bg-amber-500'}`}
          style={{ width: `${barPct}%` }}
        />
      </div>
    </div>
  );
}

type Tab = 'network' | 'connections' | 'benchmarks';

export default function StartupNetwork() {
  const [tab, setTab] = useState<Tab>('network');
  const [selectedPeer, setSelectedPeer] = useState<string | null>(null);
  const [typeFilter, setTypeFilter] = useState<ConnectionType | 'all'>('all');

  const peer = selectedPeer ? startupPeers.find((p) => p.id === selectedPeer) : null;
  const peerConns = selectedPeer
    ? peerConnections.filter((c) => c.peerId === selectedPeer)
    : [];

  const filteredConns =
    typeFilter === 'all'
      ? peerConnections
      : peerConnections.filter((c) => c.type === typeFilter);

  const benchOptIn = startupPeers.filter((p) => p.optInBenchmark).length;

  return (
    <div>
      <PageHeader
        title="Startup Network"
        subtitle="Peer connections, outsourcing, partnerships, and anonymised benchmarking"
        icon={<Network className="w-6 h-6" />}
        badge="Ecosystem"
      />

      {/* ── Tab bar ── */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl bg-white/[0.03] border border-sky-900/20 w-fit">
        {([['network', Users, 'Peer Startups'], ['connections', ArrowRightLeft, 'Connections'], ['benchmarks', BarChart3, 'Benchmarking']] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key as Tab)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              tab === key
                ? 'bg-sky-600/20 text-sky-300 font-medium shadow-[0_0_15px_rgba(14,165,233,0.1)]'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
          >
            <Icon className="w-4 h-4" />
            {label}
          </button>
        ))}
      </div>

      {/* ═══════════ PEER STARTUPS ═══════════ */}
      {tab === 'network' && (
        <div className="grid grid-cols-3 gap-6">
          {/* Left: peer list */}
          <div className="col-span-2">
            <div className="grid grid-cols-2 gap-4">
              {startupPeers.map((p) => {
                const conns = peerConnections.filter((c) => c.peerId === p.id);
                const activeConns = conns.filter((c) => c.status === 'active').length;
                return (
                  <button
                    key={p.id}
                    onClick={() => setSelectedPeer(p.id)}
                    className={`text-left glass-card p-4 transition-all hover:border-sky-500/30 ${
                      selectedPeer === p.id ? 'border-sky-500/40 bg-sky-600/5' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between mb-2">
                      <h4 className="text-sm font-semibold text-white">{p.name}</h4>
                      <span className="text-[10px] px-2 py-0.5 rounded-full bg-sky-500/10 text-sky-300 font-medium">
                        {p.stage}
                      </span>
                    </div>
                    <div className="flex items-center gap-3 text-xs text-gray-500 mb-3">
                      <span className="flex items-center gap-1"><Briefcase className="w-3 h-3" />{p.industry}</span>
                      <span className="flex items-center gap-1"><MapPin className="w-3 h-3" />{p.geography}</span>
                      <span className="flex items-center gap-1"><Users className="w-3 h-3" />{p.teamSize}</span>
                    </div>
                    <div className="flex flex-wrap gap-1 mb-2">
                      {p.strengths.map((s) => (
                        <span key={s} className="text-[10px] px-1.5 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/10">
                          {s}
                        </span>
                      ))}
                    </div>
                    <div className="flex items-center justify-between text-xs">
                      <div className="flex flex-wrap gap-1">
                        {p.lookingFor.slice(0, 2).map((l) => (
                          <span key={l} className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400 border border-cyan-500/10">
                            Needs: {l}
                          </span>
                        ))}
                      </div>
                      <div className="flex items-center gap-2">
                        {activeConns > 0 && (
                          <span className="text-emerald-400">{activeConns} active</span>
                        )}
                        {p.optInBenchmark && (
                          <span title="Benchmark opt-in">
                            <ShieldCheck className="w-3.5 h-3.5 text-sky-400" />
                          </span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Right: detail panel */}
          <div className="col-span-1">
            {peer ? (
              <div className="glass-card p-6 space-y-5 sticky top-[4.5rem]">
                <div>
                  <h3 className="text-lg font-semibold text-white">{peer.name}</h3>
                  <p className="text-xs text-gray-400">{peer.industry} &middot; {peer.geography} &middot; {peer.teamSize} people</p>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-gray-500 mb-0.5">Stage</p>
                    <p className="text-white font-medium">{peer.stage}</p>
                  </div>
                  <div className="p-2 rounded-lg bg-white/[0.03] border border-white/5">
                    <p className="text-gray-500 mb-0.5">Benchmark</p>
                    <p className={`font-medium ${peer.optInBenchmark ? 'text-emerald-400' : 'text-gray-500'}`}>
                      {peer.optInBenchmark ? 'Opted In' : 'Not opted in'}
                    </p>
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-gray-300 mb-2">Strengths</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {peer.strengths.map((s) => (
                      <span key={s} className="text-[10px] px-2 py-0.5 rounded-full bg-emerald-500/10 text-emerald-400 border border-emerald-500/20">{s}</span>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-xs font-medium text-gray-300 mb-2">Looking For</h4>
                  <div className="flex flex-wrap gap-1.5">
                    {peer.lookingFor.map((l) => (
                      <span key={l} className="text-[10px] px-2 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">{l}</span>
                    ))}
                  </div>
                </div>

                {/* Active connections with this peer */}
                {peerConns.length > 0 && (
                  <div>
                    <h4 className="text-xs font-medium text-gray-300 mb-2">Connections ({peerConns.length})</h4>
                    <div className="space-y-2">
                      {peerConns.map((c) => {
                        const tcfg = CONN_TYPE_CFG[c.type];
                        const scfg = CONN_STATUS_CFG[c.status];
                        return (
                          <div key={c.id} className="p-2.5 rounded-lg bg-white/[0.02] border border-white/5 text-xs">
                            <div className="flex items-center justify-between mb-1">
                              <span className={`px-1.5 py-0.5 rounded ${tcfg.bg} ${tcfg.color} text-[10px] font-medium`}>{tcfg.label}</span>
                              <span className={`${scfg.color} text-[10px]`}>{scfg.label}</span>
                            </div>
                            <p className="text-gray-400 leading-relaxed">{c.description}</p>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex gap-2">
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-sky-600/15 text-sky-300 text-xs font-medium hover:bg-sky-600/25 transition-all">
                    <Send className="w-3 h-3" /> Propose Connection
                  </button>
                  <button className="flex-1 flex items-center justify-center gap-2 px-3 py-2 rounded-lg bg-cyan-600/15 text-cyan-300 text-xs font-medium hover:bg-cyan-600/25 transition-all">
                    <ExternalLink className="w-3 h-3" /> View Profile
                  </button>
                </div>
              </div>
            ) : (
              <div className="glass-card p-8 flex flex-col items-center justify-center text-gray-500">
                <Network className="w-10 h-10 mb-3 opacity-30" />
                <p className="text-sm">Select a startup to view details</p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* ═══════════ CONNECTIONS ═══════════ */}
      {tab === 'connections' && (
        <div className="space-y-5">
          {/* Type filter */}
          <div className="flex gap-2 flex-wrap">
            <button
              onClick={() => setTypeFilter('all')}
              className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                typeFilter === 'all' ? 'bg-sky-600/20 text-sky-300 border border-sky-500/30' : 'text-gray-400 hover:text-gray-200 bg-white/[0.03] border border-white/5'
              }`}
            >
              All ({peerConnections.length})
            </button>
            {(Object.entries(CONN_TYPE_CFG) as [ConnectionType, typeof CONN_TYPE_CFG[ConnectionType]][]).map(([type, cfg]) => {
              const count = peerConnections.filter((c) => c.type === type).length;
              return (
                <button
                  key={type}
                  onClick={() => setTypeFilter(type)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-all ${
                    typeFilter === type ? `${cfg.bg} ${cfg.color} border border-current/20` : 'text-gray-400 hover:text-gray-200 bg-white/[0.03] border border-white/5'
                  }`}
                >
                  {cfg.label} ({count})
                </button>
              );
            })}
          </div>

          {/* Connection cards */}
          <div className="space-y-3">
            {filteredConns.map((c) => {
              const p = startupPeers.find((sp) => sp.id === c.peerId);
              const tcfg = CONN_TYPE_CFG[c.type];
              const scfg = CONN_STATUS_CFG[c.status];
              return (
                <div key={c.id} className="glass-card p-5">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-3">
                      <div className={`w-9 h-9 rounded-lg ${tcfg.bg} flex items-center justify-center`}>
                        <Handshake className={`w-4 h-4 ${tcfg.color}`} />
                      </div>
                      <div>
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-white">{p?.name ?? 'Unknown'}</h4>
                          <ChevronRight className="w-3 h-3 text-gray-600" />
                          <span className={`text-xs ${tcfg.color}`}>{tcfg.label}</span>
                        </div>
                        {c.startedAt && <p className="text-xs text-gray-500">Since {c.startedAt}</p>}
                      </div>
                    </div>
                    <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${scfg.bg} ${scfg.color}`}>
                      {scfg.label}
                    </span>
                  </div>
                  <p className="text-xs text-gray-400 leading-relaxed">{c.description}</p>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ═══════════ BENCHMARKING ═══════════ */}
      {tab === 'benchmarks' && (
        <div className="space-y-6">
          {/* Summary bar */}
          <div className="glass-card p-4 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <ShieldCheck className="w-5 h-5 text-sky-400" />
              <div>
                <p className="text-sm font-medium text-white">Peer Benchmarking</p>
                <p className="text-xs text-gray-400">
                  {benchOptIn} of {startupPeers.length} peers opted in &middot; Data anonymised where marked
                </p>
              </div>
            </div>
            <div className="flex items-center gap-4 text-xs">
              <span className="flex items-center gap-1.5 text-emerald-400"><TrendingUp className="w-3 h-3" /> Above peer top</span>
              <span className="flex items-center gap-1.5 text-cyan-400"><Minus className="w-3 h-3" /> Above median</span>
              <span className="flex items-center gap-1.5 text-amber-400"><TrendingDown className="w-3 h-3" /> Below median</span>
            </div>
          </div>

          {/* Benchmark grid */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {peerBenchmarks.map((b) => (
              <BenchmarkTrend key={b.metric} b={b} />
            ))}
          </div>

          {/* Benchmark table */}
          <div className="glass-card overflow-hidden">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-white/5">
                  <th className="text-left p-3 text-gray-400 font-medium">Metric</th>
                  <th className="text-right p-3 text-gray-400 font-medium">You</th>
                  <th className="text-right p-3 text-gray-400 font-medium">Peer Median</th>
                  <th className="text-right p-3 text-gray-400 font-medium">Peer Top</th>
                  <th className="text-right p-3 text-gray-400 font-medium">vs. Median</th>
                  <th className="text-center p-3 text-gray-400 font-medium">Privacy</th>
                </tr>
              </thead>
              <tbody>
                {peerBenchmarks.map((b) => {
                  const lowerIsBetter = ['Burn Rate', 'CAC', 'Churn'].includes(b.metric);
                  const diff = lowerIsBetter
                    ? ((b.peerMedian - b.you) / b.peerMedian) * 100
                    : ((b.you - b.peerMedian) / b.peerMedian) * 100;
                  const isGood = diff > 0;
                  const fmt = (v: number) => {
                    if (b.unit === '$' && v >= 1000) return `$${(v / 1000).toFixed(1)}K`;
                    if (b.unit === '$/mo' && v >= 1000) return `$${(v / 1000).toFixed(0)}K/mo`;
                    return `${v}${b.unit ? ` ${b.unit}` : ''}`;
                  };
                  return (
                    <tr key={b.metric} className="border-b border-white/[0.03] hover:bg-white/[0.02]">
                      <td className="p-3 text-white font-medium">{b.metric}</td>
                      <td className="p-3 text-right text-white font-semibold">{fmt(b.you)}</td>
                      <td className="p-3 text-right text-gray-400">{fmt(b.peerMedian)}</td>
                      <td className="p-3 text-right text-gray-400">{fmt(b.peerTop)}</td>
                      <td className={`p-3 text-right font-medium ${isGood ? 'text-emerald-400' : 'text-amber-400'}`}>
                        {isGood ? '+' : ''}{diff.toFixed(1)}%
                      </td>
                      <td className="p-3 text-center">
                        {b.anonymised ? (
                          <Shield className="w-3.5 h-3.5 text-sky-400 mx-auto" />
                        ) : (
                          <span className="text-gray-600">Open</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
