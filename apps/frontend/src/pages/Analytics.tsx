import { useState, useEffect } from 'react';
import { isCurrencyPrefix } from '../lib/currency';
import {
  Activity, BarChart3, TrendingUp, TrendingDown, Database, Pencil, Radio,
  ChevronDown, ChevronUp, Target, Plug, RefreshCw,
  FlaskConical, Play, RotateCcw, GitBranch,
} from 'lucide-react';
import {
  BarChart, Bar, LineChart, Line as RLine, AreaChart, Area, ResponsiveContainer, Tooltip, XAxis, YAxis,
  CartesianGrid, Legend, ComposedChart, Line,
} from 'recharts';
import { useNavigate } from 'react-router-dom';
import PageHeader from '../components/PageHeader';
import { trackedMetrics as mockMetrics, simulationScenarios, decisionTree, monteCarloData } from '../data/mockData';
import { fetchAnalyticsData } from '../lib/integrations/service';
import type { AnalyticsTrackedMetric } from '../lib/integrations/service';
import type { MetricCategory, TrackedMetric, DecisionNode } from '../types';

/* ------------------------------------------------------------------ */
/*  Config                                                             */
/* ------------------------------------------------------------------ */

const CATEGORIES: { key: MetricCategory; color: string; accent: string }[] = [
  { key: 'Growth',     color: 'text-emerald-400', accent: '#34d399' },
  { key: 'Product',    color: 'text-cyan-400',    accent: '#22d3ee' },
  { key: 'Sales',      color: 'text-sky-400',     accent: '#818cf8' },
  { key: 'Finance',    color: 'text-amber-400',   accent: '#fbbf24' },
  { key: 'Ops/People', color: 'text-sky-400',     accent: '#38bdf8' },
];

const SOURCE_CFG: Record<string, { icon: typeof Database; label: string; color: string }> = {
  'auto-ingested': { icon: Database, label: 'Auto',   color: 'text-emerald-400 bg-emerald-500/10' },
  manual:          { icon: Pencil,   label: 'Manual', color: 'text-amber-400 bg-amber-500/10' },
  proxy:           { icon: Radio,    label: 'Proxy',  color: 'text-sky-400 bg-sky-500/10' },
};

const MONTH_LABELS = ['M-11','M-10','M-9','M-8','M-7','M-6','M-5','M-4','M-3','M-2','M-1','Now'];

const monteCarloBand = monteCarloData.map((d) => ({
  ...d,
  p10Base: d.p10,
  band: d.p90 - d.p10,
}));

function toTrackedMetric(m: AnalyticsTrackedMetric): TrackedMetric {
  return {
    id: m.id,
    name: m.name,
    category: m.category,
    value: m.value,
    unit: m.unit,
    change: m.change,
    dataSource: m.dataSource,
    integration: m.integration,
    trend: m.trend,
    description: m.description,
  };
}

type AnalyticsView = 'metrics' | 'simulation';

/* ------------------------------------------------------------------ */
/*  Main                                                               */
/* ------------------------------------------------------------------ */

