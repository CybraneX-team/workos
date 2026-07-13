import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { BarChart, Bar, XAxis, YAxis, Tooltip, ResponsiveContainer, Cell } from 'recharts';
import { syncMetaMetricsOnce, type MetaMetricSyncResult } from '../../../lib/integrations/service';
import { GlassCard } from './PanelShell';

const STABLE_KEY = 'mkt_paid_acquisition_campaigns';
const LABEL = 'campaigns health';
const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

function fmt$(n: number, currency: string) {
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`;
  return `${currency} ${n.toFixed(0)}`;
}

export function CampaignsPanel({ nodeLabel, nodeStableSourceKey }: { nodeLabel: string; nodeStableSourceKey?: string }) {
  const isThisNode = nodeStableSourceKey === STABLE_KEY || nodeLabel.trim().toLowerCase() === LABEL;
  const [sync, setSync] = useState<MetaMetricSyncResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!isThisNode) return;
    syncMetaMetricsOnce()
      .then(setSync)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isThisNode]);

  if (!isThisNode) return null;

  const preview = sync?.preview;
  const campaigns = preview?.topCampaigns ?? [];

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Campaigns</p>
          <p className="text-[10px] text-white/30 mt-1">Rolling 30 days · {sync?.syncedAt ? new Date(sync.syncedAt).toLocaleString() : 'not synced'}</p>
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
          : sync?.fresh ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Fresh</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="w-3 h-3" /> Stale</span>}
      </div>

      {error && <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200 mb-3">{error}</div>}
      {sync?.syncError && <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200 mb-3">Showing the last successful value. {sync.syncError}</div>}
      {!loading && !preview && !error && <p className="text-xs text-white/40">Connect Meta Ads to see campaign performance.</p>}
      {preview && campaigns.length === 0 && <p className="text-xs text-white/40">No campaigns with spend in the last 30 days.</p>}

      {campaigns.length > 0 && (
        <>
          <ResponsiveContainer width="100%" height={140}>
            <BarChart data={campaigns} margin={{ left: -20 }}>
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={v => fmt$(v, preview!.currency)} />
              <Tooltip
                contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }}
                formatter={v => [fmt$(Number(v ?? 0), preview!.currency), 'Spend']}
              />
              <Bar dataKey="spend" radius={[4, 4, 0, 0]}>
                {campaigns.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
              </Bar>
            </BarChart>
          </ResponsiveContainer>

          <div className="mt-3 space-y-1.5">
            {campaigns.map((c, i) => (
              <div key={i} className="flex items-center justify-between text-xs rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2">
                <span className="text-white/70 truncate max-w-[45%]">{c.name}</span>
                <span className="text-white/40">{fmt$(c.spend, preview!.currency)}</span>
                <span className="text-white/40">{c.roas}x ROAS</span>
                <span className="text-white/40">{c.conversions} conv.</span>
              </div>
            ))}
          </div>
        </>
      )}
    </GlassCard>
  );
}
