import { useState, useEffect } from 'react';
import { Plus, X, Edit3, Trash2, ChevronRight, ChevronDown, AlertTriangle } from 'lucide-react';
import type { UExternalNode, UInternalNode, UDomain } from '../lib/usePolytopeStore';
import { U_DOMAIN_COLOR } from '../lib/usePolytopeStore';

// ── Types ─────────────────────────────────────────────────────────────────────

interface Props {
  departments: UExternalNode[];
  onAddDepartment: (d: Omit<UExternalNode, 'id' | 'internalNodes'>) => void;
  onUpdateDepartment: (id: string, d: Partial<Omit<UExternalNode, 'id' | 'internalNodes'>>) => void;
  onDeleteDepartment: (id: string) => void;
  onAddNode: (deptId: string, n: Omit<UInternalNode, 'id' | 'children'>) => void;
  onUpdateNode: (deptId: string, nodeId: string, n: Partial<Omit<UInternalNode, 'id' | 'children'>>) => void;
  onDeleteNode: (deptId: string, nodeId: string) => void;
  /** External open trigger — when true, opens the modal. Set back to false via onForcedClose. */
  forceOpen?: boolean;
  /** When forceOpen is true, open on this view (e.g. { type: 'addDept' }) */
  forcedView?: View;
  /** Called after the modal closes when it was opened via forceOpen */
  onForcedClose?: () => void;
}

type View =
  | { type: 'home' }
  | { type: 'addDept' }
  | { type: 'editDept'; dept: UExternalNode }
  | { type: 'deleteDept'; dept: UExternalNode }
  | { type: 'nodes'; dept: UExternalNode }
  | { type: 'addNode'; dept: UExternalNode }
  | { type: 'editNode'; dept: UExternalNode; node: UInternalNode }
  | { type: 'deleteNode'; dept: UExternalNode; node: UInternalNode };

const DOMAINS: UDomain[] = ['direction', 'build', 'delivery', 'market', 'control', 'people'];
const NODE_TYPES: UInternalNode['type'][] = ['team', 'process', 'project', 'resource', 'decision', 'risk', 'metric', 'action'];

const DOMAIN_LABELS: Record<UDomain, string> = {
  direction: 'Direction',
  build: 'Build',
  delivery: 'Delivery',
  market: 'Market',
  control: 'Control',
  people: 'People',
  inactive: 'Inactive',
};

// ── Shared styles ─────────────────────────────────────────────────────────────

const INPUT_STYLE: React.CSSProperties = {
  width: '100%',
  background: 'linear-gradient(135deg, rgba(255,255,255,0.06) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(136, 170, 255, 0.3)',
  boxShadow: 'inset 0 0 5px rgba(136, 170, 255, 0.1)',
  backdropFilter: 'blur(4px)',
  borderRadius: 8,
  padding: '10px 14px',
  color: '#e2e8f0',
  fontSize: 13,
  outline: 'none',
  boxSizing: 'border-box',
};

const LABEL_STYLE: React.CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: '#94a3b8',
  marginBottom: 6,
};

const BTN_PRIMARY: React.CSSProperties = {
  background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
};

const BTN_DANGER: React.CSSProperties = {
  background: 'linear-gradient(135deg, #ef4444, #dc2626)',
  border: 'none',
  borderRadius: 8,
  padding: '10px 20px',
  color: '#fff',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
};

const BTN_GHOST: React.CSSProperties = {
  background: 'linear-gradient(135deg, rgba(255,255,255,0.08) 0%, rgba(255,255,255,0.02) 100%)',
  border: '1px solid rgba(136, 170, 255, 0.25)',
  boxShadow: 'inset 0 0 5px rgba(136, 170, 255, 0.1)',
  backdropFilter: 'blur(4px)',
  borderRadius: 8,
  padding: '10px 20px',
  color: '#94a3b8',
  fontWeight: 600,
  fontSize: 13,
  cursor: 'pointer',
  width: '100%',
};

// ── Sub-components ─────────────────────────────────────────────────────────────

function FieldGroup({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <div style={LABEL_STYLE}>{label}</div>
      {children}
    </div>
  );
}

function ScoreSlider({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  return (
    <div>
      <input
        type="range" min={0} max={100} value={value}
        onChange={e => onChange(Number(e.target.value))}
        style={{ width: '100%', accentColor: '#6366f1' }}
      />
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: '#64748b', marginTop: 2 }}>
        <span>0 — Critical</span>
        <span style={{ color: '#a5b4fc', fontWeight: 700 }}>{value}</span>
        <span>100 — Excellent</span>
      </div>
    </div>
  );
}

