import { ArrowRight, Clock3, ExternalLink, Loader2, RefreshCw, Target } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Area, AreaChart, CartesianGrid, Legend, Line, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { useMetaAdsBrief } from '../../../lib/integrations/useMetaAdsBrief';
import { MetaAdsDecisionWorkspace } from './MetaAdsDecisionWorkspace';
import { GlassCard, SectionTitle } from './PanelShell';

function money(value: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(value);
}

function stateCopy(state: string) {
  if (state === 'backfilling') return 'Building the first 90-day history. You can leave this page while the worker continues.';
  if (state === 'refreshing') return 'A refresh is running in the background. The current brief remains available.';
  if (state === 'no_spend') return 'The account is connected and current, but Meta reported no spend in this period.';
  if (state === 'needs_configuration') return 'Choose the conversion event that should drive conversions and CPA.';
  if (state === 'stale') return 'Showing cached history while the latest refresh needs attention.';
  if (state === 'failed') return 'The latest data refresh failed. Preserved history remains available; reconnect Meta or try again.';
  if (state === 'historical') return 'This is preserved history from a disconnected Meta account. It will not refresh.';
  return null;
}

function sevenDayRollup(points: Array<{ spend: number; purchaseRoas: number; selectedConversions: number }>) {
  const spend = points.reduce((sum, point) => sum + point.spend, 0);
  return {
    spend,
    purchaseRoas: spend > 0 ? points.reduce((sum, point) => sum + point.purchaseRoas * point.spend, 0) / spend : 0,
    selectedConversions: points.reduce((sum, point) => sum + point.selectedConversions, 0),
  };
}

