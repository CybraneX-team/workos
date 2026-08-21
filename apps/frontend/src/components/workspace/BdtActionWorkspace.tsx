import { useEffect, useCallback, useMemo, useState } from 'react';
import { Canvas } from '@react-three/fiber';
import { Text, Billboard } from '@react-three/drei';
import { PlasmaSphere } from '../PolytopeShared';
import { X, ChevronRight, Zap, Briefcase, Activity, Bookmark, BookmarkCheck, ExternalLink, Users, UserPlus, Radio, GitBranch, BarChart3, HelpCircle } from 'lucide-react';
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
import { MetaAdsOperatingHub } from './panels/MetaAdsOperatingHub';
import { NativeCatalogWorkspace, NativeOperationsPlaceholder, NativeSalesWorkspace } from './panels/NativeBusinessPanels';
import { CommercialTaskPanel } from './panels/CommercialTaskPanel';
import { ActionInformationPanel } from './panels/ActionInformationPanel';
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
  onOpenActionNode?: (nodeId: string) => void | Promise<void>;

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

export function BdtActionWorkspace({
  node,
  department,
  allDepartments,
  onClose,
  onDepartmentClick,
  isOpen = true,
  containerMode,
  canEdit = false,
  onOpenActionNode,
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
  const isCommercialNode = node.workspaceKind === 'commercial';
  const isUserActionNode = node.type === 'action' && !node.workspaceKind && node.nodeLevel === 'action';
  const taskEligibleNode = isPersistedBdtNode && (Boolean(node.workspaceKind) || isUserActionNode);
  const commercialPresentation = node.presentation;
  const teamMembers = isTeamNode
    ? workspaceMembers.filter(member => member.department_id === department.id)
    : (node.members ?? []);
  const teamMemberCount = teamMembers.length;
  const memberName = (member: typeof teamMembers[number]) => ('name' in member
    ? member.name
    : [member.first_name, member.last_name].filter(Boolean).join(' ') || 'Team member');
  const departmentProjects = projectStore.projects.filter(project => project.departmentSourceKey === department.sourceKey);
  const providerLabels: Record<string, string> = { meta_ads: 'Meta Ads' };
  const providerCapabilities = useMemo(() => node.providerCapabilities ?? [], [node.providerCapabilities]);
  const [systemStatus, setSystemStatus] = useState<Record<string, string>>({});
  const isOperationsDepartment = department.sourceKey === 'dept_operations' || department.id === 'dept_operations' || department.label === 'Operations';
  useEffect(() => {
    if (!isSystemsNode) return;
    let active = true;
    void fetchConnections().then(connections => {
      if (!active) return;
      const next: Record<string, string> = {};
      for (const capability of providerCapabilities) {
        if (capability === 'meta_ads') next[capability] = connections['int-meta'] ? 'Connected' : 'Not connected';
      }
      setSystemStatus(next);
    }).catch(() => { if (active) setSystemStatus({}); });
    return () => { active = false; };
  }, [isSystemsNode, providerCapabilities]);
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
        ? `User-configured KPIs for ${department.label}.`
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

            {isSystemsNode && (
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


            {isCommercialNode && commercialPresentation && (
              <>
                {(['commercial_product_catalogue','commercial_pricing','commercial_inventory'] as const).includes(commercialPresentation as any) && <NativeCatalogWorkspace canEdit={canEdit} capability={commercialPresentation as 'commercial_product_catalogue'|'commercial_pricing'|'commercial_inventory'} />}
                {(['commercial_customers','commercial_leads','commercial_deals','commercial_quotes','commercial_orders_invoices','commercial_collections'] as const).includes(commercialPresentation as any) && <NativeSalesWorkspace canEdit={canEdit} capability={commercialPresentation as 'commercial_customers'|'commercial_leads'|'commercial_deals'|'commercial_quotes'|'commercial_orders_invoices'|'commercial_collections'} />}
              </>
            )}

            {isPersistedBdtNode && Boolean(node.workspaceKind) && (
              <GlassCard>
                <SectionTitle icon={Zap}>CHILD NODES</SectionTitle>
                {(node.children ?? []).filter(child => (child.type === 'action' && !child.workspaceKind) || (child.type === 'resource' && child.nodeLevel === 'form')).map(child => <button key={child.id} type="button" onClick={() => onOpenActionNode?.(child.id)} className="mt-2 block w-full rounded-lg border border-white/10 bg-white/[.03] p-3 text-left hover:bg-white/[.08]"><p className="text-[10px] font-bold uppercase tracking-[.16em] text-white/40">{child.nodeLevel === 'form' ? 'Form' : 'Action'}</p><p className="mt-1 text-sm font-medium">{child.label}</p>{(child as any).purpose && <p className="mt-1 text-xs text-white/45">{(child as any).purpose}</p>}</button>)}
                {(node.children ?? []).filter(child => (child.type === 'action' && !child.workspaceKind) || (child.type === 'resource' && child.nodeLevel === 'form')).length === 0 && <p className="mt-2 text-sm text-white/45">No child nodes yet. Create Action and Form nodes in Settings → Node Management.</p>}
              </GlassCard>
            )}

            {isUserActionNode && (
              <GlassCard><SectionTitle icon={Zap}>ACTION OVERVIEW</SectionTitle><p className="mb-3 text-sm text-white/55">{node.purpose || 'No purpose recorded.'}</p><p className="text-xs text-white/40">Manage this node’s name, purpose, parent, or deletion from Settings → Node Management.</p></GlassCard>
            )}

            {taskEligibleNode && <CommercialTaskPanel nodeId={node.id} />}
            {isUserActionNode && <ActionInformationPanel nodeId={node.id} canContribute />}

            {isOperationsDepartment && isFocusNode && <NativeOperationsPlaceholder />}

            {!isTeamNode && !isSystemsNode && !isMetricsNode && !isProjectNode && !isFocusNode && !isCommercialNode && !isMetaContainerMode && (
              <GlassCard>
                <SectionTitle icon={PanelIcon}>
                  {isProjectNode ? 'PROJECT DETAILS' : `${node.type.toUpperCase()} WORKSPACE`}
                </SectionTitle>
                <BdtTypePanel node={node} primaryColor={primaryColor} />
              </GlassCard>
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
