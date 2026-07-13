import React, { useState, useEffect, useRef, useCallback } from 'react';
import { X, Layers, CheckCircle2, Loader2, Search, Users } from 'lucide-react';
import type { UExternalNode, UInternalNode, UDomain } from '../lib/usePolytopeStore';
import { U_DOMAIN_COLOR } from '../lib/usePolytopeStore';
import type { TeamMember as WorkspaceMember } from '../lib/db/team';

// ── Types ──────────────────────────────────────────────────────────────────────

export type CreateDepartmentMode = 'department' | 'node' | 'member';

interface CreateDeptPanelProps {
  mode: 'department';
  /** Live-update dept name/domain in polytope while typing */
  onDraftUpdate?: (patch: Partial<Pick<UExternalNode, 'label' | 'domain'>>) => void;
  /** Screen-space position ref of the draft node (written by R3F scene each frame) */
  draftNodeScreenPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onClose: (isCancel?: boolean) => void;
  onCreated: (data: Omit<UExternalNode, 'id' | 'internalNodes' | 'isDraft'>) => void;
}

interface CreateNodePanelProps {
  mode: 'node';
  dept: UExternalNode;
  /** Live-update node label in polytope while typing */
  onDraftUpdate?: (patch: Partial<Pick<UInternalNode, 'label' | 'type'>>) => void;
  /** Screen-space position ref of the draft node */
  draftNodeScreenPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onClose: (isCancel?: boolean) => void;
  onCreated: (data: Omit<UInternalNode, 'id' | 'children'>) => void;
}

interface CreateMemberPanelProps {
  mode: 'member';
  dept: UExternalNode;
  node: UInternalNode;
  availableMembers: WorkspaceMember[];
  assignedMemberIds: string[];
  /** Screen-space position ref of the draft node */
  draftNodeScreenPosRef: React.MutableRefObject<{ x: number; y: number } | null>;
  onClose: (isCancel?: boolean) => void;
  onCreated: (data: { memberId: string }) => void;
}

type Props = CreateDeptPanelProps | CreateNodePanelProps | CreateMemberPanelProps;

// ── Constants ─────────────────────────────────────────────────────────────────

const DOMAINS: UDomain[] = ['direction', 'build', 'delivery', 'market', 'control', 'people'];
const NODE_TYPES: UInternalNode['type'][] = ['team', 'process', 'project', 'resource', 'decision', 'risk', 'metric', 'action'];

const DOMAIN_LABELS: Record<string, string> = {
  direction: 'Direction',
  build: 'Build',
  delivery: 'Delivery',
  market: 'Market',
  control: 'Control',
  people: 'People',
};

// ── Shared input styles ────────────────────────────────────────────────────────

const inputStyle: React.CSSProperties = {
  background: 'rgba(255,255,255,0.04)',
  border: '1px solid rgba(255,255,255,0.08)',
  color: '#fff',
  borderRadius: '0.625rem',
  padding: '8px 12px',
  fontSize: '12px',
  outline: 'none',
  width: '100%',
  transition: 'border-color 0.2s',
  boxSizing: 'border-box',
};

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#5E5E5E' }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function ScoreSlider({ value, onChange, label: _label }: { value: number; onChange: (v: number) => void; label: string }) {
  return (
    <div className="flex flex-col gap-1">
      <div className="flex justify-between text-[10px]" style={{ color: '#5E5E5E' }}>
        <span>0 — Critical</span>
        <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{value}</span>
        <span>100 — Excellent</span>
      </div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#6366f1' }}
      />
    </div>
  );
}


// ── Department Form ────────────────────────────────────────────────────────────