export function MetaAdsOperatingHub() {
  const navigate = useNavigate();
  const { brief, loading, error, refreshRun, refresh } = useMetaAdsBrief();

  if (loading && !brief) {
    return <GlassCard className="flex min-h-52 items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-violet-300" /></GlassCard>;
  }
  if (error && !brief) {
    return <GlassCard><div className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-4 text-sm text-rose-100">{error}</div></GlassCard>;
  }
  if (!brief) return null;

  const { connection, summary } = brief;
  const refreshing = refreshRun?.status === 'pending' || refreshRun?.status === 'running';
  const banner = stateCopy(connection.state);
  const chart = brief.series.map((point) => ({ ...point, label: point.date.slice(5) }));
  const currentSeven = sevenDayRollup(brief.series.slice(-7));
  const previousSeven = sevenDayRollup(brief.series.slice(-14, -7));

  return (
    <div className="space-y-4">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-[10px] font-bold uppercase tracking-[0.22em] text-violet-200/60">Paid Acquisition operating brief</p>
            <h2 className="mt-1 text-xl font-semibold text-white">{connection.accountName || 'Meta Ads'}</h2>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-[11px] text-white/40">
              <span className="capitalize">{connection.state.replace(/_/g, ' ')}</span>
              <span>Data through {connection.dataThrough || '—'}</span>
              <span>{connection.timezone || 'Timezone pending'}</span>
            </div>
          </div>
          <div className="flex gap-2">
            {connection.connected && (
              <button type="button" disabled={refreshing} onClick={() => void refresh()} className="flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 disabled:opacity-50">
                <RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} /> {refreshing ? 'Refreshing' : 'Refresh'}
              </button>
            )}
            {connection.adsManagerUrl && (
              <a href={connection.adsManagerUrl} target="_blank" rel="noreferrer" className="flex items-center gap-2 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white">
                Open Ads Manager <ExternalLink className="h-3.5 w-3.5" />
              </a>
            )}
          </div>
        </div>
        {banner && (
          <div className="mt-4 flex items-start justify-between gap-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100/80">
            <span>{banner}</span>
            {(connection.state === 'disconnected' || connection.state === 'failed' || connection.state === 'needs_configuration') && (
              <button type="button" onClick={() => navigate('/twin/data?integration=int-meta')} className="shrink-0 font-semibold text-amber-100">Configure <ArrowRight className="ml-1 inline h-3 w-3" /></button>
            )}
          </div>
        )}
        {error && <p className="mt-3 text-xs text-rose-200">{error}</p>}
      </GlassCard>

      {!connection.connected && connection.state === 'disconnected' ? (
        <GlassCard className="py-10 text-center">
          <p className="text-base font-semibold text-white">Connect Meta Ads to start the daily operating loop</p>
          <p className="mx-auto mt-2 max-w-lg text-sm text-white/40">WorkOS reads account and campaign performance, keeps a 90-day history, and produces reproducible findings. It never changes Meta campaigns.</p>
          <button type="button" onClick={() => navigate('/twin/data?integration=int-meta')} className="mt-5 rounded-lg bg-violet-500 px-4 py-2 text-sm font-semibold text-white">Connect Meta Ads</button>
        </GlassCard>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-5">
            {[
              ['Spend', money(summary.spend, summary.currency)],
              ['Purchase ROAS', `${summary.purchaseRoas.toFixed(2)}x`],
              ['CPA', summary.cpa == null ? '—' : money(summary.cpa, summary.currency)],
              ['Selected conversions', summary.selectedConversions.toLocaleString()],
              ['CTR', `${summary.ctr.toFixed(2)}%`],
            ].map(([label, value]) => (
              <GlassCard key={label} className="!p-4"><p className="text-[10px] uppercase tracking-[0.15em] text-white/35">{label}</p><p className="mt-1 text-xl font-semibold text-white">{value}</p></GlassCard>
            ))}
          </div>

          <MetaAdsDecisionWorkspace currency={summary.currency} />

          <GlassCard>
            <SectionTitle icon={Target}>Goal alignment</SectionTitle>
            {brief.goalContext.length === 0 ? <p className="text-sm text-white/40">No targets are configured yet. Configure a Meta metric from Ad Performance to align the brief with an owner and goal.</p> : (
              <div className="grid gap-3 xl:grid-cols-3">
                {brief.goalContext.map((goal) => (
                  <button type="button" key={goal.metricId} onClick={() => goal.goals[0] && navigate(`/twin/strategy?goal=${goal.goals[0].id}`)} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 text-left">
                    <p className="text-xs font-semibold text-white/80">{goal.label}</p>
                    <p className="mt-2 text-xl font-semibold text-white">{goal.currentValue ?? '—'} <span className="text-xs text-white/35">/ {goal.targetValue ?? '—'} {goal.unit}</span></p>
                    <p className="mt-2 text-[11px] text-white/40">Health {goal.healthScore ?? '—'}/100 · {goal.owner?.name || 'No owner'} · {goal.goals.length} linked goal{goal.goals.length === 1 ? '' : 's'}</p>
                  </button>
                ))}
              </div>
            )}
          </GlassCard>

          <GlassCard>
            <div className="flex items-center justify-between"><SectionTitle icon={Clock3}>Thirty-day trend</SectionTitle><span className="text-[10px] text-white/30">Latest and preceding 7-day findings use complete account days</span></div>
            <div className="mb-3 flex flex-wrap gap-2 text-[10px] text-white/45">
              <span className="rounded-full border border-violet-300/20 bg-violet-400/10 px-2 py-1">Current 7d: {money(currentSeven.spend, summary.currency)} spend · {currentSeven.purchaseRoas.toFixed(2)}x ROAS · {currentSeven.selectedConversions.toFixed(1)} conversions</span>
              <span className="rounded-full border border-white/10 bg-white/[0.03] px-2 py-1">Previous 7d: {money(previousSeven.spend, summary.currency)} spend · {previousSeven.purchaseRoas.toFixed(2)}x ROAS · {previousSeven.selectedConversions.toFixed(1)} conversions</span>
            </div>
            {chart.length === 0 ? <p className="text-sm text-white/40">History is still being prepared.</p> : (
              <ResponsiveContainer width="100%" height={240}>
                <AreaChart data={chart}>
                  <defs><linearGradient id="metaSpend" x1="0" y1="0" x2="0" y2="1"><stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.35}/><stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/></linearGradient></defs>
                  <CartesianGrid stroke="rgba(255,255,255,0.06)" vertical={false} />
                  <XAxis dataKey="label" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="spend" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <YAxis yAxisId="roas" orientation="right" tick={{ fill: '#777', fontSize: 10 }} axisLine={false} tickLine={false} />
                  <Tooltip contentStyle={{ background: '#111827', border: '1px solid #374151', borderRadius: 10, fontSize: 12 }} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Area yAxisId="spend" type="monotone" dataKey="spend" name="Spend" stroke="#8b5cf6" fill="url(#metaSpend)" />
                  <Line yAxisId="roas" type="monotone" dataKey="purchaseRoas" name="Purchase ROAS" stroke="#22d3ee" dot={false} strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </GlassCard>

          <GlassCard>
            <SectionTitle>Campaigns</SectionTitle>
            {brief.campaigns.length === 0 ? <p className="text-sm text-white/40">No campaign spend was returned for this period.</p> : (
              <div className="overflow-x-auto rounded-xl border border-white/10">
                <table className="w-full min-w-[780px] text-xs">
                  <thead className="bg-white/[0.04] text-left text-white/35"><tr><th className="p-3">Campaign</th><th>State</th><th>Spend</th><th>ROAS</th><th>Conversions</th><th>7-day trend</th><th></th></tr></thead>
                  <tbody>{brief.campaigns.map((campaign) => (
                    <tr key={campaign.campaignId} className="border-t border-white/8 text-white/60">
                      <td className="p-3 font-medium text-white/80">{campaign.campaignName}</td><td>{campaign.status}</td><td>{money(campaign.spend, summary.currency)}</td><td>{campaign.purchaseRoas.toFixed(2)}x</td><td>{campaign.selectedConversions}</td>
                      <td className={campaign.purchaseRoasDeltaPct != null && campaign.purchaseRoasDeltaPct < 0 ? 'text-amber-300' : 'text-emerald-300'}>{campaign.purchaseRoasDeltaPct == null ? '—' : `${campaign.purchaseRoasDeltaPct > 0 ? '+' : ''}${campaign.purchaseRoasDeltaPct}%`}</td>
                      <td><a href={campaign.adsManagerUrl} target="_blank" rel="noreferrer" aria-label={`Open ${campaign.campaignName} in Ads Manager`}><ExternalLink className="h-3.5 w-3.5" /></a></td>
                    </tr>
                  ))}</tbody>
                </table>
              </div>
            )}
          </GlassCard>
        </>
      )}
    </div>
  );
}
