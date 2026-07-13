import { useMemo, useState, type ReactNode } from 'react';
import {
  Activity, Bot, Check, Database, LineChart, Plus, Sparkles, Target, X,
} from 'lucide-react';
import type { TeamMember } from '../../../lib/db/team';
import type {
  CanonicalMetric,
  CreateMetricInput,
  MetricDraftResponse,
  MetricRollup,
  MetricTargetType,
  MetricValueType,
  MetricDirection,
  MetricDraftField,
  MetricLinkRelation,
} from '../../../lib/db/canonicalMetrics';
import {
  formatMetricTarget,
  formatMetricValue,
} from '../../../lib/db/canonicalMetrics';

const ACCENT = '#C1AEFF';

function confidencePct(value: number | string | null | undefined) {
  const num = Number(value ?? 0);
  return Math.round(Math.max(0, Math.min(1, num)) * 100);
}

function metricFieldLabel(field: MetricDraftField): string {
  return field.replaceAll('_', ' ');
}

function buildMissingFields(form: CreateMetricInput): MetricDraftField[] {
  const missing: MetricDraftField[] = [];
  if (!form.name.trim()) missing.push('name');
  if (!form.description.trim()) missing.push('description');
  if (!form.unit.trim()) missing.push('unit');
  if (!form.direction) missing.push('direction');
  if (!Number.isFinite(Number(form.baseline_value))) missing.push('baseline_value');
  if (!Number.isFinite(Number(form.target_value))) missing.push('target_value');
  if (!form.cadence.trim()) missing.push('cadence');
  if (!form.source_type) missing.push('source_type');
  if (!form.owner_member_id) missing.push('owner_member_id');
  if (!form.links[0]?.target_type || !form.links[0]?.target_id) missing.push('target');
  return missing;
}

