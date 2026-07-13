import { useState, useRef, useCallback, useEffect, useMemo } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Loader2, Plus } from 'lucide-react';
import UniverseCanvas from '../three-universe/UniverseCanvas';
import { useUniverseGraph } from '../data/universeGraph';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/db/companies';
import { UniverseController, type NavPathEntry, type ZoomLevel, type HoverTarget, ZOOM_LEVELS } from '../three-universe/UniverseController';
import type { UniverseIndustry, UniverseSubdomain } from '../data/universeGraph';
import CreateCompanyModal from '../components/CreateCompanyModal';
import UniversalPolytope from '../components/UniversalPolytope';
import { PolytopeSidePanel } from '../components/PolytopeSidePanel';
import { PolytopeManager } from '../components/PolytopeManager';
import CreateDepartmentPanel from '../components/CreateDepartmentPanel';
import CompanyPlanet3DView from '../components/CompanyPlanet3DView';
import { EXPAND_SETTLE_MS } from '../lib/planetRootAnimation';
import { CompanyPlanetSidePanel } from '../components/CompanyPlanetSidePanel';
import { AddReferenceNodePanel } from '../components/AddReferenceNodePanel';
import {
  getRoleLabel,
  getPlanetPathLabels,
  resolvePlanetRestoreTarget,
  rootsToPolytopeDepartments,
  type UserPlanetRole,
  type CompanyPlanetContext,
} from '../data/companyPlanetRoots';
import {
  createReferenceCompany,
  createReferenceCompanyNode,
  deleteReferenceCompany,
  getReferenceCompany,
  refreshReferenceCompany,
  referenceCompanyDetailToPlanetContext,
  pendingReferenceCompanyToPlanetContext,
  type ReferenceCompany,
  type CreateReferenceCompanyNodeInput,
} from '../lib/db/referenceCompanies';
import type { ReferenceCompanyJob } from '../data/companyPlanetRoots';
import { OpenWorkspaceCue } from '../components/OpenWorkspaceCue';
import type { WorkspaceEntryContext } from '../context/FounderWorkspaceContext';
import { UniverseGalaxySidebar } from '../components/universe/UniverseGalaxySidebar';
import { TwinWorkspaceLayout } from '../components/twin/TwinWorkspaceLayout';
import {
  type TwinWorkspacePhase,
  TWIN_WORKSPACE_CAMERA_MS,
  TWIN_WORKSPACE_PANEL_MS,
  TWIN_WORKSPACE_CLOSE_MS,
  isTwinWorkspaceActive,
} from '../lib/twinWorkspaceTransition';
import {
  savePlanetState,
  loadPlanetState,
  clearPlanetState,
} from '../lib/universeNavPersistence';
import { usePolytopeStore } from '../lib/usePolytopeStore';
import type { UExternalNode, UInternalNode } from '../lib/usePolytopeStore';
import { ActionNodeWorkspace } from '../components/workspace/ActionNodeWorkspace';
import { DragWorkspaceOverlay } from '../components/workspace/DragWorkspaceOverlay';
import { CompanyTagDropdown } from '../components/planet/CompanyTagDropdown';
import type { CompanyTag } from '../lib/useSavedWorkflows';
import { useVoice } from '../context/VoiceContext';

// ── Page ─────────────────────────────────────────────────────────────────────

