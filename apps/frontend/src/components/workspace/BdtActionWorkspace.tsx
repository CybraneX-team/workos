import { useEffect, useCallback, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { PlasmaSphere } from '../PolytopeShared';
import { X, ChevronRight, Zap, Briefcase, Activity, Bookmark, BookmarkCheck, ExternalLink, Users, UserPlus, Trash2, Radio, GitBranch, BarChart3, HelpCircle } from 'lucide-react';
import type { UInternalNode, UExternalNode } from '../../lib/usePolytopeStore';
import { U_DOMAIN_COLOR } from '../../lib/usePolytopeStore';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';
import { BdtTypePanel } from './bdtWorkspacePanels';
import { isProjectLeafNode } from '../../lib/bdtPolytopeData';
import { filterReadableDepartments } from '../../lib/bdtTrailRbac';
import type { BdtWorkflowTrailSession } from '../../lib/useWorkflowTrail';
import WorkflowTrailRibbon from './WorkflowTrailRibbon';
import { useAuth } from '../../lib/auth';
import { useCanonicalMetrics, isMetricAdmin } from '../../lib/db/canonicalMetrics';
import { useTeamMembers } from '../../lib/db/team';
import {
  fetchErpNextOperationsNodeSummary,
  type ErpNextOpsNodeSummary,
} from '../../lib/db/erpnextSupplyChain';
import {
  fetchErpNextSalesNodeSummary,
  type ErpNextSalesNodeSummary,
} from '../../lib/db/erpnextSales';
import {
  fetchErpNextProductsNodeSummary,
  type ErpNextProductsNodeSummary,
} from '../../lib/db/erpnextProducts';
import { MetaMetricPanel } from './panels/MetaMetricPanel';
import { SpendReachPanel } from './panels/SpendReachPanel';
import { CampaignsPanel } from './panels/CampaignsPanel';
import { GlassCard, SectionTitle } from './panels/PanelShell';
import { syncMetaMetricsOnce } from '../../lib/integrations/service';
import {
  EmptyMetricsState,
  MetricCard,
  MetricCreateWizard,
  MetricRollupHealthPanel,
} from './metrics/MetricSystem';

export interface BdtActionWorkspaceProps {
  node: UInternalNode;
  department: UExternalNode;
  allDepartments: UExternalNode[];
  onClose: () => void;
  onDepartmentClick: (deptId: string) => void;
  isOpen?: boolean;
  canEdit?: boolean;
  onAddMember?: (deptId: string, nodeId: string) => void;
  onDeleteMember?: (dept: UExternalNode, node: UInternalNode, memberIndex: number) => void;

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

// Paid Acquisition's 3 Meta-backed leaves. Matched on the content-derived stableSourceKey
// (falls back to label) — see genBdtSeed.ts's buildMetadata / departments.ts's stableSourceKey.
const META_METRIC_NODE_STABLE_KEYS = new Set(['mkt_paid_acquisition_ad_performance']);
const META_METRIC_NODE_LABELS = new Set(['ad performance health']);
const isMetaMetricNode = (node: UInternalNode) =>
  META_METRIC_NODE_STABLE_KEYS.has(node.stableSourceKey ?? '')
  || META_METRIC_NODE_LABELS.has(node.label.trim().toLowerCase());

const META_SPEND_REACH_STABLE_KEYS = new Set(['mkt_paid_acquisition_spend_reach']);
const META_SPEND_REACH_LABELS = new Set(['spend & reach health']);
const isMetaSpendReachNode = (node: UInternalNode) =>
  META_SPEND_REACH_STABLE_KEYS.has(node.stableSourceKey ?? '')
  || META_SPEND_REACH_LABELS.has(node.label.trim().toLowerCase());

const META_CAMPAIGNS_STABLE_KEYS = new Set(['mkt_paid_acquisition_campaigns']);
const META_CAMPAIGNS_LABELS = new Set(['campaigns health']);
const isMetaCampaignsNode = (node: UInternalNode) =>
  META_CAMPAIGNS_STABLE_KEYS.has(node.stableSourceKey ?? '')
  || META_CAMPAIGNS_LABELS.has(node.label.trim().toLowerCase());

const isAnyMetaPanelNode = (node: UInternalNode) =>
  isMetaMetricNode(node) || isMetaSpendReachNode(node) || isMetaCampaignsNode(node);

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

function OperationsMetricCard({ metric }: { metric: ErpNextOpsNodeSummary['metricCards'][number] }) {
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

function OperationsBreakdown({ breakdown }: { breakdown: ErpNextOpsNodeSummary['breakdowns'][number] }) {
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

function OperationsInsightList({ insights }: { insights: ErpNextOpsNodeSummary['insights'] }) {
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

type ErpNextEvidenceRow = {
  id: string;
  label: string;
  sourceDoctype: string;
  sourceId: string;
  detail?: string;
  status?: string;
  href?: string;
  attributes?: Array<{
    label: string;
    value: string | number;
    tone?: 'good' | 'neutral' | 'warning' | 'critical';
  }>;
};

function OperationsEvidenceDrawer({ evidence }: { evidence: ErpNextEvidenceRow[] }) {
  if (evidence.length === 0) return null;
  return (
    <details className="rounded-xl border border-white/10 bg-black/20 p-3">
      <summary className="cursor-pointer text-xs font-semibold text-white/65">
        Evidence ({evidence.length} WorkOS references)
      </summary>
      <div className="mt-3 space-y-2">
        {evidence.map(item => (
          <div key={item.id} className="flex items-start justify-between gap-3 rounded-lg border border-white/5 bg-black/25 px-3 py-2">
            <div className="min-w-0">
              <p className="text-xs font-medium text-white/75 truncate">{item.sourceId}</p>
              <p className="text-[10px] text-white/35 truncate">{item.sourceDoctype} · {item.label}</p>
              {item.attributes && item.attributes.length > 0 && (
                <div className="mt-1 flex flex-wrap gap-1">
                  {item.attributes.slice(0, 6).map(attribute => (
                    <span
                      key={`${item.id}:${attribute.label}:${attribute.value}`}
                      className={`rounded-md border px-1.5 py-0.5 text-[9px] leading-none ${
                        attribute.tone === 'warning' || attribute.tone === 'critical'
                          ? 'border-amber-300/20 bg-amber-300/10 text-amber-100/75'
                          : attribute.tone === 'good'
                            ? 'border-emerald-300/20 bg-emerald-300/10 text-emerald-100/75'
                            : 'border-white/10 bg-white/5 text-white/45'
                      }`}
                    >
                      {attribute.label}: {attribute.value}
                    </span>
                  ))}
                </div>
              )}
            </div>
            <div className="text-right shrink-0">
              {item.detail && <p className="text-[10px] text-white/45">{item.detail}</p>}
              {item.status && <p className="text-[10px] text-white/35">{item.status}</p>}
              {item.href && (
                <a
                  href={item.href}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-flex items-center gap-1 text-[10px] font-semibold text-cyan-200/75 hover:text-cyan-100"
                >
                  Open <ExternalLink className="h-3 w-3" />
                </a>
              )}
            </div>
          </div>
        ))}
      </div>
    </details>
  );
}

function OperationsErpNextPanel({ summary, loading, error, onRefresh }: {
  summary: ErpNextOpsNodeSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <SectionTitle icon={Activity}>WORKOS OPERATIONS</SectionTitle>
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
        <p className="text-sm text-white/45">Loading WorkOS Operations data...</p>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#111]/70 p-3">
            <p className="text-xs font-semibold text-white/75">{summary.path.join(' / ')}</p>
            <p className="text-[10px] text-white/35 mt-1">{summary.sourceDoctypes.length ? summary.sourceDoctypes.join(', ') : 'No WorkOS source doctypes mapped.'}</p>
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

          {summary.recommendedActions.length > 0 && (
            <div className="space-y-2">
              {summary.recommendedActions.map(action => (
                <div key={`${summary.mappingKey}:${action.label}`} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-100">{action.label}</p>
                  <p className="text-[10px] text-amber-100/55 mt-0.5">{action.reason}</p>
                </div>
              ))}
            </div>
          )}

          <OperationsEvidenceDrawer evidence={summary.evidence} />
        </div>
      )}
    </GlassCard>
  );
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

          {summary.recommendedActions.length > 0 && (
            <div className="space-y-2">
              {summary.recommendedActions.map(action => (
                <div key={`${summary.mappingKey}:${action.label}`} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-100">{action.label}</p>
                  <p className="text-[10px] text-amber-100/55 mt-0.5">{action.reason}</p>
                </div>
              ))}
            </div>
          )}

          <OperationsEvidenceDrawer evidence={summary.evidence} />
        </div>
      )}
    </GlassCard>
  );
}

