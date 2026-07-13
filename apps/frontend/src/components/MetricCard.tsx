import { TrendingUp, TrendingDown } from 'lucide-react';
import type { Metric } from '../types';
import { isCurrencyPrefix } from '../lib/currency';

export default function MetricCard({ metric }: { metric: Metric }) {
  const isPositive = metric.change >= 0;
  const isGoodTrend =
    metric.name === 'Churn Rate' || metric.name === 'CAC' || metric.name === 'Burn Rate'
      ? !isPositive
      : isPositive;

  return (
    <div className="metric-card">
      <div className="flex items-start justify-between mb-3">
        <span className="text-xs uppercase tracking-wider" style={{ color: '#5E5E5E' }}>
          {metric.name}
        </span>
        {metric.percentile && (
          <span
            className="text-[10px] px-1.5 py-0.5 rounded-full"
            style={{ background: 'rgba(193,174,255,0.1)', color: '#C1AEFF' }}
          >
            P{metric.percentile}
          </span>
        )}
      </div>
      <div className="flex items-end gap-2">
        <span className="text-2xl font-bold text-white">
          {isCurrencyPrefix(metric.unit) && metric.unit}
          {metric.value.toLocaleString()}
          {metric.unit === '%' && '%'}
        </span>
        {!isCurrencyPrefix(metric.unit) && metric.unit !== '%' && metric.unit && (
          <span className="text-xs mb-1" style={{ color: '#5E5E5E' }}>{metric.unit}</span>
        )}
      </div>
      <div
        className="flex items-center gap-1 mt-2 text-xs"
        style={{ color: isGoodTrend ? '#34d399' : '#f87171' }}
      >
        {isPositive ? <TrendingUp className="w-3 h-3" /> : <TrendingDown className="w-3 h-3" />}
        <span>{Math.abs(metric.change)}%</span>
        <span style={{ color: '#5E5E5E' }}>vs last month</span>
      </div>
    </div>
  );
}
