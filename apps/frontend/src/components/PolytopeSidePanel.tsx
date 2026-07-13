import { useState, useRef, useEffect } from 'react';
import { Search, Command, ArrowLeft, Plus, ChevronRight, Pencil, Trash2, Target, Database, Activity, Users, BarChart2, UserPlus, Plug, Lock } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import type { UExternalNode, UInternalNode } from '../lib/universalPolytopeData';
import { getExternalNodeColor, isActionLeafNode, isBdtWorkspaceLeafNode } from '../lib/universalPolytopeData';
import { resolveDepartmentDelete, resolveDepartmentWrite, isBdtNodeActive } from '../lib/bdtPolytopeData';
import { usePolytopeStore } from '../lib/usePolytopeStore';

export interface PolytopeSidePanelProps {
  departments: UExternalNode[];
  /** Departments locked by company size — shown greyed-out with a lock icon */
  lockedDepartments?: UExternalNode[];
  selectedDeptId: string | null;
  onDeptSelect: (id: string | null, internalPath?: string[]) => void;
  /** The currently-selected internal node path (array of node IDs from root → leaf) */
  selectedInternalPath: string[];
  onAddDepartment?: () => void;
  onAddNode?: (deptId: string) => void;
  onAddMember?: (deptId: string, nodeId: string) => void;
  /** Called when user clicks the back button while inside sub-nodes — go 1 step up */
  onInternalBack?: () => void;
  /** Company polytope only — leave interior and return to subdomain solar system */
  onExitToSubdomain?: () => void;
  exitToSubdomainLabel?: string;
  onUpdateDepartment?: (id: string, updates: Partial<Omit<UExternalNode, 'id' | 'internalNodes'>>) => void;
  onDeleteDepartment?: (id: string) => void;
  onUpdateNode?: (deptId: string, nodeId: string, updates: Partial<Omit<UInternalNode, 'id' | 'children'>>) => void;
  onDeleteNode?: (deptId: string, nodeId: string) => void;
  onNodeSelect?: (path: string[]) => void;
  onEditDepartment?: (dept: UExternalNode) => void;
  onEditNode?: (dept: UExternalNode, node: UInternalNode) => void;
  onDeleteDepartmentClick?: (dept: UExternalNode) => void;
  onDeleteNodeClick?: (dept: UExternalNode, node: UInternalNode) => void;
  onDeleteMemberClick?: (dept: UExternalNode, node: UInternalNode, memberIndex: number) => void;
  canEdit?: boolean;
  canCreateDepartment?: boolean;
  /** When true, project leaves are treated as workspace leaves (BDT route). */
  bdtWorkspaceLeaves?: boolean;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function findNodeAtPath(nodes: UInternalNode[], path: string[]): UInternalNode | null {
  if (path.length === 0) return null;
  const node = nodes.find(n => n.id === path[0]);
  if (!node) return null;
  if (path.length === 1) return node;
  return findNodeAtPath(node.children ?? [], path.slice(1));
}

function getNodesAtPath(dept: UExternalNode, path: string[]): UInternalNode[] {
  if (path.length === 0) return dept.internalNodes;
  const node = findNodeAtPath(dept.internalNodes, path);
  return node?.children ?? [];
}

/**
 * Walks the ancestor chain along `path` to find the nearest level1 ancestor's label and the
 * nearest branch ancestor's label — i.e. the correct active/inactive key context for whatever
 * node rows are currently visible, even if the user drilled deeper than branch level into
 * team/process/project intermediary nodes.
 */
function resolveAncestorLabels(dept: UExternalNode, path: string[]): { level1Label?: string; branchLabel?: string; branchSourceKey?: string } {
  if (path.length === 0) return {};
  let level1Label: string | undefined;
  let branchLabel: string | undefined;
  let branchSourceKey: string | undefined;
  let nodes = dept.internalNodes;
  for (const id of path) {
    const node = nodes.find(n => n.id === id);
    if (!node) break;
    if (!level1Label && node.nodeLevel === 'level1') level1Label = node.label;
    if (node.nodeLevel === 'branch') {
      branchLabel = node.label;
      // Prefer the content-derived stableSourceKey over the positional sourceKey —
      // see genBdtSeed.ts's buildMetadata / departments.ts's stableSourceKey.
      branchSourceKey = node.stableSourceKey ?? node.sourceKey;
    }
    nodes = node.children ?? [];
  }
  // Fallback: this catalog's convention is depth-1 nodes are always level1, even if
  // node_level metadata is missing on an older/custom row.
  if (!level1Label) {
    level1Label = dept.internalNodes.find(n => n.id === path[0])?.label;
  }
  return { level1Label, branchLabel, branchSourceKey };
}

/** Recursively collect every internal node from a dept with its parent dept reference */
interface InternalNodeResult {
  node: UInternalNode;
  dept: UExternalNode;
  deptColor: string;
  path: string[]; // ancestry IDs
}

function collectAllInternalNodes(
  nodes: UInternalNode[],
  dept: UExternalNode,
  deptColor: string,
  ancestorPath: string[] = []
): InternalNodeResult[] {
  const results: InternalNodeResult[] = [];
  for (const node of nodes) {
    const path = [...ancestorPath, node.id];
    results.push({ node, dept, deptColor, path });
    if (node.children && node.children.length > 0) {
      results.push(...collectAllInternalNodes(node.children, dept, deptColor, path));
    }
  }
  return results;
}

// ── Node type badge ───────────────────────────────────────────────────────────
const TYPE_COLORS: Record<string, string> = {
  team: '#60a5fa',
  process: '#a78bfa',
  project: '#34d399',
  resource: '#fbbf24',
  decision: '#f472b6',
  risk: '#f87171',
  metric: '#22d3ee',
  branch: '#818cf8',
  action: '#fb7185',
  signal: '#2dd4bf',
};

// ── Main component ────────────────────────────────────────────────────────────

export function PolytopeSidePanel({
  departments,
  lockedDepartments = [],
  selectedDeptId,
  onDeptSelect,
  selectedInternalPath,
  onAddDepartment,
  onAddNode,
  onAddMember,
  onInternalBack,
  onExitToSubdomain,
  exitToSubdomainLabel,
  onDeleteDepartment,
  onDeleteNode,
  onNodeSelect,
  onEditDepartment,
  onEditNode,
  onDeleteDepartmentClick,
  onDeleteNodeClick,
  onDeleteMemberClick,
  canEdit = true,
  canCreateDepartment = canEdit,
  bdtWorkspaceLeaves = false,
}: PolytopeSidePanelProps) {
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState<'departments' | 'information'>('departments');
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeDepts = departments.filter(d => d.domain !== 'inactive');
  const canWriteDept = (dept: UExternalNode) => resolveDepartmentWrite(canEdit, dept);
  const canDeleteDept = (dept: UExternalNode) => resolveDepartmentDelete(canEdit, dept);
  const selectedDept = activeDepts.find(d => d.id === selectedDeptId) ?? null;
  // showingNodes is true when: a dept is explicitly selected OR the user has drilled into sub-nodes
  const showingNodes = (selectedDeptId !== null && selectedDept !== null) || selectedInternalPath.length > 0;
  const isSearchActive = searchQuery.trim().length > 0;

  // ── Search Relevance Helper ──────────────────────────────────────────────────
  const getRelevance = (text: string, query: string) => {
    if (!text) return 0;
    const lower = text.toLowerCase();
    if (lower === query) return 3;
    if (lower.startsWith(query)) return 2;
    if (lower.includes(query)) return 1;
    return 0;
  };

  // ── Search results: departments + all internal nodes ──────────────────────
  const q = searchQuery.toLowerCase();

  // When inside a dept, search filters that dept's nodes; otherwise global search
  const deptResults = isSearchActive && !showingNodes
    ? activeDepts
        .map(d => ({
          dept: d,
          score: Math.max(
            getRelevance(d.label, q),
            getRelevance(d.domain, q),
            getRelevance(d.cluster, q)
          )
        }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.dept)
    : activeDepts;

  const internalNodeResults: InternalNodeResult[] = (isSearchActive && !showingNodes)
    ? activeDepts.flatMap(dept => {
      const color = getExternalNodeColor(dept);
      return collectAllInternalNodes(dept.internalNodes, dept, color)
        .map(r => ({
          result: r,
          score: Math.max(
            getRelevance(r.node.label, q),
            getRelevance(r.node.type, q)
          )
        }))
        .filter(x => x.score > 0);
    })
    .sort((a, b) => b.score - a.score)
    .map(x => x.result)
    : [];

  // Fallback: if selectedDept is null but we have an internalPath, search for the dept that owns the path root
  const fallbackDept = !selectedDept && selectedInternalPath.length > 0
    ? activeDepts.find(d => {
      const root = d.internalNodes.find(n => n.id === selectedInternalPath[0]);
      return root !== undefined;
    }) ?? null
    : null;
  const effectiveDept = selectedDept ?? fallbackDept;

  const activeNode = effectiveDept && selectedInternalPath.length > 0
    ? findNodeAtPath(effectiveDept.internalNodes, selectedInternalPath)
    : null;

  // A grouping node (like "Teams") holds other team nodes, so it shouldn't show the members UI.
  const isGroupingTeamNode = activeNode && activeNode.type === 'team' && activeNode.children?.some(c => c.type === 'team');
  const hasMembersArray = activeNode && activeNode.members !== undefined;
  const isShowingMembers = activeNode && activeNode.type === 'team' && !isGroupingTeamNode && (hasMembersArray || (!activeNode.children || activeNode.children.length === 0));

  // Internal nodes at the current drill-down level
  const allVisibleNodes = effectiveDept ? getNodesAtPath(effectiveDept, selectedInternalPath) : [];
  // Filter by search query when inside a dept
  const visibleNodes = (showingNodes && isSearchActive)
    ? allVisibleNodes
        .map(n => ({
          node: n,
          score: Math.max(
            getRelevance(n.label, q),
            getRelevance(n.type, q)
          )
        }))
        .filter(x => x.score > 0)
        .sort((a, b) => b.score - a.score)
        .map(x => x.node)
    : allVisibleNodes;
  const deptColor = effectiveDept ? getExternalNodeColor(effectiveDept) : '#C1AEFF';
  const canWriteEffectiveDept = effectiveDept ? canWriteDept(effectiveDept) : false;
  const canDeleteEffectiveDept = effectiveDept ? canDeleteDept(effectiveDept) : false;
  const isLeafInternalNode = (node: UInternalNode) =>
    bdtWorkspaceLeaves ? isBdtWorkspaceLeafNode(node) : isActionLeafNode(node);
  const selectInternalNode = (node: UInternalNode) => {
    onNodeSelect?.([...selectedInternalPath, node.id]);
  };

  // Active/inactive gating — BDT route only (bdtWorkspaceLeaves), matches the same choke
  // point used in the 3D graph (InternalNode.tsx) so the sidebar can't be used to route
  // around dimmed/blocked leaves.
  const { activeKeys: bdtActiveKeys } = usePolytopeStore('bdt');
  const { level1Label: ancestorLevel1Label, branchLabel: ancestorBranchLabel, branchSourceKey: ancestorBranchSourceKey } = effectiveDept
    ? resolveAncestorLabels(effectiveDept, selectedInternalPath)
    : {};
  const isNodeInactive = (node: UInternalNode) =>
    bdtWorkspaceLeaves
    && isLeafInternalNode(node)
    && !isBdtNodeActive(ancestorBranchSourceKey, ancestorBranchLabel, ancestorLevel1Label, effectiveDept?.sourceKey, bdtActiveKeys);

  // Dynamic back button logic based on drill-down level
  let backLabel: string | null = null;
  let onBackClick: (() => void) | null = null;
  let backColor = '#C1AEFF';

  if (selectedInternalPath.length > 0) {
    onBackClick = () => onInternalBack?.();
    backColor = deptColor;
    if (selectedInternalPath.length === 1) {
      backLabel = effectiveDept ? `Back to ${effectiveDept.label}` : 'Back to Department';
    } else {
      const parentPath = selectedInternalPath.slice(0, -1);
      const parentNode = effectiveDept ? findNodeAtPath(effectiveDept.internalNodes, parentPath) : null;
      backLabel = parentNode ? `Back to ${parentNode.label}` : 'Back';
    }
  } else if (selectedDeptId !== null && effectiveDept !== null) {
    onBackClick = () => onDeptSelect(null);
    backColor = deptColor;
    backLabel = 'Back to Departments';
  } else if (onExitToSubdomain) {
    onBackClick = onExitToSubdomain;
    backColor = '#C1AEFF';
    backLabel = `Back to ${exitToSubdomainLabel ?? 'solar system'}`;
  }

  // Key that forces list re-animation on level change
  const listKey = `${isSearchActive ? 'search-' + q : (selectedDeptId ?? 'root')}-${selectedInternalPath.join('.')}`;

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        if (activeTab !== 'departments') setActiveTab('departments');
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [activeTab]);

  // Clear search when switching between departments
  useEffect(() => {
    setSearchQuery('');
  }, [selectedDeptId, activeTab]);

  // Section label logic
  const sectionLabel = activeTab === 'information'
    ? 'INFORMATION'
    : isSearchActive && !showingNodes
    ? 'SEARCH RESULTS'
    : !showingNodes
      ? 'DEPARTMENTS'
      : selectedInternalPath.length === 0
        ? 'INTERNAL NODES'
        : isShowingMembers
          ? 'MEMBERS'
          : 'SUB-NODES';

  return (
    <div className="flex flex-col items-start gap-3">

      {/* ── Tabs Segmented Control ── */}
      <div className="flex items-center p-1 bg-black/50 backdrop-blur-md rounded-xl border border-white/10 shadow-xl" style={{ width: '196px' }}>
        <button
          onClick={() => setActiveTab('departments')}
          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${activeTab === 'departments' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
        >
          Departments
        </button>
        <button
          onClick={() => setActiveTab('information')}
          className={`flex-1 py-1.5 text-[10px] font-semibold rounded-lg transition-colors ${activeTab === 'information' ? 'bg-white/15 text-white shadow-sm' : 'text-gray-400 hover:text-gray-200 hover:bg-white/5'}`}
        >
          Information
        </button>
      </div>

      {/* ── Search bar — visible only in departments tab ── */}
      {activeTab === 'departments' && (
      <div
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{
          width: '196px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: showingNodes
            ? `1px solid ${deptColor}40`
            : '1px solid rgba(255,255,255,0.07)',
          transition: 'border-color 0.3s ease',
        }}
      >
        <div className="flex items-center px-3 py-2.5">
          <Search className="w-3.5 h-3.5 mr-2 shrink-0" style={{ color: showingNodes ? deptColor : '#9ca3af' }} />
          <input
            ref={searchInputRef}
            type="text"
            placeholder={showingNodes ? `Search ${effectiveDept?.label ?? ''}…` : 'Search departments & nodes…'}
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-gray-500"
          />
          <div
            className="flex items-center gap-0.5 ml-2 opacity-50 shrink-0 bg-white/10 px-1.5 py-0.5 rounded"
            title="Cmd+K"
          >
            <Command className="w-2.5 h-2.5 text-gray-300" />
            <span className="text-[9px] text-gray-300 font-medium">K</span>
          </div>
        </div>
      </div>
      )}

      {backLabel && onBackClick && activeTab === 'departments' && (
        <button
          type="button"
          onClick={onBackClick}
          className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[11px] font-semibold transition-all hover:opacity-90 active:scale-[0.98] panel-slide-in"
          style={{
            width: '196px',
            background: 'rgba(0, 0, 0, 0.72)',
            backdropFilter: 'blur(14px)',
            WebkitBackdropFilter: 'blur(14px)',
            border: `1px solid ${backColor}5a`,
            color: backColor,
            boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
          }}
        >
          <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
          <span className="truncate">{backLabel}</span>
        </button>
      )}

      {/* ── Main panel ── */}
      <div
        className="rounded-2xl overflow-hidden flex flex-col"
        style={{
          width: '196px',
          maxHeight: '440px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(14px)',
          WebkitBackdropFilter: 'blur(14px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
        }}
      >

        {/* ── Section header ── */}
        <div key={listKey + '-hdr'} className="px-3 pt-3 pb-1 shrink-0 panel-slide-in">
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: '#5E5E5E' }}>
            {sectionLabel}
          </span>