export default function Analytics() {
  const [view, setView] = useState<AnalyticsView>('metrics');
  const [liveMetrics, setLiveMetrics] = useState<TrackedMetric[]>([]);
  const [connectedIntegrations, setConnectedIntegrations] = useState<string[]>([]);
  const [lastUpdated, setLastUpdated] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadAnalyticsData = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAnalyticsData();
      setLiveMetrics(data.metrics.map(toTrackedMetric));
      setConnectedIntegrations(data.connectedIntegrations);
      setLastUpdated(data.lastUpdated);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { void loadAnalyticsData(); }, []);

  const hasRealData = liveMetrics.length > 0;
  const displayMetrics = hasRealData ? liveMetrics : mockMetrics;
  const isUsingMock = !hasRealData;

  return (
    <div>
      <PageHeader
        title="Analytics"
        subtitle="Track metrics dynamically by industry, and simulate future scenarios"
        icon={<Activity className="w-6 h-6" />}
        badge={`${displayMetrics.length} Tracked`}
      />

      {/* View toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex rounded-lg p-0.5 bg-gray-900/60 border border-gray-800">
          <button
            onClick={() => setView('metrics')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === 'metrics'
                ? 'bg-cyan-600/15 text-cyan-400 border border-cyan-500/20'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            <BarChart3 className="w-4 h-4" /> Metrics
          </button>
          <button
            onClick={() => setView('simulation')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === 'simulation'
                ? 'bg-sky-600/15 text-sky-400 border border-sky-500/20'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            <FlaskConical className="w-4 h-4" /> Simulation
          </button>
        </div>

        {view === 'metrics' && (
          <div className="flex items-center gap-3 ml-auto">
            {lastUpdated && (
              <span className="text-[10px] text-gray-600">
                Last synced {new Date(lastUpdated).toLocaleString()}
              </span>
            )}
            <button
              onClick={() => void loadAnalyticsData()}
              disabled={loading}
              className="flex items-center gap-1.5 px-3 py-1.5 text-xs text-gray-400 hover:text-gray-200 border border-gray-800 hover:border-gray-700 rounded-lg transition-all disabled:opacity-40"
            >
              <RefreshCw className={`w-3 h-3 ${loading ? 'animate-spin' : ''}`} />
              Refresh
            </button>
          </div>
        )}
      </div>

      {view === 'metrics' ? (
        <MetricsView
          metrics={displayMetrics}
          isUsingMock={isUsingMock}
          loading={loading}
          error={error}
          connectedIntegrations={connectedIntegrations}
        />
      ) : (
        <SimulationView />
      )}
    </div>
  );
}

/* ================================================================== */
/*  METRICS VIEW                                                       */
/* ================================================================== */

function MetricsView({
  metrics,
  isUsingMock,
  loading,
  error,
  connectedIntegrations,
}: {
  metrics: TrackedMetric[];
  isUsingMock: boolean;
  loading: boolean;
  error: string | null;
  connectedIntegrations: string[];
}) {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState<MetricCategory | 'All'>('All');
  const [expandedMetric, setExpandedMetric] = useState<string | null>(null);

  const filtered = activeCategory === 'All'
    ? metrics
    : metrics.filter((m) => m.category === activeCategory);

  const categoryCounts = CATEGORIES.map((c) => ({
    ...c,
    count: metrics.filter((m) => m.category === c.key).length,
  }));

  const activeAccent = activeCategory === 'All'
    ? '#818cf8'
    : CATEGORIES.find((c) => c.key === activeCategory)?.accent ?? '#818cf8';

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-4">
        <div className="w-8 h-8 border-2 border-cyan-500/30 border-t-cyan-500 rounded-full animate-spin" />
        <p className="text-sm text-gray-500">Loading analytics data from your integrations…</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="glass-card p-8 text-center">
        <Activity className="w-8 h-8 text-red-400 mx-auto mb-3" />
        <p className="text-sm text-red-400 mb-1">Failed to load analytics data</p>
        <p className="text-xs text-gray-600">{error}</p>
      </div>
    );
  }

  return (
    <>
      {/* Data source banner */}
      {isUsingMock ? (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-amber-500/20 bg-amber-500/5">
          <Plug className="w-4 h-4 text-amber-400 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs text-amber-300 font-medium">Showing sample data</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              No integration snapshots found yet. Connect your tools and load their metrics once to start tracking real data here.
            </p>
          </div>
          <button
            onClick={() => navigate('/twin/settings')}
            className="shrink-0 px-3 py-1.5 text-xs bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/20 rounded-lg transition-all"
          >
            Connect integrations
          </button>
        </div>
      ) : (
        <div className="mb-6 flex items-center gap-3 px-4 py-3 rounded-xl border border-emerald-500/20 bg-emerald-500/5">
          <Database className="w-4 h-4 text-emerald-400 shrink-0" />
          <div>
            <p className="text-xs text-emerald-300 font-medium">Live integration data</p>
            <p className="text-[11px] text-gray-500 mt-0.5">
              {metrics.length} metrics across {connectedIntegrations.length} connected integration{connectedIntegrations.length !== 1 ? 's' : ''}
            </p>
          </div>
        </div>
      )}

      {/* Category tabs */}
      <div className="flex gap-2 mb-6 flex-wrap">
        <button
          onClick={() => setActiveCategory('All')}
          className={`px-4 py-2 text-xs rounded-lg border transition-all ${
            activeCategory === 'All'
              ? 'bg-sky-500/10 border-sky-500/20 text-sky-300 font-medium'
              : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'
          }`}
        >All ({metrics.length})</button>
        {categoryCounts.map((c) => (
          <button
            key={c.key}
            onClick={() => setActiveCategory(c.key)}
            className={`px-4 py-2 text-xs rounded-lg border transition-all ${
              activeCategory === c.key
                ? `bg-gray-900/80 border-gray-700 ${c.color} font-medium`
                : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'
            }`}
          >{c.key} ({c.count})</button>
        ))}
      </div>

      {/* Summary row */}
      <div className="grid grid-cols-5 gap-3 mb-6">
        {CATEGORIES.map((c) => {
          const catMetrics = metrics.filter((m) => m.category === c.key);
          const avgChange = catMetrics.length > 0 ? catMetrics.reduce((s, m) => s + m.change, 0) / catMetrics.length : 0;
          const improving = catMetrics.filter((m) => {
            const lower = ['CAC', 'Churn Rate', 'Monthly Burn', 'Deal Cycle Time', 'Top Churn Driver', 'Bounce Rate', 'CPA', 'Open Bugs'];
            return lower.includes(m.name) ? m.change < 0 : m.change > 0;
          }).length;
          return (
            <div key={c.key} className="glass-card p-4">
              <p className={`text-[10px] uppercase tracking-wider mb-2 ${c.color}`}>{c.key}</p>
              <div className="flex items-end justify-between">
                <div>
                  <p className="text-lg font-bold text-white">{catMetrics.length}</p>
                  <p className="text-[10px] text-gray-500">metrics</p>
                </div>
                <div className="text-right">
                  <p className={`text-xs font-medium ${avgChange >= 0 ? 'text-emerald-400' : 'text-red-400'}`}>
                    {avgChange >= 0 ? '+' : ''}{avgChange.toFixed(1)}%
                  </p>
                  <p className="text-[10px] text-gray-600">{improving}/{catMetrics.length} improving</p>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Metrics grid */}
      <div className="grid grid-cols-3 gap-4">
        {filtered.map((metric) => (
          <MetricTile
            key={metric.id}
            metric={metric}
            accent={CATEGORIES.find((c) => c.key === metric.category)?.accent ?? activeAccent}
            expanded={expandedMetric === metric.id}
            onToggle={() => setExpandedMetric(expandedMetric === metric.id ? null : metric.id)}
          />
        ))}
      </div>

      {filtered.length === 0 && (
        <div className="glass-card p-8 text-center mt-4">
          <BarChart3 className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No metrics in this category</p>
        </div>
      )}
    </>
  );
}

/* ================================================================== */
/*  SIMULATION VIEW                                                    */
/* ================================================================== */

function SimulationView() {
  const [params, setParams] = useState({
    growthRate: 12,
    burnMultiplier: 1.0,
    hiringPace: 2,
    cacChange: 0,
  });
  const [activeScenario, setActiveScenario] = useState<string>('baseline');
  const [simulating, setSimulating] = useState(false);

  const comparisonData = simulationScenarios.map((s) => ({
    name: s.name.length > 20 ? s.name.slice(0, 20) + '...' : s.name,
    'MRR (12mo)': s.outcomes.mrr12m,
    Valuation: s.outcomes.valuation / 1000,
  }));

  const handleSimulate = () => {
    setSimulating(true);
    setTimeout(() => setSimulating(false), 1500);
  };

  const active = simulationScenarios.find((s) => s.id === activeScenario);

  return (
    <>
      <div className="grid grid-cols-3 gap-6 mb-6">
        <div className="glass-card p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Scenario Parameters</h3>
          <div className="space-y-5">
            {[
              { key: 'growthRate', label: 'Monthly Growth Rate', unit: '%', min: 0, max: 50, step: 1 },
              { key: 'burnMultiplier', label: 'Burn Multiplier', unit: 'x', min: 0.5, max: 2.5, step: 0.1 },
              { key: 'hiringPace', label: 'Hires / Month', unit: 'people', min: 0, max: 10, step: 1 },
              { key: 'cacChange', label: 'CAC Change', unit: '%', min: -30, max: 30, step: 5 },
            ].map((p) => (
              <div key={p.key}>
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-xs text-gray-400">{p.label}</label>
                  <span className="text-xs font-mono text-sky-300">{params[p.key as keyof typeof params]}{p.unit}</span>
                </div>
                <input
                  type="range"
                  min={p.min} max={p.max} step={p.step}
                  value={params[p.key as keyof typeof params]}
                  onChange={(e) => setParams({ ...params, [p.key]: parseFloat(e.target.value) })}
                  className="w-full h-1.5 rounded-full bg-gray-800 appearance-none cursor-pointer accent-sky-500"
                />
              </div>
            ))}
          </div>
          <div className="flex gap-2 mt-6">
            <button
              onClick={handleSimulate}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-all"
            >
              {simulating ? <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" /> : <Play className="w-4 h-4" />}
              {simulating ? 'Running...' : 'Simulate'}
            </button>
            <button
              onClick={() => setParams({ growthRate: 12, burnMultiplier: 1.0, hiringPace: 2, cacChange: 0 })}
              className="px-3 py-2.5 bg-gray-800 hover:bg-gray-700 text-gray-300 text-sm rounded-lg transition-all"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
          </div>
        </div>

        <div className="col-span-2 glass-card p-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">Scenario Comparison</h3>
          <div className="flex gap-2 mb-4">
            {simulationScenarios.map((s) => (
              <button
                key={s.id}
                onClick={() => { setActiveScenario(s.id); setParams(s.parameters as typeof params); }}
                className={`px-3 py-1.5 text-xs rounded-lg border transition-all ${
                  activeScenario === s.id
                    ? 'bg-sky-600/15 border-sky-500/30 text-sky-300'
                    : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'
                }`}
              >{s.name}</button>
            ))}
          </div>
          <ResponsiveContainer width="100%" height={250}>
            <BarChart data={comparisonData}>
              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
              <XAxis dataKey="name" stroke="#6b7280" fontSize={11} />
              <YAxis stroke="#6b7280" fontSize={11} />
              <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }} />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Bar dataKey="MRR (12mo)" fill="#0ea5e9" radius={[4, 4, 0, 0]} />
              <Bar dataKey="Valuation" fill="#06b6d4" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {active && (
        <div className="glass-card p-6 mb-6">
          <h3 className="text-sm font-medium text-gray-300 mb-4">
            Projected Outcomes: <span className="text-sky-300">{active.name}</span>
          </h3>
          <div className="grid grid-cols-4 gap-4">
            {[
              { label: '12-Month MRR', value: `$${active.outcomes.mrr12m.toLocaleString()}`, color: 'text-sky-300' },
              { label: 'Remaining Runway', value: `${active.outcomes.runway12m} months`, color: active.outcomes.runway12m > 6 ? 'text-emerald-300' : 'text-red-300' },
              { label: 'Team Size (12mo)', value: `${active.outcomes.teamSize12m} people`, color: 'text-cyan-300' },
              { label: 'Projected Valuation', value: `$${(active.outcomes.valuation / 1000000).toFixed(1)}M`, color: 'text-amber-300' },
            ].map((o) => (
              <div key={o.label} className="metric-card text-center">
                <span className="text-xs text-gray-500 uppercase tracking-wider">{o.label}</span>
                <p className={`text-xl font-bold mt-2 ${o.color}`}>{o.value}</p>
              </div>
            ))}
          </div>
          <div className="mt-4 p-3 rounded-lg bg-sky-950/30 border border-sky-900/30">
            <p className="text-xs text-sky-300/80">
              Simulation uses hybrid mode: real financial data combined with Bayesian-predicted growth trajectories.
            </p>
          </div>
        </div>
      )}

      <div className="glass-card p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <GitBranch className="w-4 h-4" /> Decision Tree — Strategic Paths
        </h3>
        <p className="text-xs text-gray-500 mb-4">Bayesian probabilities for each decision branch.</p>
        <div className="overflow-x-auto">
          <svg viewBox="0 0 860 470" className="w-full" style={{ minHeight: '400px' }}>
            <DecisionTreeSVG tree={decisionTree} />
          </svg>
        </div>
      </div>

      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
          <Activity className="w-4 h-4" /> Monte Carlo MRR Projection — 12 Months
        </h3>
        <ResponsiveContainer width="100%" height={320}>
          <ComposedChart data={monteCarloBand}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis dataKey="month" stroke="#6b7280" fontSize={11} />
            <YAxis stroke="#6b7280" fontSize={11} tickFormatter={(v: number) => `$${(v / 1000).toFixed(0)}K`} />
            <Tooltip
              contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: '8px' }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value);
                return [Number.isFinite(n) ? `$${n.toLocaleString()}` : String(value ?? ''), ''];
              }}
            />
            <Area type="monotone" dataKey="p10Base" stackId="band" fill="transparent" stroke="none" />
            <Area type="monotone" dataKey="band" stackId="band" fill="#0ea5e9" fillOpacity={0.12} stroke="none" name="P10–P90 Range" />
            {[1,2,3,4,5].map((p) => (
              <Line key={p} type="monotone" dataKey={`path${p}`} stroke="#0ea5e9" strokeOpacity={0.18} strokeWidth={1} dot={false} name={`Path ${p}`} />
            ))}
            <Line type="monotone" dataKey="p50" stroke="#06b6d4" strokeWidth={2.5} dot={false} name="Median (P50)" />
            <Legend wrapperStyle={{ fontSize: '11px' }} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Metric Tile                                                        */