export function MetricCard({
  metric,
  onUpdateValue,
  canEdit,
}: {
  metric: CanonicalMetric;
  canEdit: boolean;
  onUpdateValue?: (metricId: string, rawValue: number, reason?: string) => void;
}) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(String(metric.current_value ?? 0));
  const score = Number(metric.normalized_score ?? 0);
  const color = score >= 75 ? '#34d399' : score >= 45 ? '#fbbf24' : '#fb7185';
  const primaryLink = metric.links?.[0];

  return (
    <div className="rounded-2xl p-4 bg-white/[0.035] border border-white/10 hover:border-white/18 transition-all">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <LineChart className="w-3.5 h-3.5" style={{ color }} />
            <span className="text-[9px] uppercase tracking-[0.16em] text-white/35">
              {primaryLink ? primaryLink.target_type.replace('_', ' ') : 'unlinked'}
            </span>
            {primaryLink?.is_core && (
              <span className="text-[9px] px-1.5 py-0.5 rounded-full border" style={{ color: ACCENT, borderColor: `${ACCENT}44`, background: `${ACCENT}12` }}>
                Core
              </span>
            )}
          </div>
          <h4 className="text-sm font-bold text-white truncate">{metric.name}</h4>
          {metric.description && <p className="text-[11px] text-white/42 mt-1 line-clamp-2">{metric.description}</p>}
        </div>
        <div className="text-right shrink-0">
          <div className="text-2xl font-black leading-none" style={{ color }}>{metric.normalized_score == null ? '—' : score}</div>
          <div className="text-[9px] text-white/30 mt-1">score</div>
        </div>
      </div>

      <div className="mt-4 flex items-baseline gap-1.5">
        <span className="text-lg font-bold text-white">{formatMetricValue(metric)}</span>
        <span className="text-[10px] text-white/32">/ {formatMetricTarget(metric)}</span>
      </div>
      <div className="mt-2 h-1.5 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-2 text-[10px] text-white/38">
        <span>Source confidence {confidencePct(metric.source_confidence)}%</span>
        <span>Cadence {metric.cadence}</span>
        <span>{metric.direction.replaceAll('_', ' ')}</span>
      </div>


      {canEdit && onUpdateValue && (
        <div className="mt-3 pt-3 border-t border-white/8">
          {editing ? (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                const next = Number(value);
                if (Number.isFinite(next)) onUpdateValue(metric.id, next, 'Manual update from Metric Card');
                setEditing(false);
              }}
              className="flex items-center gap-2"
            >
              <input
                value={value}
                onChange={e => setValue(e.target.value)}
                className="flex-1 bg-white/5 border border-white/10 rounded-lg px-2 py-1.5 text-xs text-white focus:outline-none focus:border-white/25"
              />
              <button type="submit" className="px-2.5 py-1.5 rounded-lg text-[11px] font-semibold" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}44` }}>
                Save
              </button>
              <button type="button" onClick={() => setEditing(false)} className="p-1.5 text-white/35 hover:text-white"><X className="w-3.5 h-3.5" /></button>
            </form>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="text-[11px] text-white/45 hover:text-white transition-colors">
              Update value
            </button>
          )}
        </div>
      )}
    </div>
  );
}

export function MetricRollupHealthPanel({ rollup, title }: { rollup?: MetricRollup; title: string }) {
  const score = rollup?.health_score ?? 0;
  const color = score >= 75 ? '#34d399' : score >= 45 ? '#fbbf24' : '#fb7185';
  return (
    <div className="rounded-2xl p-4 bg-white/[0.035] border border-white/10">
      <div className="flex items-center justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.16em] text-white/35">Metric Rollup</div>
          <h4 className="text-sm font-bold text-white mt-1">{title}</h4>
        </div>
        <Activity className="w-4 h-4" style={{ color }} />
      </div>
      <div className="mt-4 flex items-end gap-2">
        <span className="text-4xl font-black leading-none" style={{ color }}>{score}</span>
        <span className="text-xs text-white/35 pb-1">health score</span>
      </div>
      <div className="mt-3 h-2 rounded-full bg-white/10 overflow-hidden">
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
      <div className="mt-2 text-[10px] text-white/35">
        {rollup?.metric_count ?? 0} core metrics · {confidencePct(rollup?.source_confidence)}% source confidence
      </div>
    </div>
  );
}

export function MetricCopilotDraftPanel({
  onDraft,
  createDraft,
  targetType,
  targetId,
}: {
  targetType: MetricTargetType;
  targetId: string;
  createDraft: (input: { prompt: string; target_type?: MetricTargetType; target_id?: string }) => Promise<MetricDraftResponse | null>;
  onDraft: (draft: MetricDraftResponse) => void;
}) {
  const [prompt, setPrompt] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit() {
    if (!prompt.trim()) return;
    setLoading(true);
    try {
      const draft = await createDraft({ prompt: prompt.trim(), target_type: targetType, target_id: targetId });
      if (draft) onDraft(draft);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="rounded-2xl p-4 bg-[#11131b] border border-white/10">
      <div className="flex items-center gap-2 mb-3">
        <Bot className="w-4 h-4" style={{ color: ACCENT }} />
        <div>
          <div className="text-sm font-bold text-white">Metric Copilot</div>
          <div className="text-[10px] text-white/35">Draft only. Admin confirmation saves it.</div>
        </div>
      </div>
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="e.g. Track onboarding activation for Product"
        className="w-full min-h-20 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/25"
      />
      <button
        type="button"
        onClick={submit}
        disabled={!prompt.trim() || loading}
        className="mt-3 w-full flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold disabled:opacity-40"
        style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}44` }}
      >
        <Sparkles className="w-3.5 h-3.5" /> {loading ? 'Drafting...' : 'Draft metric'}
      </button>
    </div>
  );
}