export default function Universe3DPage() {
  const navigate = useNavigate();
  const { pathname, state } = useLocation();
  const { user, profile, canRead, canWrite, role: authRole } = useAuth();
  // Bypass users (VC/Incubator) have no company — pass null so the universe loads without waiting
  const activeRole = localStorage.getItem('active_role');
  const isBypassUser = !!user && (activeRole === 'vc' || activeRole === 'incubator');
  const companyId = isBypassUser ? null : (user ? (profile?.company_id ?? null) : undefined);
  const { company } = useCompany(companyId ?? undefined);
  const {
    data,
    loading,
    isRefreshing,
    error,
    refresh: refreshUniverse,
    appendReferenceCompany,
  } = useUniverseGraph(companyId);
  const canCreateDepartments = canWrite('twin') && canWrite('team');
  const canManageReferenceCompanies = Boolean(companyId)
    && ['super_admin', 'founder', 'co_founder', 'admin'].includes(authRole ?? '');

  // Company name for the polytope core sphere — same fallback chain as UniversalPage
  const bhCompanyName = company?.name || (companyId
    ? profile?.first_name ? `${profile.first_name}'s workspace` : 'My workspace'
    : 'My Organisation');

  const bhIndustryName = useMemo(() => {
    if (!company?.industry_id || !data?.industries) return '';
    const ind = data.industries.find(i => i.id === company.industry_id);
    return ind?.name || '';
  }, [company?.industry_id, data?.industries]);

  const bhSubdomainName = useMemo(() => {
    if (!company?.industry_id || !company?.subdomain_id || !data?.industries) return '';
    const ind = data.industries.find(i => i.id === company.industry_id);
    const sub = ind?.subdomains.find(s => s.id === company.subdomain_id);
    return sub?.name || '';
  }, [company?.industry_id, company?.subdomain_id, data?.industries]);

  const { sendContextUpdate, voiceState, intensityRef, toggle } = useVoice();

  const handleIndustryCoreVoiceToggle = useCallback((_industry: any, active: boolean) => {
    const isVoiceRunning = voiceState !== 'idle';
    if (active !== isVoiceRunning) {
      toggle();
    }
  }, [voiceState, toggle]);

  const controllerRef = useRef<UniverseController | null>(null);
  const [navPath, setNavPath] = useState<NavPathEntry[]>([]);
  const [currentLevel, setCurrentLevel] = useState<ZoomLevel>(ZOOM_LEVELS.GALAXY);
  const [hoverTarget, setHoverTarget] = useState<HoverTarget | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [insideBH, setInsideBH] = useState(false);
  const [bhTransitioning, setBhTransitioning] = useState(false);
  // Mount once on first BH entry — never unmount (avoids R3F OrbitControls null-connect error)
  const [bhMounted, setBhMounted] = useState(false);
  // Increments each entry so UniversalPolytope resets camera to initial view
  const [bhEntryCount, setBhEntryCount] = useState(0);

  const [twinWorkspacePhase, setTwinWorkspacePhase] = useState<TwinWorkspacePhase>('closed');

  const [coreTooltip, setCoreTooltip] = useState({ visible: false, x: 0, y: 0, color: '#a855f7', level: 'industry' });

  const [polytopeWorkspacePhase, setPolytopeWorkspacePhase] = useState<any>('idle');

  useEffect(() => {
    if (insideBH && bhMounted) {
      if (voiceState === 'idle' && polytopeWorkspacePhase === 'workspace') {
        setPolytopeWorkspacePhase('surfacing');
      } else if (voiceState !== 'idle' && polytopeWorkspacePhase === 'idle') {
        setPolytopeWorkspacePhase('diving-in');
      }
    }
  }, [insideBH, bhMounted, voiceState, polytopeWorkspacePhase]);

  const handlePolytopeCoreClick = useCallback(() => {
    if (voiceState === 'idle') {
      handleIndustryCoreVoiceToggle(null, true);
    } else {
      handleIndustryCoreVoiceToggle(null, false);
    }
  }, [voiceState, handleIndustryCoreVoiceToggle]);

  const handlePolytopeDiveComplete = useCallback(() => {
    if (polytopeWorkspacePhase === 'diving-in') {
      setPolytopeWorkspacePhase('workspace');
    }
  }, [polytopeWorkspacePhase]);

  const handlePolytopeSurfaceComplete = useCallback(() => {
    if (polytopeWorkspacePhase === 'surfacing') {
      setPolytopeWorkspacePhase('idle');
    }
  }, [polytopeWorkspacePhase]);

  useEffect(() => {
    const isVoiceRunning = voiceState !== 'idle';
    if (hoverTarget?.type === 'core' && hoverTarget.screenX != null && hoverTarget.screenY != null && !isVoiceRunning) {
      setCoreTooltip({
        visible: true,
        x: hoverTarget.screenX,
        y: hoverTarget.screenY,
        color: hoverTarget.industry?.color || '#a855f7',
        level: hoverTarget.level || 'industry'
      });
    } else {
      setCoreTooltip(prev => ({ ...prev, visible: false }));
    }
  }, [hoverTarget, voiceState]);
  const openWorkspacePendingRef = useRef(false);
  const twinWorkspaceTimerRef = useRef<number | null>(null);
  const [workspaceEntryContext, setWorkspaceEntryContext] = useState<WorkspaceEntryContext | null>(null);

  const clearTwinWorkspaceTimers = useCallback(() => {
    if (twinWorkspaceTimerRef.current != null) {
      window.clearTimeout(twinWorkspaceTimerRef.current);
      twinWorkspaceTimerRef.current = null;
    }
  }, []);

  useEffect(() => {
    const path = navPath.map(e => e.name).join(' → ') || 'Galaxy overview';
    sendContextUpdate(
      `[Navigation] User is on the 3D Startup Universe. Viewing: ${path}. Company: ${bhCompanyName}.`
    );
  }, [navPath, currentLevel, bhCompanyName]);

  const beginTwinWorkspacePanels = useCallback(() => {
    clearTwinWorkspaceTimers();
    setTwinWorkspacePhase('entering');
    twinWorkspaceTimerRef.current = window.setTimeout(() => {
      setTwinWorkspacePhase('open');
      twinWorkspaceTimerRef.current = null;
    }, TWIN_WORKSPACE_PANEL_MS);
  }, [clearTwinWorkspaceTimers]);

  const scheduleTwinWorkspacePanels = useCallback(
    (delayMs: number) => {
      clearTwinWorkspaceTimers();
      twinWorkspaceTimerRef.current = window.setTimeout(() => {
        beginTwinWorkspacePanels();
      }, delayMs);
    },
    [beginTwinWorkspacePanels, clearTwinWorkspaceTimers],
  );

  useEffect(() => () => clearTwinWorkspaceTimers(), [clearTwinWorkspaceTimers]);

  useEffect(() => {
    controllerRef.current?.setWorkspaceCompose(isTwinWorkspaceActive(twinWorkspacePhase));
  }, [twinWorkspacePhase]);

  // Re-apply interaction when the canvas mounts after data load (child effects run before this).
  useEffect(() => {
    if (loading || !data || isTwinWorkspaceActive(twinWorkspacePhase)) return;
    const rafId = requestAnimationFrame(() => controllerRef.current?.restoreUniverseInteraction());
    return () => cancelAnimationFrame(rafId);
  }, [loading, data, twinWorkspacePhase]);

  useEffect(() => {
    if (!isTwinWorkspaceActive(twinWorkspacePhase)) return;
    if (twinWorkspacePhase === 'closing') return;
    controllerRef.current?.applyTwinWorkspaceFocus();
  }, [twinWorkspacePhase]);

  useEffect(() => {
    if (twinWorkspacePhase === 'closed') {
      controllerRef.current?.exitTwinWorkspaceFocus();
      controllerRef.current?.restoreUniverseInteraction();
    }
  }, [twinWorkspacePhase]);

  // ── Polytope sidebar state (shown when insideBH) ──────────────────────────
  const polytopeStore = usePolytopeStore('twin');
  useEffect(() => {
    void polytopeStore.loadDepartments();
  }, [polytopeStore.loadDepartments]);
  const [polytopeDeptId, setPolytopeDeptId] = useState<string | null>(null);
  const [polytopeInternalPath, setPolytopeInternalPath] = useState<string[]>([]);
  const [polytopeManagerOpen, setPolytopeManagerOpen] = useState(false);
  const [polytopeManagerView, setPolytopeManagerView] = useState<any>({ type: 'home' });
  const canWriteDept = useCallback((dept?: UExternalNode | null) => Boolean(dept?.access?.write), []);
  const canDeleteDept = useCallback((dept?: UExternalNode | null) => Boolean(dept?.access?.delete), []);
  const hasWritableDepartment = polytopeStore.departments.some(d => canWriteDept(d));

  const handleEditDepartment = useCallback((dept: UExternalNode) => {
    if (!canWriteDept(dept)) return;
    setPolytopeManagerView({ type: 'editDept', dept });
    setPolytopeManagerOpen(true);
  }, [canWriteDept]);

  const handleEditNode = useCallback((dept: UExternalNode, node: UInternalNode) => {
    if (!canWriteDept(dept)) return;
    setPolytopeManagerView({ type: 'editNode', dept, node });
    setPolytopeManagerOpen(true);
  }, [canWriteDept]);

  const handleDeleteDepartmentClick = useCallback((dept: UExternalNode) => {
    if (!canDeleteDept(dept)) return;
    setPolytopeManagerView({ type: 'deleteDept', dept });
    setPolytopeManagerOpen(true);
  }, [canDeleteDept]);

  const handleDeleteNodeClick = useCallback((dept: UExternalNode, node: UInternalNode) => {
    if (!canDeleteDept(dept)) return;
    setPolytopeManagerView({ type: 'deleteNode', dept, node });
    setPolytopeManagerOpen(true);
  }, [canDeleteDept]);

  // Separate state so clicking sidebar triggers camera fly-in without looping
  const [polytopeRequestSelectDeptId, setPolytopeRequestSelectDeptId] = useState<string | null | undefined>(undefined);
  // Counter incremented by sidebar back button to go back one internal level
  const [polytopeInternalBackStep, setPolytopeInternalBackStep] = useState(0);

  // ── Draft dept/node state for inline creation panels ─────────────────────
  const [polytopeDraftDept, setPolytopeDraftDept] = useState<UExternalNode | null>(null);
  const polytopeDraftDeptScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  const [polytopeDraftInternalNode, setPolytopeDraftInternalNode] = useState<{ deptId: string; node: UInternalNode } | null>(null);
  const polytopeDraftInternalNodeScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  // IDT manual-node add inside the root-polytope drill view (mirrors BDT's contextual add).
  const [showRootPolytopeAddNode, setShowRootPolytopeAddNode] = useState(false);
  const [polytopeDraftMember] = useState<{ deptId: string; nodeId: string; member: any } | null>(null);
  const polytopeDraftMemberScreenPosRef = useRef<{ x: number; y: number } | null>(null);
  // Incremented on draft create/cancel to fly camera back to overview
  const [polytopeDraftResetTrigger, setPolytopeDraftResetTrigger] = useState(0);

  const handlePolytopeAddDepartment = useCallback(() => {
    if (!canCreateDepartments) return;
    const draftId = `draft_dept_${Date.now()}`;
    const draft: UExternalNode = {
      id: draftId,
      label: 'New Department',
      domain: 'build',
      cluster: '',
      score: 75,
      metrics: { performance: 75, efficiency: 75, capacity: 75, alignment: 75, risk: 25 },
      internalNodes: [],
      isDraft: true,
    };
    setPolytopeDraftDept(draft);
    // Deselect current dept so camera returns to overview before flying to draft
    setPolytopeRequestSelectDeptId(null);
  }, [canCreateDepartments]);

  const handlePolytopeAddNode = useCallback((deptId: string) => {
    const dept = polytopeStore.departments.find(d => d.id === deptId);
    if (!dept || !canWriteDept(dept)) return;
    const draftNode: UInternalNode = {
      id: `draft_node_${Date.now()}`,
      label: 'New Node',
      type: 'team',
      score: 75,
      children: [],
    };
    setPolytopeDraftInternalNode({ deptId, node: draftNode });
    setPolytopeDeptId(deptId);
    if (polytopeDeptId !== deptId) {
      setPolytopeRequestSelectDeptId(deptId);
    }
  }, [canWriteDept, polytopeStore.departments, polytopeDeptId]);

  // Called when the 3D scene selects a dept
  const handlePolytopeDeptChange = useCallback((id: string | null) => {
    setPolytopeDeptId(id);
    setPolytopeRequestSelectDeptId(id);
    if (id === null) {
      setPolytopeInternalPath([]);
      setPolytopeInternalBackStep(0);
    }
  }, []);

  // Called when sidebar selects a dept — update dept AND trigger camera fly-in
  const handlePolytopeSidebarDeptSelect = useCallback((id: string | null) => {
    setPolytopeDeptId(id);
    if (id === null) {
      setPolytopeInternalPath([]);
      setPolytopeRequestSelectDeptId(null);
      setPolytopeInternalBackStep(0);
    } else {
      setPolytopeRequestSelectDeptId(id);
    }
  }, []);

  // Reset sidebar when exiting BH
  const handleExitBH = useCallback(() => {
    setInsideBH(false);
    setPolytopeDeptId(null);
    setPolytopeInternalPath([]);
    setPolytopeRequestSelectDeptId(null);
    setPolytopeInternalBackStep(0);
  }, []);

  const handleEnterBH = useCallback(() => {
    setBhMounted(true);
    setInsideBH(true);
    setBhTransitioning(true);
    setBhEntryCount(c => c + 1);

    // Disable pointer events during the 1.4s fade-in transition
    // to prevent scroll momentum from zooming inside the polytope camera
    setTimeout(() => {
      setBhTransitioning(false);
    }, 1400);
  }, []);

  // Called from within R3F overlay when user scrolls out past OrbitControls maxDistance
  const handleBHExitIntent = useCallback(() => {
    setInsideBH(false);
    setPolytopeDeptId(null);
    setPolytopeInternalPath([]);
    setPolytopeRequestSelectDeptId(null);
    setPolytopeInternalBackStep(0);
    controllerRef.current?.exitBlackHole();
  }, []);

  // ── Company in-scene interior (logged-in company — no Universal Polytope overlay) ──
  const [insideCompanyInterior, setInsideCompanyInterior] = useState(false);

  const [companyInteriorPath, setCompanyInteriorPath] = useState<string[]>([]);

  const handleEnterCompanyInterior = useCallback((_company: any) => {
    controllerRef.current?.syncCompanyDepartments(polytopeStore.departments);
    setInsideCompanyInterior(true);
    setCompanyInteriorPath([]);
  }, [polytopeStore.departments]);

  const handleInteriorLevelChange = useCallback((_depth: number, path: string[]) => {
    setCompanyInteriorPath(path);
  }, []);

  useEffect(() => {
    controllerRef.current?.syncCompanyDepartments(polytopeStore.departments);
  }, [polytopeStore.departments]);

  // Called by NavigationManager whenever leaving COMPANY level (back button, ESC, or scroll-out)
  const handleExitCompanyPolytope = useCallback(() => {
    setInsideCompanyInterior(false);
    setCompanyInteriorPath([]);
    setInsidePlanetRoots(false);
    setInsideRootPolytope(false);
    setPlanetContext(null);
    setPlanetSearchQuery('');
    setRootPolytopeDeptId(null);
    setRootPolytopeInternalPath([]);
    setRootPolytopeBackStep(0);
    setActionWorkspace(null);
  }, []);

  // ── Company planet root systems (Industry OS) ──

  const [insidePlanetRoots, setInsidePlanetRoots] = useState(false);
  const [planetContext, setPlanetContext] = useState<CompanyPlanetContext | null>(null);
  const [planetSearchQuery, setPlanetSearchQuery] = useState('');
  const [planetIndustryColor, setPlanetIndustryColor] = useState('#C1AEFF');

  // ── Root → BDT internal node layout (no convex polytope hull) ──
  const [insideRootPolytope, setInsideRootPolytope] = useState(false);
  const [rootPolytopeDepts, setRootPolytopeDepts] = useState<UExternalNode[]>([]);
  const [rootPolytopeDeptId, setRootPolytopeDeptId] = useState<string | null>(null);
  const [rootPolytopeInternalPath, setRootPolytopeInternalPath] = useState<string[]>([]);
  const [rootPolytopeBackStep, setRootPolytopeBackStep] = useState(0);
  const [rootPolytopeSwitchKey, setRootPolytopeSwitchKey] = useState(0);
  const [polytopeEntryMode, setPolytopeEntryMode] = useState<'animate' | 'snap'>('animate');
  const [requestFocusRootId, setRequestFocusRootId] = useState<string | null>(null);
  const [zoomOutFromRootId, setZoomOutFromRootId] = useState<string | null>(null);
  const [isZoomingOut, setIsZoomingOut] = useState(false);

  const planetSessionRestoredRef = useRef(false);
  const isPlanetRestoringRef = useRef(false);
  const pendingPlanetRestoreRef = useRef<{
    rootId: string;
    internalPath: string[];
    rootLabel?: string;
    internalPathLabels?: string[];
  } | null>(null);
  const planetRestoreTimerRef = useRef<number | null>(null);
  const [planetRestoreDone, setPlanetRestoreDone] = useState(0);
  const [sessionRestoreActive, setSessionRestoreActive] = useState(false);
  const [restoreInternalPath, setRestoreInternalPath] = useState<string[]>([]);
  const restoreFocusTimerRef = useRef<number | null>(null);
  const restoreWatchdogTimerRef = useRef<number | null>(null);

  const finishPlanetRestore = useCallback(() => {
    isPlanetRestoringRef.current = false;
    setPlanetRestoreDone(n => n + 1);
  }, []);

  const clearPlanetRestoreTimers = useCallback(() => {
    if (planetRestoreTimerRef.current != null) {
      window.clearTimeout(planetRestoreTimerRef.current);
      planetRestoreTimerRef.current = null;
    }
    if (restoreFocusTimerRef.current != null) {
      window.clearTimeout(restoreFocusTimerRef.current);
      restoreFocusTimerRef.current = null;
    }
    if (restoreWatchdogTimerRef.current != null) {
      window.clearTimeout(restoreWatchdogTimerRef.current);
      restoreWatchdogTimerRef.current = null;
    }
  }, []);

  const activeRootDept = useMemo(
    () => rootPolytopeDepts.find(d => d.id === rootPolytopeDeptId && d.domain !== 'inactive') ?? null,
    [rootPolytopeDepts, rootPolytopeDeptId],
  );

  // Close the contextual add-node panel whenever the drill level or focused root
  // changes, so it never lingers with a stale parent target.
  useEffect(() => {
    setShowRootPolytopeAddNode(false);
  }, [rootPolytopeDeptId, rootPolytopeInternalPath.length]);

  const resolvePlanetRole = useCallback((): UserPlanetRole => {
    const role = localStorage.getItem('active_role');
    if (role === 'vc' || role === 'incubator') return 'vc';
    return (authRole === 'founder' || authRole === 'co_founder' || authRole === 'admin') ? 'founder' : 'career';
  }, [authRole]);

  const referenceIdFromCompany = useCallback((company: any): string | null => {
    if (company?.referenceCompanyId) return company.referenceCompanyId;
    if (typeof company?.id === 'string' && company.id.startsWith('ref-')) {
      return company.id.slice(4);
    }
    return null;
  }, []);

  const handleCompanyAwaitingRole = useCallback((ctx: {
    company: any;
    industry: UniverseIndustry;
    subdomain: UniverseSubdomain;
  }) => {
    const planetRole: UserPlanetRole =
      resolvePlanetRole();

    const referenceCompanyId = referenceIdFromCompany(ctx.company);
    if (!referenceCompanyId) {
      setPlanetContext({
        companyId: ctx.company.id,
        companyName: ctx.company.name,
        role: planetRole,
        roleLabel: getRoleLabel(planetRole),
        roots: [],
        needsResearch: true,
        subdomainId: ctx.subdomain.id,
        companyWebsite: ctx.company.raw?.website ?? ctx.company.website ?? null,
      });
      setPlanetIndustryColor(ctx.industry.color);
      setInsidePlanetRoots(true);
      return;
    }

    if (ctx.company.referenceRaw) {
      setPlanetContext(pendingReferenceCompanyToPlanetContext(ctx.company.referenceRaw, planetRole));
    } else {
      setPlanetContext({
        companyId: ctx.company.id,
        referenceCompanyId,
        companyName: ctx.company.name,
        role: planetRole,
        roleLabel: getRoleLabel(planetRole),
        roots: [],
        status: ctx.company.referenceStatus ?? 'pending',
        lastError: ctx.company.lastError ?? null,
        sourceUrl: ctx.company.sourceUrl ?? null,
      });
    }
    setPlanetIndustryColor(ctx.industry.color);
    setInsidePlanetRoots(true);

    void getReferenceCompany(referenceCompanyId)
      .then(detail => {
        setPlanetContext(referenceCompanyDetailToPlanetContext(detail, planetRole));
        refreshUniverse();
      })
      .catch(err => {
        setPlanetContext(prev => prev && prev.referenceCompanyId === referenceCompanyId
          ? {
              ...prev,
              status: 'failed',
              lastError: err instanceof Error ? err.message : 'Failed to load reference company twin.',
            }
          : prev);
      });

    // Signal to TopBar that a company planet has been entered this session
    sessionStorage.setItem('company_entered_in_3d', '1');
    window.dispatchEvent(new Event('company_entered_in_3d'));
  }, [referenceIdFromCompany, refreshUniverse, resolvePlanetRole]);

  const handleExitRootPolytope = useCallback(() => {
    clearPlanetRestoreTimers();
    pendingPlanetRestoreRef.current = null;
    isPlanetRestoringRef.current = false;
    setSessionRestoreActive(false);
    setRestoreInternalPath([]);
    // Start zoom-out animation: hide inner view, show outer view zoomed in, then animate out
    const exitingRootId = rootPolytopeDeptId;
    setInsideRootPolytope(false);
    setRootPolytopeInternalPath([]);
    setRootPolytopeBackStep(0);
    if (exitingRootId) {
      setZoomOutFromRootId(exitingRootId);
      setIsZoomingOut(true);
    }
    setRootPolytopeDeptId(null);
  }, [rootPolytopeDeptId, clearPlanetRestoreTimers]);

  const handleZoomOutComplete = useCallback(() => {
    setZoomOutFromRootId(null);
    setIsZoomingOut(false);
  }, []);

  const handleRoleChange = useCallback((role: UserPlanetRole) => {
    if (!planetContext) return;
    setPlanetContext({
      ...planetContext,
      role,
      roleLabel: getRoleLabel(role),
    });
    handleExitRootPolytope();
  }, [planetContext, handleExitRootPolytope]);

  const beginRootFocus = useCallback((rootId: string) => {
    if (!planetContext) return;
    setRequestFocusRootId(rootId);
  }, [planetContext]);

  const handleOpenRootPolytope = useCallback((rootId: string) => {
    if (!planetContext) return;
    setPolytopeEntryMode('animate');
    setRootPolytopeDepts(rootsToPolytopeDepartments(planetContext.roots));
    setRootPolytopeDeptId(rootId);
    setRootPolytopeInternalPath([]);
    setRootPolytopeSwitchKey(k => k + 1);
    setInsideRootPolytope(true);
    setRequestFocusRootId(null);
  }, [planetContext]);

  const handleRootFocusTransitionComplete = useCallback((rootId: string) => {
    setRequestFocusRootId(null);
    handleOpenRootPolytope(rootId);
    pendingPlanetRestoreRef.current = null;
  }, [handleOpenRootPolytope]);

  const snapRestoreToTarget = useCallback((
    ctx: CompanyPlanetContext,
    rootId: string,
    internalPath: string[],
  ) => {
    setPolytopeEntryMode('snap');
    setRootPolytopeDepts(rootsToPolytopeDepartments(ctx.roots));
    setRootPolytopeDeptId(rootId);
    setRootPolytopeInternalPath(internalPath);
    setRootPolytopeSwitchKey(k => k + 1);
    setInsideRootPolytope(true);
    setRequestFocusRootId(null);
    setSessionRestoreActive(false);
    setRestoreInternalPath([]);
    pendingPlanetRestoreRef.current = null;
    if (internalPath.length === 2) {
      setActionWorkspace({
        rootId,
        branchId: internalPath[0],
        actionId: internalPath[1],
      });
    } else {
      setActionWorkspace(null);
    }
  }, []);

  const handleRestoreDrillPath = useCallback((path: string[]) => {
    setRootPolytopeInternalPath(path);
    if (path.length === 2 && rootPolytopeDeptId) {
      setActionWorkspace({
        rootId: rootPolytopeDeptId,
        branchId: path[0],
        actionId: path[1],
      });
    } else if (path.length < 2) {
      setActionWorkspace(null);
    }
  }, [rootPolytopeDeptId]);

  const handleRestoreComplete = useCallback(() => {
    if (restoreWatchdogTimerRef.current != null) {
      window.clearTimeout(restoreWatchdogTimerRef.current);
      restoreWatchdogTimerRef.current = null;
    }
    setSessionRestoreActive(false);
    setRestoreInternalPath([]);
    finishPlanetRestore();
  }, [finishPlanetRestore]);

  const handleRestoreFocusMiss = useCallback(() => {
    if (planetContext) {
      const pending = pendingPlanetRestoreRef.current;
      const resolved = resolvePlanetRestoreTarget(planetContext, {
        rootPolytopeDeptId: pending?.rootId ?? null,
        rootPolytopeInternalPath: pending?.internalPath ?? restoreInternalPath,
        rootLabel: pending?.rootLabel,
        internalPathLabels: pending?.internalPathLabels,
      });
      if (resolved.rootId) {
        snapRestoreToTarget(planetContext, resolved.rootId, resolved.internalPath);
      }
    }
    handleRestoreComplete();
  }, [planetContext, restoreInternalPath, snapRestoreToTarget, handleRestoreComplete]);

  useEffect(() => () => clearPlanetRestoreTimers(), [clearPlanetRestoreTimers]);

  // Allow planet-state hydration when returning to /3d from another route (e.g. BDT).
  useEffect(() => {
    if (pathname !== '/3d') {
      planetSessionRestoredRef.current = false;
    }
  }, [pathname]);

  // Legacy BDT zoom-out used to regenerate mock roots. Keep the navigation safe,
  // but do not create reference-company data unless a backend reference id exists.
  useEffect(() => {
    const payload = (state as { enterPlanetRootsFromBdt?: {
      companyId: string;
      companyName: string;
      role: UserPlanetRole;
      referenceCompanyId?: string;
      industryColor?: string;
    } })?.enterPlanetRootsFromBdt;
    if (pathname !== '/3d' || !payload) return;

    clearPlanetRestoreTimers();
    pendingPlanetRestoreRef.current = null;
    isPlanetRestoringRef.current = false;
    setSessionRestoreActive(false);
    setRestoreInternalPath([]);

    setInsideBH(false);
    setInsideCompanyInterior(false);
    setInsideRootPolytope(false);
    setRootPolytopeDeptId(null);
    setRootPolytopeInternalPath([]);
    setRootPolytopeBackStep(0);
    setActionWorkspace(null);

    const referenceCompanyId = payload.referenceCompanyId
      ?? (payload.companyId.startsWith('ref-') ? payload.companyId.slice(4) : null);

    if (!referenceCompanyId) {
      setPlanetContext({
        companyId: payload.companyId,
        companyName: payload.companyName,
        role: payload.role,
        roleLabel: getRoleLabel(payload.role),
        roots: [],
        status: 'failed',
        lastError: 'No generated reference-company twin exists for this workspace company.',
      });
    } else {
      setPlanetContext({
        companyId: `ref-${referenceCompanyId}`,
        referenceCompanyId,
        companyName: payload.companyName,
        role: payload.role,
        roleLabel: getRoleLabel(payload.role),
        roots: [],
        status: 'pending',
      });
      void getReferenceCompany(referenceCompanyId)
        .then(detail => setPlanetContext(referenceCompanyDetailToPlanetContext(detail, payload.role)))
        .catch(err => setPlanetContext(prev => prev && prev.referenceCompanyId === referenceCompanyId
          ? { ...prev, status: 'failed', lastError: err instanceof Error ? err.message : 'Failed to restore reference twin.' }
          : prev));
    }
    setInsidePlanetRoots(true);
    if (payload.industryColor) {
      setPlanetIndustryColor(payload.industryColor);
    }

    savePlanetState({
      companyId: referenceCompanyId ? `ref-${referenceCompanyId}` : payload.companyId,
      referenceCompanyId: referenceCompanyId ?? undefined,
      companyName: payload.companyName,
      role: payload.role,
      insideRootPolytope: false,
      rootPolytopeDeptId: null,
      rootPolytopeInternalPath: [],
      industryColor: payload.industryColor,
    });

    sessionStorage.setItem('company_entered_in_3d', '1');
    window.dispatchEvent(new Event('company_entered_in_3d'));
    planetSessionRestoredRef.current = true;

    navigate('/3d', { replace: true, state: {} });
  }, [pathname, state, navigate, clearPlanetRestoreTimers]);

  const handleExitPlanetRoots = useCallback(() => {
    clearPlanetRestoreTimers();
    pendingPlanetRestoreRef.current = null;
    isPlanetRestoringRef.current = false;
    setSessionRestoreActive(false);
    setRestoreInternalPath([]);
    handleExitRootPolytope();
    setInsidePlanetRoots(false);
    setPlanetContext(null);
    setPlanetSearchQuery('');
    clearPlanetState();
    controllerRef.current?.goBack();
  }, [handleExitRootPolytope, clearPlanetRestoreTimers]);

  const handlePlanetRootSelect = useCallback((rootId: string) => {
    beginRootFocus(rootId);
  }, [beginRootFocus]);

  const handlePlanetBranchSelect = useCallback((rootId: string, branchId: string) => {
    beginRootFocus(rootId);
    window.setTimeout(() => setRootPolytopeInternalPath([branchId]), EXPAND_SETTLE_MS);
  }, [beginRootFocus]);

  // ── Action Node Workspace ──────────────────────────────────────────────────
  const [actionWorkspace, setActionWorkspace] = useState<{
    rootId: string;
    branchId: string;
    actionId: string;
  } | null>(null);

  const [delayedActionWorkspace, setDelayedActionWorkspace] = useState(actionWorkspace);

  useEffect(() => {
    if (actionWorkspace) {
      setDelayedActionWorkspace(actionWorkspace);
    } else {
      const t = setTimeout(() => setDelayedActionWorkspace(null), 700);
      return () => clearTimeout(t);
    }
  }, [actionWorkspace]);

  useEffect(() => {
    if (pathname !== '/3d' || planetSessionRestoredRef.current) return;

    if (state?.actionWorkspaceContext) {
      planetSessionRestoredRef.current = true;
      const item = state.actionWorkspaceContext;
      isPlanetRestoringRef.current = true;
      const referenceCompanyId =
        item.referenceCompanyId ??
        (typeof item.companyId === 'string' && item.companyId.startsWith('ref-') ? item.companyId.slice(4) : null);

      if (referenceCompanyId) {
        void getReferenceCompany(referenceCompanyId)
          .then(detail => {
            const ctx = referenceCompanyDetailToPlanetContext(detail, item.role);
            setPlanetContext(ctx);
            setInsidePlanetRoots(true);
            const { rootId, internalPath } = resolvePlanetRestoreTarget(ctx, {
              rootPolytopeDeptId: item.rootId,
              rootPolytopeInternalPath: [item.branchId, item.actionId],
            });
            if (rootId) {
              snapRestoreToTarget(
                ctx,
                rootId,
                internalPath.length >= 2 ? internalPath : [item.branchId, item.actionId],
              );
            }
            requestAnimationFrame(() => finishPlanetRestore());
          })
          .catch(() => finishPlanetRestore());
      } else {
        finishPlanetRestore();
      }

      // Clear state so it doesn't reopen if navigating back
      navigate('/3d', { replace: true, state: {} });
      return () => {
        planetSessionRestoredRef.current = false;
        clearPlanetRestoreTimers();
      };
    }

    const pState = loadPlanetState();
    if (!pState) return;

    planetSessionRestoredRef.current = true;
    isPlanetRestoringRef.current = true;

    const referenceCompanyId =
      pState.referenceCompanyId ??
      (pState.companyId.startsWith('ref-') ? pState.companyId.slice(4) : null);
    if (!referenceCompanyId) {
      clearPlanetState();
      requestAnimationFrame(() => finishPlanetRestore());
      return;
    }

    void getReferenceCompany(referenceCompanyId)
      .then(detail => {
        const ctx = referenceCompanyDetailToPlanetContext(detail, pState.role as UserPlanetRole);
        setPlanetContext(ctx);
        setInsidePlanetRoots(true);
        if (pState.industryColor) {
          setPlanetIndustryColor(pState.industryColor);
        }
        sessionStorage.setItem('company_entered_in_3d', '1');

        if (pState.insideRootPolytope && (pState.rootPolytopeDeptId || pState.rootLabel)) {
          const { rootId, internalPath } = resolvePlanetRestoreTarget(ctx, pState);
          if (rootId) {
            snapRestoreToTarget(ctx, rootId, internalPath);
          }
        }

        requestAnimationFrame(() => finishPlanetRestore());
      })
      .catch(() => {
        clearPlanetState();
        requestAnimationFrame(() => finishPlanetRestore());
      }
    );

    return () => {
      planetSessionRestoredRef.current = false;
      clearPlanetRestoreTimers();
    };
  }, [pathname, state, navigate, finishPlanetRestore, snapRestoreToTarget, clearPlanetRestoreTimers]);

  // Persist planet state on change
  useEffect(() => {
    if (insidePlanetRoots && planetContext && !isPlanetRestoringRef.current) {
      const { rootLabel, internalPathLabels } = getPlanetPathLabels(
        planetContext,
        rootPolytopeDeptId,
        rootPolytopeInternalPath,
      );
      savePlanetState({
        companyId: planetContext.companyId,
        referenceCompanyId: planetContext.referenceCompanyId,
        companyName: planetContext.companyName,
        role: planetContext.role,
        insideRootPolytope,
        rootPolytopeDeptId,
        rootPolytopeInternalPath,
        rootLabel,
        internalPathLabels,
        industryColor: planetIndustryColor,
      });
    } else if (!insidePlanetRoots && !isPlanetRestoringRef.current) {
      // Hydrate effect may still be applying saved state on the first paint after refresh.
      if (pathname === '/3d' && loadPlanetState()) return;
      clearPlanetState();
    }
  }, [
    insidePlanetRoots,
    planetContext,
    insideRootPolytope,
    rootPolytopeDeptId,
    rootPolytopeInternalPath,
    planetIndustryColor,
    planetRestoreDone,
    pathname,
  ]);

  // Keep polytope dept tree aligned with the live planet context (tag / role changes).
  useEffect(() => {
    if (!insideRootPolytope || !planetContext) return;
    setRootPolytopeDepts(rootsToPolytopeDepartments(planetContext.roots));
  }, [insideRootPolytope, planetContext]);

  const handleActionNodeClick = useCallback((rootId: string, branchId: string, actionId: string) => {
    if (!planetContext) return;
    setActionWorkspace({ rootId, branchId, actionId });
  }, [planetContext]);

  const handleCloseActionWorkspace = useCallback(() => {
    setActionWorkspace(null);
    setTimeout(() => {
      setRootPolytopeBackStep(c => c + 1);
    }, 400);
  }, []);

  // Resolve nodes from context for the workspace using delayed state for exit animation
  const resolvedWorkspaceNodes = useMemo(() => {
    if (!delayedActionWorkspace || !planetContext) return null;
    const root = planetContext.roots.find(r => r.id === delayedActionWorkspace.rootId);
    if (!root) return null;
    const branch = root.branches.find(b => b.id === delayedActionWorkspace.branchId);
    if (!branch) return null;
    const action = branch.actions.find(a => a.id === delayedActionWorkspace.actionId);
    if (!action) return null;
    return { root, branch, action };
  }, [delayedActionWorkspace, planetContext]);

  // Hide TopBar when workspace opens
  useEffect(() => {
    window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: !!actionWorkspace }));
    return () => {
      window.dispatchEvent(new CustomEvent('workspace_toggled', { detail: false }));
    };
  }, [actionWorkspace]);

  const handleExitCompanyInterior = useCallback(() => {
    controllerRef.current?.exitCompanyPolytope();
  }, []);

  // ── Create Company modal state ──
  const [createModal, setCreateModal] = useState<{
    industry: UniverseIndustry;
    subdomain: UniverseSubdomain;
    draftPlanetId: string | null;
  } | null>(null);

  /** Triggered from either the side panel "Add Company" button or the 3D sun "Create Company" button */
  const handleAddCompany = useCallback((industry: UniverseIndustry | any, subdomain: UniverseSubdomain | any) => {
    // Spawn a draft planet immediately
    const draftId = controllerRef.current?.spawnDraftCompany(industry.id, subdomain.id) ?? null;
    setCreateModal({ industry, subdomain, draftPlanetId: draftId });

    // After a short delay (planet spawn animation), fly to it and freeze orbits
    if (draftId) {
      setTimeout(() => {
        controllerRef.current?.focusDraftPlanet(draftId);
      }, 600);
    }
  }, []);

  // Called by the modal after backend creates a pending reference twin.
  const handleCompanyCreated = useCallback((result: { company: ReferenceCompany; job: ReferenceCompanyJob }) => {
    appendReferenceCompany(result.company);
    refreshUniverse();
    setCreateModal(null);
  }, [appendReferenceCompany, refreshUniverse]);

  // Called from the planet side panel when a live company has no reference twin yet.
  const handleResearchCompany = useCallback(async (url: string, subdomainId: string, classification: CompanyTag) => {
    const planetRole = resolvePlanetRole();
    const result = await createReferenceCompany({ url, subdomainId, classification });
    appendReferenceCompany(result.company);
    refreshUniverse();
    setPlanetContext(pendingReferenceCompanyToPlanetContext(result.company, planetRole, result.job));
  }, [appendReferenceCompany, refreshUniverse, resolvePlanetRole]);

  const handleCloseCreate = useCallback((_isCancel: boolean = true) => {
    // The placeholder planet is only a visual drafting aid. Backend data owns
    // the real pending reference planet after submit.
    if (createModal?.draftPlanetId) {
      controllerRef.current?.removeDraftCompany(createModal.draftPlanetId);
    }
    // Unfreeze orbits and fly camera back to subdomain overview
    controllerRef.current?.unfocusDraftPlanet();
    setCreateModal(null);
  }, [createModal]);

  useEffect(() => {
    const referenceCompanyId = planetContext?.referenceCompanyId;
    if (!insidePlanetRoots || !referenceCompanyId) return;
    if (planetContext.status !== 'pending' && planetContext.status !== 'running') return;

    let cancelled = false;
    const hydrate = async () => {
      try {
        const detail = await getReferenceCompany(referenceCompanyId);
        if (cancelled) return;
        setPlanetContext(referenceCompanyDetailToPlanetContext(detail, planetContext.role));
        refreshUniverse();
      } catch (err) {
        if (cancelled) return;
        setPlanetContext(prev => prev && prev.referenceCompanyId === referenceCompanyId
          ? {
              ...prev,
              status: 'failed',
              lastError: err instanceof Error ? err.message : 'Failed to refresh reference company status.',
            }
          : prev);
      }
    };

    const intervalId = window.setInterval(() => void hydrate(), 5000);
    void hydrate();
    return () => {
      cancelled = true;
      window.clearInterval(intervalId);
    };
  }, [
    insidePlanetRoots,
    planetContext?.referenceCompanyId,
    planetContext?.status,
    planetContext?.role,
    refreshUniverse,
  ]);

  const handleRefreshReferenceCompany = useCallback(async () => {
    if (!planetContext?.referenceCompanyId || !canManageReferenceCompanies) return;
    try {
      const result = await refreshReferenceCompany(planetContext.referenceCompanyId);
      setPlanetContext(pendingReferenceCompanyToPlanetContext(result.company, planetContext.role, result.job));
      appendReferenceCompany(result.company);
      refreshUniverse();
    } catch (err) {
      setPlanetContext(prev => prev
        ? {
            ...prev,
            status: 'failed',
            lastError: err instanceof Error ? err.message : 'Failed to start refresh.',
          }
        : prev);
    }
  }, [appendReferenceCompany, canManageReferenceCompanies, planetContext, refreshUniverse]);

  const handleCreateReferenceNode = useCallback(async (input: CreateReferenceCompanyNodeInput) => {
    const referenceCompanyId = planetContext?.referenceCompanyId;
    if (!referenceCompanyId || !canManageReferenceCompanies) return;
    await createReferenceCompanyNode(referenceCompanyId, input);
    // Re-fetch the planet so the new node renders everywhere: side panel, 2D/3D,
    // and the root-polytope drill view (which is derived from planetContext.roots).
    const detail = await getReferenceCompany(referenceCompanyId);
    const ctx = referenceCompanyDetailToPlanetContext(detail, planetContext.role);
    setPlanetContext(ctx);
    setRootPolytopeDepts(rootsToPolytopeDepartments(ctx.roots));
    refreshUniverse();
  }, [canManageReferenceCompanies, planetContext, refreshUniverse]);

  const handleDeleteReferenceCompany = useCallback(async () => {
    if (!planetContext?.referenceCompanyId || !canManageReferenceCompanies) return;
    const confirmed = window.confirm(`Delete the reference twin for ${planetContext.companyName}? This will remove its generated roots and citations.`);
    if (!confirmed) return;

    try {
      await deleteReferenceCompany(planetContext.referenceCompanyId);
      clearPlanetRestoreTimers();
      pendingPlanetRestoreRef.current = null;
      isPlanetRestoringRef.current = false;
      setSessionRestoreActive(false);
      setRestoreInternalPath([]);
      handleExitRootPolytope();
      setInsidePlanetRoots(false);
      setPlanetContext(null);
      setPlanetSearchQuery('');
      clearPlanetState();
      refreshUniverse();
      controllerRef.current?.goBack();
    } catch (err) {
      setPlanetContext(prev => prev
        ? {
            ...prev,
            status: 'failed',
            lastError: err instanceof Error ? err.message : 'Failed to delete reference twin.',
          }
        : prev);
    }
  }, [
    canManageReferenceCompanies,
    clearPlanetRestoreTimers,
    handleExitRootPolytope,
    planetContext?.companyName,
    planetContext?.referenceCompanyId,
    refreshUniverse,
  ]);

  const handleOpenWorkspace = useCallback(() => {
    if (twinWorkspacePhase !== 'closed' || insideBH || insideCompanyInterior) return;

    // ── Build entry context from current navigation state ──
    let ctx: WorkspaceEntryContext;

    if (insidePlanetRoots && planetContext) {
      // Company level — inside a company planet's root system
      ctx = {
        level: 'company',
        companyId: planetContext.companyId,
        companyName: planetContext.companyName,
        companyRole: planetContext.role,
        industryName: navPath.find(p => p.level === ZOOM_LEVELS.INDUSTRY)?.name,
        industryColor: (navPath.find(p => p.level === ZOOM_LEVELS.INDUSTRY)?.data as UniverseIndustry | undefined)?.color,
        subdomainName: navPath.find(p => p.level === ZOOM_LEVELS.SUBDOMAIN)?.name,
      };
    } else if (currentLevel === ZOOM_LEVELS.GALAXY) {
      // Universe level — pass summary of all industries + full hierarchy for in-workspace nav
      const allIndustries = data?.industries.map(ind => ({
        id: ind.id, name: ind.name, color: ind.color, description: ind.description,
        subdomains: ind.subdomains.map(sub => ({
          id: sub.id, name: sub.name, description: sub.description,
          companies: sub.companies.map(c => ({ id: c.id, name: c.name, description: c.description, stage: c.stage, employees: c.employees, isLive: c.isLive })),
        })),
      })) ?? [];
      ctx = {
        level: 'universe',
        subdomains: data?.industries.map(ind => ({
          id: ind.id,
          name: ind.name,
          description: ind.description,
          companyCount: ind.subdomains.reduce((sum, s) => sum + s.companies.length, 0),
          color: ind.color,
        })),
        totalCompanyCount: data?.industries.reduce(
          (sum, ind) => sum + ind.subdomains.reduce((s2, sub) => s2 + sub.companies.length, 0), 0
        ),
        allIndustries,
      };
    } else if (currentLevel === ZOOM_LEVELS.INDUSTRY) {
      const industryEntry = navPath[navPath.length - 1];
      const industry = industryEntry?.data as UniverseIndustry | undefined;
      const allIndustries = data?.industries.map(ind => ({
        id: ind.id, name: ind.name, color: ind.color, description: ind.description,
        subdomains: ind.subdomains.map(sub => ({
          id: sub.id, name: sub.name, description: sub.description,
          companies: sub.companies.map(c => ({ id: c.id, name: c.name, description: c.description, stage: c.stage, employees: c.employees, isLive: c.isLive })),
        })),
      })) ?? [];
      ctx = {
        level: 'industry',
        industryId: industryEntry?.id,
        industryName: industryEntry?.name,
        industryColor: industry?.color,
        industryDescription: industry?.description,
        subdomains: industry?.subdomains.map(s => ({
          id: s.id,
          name: s.name,
          description: s.description,
          companyCount: s.companies.length,
          color: industry.color,
        })),
        totalCompanyCount: industry?.subdomains.reduce((sum, s) => sum + s.companies.length, 0),
        allIndustries,
      };
    } else {
      // SUBDOMAIN or COMPANY level
      const lastEntry = navPath[navPath.length - 1];
      const industryEntry = navPath.find(p => p.level === ZOOM_LEVELS.GALAXY);
      const subdomain = lastEntry?.data as UniverseSubdomain | undefined;
      const industry = industryEntry?.data as UniverseIndustry | undefined;
      const allIndustries = data?.industries.map(ind => ({
        id: ind.id, name: ind.name, color: ind.color, description: ind.description,
        subdomains: ind.subdomains.map(sub => ({
          id: sub.id, name: sub.name, description: sub.description,
          companies: sub.companies.map(c => ({ id: c.id, name: c.name, description: c.description, stage: c.stage, employees: c.employees, isLive: c.isLive })),
        })),
      })) ?? [];
      ctx = {
        level: 'subdomain',
        industryId: industryEntry?.id,
        industryName: industryEntry?.name,
        industryColor: industry?.color,
        subdomainId: lastEntry?.id,
        subdomainName: lastEntry?.name,
        subdomainDescription: subdomain?.description,
        companies: subdomain?.companies.map(c => ({
          id: c.id,
          name: c.name,
          description: c.description,
          stage: c.stage,
          employees: c.employees,
          isLive: c.isLive,
        })),
        allIndustries,
      };
    }

    setWorkspaceEntryContext(ctx);

    if (insidePlanetRoots) {
      openWorkspacePendingRef.current = false;
      controllerRef.current?.openTwinWorkspaceFromSubdomain();
      setTwinWorkspacePhase('zooming');
      scheduleTwinWorkspacePanels(TWIN_WORKSPACE_CAMERA_MS);
    } else if (currentLevel === ZOOM_LEVELS.GALAXY) {
      openWorkspacePendingRef.current = true;
      controllerRef.current?.openTwinWorkspaceFromGalaxy();
      setTwinWorkspacePhase('zooming');
      scheduleTwinWorkspacePanels(TWIN_WORKSPACE_CAMERA_MS);
    } else if (currentLevel === ZOOM_LEVELS.INDUSTRY) {
      openWorkspacePendingRef.current = false;
      controllerRef.current?.openTwinWorkspaceFromIndustry();
      setTwinWorkspacePhase('zooming');
      scheduleTwinWorkspacePanels(TWIN_WORKSPACE_CAMERA_MS);
    } else {
      openWorkspacePendingRef.current = false;
      controllerRef.current?.openTwinWorkspaceFromSubdomain();
      setTwinWorkspacePhase('zooming');
      scheduleTwinWorkspacePanels(TWIN_WORKSPACE_CAMERA_MS);
    }
  }, [
    twinWorkspacePhase,
    insideBH,
    insideCompanyInterior,
    insidePlanetRoots,
    planetContext,
    currentLevel,
    navPath,
    data,
    scheduleTwinWorkspacePanels,
  ]);

  const handleCloseWorkspace = useCallback(() => {
    if (!isTwinWorkspaceActive(twinWorkspacePhase) || twinWorkspacePhase === 'closing') return;

    clearTwinWorkspaceTimers();
    openWorkspacePendingRef.current = false;

    if (twinWorkspacePhase === 'zooming') {
      setTwinWorkspacePhase('closed');
      return;
    }

    setTwinWorkspacePhase('closing');
    twinWorkspaceTimerRef.current = window.setTimeout(() => {
      setTwinWorkspacePhase('closed');
      twinWorkspaceTimerRef.current = null;
    }, TWIN_WORKSPACE_CLOSE_MS);
  }, [twinWorkspacePhase, clearTwinWorkspaceTimers]);

  useEffect(() => {
    if (pathname === '/3d') {
      const rafId = requestAnimationFrame(() => {
        controllerRef.current?.resize();
        if (!isTwinWorkspaceActive(twinWorkspacePhase)) {
          controllerRef.current?.restoreUniverseInteraction();
        }
      });
      return () => cancelAnimationFrame(rafId);
    }
    // We no longer clear state when leaving /3d, so that the 3D Twin state persists
    // when the user navigates away and comes back.
  }, [pathname, twinWorkspacePhase]);

  // Listen for signals from the action workspace (tab or inline):
  //  • ACTION_WORKSPACE_CLOSED → zoom back out
  //  • EXPORT_TO_WORKSPACE / request-open-workspace → open the product workspace
  useEffect(() => {
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type === 'ACTION_WORKSPACE_CLOSED') {
        setRootPolytopeBackStep(c => c + 1);
      } else if (event.data?.type === 'EXPORT_TO_WORKSPACE') {
        // If we have action node context, use it as the entry context
        if (event.data.rootLabel || event.data.actionLabel) {
          setWorkspaceEntryContext({
            level: 'node',
            companyId: planetContext?.companyId,
            companyName: planetContext?.companyName,
            companyRole: planetContext?.role,
            rootId: event.data.rootId,
            rootLabel: event.data.rootLabel,
            rootDescription: event.data.rootDescription,
            branchId: event.data.branchId,
            branchLabel: event.data.branchLabel,
            actionId: event.data.actionId,
            actionLabel: event.data.actionLabel,
            nodeHint: event.data.nodeHint,
            breadcrumbs: [planetContext?.companyName, event.data.rootLabel, event.data.branchLabel, event.data.actionLabel].filter(Boolean) as string[],
            industryName: navPath.find(p => p.level === ZOOM_LEVELS.INDUSTRY)?.name,
            industryColor: (navPath.find(p => p.level === ZOOM_LEVELS.INDUSTRY)?.data as UniverseIndustry | undefined)?.color,
          });
        }
        setActionWorkspace(null);
        handleOpenWorkspace();
      }
    };
    const onRequestOpen = () => {
      setActionWorkspace(null);
      handleOpenWorkspace();
    };
    window.addEventListener('message', onMessage);
    window.addEventListener('request-open-workspace', onRequestOpen);
    return () => {
      window.removeEventListener('message', onMessage);
      window.removeEventListener('request-open-workspace', onRequestOpen);
    };
  }, [handleOpenWorkspace, planetContext, navPath]);

  const handleNavigate = useCallback((path: NavPathEntry[], level: ZoomLevel) => {
    setNavPath([...path]);
    setCurrentLevel(level);
    setCreateModal(null);

    if (openWorkspacePendingRef.current && level === ZOOM_LEVELS.GALAXY) {
      openWorkspacePendingRef.current = false;
      controllerRef.current?.applyTwinWorkspaceFocus();
      scheduleTwinWorkspacePanels(TWIN_WORKSPACE_CAMERA_MS);
    }
  }, [scheduleTwinWorkspacePanels]);

  useEffect(() => {
    if (twinWorkspacePhase === 'open') {
      const rafId = requestAnimationFrame(() => controllerRef.current?.resize());
      return () => cancelAnimationFrame(rafId);
    }
  }, [twinWorkspacePhase]);

  const hoverTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const tagDropdownHoveredRef = useRef(false);

  const handleHover = useCallback((target: HoverTarget | null) => {
    if (target) {
      if (hoverTimeoutRef.current) {
        clearTimeout(hoverTimeoutRef.current);
        hoverTimeoutRef.current = null;
      }
      setHoverTarget(target);
    } else {
      hoverTimeoutRef.current = setTimeout(() => {
        if (!tagDropdownHoveredRef.current) {
          setHoverTarget(null);
        }
        hoverTimeoutRef.current = null;
      }, 400);
    }
  }, []);

  const handleDropdownMouseEnter = useCallback(() => {
    tagDropdownHoveredRef.current = true;
    if (hoverTimeoutRef.current) {
      clearTimeout(hoverTimeoutRef.current);
      hoverTimeoutRef.current = null;
    }
  }, []);

  const handleDropdownMouseLeave = useCallback(() => {
    tagDropdownHoveredRef.current = false;
    hoverTimeoutRef.current = setTimeout(() => {
      setHoverTarget(null);
      hoverTimeoutRef.current = null;
    }, 400);
  }, []);

  useEffect(() => {
    if (hoverTarget?.type === 'company') {
      controllerRef.current?.freezeSolarSystem();
    } else {
      controllerRef.current?.unfreezeSolarSystem();
    }
  }, [hoverTarget]);

  /** The 3D sun button fires this callback via UniverseController */
  const handleCreateFromSun = useCallback((industry: any, subdomain: any) => {
    handleAddCompany(industry, subdomain);
  }, [handleAddCompany]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (pathname !== '/3d') return;
      // Cmd+K or Ctrl+K
      if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === ' ')) {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
      if (e.key === 'Escape') {
        if (actionWorkspace) {
          handleCloseActionWorkspace();
          return;
        }
        if (isTwinWorkspaceActive(twinWorkspacePhase)) {
          e.preventDefault();
          handleCloseWorkspace();
          return;
        }
        if (insideRootPolytope) {
          if (rootPolytopeInternalPath.length > 0) {
            setRootPolytopeBackStep(c => c + 1);
          } else if (rootPolytopeDeptId) {
            handleExitRootPolytope();
          } else {
            handleExitRootPolytope();
          }
          return;
        }
        if (insidePlanetRoots && planetContext) {
          handleExitPlanetRoots();
          return;
        }
        if (createModal) {
          setCreateModal(null);
          return;
        }
        setSearchQuery('');
        searchInputRef.current?.blur();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [
    createModal,
    insideRootPolytope,
    insidePlanetRoots,
    planetContext,
    rootPolytopeInternalPath,
    rootPolytopeDeptId,
    handleExitRootPolytope,
    handleExitPlanetRoots,
    actionWorkspace,
    twinWorkspacePhase,
    handleCloseWorkspace,
    handleCloseActionWorkspace,
  ]);

  if (error) {
    return (
      <div className="fixed inset-0 flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-400 text-sm mb-2">Failed to load universe data</p>
          <p className="text-gray-500 text-xs">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 rounded-lg text-xs font-medium"
            style={{ background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)', color: '#161618' }}
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  const showInitialUniverseLoader = loading && !data;

  return (
    <div className="fixed inset-0 overflow-hidden">
      {/* Canvas */}
      {showInitialUniverseLoader ? (
        <div className="absolute inset-0 pt-14 flex flex-col items-center justify-center z-50">
          <Loader2 className="w-8 h-8 animate-spin mb-4" style={{ color: '#C1AEFF' }} />
          <p className="text-sm font-medium" style={{ color: '#C1AEFF' }}>Loading Universe...</p>
          <p className="text-xs text-gray-500 mt-1">
            Assembling industry galaxies
          </p>
        </div>
      ) : data ? (
        <div className="twin-universe-viewport">
          <UniverseCanvas
            data={data}
            onNavigate={handleNavigate}
            onHover={handleHover}
            onCreateCompany={handleCreateFromSun}
            onEnterBH={handleEnterBH}
            onExitBH={handleExitBH}
            onEnterCompanyInterior={handleEnterCompanyInterior}
            onInteriorLevelChange={handleInteriorLevelChange}
            onExitCompanyPolytope={handleExitCompanyPolytope}
            onCompanyAwaitingRole={handleCompanyAwaitingRole}
            controllerRef={controllerRef}
            voiceIntensityRef={intensityRef}
            onIndustryCoreVoiceToggle={handleIndustryCoreVoiceToggle}
          />
        </div>
      ) : null}

      {isRefreshing && data && (
        <div className="universe-refresh-chip">
          <Loader2 className="w-3 h-3 animate-spin" />
          <span>Syncing research</span>
        </div>
      )}

      {/* Interaction blocker — only covers the workspace panel area so the 3D peek zone stays interactive */}
      {isTwinWorkspaceActive(twinWorkspacePhase) && (
        <div
          className="twin-universe-interaction-blocker"
          style={{ top: '34vh', height: '66vh' }}
          aria-hidden
        />
      )}

      <TwinWorkspaceLayout phase={twinWorkspacePhase} onClose={handleCloseWorkspace} entryContext={workspaceEntryContext} />

      {/* ── Black Hole Interior: UniversalPolytope overlay ──
           visibility:hidden cascades to ALL children (including R3F canvas) so
           THREE.js canvas underneath receives events when overlay is not active.
           pointer-events:none alone does NOT cascade — children keep auto.
           Pattern: fade opacity first (1.4s), THEN flip visibility to hidden
           so the canvas is event-dead only after the visual fade completes. */}
      <div
        className="universe-bh-overlay"
        style={{
          opacity: insideBH ? 1 : 0,
          visibility: insideBH ? 'visible' : 'hidden',
          pointerEvents: insideBH && !bhTransitioning ? 'auto' : 'none',
          transition: insideBH
            ? 'opacity 1.4s ease-in-out'                          // entering: fade in, visible immediately
            : 'opacity 1.4s ease-in-out, visibility 0s 1.4s',    // exiting: fade then hide
        }}
      >
        {bhMounted && (
          <UniversalPolytope
            companyName={bhCompanyName}
            industryName={bhIndustryName}
            subdomainName={bhSubdomainName}
            storeScope="twin"
            onExitIntent={handleBHExitIntent}
            transparent={true}
            cameraResetTrigger={bhEntryCount + polytopeDraftResetTrigger}
            requestSelectDeptId={polytopeRequestSelectDeptId}
            onDepartmentChange={handlePolytopeDeptChange}
            onInternalPathChange={setPolytopeInternalPath}
            requestBackStep={polytopeInternalBackStep}
            draftDept={polytopeDraftDept}
            draftNodeScreenPosRef={polytopeDraftDeptScreenPosRef}
            draftInternalNode={polytopeDraftInternalNode}
            draftInternalNodeScreenPosRef={polytopeDraftInternalNodeScreenPosRef}
            draftMember={polytopeDraftMember}
            draftMemberScreenPosRef={polytopeDraftMemberScreenPosRef}
            departments={polytopeStore.departments}
            selectedInternalPath={polytopeInternalPath}
            enableCoreWorkspace={hasWritableDepartment}
            readOnly={!hasWritableDepartment}
            coreWorkspacePhase={polytopeWorkspacePhase}
            onCoreClickIntent={handlePolytopeCoreClick}
            onCoreDiveComplete={handlePolytopeDiveComplete}
            onCoreSurfaceComplete={handlePolytopeSurfaceComplete}
            voiceIntensityRef={intensityRef}
          />
        )}
      </div>



      {/* ── Company Planet 3D root map (after role pick) ── */}
      {/* Shift-up zone: animates translateY(-100%)+fade when workspace goes fullscreen,
          matching the ws-planet-zone behaviour on industry/subdomain pages. */}
      <div className="universe-planet-root-zone">
      {/* Inner div: owns opacity / visibility / right — transition string changes safely here */}
      <div
        style={{
          position: 'absolute',
          inset: 0,
          // Solid galaxy background on this container so it persists even when
          // CompanyPlanet3DView unmounts, preventing universe planets from bleeding through.
          background: 'radial-gradient(ellipse at 50% 40%, rgba(18,10,36,1) 0%, rgba(2,2,6,1) 65%)',
          opacity: (insidePlanetRoots && planetContext) || isZoomingOut ? 1 : 0,
          visibility: (insidePlanetRoots && planetContext) || isZoomingOut ? 'visible' : 'hidden',
          pointerEvents: (insidePlanetRoots && planetContext && !isZoomingOut) ? 'auto' : 'none',
          transition: (insidePlanetRoots && planetContext) || isZoomingOut
            ? 'opacity 0.4s ease-in-out, right 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            : 'opacity 0.4s ease-in-out, visibility 0s 0.4s, right 0.6s cubic-bezier(0.16, 1, 0.3, 1)',
          right: (insideRootPolytope && actionWorkspace) ? '75vw' : '0',
        }}
      >
        {planetContext && (
          <CompanyPlanet3DView
            context={planetContext}
            depth={0}
            path={[]}
            isWorkspaceOpen={isTwinWorkspaceActive(twinWorkspacePhase)}
            requestFocusRootId={requestFocusRootId}
            onFocusTransitionComplete={handleRootFocusTransitionComplete}
            onDrillInto={() => { }}
            onDrillBack={() => { }}
            onActionNodeClick={handleActionNodeClick}
            industryColor={planetIndustryColor}
            zoomOutFromRootId={zoomOutFromRootId}
            onZoomOutComplete={handleZoomOutComplete}
            
            // Unified BDT internal nodes props
            insideRootPolytope={insideRootPolytope}
            activeRootDept={activeRootDept}
            rootPolytopeInternalPath={rootPolytopeInternalPath}
            onInternalPathChange={(path) => {
              setRootPolytopeInternalPath(path);
              if (path.length === 2) {
                handleActionNodeClick(activeRootDept!.id, path[0], path[1]);
              } else {
                setActionWorkspace(null);
              }
            }}
            rootPolytopeBackStep={rootPolytopeBackStep}
            rootSwitchKey={rootPolytopeSwitchKey}
            polytopeEntryMode={polytopeEntryMode}
            onPolytopeEntryApplied={() => setPolytopeEntryMode('animate')}
            onBack={handleExitRootPolytope}
            sessionRestoreActive={sessionRestoreActive}
            restoreInternalPath={restoreInternalPath}
            onRestoreDrillPath={handleRestoreDrillPath}
            onRestoreComplete={handleRestoreComplete}
            onRestoreFocusMiss={handleRestoreFocusMiss}
          />
        )}
      </div>
      </div>{/* /universe-planet-root-zone */}

      {/* ── Create Company Floating Panel ── */}
      {createModal && (
        <CreateCompanyModal
          industryId={createModal.industry.id}
          subdomainId={createModal.subdomain.id}
          subdomainName={createModal.subdomain.name}
          industryName={createModal.industry.name}
          industryColor={createModal.industry.color}
          draftPlanetId={createModal.draftPlanetId}
          controllerRef={controllerRef}
          onClose={handleCloseCreate}
          onCreated={handleCompanyCreated}
        />
      )}

      {/* Bottom-left column: hidden when create modal active, drafting, or action workspace open */}
      {!createModal && !polytopeDraftDept && !polytopeDraftInternalNode && !actionWorkspace && (
        <>
          {insideRootPolytope && activeRootDept ? (
            <div
              className="absolute bottom-6 left-4 z-20 flex flex-col items-start gap-3"
              style={{
                opacity: isTwinWorkspaceActive(twinWorkspacePhase) ? 0 : 1,
                pointerEvents: isTwinWorkspaceActive(twinWorkspacePhase) ? 'none' : 'auto',
                transform: isTwinWorkspaceActive(twinWorkspacePhase) ? 'translateY(8px)' : 'translateY(0)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}
            >
              <PolytopeSidePanel
                departments={[activeRootDept]}
                selectedDeptId={activeRootDept.id}
                onDeptSelect={() => handleExitRootPolytope()}
                selectedInternalPath={rootPolytopeInternalPath}
                onInternalBack={() => setRootPolytopeBackStep(c => c + 1)}
                onExitToSubdomain={handleExitRootPolytope}
                exitToSubdomainLabel="2D root map"
                onNodeSelect={(path) => {
                  setRootPolytopeInternalPath(path);
                  if (path.length === 2) {
                    handleActionNodeClick(activeRootDept.id, path[0], path[1]);
                  }
                }}
                // Root polytope is a derived, read-only view of planet/BDT roots
                // (no store or write path) — suppress edit affordances like "Add Node".
                canEdit={false}
                canCreateDepartment={false}
              />

              {/* IDT contextual add-node: only on reference-company planets, for admins,
                  and only while drilled into a root (branch level) or branch (action level). */}
              {canManageReferenceCompanies && planetContext?.referenceCompanyId && rootPolytopeInternalPath.length < 2 && (() => {
                const atBranchLevel = rootPolytopeInternalPath.length === 0;
                const parentBranch = atBranchLevel
                  ? null
                  : activeRootDept.internalNodes.find(n => n.id === rootPolytopeInternalPath[0]) ?? null;
                const target = atBranchLevel
                  ? { nodeKind: 'branch' as const, parentNodeId: activeRootDept.id, parentLabel: activeRootDept.label }
                  : parentBranch
                    ? { nodeKind: 'action' as const, parentNodeId: parentBranch.id, parentLabel: parentBranch.label }
                    : null;
                if (!target) return null;
                return showRootPolytopeAddNode ? (
                  <AddReferenceNodePanel
                    key={`${target.nodeKind}-${target.parentNodeId}`}
                    nodeKind={target.nodeKind}
                    parentNodeId={target.parentNodeId}
                    parentLabel={target.parentLabel}
                    accentColor={planetIndustryColor}
                    onClose={() => setShowRootPolytopeAddNode(false)}
                    onCreate={async (input) => {
                      await handleCreateReferenceNode(input);
                    }}
                  />
                ) : (
                  <button
                    type="button"
                    onClick={() => setShowRootPolytopeAddNode(true)}
                    className="flex items-center justify-center gap-1.5 px-2.5 py-2 rounded-lg text-[11px] font-semibold transition-all"
                    style={{ width: '196px', background: `${planetIndustryColor}1f`, border: `1px solid ${planetIndustryColor}44`, color: planetIndustryColor }}
                  >
                    <Plus className="w-3.5 h-3.5" />
                    Add {target.nodeKind === 'branch' ? 'node' : 'action'}
                  </button>
                );
              })()}
            </div>
          ) : insidePlanetRoots && planetContext ? (
            <div
              className="absolute bottom-6 left-4 z-20 flex flex-col items-start gap-3"
              style={{
                opacity: isTwinWorkspaceActive(twinWorkspacePhase) ? 0 : 1,
                pointerEvents: isTwinWorkspaceActive(twinWorkspacePhase) ? 'none' : 'auto',
                transform: isTwinWorkspaceActive(twinWorkspacePhase) ? 'translateY(8px)' : 'translateY(0)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}
            >
              <CompanyPlanetSidePanel
                context={planetContext}
                depth={0}
                path={[]}
                onRootSelect={handlePlanetRootSelect}
                onBranchSelect={handlePlanetBranchSelect}
                onActionSelect={handleActionNodeClick}
                onDrillBack={() => { }}
                onExitToSubdomain={handleExitPlanetRoots}
                exitToSubdomainLabel={navPath.find(p => p.level === 'subdomain')?.name ?? 'Subdomain'}
                searchQuery={planetSearchQuery}
                setSearchQuery={setPlanetSearchQuery}
                industryColor={planetIndustryColor}
                onRoleChange={handleRoleChange}
                onRefresh={handleRefreshReferenceCompany}
                canRefresh={canManageReferenceCompanies && Boolean(planetContext.referenceCompanyId)}
                onDelete={handleDeleteReferenceCompany}
                canDelete={canManageReferenceCompanies && Boolean(planetContext.referenceCompanyId)}
                onResearchCompany={handleResearchCompany}
                onClassificationChange={(tag) => {
                  setPlanetContext(prev => prev ? { ...prev, classification: tag } : prev);
                }}
              />
            </div>
          ) : (insideBH || insideCompanyInterior) && voiceState === 'idle' ? (
            <div
              className="absolute bottom-6 left-4 z-20 flex flex-col items-start gap-3"
              style={{
                opacity: isTwinWorkspaceActive(twinWorkspacePhase) ? 0 : 1,
                pointerEvents: isTwinWorkspaceActive(twinWorkspacePhase) ? 'none' : 'auto',
                transform: isTwinWorkspaceActive(twinWorkspacePhase) ? 'translateY(8px)' : 'translateY(0)',
                transition: 'opacity 0.4s ease, transform 0.4s ease',
              }}
            >
              <PolytopeSidePanel
                departments={polytopeStore.departments}
                lockedDepartments={polytopeStore.lockedDepartments}
                selectedDeptId={insideBH ? polytopeDeptId : (companyInteriorPath[0] ?? null)}
                onDeptSelect={insideBH ? handlePolytopeSidebarDeptSelect : (id) => {
                  if (id === null) {
                    controllerRef.current?.drillInteriorBack?.();
                  }
                }}
                selectedInternalPath={insideBH ? polytopeInternalPath : companyInteriorPath.slice(1)}
                onAddDepartment={handlePolytopeAddDepartment}
                onAddNode={handlePolytopeAddNode}
                onInternalBack={insideBH
                  ? () => setPolytopeInternalBackStep(c => c + 1)
                  : () => controllerRef.current?.drillInteriorBack?.()
                }
                onExitToSubdomain={insideCompanyInterior ? handleExitCompanyInterior : handleBHExitIntent}
                exitToSubdomainLabel={
                  insideCompanyInterior
                    ? (navPath.find(p => p.level === 'subdomain')?.name ?? 'Subdomain')
                    : 'Galaxy'
                }
                onUpdateDepartment={polytopeStore.updateDepartment}
                onDeleteDepartment={polytopeStore.deleteDepartment}
                onUpdateNode={polytopeStore.updateNode}
                onDeleteNode={polytopeStore.deleteNode}
                onNodeSelect={insideBH ? setPolytopeInternalPath : () => { }}
                onEditDepartment={handleEditDepartment}
                onEditNode={handleEditNode}
                onDeleteDepartmentClick={handleDeleteDepartmentClick}
                onDeleteNodeClick={handleDeleteNodeClick}
                canEdit={hasWritableDepartment}
                canCreateDepartment={canCreateDepartments}
              />
            </div>
          ) : twinWorkspacePhase === 'closed' || twinWorkspacePhase === 'zooming' ? (
            <div
              className={`universe-galaxy-sidebar-host universe-galaxy-sidebar-host--float ${twinWorkspacePhase === 'zooming' ? 'universe-galaxy-sidebar-host--exit' : ''
                }`}
            >
              <UniverseGalaxySidebar
                data={data}
                navPath={navPath}
                currentLevel={currentLevel}
                controllerRef={controllerRef}
                onAddCompany={handleAddCompany}
                canAddCompany={canManageReferenceCompanies}
                searchQuery={searchQuery}
                setSearchQuery={setSearchQuery}
                searchInputRef={searchInputRef}
                canReadEcosystem={canRead('ecosystem')}
                onNavigateEcosystem={path => navigate(path)}
                onBackClick={() => {
                  if (voiceState !== 'idle') {
                    toggle();
                  } else {
                    controllerRef.current?.goBack();
                  }
                }}
              />
            </div>
          ) : null}
        </>
      )}

      {/* PolytopeManager modal for BH polytope — only for edit/delete flows */}
      <PolytopeManager
        departments={polytopeStore.departments}
        onAddDepartment={polytopeStore.addDepartment}
        onUpdateDepartment={polytopeStore.updateDepartment}
        onDeleteDepartment={(id) => {
          if (insideBH && polytopeDeptId === id) {
            setPolytopeDeptId(null);
            setPolytopeRequestSelectDeptId(null);
          }
          void polytopeStore.deleteDepartment(id);
          controllerRef.current?.syncCompanyDepartments(polytopeStore.departments);
        }}
        onAddNode={polytopeStore.addNode}
        onUpdateNode={polytopeStore.updateNode}
        onDeleteNode={polytopeStore.deleteNode}
        forceOpen={polytopeManagerOpen}
        forcedView={polytopeManagerView}
        onForcedClose={() => setPolytopeManagerOpen(false)}
      />

      {/* Draft Dept Creation Panel — BH/Company polytope */}
      {(insideBH || insideCompanyInterior) && canCreateDepartments && polytopeDraftDept && (
        <CreateDepartmentPanel
          mode="department"
          draftNodeScreenPosRef={polytopeDraftDeptScreenPosRef}
          onDraftUpdate={(patch) => setPolytopeDraftDept(prev => prev ? { ...prev, ...patch } : prev)}
          onClose={(isCancel) => {
            if (isCancel) {
              setPolytopeDraftDept(null);
              setPolytopeRequestSelectDeptId(null);
              setPolytopeDraftResetTrigger(c => c + 1);
            }
          }}
          onCreated={async (data) => {
            const saved = await polytopeStore.addDepartment(data as Omit<UExternalNode, 'id' | 'internalNodes' | 'isDraft'>);
            setPolytopeDraftDept(null);
            setPolytopeDraftResetTrigger(c => c + 1);
            setPolytopeDeptId(saved.id);
            setPolytopeRequestSelectDeptId(saved.id);
          }}
        />
      )}

      {/* Draft Internal Node Creation Panel — BH/Company polytope */}
      {(insideBH || insideCompanyInterior) && polytopeDraftInternalNode && (() => {
        const dept = polytopeStore.departments.find(d => d.id === polytopeDraftInternalNode.deptId);
        if (!dept || !canWriteDept(dept)) return null;
        return (
          <CreateDepartmentPanel
            mode="node"
            dept={dept}
            draftNodeScreenPosRef={polytopeDraftInternalNodeScreenPosRef}
            onDraftUpdate={(patch) => setPolytopeDraftInternalNode(prev => prev ? { ...prev, node: { ...prev.node, ...patch } } : prev)}
            onClose={(isCancel) => {
              if (isCancel) {
                setPolytopeDraftInternalNode(null);
              }
            }}
            onCreated={async (data) => {
              const deptId = polytopeDraftInternalNode.deptId;
              // BH uses polytopeInternalPath; company interior tracks its own drill path.
              const path = insideBH ? polytopeInternalPath : companyInteriorPath.slice(1);
              await polytopeStore.addNode(deptId, data as Omit<UInternalNode, 'id' | 'children'>, path);
              setPolytopeDraftInternalNode(null);
              setPolytopeDeptId(deptId);
            }}
          />
        );
      })()}

      {/* Draft Member Creation Panel — BH/Company polytope */}
      {/* Floating tooltip above industry core — "Click to interact with WorkOS AI" */}
      <div
        className={`absolute z-30 pointer-events-none transition duration-300 ease-[cubic-bezier(0.175,0.885,0.32,1.275)]`}
        style={{
          left: coreTooltip.x,
          top: coreTooltip.y - (coreTooltip.level === 'subdomain' ? 50 : 90),
          transform: `translateX(-50%) scale(${coreTooltip.visible ? 1 : 0.5}) translateY(${coreTooltip.visible ? 0 : 20}px)`,
          transformOrigin: 'bottom center',
          opacity: coreTooltip.visible ? 1 : 0,
          visibility: (coreTooltip.x === 0 && coreTooltip.y === 0) ? 'hidden' : 'visible'
        }}
      >
        <div className="whitespace-nowrap">
          <p className="text-[11px] font-medium text-center" style={{ color: coreTooltip.color, textShadow: `0px 2px 4px rgba(0,0,0,0.8), 0px 0px 2px ${coreTooltip.color}` }}>Click to interact with WorkOS AI</p>
        </div>
      </div>
      {/* Hover detail panel — right side */}
      {hoverTarget && hoverTarget.type && hoverTarget.type !== 'company' && hoverTarget.type !== 'core' && (
        <div
          className="absolute top-18 right-6 w-60 p-4 z-20 rounded-xl border border-slate-700/40 backdrop-blur-xl"
          style={{ background: 'rgba(0, 0, 0, 0.75)' }}
        >
          <span className="text-[10px] px-2 py-0.5 rounded-full bg-purple-500/15 text-purple-300 mb-2 inline-block">
            {hoverTarget.type}
          </span>
          <h3 className="text-sm font-semibold text-white mt-1">
            {hoverTarget.nodeLabel
              || hoverTarget.industry?.name
              || hoverTarget.subdomain?.name
              || hoverTarget.company?.name
              || hoverTarget.department?.name
              || ''}
          </h3>
          {(hoverTarget.industry?.description || hoverTarget.subdomain?.description || hoverTarget.company?.description) && (
            <p className="text-xs text-gray-400 mt-1 line-clamp-3">
              {hoverTarget.industry?.description || hoverTarget.subdomain?.description || hoverTarget.company?.description}
            </p>
          )}
          {hoverTarget.company?.employees && (
            <div className="mt-2 flex gap-2">
              <div className="bg-white/5 rounded-lg py-1 px-2">
                <span className="text-[9px] text-gray-500">Employees</span>
                <p className="text-xs font-medium text-white">{hoverTarget.company.employees}</p>
              </div>
              {hoverTarget.company?.funding && (
                <div className="bg-white/5 rounded-lg py-1 px-2">
                  <span className="text-[9px] text-gray-500">Stage</span>
                  <p className="text-xs font-medium text-white">{hoverTarget.company.funding}</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* Floating Tag Dropdown for Companies in 3D Canvas */}
      {hoverTarget && hoverTarget.type === 'company' && hoverTarget.screenX != null && hoverTarget.screenY != null && (
        <div
          className="absolute z-30 w-48"
          style={{
            left: hoverTarget.screenX,
            top: hoverTarget.screenY + 30, // Positioned slightly below the planet
            transform: 'translateX(-50%)',
            pointerEvents: 'auto'
          }}
          onMouseEnter={handleDropdownMouseEnter}
          onMouseLeave={handleDropdownMouseLeave}
        >
          <div className="bg-black/80 backdrop-blur-md p-1.5 rounded-xl border border-white/10 shadow-2xl">
            <h3 className="text-xs font-bold text-white mb-1.5 px-1 truncate text-center">
              {hoverTarget.company?.name}
            </h3>
            <CompanyTagDropdown
              companyId={hoverTarget.company?.id}
              companyName={hoverTarget.company?.name}
              industryColor={hoverTarget.industry?.color}
            />
          </div>
        </div>
      )}



      {/* Open workspace — bottom center (visible at all navigation levels except BH/company interior) */}
      {!loading && data && !createModal && !polytopeDraftDept && !polytopeDraftInternalNode && !insideBH && !insideCompanyInterior && twinWorkspacePhase === 'closed' && (
        <OpenWorkspaceCue onClick={handleOpenWorkspace} />
      )}

      {/* Keyboard hint */}
      <div
        className="absolute bottom-4 right-6 text-[10px] z-10 px-3 py-1 rounded-lg backdrop-blur-md"
        style={{ background: 'rgba(0,0,0,0.45)', color: '#4b5563' }}
      >
        {isTwinWorkspaceActive(twinWorkspacePhase)
          ? 'ESC to close workspace'
          : 'ESC to go back · Scroll to zoom · Click to explore'}
      </div>

      {/* ── Action Node Workspace Overlay ── */}
      {delayedActionWorkspace && resolvedWorkspaceNodes && planetContext && (
        <ActionNodeWorkspace
          key={`${delayedActionWorkspace.rootId}-${delayedActionWorkspace.branchId}-${delayedActionWorkspace.actionId}`}
          actionNode={resolvedWorkspaceNodes.action}
          branchNode={resolvedWorkspaceNodes.branch}
          rootNode={resolvedWorkspaceNodes.root}
          context={planetContext}
          isOpen={!!actionWorkspace}
          onClose={handleCloseActionWorkspace}
        />
      )}

      {/* ── Drag to Workspace Overlay ── */}
      <DragWorkspaceOverlay
        planetContext={planetContext}
        activeRootDept={activeRootDept}
        internalPath={rootPolytopeInternalPath}
      />

      {/* Back button when Voice AI is active inside BH */}
      {insideBH && voiceState !== 'idle' && (
        <button
          onClick={() => toggle()}
          className="fixed top-20 left-6 z-60 flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-purple-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          &larr; Back to Polytope
        </button>
      )}
    </div>
  );
}