/* ------------------------------------------------------------------ */

function MetricTile({ metric, accent, expanded, onToggle }: {
  metric: TrackedMetric; accent: string; expanded: boolean; onToggle: () => void;
}) {
  const src = SOURCE_CFG[metric.dataSource] ?? SOURCE_CFG['auto-ingested'];
  const SrcIcon = src.icon;
  const isPositive = metric.change >= 0;
  const lowerBetter = ['CAC', 'Churn Rate', 'Monthly Burn', 'Deal Cycle Time', 'Top Churn Driver', 'Bounce Rate', 'CPA', 'Open Bugs'];
  const isGood = lowerBetter.includes(metric.name) ? !isPositive : isPositive;
  const sparkData = metric.trend.map((v, i) => ({ month: MONTH_LABELS[i] ?? `T-${metric.trend.length - i}`, value: v }));
  const targetPct = metric.target ? Math.min(100, Math.round((metric.value / metric.target) * 100)) : null;

  return (
    <div className="glass-card p-4 transition-all hover:border-gray-700/50">
      <div className="flex items-start justify-between mb-2">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <span className="text-xs text-gray-400 font-medium">{metric.name}</span>
            <span className={`text-[9px] px-1.5 py-0.5 rounded-full ${src.color} flex items-center gap-1`}>
              <SrcIcon className="w-2.5 h-2.5" />{src.label}
            </span>
          </div>
          <div className="flex items-end gap-2">
            <span className="text-xl font-bold text-white">
              {isCurrencyPrefix(metric.unit) && metric.unit}{metric.value.toLocaleString()}{metric.unit === '%' && '%'}
            </span>
            {!isCurrencyPrefix(metric.unit) && metric.unit !== '%' && metric.unit && (
              <span className="text-[10px] text-gray-500 mb-0.5">{metric.unit}</span>
            )}
          </div>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className={`flex items-center gap-1 text-xs ${isGood ? 'text-emerald-400' : 'text-red-400'}`}>
            {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
            {Math.abs(metric.change)}%
          </div>
          {metric.percentile && (
            <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/15 text-sky-300">P{metric.percentile}</span>
          )}
        </div>
      </div>

      <div className="h-12 mt-1 -mx-1">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={sparkData}>
            <defs>
              <linearGradient id={`grad-${metric.id}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor={accent} stopOpacity={0.3} />
                <stop offset="95%" stopColor={accent} stopOpacity={0} />
              </linearGradient>
            </defs>
            <Area type="monotone" dataKey="value" stroke={accent} strokeWidth={1.5} fill={`url(#grad-${metric.id})`} dot={false} />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {metric.target && targetPct !== null && (
        <div className="mt-2">
          <div className="flex items-center justify-between text-[10px] text-gray-500 mb-1">
            <span className="flex items-center gap-1">
              <Target className="w-2.5 h-2.5" />
              Target: {isCurrencyPrefix(metric.unit) ? metric.unit : ''}{metric.target.toLocaleString()}{metric.unit === '%' ? '%' : ''}
            </span>
            <span>{targetPct}%</span>
          </div>
          <div className="h-1 rounded-full bg-gray-800 overflow-hidden">
            <div className="h-full rounded-full transition-all" style={{ width: `${targetPct}%`, backgroundColor: targetPct >= 80 ? '#34d399' : targetPct >= 50 ? accent : '#f87171' }} />
          </div>
        </div>
      )}

      {metric.integration && <p className="text-[9px] text-gray-600 mt-2">via {metric.integration}</p>}

      <button onClick={onToggle} className="w-full flex items-center justify-center gap-1 mt-2 text-[10px] text-gray-500 hover:text-gray-300 transition-colors">
        {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
        {expanded ? 'Less' : 'Details'}
      </button>

      {expanded && (
        <div className="mt-3 pt-3 border-t border-gray-800/50 space-y-3">
          <p className="text-[11px] text-gray-400">{metric.description}</p>
          <div className="h-32">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={sparkData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#1e1e3a" />
                <XAxis dataKey="month" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} width={40} />
                <Tooltip contentStyle={{ backgroundColor: '#0f172a', border: '1px solid rgba(14,165,233,0.2)', borderRadius: '8px', fontSize: '11px' }} labelStyle={{ color: '#38bdf8' }} itemStyle={{ color: '#e2e8f0' }} />
                <RLine type="monotone" dataKey="value" stroke={accent} strokeWidth={2} dot={{ r: 2, fill: accent }} activeDot={{ r: 4 }} />
                {metric.target && <RLine type="monotone" dataKey={() => metric.target} stroke="#4b5563" strokeDasharray="4 4" strokeWidth={1} dot={false} name="Target" />}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="py-2 rounded-lg bg-gray-900/50"><p className="text-[10px] text-gray-500">Low</p><p className="text-xs font-medium text-white">{Math.min(...metric.trend).toLocaleString()}</p></div>
            <div className="py-2 rounded-lg bg-gray-900/50"><p className="text-[10px] text-gray-500">High</p><p className="text-xs font-medium text-white">{Math.max(...metric.trend).toLocaleString()}</p></div>
            <div className="py-2 rounded-lg bg-gray-900/50"><p className="text-[10px] text-gray-500">Avg</p><p className="text-xs font-medium text-white">{Math.round(metric.trend.reduce((s, v) => s + v, 0) / metric.trend.length).toLocaleString()}</p></div>
          </div>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Decision Tree SVG                                                  */
/* ------------------------------------------------------------------ */

function DecisionTreeSVG({ tree }: { tree: DecisionNode }) {
  const l1 = tree.children || [];
  const nodeH = 46;
  const l2AllY: number[][] = [];
  let yOffset = 12;
  for (const child of l1) {
    const leaves = child.children || [];
    const ys: number[] = [];
    for (let j = 0; j < leaves.length; j++) { ys.push(yOffset); yOffset += 52; }
    l2AllY.push(ys);
    yOffset += 14;
  }
  const l1Y = l2AllY.map((ys) => (ys[0] + ys[ys.length - 1]) / 2);
  const rootY = (l1Y[0] + l1Y[l1Y.length - 1]) / 2;
  const rootX = 25, rootW = 140, l1X = 260, l1W = 195, l2X = 560, l2W = 260;

  function impactColor(impact: number) {
    if (impact >= 50) return '#059669';
    if (impact >= 10) return '#d97706';
    if (impact >= 0) return '#9ca3af';
    if (impact >= -30) return '#f59e0b';
    return '#dc2626';
  }

  return (
    <>
      {l1.map((_, i) => (
        <path key={`e1-${i}`} d={`M ${rootX + rootW} ${rootY + nodeH / 2} C ${rootX + rootW + 50} ${rootY + nodeH / 2} ${l1X - 50} ${l1Y[i] + nodeH / 2} ${l1X} ${l1Y[i] + nodeH / 2}`} fill="none" stroke="#374151" strokeWidth={1.5} />
      ))}
      {l1.map((child, i) =>
        (child.children || []).map((_, j) => (
          <path key={`e2-${i}-${j}`} d={`M ${l1X + l1W} ${l1Y[i] + nodeH / 2} C ${l1X + l1W + 50} ${l1Y[i] + nodeH / 2} ${l2X - 50} ${l2AllY[i][j] + nodeH / 2} ${l2X} ${l2AllY[i][j] + nodeH / 2}`} fill="none" stroke="#1f2937" strokeWidth={1} />
        ))
      )}
      <rect x={rootX} y={rootY} width={rootW} height={nodeH} rx={10} fill="#0c1929" stroke="#0ea5e9" strokeWidth={1.5} />
      <text x={rootX + rootW / 2} y={rootY + nodeH / 2 + 4} textAnchor="middle" fill="#c7d2fe" fontSize={11} fontWeight="bold">{tree.label}</text>
      {l1.map((child, i) => {
        const ic = impactColor(child.impact);
        return (
          <g key={child.id}>
            <rect x={l1X} y={l1Y[i]} width={l1W} height={nodeH} rx={8} fill="rgba(255,255,255,0.04)" stroke="#374151" />
            <text x={l1X + 10} y={l1Y[i] + 18} fill="#e5e7eb" fontSize={10} fontWeight="500">{child.label.length > 26 ? child.label.slice(0, 26) + '...' : child.label}</text>
            <text x={l1X + 10} y={l1Y[i] + 34} fill="#9ca3af" fontSize={9}>{(child.probability * 100).toFixed(0)}%{child.outcome ? ` · ${child.outcome.slice(0, 22)}` : ''}</text>
            <rect x={l1X + l1W - 30} y={l1Y[i] + 10} width={22} height={18} rx={4} fill={ic} fillOpacity={0.2} />
            <text x={l1X + l1W - 19} y={l1Y[i] + 23} textAnchor="middle" fill={ic} fontSize={8} fontWeight="bold">{child.impact > 0 ? '+' : ''}{child.impact}</text>
          </g>
        );
      })}
      {l1.map((child, i) =>
        (child.children || []).map((leaf, j) => {
          const ic = impactColor(leaf.impact);
          return (
            <g key={leaf.id}>
              <rect x={l2X} y={l2AllY[i][j]} width={l2W} height={nodeH} rx={8} fill="rgba(255,255,255,0.03)" stroke="#1f2937" />
              <text x={l2X + 10} y={l2AllY[i][j] + 18} fill="#d1d5db" fontSize={10}>{leaf.label}</text>
              <text x={l2X + 10} y={l2AllY[i][j] + 34} fill="#6b7280" fontSize={9}>{(leaf.probability * 100).toFixed(0)}% · {leaf.outcome}</text>
              <rect x={l2X + l2W - 30} y={l2AllY[i][j] + 10} width={22} height={18} rx={4} fill={ic} fillOpacity={0.2} />
              <text x={l2X + l2W - 19} y={l2AllY[i][j] + 23} textAnchor="middle" fill={ic} fontSize={8} fontWeight="bold">{leaf.impact > 0 ? '+' : ''}{leaf.impact}</text>
            </g>
          );
        })
      )}
    </>
  );
}
