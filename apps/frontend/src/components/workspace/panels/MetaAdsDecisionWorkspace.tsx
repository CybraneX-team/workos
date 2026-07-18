import { useState } from 'react';
import { Beaker, CalendarDays, CheckCircle2, Clock3, ExternalLink, Loader2, UserRound, X } from 'lucide-react';
import { useSearchParams } from 'react-router-dom';
import type { MetaAdsExperiment, MetaAdsFinding } from '@cybranex/shared-types';
import { useAuth } from '../../../lib/auth';
import { useMetaAdsDecisionInbox } from '../../../lib/integrations/useMetaAdsDecisionInbox';
import { GlassCard, SectionTitle } from './PanelShell';
import { MetaAdsCampaignStudio } from './MetaAdsCampaignStudio';

type Tab = 'inbox' | 'campaigns' | 'experiments' | 'results';
type Drawer =
  | { kind: 'start'; finding: MetaAdsFinding }
  | { kind: 'dismiss'; finding: MetaAdsFinding }
  | { kind: 'apply'; experiment: MetaAdsExperiment }
  | { kind: 'edit'; experiment: MetaAdsExperiment }
  | { kind: 'cancel'; experiment: MetaAdsExperiment }
  | { kind: 'detail'; experiment: MetaAdsExperiment };

const inputClass = 'mt-1 w-full rounded-lg border border-white/10 bg-black/30 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40';
const operationalKinds = new Set(['sync_failure', 'stale_data', 'missing_conversion_configuration']);

function money(value: number, currency: string | null) {
  return new Intl.NumberFormat(undefined, { style: 'currency', currency: currency || 'USD', maximumFractionDigits: 0 }).format(value);
}

