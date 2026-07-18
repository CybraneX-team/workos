import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import { useMetaAdsBrief } from '../../../lib/integrations/useMetaAdsBrief';
import { GlassCard } from './PanelShell';

const STABLE_KEY = 'mkt_paid_acquisition_spend_reach';
const LABEL = 'spend & reach health';

function compact(value: number) {
  return new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
function money(value: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export function SpendReachPanel({ nodeLabel, nodeStableSourceKey }: { nodeLabel: string; nodeStableSourceKey?: string }) {
  const isThisNode = nodeStableSourceKey === STABLE_KEY || nodeLabel.trim().toLowerCase() === LABEL;
  const { brief, loading, error } = useMetaAdsBrief(isThisNode);
  if (!isThisNode) return null;
  const summary = brief?.summary;

  return (
    <GlassCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Spend &amp; Reach</p><p className="mt-1 text-[10px] text-white/30">Data through {brief?.connection.dataThrough || '—'} · {brief?.connection.timezone || 'timezone pending'}</p></div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : brief?.connection.state === 'healthy' ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Current</span> : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Cached</span>}
      </div>
      {error && <div className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</div>}
      {!loading && !summary && !error && <p className="text-xs text-white/40">Connect Meta Ads to see spend and reach data.</p>}
      {summary && <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat label="Ad Spend (30d)" value={money(summary.spend, summary.currency)} />
        <Stat label="Impressions" value={compact(summary.impressions)} />
        <Stat label="Clicks" value={compact(summary.clicks)} />
        <Stat label="CTR" value={`${summary.ctr.toFixed(2)}%`} />
        <Stat label="CPC" value={money(summary.cpc, summary.currency)} />
        <Stat label="Campaigns with spend" value={String(brief?.campaigns.length ?? 0)} />
      </div>}
    </GlassCard>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4"><p className="text-[10px] uppercase tracking-wider text-white/35">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></div>;
}
