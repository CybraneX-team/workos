import { BarChart3, Target, Globe2, TrendingDown } from 'lucide-react';
import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  Radar,
  Legend,
  Tooltip,
  ResponsiveContainer,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from 'recharts';
import PageHeader from '../components/PageHeader';
import { benchmarks, cohortRadar, industryBenchmarks, survivalCurve } from '../data/mockData';

function getPercentilePosition(
  value: number,
  percentiles: { P10: number; P25: number; P50: number; P75: number; P90: number },
) {
  const entries = [
    { p: 10, v: percentiles.P10 },
    { p: 25, v: percentiles.P25 },
    { p: 50, v: percentiles.P50 },
    { p: 75, v: percentiles.P75 },
    { p: 90, v: percentiles.P90 },
  ];

  if (value <= entries[0].v) return 5;
  if (value >= entries[entries.length - 1].v) return 95;

  for (let i = 0; i < entries.length - 1; i++) {
    if (value >= entries[i].v && value <= entries[i + 1].v) {
      const ratio = (value - entries[i].v) / (entries[i + 1].v - entries[i].v);
      return entries[i].p + ratio * (entries[i + 1].p - entries[i].p);
    }
  }
  return 50;
}

function getPercentileColor(p: number, isLowerBetter: boolean) {
  const effective = isLowerBetter ? 100 - p : p;
  if (effective >= 70) return 'text-emerald-400';
  if (effective >= 40) return 'text-amber-400';
  return 'text-red-400';
}