          {/* Dept name sub-header when inside a dept */}
          {activeTab === 'departments' && showingNodes && effectiveDept && (
            <p className="text-[11px] font-semibold mt-0.5 truncate" style={{ color: deptColor }}>
              {effectiveDept.label}
            </p>
          )}

          {/* Search result count */}
          {activeTab === 'departments' && isSearchActive && (
            <p className="text-[10px] mt-0.5" style={{ color: '#4b5563' }}>
              {showingNodes
                ? `${visibleNodes.length} result${visibleNodes.length !== 1 ? 's' : ''}`
                : `${deptResults.length + internalNodeResults.length} result${deptResults.length + internalNodeResults.length !== 1 ? 's' : ''}`
              }
            </p>
          )}
        </div>

        {/* ── Scrollable list ── */}
        <div
          key={listKey}
          className="overflow-y-auto flex-1"
          style={{ scrollbarWidth: 'none', msOverflowStyle: 'none' }}
        >
          {activeTab === 'information' ? (
            <div className="p-2 space-y-0.5">
              {[
                { label: 'Strategy', path: '/twin/strategy', icon: Target, color: '#f472b6' },
                { label: 'Data', path: '/twin/data', icon: Database, color: '#38bdf8' },
                { label: 'Benchmarks', path: '/twin/benchmarks', icon: Activity, color: '#fbbf24' },
                { label: 'Team', path: '/twin/team', icon: Users, color: '#a78bfa' },
                { label: 'Analytics', path: '/twin/analytics', icon: BarChart2, color: '#2dd4bf' },
              ].map((item) => (
                <button
                  key={item.label}
                  onClick={() => navigate(item.path)}
                  className="w-full flex items-center gap-3 px-3 py-2.5 text-left transition-colors hover:bg-white/[0.06] rounded-xl group"
                >
                  <item.icon className="w-4 h-4 transition-transform group-hover:scale-110" style={{ color: item.color }} />
                  <span className="text-[12px] text-gray-300 group-hover:text-white transition-colors font-medium">
                    {item.label}
                  </span>
                </button>
              ))}
            </div>
          ) : isSearchActive && !showingNodes ? (
            /* ── GLOBAL SEARCH RESULTS: departments + internal nodes ── */
            deptResults.length === 0 && internalNodeResults.length === 0 ? (
              <div className="px-3 py-6 text-[11px] text-center" style={{ color: '#4b5563' }}>
                No results found
              </div>
            ) : (
              <>
                {/* Matching departments */}
                {deptResults.map((dept, i) => {
                  const color = getExternalNodeColor(dept);
                  return (
                    <button
                      key={dept.id}
                      onClick={() => {
                        setSearchQuery('');
                        onDeptSelect(dept.id);
                      }}
                      className="panel-item-in w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] group"
                      style={{ animationDelay: `${i * 22}ms` }}
                    >
                      <span
                        className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                        style={{ background: color, boxShadow: `0 0 8px ${color}70` }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] text-gray-300 group-hover:text-white transition-colors leading-tight truncate">
                          {dept.label}
                        </span>
                        <span className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.06)', color: '#6b7280' }}>
                          dept
                        </span>
                      </span>
                      <ChevronRight className="w-3 h-3 shrink-0 opacity-0 group-hover:opacity-40 transition-opacity" style={{ color: '#6b7280' }} />
                    </button>
                  );
                })}

                {/* Separator if both types have results */}
                {deptResults.length > 0 && internalNodeResults.length > 0 && (
                  <div className="mx-3 my-1" style={{ height: 1, background: 'rgba(255,255,255,0.05)' }} />
                )}

                {/* Matching internal nodes */}
                {internalNodeResults.map((result, i) => {
                  const typeColor = TYPE_COLORS[result.node.type] ?? '#94a3b8';
                  return (
                    <button
                      key={result.node.id}
                      onClick={() => {
                        setSearchQuery('');
                        onDeptSelect(result.dept.id, result.path);
                      }}
                      className="panel-item-in w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] group"
                      style={{ animationDelay: `${(deptResults.length + i) * 22}ms` }}
                    >
                      <span
                        className="w-1.5 h-1.5 rounded-full shrink-0"
                        style={{ background: result.deptColor, opacity: 0.8 }}
                      />
                      <span className="flex-1 min-w-0">
                        <span className="block text-[12px] text-gray-300 group-hover:text-white transition-colors leading-tight truncate">
                          {result.node.label}
                        </span>
                        <span className="flex items-center gap-1 mt-0.5">
                          <span
                            className="text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize"
                            style={{ background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}30` }}
                          >
                            {result.node.type}
                          </span>
                          <span className="text-[9px] truncate" style={{ color: '#4b5563' }}>
                            {result.dept.label}
                          </span>
                        </span>
                      </span>
                    </button>
                  );
                })}
              </>
            )
          ) : !showingNodes ? (
            /* ── DEPARTMENTS list ── */
            deptResults.length === 0 ? (
              <div className="px-3 py-6 text-[11px] text-center" style={{ color: '#4b5563' }}>
                No departments found
              </div>
            ) : (
              deptResults.map((dept, i) => {
                const color = getExternalNodeColor(dept);
                const isActiveDept = dept.id === selectedDeptId;
                return (
                  <div
                    key={dept.id}
                    className={`panel-item-in w-full flex items-center gap-2.5 px-3 py-2 text-left transition-all group/row ${!isActiveDept ? 'hover:bg-white/[0.06]' : ''}`}
                    style={{
                      animationDelay: `${i * 22}ms`,
                      background: isActiveDept ? `${color}18` : 'transparent',
                      borderLeft: isActiveDept ? `2px solid ${color}` : '2px solid transparent',
                      boxShadow: isActiveDept ? `inset 0 0 12px ${color}10` : 'none',
                      transition: 'all 0.2s ease',
                    }}
                  >
                    {/* Color dot */}
                    <span
                      className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover/row:scale-125"
                      style={{
                        background: color,
                        boxShadow: isActiveDept ? `0 0 12px ${color}` : `0 0 8px ${color}70`,
                        transform: isActiveDept ? 'scale(1.3)' : undefined,
                      }}
                    />

                    {/* Text clickable area */}
                    <div
                      onClick={() => onDeptSelect(dept.id)}
                      className="flex-1 min-w-0 cursor-pointer"
                    >
                      <span
                        className="block text-[12px] leading-tight truncate transition-colors text-gray-300 group-hover/row:text-white"
                        style={{ fontWeight: isActiveDept ? 600 : 400 }}
                      >
                        {dept.label}
                      </span>
                      <span className="block text-[10px] leading-tight mt-0.5" style={{ color: isActiveDept ? `${color}cc` : '#4b5563' }}>
                        {dept.internalNodes.length} domain{dept.internalNodes.length !== 1 ? 's' : ''}
                      </span>
                    </div>

                    {/* Action buttons (pencil, trash) on hover / Chevron otherwise */}
                    <div className="relative flex items-center justify-end gap-0.5 shrink-0 min-w-[2.75rem]">
                      {(canWriteDept(dept) || canDeleteDept(dept)) && (
                      <div className="flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto transition-opacity duration-150">
                        {canWriteDept(dept) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditDepartment?.(dept);
                            }}
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {canDeleteDept(dept) && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteDepartmentClick) {
                                onDeleteDepartmentClick(dept);
                              } else if (window.confirm(`Delete department "${dept.label}"?`)) {
                                if (selectedDeptId === dept.id) {
                                  onDeptSelect(null);
                                }
                                onDeleteDepartment?.(dept.id);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                      )}
                      <ChevronRight
                        className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${(canWriteDept(dept) || canDeleteDept(dept)) ? 'group-hover/row:opacity-0' : ''}`}
                        style={{ color: isActiveDept ? color : '#6b7280', opacity: isActiveDept ? 0.9 : 0 }}
                      />
                    </div>
                  </div>
                );
              })
            )
          ) : isShowingMembers && activeNode && effectiveDept ? (
            /* ── Team members view ── */
            <div className="p-2 space-y-1">
              {activeNode.members && activeNode.members.length > 0 ? (
                activeNode.members.map((member, index) => (
                  <div
                    key={`${activeNode.id}-${index}`}
                    className="panel-item-in flex items-center gap-2.5 px-2 py-2 rounded-xl transition-colors hover:bg-white/[0.06] group/member"
                    style={{ animationDelay: `${index * 22}ms` }}
                  >
                    <div
                      className="w-7 h-7 rounded-full flex items-center justify-center shrink-0 text-[10px] font-bold"
                      style={{ background: `${deptColor}18`, border: `1px solid ${deptColor}35`, color: deptColor }}
                    >
                      {member.name?.slice(0, 1).toUpperCase() || 'M'}
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="text-[12px] text-gray-300 truncate leading-tight">{member.name}</p>
                      <p className="text-[9px] text-gray-500 truncate leading-tight mt-0.5">{member.role}</p>
                    </div>
                    {canWriteEffectiveDept && (
                      <div className="flex items-center gap-0.5 shrink-0 opacity-0 pointer-events-none group-hover/member:opacity-100 group-hover/member:pointer-events-auto transition-opacity duration-150">
                        <button
                          type="button"
                          onClick={() => onDeleteMemberClick?.(effectiveDept, activeNode, index)}
                          className="p-1 text-gray-400 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                          title="Delete teammate"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    )}
                  </div>
                ))
              ) : (
                <div className="px-3 py-6 text-[11px] text-center" style={{ color: '#4b5563' }}>
                  No teammates added yet
                </div>
              )}
              {canWriteEffectiveDept && (
                <button
                  type="button"
                  onClick={() => onAddMember?.(effectiveDept.id, activeNode.id)}
                  className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90 active:scale-95"
                  style={{ background: `${deptColor}16`, border: `1px solid ${deptColor}35`, color: deptColor }}
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  Add Teammate
                </button>
              )}
            </div>
          ) : allVisibleNodes.length === 0 ? (
            /* ── No internal structure yet ── */
            <div className="px-4 py-8 flex flex-col items-center text-center gap-3">
              <Plug className="w-6 h-6" style={{ color: deptColor }} />
              <p className="text-[11px] text-gray-400">
                No connected data for {effectiveDept?.label ?? 'this department'} yet.
              </p>
              {effectiveDept && canWriteEffectiveDept && (
                <button
                  type="button"
                  onClick={() => onAddNode?.(effectiveDept.id)}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90"
                  style={{ background: `${deptColor}18`, border: `1px solid ${deptColor}35`, color: deptColor }}
                >
                  Add Node
                </button>
              )}
              <button
                onClick={() => navigate('/twin/data?tab=integrations')}
                className="px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all hover:opacity-90"
                style={{ background: `${deptColor}18`, border: `1px solid ${deptColor}35`, color: deptColor }}
              >
                Connect your data
              </button>
            </div>
          ) : visibleNodes.length === 0 ? (
            <div className="px-3 py-6 text-[11px] text-center" style={{ color: '#4b5563' }}>
              {isSearchActive ? 'No internal nodes found.' : 'No nodes match your search'}
            </div>
          ) : (
            /* ── Internal nodes list with navigation + CRUD ── */
            visibleNodes.map((node, i) => {
              const typeColor = TYPE_COLORS[node.type] ?? '#94a3b8';
              const childCount = node.children?.length ?? 0;
              const isLeaf = isLeafInternalNode(node);
              const memberCount = node.memberCount ?? node.members?.length ?? 0;
              const isActiveNode = node.id === selectedInternalPath[selectedInternalPath.length - 1];
              const isInactive = isNodeInactive(node);
              return (
                <div
                  key={node.id}
                  className="panel-item-in w-full flex items-center gap-2.5 px-3 py-2 text-left transition-colors hover:bg-white/[0.06] group/row"
                  style={{
                    animationDelay: `${i * 22}ms`,
                    background: isActiveNode ? `${deptColor}18` : 'transparent',
                    borderLeft: isActiveNode ? `2px solid ${deptColor}` : '2px solid transparent',
                    opacity: isInactive ? 0.4 : 1,
                  }}
                  title={isInactive ? 'Not connected yet' : undefined}
                >
                  <span
                    className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover/row:scale-125"
                    style={{ background: typeColor, boxShadow: `0 0 8px ${typeColor}70` }}
                  />

                  <div
                    onClick={() => { if (!isInactive) selectInternalNode(node); }}
                    className="flex-1 min-w-0"
                    style={{ cursor: isInactive ? 'not-allowed' : 'pointer' }}
                  >
                    <span className="block text-[12px] text-gray-300 group-hover/row:text-white transition-colors leading-tight truncate">
                      {node.label}
                    </span>
                    <span className="flex items-center gap-1 mt-0.5 min-w-0">
                      <span
                        className="text-[9px] font-semibold px-1.5 py-0.5 rounded capitalize shrink-0"
                        style={{ background: `${typeColor}18`, color: typeColor, border: `1px solid ${typeColor}30` }}
                      >
                        {node.type}
                      </span>
                      <span className="text-[9px] truncate" style={{ color: '#4b5563' }}>
                        {isInactive
                          ? 'not connected'
                          : isLeaf ? (node.type === 'team' ? `${memberCount} teammate${memberCount === 1 ? '' : 's'}` : 'dashboard') : `${childCount} node${childCount === 1 ? '' : 's'}`}
                      </span>
                    </span>
                  </div>

                  <div className="relative flex items-center justify-end gap-0.5 shrink-0 min-w-[2.75rem]">
                    {effectiveDept && !isInactive && (canWriteEffectiveDept || canDeleteEffectiveDept) && (
                      <div className="flex items-center gap-0.5 opacity-0 pointer-events-none group-hover/row:opacity-100 group-hover/row:pointer-events-auto transition-opacity duration-150">
                        {canWriteEffectiveDept && node.type === 'team' && isLeaf && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onAddMember?.(effectiveDept.id, node.id);
                            }}
                            className="p-1 text-gray-400 hover:text-sky-300 hover:bg-white/10 rounded transition-colors"
                            title="Add teammate"
                          >
                            <UserPlus className="w-3 h-3" />
                          </button>
                        )}
                        {canWriteEffectiveDept && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              onEditNode?.(effectiveDept, node);
                            }}
                            className="p-1 text-gray-400 hover:text-white hover:bg-white/10 rounded transition-colors"
                            title="Edit"
                          >
                            <Pencil className="w-3 h-3" />
                          </button>
                        )}
                        {canDeleteEffectiveDept && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (onDeleteNodeClick) {
                                onDeleteNodeClick(effectiveDept, node);
                              } else if (window.confirm(`Delete node "${node.label}"?`)) {
                                onDeleteNode?.(effectiveDept.id, node.id);
                              }
                            }}
                            className="p-1 text-gray-400 hover:text-rose-400 hover:bg-white/10 rounded transition-colors"
                            title="Delete"
                          >
                            <Trash2 className="w-3 h-3" />
                          </button>
                        )}
                      </div>
                    )}
                    {isInactive ? (
                      <Lock className="w-3 h-3 shrink-0" style={{ color: '#6b7280', opacity: 0.6 }} />
                    ) : (
                      <ChevronRight
                        className={`w-3 h-3 shrink-0 transition-opacity duration-150 ${effectiveDept && (canWriteEffectiveDept || canDeleteEffectiveDept) ? 'group-hover/row:opacity-0' : ''}`}
                        style={{ color: typeColor, opacity: 0.55 }}
                      />
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* ── Add controls ── */}
        {canCreateDepartment && activeTab === 'departments' && !showingNodes && (
        <div
          className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <button
            onClick={() => onAddDepartment?.()}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{
              background: 'rgba(99,102,241,0.12)',
              border: '1px solid rgba(99,102,241,0.35)',
              color: '#a5b4fc',
              transition: 'all 0.15s ease',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Department
          </button>
        </div>
        )}

        {/* ── Locked departments (size-gated) ── */}
        {lockedDepartments.length > 0 && activeTab === 'departments' && !showingNodes && (
          <div className="px-3 pb-2 flex flex-col gap-1">
            {lockedDepartments.map(dept => {
              const color = getExternalNodeColor(dept);
              return (
                <div
                  key={dept.id}
                  title={`Upgrade your company size in Settings to unlock ${dept.label}.`}
                  className="flex items-center gap-2.5 px-3 py-2 rounded-xl cursor-not-allowed"
                  style={{
                    background: 'rgba(255,255,255,0.02)',
                    border: '1px solid rgba(255,255,255,0.04)',
                    opacity: 0.45,
                  }}
                >
                  <div
                    className="w-1.5 h-1.5 rounded-full shrink-0"
                    style={{ background: color }}
                  />
                  <span className="text-[12px] text-white/40 truncate flex-1">{dept.label}</span>
                  <Lock className="w-3 h-3 shrink-0" style={{ color: '#5E5E5E' }} />
                </div>
              );
            })}
          </div>
        )}

        {activeTab === 'departments' && showingNodes && effectiveDept && canWriteEffectiveDept && !isShowingMembers && (
        <div
          className="px-3 pb-3 pt-2 shrink-0"
          style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}
        >
          <button
            type="button"
            onClick={() => onAddNode?.(effectiveDept.id)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90 active:scale-95"
            style={{
              background: `${deptColor}16`,
              border: `1px solid ${deptColor}35`,
              color: deptColor,
              transition: 'all 0.15s ease',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Node
          </button>
        </div>
        )}
      </div>

      {/* ── VC & Mentors + Startup Network pills ── */}
      <div className="flex flex-col gap-2 w-full" style={{ width: '196px' }}>
        <button
          onClick={() => navigate('/ecosystem/vc-connect')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-sky-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-sky-400 shrink-0" />
          VC &amp; Mentors
        </button>
        <button
          onClick={() => navigate('/ecosystem/network')}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-teal-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          <span className="w-1.5 h-1.5 rounded-full bg-teal-400 shrink-0" />
          Startup Network
        </button>
      </div>
    </div>
  );
}
