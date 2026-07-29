import { useMemo, useState } from 'react';
import { AlertTriangle, CheckCircle2, Loader2 } from 'lucide-react';
import type { MetaAdsGoalContext } from '@cybranex/shared-types';
import type { TeamMember } from '../../../lib/db/team';
import { useBdtGoals } from '../../../lib/db/metrics';
import { configureMetaMetric, setMetaConversionEvent } from '../../../lib/integrations/service';
import { invalidateMetaAdsBrief, useMetaAdsBrief } from '../../../lib/integrations/useMetaAdsBrief';
import { GlassCard } from './PanelShell';

type MetaMetricKey = 'roas_30d' | 'cost_per_conversion_30d' | 'selected_conversions_30d';

const GAUGES: Array<{ key: MetaMetricKey; title: string; needsConversionEvent: boolean }> = [
  { key: 'roas_30d', title: 'ROAS', needsConversionEvent: false },
  { key: 'cost_per_conversion_30d', title: 'CPA', needsConversionEvent: true },
  { key: 'selected_conversions_30d', title: 'Selected conversions', needsConversionEvent: true },
];

const PAID_ACQUISITION_FOCUS_KEY = 'mkt_paid_acquisition';

export function MetaMetricPanel({ companyId, nodeStableSourceKey, canConfigure, members }: {
  companyId: string;
  nodeStableSourceKey?: string;
  canConfigure: boolean;
  members: TeamMember[];
}) {
  const isPaidAcquisition = nodeStableSourceKey === PAID_ACQUISITION_FOCUS_KEY;
  const { goals } = useBdtGoals(companyId);
  const { brief, loading, error, reload } = useMetaAdsBrief(isPaidAcquisition);
  const [localError, setLocalError] = useState<string | null>(null);
  const [eventSaving, setEventSaving] = useState(false);
  const [openConfig, setOpenConfig] = useState<MetaMetricKey | null>(null);
  const configuredByKey = useMemo(
    () => new Map((brief?.goalContext ?? []).map((metric) => [metric.metricKey, metric])),
    [brief],
  );

  if (!isPaidAcquisition) return null;

  async function chooseEvent(actionType: string) {
    if (!actionType) return;
    setEventSaving(true);
    try {
      await setMetaConversionEvent(companyId, actionType);
      invalidateMetaAdsBrief();
      await reload(true);
      setLocalError(null);
    } catch (cause) {
      setLocalError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setEventSaving(false);
    }
  }

  return (
    <GlassCard>
      <div className="mb-4 flex items-center justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-[0.16em] text-white/60">Meta Ads · Ad Performance</p>
          <p className="mt-1 text-[10px] text-white/30">Data through {brief?.connection.dataThrough || '—'} · {brief?.connection.timezone || 'timezone pending'}</p>
        </div>
        {loading ? <Loader2 className="h-4 w-4 animate-spin text-violet-300" />
          : brief?.connection.state === 'healthy' ? <span className="flex items-center gap-1 text-[10px] text-emerald-300"><CheckCircle2 className="h-3 w-3" /> Current</span>
            : <span className="flex items-center gap-1 text-[10px] text-amber-300"><AlertTriangle className="h-3 w-3" /> {brief?.connection.state.replace(/_/g, ' ') || 'Unavailable'}</span>}
      </div>

      {(error || localError) && <div className="mb-3 rounded-lg border border-red-400/20 bg-red-400/10 p-3 text-xs text-red-200">{localError || error}</div>}

      {brief?.connection.connected && (
        <label className="mb-4 block text-xs text-white/50">
          Shared conversion event <span className="text-white/30">(drives CPA and selected conversions)</span>
          <select
            value={brief.selectedConversionAction ?? ''}
            onChange={(event) => void chooseEvent(event.target.value)}
            disabled={!canConfigure || eventSaving}
            className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-3 py-2 text-white"
          >
            <option value="">Select an event</option>
            {brief.availableConversionActions.map((action) => (
              <option key={action.actionType} value={action.actionType}>{action.actionType} ({action.value})</option>
            ))}
          </select>
        </label>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {GAUGES.map((gauge) => {
          const configured = configuredByKey.get(gauge.key) ?? null;
          const currentValue = gauge.key === 'roas_30d'
            ? brief?.summary.purchaseRoas ?? null
            : gauge.key === 'cost_per_conversion_30d'
              ? brief?.summary.cpa ?? null
              : brief?.summary.selectedConversions ?? null;
          const unit = gauge.key === 'roas_30d' ? 'x' : gauge.key === 'cost_per_conversion_30d' ? brief?.summary.currency ?? '' : '';
          return (
            <MetaGaugeCard
              key={gauge.key}
              gauge={gauge}
              companyId={companyId}
              currentValue={currentValue}
              unit={unit}
              configured={configured}
              canConfigure={canConfigure}
              members={members}
              goals={goals}
              isOpen={openConfig === gauge.key}
              onOpen={() => setOpenConfig(gauge.key)}
              onClose={() => setOpenConfig(null)}
              onSaved={() => void reload(true)}
              onError={setLocalError}
              missingEvent={gauge.needsConversionEvent && !brief?.selectedConversionAction}
            />
          );
        })}
      </div>
    </GlassCard>
  );
}
function MetaGaugeCard({ gauge, companyId, currentValue, unit, configured, canConfigure, members, goals, isOpen, onOpen, onClose, onSaved, onError, missingEvent }: {
  gauge: { key: MetaMetricKey; title: string };
  companyId: string;
  currentValue: number | null;
  unit: string;
  configured: MetaAdsGoalContext | null;
  canConfigure: boolean;
  members: TeamMember[];
  goals: Array<{ id: string; title: string }>;
  isOpen: boolean;
  onOpen: () => void;
  onClose: () => void;
  onSaved: () => void;
  onError: (message: string) => void;
  missingEvent: boolean;
}) {
  const [target, setTarget] = useState('');
  const [weight, setWeight] = useState('1');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [goalIds, setGoalIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);

  async function save() {
    if (!target || !ownerMemberId) return;
    setSaving(true);
    try {
      await configureMetaMetric(companyId, gauge.key, {
        target: Number(target), ownerMemberId, weight: Number(weight) || 1,
        goalLinks: goalIds.map((goalId) => ({ goalId, weight: 1 })),
      });
      invalidateMetaAdsBrief();
      onSaved();
      onClose();
    } catch (cause) {
      onError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-3 rounded-xl border border-white/8 bg-white/[0.03] p-4">
      <p className="text-[10px] uppercase tracking-wider text-white/35">{gauge.title}</p>
      <p className="text-xl font-semibold text-white">{currentValue == null ? (missingEvent ? 'Select event' : '—') : `${unit} ${Number(currentValue).toLocaleString()}`.trim()}</p>
      <p className="text-[11px] text-white/40">{configured?.healthScore == null ? 'Not scored' : `Health: ${configured.healthScore}/100`}</p>
      {configured && <p className="text-[10px] text-white/35">Target {configured.targetValue} {configured.unit} · {configured.owner?.name || 'No owner'}</p>}
      {canConfigure && !isOpen && (
        <button type="button" onClick={onOpen} disabled={missingEvent} className="w-full rounded-lg border border-violet-300/25 bg-violet-400/10 px-3 py-1.5 text-xs font-semibold text-violet-200 disabled:opacity-40">
          {configured ? 'Reconfigure' : 'Configure'}
        </button>
      )}
      {isOpen && (
        <div className="space-y-2 rounded-lg border border-white/10 p-3">
          <label className="block text-[11px] text-white/50">Target<input type="number" value={target} onChange={(event) => setTarget(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white" /></label>
          <label className="block text-[11px] text-white/50">Core weight<input type="number" min="0.01" step="0.1" value={weight} onChange={(event) => setWeight(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white" /></label>
          <label className="block text-[11px] text-white/50">Owner<select value={ownerMemberId} onChange={(event) => setOwnerMemberId(event.target.value)} className="mt-1 w-full rounded-lg border border-white/10 bg-[#111] px-2 py-1.5 text-xs text-white"><option value="">Select owner</option>{members.filter((member) => member.status === 'active').map((member) => <option key={member.id} value={member.id}>{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.role_name}</option>)}</select></label>
          {goals.map((goal) => <label key={goal.id} className="flex items-center gap-2 text-[11px] text-white/60"><input type="checkbox" checked={goalIds.includes(goal.id)} onChange={() => setGoalIds((ids) => ids.includes(goal.id) ? ids.filter((id) => id !== goal.id) : [...ids, goal.id])} />{goal.title}</label>)}
          <div className="flex gap-2"><button type="button" disabled={saving || !target || !ownerMemberId} onClick={() => void save()} className="rounded-lg bg-violet-500 px-2 py-1.5 text-xs font-semibold text-white disabled:opacity-40">{saving ? 'Saving…' : 'Save'}</button><button type="button" onClick={onClose} className="px-2 py-1.5 text-xs text-white/50">Cancel</button></div>
        </div>
      )}
    </div>
  );
}