export default function Benchmarks() {
  return (
    <div>
      <PageHeader
        title="Benchmarking"
        subtitle="Percentile rankings against your cohort — Seed Stage SaaS in India"
        icon={<BarChart3 className="w-6 h-6" />}
      />

      {/* ===== PERCENTILE RANKINGS ===== */}
      <div className="space-y-4 mb-8">
        {benchmarks.map((b) => {
          const isLowerBetter = ['CAC', 'Churn Rate', 'Burn Rate'].includes(b.metric);
          const position = getPercentilePosition(b.currentValue, b.percentiles);
          const pColor = getPercentileColor(position, isLowerBetter);

          return (
            <div key={b.metric} className="glass-card p-6">
              <div className="flex items-center justify-between mb-4">
                <div>
                  <h3 className="text-base font-medium text-white">{b.metric}</h3>
                  <span className="text-xs text-gray-500">
                    {b.industry} &middot; {b.stage} &middot; {b.geography}
                  </span>
                </div>
                <div className="text-right">
                  <span className="text-lg font-bold text-white">
                    {b.metric === 'Churn Rate'
                      ? `${b.currentValue}%`
                      : `$${b.currentValue.toLocaleString()}`}
                  </span>
                  <p className={`text-xs font-medium ${pColor}`}>
                    P{Math.round(position)} {isLowerBetter ? 'efficiency' : 'performance'}
                  </p>
                </div>
              </div>

              {/* Percentile Bar */}
              <div className="relative">
                <div className="flex items-center gap-0 h-8 rounded-lg overflow-hidden">
                  <div
                    className="h-full bg-red-500/20 border-r border-gray-700"
                    style={{ width: '10%' }}
                  >
                    <span className="text-[9px] text-gray-500 flex items-center justify-center h-full">
                      P10
                    </span>
                  </div>
                  <div
                    className="h-full bg-red-500/10 border-r border-gray-700"
                    style={{ width: '15%' }}
                  >
                    <span className="text-[9px] text-gray-500 flex items-center justify-center h-full">
                      P25
                    </span>
                  </div>
                  <div
                    className="h-full bg-amber-500/10 border-r border-gray-700"
                    style={{ width: '25%' }}
                  >
                    <span className="text-[9px] text-gray-500 flex items-center justify-center h-full">
                      P50
                    </span>
                  </div>
                  <div
                    className="h-full bg-emerald-500/10 border-r border-gray-700"
                    style={{ width: '25%' }}
                  >
                    <span className="text-[9px] text-gray-500 flex items-center justify-center h-full">
                      P75
                    </span>
                  </div>
                  <div className="h-full bg-emerald-500/15" style={{ width: '25%' }}>
                    <span className="text-[9px] text-gray-500 flex items-center justify-center h-full">
                      P90
                    </span>
                  </div>
                </div>
                {/* Current Position Marker */}
                <div
                  className="absolute top-0 h-8 flex flex-col items-center"
                  style={{ left: `${position}%`, transform: 'translateX(-50%)' }}
                >
                  <div className="w-0.5 h-8 bg-sky-400" />
                  <div className="absolute -top-5 whitespace-nowrap">
                    <span className="text-[10px] font-medium text-sky-300 bg-sky-500/20 px-1.5 py-0.5 rounded">
                      You:{' '}
                      {b.metric === 'Churn Rate'
                        ? `${b.currentValue}%`
                        : `$${b.currentValue.toLocaleString()}`}
                    </span>
                  </div>
                </div>
              </div>

              {/* Percentile Values */}
              <div className="flex justify-between mt-3 text-[10px] text-gray-600">
                <span>${b.percentiles.P10.toLocaleString()}</span>
                <span>${b.percentiles.P25.toLocaleString()}</span>
                <span>${b.percentiles.P50.toLocaleString()}</span>
                <span>${b.percentiles.P75.toLocaleString()}</span>
                <span>${b.percentiles.P90.toLocaleString()}</span>
              </div>
            </div>
          );
        })}
      </div>

      {/* ===== COHORT RADAR COMPARISON ===== */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
          <Target className="w-4 h-4" /> Cohort Comparison — Multi-Dimensional
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Your performance vs cohort average and top quartile across 6 key dimensions.
        </p>
        <div className="flex items-center justify-center">
          <ResponsiveContainer width="100%" height={380}>
            <RadarChart outerRadius={140} data={cohortRadar}>
              <PolarGrid stroke="#1f2937" />
              <PolarAngleAxis dataKey="dimension" stroke="#9ca3af" fontSize={11} />
              <PolarRadiusAxis angle={30} domain={[0, 100]} stroke="#374151" fontSize={9} />
              <Radar
                name="Top Quartile"
                dataKey="topQuartile"
                stroke="#06b6d4"
                fill="#06b6d4"
                fillOpacity={0.08}
                strokeWidth={1}
              />
              <Radar
                name="Cohort Average"
                dataKey="cohortAvg"
                stroke="#6b7280"
                fill="#6b7280"
                fillOpacity={0.05}
                strokeWidth={1}
                strokeDasharray="4 4"
              />
              <Radar
                name="You"
                dataKey="you"
                stroke="#0ea5e9"
                fill="#0ea5e9"
                fillOpacity={0.2}
                strokeWidth={2}
              />
              <Legend wrapperStyle={{ fontSize: '12px' }} />
              <Tooltip
                contentStyle={{
                  background: '#111827',
                  border: '1px solid #374151',
                  borderRadius: '8px',
                }}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* ===== INDUSTRY BENCHMARKS ===== */}
      <div className="glass-card p-6 mb-6">
        <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
          <Globe2 className="w-4 h-4" /> Industry Benchmark Comparison
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          How Seed-stage averages differ across industries. Your industry (SaaS) is highlighted.
        </p>
        <div className="grid grid-cols-5 gap-3">
          {industryBenchmarks.map((ib) => {
            const isYours = ib.industry === 'SaaS';
            return (
              <div
                key={ib.industry}
                className={`rounded-xl p-4 border transition-all ${
                  isYours
                    ? 'bg-sky-600/10 border-sky-500/30'
                    : 'bg-gray-900/50 border-gray-800/50'
                }`}
              >
                <div className="flex items-center justify-between mb-3">
                  <h4
                    className={`text-sm font-medium ${isYours ? 'text-sky-300' : 'text-white'}`}
                  >
                    {ib.industry}
                  </h4>
                  {isYours && (
                    <span className="text-[9px] px-1.5 py-0.5 rounded-full bg-sky-500/20 text-sky-300">
                      YOU
                    </span>
                  )}
                </div>
                <div className="space-y-2.5">
                  <div>
                    <span className="text-[10px] text-gray-500">Avg MRR</span>
                    <p className="text-sm font-medium text-sky-300">
                      ${ib.avgMRR.toLocaleString()}
                    </p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Avg CAC</span>
                    <p className="text-sm font-medium text-amber-300">${ib.avgCAC}</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Avg Churn</span>
                    <p className="text-sm font-medium text-red-300">{ib.avgChurn}%</p>
                  </div>
                  <div>
                    <span className="text-[10px] text-gray-500">Avg Runway</span>
                    <p className="text-sm font-medium text-emerald-300">{ib.avgRunway}mo</p>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* ===== SURVIVAL CURVE ===== */}
      <div className="glass-card p-6">
        <h3 className="text-sm font-medium text-gray-300 mb-1 flex items-center gap-2">
          <TrendingDown className="w-4 h-4" /> Startup Survival Curve — 24 Months
        </h3>
        <p className="text-xs text-gray-500 mb-4">
          Average seed-stage survival rate vs your projected trajectory. Outperformance gap shown.
        </p>
        <ResponsiveContainer width="100%" height={300}>
          <AreaChart data={survivalCurve}>
            <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" />
            <XAxis
              dataKey="month"
              stroke="#6b7280"
              fontSize={11}
              label={{
                value: 'Month',
                position: 'insideBottom',
                offset: -4,
                fill: '#6b7280',
                fontSize: 10,
              }}
            />
            <YAxis
              domain={[0, 100]}
              stroke="#6b7280"
              fontSize={11}
              tickFormatter={(v: number) => `${v}%`}
            />
            <Tooltip
              contentStyle={{
                background: '#111827',
                border: '1px solid #374151',
                borderRadius: '8px',
              }}
              formatter={(value) => {
                const n = typeof value === 'number' ? value : Number(value);
                return [Number.isFinite(n) ? `${n}%` : String(value ?? ''), ''];
              }}
            />
            <Legend wrapperStyle={{ fontSize: '12px' }} />
            <Area
              type="monotone"
              dataKey="survival"
              name="Average Startup"
              stroke="#6b7280"
              fill="#6b7280"
              fillOpacity={0.08}
              strokeWidth={1.5}
              strokeDasharray="4 4"
            />
            <Area
              type="monotone"
              dataKey="yourProjected"
              name="Your Projected"
              stroke="#0ea5e9"
              fill="#0ea5e9"
              fillOpacity={0.15}
              strokeWidth={2}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