function addLocalDays(timezone: string | null, days: number) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone || 'UTC', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  const date = new Date(`${values.year}-${values.month}-${values.day}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function severityClass(severity: MetaAdsFinding['severity']) {
  if (severity === 'critical') return 'border-rose-300/25 bg-rose-400/10';
  if (severity === 'warning') return 'border-amber-300/25 bg-amber-400/10';
  return 'border-cyan-300/20 bg-cyan-400/10';
}

function Evidence({ evidence }: { evidence: object }) {
  return (
    <div className="mt-3 flex flex-wrap gap-2">
      {Object.entries(evidence).slice(0, 6).map(([key, value]) => (
        <span key={key} className="rounded-full border border-white/10 bg-black/20 px-2 py-1 text-[10px] text-white/55">
          {key.replace(/([A-Z])/g, ' $1')}: <strong className="text-white/80">{String(value ?? '—')}</strong>
        </span>
      ))}
    </div>
  );
}

function ExperimentState({ experiment }: { experiment: MetaAdsExperiment }) {
  if (experiment.status === 'measuring') {
    const progress = experiment.measurementProgress;
    return <span className="text-cyan-200">Measuring{progress ? ` · ${progress.completeDays} of ${progress.targetDays} complete days` : ''}</span>;
  }
  if (experiment.overdue) return <span className="text-rose-200">Overdue · planned</span>;
  if (experiment.status === 'completed') return <span className="text-emerald-200">{experiment.outcome?.replace(/_/g, ' ')}</span>;
  return <span className="capitalize text-white/55">{experiment.status}</span>;
}

function ExperimentCard({ experiment, onOpen, onApply, canOperate }: {
  experiment: MetaAdsExperiment;
  onOpen: () => void;
  onApply: () => void;
  canOperate: boolean;
}) {
  return (
    <div className={`rounded-xl border p-4 ${experiment.overdue ? 'border-rose-300/25 bg-rose-400/8' : 'border-white/10 bg-white/[0.025]'}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[10px] font-bold uppercase tracking-[0.15em] text-violet-200/60"><ExperimentState experiment={experiment} /></p>
          <p className="mt-2 text-sm font-semibold text-white">{experiment.title}</p>
          <p className="mt-1 text-xs text-white/45">{experiment.scopeName} · owner {experiment.owner.name}{experiment.owner.missing ? ' (needs reassignment)' : ''} · due {experiment.dueDate}</p>
          {experiment.formerAccount && <p className="mt-1 text-[10px] font-semibold uppercase tracking-wide text-amber-200/70">Former Meta account · {experiment.accountName || experiment.accountId}</p>}
        </div>
        <div className="flex gap-2">
          <a href={experiment.adsManagerUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65">Ads Manager <ExternalLink className="ml-1 inline h-3 w-3" /></a>
          {canOperate && experiment.status === 'planned' && <button type="button" onClick={onApply} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white">Mark applied</button>}
          <button type="button" onClick={onOpen} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/75">Details</button>
        </div>
      </div>
      <p className="mt-3 text-xs leading-relaxed text-white/55">{experiment.recommendedChange}</p>
    </div>
  );
}

export function MetaAdsDecisionWorkspace({ currency }: { currency: string | null }) {
  const { canWrite } = useAuth();
  const canOperate = canWrite('analytics');
  const [searchParams, setSearchParams] = useSearchParams();
  const requestedTab = searchParams.get('tab');
  const tab: Tab = requestedTab === 'campaigns' || requestedTab === 'experiments' || requestedTab === 'results' ? requestedTab : 'inbox';
  const workflow = useMetaAdsDecisionInbox();
  const [drawer, setDrawer] = useState<Drawer | null>(null);
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [note, setNote] = useState('');
  const [reason, setReason] = useState('not_relevant');
  const [confirmed, setConfirmed] = useState(false);
  const [keptBudgetConstant, setKeptBudgetConstant] = useState(true);

  const selectTab = (next: Tab) => {
    const params = new URLSearchParams(searchParams);
    params.set('tab', next);
    setSearchParams(params, { replace: true });
  };

  const openStart = async (finding: MetaAdsFinding) => {
    const people = await workflow.loadAssignees();
    setOwnerMemberId(people.find((person) => person.isCurrentUser)?.memberId ?? people[0]?.memberId ?? '');
    setDueDate(addLocalDays(workflow.inbox?.timezone ?? null, 3));
    setDrawer({ kind: 'start', finding });
  };

  const openEdit = async (experiment: MetaAdsExperiment) => {
    await workflow.loadAssignees();
    setOwnerMemberId(experiment.owner.memberId ?? '');
    setDueDate(experiment.dueDate);
    setDrawer({ kind: 'edit', experiment });
  };

  const openDetail = async (experiment: MetaAdsExperiment) => {
    const detailed = await workflow.openExperiment(experiment.id);
    if (detailed) setDrawer({ kind: 'detail', experiment: detailed });
  };

  const close = () => {
    setDrawer(null);
    setNote('');
    setConfirmed(false);
    setKeptBudgetConstant(true);
  };

  if (workflow.loading && !workflow.inbox) {
    return <GlassCard className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-300" /></GlassCard>;
  }
  if (!workflow.inbox) return workflow.error ? <GlassCard><p className="text-sm text-rose-200">{workflow.error}</p></GlassCard> : null;

  const inbox = workflow.inbox;
  const actionable = inbox.findings.filter((finding) => finding.recommendation);
  const alerts = inbox.findings.filter((finding) => !finding.recommendation);

  return (
    <>
      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle icon={Beaker}>Decision workflow</SectionTitle>
          <p className="text-[10px] text-white/35">Detect → diagnose → assign → apply manually → measure → retain learning</p>
        </div>
        <div className="flex gap-2 border-b border-white/10 pb-3">
          {([
            ['inbox', 'Inbox', inbox.counts.open],
            ['campaigns', 'Campaigns', null],
            ['experiments', 'Experiments', inbox.counts.planned + inbox.counts.measuring],
            ['results', 'Results', workflow.history.length],
          ] as const).map(([value, label, count]) => (
            <button key={value} type="button" onClick={() => selectTab(value)} className={`rounded-lg px-3 py-2 text-xs font-semibold ${tab === value ? 'bg-violet-500 text-white' : 'bg-white/5 text-white/50'}`}>
              {label} {count != null && <span className="ml-1 opacity-65">{count}</span>}
            </button>
          ))}
        </div>
        {tab !== 'campaigns' && inbox.coverage !== 'current' && (
          <div className="mt-3 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100/75">
            Diagnostic coverage: {inbox.coverage.replace(/_/g, ' ')}. {inbox.coverage === 'preparing' ? 'Ad-set and ad reports are still being prepared.' : inbox.coverageWarnings.join(' ') || 'Deep findings are withheld until current evidence is available.'}
          </div>
        )}
        {tab !== 'campaigns' && workflow.error && <div className="mt-3 rounded-lg border border-rose-300/20 bg-rose-400/10 p-3 text-xs text-rose-100">{workflow.error}</div>}

        {tab === 'inbox' && (
          <div className="mt-4 space-y-4">
            {inbox.findings.length === 0 && (
              <div className="flex items-center gap-3 rounded-xl border border-emerald-300/20 bg-emerald-300/10 p-4 text-sm text-emerald-100"><CheckCircle2 className="h-5 w-5" /> No performance decisions or operational alerts are waiting.</div>
            )}
            {alerts.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Operational and diagnostic alerts</p>
                <div className="grid gap-3 xl:grid-cols-2">{alerts.map((finding) => (
                  <div key={finding.id} className={`rounded-xl border p-4 ${severityClass(finding.severity)}`}>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">{finding.severity} · {finding.scope}</p>
                    <p className="mt-2 text-sm font-semibold text-white">{finding.title}</p>
                    <p className="mt-1 text-xs leading-relaxed text-white/55">{finding.explanation}</p>
                    <Evidence evidence={finding.evidence} />
                    <a href={finding.action.href} target={finding.action.href.startsWith('http') ? '_blank' : undefined} rel="noreferrer" className="mt-3 inline-flex items-center gap-1 text-xs font-semibold text-white/75">{finding.action.label}{finding.action.href.startsWith('http') && <ExternalLink className="h-3 w-3" />}</a>
                    {canOperate && !operationalKinds.has(finding.kind) && <button type="button" onClick={() => { setReason('not_relevant'); setDrawer({ kind: 'dismiss', finding }); }} className="ml-3 text-xs text-white/45">Dismiss</button>}
                  </div>
                ))}</div>
              </div>
            )}
            {actionable.length > 0 && (
              <div>
                <p className="mb-2 text-[10px] font-bold uppercase tracking-[0.16em] text-white/35">Actionable performance decisions</p>
                <div className="grid gap-3 xl:grid-cols-2">{actionable.map((finding) => (
                  <div key={finding.id} className={`rounded-xl border p-4 ${severityClass(finding.severity)}`}>
                    <div className="flex gap-3">
                      {finding.diagnosis?.affectedObject.thumbnailUrl && <img src={finding.diagnosis.affectedObject.thumbnailUrl} alt="Creative thumbnail" referrerPolicy="no-referrer" className="h-20 w-20 rounded-lg border border-white/10 object-cover" />}
                      <div className="min-w-0">
                        <p className="text-[10px] font-bold uppercase tracking-wide text-white/55">{finding.severity} · {finding.confidence || 'medium'} confidence</p>
                        <p className="mt-2 text-sm font-semibold text-white">{finding.title}</p>
                        <p className="mt-1 text-xs text-white/45">{finding.diagnosis?.affectedObject.campaignName}{finding.diagnosis?.affectedObject.adsetName ? ` · ${finding.diagnosis.affectedObject.adsetName}` : ''}{finding.diagnosis?.affectedObject.name ? ` · ${finding.diagnosis.affectedObject.name}` : ''}</p>
                      </div>
                    </div>
                    <p className="mt-3 text-xs leading-relaxed text-white/60">{finding.diagnosis?.summary || finding.explanation}</p>
                    <p className="mt-2 text-xs text-violet-100/80"><strong>Controlled change:</strong> {finding.recommendation?.change}</p>
                    <p className="mt-1 text-[11px] text-white/40">Keep constant: {finding.recommendation?.keepConstant.join(', ')}</p>
                    <p className="mt-2 text-[11px] text-white/35">Period {finding.affectedPeriod.start || '—'} to {finding.affectedPeriod.end || '—'} · spend exposure {money(finding.estimatedSpendExposure, currency)}</p>
                    <Evidence evidence={finding.evidence} />
                    <div className="mt-4 flex flex-wrap gap-2">
                      <a href={finding.recommendation!.adsManagerUrl} target="_blank" rel="noreferrer" className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/70">Open in Ads Manager <ExternalLink className="ml-1 inline h-3 w-3" /></a>
                      {canOperate && <button type="button" onClick={() => void openStart(finding)} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white">Start experiment</button>}
                      {canOperate && <button type="button" onClick={() => { setReason('not_relevant'); setDrawer({ kind: 'dismiss', finding }); }} className="rounded-lg px-3 py-2 text-xs text-white/45">Dismiss</button>}
                    </div>
                  </div>
                ))}</div>
              </div>
            )}
            {!canOperate && inbox.findings.length > 0 && <p className="text-xs text-white/35">You have read-only access. Members with Analytics write permission can start, assign, apply, cancel, or dismiss decisions.</p>}
          </div>
        )}

        {tab === 'experiments' && (
          <div className="mt-4 space-y-3">
            {inbox.activeExperiments.length === 0 ? <p className="text-sm text-white/40">No planned or measuring experiments.</p> : inbox.activeExperiments.map((experiment) => (
              <ExperimentCard key={experiment.id} experiment={experiment} canOperate={canOperate} onOpen={() => void openDetail(experiment)} onApply={() => { setNote(''); setConfirmed(false); setKeptBudgetConstant(true); setDrawer({ kind: 'apply', experiment }); }} />
            ))}
          </div>
        )}

        {tab === 'results' && (
          <div className="mt-4 space-y-3">
            {workflow.history.length === 0 ? <p className="text-sm text-white/40">No completed or cancelled experiments yet.</p> : workflow.history.map((experiment) => (
              <div key={experiment.id} className="rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div><p className="text-[10px] font-bold uppercase tracking-wide text-white/40"><ExperimentState experiment={experiment} /></p><p className="mt-2 text-sm font-semibold text-white">{experiment.title}</p><p className="mt-1 text-xs text-white/40">{experiment.accountName || experiment.accountId}{experiment.formerAccount ? ' · former account' : ''} · owner {experiment.owner.name}</p></div>
                  <button type="button" onClick={() => void openDetail(experiment)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">View evidence</button>
                </div>
                {experiment.resultExplanation && <p className="mt-3 text-xs text-white/60">{experiment.resultExplanation}</p>}
                {experiment.resultMetrics && <Evidence evidence={{ primaryMetric: experiment.primaryMetric, after: experiment.resultMetrics[experiment.primaryMetric === 'purchase_roas' ? 'purchaseRoas' : experiment.primaryMetric], evaluationDays: experiment.evaluationDays }} />}
              </div>
            ))}
          </div>
        )}
      </GlassCard>

      {tab === 'campaigns' && <MetaAdsCampaignStudio />}

      {tab !== 'campaigns' && drawer && (
        <div className="fixed inset-0 z-[80] flex justify-end bg-black/55" role="dialog" aria-modal="true" aria-label="Meta Ads decision details">
          <div className="h-full w-full max-w-xl overflow-y-auto border-l border-white/10 bg-[#0d1020] p-6 shadow-2xl">
            <div className="flex items-start justify-between gap-4">
              <div><p className="text-[10px] font-bold uppercase tracking-[0.18em] text-violet-200/60">{drawer.kind.replace(/_/g, ' ')}</p><h3 className="mt-1 text-lg font-semibold text-white">{'finding' in drawer ? drawer.finding.title : drawer.experiment.title}</h3></div>
              <button type="button" onClick={close} aria-label="Close decision drawer" className="rounded-lg border border-white/10 p-2 text-white/50"><X className="h-4 w-4" /></button>
            </div>

            {drawer.kind === 'start' && drawer.finding.recommendation && (
              <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await workflow.start(drawer.finding.id, ownerMemberId, dueDate); if (result) { close(); selectTab('experiments'); } }}>
                <div className="rounded-xl border border-violet-300/20 bg-violet-400/10 p-4"><p className="text-xs font-semibold text-violet-100">Immutable recommendation</p><p className="mt-2 text-sm text-white">{drawer.finding.recommendation.change}</p><p className="mt-2 text-xs text-white/45">Keep constant: {drawer.finding.recommendation.keepConstant.join(', ')}</p><p className="mt-2 text-xs text-white/45">Expected metric: {drawer.finding.recommendation.primaryMetric.replace(/_/g, ' ')} ({drawer.finding.recommendation.primaryDirection})</p></div>
                <label className="block text-xs text-white/55"><UserRound className="mr-1 inline h-3.5 w-3.5" /> Owner<select required value={ownerMemberId} onChange={(event) => setOwnerMemberId(event.target.value)} className={inputClass}><option value="">Choose owner</option>{workflow.assignees.map((person) => <option key={person.memberId} value={person.memberId}>{person.name}{person.isCurrentUser ? ' (you)' : ''}</option>)}</select></label>
                <label className="block text-xs text-white/55"><CalendarDays className="mr-1 inline h-3.5 w-3.5" /> Due date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} /></label>
                <button disabled={workflow.busy || !ownerMemberId || !dueDate} className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">{workflow.busy ? 'Starting…' : 'Start experiment'}</button>
              </form>
            )}

            {drawer.kind === 'dismiss' && (
              <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); if (await workflow.dismiss(drawer.finding.id, reason, note)) close(); }}>
                <label className="block text-xs text-white/55">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}><option value="not_relevant">Not relevant</option><option value="already_addressed">Already addressed</option><option value="insufficient_context">Insufficient context</option><option value="other">Other</option></select></label>
                <label className="block text-xs text-white/55">Optional note<textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-24`} /></label>
                <button disabled={workflow.busy} className="w-full rounded-lg bg-white/10 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Dismiss this episode</button>
              </form>
            )}

            {drawer.kind === 'apply' && (
              <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await workflow.apply(drawer.experiment.id, { implementationNote: note, confirmedRecommendedChange: confirmed, keptBudgetConstant }); if (result) { close(); selectTab('experiments'); } }}>
                <div className="rounded-xl border border-violet-300/20 bg-violet-400/10 p-4"><p className="text-xs font-semibold text-violet-100">Prescribed controlled change</p><p className="mt-2 text-sm text-white">{drawer.experiment.recommendedChange}</p><p className="mt-2 text-xs text-white/45">Keep constant: {drawer.experiment.recommendation.keepConstant.join(', ')}</p></div>
                <label className="block text-xs text-white/55">Implementation note<textarea required minLength={3} value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-28`} placeholder="What did you change in Ads Manager?" /></label>
                <label className="flex items-start gap-2 text-xs text-white/60"><input type="checkbox" checked={confirmed} onChange={(event) => setConfirmed(event.target.checked)} /> I confirm the prescribed change was applied manually in Ads Manager.</label>
                <label className="block text-xs text-white/55">Was the prescribed budget held constant?<select value={keptBudgetConstant ? 'yes' : 'no'} onChange={(event) => setKeptBudgetConstant(event.target.value === 'yes')} className={inputClass}><option value="yes">Yes</option><option value="no">No — record as a confound</option></select></label>
                <p className="text-xs text-white/35">The application date is excluded. WorkOS will compare 7 complete days, extending to 14 only if volume is insufficient.</p>
                <button disabled={workflow.busy || !confirmed || note.trim().length < 3} className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Mark applied and begin measurement</button>
              </form>
            )}

            {drawer.kind === 'edit' && (
              <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); const result = await workflow.update(drawer.experiment.id, { ownerMemberId, dueDate }); if (result) close(); }}>
                <label className="block text-xs text-white/55">Owner<select required value={ownerMemberId} onChange={(event) => setOwnerMemberId(event.target.value)} className={inputClass}><option value="">Choose owner</option>{workflow.assignees.map((person) => <option key={person.memberId} value={person.memberId}>{person.name}</option>)}</select></label>
                <label className="block text-xs text-white/55">Due date<input required type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className={inputClass} /></label>
                <button disabled={workflow.busy} className="w-full rounded-lg bg-violet-500 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Save assignment</button>
              </form>
            )}

            {drawer.kind === 'cancel' && (
              <form className="mt-6 space-y-4" onSubmit={async (event) => { event.preventDefault(); if (await workflow.cancel(drawer.experiment.id, reason, note)) close(); }}>
                <label className="block text-xs text-white/55">Reason<select value={reason} onChange={(event) => setReason(event.target.value)} className={inputClass}><option value="not_applied">Not applied</option><option value="recommendation_stale">Recommendation stale</option><option value="priorities_changed">Priorities changed</option><option value="other">Other</option></select></label>
                <label className="block text-xs text-white/55">Optional note<textarea value={note} onChange={(event) => setNote(event.target.value)} className={`${inputClass} min-h-24`} /></label>
                <button disabled={workflow.busy} className="w-full rounded-lg bg-rose-500/80 px-4 py-2.5 text-sm font-semibold text-white disabled:opacity-40">Cancel experiment</button>
              </form>
            )}

            {drawer.kind === 'detail' && (
              <div className="mt-6 space-y-5">
                <div className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><ExperimentState experiment={drawer.experiment} /><p className="mt-3 text-sm text-white/70">{drawer.experiment.hypothesis}</p><p className="mt-2 text-xs text-white/45">Owner {drawer.experiment.owner.name} · due {drawer.experiment.dueDate}</p>{drawer.experiment.measurementProgress && <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10"><div className="h-full bg-cyan-400" style={{ width: `${Math.min(100, (drawer.experiment.measurementProgress.completeDays / drawer.experiment.measurementProgress.targetDays) * 100)}%` }} /></div>}</div>
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-white/35">Recommendation</p><p className="mt-2 text-sm text-white/70">{drawer.experiment.recommendedChange}</p><p className="mt-2 text-xs text-white/40">Keep constant: {drawer.experiment.recommendation.keepConstant.join(', ')}</p></div>
                {(drawer.experiment.evaluationDays === 14 ? drawer.experiment.baseline14 : drawer.experiment.baseline7) && (
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wide text-white/35">Frozen {drawer.experiment.evaluationDays === 14 ? '14-day' : '7-day'} baseline</p>
                    <Evidence evidence={(drawer.experiment.evaluationDays === 14 ? drawer.experiment.baseline14 : drawer.experiment.baseline7)!} />
                  </div>
                )}
                {drawer.experiment.resultMetrics && <div><p className="text-[10px] font-bold uppercase tracking-wide text-white/35">Frozen result · {drawer.experiment.outcome?.replace(/_/g, ' ')}</p><p className="mt-2 text-xs text-white/60">{drawer.experiment.resultExplanation}</p><Evidence evidence={drawer.experiment.resultMetrics} /></div>}
                <div><p className="text-[10px] font-bold uppercase tracking-wide text-white/35">Timeline</p><div className="mt-3 space-y-3">{(drawer.experiment.events ?? []).map((event) => <div key={event.id} className="flex gap-3 text-xs"><Clock3 className="mt-0.5 h-3.5 w-3.5 text-violet-300" /><div><p className="font-semibold capitalize text-white/70">{event.type.replace(/_/g, ' ')}</p><p className="text-white/35">{event.actorName || 'WorkOS'} · {new Date(event.createdAt).toLocaleString()}</p></div></div>)}</div></div>
                <a href={drawer.experiment.adsManagerUrl} target="_blank" rel="noreferrer" className="inline-flex rounded-lg border border-white/10 px-3 py-2 text-xs text-white/70">Open in Ads Manager <ExternalLink className="ml-1 h-3 w-3" /></a>
                {canOperate && ['planned', 'measuring'].includes(drawer.experiment.status) && (
                  <div className="flex gap-2 border-t border-white/10 pt-4">
                    {drawer.experiment.status === 'planned' && <button type="button" onClick={() => { setNote(''); setConfirmed(false); setDrawer({ kind: 'apply', experiment: drawer.experiment }); }} className="rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white">Mark applied</button>}
                    {drawer.experiment.status === 'planned' && <button type="button" onClick={() => void openEdit(drawer.experiment)} className="rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65">Edit owner / due date</button>}
                    <button type="button" onClick={() => { setReason(drawer.experiment.status === 'planned' ? 'not_applied' : 'priorities_changed'); setDrawer({ kind: 'cancel', experiment: drawer.experiment }); }} className="rounded-lg px-3 py-2 text-xs text-rose-200/65">Cancel</button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