export function MetricCreateWizard({
  companyId,
  members,
  targetType,
  targetId,
  targetLabel,
  createMetric,
  createDraft,
  onClose,
}: {
  companyId: string;
  members: TeamMember[];
  targetType: MetricTargetType;
  targetId: string;
  targetLabel: string;
  createMetric: (input: CreateMetricInput) => Promise<CanonicalMetric | null>;
  createDraft: (input: { prompt: string; target_type?: MetricTargetType; target_id?: string }) => Promise<MetricDraftResponse | null>;
  onClose: () => void;
}) {
  const defaultOwner = members.find(m => ['founder', 'co_founder', 'admin', 'super_admin'].includes(m.role)) ?? members[0];
  const defaultLink = {
    target_type: targetType,
    target_id: targetId,
    relation: 'measures' as MetricLinkRelation,
    weight: 1,
    is_core: true,
  };
  const [form, setForm] = useState<CreateMetricInput>({
    name: '',
    description: '',
    unit: '',
    value_type: 'number',
    direction: 'higher_is_better',
    baseline_value: 0,
    target_value: 100,
    current_value: 0,
    owner_member_id: defaultOwner?.id ?? '',
    cadence: 'weekly',
    source_type: 'manual',
    source_label: 'Manual entry',
    source_confidence: 0.7,
    links: [defaultLink],
  });
  const [saving, setSaving] = useState(false);
  const [draftMeta, setDraftMeta] = useState<MetricDraftResponse | null>(null);

  function patch<K extends keyof CreateMetricInput>(key: K, value: CreateMetricInput[K]) {
    setForm(prev => ({ ...prev, [key]: value }));
  }

  function patchPrimaryLink(patchValue: Partial<CreateMetricInput['links'][number]>) {
    setForm(prev => {
      const current = prev.links[0] ?? defaultLink;
      return { ...prev, links: [{ ...current, ...patchValue }] };
    });
  }

  function applyDraft(draft: MetricDraftResponse) {
    setDraftMeta(draft);
    setForm(prev => {
      const nextLink = draft.draft.links[0] ?? prev.links[0] ?? defaultLink;
      return {
        ...prev,
        name: draft.draft.name || prev.name,
        description: draft.draft.description || prev.description,
        unit: draft.draft.unit || prev.unit,
        value_type: draft.draft.value_type ?? prev.value_type,
        direction: draft.draft.direction ?? prev.direction,
        baseline_value: typeof draft.draft.baseline_value === 'number' ? draft.draft.baseline_value : prev.baseline_value,
        current_value: typeof draft.draft.current_value === 'number' ? draft.draft.current_value : prev.current_value,
        target_value: typeof draft.draft.target_value === 'number' ? draft.draft.target_value : prev.target_value,
        owner_member_id: draft.resolved_owner?.owner_member_id ?? draft.draft.owner_member_id ?? prev.owner_member_id,
        cadence: draft.draft.cadence || prev.cadence,
        source_type: 'manual',
        source_label: draft.draft.source_label || prev.source_label,
        source_confidence: typeof draft.draft.source_confidence === 'number' ? draft.draft.source_confidence : prev.source_confidence,
        links: nextLink.target_type && nextLink.target_id ? [{
          target_type: nextLink.target_type,
          target_id: nextLink.target_id,
          relation: nextLink.relation,
          weight: nextLink.weight,
          is_core: nextLink.is_core,
        }] : prev.links,
      };
    });
  }

  const fieldStateMap = useMemo(() => {
    return new Map(draftMeta?.field_states.map(state => [state.field, state]) ?? []);
  }, [draftMeta]);

  const liveMissingFields = useMemo(() => buildMissingFields(form), [form]);
  const disabledReasons = useMemo(() => liveMissingFields.map(field => `${metricFieldLabel(field)} is required`), [liveMissingFields]);
  const targetSummary = draftMeta?.resolved_target?.label ?? targetLabel;
  const ownerSummary = draftMeta?.resolved_owner?.label;

  function fieldHint(field: MetricDraftField) {
    const state = fieldStateMap.get(field);
    if (!state) return null;
    const color = state.status === 'unresolved' ? '#fb7185' : state.status === 'assumed' ? '#fbbf24' : '#94a3b8';
    return <div className="mt-1 text-[10px]" style={{ color }}>{state.message}</div>;
  }

  async function save() {
    if (liveMissingFields.length > 0) return;
    setSaving(true);
    try {
      await createMetric(form);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[160] grid place-items-center p-6" style={{ background: 'rgba(0,0,0,0.62)', backdropFilter: 'blur(8px)' }}>
      <div className="w-full max-w-5xl max-h-[88vh] overflow-hidden rounded-3xl bg-[#0d0f16] border border-white/12 shadow-2xl flex flex-col">
        <div className="shrink-0 flex items-center justify-between px-6 py-4 border-b border-white/8">
          <div>
            <div className="text-[10px] uppercase tracking-[0.18em] text-white/35">Create Production Metric</div>
            <h3 className="text-lg font-bold text-white mt-1">{targetLabel}</h3>
          </div>
          <button type="button" onClick={onClose} className="p-2 rounded-xl text-white/40 hover:text-white hover:bg-white/8"><X className="w-4 h-4" /></button>
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 lg:grid-cols-12 gap-5">
          <div className="lg:col-span-4">
            <MetricCopilotDraftPanel targetType={targetType} targetId={targetId || companyId} createDraft={createDraft} onDraft={applyDraft} />
            {draftMeta && (
              <div className="mt-3 rounded-2xl p-3 bg-white/[0.025] border border-white/8">
                <div className="text-[10px] uppercase tracking-[0.14em] text-white/35 mb-2">Draft Review</div>
                <div className="text-[11px] text-white/42">Confidence {confidencePct(draftMeta.confidence)}%</div>
                {draftMeta.resolved_target && (
                  <div className="text-[11px] text-white/42 mt-1">
                    Target: {draftMeta.resolved_target.label}{draftMeta.resolved_target.inferred ? ' (inferred)' : ''}
                  </div>
                )}
                {ownerSummary && (
                  <div className="text-[11px] text-white/42 mt-1">
                    Owner: {ownerSummary}{draftMeta.resolved_owner?.inferred ? ' (inferred)' : ''}
                  </div>
                )}
                {draftMeta.warnings.map(note => <div key={note} className="text-[11px] text-amber-300/80 mt-2">{note}</div>)}
                {draftMeta.assumptions.map(note => <div key={note} className="text-[11px] text-white/42 mt-2">{note}</div>)}
                {liveMissingFields.length > 0 && (
                  <div className="text-[11px] text-rose-300/85 mt-2">
                    Remaining required fields: {liveMissingFields.map(metricFieldLabel).join(', ')}
                  </div>
                )}
              </div>
            )}
          </div>

          <div className="lg:col-span-8 space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <Field label="Metric name">
                <input value={form.name} onChange={e => patch('name', e.target.value)} className="metric-input" placeholder="Activation rate" />
                {fieldHint('name')}
              </Field>
              <Field label="Owner">
                <select value={form.owner_member_id} onChange={e => patch('owner_member_id', e.target.value)} className="metric-input">
                  <option value="" className="bg-[#0e0e14]">Choose owner</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0e0e14]">
                      {[m.first_name, m.last_name].filter(Boolean).join(' ') || m.email || m.role}
                    </option>
                  ))}
                </select>
                {fieldHint('owner_member_id')}
              </Field>
            </div>
            <Field label="Description">
              <textarea value={form.description} onChange={e => patch('description', e.target.value)} className="metric-input min-h-20" placeholder="What this metric measures and why it matters" />
              {fieldHint('description')}
            </Field>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Field label="Unit">
                <input value={form.unit} onChange={e => patch('unit', e.target.value)} className="metric-input" placeholder="%, $, days" />
                {fieldHint('unit')}
              </Field>
              <Field label="Value type">
                <select value={form.value_type} onChange={e => patch('value_type', e.target.value as MetricValueType)} className="metric-input">
                  {['number', 'currency', 'percent', 'duration', 'count', 'ratio'].map(v => <option key={v} value={v} className="bg-[#0e0e14]">{v}</option>)}
                </select>
                {fieldHint('value_type')}
              </Field>
              <Field label="Direction">
                <select value={form.direction} onChange={e => patch('direction', e.target.value as MetricDirection)} className="metric-input">
                  <option value="higher_is_better" className="bg-[#0e0e14]">Higher is better</option>
                  <option value="lower_is_better" className="bg-[#0e0e14]">Lower is better</option>
                  <option value="target_band" className="bg-[#0e0e14]">Target band</option>
                </select>
                {fieldHint('direction')}
              </Field>
              <Field label="Cadence">
                <select value={form.cadence} onChange={e => patch('cadence', e.target.value)} className="metric-input">
                  {['daily', 'weekly', 'monthly', 'quarterly'].map(v => <option key={v} value={v} className="bg-[#0e0e14]">{v}</option>)}
                </select>
                {fieldHint('cadence')}
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Baseline">
                <input type="number" value={form.baseline_value} onChange={e => patch('baseline_value', Number(e.target.value))} className="metric-input" />
                {fieldHint('baseline_value')}
              </Field>
              <Field label="Current">
                <input type="number" value={form.current_value ?? 0} onChange={e => patch('current_value', Number(e.target.value))} className="metric-input" />
                {fieldHint('current_value')}
              </Field>
              <Field label="Target">
                <input type="number" value={form.target_value} onChange={e => patch('target_value', Number(e.target.value))} className="metric-input" />
                {fieldHint('target_value')}
              </Field>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Field label="Source">
                <input value="Manual" disabled className="metric-input opacity-70" />
                {fieldHint('source_type')}
              </Field>
              <Field label="Source confidence">
                <input type="number" min={0} max={1} step={0.05} value={form.source_confidence} onChange={e => patch('source_confidence', Number(e.target.value))} className="metric-input" />
              </Field>
              <Field label="Health weight">
                <input type="number" min={0.1} step={0.1} value={form.links[0]?.weight ?? 1} onChange={e => patchPrimaryLink({ weight: Number(e.target.value) })} className="metric-input" />
              </Field>
            </div>

            <label className="flex items-center gap-2 text-xs text-white/55">
              <input
                type="checkbox"
                checked={form.links[0]?.is_core ?? false}
                onChange={e => patchPrimaryLink({ is_core: e.target.checked, relation: e.target.checked ? 'health_component' : 'measures' })}
              />
              Use this metric as a weighted core health component.
            </label>

            <div className="rounded-2xl p-4 bg-white/[0.025] border border-white/8">
              <div className="flex items-center gap-2 text-sm font-bold text-white mb-2">
                <Database className="w-4 h-4" style={{ color: ACCENT }} /> Review
              </div>
              <div className="text-[11px] text-white/45">
                This metric will be attached to <span className="text-white/75">{targetSummary}</span> as a backend-persisted metric. It will not attach to local projects, tasks, cards, decisions, or agent runs.
              </div>
              {fieldHint('target')}
              {draftMeta && draftMeta.confidence < 0.6 && (
                <div className="mt-2 text-[11px] text-amber-300/80">
                  Draft confidence is low. Review every field before saving.
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="shrink-0 flex items-center justify-end gap-2 px-6 py-4 border-t border-white/8">
          {disabledReasons.length > 0 && (
            <div className="mr-auto text-[11px] text-rose-300/85">
              Confirm disabled: {disabledReasons.join(' · ')}
            </div>
          )}
          <button type="button" onClick={onClose} className="px-4 py-2 rounded-xl text-sm text-white/55 hover:text-white border border-white/10">Cancel</button>
          <button type="button" onClick={save} disabled={saving || disabledReasons.length > 0} className="px-4 py-2 rounded-xl text-sm font-semibold disabled:opacity-40" style={{ background: `${ACCENT}24`, border: `1px solid ${ACCENT}55`, color: ACCENT }}>
            <Check className="inline w-3.5 h-3.5 mr-1" /> {saving ? 'Saving...' : 'Confirm metric'}
          </button>
        </div>
      </div>
      <style>{`
        .metric-input {
          width: 100%;
          border-radius: 0.75rem;
          border: 1px solid rgba(255,255,255,0.10);
          background: rgba(255,255,255,0.05);
          padding: 0.625rem 0.75rem;
          color: white;
          font-size: 0.8125rem;
          outline: none;
        }
        .metric-input:focus { border-color: rgba(255,255,255,0.28); }
      `}</style>
    </div>
  );
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="text-[10px] uppercase tracking-[0.14em] text-white/38">{label}</span>
      <div className="mt-1">{children}</div>
    </label>
  );
}

export function EmptyMetricsState({ canEdit, onCreate }: { canEdit: boolean; onCreate: () => void }) {
  return (
    <div className="rounded-2xl p-6 bg-white/[0.025] border border-white/8 text-center">
      <Target className="w-7 h-7 mx-auto mb-3" style={{ color: ACCENT }} />
      <div className="text-sm font-bold text-white">No canonical metrics yet</div>
      <p className="text-xs text-white/38 mt-1 max-w-md mx-auto">
        Seed/catalog and localStorage metrics are intentionally ignored. Create a real backend metric to start health rollups.
      </p>
      {canEdit && (
        <button type="button" onClick={onCreate} className="mt-4 inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold" style={{ background: `${ACCENT}22`, color: ACCENT, border: `1px solid ${ACCENT}44` }}>
          <Plus className="w-3.5 h-3.5" /> Create metric
        </button>
      )}
    </div>
  );
}
