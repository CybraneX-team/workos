import { useEffect, useCallback, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { PlasmaSphere } from '../PolytopeShared';
import { X, ChevronRight, Zap, Briefcase, Activity, Bookmark, BookmarkCheck, ExternalLink, Users, UserPlus, Radio, GitBranch, BarChart3, HelpCircle, CheckCircle2, CircleX, Database, FolderPlus, LoaderCircle, RefreshCw, Settings2 } from 'lucide-react';
import type { UInternalNode, UExternalNode } from '../../lib/usePolytopeStore';
import { U_DOMAIN_COLOR } from '../../lib/usePolytopeStore';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';
import type { UserPlanetRole } from '../../data/companyPlanetRoots';
import { BdtTypePanel } from './bdtWorkspacePanels';
import { filterReadableDepartments } from '../../lib/bdtTrailRbac';
import type { BdtWorkflowTrailSession } from '../../lib/useWorkflowTrail';
import WorkflowTrailRibbon from './WorkflowTrailRibbon';
import { useAuth } from '../../lib/auth';
import { useCanonicalMetrics, isMetricAdmin } from '../../lib/db/canonicalMetrics';
import { useTeamMembers } from '../../lib/db/team';
import { useProjectsStore } from '../../lib/useProjectsStore';
import { api } from '../../lib/api';
import { fetchConnections } from '../../lib/integrations/service';
import {
  fetchErpNextOperationsSnapshot,
  fetchErpNextOperationsMetrics,
  bootstrapErpNextOperationsMetrics,
  refreshErpNextOperationsMetrics,
  configureErpNextOperationsMetric,
  type ErpNextOperationsSnapshot,
  type ErpNextOperationsMetricKey,
  type ErpNextOperationsSeverity,
} from '../../lib/db/erpnextSupplyChain';
import type { CanonicalMetric } from '@cybranex/metrics';
import {
  fetchErpNextSalesFocusSummary,
  type ErpNextSalesNodeSummary,
} from '../../lib/db/erpnextSales';
import { fetchErpNextCatalogReadiness, fetchErpNextProductPortfolio, type ErpNextCatalogPortfolio, type ErpNextCatalogReadiness } from '../../lib/db/erpnextProducts';
import { MetaAdsOperatingHub } from './panels/MetaAdsOperatingHub';
import { GlassCard, SectionTitle } from './panels/PanelShell';
import {
  EmptyMetricsState,
  MetricCard,
  MetricCreateWizard,
} from './metrics/MetricSystem';

export interface BdtActionWorkspaceProps {
  node: UInternalNode;
  department: UExternalNode;
  allDepartments: UExternalNode[];
  onClose: () => void;
  onDepartmentClick: (deptId: string) => void;
  isOpen?: boolean;
  containerMode?: 'meta-paid-acquisition';
  canEdit?: boolean;

  // BDT workflow trails props
  onInterrelatedDepartmentClick?: (deptId: string) => void;
  trailSession?: BdtWorkflowTrailSession | null;
  isTrailActive?: boolean;
  isReplayMode?: boolean;
  canReadDept?: (dept: UExternalNode) => boolean;
  onSaveTrail?: (title?: string, note?: string) => void;
  onCancelTrail?: () => void;
  onUndoTrailHop?: () => void;
  replayStepIndex?: number;
  onReplayNext?: () => void;
  onReplayPrev?: () => void;
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function parseApiErrorMessage(err: unknown): string {
  if (!(err instanceof Error)) return 'WorkOS Operations data could not be loaded.';
  const bodyText = err.message.replace(/^\d+:\s*/, '');
  try {
    const parsed = JSON.parse(bodyText) as { message?: string; error?: string };
    return parsed.message || parsed.error || err.message;
  } catch {
    return err.message;
  }
}

function opsToneClass(tone?: 'good' | 'neutral' | 'warning' | 'critical') {
  if (tone === 'good') return 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100';
  if (tone === 'warning') return 'border-amber-300/20 bg-amber-300/10 text-amber-100';
  if (tone === 'critical') return 'border-rose-300/25 bg-rose-400/10 text-rose-100';
  return 'border-white/10 bg-black/20 text-white/80';
}

interface SummaryMetricCard {
  id: string;
  label: string;
  value: number | string;
  unit?: string;
  description: string;
  tone: 'good' | 'neutral' | 'warning' | 'critical';
}

function OperationsMetricCard({ metric }: { metric: SummaryMetricCard }) {
  return (
    <div className={`rounded-xl border p-3 ${opsToneClass(metric.tone)}`}>
      <p className="text-[10px] uppercase tracking-[0.16em] opacity-55">{metric.label}</p>
      <p className="mt-1 text-2xl font-semibold text-white">
        {metric.value}
        {metric.unit && <span className="ml-1 text-sm text-white/45">{metric.unit}</span>}
      </p>
      <p className="mt-1 text-[10px] leading-relaxed text-white/45">{metric.description}</p>
    </div>
  );
}

interface SummaryBreakdown {
  id: string;
  title: string;
  items: Array<{ label: string; value: number | string; unit?: string; tone?: 'good' | 'neutral' | 'warning' | 'critical' }>;
}

function OperationsBreakdown({ breakdown }: { breakdown: SummaryBreakdown }) {
  const max = Math.max(1, ...breakdown.items.map(item => Number(item.value) || 0));
  return (
    <div className="rounded-xl border border-white/10 bg-black/20 p-3">
      <p className="text-xs font-semibold text-white/75 mb-3">{breakdown.title}</p>
      <div className="space-y-2">
        {breakdown.items.slice(0, 8).map(item => {
          const numericValue = Number(item.value) || 0;
          return (
            <div key={`${breakdown.id}:${item.label}`}>
              <div className="flex items-center justify-between gap-3 text-[10px] text-white/45">
                <span className="truncate">{item.label}</span>
                <span className="text-white/65">{item.value}{item.unit ?? ''}</span>
              </div>
              <div className="mt-1 h-1.5 rounded-full bg-white/5 overflow-hidden">
                <div
                  className={item.tone === 'warning' || item.tone === 'critical' ? 'h-full rounded-full bg-amber-300/70' : 'h-full rounded-full bg-cyan-300/70'}
                  style={{ width: `${Math.max(6, Math.round((numericValue / max) * 100))}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

interface SummaryInsight { id: string; label: string; detail: string; severity: 'info' | 'warning' | 'critical' }

function OperationsInsightList({ insights }: { insights: SummaryInsight[] }) {
  if (insights.length === 0) return null;
  return (
    <div className="space-y-2">
      {insights.slice(0, 4).map(insight => (
        <div key={insight.id} className={`rounded-lg border px-3 py-2 ${opsToneClass(insight.severity === 'info' ? 'neutral' : insight.severity)}`}>
          <p className="text-xs font-semibold text-white/85">{insight.label}</p>
          <p className="mt-0.5 text-[10px] leading-relaxed text-white/50">{insight.detail}</p>
        </div>
      ))}
    </div>
  );
}

// Widened templateKey (string, not the Operations-specific union) so Sales/Products
// childRollups — structurally identical otherwise — can reuse this renderer too; templateKey
// itself is never read below.
interface GenericChildRollup {
  nodeId: string;
  nodeLabel: string;
  mappingLabel: string;
  status: string;
  templateKey: string;
  healthScore: number | null;
  headline: string;
}

function OperationsChildRollups({ children }: { children: GenericChildRollup[] }) {
  if (children.length === 0) return null;
  return (
    <div className="grid grid-cols-1 xl:grid-cols-2 gap-2">
      {children.slice(0, 12).map(child => (
        <div key={child.nodeId} className="rounded-lg border border-white/10 bg-black/20 p-3">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-xs font-semibold text-white/80 truncate">{child.nodeLabel}</p>
              <p className="text-[10px] text-white/35">{child.mappingLabel} · {child.status.replace('_', ' ')}</p>
            </div>
            <p className="text-sm font-semibold text-white/80">{child.healthScore ?? 'n/a'}</p>
          </div>
          <p className="mt-2 text-[10px] leading-relaxed text-white/45 line-clamp-2">{child.headline}</p>
        </div>
      ))}
    </div>
  );
}

function severityClass(severity: ErpNextOperationsSeverity) {
  if (severity === 'critical') return 'border-rose-300/25 bg-rose-400/10';
  if (severity === 'warning') return 'border-amber-300/25 bg-amber-300/10';
  return 'border-cyan-300/20 bg-cyan-300/[0.07]';
}

function OperationsControlTower({ snapshot, loading, error, onRefresh, onCreateProject }: {
  snapshot: ErpNextOperationsSnapshot | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
  onCreateProject: (title: string, detail?: string) => void;
}) {
  const [created, setCreated] = useState<string | null>(null);
  const createFromException = (label: string, detail?: string) => {
    onCreateProject(label, detail);
    setCreated(label);
  };
  return <GlassCard>
    <div className="flex items-start justify-between gap-4 mb-4">
      <div>
        <SectionTitle icon={Activity}>OPERATIONS CONTROL TOWER</SectionTitle>
        <p className="-mt-2 text-xs text-white/40">ERPNext evidence, queues, and exceptions. WorkOS is read-only.</p>
      </div>
      <button type="button" onClick={onRefresh} disabled={loading} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50">
        <RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />{loading ? 'Refreshing' : 'Refresh'}
      </button>
    </div>
    {error && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/80">{error}</div>}
    {!error && !snapshot && <p className="text-sm text-white/45">Loading ERPNext Operations evidence…</p>}
    {created && <p className="mb-3 rounded-lg border border-emerald-300/20 bg-emerald-300/10 px-3 py-2 text-xs text-emerald-100">Created local project: {created}. Saved on this device.</p>}
    {snapshot && <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[10px] text-white/35">
        <span>{snapshot.siteName ? `Site: ${snapshot.siteName}` : 'ERPNext connected'}</span><span>•</span><span>Checked just now</span>
        {snapshot.status === 'partial' && <><span>•</span><span className="text-amber-200/80">Some evidence is partial</span></>}
      </div>
      {snapshot.message && <p className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 text-xs text-white/55">{snapshot.message}</p>}
      {snapshot.warnings.length > 0 && <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3"><p className="text-xs font-semibold text-amber-100/85">Partial data warnings</p>{snapshot.warnings.map(warning => <p key={warning} className="mt-1 text-[11px] text-amber-100/65">{warning}</p>)}</div>}
      {snapshot.groups.map(group => <section key={group.key} className="rounded-2xl border border-white/10 bg-black/20 p-4">
        <div className="flex items-center justify-between gap-3"><h3 className="text-sm font-semibold text-white/90">{group.label}</h3><span className={`rounded-full px-2 py-0.5 text-[10px] ${group.status === 'partial' ? 'bg-amber-300/10 text-amber-100/75' : 'bg-emerald-300/10 text-emerald-100/75'}`}>{group.status === 'partial' ? 'Partial' : 'Available'}</span></div>
        {group.queues.length > 0 && <div className="mt-3 grid grid-cols-1 gap-2 sm:grid-cols-2">{group.queues.map(queue => <a key={queue.id} href={queue.href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.07]"><div className="flex items-start justify-between gap-2"><p className="text-xs font-semibold text-white/80">{queue.label}</p><p className="text-lg font-semibold text-white">{queue.value}</p></div><p className="mt-1 text-[10px] text-white/35">{queue.sourceDoctype} <ExternalLink className="ml-1 inline h-2.5 w-2.5" /></p></a>)}</div>}
        {group.exceptions.length > 0 && <div className="mt-3 space-y-2">{group.exceptions.map(item => <div key={item.id} className={`rounded-xl border p-3 ${severityClass(item.severity)}`}><div className="flex items-start justify-between gap-3"><div><p className="text-xs font-semibold text-white/85">{item.label}</p>{item.detail && <p className="mt-1 text-[11px] leading-relaxed text-white/55">{item.detail}</p>}<p className="mt-1 text-[10px] text-white/35">{item.sourceDoctype}{item.status ? ` · ${item.status}` : ''}</p></div><div className="flex shrink-0 gap-2">{item.href && <a href={item.href} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/75 hover:bg-white/10">Open <ExternalLink className="ml-1 inline h-2.5 w-2.5" /></a>}<button type="button" onClick={() => createFromException(item.label, item.detail)} className="rounded-md border border-white/15 px-2 py-1 text-[10px] text-white/75 hover:bg-white/10"><FolderPlus className="mr-1 inline h-2.5 w-2.5" />Project</button></div></div></div>)}</div>}
        {group.evidence.length > 0 && <div className="mt-3 border-t border-white/10 pt-3"><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">Recent evidence</p><div className="flex flex-wrap gap-2">{group.evidence.map(item => item.href ? <a key={item.id} href={item.href} target="_blank" rel="noopener noreferrer" className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/60 hover:bg-white/5">{item.label} <ExternalLink className="ml-1 inline h-2.5 w-2.5" /></a> : <span key={item.id} className="rounded-md border border-white/10 px-2 py-1 text-[10px] text-white/50">{item.label}</span>)}</div></div>}
        {group.recommendations.length > 0 && <div className="mt-3 border-t border-white/10 pt-3">{group.recommendations.map(item => <div key={item.id} className="mb-2 last:mb-0"><p className="text-xs font-medium text-white/75">{item.label}</p><p className="text-[11px] text-white/45">{item.reason}</p></div>)}</div>}
        {group.actions.length > 0 && <div className="mt-3 flex flex-wrap gap-2">{group.actions.map(action => <a key={action.id} href={action.href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-cyan-300/25 bg-cyan-300/10 px-2.5 py-1.5 text-[10px] font-semibold text-cyan-100/85 hover:bg-cyan-300/15">{action.label} <ExternalLink className="ml-1 inline h-3 w-3" /></a>)}</div>}
      </section>)}
    </div>}
  </GlassCard>;
}

interface ErpNextTenantStatus {
  status?: 'ready' | 'provisioning' | 'failed' | 'not_configured' | string;
  siteName?: string;
  deskUrl?: string;
  provisioningStage?: string;
  error?: { message?: string } | string;
}

const OPERATIONS_DESK_AREAS = [
  { label: 'Procurement', doctypes: 'Material Request · Purchase Order · Purchase Receipt', route: 'material-request' },
  { label: 'Inventory', doctypes: 'Item · Bin · Stock Entry', route: 'item' },
  { label: 'Warehouse', doctypes: 'Warehouse · Stock Reconciliation · Stock Reservation', route: 'warehouse' },
  { label: 'Fulfilment', doctypes: 'Pick List · Delivery Note', route: 'pick-list' },
  { label: 'Logistics', doctypes: 'Shipment · Delivery Trip', route: 'shipment' },
  { label: 'Production', doctypes: 'Work Order · Job Card · BOM', route: 'work-order' },
  { label: 'Assets & maintenance', doctypes: 'Asset · Maintenance Schedule · Maintenance Visit', route: 'asset' },
  { label: 'Service & quality', doctypes: 'Issue · Quality Inspection', route: 'quality-inspection' },
];

function erpNextDeskAreaUrl(deskUrl: string | undefined, route: string): string | null {
  if (!deskUrl) return null;
  try {
    const url = new URL(deskUrl);
    if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
    url.pathname = `/app/${route}`;
    url.search = '';
    url.hash = '';
    return url.toString();
  } catch {
    return null;
  }
}

function OperationsSystemsPanel({ status, loading, onRefresh }: { status: ErpNextTenantStatus | null; loading: boolean; onRefresh: () => void }) {
  const ready = status?.status === 'ready' && Boolean(status.deskUrl);
  const provisioning = status?.status === 'provisioning';
  const failure = status?.status === 'failed';
  const errorMessage = typeof status?.error === 'string' ? status.error : status?.error?.message;
  return <GlassCard>
    <div className="flex items-start justify-between gap-4"><div><SectionTitle icon={Database}>ERPNext OPERATIONS</SectionTitle><p className="-mt-2 text-sm text-white/50">The system of record for operational work. WorkOS opens it in read-only context.</p></div><button type="button" onClick={onRefresh} disabled={loading} className="inline-flex shrink-0 items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${loading ? 'animate-spin' : ''}`} />Refresh</button></div>
    {!status && <div className="mt-4 flex items-center gap-2 text-sm text-white/45"><LoaderCircle className="h-4 w-4 animate-spin" />Checking ERPNext…</div>}
    {status && <div className="mt-4 space-y-4">
      <div className={`rounded-xl border p-4 ${ready ? 'border-emerald-300/20 bg-emerald-300/10' : failure ? 'border-rose-300/20 bg-rose-400/10' : 'border-amber-300/20 bg-amber-300/10'}`}>
        <div className="flex items-start justify-between gap-3"><div className="flex gap-2"><span className="mt-0.5">{ready ? <CheckCircle2 className="h-4 w-4 text-emerald-200" /> : failure ? <CircleX className="h-4 w-4 text-rose-200" /> : <LoaderCircle className="h-4 w-4 animate-spin text-amber-100" />}</span><div><p className="text-sm font-semibold text-white/90">{ready ? 'ERPNext is ready' : provisioning ? 'ERPNext is provisioning' : failure ? 'ERPNext needs attention' : 'ERPNext is not configured'}</p><p className="mt-1 text-xs text-white/55">{ready ? `Checked now${status.siteName ? ` · ${status.siteName}` : ''}` : errorMessage || (provisioning ? `Current stage: ${status.provisioningStage || 'preparing your site'}. This page checks again automatically.` : 'Connect and configure ERPNext in Settings to use Operations evidence.')}</p></div></div>{ready && <a href={status.deskUrl} target="_blank" rel="noopener noreferrer" className="shrink-0 rounded-lg border border-emerald-200/20 px-3 py-2 text-xs font-semibold text-emerald-100 hover:bg-emerald-200/10">Open ERPNext <ExternalLink className="ml-1 inline h-3 w-3" /></a>}</div>
        {!ready && <button type="button" onClick={() => window.location.assign('/twin/data?tab=integrations')} className="mt-3 inline-flex items-center gap-2 rounded-lg border border-white/15 px-3 py-2 text-xs font-semibold text-white/75 hover:bg-white/10"><Settings2 className="h-3.5 w-3.5" />Open integration settings</button>}
      </div>
      <div><p className="mb-2 text-[10px] font-semibold uppercase tracking-[0.16em] text-white/35">ERPNext areas</p><div className="grid grid-cols-1 gap-2 md:grid-cols-2">{OPERATIONS_DESK_AREAS.map(area => {
        const href = ready ? erpNextDeskAreaUrl(status.deskUrl, area.route) : null;
        const content = <><p className="text-xs font-semibold text-white/75">{area.label}{href && <ExternalLink className="ml-1 inline h-3 w-3" />}</p><p className="mt-1 text-[10px] leading-relaxed text-white/35">{area.doctypes}</p></>;
        return href ? <a key={area.label} href={href} target="_blank" rel="noopener noreferrer" className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2 transition hover:bg-white/[0.08]">{content}</a> : <div key={area.label} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2">{content}</div>;
      })}</div></div>
    </div>}
  </GlassCard>;
}

const OPERATIONS_METRIC_KEYS: Record<string, ErpNextOperationsMetricKey> = {
  'Open material requests': 'open_material_requests',
  'Open purchase orders': 'open_purchase_orders',
  'Low-stock positions': 'low_stock_positions',
  'Open work orders': 'open_work_orders',
  'Work-order completion': 'work_order_completion_percent',
  'Failed or rejected quality checks': 'failed_quality_checks',
};

function metricKeyFor(metric: CanonicalMetric): ErpNextOperationsMetricKey | null {
  const directKey = metric.sources.find(source => source.source_type === 'integration')?.config?.metricKey;
  if (typeof directKey === 'string' && Object.values(OPERATIONS_METRIC_KEYS).includes(directKey as ErpNextOperationsMetricKey)) return directKey as ErpNextOperationsMetricKey;
  return OPERATIONS_METRIC_KEYS[metric.name] ?? null;
}

function OperationsMetricsPanel({ companyId, members, canEdit }: { companyId: string; members: Array<{ id: string; first_name?: string | null; last_name?: string | null; role_name?: string | null }>; canEdit: boolean }) {
  const [metrics, setMetrics] = useState<CanonicalMetric[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [bootstrapping, setBootstrapping] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<ErpNextOperationsMetricKey | null>(null);
  const [target, setTarget] = useState('');
  const [lowStockThreshold, setLowStockThreshold] = useState('');
  const [ownerMemberId, setOwnerMemberId] = useState('');
  const [saving, setSaving] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try { setMetrics(await fetchErpNextOperationsMetrics(companyId)); setError(null); }
    catch (cause) { setError(parseApiErrorMessage(cause)); }
    finally { setLoading(false); }
  }, [companyId]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const refresh = async () => {
    setRefreshing(true);
    try { setMetrics(await refreshErpNextOperationsMetrics(companyId)); setError(null); }
    catch (cause) { setError(parseApiErrorMessage(cause)); }
    finally { setRefreshing(false); }
  };
  const bootstrap = async () => {
    setBootstrapping(true);
    try { setMetrics(await bootstrapErpNextOperationsMetrics(companyId)); setError(null); }
    catch (cause) { setError(parseApiErrorMessage(cause)); }
    finally { setBootstrapping(false); }
  };
  const startConfig = (metric: CanonicalMetric) => {
    const key = metricKeyFor(metric);
    if (!key) return;
    setEditing(key); setTarget(metric.target_value ? String(metric.target_value) : ''); setLowStockThreshold(''); setOwnerMemberId(metric.owner_member_id || members[0]?.id || '');
  };
  const saveConfig = async (metric: CanonicalMetric) => {
    const key = metricKeyFor(metric);
    const targetNumber = Number(target);
    const lowStockNumber = Number(lowStockThreshold);
    if (!key || !Number.isFinite(targetNumber) || !ownerMemberId || (key === 'low_stock_positions' && (!Number.isFinite(lowStockNumber) || lowStockNumber < 0))) return;
    setSaving(true);
    try {
      const updated = await configureErpNextOperationsMetric(companyId, key, { target: targetNumber, ownerMemberId, ...(key === 'low_stock_positions' ? { lowStockThreshold: lowStockNumber } : {}) });
      setMetrics(updated); setEditing(null); setError(null);
    } catch (cause) { setError(parseApiErrorMessage(cause)); }
    finally { setSaving(false); }
  };
  return <GlassCard>
    <div className="flex items-start justify-between gap-4"><div><SectionTitle icon={BarChart3}>OPERATIONS METRICS</SectionTitle><p className="-mt-2 text-sm text-white/50">ERPNext values are shown as evidence. Configure a target before a KPI contributes to a score.</p></div><div className="flex shrink-0 gap-2">{metrics.length === 0 && canEdit && <button type="button" onClick={() => void bootstrap()} disabled={bootstrapping || loading} className="rounded-lg border border-cyan-300/20 bg-cyan-300/10 px-3 py-2 text-xs font-semibold text-cyan-100 disabled:opacity-50">{bootstrapping ? 'Creating…' : 'Add starter KPIs'}</button>}<button type="button" onClick={() => void refresh()} disabled={refreshing || loading || metrics.length === 0} className="inline-flex items-center gap-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/75 hover:bg-white/5 disabled:opacity-50"><RefreshCw className={`h-3.5 w-3.5 ${refreshing ? 'animate-spin' : ''}`} />{refreshing ? 'Refreshing' : 'Refresh values'}</button></div></div>
    {error && <div className="mt-4 rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/80">{error}</div>}
    {loading && <p className="mt-4 text-sm text-white/45">Loading ERPNext metrics…</p>}
    {!loading && !error && metrics.length === 0 && <p className="mt-4 text-sm text-white/45">No ERPNext Operations metrics are available yet.{canEdit ? ' Add the six starter KPIs to begin.' : ''}</p>}
    {!loading && metrics.length > 0 && <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">{metrics.map(metric => {
      const key = metricKeyFor(metric);
      const integrationSource = metric.sources.find(source => source.source_type === 'integration') as (typeof metric.sources[number] & { status?: 'needs_configuration' | 'active' }) | undefined;
      const configured = integrationSource?.status === 'active';
      const isEditing = key === editing;
      return <div key={metric.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4"><div className="flex items-start justify-between gap-3"><div><p className="text-sm font-semibold text-white/90">{metric.name}</p><p className="mt-1 text-2xl font-semibold text-white">{metric.current_value ?? '—'} <span className="text-xs font-normal text-white/45">{metric.unit}</span></p></div><span className={`rounded-full px-2 py-1 text-[10px] ${configured ? 'bg-emerald-300/10 text-emerald-100/80' : 'bg-amber-300/10 text-amber-100/80'}`}>{configured ? 'Configured' : 'Needs target'}</span></div><p className="mt-2 text-[11px] leading-relaxed text-white/45">{metric.description}</p>{isEditing ? <div className="mt-3 space-y-2 border-t border-white/10 pt-3"><label className="block text-[10px] uppercase tracking-wide text-white/40">Target<input value={target} onChange={event => setTarget(event.target.value)} type="number" className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white" /></label>{key === 'low_stock_positions' && <label className="block text-[10px] uppercase tracking-wide text-white/40">Low-stock threshold<input value={lowStockThreshold} onChange={event => setLowStockThreshold(event.target.value)} type="number" min="1" className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white" /></label>}<label className="block text-[10px] uppercase tracking-wide text-white/40">Owner<select value={ownerMemberId} onChange={event => setOwnerMemberId(event.target.value)} className="mt-1 block w-full rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-white">{members.map(member => <option key={member.id} value={member.id}>{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.role_name || 'Teammate'}</option>)}</select></label><div className="flex gap-2"><button type="button" disabled={saving} onClick={() => void saveConfig(metric)} className="rounded-lg bg-emerald-300/15 px-3 py-1.5 text-xs font-semibold text-emerald-100 disabled:opacity-50">{saving ? 'Saving' : 'Save target'}</button><button type="button" onClick={() => setEditing(null)} className="rounded-lg border border-white/10 px-3 py-1.5 text-xs text-white/60">Cancel</button></div></div> : <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3"><p className="text-[10px] text-white/35">{configured ? `Target: ${metric.target_value}` : 'Raw ERPNext value only; no score yet.'}</p>{canEdit && key && <button type="button" onClick={() => startConfig(metric)} className="rounded-lg border border-white/15 px-2.5 py-1.5 text-[10px] font-semibold text-white/75 hover:bg-white/10">{configured ? 'Edit target' : 'Configure'}</button>}</div>}</div>;
    })}</div>}
  </GlassCard>;
}

// Sales/Products panels share the exact same NodeSummaryResult shape and sub-renderers as
// Operations (OperationsMetricCard/OperationsBreakdown/OperationsInsightList/
// OperationsChildRollups/OperationsEvidenceDrawer are structurally generic — reused as-is).
function SalesErpNextPanel({ summary, loading, error, onRefresh }: {
  summary: ErpNextSalesNodeSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <SectionTitle icon={Activity}>WORKOS SALES</SectionTitle>
          {summary && (
            <div className="text-[10px] text-white/30 -mt-2 space-y-0.5">
              <p>{summary.mappingLabel} · {summary.status.replace('_', ' ')}</p>
              {summary.siteName && <p>Site: {summary.siteName}</p>}
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/80">
          {error}
        </div>
      )}

      {!error && !summary && (
        <p className="text-sm text-white/45">Loading WorkOS Sales data...</p>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#111]/70 p-3">
            <p className="text-xs font-semibold text-white/75">{summary.path.join(' / ')}</p>
            <p className="text-[10px] text-white/35 mt-1">{summary.sourceDoctypes.length ? summary.sourceDoctypes.join(', ') : 'No WorkOS source doctypes mapped.'}</p>
            {summary.erpnextActions && summary.erpnextActions.length > 0 && (
              <div className="mt-3 flex flex-wrap gap-2">
                {summary.erpnextActions.map(action => (
                  <a
                    key={action.id}
                    href={action.href}
                    target="_blank"
                    rel="noreferrer"
                    className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[10px] font-semibold transition ${
                      action.kind === 'new'
                        ? 'border-cyan-300/25 bg-cyan-300/10 text-cyan-100/85 hover:bg-cyan-300/15'
                        : 'border-white/10 bg-white/5 text-white/65 hover:bg-white/10 hover:text-white/80'
                    }`}
                    title={`${action.doctype} in WorkOS`}
                  >
                    {action.label}
                    <ExternalLink className="h-3 w-3" />
                  </a>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-cyan-300/15 bg-gradient-to-br from-cyan-300/10 via-white/[0.03] to-black/20 p-4">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-[10px] uppercase tracking-[0.18em] text-cyan-100/45">Metric story</p>
                <p className="mt-2 text-lg font-semibold text-white">{summary.headline}</p>
                <p className="mt-1 text-[10px] text-white/35">
                  {summary.templateKey.replace(/_/g, ' ')} · generated {new Date(summary.generatedAt).toLocaleString()}
                </p>
              </div>
              <div className="shrink-0 text-right">
                <p className="text-[10px] uppercase tracking-[0.14em] text-white/35">Health</p>
                <p className="text-3xl font-semibold text-white">{summary.healthScore ?? 'n/a'}</p>
              </div>
            </div>
          </div>

          {summary.unsupportedReason && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold text-white/70 mb-1">Not connected yet</p>
              <p className="text-xs text-white/45">{summary.unsupportedReason}</p>
            </div>
          )}

          {summary.warnings.length > 0 && (
            <div className="rounded-xl border border-white/10 bg-white/5 p-3">
              <p className="text-xs font-semibold text-white/70 mb-1">Partial data warnings</p>
              {summary.warnings.slice(0, 3).map(warning => (
                <p key={warning} className="text-[10px] text-white/40">{warning}</p>
              ))}
            </div>
          )}

          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {summary.metricCards.map(metric => <OperationsMetricCard key={metric.id} metric={metric} />)}
          </div>

          {summary.childRollups && <OperationsChildRollups children={summary.childRollups} />}

          {summary.breakdowns.length > 0 && (
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
              {summary.breakdowns.map(breakdown => <OperationsBreakdown key={breakdown.id} breakdown={breakdown} />)}
            </div>
          )}

          <OperationsInsightList insights={summary.insights} />
        </div>
      )}
    </GlassCard>
  );
}

function ProductsErpNextPanel({ summary, loading, error, onRefresh }: {
  summary: ErpNextCatalogReadiness | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <SectionTitle icon={Activity}>CATALOG READINESS</SectionTitle>
          {summary && (
            <div className="text-[10px] text-white/30 -mt-2 space-y-0.5">
              <p>{summary.label} · {summary.status.replace('_', ' ')}</p>
            </div>
          )}
        </div>
        <button
          type="button"
          onClick={onRefresh}
          disabled={loading}
          className="px-3 py-1.5 rounded-lg border border-white/10 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
        >
          {loading ? 'Loading' : 'Refresh'}
        </button>
      </div>

      {error && (
        <div className="rounded-xl border border-amber-300/20 bg-amber-300/10 p-3 text-sm text-amber-100/80">
          {error}
        </div>
      )}

      {!error && !summary && (
            <p className="text-sm text-white/45">Loading ERPNext catalog readiness...</p>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-3">
            {summary.metrics.map(metric => <OperationsMetricCard key={metric.label} metric={{ id: metric.label, label: metric.label, value: metric.value, description: 'ERPNext catalog readiness', tone: 'neutral' }} />)}
          </div>
          <div className="rounded-xl border border-white/10 bg-white/5 p-3 space-y-2">
          {summary.signals.length ? summary.signals.map(signal => <div key={signal.label}><p className="text-xs font-semibold text-white/75">{signal.label}</p><p className="text-xs text-white/45">{signal.detail}</p></div>) : <p className="text-sm text-white/45">Catalog readiness has no warnings.</p>}
          </div>
        </div>
      )}
    </GlassCard>
  );
}

function ProductPortfolioFocus({ onExplore }: { onExplore: () => void }) {
  const [portfolio, setPortfolio] = useState<ErpNextCatalogPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const load = useCallback(() => {
    setLoading(true);
    return fetchErpNextProductPortfolio().then((value) => { setPortfolio(value); setError(null); }).catch((cause) => {
      setPortfolio(null); setError(parseApiErrorMessage(cause));
    }).finally(() => setLoading(false));
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  const productCount = portfolio?.lines.reduce((total, line) => total + line.products.length, 0) ?? 0;
  return <GlassCard>
    <div className="flex items-start justify-between gap-4"><div><SectionTitle icon={Briefcase}>PRODUCT PORTFOLIO</SectionTitle><p className="text-sm text-white/50">Live ERPNext Item Groups and Items. Catalogue entities are read-only in WorkOS.</p></div><button type="button" onClick={() => void load()} className="rounded-lg border border-white/15 px-3 py-2 text-xs text-white/70">Refresh</button></div>
    {loading && <p className="mt-4 text-sm text-white/40">Loading ERPNext catalogue…</p>}
    {error && <p className="mt-4 rounded-lg border border-rose-300/20 bg-rose-400/10 p-3 text-sm text-rose-100">{error}</p>}
    {portfolio && <><div className="mt-4 grid grid-cols-2 gap-3"><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-wider text-white/35">Product lines</p><p className="mt-1 text-2xl font-semibold">{portfolio.lines.length}</p></div><div className="rounded-xl border border-white/10 bg-white/[0.03] p-3"><p className="text-[10px] uppercase tracking-wider text-white/35">Products</p><p className="mt-1 text-2xl font-semibold">{productCount}</p></div></div><p className="mt-4 text-xs text-white/45">{portfolio.message || portfolio.warnings[0] || 'Select Explore product lines to inspect the live catalogue in the graph.'}</p><button type="button" onClick={onExplore} className="mt-4 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white">Explore product lines</button></>}
  </GlassCard>;
}

export function BdtActionWorkspace({
  node,
  department,
  allDepartments,
  onClose,
  onDepartmentClick,
  isOpen = true,
  containerMode,
  canEdit = false,
  onInterrelatedDepartmentClick,
  trailSession = null,
  isTrailActive = false,
  isReplayMode = false,
  onSaveTrail,
  onCancelTrail,
  onUndoTrailHop,
  replayStepIndex = 0,
  onReplayNext,
  onReplayPrev,
}: BdtActionWorkspaceProps) {
  const primaryColor = U_DOMAIN_COLOR[department.domain] || '#8b5cf6';
  const { profile, role, user } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEditMetrics = isMetricAdmin(role);
  const isMetaContainerMode = containerMode === 'meta-paid-acquisition';
  const isPersistedBdtNode = UUID_RE.test(node.id);
  const metricTarget = node.workspaceKind === 'metrics'
    ? { target_type: 'department' as const, target_id: department.id }
    : { target_type: 'bdt_node' as const, target_id: node.id };
  const { metrics: nodeMetrics, createMetric, createDraft, updateMetricValue } = useCanonicalMetrics(
    isPersistedBdtNode ? companyId : null,
    { ...metricTarget, status: 'active' },
  );
  const { members: workspaceMembers, refetch: refetchTeamMembers } = useTeamMembers(companyId);
  const projectStore = useProjectsStore({ companyId, userId: user?.id, departmentSourceKey: department.sourceKey });
  const [showMetricWizard, setShowMetricWizard] = useState(false);
  const [newProjectName, setNewProjectName] = useState('');
  const isTeamNode = node.workspaceKind === 'team' || node.type === 'team';
  const isSystemsNode = node.workspaceKind === 'systems';
  const isMetricsNode = node.workspaceKind === 'metrics';
  const isProjectNode = node.workspaceKind === 'projects';
  const isFocusNode = node.workspaceKind === 'focus';
  const isProductPortfolioFocus = isFocusNode && (node.stableSourceKey === 'prod_product_portfolio' || node.presentation === 'erpnext_catalog');
  const teamMembers = isTeamNode
    ? workspaceMembers.filter(member => member.department_id === department.id)
    : (node.members ?? []);
  const teamMemberCount = teamMembers.length;
  const memberName = (member: typeof teamMembers[number]) => ('name' in member
    ? member.name
    : [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Team member');
  const departmentProjects = projectStore.projects.filter(project => project.departmentSourceKey === department.sourceKey);
  const providerLabels: Record<string, string> = {
    erpnext_products: 'ERPNext Product Catalogue',
    erpnext_sales: 'ERPNext Sales / CRM',
    erpnext_operations: 'ERPNext Operations',
    meta_ads: 'Meta Ads',
  };
  const providerCapabilities = useMemo(() => node.providerCapabilities ?? [], [node.providerCapabilities]);
  const [systemStatus, setSystemStatus] = useState<Record<string, string>>({});
  const [erpNextStatus, setErpNextStatus] = useState<ErpNextTenantStatus | null>(null);
  const [erpNextStatusLoading, setErpNextStatusLoading] = useState(false);
  const isOperationsDepartment = department.sourceKey === 'dept_operations' || department.id === 'dept_operations' || department.label === 'Operations';
  const isOperationsSystem = isOperationsDepartment && isSystemsNode;
  const loadErpNextStatus = useCallback(async () => {
    if (!isOperationsSystem) return;
    setErpNextStatusLoading(true);
    try {
      setErpNextStatus(await api.get<ErpNextTenantStatus>('/api/erpnext/status'));
    } catch (cause) {
      setErpNextStatus({ status: 'not_configured', error: { message: parseApiErrorMessage(cause) } });
    } finally {
      setErpNextStatusLoading(false);
    }
  }, [isOperationsSystem]);
  useEffect(() => {
    if (!isSystemsNode) return;
    let active = true;
    const load = async () => {
      const next: Record<string, string> = {};
      const needsErpNext = providerCapabilities.some(capability => capability.startsWith('erpnext_'));
      const [connections, erp] = await Promise.all([
        fetchConnections().catch(() => ({} as Record<string, Awaited<ReturnType<typeof fetchConnections>>>[string])),
        needsErpNext ? api.get<{ status?: string }>('/api/erpnext/status').catch(() => ({ status: 'unavailable' })) : Promise.resolve(null),
      ]);
      for (const capability of providerCapabilities) {
        if (capability === 'meta_ads') next[capability] = connections['int-meta'] ? 'Connected' : 'Not connected';
        if (capability.startsWith('erpnext_')) next[capability] = erp?.status === 'ready' ? 'Connected' : (erp?.status ?? 'Not connected');
      }
      if (active) setSystemStatus(next);
    };
    void load();
    return () => { active = false; };
  }, [isSystemsNode, providerCapabilities]);
  useEffect(() => {
    if (!isOperationsSystem || !isOpen) {
      queueMicrotask(() => setErpNextStatus(null));
      return;
    }
    void Promise.resolve().then(loadErpNextStatus);
    const timer = window.setInterval(() => {
      if (erpNextStatus?.status === 'provisioning') void Promise.resolve().then(loadErpNextStatus);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [isOpen, isOperationsSystem, loadErpNextStatus, erpNextStatus?.status]);
  const isOperationsContext = (
    isOperationsDepartment
    && isPersistedBdtNode
    && isFocusNode
  );
  const [operationsSnapshot, setOperationsSnapshot] = useState<ErpNextOperationsSnapshot | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  const loadOperationsSnapshot = useCallback(() => {
    if (!isOperationsContext) return;
    setOperationsLoading(true);
    fetchErpNextOperationsSnapshot(node.id)
      .then(snapshot => {
        setOperationsSnapshot(snapshot);
        setOperationsError(null);
      })
      .catch(err => {
        setOperationsSnapshot(null);
        setOperationsError(parseApiErrorMessage(err));
      })
      .finally(() => setOperationsLoading(false));
  }, [isOperationsContext, node.id]);

  useEffect(() => {
    if (isOpen && isOperationsContext) {
      void Promise.resolve().then(loadOperationsSnapshot);
    } else {
      queueMicrotask(() => { setOperationsSnapshot(null); setOperationsError(null); });
    }
  }, [isOpen, isOperationsContext, loadOperationsSnapshot]);

  const isSalesContext = (
    (department.sourceKey === 'dept_sales' || department.id === 'dept_sales' || department.label === 'Sales')
    && isPersistedBdtNode
    && isFocusNode
  );
  const [salesSummary, setSalesSummary] = useState<ErpNextSalesNodeSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  const loadSalesSummary = useCallback(() => {
    if (!isSalesContext) return;
    setSalesLoading(true);
    fetchErpNextSalesFocusSummary(node.id)
      .then(summary => {
        setSalesSummary(summary);
        setSalesError(null);
      })
      .catch(err => {
        setSalesSummary(null);
        setSalesError(parseApiErrorMessage(err));
      })
      .finally(() => setSalesLoading(false));
  }, [isSalesContext, node.id]);

  useEffect(() => {
    if (isOpen && isSalesContext) {
      void Promise.resolve().then(loadSalesSummary);
    } else {
      queueMicrotask(() => { setSalesSummary(null); setSalesError(null); });
    }
  }, [isOpen, isSalesContext, loadSalesSummary]);

  const isProductsContext = Boolean(node.virtualErpNext) && (department.sourceKey === 'dept_product' || department.id === 'dept_product');
  const [productsSummary, setProductsSummary] = useState<ErpNextCatalogReadiness | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  const loadProductsSummary = useCallback(() => {
    if (!isProductsContext) return;
    setProductsLoading(true);
    fetchErpNextCatalogReadiness(node.virtualErpNext!.entity, node.virtualErpNext!.identity)
      .then(summary => {
        setProductsSummary(summary);
        setProductsError(null);
      })
      .catch(err => {
        setProductsSummary(null);
        setProductsError(parseApiErrorMessage(err));
      })
      .finally(() => setProductsLoading(false));
  }, [isProductsContext, node.virtualErpNext]);

  useEffect(() => {
    if (isOpen && isProductsContext) {
      void Promise.resolve().then(loadProductsSummary);
    } else {
      queueMicrotask(() => { setProductsSummary(null); setProductsError(null); });
    }
  }, [isOpen, isProductsContext, loadProductsSummary]);

  const panelIconByType: Record<string, typeof Activity> = {
    signal: Radio,
    decision: HelpCircle,
    metric: BarChart3,
    action: Zap,
    project: GitBranch,
  };
  const PanelIcon = panelIconByType[node.type] ?? Activity;

  const sidebarBlurb = isProjectNode
    ? `Projects for ${department.label}, saved only on this device.`
    : isSystemsNode
      ? `Connected systems and provider readiness for ${department.label}.`
      : isMetricsNode
        ? `ERPNext evidence and user-configured KPIs for ${department.label}.`
        : isFocusNode
          ? `${node.label} is the primary operational focus for ${department.label}.`
    : node.type === 'signal'
      ? `Review signal and suggested response for ${department.label}.`
      : node.type === 'decision'
        ? `Evaluate options and choose a path for ${department.label}.`
        : node.type === 'metric'
          ? `Track metric performance for ${department.label}.`
          : `Execute ${node.type} tasks for ${department.label}.`;

  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: isOpen }));
    return () => {
      window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: false }));
    };
  }, [isOpen]);

  const { save, remove, has, getId } = useSavedWorkflows();

  const lookup = useMemo(() => ({
    companyId: 'bdt-universal',
    role: 'founder' as UserPlanetRole,
    rootId: department.id,
    branchId: department.id,
    actionId: node.id,
  }), [department.id, node.id]);

  const alreadySaved = has(lookup);

  const handleToggleSave = useCallback(() => {
    if (alreadySaved) {
      const id = getId(lookup);
      if (id) remove(id);
    } else {
      save({
        level: 'action',
        companyId: lookup.companyId,
        companyName: 'Universal Polytope',
        role: lookup.role,
        roleLabel: 'Founder',
        rootId: department.id,
        rootLabel: department.label,
        rootColor: primaryColor,
        branchId: department.id,
        branchLabel: department.label,
        actionId: node.id,
        actionLabel: node.label,
        actionHint: node.type,
      });
    }
  }, [alreadySaved, save, remove, getId, lookup, department.id, department.label, primaryColor, node.id, node.label, node.type]);

  // Interrelated departments resolution using RBAC filter
  const interrelatedDepts = filterReadableDepartments(
    node.interrelatedDepartments || [],
    allDepartments
  );

  return (
    <div 
      className="absolute inset-0 z-50 pointer-events-none flex"
      style={{ 
        opacity: isOpen ? 1 : 0,
        transition: 'opacity 0.4s ease-in-out',
        pointerEvents: isOpen ? 'auto' : 'none'
      }}
    >
      {/* LEFT 25% Node Overlay */}
      <div 
        className="w-[25vw] h-full relative flex items-center justify-center"
        style={{
          transform: isOpen ? 'scale(1) translateX(0)' : 'scale(0.8) translateX(-100px)',
          opacity: isOpen ? 1 : 0,
          transition: 'all 0.8s cubic-bezier(0.16, 1, 0.3, 1)',
          transitionDelay: isOpen ? '0.2s' : '0s'
        }}
      >
        <div className="absolute inset-0 pointer-events-none">
          <Canvas camera={{ position: [0, 0, 3.5], fov: 45 }}>
            <ambientLight intensity={0.5} />
            <directionalLight position={[10, 10, 5]} intensity={1.5} />
            <group position={[0, 0.1, 0]}>
              <PlasmaSphere
                color={primaryColor}
                radius={0.375}
                opacity={1.0}
                glowIntensity={3.5}
                halo={false}
                depthWrite={false}
                speed={1.5}
              />
              <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, -0.9, 0]}>
                <Text
                  color="#ffffff"
                  fontSize={0.12}
                  maxWidth={2.0}
                  lineHeight={1.1}
                  letterSpacing={0.06}
                  textAlign="center"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.008}
                  outlineColor="#000000"
                >
                  {node.label}
                </Text>
              </Billboard>
            </group>
          </Canvas>
        </div>
      </div>

      {/* RIGHT 75% Workspace Layout */}
      <div 
        className="w-[75vw] h-full relative z-10 flex flex-col overflow-hidden rounded-l-2xl shadow-2xl pointer-events-auto text-white"
        style={{ 
          background: 'rgba(10, 10, 14, 0.35)', 
          backdropFilter: 'blur(48px)',
          WebkitBackdropFilter: 'blur(32px)',
          borderLeft: '1px solid rgba(255,255,255,0.1)',
          boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
          transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
          transition: 'transform 0.5s cubic-bezier(0.16, 1, 0.3, 1)'
        }}
      >
      {/* Dynamic ambient glow based on primary color */}
      <div 
        className="absolute inset-0 pointer-events-none opacity-20" 
        style={{ 
          background: `radial-gradient(circle at 50% -20%, ${primaryColor}40 0%, transparent 60%), 
                       radial-gradient(circle at 120% 80%, ${primaryColor}30 0%, transparent 50%)` 
        }} 
      />

      {/* Top Header Navigation */}
      <header className="relative z-10 shrink-0 px-8 py-5 flex items-center justify-between border-b rounded-tl-2xl" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(24px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${primaryColor}33, ${primaryColor}22)`, border: `1px solid ${primaryColor}44`, boxShadow: `0 0 20px ${primaryColor}20` }}>
            <PanelIcon className="w-5 h-5" style={{ color: primaryColor }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1 flex-wrap">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: `${primaryColor}22`, color: primaryColor, border: `1px solid ${primaryColor}44` }}>
                {node.type}
              </span>
              <span className="text-white/20 text-[10px]">/</span>
              <span className="text-[11px] text-white/40 uppercase tracking-wider">{department.label}</span>
              {(isTrailActive && trailSession) && (
                <>
                  <span className="text-white/20 text-[10px]">|</span>
                  <span className="text-[10px] text-purple-300 font-medium">Started from {trailSession.anchor.deptLabel} ({trailSession.anchor.nodeLabel})</span>
                </>
              )}
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span style={{ color: primaryColor }}>{department.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/20" />
              <span className="text-white drop-shadow-md">{node.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0"
            style={{ 
              background: 'rgba(255,255,255,0.05)', 
              color: 'rgba(255,255,255,0.7)',
              border: '1px solid rgba(255,255,255,0.1)'
            }}
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Export To WorkOS
          </button>
          
          <button
            onClick={handleToggleSave}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all shrink-0 ${alreadySaved ? 'bg-white/10 text-white' : ''}`}
            style={{ 
              background: alreadySaved ? 'rgba(255,255,255,0.1)' : 'rgba(255,255,255,0.03)',
              color: alreadySaved ? '#fff' : 'rgba(255,255,255,0.6)',
              border: alreadySaved ? '1px solid rgba(255,255,255,0.2)' : '1px solid rgba(255,255,255,0.05)'
            }}
          >
            {alreadySaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            {alreadySaved ? 'Bookmarked Node' : 'Bookmark Node'}
          </button>

          <button 
            type="button" 
            onClick={onClose} 
            className="px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all hover:bg-white/10" 
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          >
            <X className="w-3.5 h-3.5" />
            Close Workspace
          </button>
        </div>
      </header>

      {(isTrailActive || isReplayMode) && (
        <WorkflowTrailRibbon
          session={trailSession}
          departments={allDepartments}
          onSave={onSaveTrail}
          onCancel={onCancelTrail}
          onUndo={onUndoTrailHop}
          isReplay={isReplayMode}
          replayStepIndex={replayStepIndex}
          onReplayNext={onReplayNext}
          onReplayPrev={onReplayPrev}
        />
      )}

      {/* Main Workspace Layout */}
      <div className="relative z-10 flex-1 flex overflow-hidden">
        
        {/* Left Sidebar (Action Info & Context) */}
        {!isMetaContainerMode && <div className="w-80 shrink-0 flex flex-col border-r rounded-bl-2xl" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(10,10,14,0.4)', backdropFilter: 'blur(16px)' }}>
          <div className="p-6 flex-1 overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 leading-tight" style={{ textShadow: `0 0 30px ${primaryColor}40` }}>
              {node.label}
            </h1>
            
            <p className="text-sm leading-relaxed mb-8" style={{ color: primaryColor + 'aa' }}>
              {sidebarBlurb}
            </p>

            <div className="space-y-4">
              {!isOperationsDepartment && <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={Activity}>Task Status</SectionTitle>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full w-1/4" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}88)` }} />
                  </div>
                  <span className="text-xs font-medium text-white/50">{node.score}%</span>
                </div>
              </div>}
              <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={Briefcase}>Context</SectionTitle>
                <p className="text-xs text-white/50 leading-relaxed">
                  This task is part of the <strong>{department.label}</strong> workflow, optimizing your {department.domain} objectives.
                </p>
              </div>
            </div>
          </div>
        </div>}

        {/* Right Content Area (Dynamic Panels) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide relative">
          <div className={`${isMetaContainerMode ? 'max-w-7xl' : 'max-w-5xl'} mx-auto flex flex-col gap-5`}>
            {isMetaContainerMode && <MetaAdsOperatingHub />}
            {isTeamNode && (
              <GlassCard>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <SectionTitle icon={Users}>TEAM ROSTER</SectionTitle>
                    <p className="text-sm text-white/55">{teamMemberCount} teammate{teamMemberCount === 1 ? '' : 's'} assigned to {department.label}.</p>
                  </div>
                  {canEdit && (
                    <button
                      type="button"
                      onClick={() => { window.location.assign('/team'); }}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0"
                      style={{ background: `${primaryColor}18`, color: primaryColor, border: `1px solid ${primaryColor}40` }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Manage team
                    </button>
                  )}
                </div>

                {teamMembers.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-[#111] px-4 py-5 text-sm text-white/40">
                    No team members assigned to this department.
                  </div>
                ) : (
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {teamMembers.map((member, index) => (
                      <div
                        key={`${node.id}-member-${index}`}
                        className="flex items-center gap-3 rounded-xl border border-white/5 bg-[#111] p-3 group/member"
                      >
                        <div
                          className="w-9 h-9 rounded-full flex items-center justify-center shrink-0 text-xs font-bold"
                          style={{ background: `${primaryColor}18`, border: `1px solid ${primaryColor}35`, color: primaryColor }}
                        >
                          {memberName(member).slice(0, 1).toUpperCase() || 'M'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white/90 truncate">{memberName(member)}</p>
                          <p className="text-xs text-white/40 truncate">{member.role}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {canEdit && workspaceMembers.some(member => member.department_id !== department.id) && (
                  <div className="mt-4 border-t border-white/10 pt-4"><p className="mb-2 text-xs text-white/45">Assign a teammate to {department.label}</p><div className="flex flex-wrap gap-2">{workspaceMembers.filter(member => member.department_id !== department.id).map(member => <button key={member.id} type="button" onClick={() => { void api.patch(`/api/team/members/${member.id}/department`, { departmentId: department.id }).then(() => refetchTeamMembers()); }} className="rounded-lg border border-white/10 px-2.5 py-1.5 text-xs text-white/70 hover:bg-white/10">{[member.first_name, member.last_name].filter(Boolean).join(' ') || member.role_name}</button>)}</div></div>
                )}
              </GlassCard>
            )}

            {isOperationsSystem ? (
              <OperationsSystemsPanel status={erpNextStatus} loading={erpNextStatusLoading} onRefresh={() => void loadErpNextStatus()} />
            ) : isSystemsNode && (
              <GlassCard>
                <SectionTitle icon={Radio}>SYSTEMS</SectionTitle>
                {providerCapabilities.length === 0 ? (
                  <p className="text-sm text-white/50">No supported system is currently available for this department.</p>
                ) : (
                  <div className="space-y-3">
                    {providerCapabilities.map(capability => (
                      <div key={capability} className="rounded-xl border border-white/10 bg-white/[0.03] p-4 flex items-center justify-between gap-3">
                        <div><p className="text-sm font-semibold text-white/85">{providerLabels[capability] ?? capability}</p><p className="text-xs text-white/45 mt-1">{systemStatus[capability] ?? 'Checking connection…'}</p></div>
                        <button type="button" onClick={() => window.location.assign('/twin/data?tab=integrations')} className="px-3 py-2 rounded-lg text-xs font-semibold border border-white/15 text-white/75 hover:bg-white/10">Configure</button>
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}

            {isProjectNode && (
              <GlassCard>
                <div className="flex items-start justify-between gap-4 mb-4"><div><SectionTitle icon={Briefcase}>PROJECTS</SectionTitle><p className="text-sm text-amber-200/75">Saved on this device. Projects are not shared with teammates.</p></div></div>
                <div className="flex gap-2 mb-4"><input value={newProjectName} onChange={event => setNewProjectName(event.target.value)} placeholder={`New ${department.label} project`} className="min-w-0 flex-1 rounded-lg border border-white/10 bg-black/20 px-3 py-2 text-sm text-white outline-none" /><button type="button" disabled={!newProjectName.trim()} onClick={() => { projectStore.createProject({ name: newProjectName.trim(), type: 'project', memberIds: [], departmentSourceKey: department.sourceKey }); setNewProjectName(''); }} className="rounded-lg px-3 py-2 text-xs font-semibold disabled:opacity-40" style={{ background: `${primaryColor}22`, color: primaryColor, border: `1px solid ${primaryColor}44` }}>Create</button></div>
                {departmentProjects.length === 0 ? <p className="text-sm text-white/45">No projects yet for this department.</p> : <div className="space-y-2">{departmentProjects.map(project => <div key={project.id} className="rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2"><p className="text-sm font-medium">{project.name}</p>{project.description && <p className="text-xs text-white/45 mt-1">{project.description}</p>}</div>)}</div>}
              </GlassCard>
            )}

            {isFocusNode && !isMetaContainerMode && (
              <GlassCard>
                <SectionTitle icon={GitBranch}>FOCUS OVERVIEW</SectionTitle>
                <p className="text-sm text-white/55">{node.label} is the primary ownership area for {department.label}. Metrics and locally saved projects are shown below; connected provider evidence appears when available.</p>
              </GlassCard>
            )}

            {isProductPortfolioFocus && <ProductPortfolioFocus onExplore={onClose} />}

            {!isTeamNode && !isSystemsNode && !isMetricsNode && !isProjectNode && !isFocusNode && !isMetaContainerMode && (
              <GlassCard>
                <SectionTitle icon={PanelIcon}>
                  {isProjectNode ? 'PROJECT DETAILS' : `${node.type.toUpperCase()} WORKSPACE`}
                </SectionTitle>
                <BdtTypePanel node={node} primaryColor={primaryColor} />
              </GlassCard>
            )}

            {!isMetaContainerMode && isOperationsContext && (
              <OperationsControlTower
                snapshot={operationsSnapshot}
                loading={operationsLoading}
                error={operationsError}
                onRefresh={loadOperationsSnapshot}
                onCreateProject={(title, detail) => projectStore.createProject({ name: title, description: detail, type: 'project', memberIds: [], departmentSourceKey: department.sourceKey })}
              />
            )}

            {!isMetaContainerMode && isSalesContext && (
              <SalesErpNextPanel
                summary={salesSummary}
                loading={salesLoading}
                error={salesError}
                onRefresh={loadSalesSummary}
              />
            )}

            {!isMetaContainerMode && isProductsContext && (
              <ProductsErpNextPanel
                summary={productsSummary}
                loading={productsLoading}
                error={productsError}
                onRefresh={loadProductsSummary}
              />
            )}

            {!isMetaContainerMode && isOperationsDepartment && isMetricsNode && companyId && (
              <OperationsMetricsPanel companyId={companyId} members={workspaceMembers} canEdit={canEditMetrics} />
            )}

            {!isMetaContainerMode && !isOperationsDepartment && !isTeamNode && !isSystemsNode && !isProjectNode && companyId && isPersistedBdtNode && (
              <GlassCard>
                <div className="flex items-center justify-between gap-3 mb-4">
                  <SectionTitle icon={BarChart3}>LIVE METRICS</SectionTitle>
                  {canEditMetrics && (
                    <button
                      type="button"
                      onClick={() => setShowMetricWizard(true)}
                      className="px-3 py-1.5 rounded-lg text-xs font-semibold"
                      style={{ background: `${primaryColor}22`, color: primaryColor, border: `1px solid ${primaryColor}44` }}
                    >
                      Create Metric
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 xl:grid-cols-3 gap-3">
                  <div className="xl:col-span-3 grid grid-cols-1 md:grid-cols-2 gap-3">
                    {nodeMetrics.map(metric => (
                      <MetricCard key={metric.id} metric={metric} canEdit={canEditMetrics && !metric.sources.some(source => source.source_type === 'integration')} onUpdateValue={updateMetricValue} />
                    ))}
                  </div>
                </div>
                {nodeMetrics.length === 0 && (
                  <div className="mt-3">
                    <EmptyMetricsState canEdit={canEditMetrics} onCreate={() => setShowMetricWizard(true)} />
                  </div>
                )}
                {node.metricDetails && (
                  <p className="text-[10px] text-white/30 mt-3">
                    Seed metric details are shown above as node context only. They are not live metrics until converted here.
                  </p>
                )}
              </GlassCard>
            )}

            {!isTeamNode && companyId && !isPersistedBdtNode && node.metricDetails && (
              <GlassCard>
                <SectionTitle icon={BarChart3}>METRIC TEMPLATE</SectionTitle>
                <p className="text-sm text-white/45 leading-relaxed">
                  This seed metric is template context only. Canonical metrics can be created once this node exists as a persisted BDT row.
                </p>
              </GlassCard>
            )}

            {!isOperationsDepartment && !isTeamNode && !isProjectNode && (
            <GlassCard>
              <SectionTitle icon={Zap}>METADATA</SectionTitle>
              <h3 className="text-lg font-semibold text-white mb-4" style={{ color: primaryColor }}>{department.label}</h3>
              
              <div className="grid grid-cols-2 gap-4 mb-8">
                {/* 1. Owner */}
                <div className="bg-[#111] p-4 rounded-xl border border-white/5">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Owner</p>
                  <p className="text-sm font-medium text-white/90">{node.owner || 'Domain Lead'}</p>
                </div>
                {/* 2. Status */}
                <div className="bg-[#111] p-4 rounded-xl border border-white/5">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Status</p>
                  <p className="text-sm font-medium text-white/90">{node.status || 'In Progress'}</p>
                </div>
                {/* 3. Output */}
                <div className="bg-[#111] p-4 rounded-xl border border-white/5">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Output</p>
                  <p className="text-sm font-medium text-white/90">{node.output || 'Deliverable'}</p>
                </div>
                {/* 4. Impact */}
                <div className="bg-[#111] p-4 rounded-xl border border-white/5">
                  <p className="text-[11px] text-white/40 uppercase tracking-wider mb-1">Impact</p>
                  <p className="text-sm font-medium text-white/90">{node.metricImpact || 'Efficiency'}</p>
                </div>
              </div>

              {node.workflowSteps && node.workflowSteps.length > 0 && (
                <div className="mb-8">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-4">WORKFLOW STEPS</h4>
                  <div className="flex flex-col gap-4">
                    {node.workflowSteps.map((step, idx) => (
                      <div key={idx} className="flex items-center gap-4">
                        <div className="w-6 h-6 rounded-full flex items-center justify-center bg-white/5 border border-white/10 shrink-0 text-xs text-white/60">
                          {idx + 1}
                        </div>
                        <p className="text-sm text-white/80">{step}</p>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {interrelatedDepts.length > 0 && (
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-widest mb-1.5">INTERRELATED DEPARTMENTS</h4>
                  {!isTrailActive && !isReplayMode && (
                    <p className="text-[10px] text-white/30 mb-3 italic">
                      Click a related department to start a path
                    </p>
                  )}
                  <div className="flex flex-col gap-3">
                    {interrelatedDepts.map(d => {
                      const dColor = U_DOMAIN_COLOR[d.domain] || '#8b5cf6';
                      const visited = trailSession && (
                        trailSession.anchor.deptId === d.id ||
                        trailSession.stops.some(stop => stop.deptId === d.id)
                      );
                      return (
                        <button
                          key={d.id}
                          onClick={() => onInterrelatedDepartmentClick ? onInterrelatedDepartmentClick(d.id) : onDepartmentClick(d.id)}
                          className="w-full flex items-center justify-between p-3 rounded-xl border border-white/5 bg-[#111] hover:bg-white/5 transition-colors text-left"
                        >
                          <div className="flex items-center gap-3">
                            <div className="w-2 h-2 rounded-full" style={{ backgroundColor: dColor }} />
                            <span className="text-sm font-medium text-white/80">{d.label}</span>
                            {visited && (
                              <span className="text-[10px] text-purple-400 font-semibold flex items-center gap-0.5 ml-1">
                                (✓ Visited)
                              </span>
                            )}
                          </div>
                          <ChevronRight className="w-4 h-4 text-white/20" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}
            </GlassCard>
            )}
          </div>
        </div>

      </div>
      </div>
      {showMetricWizard && companyId && (
        <MetricCreateWizard
          companyId={companyId}
          members={workspaceMembers}
          targetType={metricTarget.target_type}
          targetId={metricTarget.target_id}
          targetLabel={isMetricsNode ? `Department: ${department.label}` : `BDT Node: ${node.label}`}
          createMetric={createMetric}
          createDraft={createDraft}
          onClose={() => setShowMetricWizard(false)}
        />
      )}
    </div>
  );
}
