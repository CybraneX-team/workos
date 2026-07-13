import { useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { syncMetaMetricsOnce, type MetaMetricSyncResult } from '../../../lib/integrations/service';
import { GlassCard } from './PanelShell';

const STABLE_KEY = 'mkt_paid_acquisition_spend_reach';
const LABEL = 'spend & reach health';

function fmt$(n: number, currency: string) {
  if (n >= 1_000_000) return `${currency} ${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${currency} ${(n / 1_000).toFixed(1)}K`;
  return `${currency} ${n.toFixed(0)}`;
}
function fmtNum(n: number) {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return String(n);
}

export function SpendReachPanel({ nodeLabel, nodeStableSourceKey }: { nodeLabel: string; nodeStableSourceKey?: string }) {
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

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Spend &amp; Reach</p>
          <p className="text-[10px] text-white/30 mt-1">Rolling 30 days · {sync?.syncedAt ? new Date(sync.syncedAt).toLocaleString() : 'not synced'}</p>
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
          : sync?.fresh ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Fresh</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="w-3 h-3" /> Stale</span>}
      </div>

      {error && <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200 mb-3">{error}</div>}
      {sync?.syncError && <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200 mb-3">Showing the last successful value. {sync.syncError}</div>}
      {!loading && !preview && !error && <p className="text-xs text-white/40">Connect Meta Ads to see spend and reach data.</p>}

      {preview && (
        <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
          <Stat label="Ad Spend (30d)" value={fmt$(preview.spend30d, preview.currency)} />
          <Stat label="Impressions" value={fmtNum(preview.impressions30d)} />
          <Stat label="Clicks" value={fmtNum(preview.clicks30d)} />
          <Stat label="CTR" value={`${preview.ctr}%`} />
          <Stat label="CPC" value={fmt$(preview.cpc, preview.currency)} />
          <Stat label="Active Campaigns" value={String(preview.activeCampaigns)} />
        </div>
      )}
    </GlassCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p>
      <p className="text-xl font-semibold text-white mt-1">{value}</p>
    </div>
  );
}
