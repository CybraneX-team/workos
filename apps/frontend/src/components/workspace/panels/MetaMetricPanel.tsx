import { useEffect, useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { TeamMember } from '../../../lib/db/team';
import { useBdtGoals } from '../../../lib/db/metrics';
import {
  configureMetaMetric,
  setMetaConversionEvent,
  syncMetaMetricsOnce,
  type MetaMetricSyncResult,
  type MetaCanonicalMetricRow,
} from '../../../lib/integrations/service';
import { GlassCard } from './PanelShell';

type MetaMetricKey = 'roas_30d' | 'cost_per_conversion_30d' | 'selected_conversions_30d';

const GAUGES: Array<{ key: MetaMetricKey; title: string; needsConversionEvent: boolean }> = [
  { key: 'roas_30d', title: 'ROAS', needsConversionEvent: false },
  { key: 'cost_per_conversion_30d', title: 'CAC', needsConversionEvent: true },
  { key: 'selected_conversions_30d', title: 'Ad Leads', needsConversionEvent: true },
];

const STABLE_KEY = 'mkt_paid_acquisition_ad_performance';
const LABEL = 'ad performance health';

function previewValueFor(key: MetaMetricKey, preview: MetaMetricSyncResult['preview']): number | null {
  if (!preview) return null;
  if (key === 'roas_30d') return preview.roas;
  if (key === 'cost_per_conversion_30d') return preview.cpa;
  return preview.conversions30d;
}

function unitFor(key: MetaMetricKey, configured: MetaCanonicalMetricRow | null, currency: string | undefined): string {
  if (configured?.unit) return configured.unit;
  if (key === 'roas_30d') return 'x';
  if (key === 'cost_per_conversion_30d') return currency ?? '';
  return '';
}

export function MetaMetricPanel({ companyId, nodeLabel, nodeStableSourceKey, canConfigure, members }: {
  companyId: string;
  nodeLabel: string;
  nodeStableSourceKey?: string;
  canConfigure: boolean;
  members: TeamMember[];
}) {
  const isAdPerformanceNode = nodeStableSourceKey === STABLE_KEY || nodeLabel.trim().toLowerCase() === LABEL;
  const { goals } = useBdtGoals(companyId);
  const [sync, setSync] = useState<MetaMetricSyncResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [openConfig, setOpenConfig] = useState<MetaMetricKey | null>(null);

  useEffect(() => {
    if (!isAdPerformanceNode) return;
    syncMetaMetricsOnce()
      .then(setSync)
      .catch(err => setError(err instanceof Error ? err.message : String(err)))
      .finally(() => setLoading(false));
  }, [isAdPerformanceNode]);

  const configuredByKey = useMemo(() => {
    const map = new Map<MetaMetricKey, MetaCanonicalMetricRow>();
    for (const metric of sync?.metrics ?? []) map.set(metric.source_key, metric);
    return map;
  }, [sync]);

  if (!isAdPerformanceNode) return null;

  async function chooseEvent(actionType: string) {
    if (!actionType) return;
    setEventSaving(true);
    try {
      const result = await setMetaConversionEvent(companyId, actionType);
      setSync(result);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally { setEventSaving(false); }
  }

  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Ad Performance</p>
          <p className="text-[10px] text-white/30 mt-1">Rolling 30 days · {sync?.syncedAt ? new Date(sync.syncedAt).toLocaleString() : 'not synced'}</p>
        </div>
        {loading ? <Loader2 className="w-4 h-4 animate-spin text-violet-300" />
          : sync?.fresh ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="w-3 h-3" /> Fresh</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="w-3 h-3" /> Stale</span>}
      </div>

      {error && <div className="rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200 mb-3">{error}</div>}
      {sync?.syncError && <div className="rounded-lg border border-amber-400/20 bg-amber-400/10 p-3 text-xs text-amber-200 mb-3">Showing the last successful value. {sync.syncError}</div>}

      {sync?.preview && (
        <label className="block text-xs text-white/50 mb-4">
          Shared conversion event <span className="text-white/30">(drives CAC and Ad Leads below)</span>
          <select
            value={sync.preview.selectedConversionAction ?? ''}
            onChange={event => void chooseEvent(event.target.value)}
            disabled={!canConfigure || eventSaving}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white"
          >
            <option value="">Select an event</option>
            {sync.preview.conversionActions.map(action => (
              <option key={action.actionType} value={action.actionType}>{action.actionType} ({action.value})</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        {GAUGES.map(gauge => (
          <MetaGaugeCard
            key={gauge.key}
            gauge={gauge}
            companyId={companyId}
            sync={sync}
            configured={configuredByKey.get(gauge.key) ?? null}
            canConfigure={canConfigure}
            members={members}
            goals={goals}
            isOpen={openConfig === gauge.key}
            onOpen={() => setOpenConfig(gauge.key)}
            onClose={() => setOpenConfig(null)}
            onSaved={metrics => setSync(current => current ? { ...current, metrics } : current)}
            onError={setError}
          />
        ))}
      </div>
    </GlassCard>
  );
}

function MetaGaugeCard({ gauge, companyId, sync, configured, canConfigure, members, goals, isOpen, onOpen, onClose, onSaved, onError }: {
  gauge: { key: MetaMetricKey; title: string; needsConversionEvent: boolean };
  companyId: string;
  sync: MetaMetricSyncResult | null;
  configured: MetaCanonicalMetricRow | null;
  canConfigure: boolean;
  members: TeamMember[];
  goals: Array<{ id: string; title: string }>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSaved: (metrics: MetaCanonicalMetricRow[]) => void;
  onError: (message: string) => void;
}) {
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState('1');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  const previewValue = previewValueFor(gauge.key, sync?.preview ?? null);
  const currentValue = configured?.current_value ?? previewValue;
  const unit = unitFor(gauge.key, configured, sync?.preview?.currency);
  const missingEvent = gauge.needsConversionEvent && !sync?.preview?.selectedConversionAction;

  async function save() {
    if (!target || !ownerMemberId) return;
    setSaving(true);
    try {
      const metrics = await configureMetaMetric(companyId, gauge.key, {
        target: Number(target), ownerMemberId, weight: Number(weight) || 1,
        goalLinks: goalIds.map(goalId => ({ goalId, weight: 1 })),
      });
      onSaved(metrics);
      onClose();
    } catch (err) {
      onError(err instanceof Error ? err.message : String(err));
    } finally { setSaving(false); }
  }

  return (
    <div className="rounded-xl border border-white/8 bg-white/[0.03] p-4 space-y-3">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{gauge.title}</p>
      <p className="text-xl font-semibold text-white">
        {currentValue == null ? (missingEvent ? 'No conversions' : 'No conversions') : `${unit} ${Number(currentValue).toLocaleString()}`.trim()}
      </p>
      <p className="text-[11px] text-white/40">
        {configured?.normalized_score == null ? 'Not scored' : `Health: ${configured.normalized_score}/100`}
      </p>
      {configured && (
        <div className="text-[10px] text-white/35 space-y-0.5">
          <div>Baseline: {configured.baseline_value} · Target: {configured.target_value}</div>
          <div>Source: {configured.source_status}</div>
        </div>
      )}
      {canConfigure && !isOpen && (
        <button type="button" onClick={onOpen} className="w-full rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200">
          {configured ? 'Reconfigure' : 'Configure'}
        </button>
      )}
      {isOpen && (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="text-[11px] text-white/50 block">Target
            <input type="number" value={target} onChange={event => setTarget(event.target.value)} className="mt-1 w-full rounded-lg bg-[#111] border border-white/10 px-2 py-1.5 text-white text-xs" />
          </label>
          <label className="text-[11px] text-white/50 block">Core weight
            <input type="number" min="0.01" step="0.1" value={weight} onChange={event => setWeight(event.target.value)} className="mt-1 w-full rounded-lg bg-[#111] border border-white/10 px-2 py-1.5 text-white text-xs" />
          </label>
          <label className="text-[11px] text-white/50 block">Owner
            <select value={ownerMemberId} onChange={event => setOwnerMemberId(event.target.value)} className="mt-1 w-full rounded-lg bg-[#111] border border-white/10 px-2 py-1.5 text-white text-xs">
              <option value="">Select owner</option>
              {members.filter(member => member.status === 'active').map(member => (
                <option key={member.id} value={member.id}>{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.role_name}</option>
              ))}
            </select>
          </label>
          {goals.length > 0 && (
            <div>
              <p className="text-[11px] text-white/50 mb-1">Contributes to goals</p>
              {goals.map(goal => (
                <label key={goal.id} className="flex items-center gap-2 text-[11px] text-white/60 mb-1">
                  <input type="checkbox" checked={goalIds.includes(goal.id)} onChange={() => setGoalIds(ids => ids.includes(goal.id) ? ids.filter(id => id !== goal.id) : [...ids, goal.id])} />
                  {goal.title}
                </label>
              ))}
            </div>
          )}
          <div className="flex gap-2">
            <button type="button" disabled={saving || !target || !ownerMemberId} onClick={() => void save()} className="rounded-lg bg-violet-500 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40">
              {saving ? 'Saving…' : 'Save'}
            </button>
            <button type="button" onClick={onClose} className="px-2 py-1.5 text-xs text-white/50">Cancel</button>
          </div>
        </div>
      )}
    </div>
  );
}