function ProductsErpNextPanel({ summary, loading, error, onRefresh }: {
  summary: ErpNextProductsNodeSummary | null;
  loading: boolean;
  error: string | null;
  onRefresh: () => void;
}) {
  return (
    <GlassCard>
      <div className="flex items-center justify-between gap-3 mb-4">
        <div>
          <SectionTitle icon={Activity}>WORKOS PRODUCTS</SectionTitle>
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
        <p className="text-sm text-white/45">Loading WorkOS Products data...</p>
      )}

      {summary && (
        <div className="space-y-3">
          <div className="rounded-xl border border-white/10 bg-[#111]/70 p-3">
            <p className="text-xs font-semibold text-white/75">{summary.path.join(' / ')}</p>
            <p className="text-[10px] text-white/35 mt-1">{summary.sourceDoctypes.length ? summary.sourceDoctypes.join(', ') : 'No WorkOS source doctypes mapped.'}</p>
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

          {summary.recommendedActions.length > 0 && (
            <div className="space-y-2">
              {summary.recommendedActions.map(action => (
                <div key={`${summary.mappingKey}:${action.label}`} className="rounded-lg border border-amber-300/20 bg-amber-300/10 px-3 py-2">
                  <p className="text-xs font-semibold text-amber-100">{action.label}</p>
                  <p className="text-[10px] text-amber-100/55 mt-0.5">{action.reason}</p>
                </div>
              ))}
            </div>
          )}

          <OperationsEvidenceDrawer evidence={summary.evidence} />
        </div>
      )}
    </GlassCard>
  );
}