function DeptFormContent({
  onDraftUpdate,
  onSave,
  onCancel,
  accentColor: _accentColor,
}: {
  onDraftUpdate?: (patch: Partial<Pick<UExternalNode, 'label' | 'domain'>>) => void;
  onSave: (data: Omit<UExternalNode, 'id' | 'internalNodes' | 'isDraft'>) => void;
  onCancel: () => void;
  accentColor: string;
}) {
  const [label, setLabel] = useState('');
  const [domain, setDomain] = useState<UDomain>('build');
  const [cluster, setCluster] = useState('');
  const [score, setScore] = useState(75);
  const [perf, setPerf] = useState(75);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  const domainColor = U_DOMAIN_COLOR[domain] ?? '#6366f1';

  // Auto-focus name
  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 300);
  }, []);

  // Live-update draft node label/domain as user types
  const handleLabelChange = useCallback((v: string) => {
    setLabel(v);
    onDraftUpdate?.({ label: v || 'New Department' });
  }, [onDraftUpdate]);

  const handleDomainChange = useCallback((d: UDomain) => {
    setDomain(d);
    onDraftUpdate?.({ domain: d });
  }, [onDraftUpdate]);

  const isValid = label.trim().length > 0 && cluster.trim().length > 0;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
      setTimeout(() => {
        onSave({
          label: label.trim(),
          domain,
          cluster: cluster.trim(),
          score,
          metrics: { performance: perf, efficiency: perf, capacity: perf, alignment: perf, risk: 100 - perf },
        });
      }, 900);
    }, 400);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${domainColor}20` }}>
          <CheckCircle2 className="w-6 h-6" style={{ color: domainColor }} />
        </div>
        <p className="text-white text-sm font-semibold">Department Added!</p>
        <p className="text-[11px] text-center" style={{ color: '#5E5E5E' }}>
          <span style={{ color: domainColor }}>{label}</span> is now in the polytope
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
      <div className="px-4 py-3.5 flex flex-col gap-3.5">
        {/* Name */}
        <Field label="Department Name *">
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Engineering"
            value={label}
            onChange={e => handleLabelChange(e.target.value)}
            style={{
              ...inputStyle,
              fontSize: '14px',
              padding: '10px 12px',
              borderColor: `${domainColor}30`,
            }}
            onFocus={e => e.target.style.borderColor = `${domainColor}60`}
            onBlur={e => e.target.style.borderColor = `${domainColor}30`}
          />
        </Field>

        {/* Domain */}
        <Field label="Domain">
          <div className="grid grid-cols-3 gap-1.5">
            {DOMAINS.map(d => {
              const dc = U_DOMAIN_COLOR[d] ?? '#6366f1';
              return (
                <button
                  key={d}
                  type="button"
                  onClick={() => handleDomainChange(d)}
                  className="py-1.5 rounded-lg text-[11px] font-semibold transition-all"
                  style={{
                    background: domain === d ? `${dc}25` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${domain === d ? dc : 'rgba(255,255,255,0.08)'}`,
                    color: domain === d ? dc : '#94a3b8',
                  }}
                >
                  {DOMAIN_LABELS[d]}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Cluster */}
        <Field label="Cluster">
          <input
            type="text"
            placeholder="e.g. Core Engineering"
            value={cluster}
            onChange={e => setCluster(e.target.value)}
            style={inputStyle}
            onFocus={e => e.target.style.borderColor = 'rgba(255,255,255,0.2)'}
            onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
          />
        </Field>

        {/* Score */}
        <Field label={`Overall Score: ${score}`}>
          <ScoreSlider value={score} onChange={setScore} label="Score" />
        </Field>

        {/* Performance metric */}
        <Field label={`Performance: ${perf}`}>
          <input
            type="range" min={0} max={100} value={perf}
            onChange={e => setPerf(Number(e.target.value))}
            style={{ width: '100%', accentColor: domainColor }}
          />
        </Field>

        {/* Context badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px]"
          style={{
            background: `${domainColor}0a`,
            border: `1px solid ${domainColor}15`,
            color: domainColor,
          }}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span>New vertex in the <strong>{DOMAIN_LABELS[domain]}</strong> domain</span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
        style={{ borderTop: `1px solid ${domainColor}12` }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
          style={{ color: '#5E5E5E' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isValid}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${domainColor}, ${domainColor}bb)`,
            color: '#161618',
          }}
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Creating…</>
          ) : (
            'Create Department'
          )}
        </button>
      </div>
    </form>
  );
}

// ── Node Form ──────────────────────────────────────────────────────────────────

function NodeFormContent({
  dept,
  onDraftUpdate,
  onSave,
  onCancel,
}: {
  dept: UExternalNode;
  onDraftUpdate?: (patch: Partial<Pick<UInternalNode, 'label' | 'type'>>) => void;
  onSave: (data: Omit<UInternalNode, 'id' | 'children'>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState('');
  const [type, setType] = useState<UInternalNode['type']>('team');
  const [score, setScore] = useState(75);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const nameRef = useRef<HTMLInputElement>(null);

  // Action node fields
  const [verb, setVerb] = useState('');
  const [actionDescription, setActionDescription] = useState('');
  const [stateChange, setStateChange] = useState('');
  const [owner, setOwner] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [metricImpact, setMetricImpact] = useState('');
  const [output, setOutput] = useState('');
  const [checklist, setChecklist] = useState<string[]>(['']);

  const deptColor = U_DOMAIN_COLOR[dept.domain] ?? '#6366f1';

  useEffect(() => {
    setTimeout(() => nameRef.current?.focus(), 300);
  }, []);

  const handleLabelChange = useCallback((v: string) => {
    setLabel(v);
    onDraftUpdate?.({ label: v || 'New Node' });
  }, [onDraftUpdate]);

  const handleTypeChange = useCallback((t: UInternalNode['type']) => {
    setType(t);
    onDraftUpdate?.({ type: t });
  }, [onDraftUpdate]);

  const isActionValid = type !== 'action' || (
    verb.trim().length > 0 &&
    stateChange.trim().length > 0 &&
    owner.trim().length > 0 &&
    dueDate.trim().length > 0 &&
    metricImpact.trim().length > 0 &&
    output.trim().length > 0
  );
  const isValid = label.trim().length > 0 && isActionValid;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
      setTimeout(() => {
        onSave({
          label: label.trim(),
          type,
          score,
          ...(type === 'action' ? {
            actionDetails: {
              verb: verb.trim(),
              description: actionDescription.trim() || `${verb.trim()} ${label.trim().toLowerCase()} to advance department goals`,
              stateChange: stateChange.trim(),
              checklist: checklist.map(c => c.trim()).filter(Boolean),
            },
            owner: owner.trim(),
            dueDate,
            metricImpact: metricImpact.trim(),
            output: output.trim(),
          } : {}),
        });
      }, 900);
    }, 400);
  };

  const TYPE_COLORS: Record<string, string> = {
    team: '#60a5fa', process: '#a78bfa', project: '#34d399',
    resource: '#fbbf24', decision: '#f472b6', risk: '#f87171', metric: '#22d3ee', action: '#fb7185',
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${deptColor}20` }}>
          <CheckCircle2 className="w-6 h-6" style={{ color: deptColor }} />
        </div>
        <p className="text-white text-sm font-semibold">Node Added!</p>
        <p className="text-[11px] text-center" style={{ color: '#5E5E5E' }}>
          <span style={{ color: deptColor }}>{label}</span> joined{' '}
          <span className="text-white">{dept.label}</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
      <div className="px-4 py-3.5 flex flex-col gap-3.5">
        {/* Name */}
        <Field label="Node Label *">
          <input
            ref={nameRef}
            type="text"
            placeholder="e.g. Backend Team"
            value={label}
            onChange={e => handleLabelChange(e.target.value)}
            style={{
              ...inputStyle,
              fontSize: '14px',
              padding: '10px 12px',
              borderColor: `${deptColor}30`,
            }}
            onFocus={e => e.target.style.borderColor = `${deptColor}60`}
            onBlur={e => e.target.style.borderColor = `${deptColor}30`}
          />
        </Field>

        {/* Type */}
        <Field label="Type">
          <div className="flex flex-wrap gap-1.5">
            {NODE_TYPES.map(t => {
              const tc = TYPE_COLORS[t] ?? '#94a3b8';
              return (
                <button
                  key={t}
                  type="button"
                  onClick={() => handleTypeChange(t)}
                  className="px-2.5 py-1 rounded-lg text-[10px] font-semibold capitalize transition-all"
                  style={{
                    background: type === t ? `${tc}20` : 'rgba(255,255,255,0.04)',
                    border: `1px solid ${type === t ? tc : 'rgba(255,255,255,0.08)'}`,
                    color: type === t ? tc : '#64748b',
                  }}
                >
                  {t}
                </button>
              );
            })}
          </div>
        </Field>

        {/* Score */}
        <Field label={`Score: ${score}`}>
          <ScoreSlider value={score} onChange={setScore} label="Score" />
        </Field>

        {/* Action node fields */}
        {type === 'action' && (
          <>
            <div className="h-px" style={{ background: 'rgba(251,113,133,0.15)' }} />
            <p className="text-[10px] font-semibold uppercase tracking-wider" style={{ color: '#fb7185' }}>Action Details</p>

            <Field label="Verb *">
              <input
                type="text"
                placeholder="e.g. Launch, Implement, Review"
                value={verb}
                onChange={e => setVerb(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Description">
              <textarea
                placeholder="Describe this action in one sentence"
                value={actionDescription}
                onChange={e => setActionDescription(e.target.value)}
                rows={2}
                style={{ ...inputStyle, resize: 'none' }}
                onFocus={e => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => (e.target as HTMLTextAreaElement).style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="State Change *">
              <input
                type="text"
                placeholder="e.g. Launch complete — pipeline now active"
                value={stateChange}
                onChange={e => setStateChange(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Owner *">
              <input
                type="text"
                placeholder="e.g. Head of Engineering"
                value={owner}
                onChange={e => setOwner(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Due Date *">
              <input
                type="date"
                value={dueDate}
                onChange={e => setDueDate(e.target.value)}
                style={{ ...inputStyle, colorScheme: 'dark' }}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Metric Impact *">
              <input
                type="text"
                placeholder="e.g. Revenue +15%, Churn -8%"
                value={metricImpact}
                onChange={e => setMetricImpact(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Output *">
              <input
                type="text"
                placeholder="e.g. Signed contract, Published report"
                value={output}
                onChange={e => setOutput(e.target.value)}
                style={inputStyle}
                onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
              />
            </Field>

            <Field label="Checklist Items">
              <div className="flex flex-col gap-1.5">
                {checklist.map((item, i) => (
                  <div key={i} className="flex gap-1.5">
                    <input
                      type="text"
                      placeholder={`Step ${i + 1}`}
                      value={item}
                      onChange={e => {
                        const next = [...checklist];
                        next[i] = e.target.value;
                        setChecklist(next);
                      }}
                      style={{ ...inputStyle, flex: 1 }}
                      onFocus={e => e.target.style.borderColor = 'rgba(251,113,133,0.4)'}
                      onBlur={e => e.target.style.borderColor = 'rgba(255,255,255,0.08)'}
                    />
                    {checklist.length > 1 && (
                      <button
                        type="button"
                        onClick={() => setChecklist(checklist.filter((_, j) => j !== i))}
                        className="px-2 rounded-lg text-[11px] transition-colors hover:bg-white/10"
                        style={{ color: '#f87171', border: '1px solid rgba(255,255,255,0.06)', background: 'rgba(255,255,255,0.03)' }}
                      >
                        ×
                      </button>
                    )}
                  </div>
                ))}
                <button
                  type="button"
                  onClick={() => setChecklist([...checklist, ''])}
                  className="text-[10px] text-left transition-colors hover:opacity-80"
                  style={{ color: '#fb7185' }}
                >
                  + Add step
                </button>
              </div>
            </Field>
          </>
        )}

        {/* Context badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px]"
          style={{
            background: `${deptColor}0a`,
            border: `1px solid ${deptColor}15`,
            color: deptColor,
          }}
        >
          <Layers className="w-3 h-3 shrink-0" />
          <span>Internal node of <strong>{dept.label}</strong></span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
        style={{ borderTop: `1px solid ${deptColor}12` }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
          style={{ color: '#5E5E5E' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isValid}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${deptColor}, ${deptColor}bb)`,
            color: '#161618',
          }}
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Adding…</>
          ) : (
            'Add Node'
          )}
        </button>
      </div>
    </form>
  );
}

// ── Member Form ──────────────────────────────────────────────────────────────────

function MemberFormContent({
  dept,
  node,
  availableMembers,
  assignedMemberIds,
  onSave,
  onCancel,
}: {
  dept: UExternalNode;
  node: UInternalNode;
  availableMembers: WorkspaceMember[];
  assignedMemberIds: string[];
  onSave: (data: { memberId: string }) => void;
  onCancel: () => void;
}) {
  const [query, setQuery] = useState('');
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const deptColor = U_DOMAIN_COLOR[dept.domain] ?? '#6366f1';

  useEffect(() => {
    setTimeout(() => searchRef.current?.focus(), 300);
  }, []);

  const eligibleMembers = availableMembers
    .filter(member => member.status === 'active')
    .filter(member => !assignedMemberIds.includes(member.id))
    .filter(member => {
      const haystack = [
        member.first_name,
        member.last_name,
        member.title,
        member.role_name,
        member.role,
      ]
        .filter(Boolean)
        .join(' ')
        .toLowerCase();
      return haystack.includes(query.trim().toLowerCase());
    });

  const selectedMember = eligibleMembers.find(member => member.id === selectedMemberId) ?? null;
  const isValid = Boolean(selectedMemberId);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid) return;
    setLoading(true);
    setTimeout(() => {
      setLoading(false);
      setDone(true);
      setTimeout(() => {
        onSave({ memberId: selectedMemberId! });
      }, 900);
    }, 400);
  };

  if (done) {
    return (
      <div className="flex flex-col items-center justify-center gap-4 py-8">
        <div className="w-12 h-12 rounded-full flex items-center justify-center" style={{ background: `${deptColor}20` }}>
          <CheckCircle2 className="w-6 h-6" style={{ color: deptColor }} />
        </div>
        <p className="text-white text-sm font-semibold">Teammate Assigned!</p>
        <p className="text-[11px] text-center" style={{ color: '#5E5E5E' }}>
          <span style={{ color: deptColor }}>
            {selectedMember?.first_name || selectedMember?.role_name || 'Member'}
          </span>{' '}
          is now attached to <span className="text-white">{node.label}</span>
        </p>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="overflow-y-auto flex-1" style={{ scrollbarWidth: 'none' }}>
      <div className="px-4 py-3.5 flex flex-col gap-3.5">
        <Field label="Search Workspace Members">
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" style={{ color: '#5E5E5E' }} />
            <input
              ref={searchRef}
              type="text"
              placeholder="Search by name, title, or role"
              value={query}
              onChange={e => setQuery(e.target.value)}
              style={{
                ...inputStyle,
                fontSize: '14px',
                padding: '10px 12px 10px 34px',
                borderColor: `${deptColor}30`,
              }}
              onFocus={e => e.target.style.borderColor = `${deptColor}60`}
              onBlur={e => e.target.style.borderColor = `${deptColor}30`}
            />
          </div>
        </Field>

        <Field label="Assignable Members">
          <div className="flex flex-col gap-2 max-h-60 overflow-y-auto pr-1">
            {eligibleMembers.length === 0 ? (
              <div className="rounded-xl border border-white/5 bg-white/[0.02] px-3 py-4 text-[11px] text-white/40">
                No eligible workspace members found for this node.
              </div>
            ) : (
              eligibleMembers.map(member => {
                const fullName = [member.first_name, member.last_name].filter(Boolean).join(' ').trim() || member.role_name || member.role;
                const subtitle = member.title || member.role_name || member.role;
                const selected = selectedMemberId === member.id;
                return (
                  <button
                    key={member.id}
                    type="button"
                    onClick={() => setSelectedMemberId(member.id)}
                    className="w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-left transition-all"
                    style={{
                      background: selected ? `${deptColor}14` : 'rgba(255,255,255,0.03)',
                      border: `1px solid ${selected ? `${deptColor}50` : 'rgba(255,255,255,0.06)'}`,
                    }}
                  >
                    <div
                      className="w-9 h-9 rounded-full overflow-hidden flex items-center justify-center shrink-0 text-[11px] font-semibold"
                      style={{ background: `${deptColor}16`, color: deptColor, border: `1px solid ${deptColor}26` }}
                    >
                      {member.avatar_url ? (
                        <img src={member.avatar_url} alt={fullName} className="w-full h-full object-cover" />
                      ) : (
                        (fullName[0] || 'M').toUpperCase()
                      )}
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="text-sm font-medium text-white/90 truncate">{fullName}</div>
                      <div className="text-[11px] text-white/45 truncate">{subtitle}</div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </Field>

        {/* Context badge */}
        <div
          className="flex items-center gap-1.5 px-2.5 py-2 rounded-lg text-[10px]"
          style={{
            background: `${deptColor}0a`,
            border: `1px solid ${deptColor}15`,
            color: deptColor,
          }}
        >
          <Users className="w-3 h-3 shrink-0" />
          <span>Assigning a real workspace member to <strong>{node.label}</strong></span>
        </div>
      </div>

      {/* Footer */}
      <div
        className="flex items-center justify-end gap-2 px-4 py-3 shrink-0"
        style={{ borderTop: `1px solid ${deptColor}12` }}
      >
        <button
          type="button"
          onClick={onCancel}
          className="px-4 py-2 rounded-lg text-[11px] font-medium transition-colors hover:bg-white/5"
          style={{ color: '#5E5E5E' }}
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading || !isValid}
          className="flex items-center gap-1.5 px-5 py-2 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90 disabled:opacity-40"
          style={{
            background: `linear-gradient(135deg, ${deptColor}, ${deptColor}bb)`,
            color: '#161618',
          }}
        >
          {loading ? (
            <><Loader2 className="w-3.5 h-3.5 animate-spin" />Adding…</>
          ) : (
            'Assign Member'
          )}
        </button>
      </div>
    </form>
  );
}

// ── Main Panel ─────────────────────────────────────────────────────────────────

export default function CreateDepartmentPanel(props: Props) {
  const [draftPos, setDraftPos] = useState<{ x: number; y: number } | null>(null);
  const rafRef = useRef<number>(0);

  // Poll the draft node screen-position ref each frame
  useEffect(() => {
    const update = () => {
      const pos = props.draftNodeScreenPosRef.current;
      setDraftPos(pos ? { ...pos } : null);
      rafRef.current = requestAnimationFrame(update);
    };
    rafRef.current = requestAnimationFrame(update);
    return () => cancelAnimationFrame(rafRef.current);
  }, [props.draftNodeScreenPosRef]);

  const modalLeft = 24;
  const modalTop = 100;
  const modalWidth = 320;

  // Accent color: domain color for departments, dept color for nodes
  const accentColor = props.mode === 'department'
    ? U_DOMAIN_COLOR['build']
    : U_DOMAIN_COLOR[props.dept.domain] ?? '#6366f1';

  const title = props.mode === 'department' ? 'New Department' : props.mode === 'node' ? `Add Node — ${props.dept.label}` : `Assign Member — ${props.dept.label}`;
  const subtitle = props.mode === 'department'
    ? 'New vertex in the polytope'
    : props.mode === 'node' ? `Internal node of ${props.dept.label}` : `Real teammate assignment`;

  const modalCenterY = modalTop + 280; // approximate center
  const modalRight = modalLeft + modalWidth;

  return (
    <>
      {/* Connector SVG line from panel to draft node */}
      {draftPos && (
        <svg
          style={{
            position: 'fixed',
            inset: 0,
            width: '100vw',
            height: '100vh',
            pointerEvents: 'none',
            zIndex: 998,
          }}
        >
          <line
            x1={modalRight + 8}
            y1={modalCenterY}
            x2={draftPos.x}
            y2={draftPos.y}
            stroke={accentColor}
            strokeWidth="1.5"
            strokeOpacity="0.4"
            strokeDasharray="4 4"
          />
          <circle cx={draftPos.x} cy={draftPos.y} r="4" fill={accentColor} fillOpacity="0.7" />
          <circle cx={modalRight + 8} cy={modalCenterY} r="3" fill={accentColor} fillOpacity="0.5" />
        </svg>
      )}

      {/* Floating left-side panel */}
      <div
        className="fixed z-[999] flex flex-col rounded-2xl overflow-hidden"
        style={{
          left: modalLeft,
          top: modalTop,
          width: modalWidth,
          maxHeight: `calc(100vh - ${modalTop + 40}px)`,
          background: 'rgba(10, 10, 12, 0.92)',
          border: `1px solid ${accentColor}25`,
          backdropFilter: 'blur(24px)',
          boxShadow: `0 0 80px ${accentColor}12, 0 24px 64px rgba(0,0,0,0.7), inset 0 1px 0 rgba(255,255,255,0.04)`,
          animation: 'panel-slide-in 0.3s cubic-bezier(0.23, 1, 0.32, 1) both',
        }}
      >
        {/* Header */}
        <div
          className="flex items-center gap-2.5 px-4 py-3.5 shrink-0"
          style={{ borderBottom: `1px solid ${accentColor}15` }}
        >
          <div
            className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
            style={{ background: `${accentColor}18`, border: `1px solid ${accentColor}25` }}
          >
            <Layers className="w-4 h-4" style={{ color: accentColor }} />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-white text-sm font-semibold leading-tight">{title}</h2>
            <p className="text-[10px] mt-0.5 truncate" style={{ color: '#5E5E5E' }}>{subtitle}</p>
          </div>
          <button
            onClick={() => props.onClose(true)}
            className="p-1.5 rounded-lg transition-colors hover:bg-white/10 shrink-0"
            style={{ color: '#5E5E5E' }}
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Form content */}
        {props.mode === 'department' ? (
          <DeptFormContent
            onDraftUpdate={props.onDraftUpdate}
            accentColor={accentColor}
            onSave={data => props.onCreated(data)}
            onCancel={() => props.onClose(true)}
          />
        ) : props.mode === 'node' ? (
          <NodeFormContent
            dept={props.dept}
            onDraftUpdate={props.onDraftUpdate}
            onSave={data => props.onCreated(data)}
            onCancel={() => props.onClose(true)}
          />
        ) : (
          <MemberFormContent
            dept={props.dept}
            node={props.node}
            availableMembers={props.availableMembers}
            assignedMemberIds={props.assignedMemberIds}
            onSave={data => props.onCreated(data)}
            onCancel={() => props.onClose(true)}
          />
        )}
      </div>
    </>
  );
}
