import { AlertTriangle, CheckCircle2, ExternalLink, Loader2 } from 'lucide-react';
import { Bar, BarChart, Cell, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMetaAdsBrief } from '../../../lib/integrations/useMetaAdsBrief';
import { GlassCard } from './PanelShell';

const STABLE_KEY = 'mkt_paid_acquisition_campaigns';
const LABEL = 'campaigns health';
const COLORS = ['#0ea5e9', '#8b5cf6', '#10b981', '#f59e0b', '#ef4444'];

function money(value: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', notation: 'compact', maximumFractionDigits: 1 }).format(value);
}
export function CampaignsPanel({ nodeLabel, nodeStableSourceKey }: { nodeLabel: string; nodeStableSourceKey?: string }) {
  const isThisNode = nodeStableSourceKey === STABLE_KEY || nodeLabel.trim().toLowerCase() === LABEL;
  const { brief, loading, error } = useMetaAdsBrief(isThisNode);
  if (!isThisNode) return null;
  const campaigns = brief?.campaigns ?? [];

  return (
    <GlassCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div><p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Campaigns</p><p className="mt-1 text-[10px] text-white/30">Data through {brief?.connection.dataThrough || '—'} · {brief?.connection.timezone || 'timezone pending'}</p></div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" /> : brief?.connection.state === 'healthy' ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Current</span> : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="h-3 w-3" /> Cached</span>}
      </div>
      {error && <div className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{error}</div>}
      {!loading && campaigns.length === 0 && !error && <p className="text-xs text-white/40">No campaigns with spend in the last 30 complete days.</p>}
      {campaigns.length > 0 && <>
        <ResponsiveContainer width="100%" height={140}><BarChart data={campaigns.slice(0, 8)} margin={{ left: -20 }}><XAxis dataKey="campaignName" tick={{ fontSize: 9, fill: '#6b7280' }} axisLine={false} tickLine={false} /><YAxis tick={{ fontSize: 10, fill: '#6b7280' }} axisLine={false} tickLine={false} tickFormatter={(value) => money(value, brief?.summary.currency ?? null)} /><Tooltip contentStyle={{ background: '#1e293b', border: '1px solid #334155', borderRadius: 8, fontSize: 12 }} formatter={(value) => [money(Number(value ?? 0), brief?.summary.currency ?? null), 'Spend']} /><Bar dataKey="spend" radius={[4, 4, 0, 0]}>{campaigns.slice(0, 8).map((campaign, index) => <Cell key={campaign.campaignId} fill={COLORS[index % COLORS.length]} />)}</Bar></BarChart></ResponsiveContainer>
        <div className="mt-3 space-y-1.5">{campaigns.map((campaign) => <div key={campaign.campaignId} className="flex items-center justify-between gap-3 rounded-lg border border-white/8 bg-white/[0.03] px-3 py-2 text-xs"><span className="max-w-[38%] truncate text-white/70">{campaign.campaignName}</span><span className="text-white/40">{money(campaign.spend, brief?.summary.currency ?? null)}</span><span className="text-white/40">{campaign.purchaseRoas}x ROAS</span><span className="text-white/40">{campaign.selectedConversions} conv.</span><a href={campaign.adsManagerUrl} target="_blank" rel="noreferrer" aria-label={`Open ${campaign.campaignName} in Ads Manager`}><ExternalLink className="h-3.5 w-3.5 text-white/40" /></a></div>)}</div>
      </>}
    </GlassCard>
  );
}