export function BdtActionWorkspace({
  node,
  department,
  allDepartments,
  onClose,
  onDepartmentClick,
  isOpen = true,
  canEdit = false,
  onAddMember,
  onDeleteMember,
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
  const { profile, role } = useAuth();
  const companyId = profile?.company_id ?? null;
  const canEditMetrics = isMetricAdmin(role);
  const isPersistedBdtNode = UUID_RE.test(node.id);
  const { metrics: nodeMetrics, rollups, createMetric, createDraft, updateMetricValue } = useCanonicalMetrics(
    isPersistedBdtNode ? companyId : null,
    { target_type: 'bdt_node', target_id: node.id, status: 'active' },
  );
  const { members: workspaceMembers } = useTeamMembers(companyId);
  const [showMetricWizard, setShowMetricWizard] = useState(false);
  const isTeamNode = node.type === 'team';
  const isProjectNode = isProjectLeafNode(node);
  const teamMembers = node.members ?? [];
  const teamMemberCount = node.memberCount ?? teamMembers.length;
  const isOperationsContext = (
    (department.sourceKey === 'dept_operations' || department.id === 'dept_operations' || department.label === 'Operations')
    && isPersistedBdtNode
  );
  const [operationsSummary, setOperationsSummary] = useState<ErpNextOpsNodeSummary | null>(null);
  const [operationsLoading, setOperationsLoading] = useState(false);
  const [operationsError, setOperationsError] = useState<string | null>(null);

  const loadOperationsSummary = useCallback(() => {
    if (!isOperationsContext) return;
    setOperationsLoading(true);
    fetchErpNextOperationsNodeSummary(node.id)
      .then(summary => {
        setOperationsSummary(summary);
        setOperationsError(null);
      })
      .catch(err => {
        setOperationsSummary(null);
        setOperationsError(parseApiErrorMessage(err));
      })
      .finally(() => setOperationsLoading(false));
  }, [isOperationsContext, node.id]);

  useEffect(() => {
    if (isOpen && isOperationsContext) {
      loadOperationsSummary();
    } else {
      setOperationsSummary(null);
      setOperationsError(null);
    }
  }, [isOpen, isOperationsContext, loadOperationsSummary]);

  const isSalesContext = (
    (department.sourceKey === 'dept_sales' || department.id === 'dept_sales' || department.label === 'Sales')
    && isPersistedBdtNode
  );
  const [salesSummary, setSalesSummary] = useState<ErpNextSalesNodeSummary | null>(null);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState<string | null>(null);

  const loadSalesSummary = useCallback(() => {
    if (!isSalesContext) return;
    setSalesLoading(true);
    fetchErpNextSalesNodeSummary(node.id)
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
      loadSalesSummary();
    } else {
      setSalesSummary(null);
      setSalesError(null);
    }
  }, [isOpen, isSalesContext, loadSalesSummary]);

  const isProductsContext = (
    (department.sourceKey === 'dept_product' || department.id === 'dept_product' || department.label === 'Product')
    && isPersistedBdtNode
  );
  const [productsSummary, setProductsSummary] = useState<ErpNextProductsNodeSummary | null>(null);
  const [productsLoading, setProductsLoading] = useState(false);
  const [productsError, setProductsError] = useState<string | null>(null);

  const loadProductsSummary = useCallback(() => {
    if (!isProductsContext) return;
    setProductsLoading(true);
    fetchErpNextProductsNodeSummary(node.id)
      .then(summary => {
        setProductsSummary(summary);
        setProductsError(null);
      })
      .catch(err => {
        setProductsSummary(null);
        setProductsError(parseApiErrorMessage(err));
      })
      .finally(() => setProductsLoading(false));
  }, [isProductsContext, node.id]);

  useEffect(() => {
    if (isOpen && isProductsContext) {
      loadProductsSummary();
    } else {
      setProductsSummary(null);
      setProductsError(null);
    }
  }, [isOpen, isProductsContext, loadProductsSummary]);

  const isMarketingContext = (
    (department.sourceKey === 'dept_marketing' || department.id === 'dept_marketing' || department.label === 'Marketing')
    && isPersistedBdtNode
  );

  useEffect(() => {
    if (isOpen && isMarketingContext) void syncMetaMetricsOnce().catch(() => {});
  }, [isOpen, isMarketingContext]);

  const panelIconByType: Record<string, typeof Activity> = {
    signal: Radio,
    decision: HelpCircle,
    metric: BarChart3,
    action: Zap,
    project: GitBranch,
  };
  const PanelIcon = panelIconByType[node.type] ?? Activity;

  const sidebarBlurb = isProjectNode
    ? `Project workspace for ${department.label}.`
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

  const lookup = {
    companyId: 'bdt-universal',
    role: 'founder' as any,
    rootId: department.id,
    branchId: department.id,
    actionId: node.id,
  };

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
  }, [alreadySaved, save, remove, getId, lookup.companyId, lookup.role, department.id, department.label, primaryColor, node.id, node.label, node.type]);

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
        <div className="w-80 shrink-0 flex flex-col border-r rounded-bl-2xl" style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(10,10,14,0.4)', backdropFilter: 'blur(16px)' }}>
          <div className="p-6 flex-1 overflow-y-auto scrollbar-hide">
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 leading-tight" style={{ textShadow: `0 0 30px ${primaryColor}40` }}>
              {node.label}
            </h1>
            
            <p className="text-sm leading-relaxed mb-8" style={{ color: primaryColor + 'aa' }}>
              {sidebarBlurb}
            </p>

            <div className="space-y-4">
              <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={Activity as any}>Task Status</SectionTitle>
                <div className="flex items-center gap-3 mt-3">
                  <div className="h-1.5 flex-1 bg-white/5 rounded-full overflow-hidden">
                    <div className="h-full rounded-full w-1/4" style={{ background: `linear-gradient(90deg, ${primaryColor}, ${primaryColor}88)` }} />
                  </div>
                  <span className="text-xs font-medium text-white/50">{node.score}%</span>
                </div>
              </div>

              <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={Briefcase as any}>Context</SectionTitle>
                <p className="text-xs text-white/50 leading-relaxed">
                  This task is part of the <strong>{department.label}</strong> workflow, optimizing your {department.domain} objectives.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content Area (Dynamic Panels) */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide relative">
          <div className="max-w-5xl mx-auto flex flex-col gap-5">
            {isTeamNode && (
              <GlassCard>
                <div className="flex items-start justify-between gap-4 mb-4">
                  <div>
                    <SectionTitle icon={Users}>TEAM ROSTER</SectionTitle>
                    <p className="text-sm text-white/55">
                      {teamMemberCount} teammate{teamMemberCount === 1 ? '' : 's'} attached to this BDT node.
                    </p>
                  </div>
                  {canEdit && onAddMember && (
                    <button
                      type="button"
                      onClick={() => onAddMember(department.id, node.id)}
                      className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0"
                      style={{ background: `${primaryColor}18`, color: primaryColor, border: `1px solid ${primaryColor}40` }}
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      Add Teammate
                    </button>
                  )}
                </div>

                {teamMembers.length === 0 ? (
                  <div className="rounded-xl border border-white/5 bg-[#111] px-4 py-5 text-sm text-white/40">
                    No teammates added yet.
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
                          {member.name?.slice(0, 1).toUpperCase() || 'M'}
                        </div>
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-medium text-white/90 truncate">{member.name}</p>
                          <p className="text-xs text-white/40 truncate">{member.role}</p>
                        </div>
                        {canEdit && (
                          <div className="flex items-center gap-1 opacity-0 group-hover/member:opacity-100 transition-opacity shrink-0">
                            {onDeleteMember && (
                              <button
                                type="button"
                                onClick={() => onDeleteMember(department, node, index)}
                                className="p-1.5 text-white/40 hover:text-rose-300 hover:bg-white/10 rounded transition-colors"
                                title="Delete teammate"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </GlassCard>
            )}

            {!isTeamNode && (
              <GlassCard>
                <SectionTitle icon={PanelIcon}>
                  {isProjectNode ? 'PROJECT DETAILS' : `${node.type.toUpperCase()} WORKSPACE`}
                </SectionTitle>
                <BdtTypePanel node={node} primaryColor={primaryColor} />
              </GlassCard>
            )}

            {isOperationsContext && (
              <OperationsErpNextPanel
                summary={operationsSummary}
                loading={operationsLoading}
                error={operationsError}
                onRefresh={loadOperationsSummary}
              />
            )}

            {isSalesContext && (
              <SalesErpNextPanel
                summary={salesSummary}
                loading={salesLoading}
                error={salesError}
                onRefresh={loadSalesSummary}
              />
            )}

            {isProductsContext && (
              <ProductsErpNextPanel
                summary={productsSummary}
                loading={productsLoading}
                error={productsError}
                onRefresh={loadProductsSummary}
              />
            )}

            {isMarketingContext && isMetaMetricNode(node) && companyId && (
              <MetaMetricPanel
                companyId={companyId}
                nodeLabel={node.label}
                nodeStableSourceKey={node.stableSourceKey}
                canConfigure={canEditMetrics}
                members={workspaceMembers}
              />
            )}

            {isMarketingContext && isMetaSpendReachNode(node) && companyId && (
              <SpendReachPanel nodeLabel={node.label} nodeStableSourceKey={node.stableSourceKey} />
            )}

            {isMarketingContext && isMetaCampaignsNode(node) && companyId && (
              <CampaignsPanel nodeLabel={node.label} nodeStableSourceKey={node.stableSourceKey} />
            )}

            {!isTeamNode && companyId && isPersistedBdtNode && !isAnyMetaPanelNode(node) && (
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
                  <MetricRollupHealthPanel rollup={rollups.find(r => r.target_type === 'bdt_node' && r.target_id === node.id)} title={`${node.label} Health`} />
                  <div className="xl:col-span-2 grid grid-cols-1 md:grid-cols-2 gap-3">
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

            {!isTeamNode && !isProjectNode && (
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
          targetType="bdt_node"
          targetId={node.id}
          targetLabel={`BDT Node: ${node.label}`}
          createMetric={createMetric}
          createDraft={createDraft}
          onClose={() => setShowMetricWizard(false)}
        />
      )}
    </div>
  );
}