// ── Home view ──────────────────────────────────────────────────────────────────

function HomeView({ departments, setView }: {
  departments: UExternalNode[];
  setView: (v: View) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{departments.length} department{departments.length !== 1 ? 's' : ''}</span>
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setView({ type: 'addDept' })}
            style={{ ...BTN_PRIMARY, width: 'auto', padding: '6px 14px', display: 'flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            <Plus size={12} /> Add Dept
          </button>
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 420, overflowY: 'auto', paddingRight: 4 }}>
        {departments.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '40px 0' }}>
            No departments yet.<br />Click <strong style={{ color: '#6366f1' }}>+ Add Dept</strong> to start.
          </div>
        )}
        {departments.map(dept => {
          const color = U_DOMAIN_COLOR[dept.domain] ?? '#6366f1';
          const isExpanded = expanded === dept.id;
          return (
            <div key={dept.id} style={{ flexShrink: 0, borderRadius: 10, border: `1px solid ${color}55`, background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', boxShadow: `inset 0 0 10px ${color}15`, overflow: 'hidden', backdropFilter: 'blur(8px)' }}>
              <div
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 14px', cursor: 'pointer' }}
                onClick={() => setExpanded(isExpanded ? null : dept.id)}
              >
                <div style={{ width: 10, height: 10, borderRadius: '50%', background: color, flexShrink: 0 }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 14, fontWeight: 600, color: '#e2e8f0' }}>{dept.label}</div>
                  <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                    {DOMAIN_LABELS[dept.domain]} · {dept.internalNodes.length} node{dept.internalNodes.length !== 1 ? 's' : ''} · Score {dept.score}
                  </div>
                </div>
                {isExpanded ? <ChevronDown size={14} color="#64748b" /> : <ChevronRight size={14} color="#64748b" />}
              </div>

              {isExpanded && (
                <div style={{ borderTop: `1px solid ${color}22`, padding: '10px 14px', display: 'flex', gap: 8 }}>
                  <button onClick={() => setView({ type: 'nodes', dept })} style={{ ...BTN_GHOST, fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    Nodes ({dept.internalNodes.length})
                  </button>
                  <button onClick={() => setView({ type: 'editDept', dept })} style={{ ...BTN_GHOST, fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Edit3 size={12} style={{ marginRight: 4 }} />Edit
                  </button>
                  <button onClick={() => setView({ type: 'deleteDept', dept })} style={{ ...BTN_DANGER, fontSize: 12, padding: '7px 12px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <Trash2 size={12} style={{ marginRight: 4 }} />Delete
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Dept Form ─────────────────────────────────────────────────────────────────

function DeptForm({ initial, onSave, onCancel }: {
  initial?: Partial<UExternalNode>;
  onSave: (d: Omit<UExternalNode, 'id' | 'internalNodes'>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [domain, setDomain] = useState<UDomain>(initial?.domain ?? 'build');
  const [cluster, setCluster] = useState(initial?.cluster ?? '');
  const [score, setScore] = useState(initial?.score ?? 75);
  const [perf, setPerf] = useState(initial?.metrics?.performance ?? 75);
  const [eff, setEff] = useState(initial?.metrics?.efficiency ?? 75);
  const [cap, setCap] = useState(initial?.metrics?.capacity ?? 75);
  const [align, setAlign] = useState(initial?.metrics?.alignment ?? 75);
  const [risk, setRisk] = useState(initial?.metrics?.risk ?? 20);

  const isValid = label.trim().length > 0 && cluster.trim().length > 0;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      label: label.trim(),
      domain,
      cluster: cluster.trim(),
      score,
      metrics: { performance: perf, efficiency: eff, capacity: cap, alignment: align, risk },
    });
  };

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
      <FieldGroup label="Department Name">
        <input style={INPUT_STYLE} placeholder="e.g. Engineering" value={label} onChange={e => setLabel(e.target.value)} />
      </FieldGroup>

      <FieldGroup label="Domain">
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {DOMAINS.map(d => (
            <button key={d} onClick={() => setDomain(d)} style={{
              background: domain === d ? `${U_DOMAIN_COLOR[d]}33` : 'rgba(255,255,255,0.04)',
              border: `1px solid ${domain === d ? U_DOMAIN_COLOR[d] : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 8, padding: '8px 4px', cursor: 'pointer', color: domain === d ? U_DOMAIN_COLOR[d] : '#94a3b8',
              fontSize: 11, fontWeight: 600, textAlign: 'center',
            }}>
              {d.charAt(0).toUpperCase() + d.slice(1)}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label="Cluster">
        <input style={INPUT_STYLE} placeholder="e.g. Build" value={cluster} onChange={e => setCluster(e.target.value)} />
      </FieldGroup>

      <FieldGroup label={`Overall Score: ${score}`}>
        <ScoreSlider value={score} onChange={setScore} />
      </FieldGroup>

      <div style={{ borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: 14, marginBottom: 14 }}>
        <div style={{ ...LABEL_STYLE, marginBottom: 12 }}>Metrics</div>
        {[
          ['Performance', perf, setPerf],
          ['Efficiency', eff, setEff],
          ['Capacity', cap, setCap],
          ['Alignment', align, setAlign],
          ['Risk', risk, setRisk],
        ].map(([name, val, setter]) => (
          <div key={name as string} style={{ marginBottom: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#94a3b8', marginBottom: 4 }}>
              <span>{name as string}</span><span style={{ color: '#a5b4fc' }}>{val as number}</span>
            </div>
            <input type="range" min={0} max={100} value={val as number}
              onChange={e => (setter as (v: number) => void)(Number(e.target.value))}
              style={{ width: '100%', accentColor: '#6366f1' }} />
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={BTN_GHOST}>Cancel</button>
        <button onClick={handleSave} style={{ ...BTN_PRIMARY, opacity: isValid ? 1 : 0.4, cursor: isValid ? 'pointer' : 'not-allowed' }}>
          {initial?.id ? 'Save Changes' : 'Create Department'}
        </button>
      </div>
    </div>
  );
}

// ── Nodes List ─────────────────────────────────────────────────────────────────

function NodesView({ dept, setView }: { dept: UExternalNode; setView: (v: View) => void }) {
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <span style={{ fontSize: 13, color: '#64748b' }}>{dept.internalNodes.length} node{dept.internalNodes.length !== 1 ? 's' : ''}</span>
        <button onClick={() => setView({ type: 'addNode', dept })} style={{ ...BTN_PRIMARY, width: 'auto', padding: '6px 14px', fontSize: 12, display: 'flex', alignItems: 'center', gap: 6 }}>
          <Plus size={12} /> Add Node
        </button>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxHeight: 380, overflowY: 'auto', paddingRight: 4 }}>
        {dept.internalNodes.length === 0 && (
          <div style={{ textAlign: 'center', color: '#475569', fontSize: 13, padding: '32px 0' }}>
            No nodes yet. Click <strong style={{ color: '#6366f1' }}>+ Add Node</strong>.
          </div>
        )}
        {dept.internalNodes.map(node => (
          <div key={node.id} style={{
            flexShrink: 0,
            display: 'flex', alignItems: 'center', gap: 10,
            background: 'linear-gradient(135deg, rgba(255,255,255,0.05) 0%, rgba(255,255,255,0.01) 100%)', border: '1px solid rgba(136, 170, 255, 0.2)',
            boxShadow: 'inset 0 0 10px rgba(136, 170, 255, 0.05)', backdropFilter: 'blur(8px)',
            borderRadius: 10, padding: '11px 14px',
          }}>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#e2e8f0' }}>{node.label}</div>
              <div style={{ fontSize: 11, color: '#64748b', marginTop: 1 }}>
                {node.type} · Score {node.score}
              </div>
            </div>
            <button
              onClick={() => setView({ type: 'editNode', dept, node })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#94a3b8' }}
            ><Edit3 size={14} /></button>
            <button
              onClick={() => setView({ type: 'deleteNode', dept, node })}
              style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 6, color: '#ef4444' }}
            ><Trash2 size={14} /></button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Node Form ─────────────────────────────────────────────────────────────────

function NodeForm({ initial, onSave, onCancel }: {
  initial?: Partial<UInternalNode>;
  onSave: (n: Omit<UInternalNode, 'id' | 'children'>) => void;
  onCancel: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [type, setType] = useState<UInternalNode['type']>(initial?.type ?? 'team');
  const [score, setScore] = useState(initial?.score ?? 75);

  const [projDescription, setProjDescription] = useState(initial?.projectDetails?.description ?? '');
  const [projStatus, setProjStatus] = useState(initial?.projectDetails?.status ?? '');
  const [projDeadline, setProjDeadline] = useState(initial?.projectDetails?.deadline ?? '');
  const [projBudget, setProjBudget] = useState(initial?.projectDetails?.budget ?? '');

  const [actionVerb, setActionVerb] = useState(initial?.actionDetails?.verb ?? '');
  const [actionDesc, setActionDesc] = useState(initial?.actionDetails?.description ?? '');
  const [actionStateChange, setActionStateChange] = useState(initial?.actionDetails?.stateChange ?? initial?.stateChange ?? '');
  const [actionOwner, setActionOwner] = useState(initial?.owner ?? '');
  const [actionDueDate, setActionDueDate] = useState(initial?.dueDate ?? '');
  const [actionMetricImpact, setActionMetricImpact] = useState(initial?.metricImpact ?? '');
  const [actionOutput, setActionOutput] = useState(initial?.output ?? '');

  const isActionValid = type !== 'action' || (
    actionVerb.trim().length > 0 && actionStateChange.trim().length > 0 &&
    actionOwner.trim().length > 0 && actionDueDate.trim().length > 0 &&
    actionMetricImpact.trim().length > 0 && actionOutput.trim().length > 0
  );
  const isValid = label.trim().length > 0 && isActionValid;

  const handleSave = () => {
    if (!isValid) return;
    onSave({
      label: label.trim(),
      type,
      score,
      ...(type === 'project' ? { projectDetails: { description: projDescription, status: projStatus, deadline: projDeadline, budget: projBudget } } : {}),
      ...(type === 'action' ? {
        actionDetails: { verb: actionVerb.trim(), description: actionDesc.trim() || `${actionVerb.trim()} ${label.trim().toLowerCase()}`, stateChange: actionStateChange.trim(), checklist: [] },
        owner: actionOwner.trim(),
        dueDate: actionDueDate,
        metricImpact: actionMetricImpact.trim(),
        output: actionOutput.trim(),
      } : {}),
    });
  };

  return (
    <div style={{ maxHeight: 460, overflowY: 'auto', paddingRight: 4 }}>
      <FieldGroup label="Node Label">
        <input style={INPUT_STYLE} placeholder="e.g. Backend Team" value={label} onChange={e => setLabel(e.target.value)} />
      </FieldGroup>

      <FieldGroup label="Type">
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {NODE_TYPES.map(t => (
            <button key={t} onClick={() => setType(t)} style={{
              background: type === t ? 'rgba(99,102,241,0.25)' : 'rgba(255,255,255,0.04)',
              border: `1px solid ${type === t ? '#6366f1' : 'rgba(255,255,255,0.1)'}`,
              borderRadius: 6, padding: '6px 12px', cursor: 'pointer',
              color: type === t ? '#a5b4fc' : '#94a3b8', fontSize: 12, fontWeight: 600,
            }}>
              {t.charAt(0).toUpperCase() + t.slice(1)}
            </button>
          ))}
        </div>
      </FieldGroup>

      <FieldGroup label={`Score: ${score}`}>
        <ScoreSlider value={score} onChange={setScore} />
      </FieldGroup>

      {type === 'project' && (
        <>
          <FieldGroup label="Status">
             <input style={INPUT_STYLE} placeholder="e.g. In Progress" value={projStatus} onChange={e => setProjStatus(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Deadline">
             <input style={INPUT_STYLE} placeholder="e.g. Q3 2026" value={projDeadline} onChange={e => setProjDeadline(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Budget">
             <input style={INPUT_STYLE} placeholder="e.g. $50k" value={projBudget} onChange={e => setProjBudget(e.target.value)} />
          </FieldGroup>
          <FieldGroup label="Description">
             <textarea style={{...INPUT_STYLE, height: 60}} placeholder="Project description..." value={projDescription} onChange={e => setProjDescription(e.target.value)} />
          </FieldGroup>
        </>
      )}

      {type === 'action' && (
        <>
          <FieldGroup label="Verb *"><input style={INPUT_STYLE} placeholder="e.g. Launch, Implement" value={actionVerb} onChange={e => setActionVerb(e.target.value)} /></FieldGroup>
          <FieldGroup label="Description"><textarea style={{...INPUT_STYLE, height: 48}} placeholder="One-sentence description" value={actionDesc} onChange={e => setActionDesc(e.target.value)} /></FieldGroup>
          <FieldGroup label="State Change *"><input style={INPUT_STYLE} placeholder="e.g. Launch complete — pipeline active" value={actionStateChange} onChange={e => setActionStateChange(e.target.value)} /></FieldGroup>
          <FieldGroup label="Owner *"><input style={INPUT_STYLE} placeholder="e.g. Head of Engineering" value={actionOwner} onChange={e => setActionOwner(e.target.value)} /></FieldGroup>
          <FieldGroup label="Due Date *"><input type="date" style={INPUT_STYLE} value={actionDueDate} onChange={e => setActionDueDate(e.target.value)} /></FieldGroup>
          <FieldGroup label="Metric Impact *"><input style={INPUT_STYLE} placeholder="e.g. Revenue +15%" value={actionMetricImpact} onChange={e => setActionMetricImpact(e.target.value)} /></FieldGroup>
          <FieldGroup label="Output *"><input style={INPUT_STYLE} placeholder="e.g. Signed contract, Published report" value={actionOutput} onChange={e => setActionOutput(e.target.value)} /></FieldGroup>
        </>
      )}

      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={onCancel} style={BTN_GHOST}>Cancel</button>
        <button onClick={handleSave}
          style={{ ...BTN_PRIMARY, opacity: isValid ? 1 : 0.4, cursor: isValid ? 'pointer' : 'not-allowed' }}>
          {initial?.id ? 'Save Changes' : 'Add Node'}
        </button>
      </div>
    </div>
  );
}

// ── Confirm Delete ─────────────────────────────────────────────────────────────

function ConfirmDelete({ title, message, onConfirm, onCancel }: {
  title: string; message: string; onConfirm: () => void; onCancel: () => void;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '8px 0' }}>
      <div style={{
        width: 52, height: 52, borderRadius: '50%', background: 'rgba(239,68,68,0.15)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px',
      }}>
        <AlertTriangle size={24} color="#ef4444" />
      </div>
      <div style={{ fontSize: 16, fontWeight: 700, color: '#e2e8f0', marginBottom: 8 }}>{title}</div>
      <div style={{ fontSize: 13, color: '#64748b', marginBottom: 24, lineHeight: 1.6 }}>{message}</div>
      <div style={{ display: 'flex', gap: 8 }}>
        <button onClick={onCancel} style={BTN_GHOST}>Cancel</button>
        <button onClick={onConfirm} style={BTN_DANGER}>Delete</button>
      </div>
    </div>
  );
}

// ── Main Manager Component ─────────────────────────────────────────────────────

export function PolytopeManager(props: Props) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>({ type: 'home' });

  // External open/view control (from sidebar Add buttons)
  const { forceOpen, forcedView, onForcedClose } = props;
  useEffect(() => {
    if (forceOpen) {
      setOpen(true);
      if (forcedView) setView(forcedView);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [forceOpen]);

  const closeModal = () => {
    setOpen(false);
    setView({ type: 'home' });
    if (forceOpen) onForcedClose?.();
  };

  const getTitle = (): string => {
    switch (view.type) {
      case 'home': return 'Manage Departments';
      case 'addDept': return 'New Department';
      case 'editDept': return `Edit: ${view.dept.label}`;
      case 'deleteDept': return 'Delete Department';
      case 'nodes': return `${view.dept.label} — Nodes`;
      case 'addNode': return `Add Node in ${view.dept.label}`;
      case 'editNode': return `Edit ${view.node.label}`;
      case 'deleteNode': return `Delete ${view.node.label}`;
    }
  };

  const goBack = () => {
    switch (view.type) {
      case 'addDept':
      case 'editDept':
      case 'deleteDept':
        setView({ type: 'home' }); break;
      case 'nodes':
        setView({ type: 'home' }); break;
      case 'addNode':
      case 'editNode':
      case 'deleteNode':
        // need to refresh dept from props since it may have been mutated
        const freshDept = props.departments.find(d => d.id === (view as any).dept.id);
        setView({ type: 'nodes', dept: freshDept ?? (view as any).dept });
        break;
    }
  };

  const renderView = () => {
    // Always use fresh dept from props
    const freshDept = (v: { dept: UExternalNode }) =>
      props.departments.find(d => d.id === v.dept.id) ?? v.dept;

    switch (view.type) {
      case 'home':
        return <HomeView departments={props.departments} setView={setView} />;

      case 'addDept':
        return <DeptForm onSave={d => { props.onAddDepartment(d); setView({ type: 'home' }); }} onCancel={goBack} />;

      case 'editDept':
        return <DeptForm initial={freshDept(view)} onSave={d => { props.onUpdateDepartment(view.dept.id, d); setView({ type: 'home' }); }} onCancel={goBack} />;

      case 'deleteDept':
        return <ConfirmDelete
          title="Delete Department?"
          message={`"${view.dept.label}" and all its ${view.dept.internalNodes.length} node(s) will be permanently removed from the polytope.`}
          onConfirm={() => { props.onDeleteDepartment(view.dept.id); setView({ type: 'home' }); }}
          onCancel={goBack}
        />;

      case 'nodes':
        return <NodesView dept={freshDept(view)} setView={setView} />;

      case 'addNode':
        return <NodeForm
          onSave={n => { props.onAddNode(view.dept.id, n); const d = props.departments.find(x => x.id === view.dept.id)!; setView({ type: 'nodes', dept: d }); }}
          onCancel={goBack}
        />;

      case 'editNode':
        return <NodeForm
          initial={view.node}
          onSave={n => { props.onUpdateNode(view.dept.id, view.node.id, n); goBack(); }}
          onCancel={goBack}
        />;

      case 'deleteNode':
        return <ConfirmDelete
          title="Delete Node?"
          message={`"${view.node.label}" will be permanently removed from ${view.dept.label}.`}
          onConfirm={() => { props.onDeleteNode(view.dept.id, view.node.id); goBack(); }}
          onCancel={goBack}
        />;

    }
  };

  return (
    <>
      {/* Plus Button — commented out; sidebar Add buttons open the modal instead */}
      {/* <button
        onClick={() => setOpen(true)}
        style={{
          position: 'fixed', bottom: 32, right: 32, zIndex: 9000,
          width: 56, height: 56, borderRadius: '50%',
          background: 'linear-gradient(135deg, #6366f1 0%, #8b5cf6 100%)',
          border: 'none', cursor: 'pointer',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          boxShadow: '0 0 0 0 rgba(99,102,241,0.4), 0 8px 32px rgba(99,102,241,0.5)',
          animation: 'pulse-ring 2.5s ease-in-out infinite',
          transition: 'transform 0.2s ease, box-shadow 0.2s ease',
        }}
        onMouseEnter={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1.1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 rgba(99,102,241,0.4), 0 12px 40px rgba(99,102,241,0.7)';
        }}
        onMouseLeave={e => {
          (e.currentTarget as HTMLButtonElement).style.transform = 'scale(1)';
          (e.currentTarget as HTMLButtonElement).style.boxShadow = '0 0 0 0 rgba(99,102,241,0.4), 0 8px 32px rgba(99,102,241,0.5)';
        }}
      >
        <Plus size={24} color="#fff" />
      </button> */}

      <style>{`
        @keyframes pulse-ring {
          0%   { box-shadow: 0 0 0 0 rgba(99,102,241,0.5), 0 8px 32px rgba(99,102,241,0.4); }
          70%  { box-shadow: 0 0 0 14px rgba(99,102,241,0), 0 8px 32px rgba(99,102,241,0.4); }
          100% { box-shadow: 0 0 0 0 rgba(99,102,241,0), 0 8px 32px rgba(99,102,241,0.4); }
        }
      `}</style>

      {/* Modal Overlay */}
      {open && (
        <div
          onClick={e => { if (e.target === e.currentTarget) closeModal(); }}
          style={{
            position: 'fixed', inset: 0, zIndex: 9999,
            background: 'rgba(0,0,0,0.7)',
            backdropFilter: 'blur(8px)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            padding: 24,
          }}
        >
          <div style={{
            width: '100%', maxWidth: 460,
            background: 'linear-gradient(135deg, rgba(20,10,40,0.85) 0%, rgba(5,4,15,0.9) 100%)',
            border: '1px solid rgba(136, 170, 255, 0.4)',
            borderRadius: 20,
            backdropFilter: 'blur(16px)',
            boxShadow: '0 0 25px rgba(136, 170, 255, 0.3), inset 0 0 15px rgba(255, 170, 255, 0.1)',
            overflow: 'hidden',
            fontFamily: 'Inter, system-ui, sans-serif',
          }}>
            {/* Modal Header */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: 12, padding: '18px 22px',
              borderBottom: '1px solid rgba(136, 170, 255, 0.2)',
              background: 'rgba(136, 170, 255, 0.05)',
            }}>
              <div style={{ flex: 1, fontSize: 15, fontWeight: 700, color: '#e2e8f0' }}>{getTitle()}</div>
              <button onClick={closeModal} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#475569', padding: 4, display: 'flex' }}>
                <X size={18} />
              </button>
            </div>

            {/* Modal Body */}
            <div style={{ padding: '20px 22px' }}>
              {renderView()}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
