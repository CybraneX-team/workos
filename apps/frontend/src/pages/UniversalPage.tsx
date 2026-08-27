import { useState, useRef, useCallback, useLayoutEffect, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import UniversalPolytope from '../components/UniversalPolytope';
import { PolytopeSidePanel } from '../components/PolytopeSidePanel';
import { usePolytopeStore } from '../lib/usePolytopeStore';
import type { UExternalNode, UInternalNode } from '../lib/usePolytopeStore';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/db/companies';
import type { CoreWorkspacePhase } from '../lib/coreWorkspaceTransition';
import type { CoreDestination } from '../lib/coreWorkspaceTransition';
import { SupercycleScene } from '../components/supercycle/SupercycleScene';
import type { SupercycleRouteStyle } from '../components/supercycle/SupercycleScene';
import { SupercycleCycleEditor } from '../components/supercycle/SupercycleCycleEditor';
import { DepartmentCycleEditor } from '../components/supercycle/DepartmentCycleEditor';
import {
  DEFAULT_ARCHETYPE,
  SUPERCYCLE_ARCHETYPES,
  SUPERCYCLE_ARCHETYPE_LIST,
  SUPERCYCLE_LABEL,
  type SupercycleArchetypeId,
  type SupercycleInstance,
} from '../lib/supercycleData';
import { instanceHealth, usePmsStore } from '../lib/usePmsStore';
import { getAllIndustries } from '../lib/db/industries';
import { getAllSubdomains } from '../lib/db/subdomains';
import { useVoice } from '../context/VoiceContext';
import { BdtActionWorkspace } from '../components/workspace/BdtActionWorkspace';
import { BdtFormWorkspace } from '../components/workspace/BdtFormWorkspace';
import { isBdtWorkspaceLeafNode } from '../lib/usePolytopeStore';
import { canReadDept, canWriteDept as canWriteDeptHelper } from '../lib/bdtTrailRbac';
import { useWorkflowTrail } from '../lib/useWorkflowTrail';
import { useBdtSavedTrails } from '../lib/useBdtSavedTrails';
import type { UserPlanetRole } from '../data/companyPlanetRoots';
import { bdtTasks, type BdtTask } from '../lib/db/bdtTasks';

export default function UniversalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const replayTrailId = searchParams.get('replayTrail');
  const focusKey = searchParams.get('focus');
  const returnCycleId = searchParams.get('supercycle');
  const returnPlanetId = searchParams.get('planet');
  const returnDepartmentCycleId = searchParams.get('departmentCycle');
  const returnIslandStage = searchParams.get('islandStage');
  const returnIslandIndexParam = Number.parseInt(searchParams.get('islandIndex') ?? '', 10);
  const returnArchetypeParam = searchParams.get('archetype');
  const returnArchetypeId: SupercycleArchetypeId = returnArchetypeParam && returnArchetypeParam in SUPERCYCLE_ARCHETYPES
    ? returnArchetypeParam as SupercycleArchetypeId
    : DEFAULT_ARCHETYPE;
  const { user, profile, canRead, canWrite, role: authRole } = useAuth();
  const canCreateDepartments = canWrite('twin') && canWrite('team');
  const { company } = useCompany(profile?.company_id);
  const pms = usePmsStore(profile?.company_id);
  const store = usePolytopeStore('bdt');
  const { sendContextUpdate, voiceState, toggle, intensityRef } = useVoice();

  const {
    trailSession,
    isTrailActive,
    startTrail,
    appendStop,
    undoLastStop,
    enrichCurrentStop,
    cancelTrail,
  } = useWorkflowTrail();

  const {
    savedTrails,
    saveTrail,
  } = useBdtSavedTrails();

  // --- Replay State & Logic ---
  const [replayStepIndex, setReplayStepIndex] = useState(0);
  const [showCommercialMyWork, setShowCommercialMyWork] = useState(false);
  const [pendingSupercycleOpen, setPendingSupercycleOpen] = useState<{ departmentId: string; nodeId: string } | null>(null);

  const replayTrail = useMemo(() => {
    if (!replayTrailId) return null;
    return savedTrails.find(t => t.id === replayTrailId) || null;
  }, [replayTrailId, savedTrails]);

  const isReplayMode = !!replayTrail;

  const handleExitReplay = useCallback(() => {
    setSearchParams(prev => {
      const next = new URLSearchParams(prev);
      next.delete('replayTrail');
      return next;
    });
  }, [setSearchParams]);

  const handleReplayNext = useCallback(() => {
    if (!replayTrail) return;
    if (replayStepIndex < replayTrail.stops.length) {
      const nextIndex = replayStepIndex + 1;
      const targetStop = replayTrail.stops[nextIndex - 1];
      const targetDept = store.departments.find(d => d.id === targetStop.deptId);
      
      if (!targetDept || !canReadDept(targetDept)) {
        alert(`Access to department "${targetStop.deptLabel}" is restricted. Skipping this step.`);
        setReplayStepIndex(nextIndex);
      } else {
        setReplayStepIndex(nextIndex);
      }
    }
  }, [replayTrail, replayStepIndex, store.departments]);

  const handleReplayPrev = useCallback(() => {
    if (!replayTrail) return;
    if (replayStepIndex > 0) {
      const prevIndex = replayStepIndex - 1;
      if (prevIndex === 0) {
        const anchorDept = store.departments.find(d => d.id === replayTrail.anchor.deptId);
        if (anchorDept && !canReadDept(anchorDept)) {
          alert(`Access to anchor department "${replayTrail.anchor.deptLabel}" is restricted.`);
        } else {
          setReplayStepIndex(0);
        }
      } else {
        const targetStop = replayTrail.stops[prevIndex - 1];
        const targetDept = store.departments.find(d => d.id === targetStop.deptId);
        if (!targetDept || !canReadDept(targetDept)) {
          alert(`Access to department "${targetStop.deptLabel}" is restricted. Skipping this step.`);
          setReplayStepIndex(prevIndex);
        } else {
          setReplayStepIndex(prevIndex);
        }
      }
    }
  }, [replayTrail, replayStepIndex, store.departments]);

  // Reset replay step when path changes
  useEffect(() => {
    setReplayStepIndex(0);
  }, [replayTrailId]);

  // Navigate along replay route
  useEffect(() => {
    if (!replayTrail || !store.loaded) return;

    if (replayStepIndex === 0) {
      // Anchor
      const anchor = replayTrail.anchor;
      const dept = store.departments.find(d => d.id === anchor.deptId);
      if (dept && canReadDept(dept)) {
        setSelectedDeptId(anchor.deptId);
        setRequestSelectDeptId(anchor.deptId);
        setInternalPath(anchor.internalPath || []);
        setSelectDeptNonce(n => n + 1);
      } else {
        alert(`Trail unavailable — access revoked for department "${anchor.deptLabel}".`);
        handleExitReplay();
      }
    } else {
      const stop = replayTrail.stops[replayStepIndex - 1];
      const dept = store.departments.find(d => d.id === stop.deptId);
      if (dept && canReadDept(dept)) {
        setSelectedDeptId(stop.deptId);
        setRequestSelectDeptId(stop.deptId);
        setInternalPath(stop.internalPath || []);
        setSelectDeptNonce(n => n + 1);
      } else {
        alert(`Access revoked for department "${stop.deptLabel}". Exiting replay.`);
        handleExitReplay();
      }
    }
  }, [replayTrail, replayStepIndex, store.loaded, store.departments, handleExitReplay]);

  // --- Leave Guards ---

  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (isTrailActive) {
        e.preventDefault();
        e.returnValue = 'You have an active workflow trail session. Do you want to leave and discard it?';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [isTrailActive]);

  if (!canRead('twin')) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#161618] text-white">
        <div className="text-center max-w-md px-6">
          <p className="text-white text-lg font-semibold mb-2">Access Restricted</p>
          <p className="text-sm text-slate-400">
            You do not have permission to access the Business Digital Twin.
          </p>
        </div>
      </div>
    );
  }

  const canWriteDept = (dept?: UExternalNode | null) => canCreateDepartments && canWriteDeptHelper(dept);
  const hasWritableDepartment = canCreateDepartments && (
    store.departments.length === 0 || store.departments.some(d => canWriteDept(d))
  );

  /** New session id */
  const [bdtSessionId] = useState(() => Date.now());
  const [showBdtCanvas, setShowBdtCanvas] = useState(false);

  // Sidebar state — which dept is selected in sidebar, and internal drill-down path
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [internalPath, setInternalPath] = useState<string[]>([]);
  // Graph focus and workspace visibility are intentionally independent. A node
  // must be centered before a second 3D click opens its workspace.
  const [openWorkspacePath, setOpenWorkspacePath] = useState<string[] | null>(null);
  // Counter incremented each time the sidebar's back button is pressed
  const [internalBackStep, setInternalBackStep] = useState(0);

  // requestSelectDeptId is only set when the SIDEBAR triggers a selection,
  // so the 3D scene camera flies in. When the 3D scene selects a dept itself
  // (user clicks a node), we just update selectedDeptId directly without
  // re-triggering the camera fly (the 3D scene already handles it).
  const [requestSelectDeptId, setRequestSelectDeptId] = useState<string | null | undefined>(undefined);
  /** Bumped on every sidebar dept pick so Scene re-flies even to the same dept. */
  const [selectDeptNonce, setSelectDeptNonce] = useState(0);

  // Track whether the last selection came from the 3D scene (to avoid loop)
  const selectionFromScene = useRef(false);
  const sidebarPathAuthority = useRef<string[] | null>(null);
  const sidebarPathAuthorityTimer = useRef<number | null>(null);
  /**
   * Drop a pending sidebar path claim so later navigation is not rejected.
   * Plain function, not a hook — this component has conditional returns above.
   */
  const clearSidebarPathAuthority = () => {
    sidebarPathAuthority.current = null;
    if (sidebarPathAuthorityTimer.current !== null) {
      window.clearTimeout(sidebarPathAuthorityTimer.current);
      sidebarPathAuthorityTimer.current = null;
    }
  };

  // Camera reset trigger — increment to fly back to overview
  const polytopeResetTrigger = 0;


  useEffect(() => {
    void store.loadDepartments();
  }, [store.loadDepartments]);

  // ── Compute current node for BDT action workspace (leaf drill) ──
  // A URL-opened container is derived from the loaded graph instead of relying
  // on the 3D scene to finish synchronizing first. This keeps deep links
  // deterministic on cold starts and still traces the real persisted BDT node.
  const paidAcquisitionDeepLink = useMemo(() => {
    if (focusKey !== 'mkt_paid_acquisition') return null;
    const department = store.departments.find((entry) => entry.sourceKey === 'dept_marketing' || entry.label === 'Marketing');
    if (!department) return null;
    const findSelection = (nodes: UInternalNode[], path: string[] = []): { node: UInternalNode; path: string[] } | null => {
      for (const node of nodes) {
        const nextPath = [...path, node.id];
        if (node.stableSourceKey === focusKey || node.sourceKey === focusKey) return { node, path: nextPath };
        const child = findSelection(node.children ?? [], nextPath);
        if (child) return child;
      }
      return null;
    };
    const selection = findSelection(department.internalNodes);
    return selection ? { department, ...selection } : null;
  }, [focusKey, store.departments]);
  const focusOwnsPaidAcquisitionSelection = focusKey === 'mkt_paid_acquisition' && Boolean(paidAcquisitionDeepLink);
  const resolvedSelectedDeptId = focusOwnsPaidAcquisitionSelection && paidAcquisitionDeepLink
    ? paidAcquisitionDeepLink.department.id
    : selectedDeptId;
  const displayDepartments = store.departments;
  const selectedDept = focusOwnsPaidAcquisitionSelection && paidAcquisitionDeepLink
    ? paidAcquisitionDeepLink.department
    : selectedDeptId ? displayDepartments.find(d => d.id === selectedDeptId) : null;
  const resolvedInternalPath = focusOwnsPaidAcquisitionSelection && paidAcquisitionDeepLink
    ? paidAcquisitionDeepLink.path
    : internalPath;
  const getInternalNodeAtPath = (path: string[]) => {
    if (!selectedDept || path.length === 0) return null;
    let currentNodes = selectedDept.internalNodes;
    let targetNode: UInternalNode | null = null;
    for (const p of path) {
      targetNode = currentNodes?.find(n => n.id === p) || null;
      if (targetNode) currentNodes = targetNode.children || [];
    }
    return targetNode;
  };
  const selectedNode = getInternalNodeAtPath(resolvedInternalPath);
  const resolvedWorkspacePath = focusOwnsPaidAcquisitionSelection && paidAcquisitionDeepLink
    ? paidAcquisitionDeepLink.path
    : openWorkspacePath;
  const workspaceNode = resolvedWorkspacePath ? getInternalNodeAtPath(resolvedWorkspacePath) : null;
  const isWorkspaceOpen = Boolean(workspaceNode && isBdtWorkspaceLeafNode(workspaceNode));
  const isPaidAcquisitionNode = Boolean(workspaceNode && (workspaceNode.stableSourceKey === 'mkt_paid_acquisition' || workspaceNode.sourceKey === 'mkt_paid_acquisition'));

  const handleInternalPathChange = useCallback((path: string[]) => {
    const authoritativePath = sidebarPathAuthority.current;
    if (authoritativePath) {
      const matchesAuthority = authoritativePath.length === path.length
        && authoritativePath.every((entry, index) => entry === path[index]);
      if (!matchesAuthority) return;
    }
    setOpenWorkspacePath(null);
    setInternalPath((current) => (
      current.length === path.length && current.every((entry, index) => entry === path[index])
        ? current
        : [...path]
    ));
  }, []);

  const paidAcquisitionDepartmentId = paidAcquisitionDeepLink?.department.id ?? null;
  const paidAcquisitionPathKey = paidAcquisitionDeepLink?.path.join('\u001f') ?? '';
  useEffect(() => {
    if (focusKey !== 'mkt_paid_acquisition' || !paidAcquisitionDepartmentId || !paidAcquisitionPathKey) return;
    const path = paidAcquisitionPathKey.split('\u001f');
    setSelectedDeptId((current) => current === paidAcquisitionDepartmentId ? current : paidAcquisitionDepartmentId);
    setRequestSelectDeptId((current) => current === paidAcquisitionDepartmentId ? current : paidAcquisitionDepartmentId);
    setInternalPath((current) => (
      current.length === path.length && current.every((entry, index) => entry === path[index])
        ? current
        : path
    ));
    setSelectDeptNonce((value) => value + 1);
  }, [focusKey, paidAcquisitionDepartmentId, paidAcquisitionPathKey]);

  // Core dive state. `coreDestination` records WHERE the dive is heading —
  // the supercycle sphere (clicking the core) or Voice AI (its own button).
  const [corePhase, setCorePhase] = useState<CoreWorkspacePhase>(() => returnCycleId ? 'workspace' : 'idle');
  const [coreDestination, setCoreDestination] = useState<CoreDestination>('supercycle');
  const isPolytopeInteractive = corePhase === 'idle';

  const diveToCore = useCallback((destination: CoreDestination) => {
    setCoreDestination(destination);
    setCorePhase((phase) => (phase === 'idle' ? 'diving-in' : phase));
  }, []);

  const surfaceFromCore = useCallback(() => {
    setCorePhase((phase) => (phase === 'workspace' ? 'surfacing' : phase));
  }, []);

  // ── Supercycle (inside the core) ──────────────────────────────────────────
  const [archetypeId, setArchetypeId] = useState<SupercycleArchetypeId>(returnArchetypeId);
  const [selectedCycleNodeId, setSelectedCycleNodeId] = useState<string | null>(returnPlanetId);
  const [selectedValueCycleId, setSelectedValueCycleId] = useState<string | null>(returnCycleId);
  const [selectedDepartmentCycleId, setSelectedDepartmentCycleId] = useState<string | null>(returnDepartmentCycleId);
  const [selectedStageIsland, setSelectedStageIsland] = useState<{
    nodeId: string;
    stage: string;
    stageIndex: number;
  } | null>(() => returnPlanetId && returnIslandStage && Number.isFinite(returnIslandIndexParam)
    ? { nodeId: returnPlanetId, stage: returnIslandStage, stageIndex: returnIslandIndexParam }
    : null);
  const [cycleRouteStyle, setCycleRouteStyle] = useState<SupercycleRouteStyle>('curved');
  const archetype = SUPERCYCLE_ARCHETYPES[archetypeId];
  const valueCycles = pms.state.cycles.filter((cycle) => cycle.archetypeId === archetypeId);
  const selectedValueCycle = valueCycles.find((cycle) => cycle.id === selectedValueCycleId) ?? null;
  const showSupercycle = coreDestination === 'supercycle' && corePhase !== 'idle';
  const selectedCycleNode = archetype.nodes.find((n) => n.id === selectedCycleNodeId) ?? null;

  useEffect(() => {
    if (!returnCycleId) return;
    setSearchParams((current) => {
      const next = new URLSearchParams(current);
      next.delete('supercycle');
      next.delete('archetype');
      next.delete('planet');
      next.delete('departmentCycle');
      next.delete('islandStage');
      next.delete('islandIndex');
      return next;
    }, { replace: true });
  }, [returnCycleId, setSearchParams]);

  const supercycleInstances = useMemo<SupercycleInstance[]>(
    () => pms.state.instances
      .filter((instance) => archetype.nodes.some((node) => node.id === instance.departmentNodeId))
      .map((instance) => ({
        id: instance.id,
        label: instance.name,
        nodeId: instance.departmentNodeId,
        stageIndex: instance.stageIndex,
        health: instanceHealth(instance.id, pms.state),
      })),
    [archetype, pms.state],
  );

  const handleOpenStageIsland = useCallback((nodeId: string, stage: string, stageIndex: number) => {
    const returnParams = new URLSearchParams({
      supercycle: selectedValueCycleId ?? valueCycles[0]?.id ?? 'overview',
      archetype: archetypeId,
      planet: nodeId,
    });
    if (selectedDepartmentCycleId) returnParams.set('departmentCycle', selectedDepartmentCycleId);
    returnParams.set('islandStage', stage);
    returnParams.set('islandIndex', String(stageIndex));
    navigate(
      `/pms?view=island&island=${stageIndex % 4}&department=${encodeURIComponent(nodeId)}&stage=${encodeURIComponent(stage)}`,
      { state: { pmsReturnTo: `/universal?${returnParams.toString()}` } },
    );
  }, [archetypeId, navigate, selectedDepartmentCycleId, selectedValueCycleId, valueCycles]);

  const handleOpenCycleHypercube = useCallback((cycleId: string) => {
    const returnParams = new URLSearchParams({
      supercycle: cycleId,
      archetype: archetypeId,
    });
    navigate(
      `/pms?view=hypercube&cycle=${encodeURIComponent(cycleId)}&archetype=${encodeURIComponent(archetypeId)}`,
      { state: { pmsReturnTo: `/universal?${returnParams.toString()}` } },
    );
  }, [archetypeId, navigate]);

  // Voice keeps driving the dive, but ONLY while voice is the destination.
  // Previously this effect ran unconditionally, which meant any dive was
  // treated as a voice session and ending voice yanked you back out of
  // whatever you were actually looking at.
  useEffect(() => {
    if (coreDestination !== 'voice') return;
    if (voiceState === 'idle' && corePhase === 'workspace') {
      setCorePhase('surfacing');
    } else if (voiceState !== 'idle' && corePhase === 'idle') {
      setCorePhase('diving-in');
    }
  }, [voiceState, corePhase, coreDestination]);

  useLayoutEffect(() => {
    // We no longer unmount/remount the canvas or reset state on path change.
    // The component stays persistently mounted to preserve its state.
    if (!showBdtCanvas) {
      const rafId = requestAnimationFrame(() => setShowBdtCanvas(true));
      return () => cancelAnimationFrame(rafId);
    }
  }, [showBdtCanvas]);

  useEffect(() => {
    if (isTrailActive && trailSession && selectedDeptId && selectedNode) {
      const lastStop = trailSession.stops[trailSession.stops.length - 1];
      if (lastStop && lastStop.deptId === selectedDeptId) {
        if (lastStop.nodeId !== selectedNode.id) {
          enrichCurrentStop(selectedNode, internalPath);
        }
      }
    }
  }, [isTrailActive, trailSession, selectedDeptId, selectedNode, internalPath, enrichCurrentStop]);

  // Use the actual company name from the database, fallback to heuristic if loading
  const companyName = company?.name || (profile?.company_id
    ? profile?.first_name ? `${profile.first_name}'s workspace` : 'My workspace'
    : 'Universal Polytope');

  const [industryName, setIndustryName] = useState('');
  const [subdomainName, setSubdomainName] = useState('');
  const [planetIndustryColor, setPlanetIndustryColor] = useState('#C1AEFF');

  const resolvePlanetRole = useCallback((): UserPlanetRole => {
    if (localStorage.getItem('active_role') === 'vc') return 'vc';
    if (authRole === 'founder' || authRole === 'co_founder' || authRole === 'admin') return 'founder';
    return 'career';
  }, [authRole]);

  useEffect(() => {
    if (company) {
      getAllIndustries().then(inds => {
        const ind = inds.find(i => i.id === company.industry_id);
        if (ind) {
          setIndustryName(ind.label);
          setPlanetIndustryColor(ind.color);
        }
      });
      getAllSubdomains().then(subs => {
        const sub = subs.find(s => s.id === company.subdomain_id);
        if (sub) setSubdomainName(sub.label);
      });
    }
  }, [company]);

  useEffect(() => {
    const deptSummary = store.departments.length
      ? store.departments.map(d => `${d.label} (score: ${d.score})`).join(', ')
      : 'No departments yet';
    sendContextUpdate(
      `[Navigation] User is on the Business Digital Twin page. Company: ${companyName}. Departments: ${deptSummary}.`
    );
  }, [store.departments, companyName]);

  // When dept is selected in 3D scene → update sidebar highlight
  const handleDepartmentChange = (id: string | null) => {
    // The direct Paid Acquisition hub route owns department/path selection
    // until the workspace closes. Scene initialization can report an empty or
    // stale selection while its camera state catches up; accepting it here
    // would clear the URL-selected node.
    if (focusKey === 'mkt_paid_acquisition') return;
    selectionFromScene.current = true;
    if (id !== selectedDeptId) {
      setInternalPath([]);
      setInternalBackStep(0);
    }
    setSelectedDeptId(id);
    if (id === null) {
      setInternalPath([]);
      setInternalBackStep(0);
      setRequestSelectDeptId(null);
    }
    setTimeout(() => { selectionFromScene.current = false; }, 0);
  };

  // When sidebar selects a dept → update selectedDeptId AND trigger camera fly in 3D
  const handleSidebarDeptSelect = (id: string | null, internalPathOverride?: string[]) => {
    if (id !== selectedDeptId) {
      setInternalPath([]);
      setInternalBackStep(0);
    }
    setSelectedDeptId(id);
    if (id === null) {
      setInternalPath([]);
      setRequestSelectDeptId(null);
      // The nonce must move even when the id does not. After the scene selects a
      // department on its own (a click on the hull), requestSelectDeptId is
      // already null here, so setting it to null again is a no-op React bails
      // out of — and the scene never hears the deselect. Bumping the nonce makes
      // the request unambiguous.
      setSelectDeptNonce(n => n + 1);
      setInternalBackStep(0);
    } else {
      if (internalPathOverride) {
        setInternalPath(internalPathOverride);
      } else {
        setInternalPath([]);
      }
      setRequestSelectDeptId(id);
      setSelectDeptNonce(n => n + 1);
    }
  };

  const handleInterrelatedDepartmentClick = useCallback((targetDeptId: string) => {
    const targetDept = store.departments.find(d => d.id === targetDeptId);
    if (!targetDept || !canReadDept(targetDept)) {
      return;
    }

    if (!selectedDept || !selectedNode) return;
    if (!canReadDept(selectedDept)) return;

    const companyId = profile?.company_id || 'bdt-universal';
    const userId = profile?.id || user?.id;

    if (!isTrailActive) {
      startTrail(
        companyId,
        userId,
        selectedDept.id,
        selectedDept.label,
        selectedNode,
        internalPath,
        targetDept.id,
        targetDept.label
      );
    } else {
      appendStop(targetDept.id, targetDept.label);
    }

    // Navigate to interrelated target
    setInternalPath([]);
    setSelectedDeptId(targetDeptId);
    setRequestSelectDeptId(targetDeptId);
    setSelectDeptNonce(n => n + 1);
  }, [selectedDept, selectedNode, internalPath, isTrailActive, startTrail, appendStop, store.departments, profile, user]);

  const handleSaveTrail = useCallback((title?: string, note?: string) => {
    if (trailSession) {
      saveTrail(trailSession, title, note);
      cancelTrail();
    }
  }, [trailSession, saveTrail, cancelTrail]);



  // Clicking the core now opens the Revenue & Growth supercycle rather than
  // Voice AI. Voice moved to its own control (see the toolbar button below) so
  // the core can mean one thing: dive into the organisation's value loop.
  const handleCoreClickIntent = useCallback(() => {
    setSelectedCycleNodeId(null);
    setSelectedValueCycleId(null);
    diveToCore('supercycle');
  }, [diveToCore]);

  const handleCoreDiveComplete = useCallback(() => {
    if (corePhase === 'diving-in') {
      setCorePhase('workspace');
    }
  }, [corePhase]);

  const handleCoreSurfaceComplete = useCallback(() => {
    if (corePhase === 'surfacing') {
      setCorePhase('idle');
      if (pendingSupercycleOpen) {
        const path = [pendingSupercycleOpen.nodeId];
        setSelectedDeptId(pendingSupercycleOpen.departmentId);
        setRequestSelectDeptId(pendingSupercycleOpen.departmentId);
        setSelectDeptNonce((value) => value + 1);
        setInternalPath(path);
        setOpenWorkspacePath(path);
        setPendingSupercycleOpen(null);
      }
    }
  }, [corePhase, pendingSupercycleOpen]);

  const handlePolytopeExitIntent = useCallback(() => {
    if (!profile?.company_id) return;
    navigate('/3d', {
      state: {
        enterPlanetRootsFromBdt: {
          companyId: profile.company_id,
          companyName,
          role: resolvePlanetRole(),
          industryColor: planetIndustryColor,
        },
      },
    });
  }, [profile?.company_id, companyName, resolvePlanetRole, planetIndustryColor, navigate]);

  return (
    <div className="fixed inset-0 bg-black overflow-hidden z-40">
      {/* ── 3D Polytope Canvas ── */}
      <div
        className="absolute inset-0"
        style={{
          opacity: 1,
          pointerEvents: (isPolytopeInteractive || corePhase === 'workspace') ? 'auto' : 'none',
        }}
      >
        {showBdtCanvas && (
          <UniversalPolytope
            key={bdtSessionId}
            storeScope="bdt"
            companyName={companyName}
            industryName={industryName}
            subdomainName={subdomainName}
            onExitIntent={handlePolytopeExitIntent}
            onDepartmentChange={handleDepartmentChange}
            onInternalPathChange={handleInternalPathChange}
            onWorkspaceOpen={(path) => setOpenWorkspacePath([...path])}
            requestSelectDeptId={requestSelectDeptId}
            selectDeptNonce={selectDeptNonce}
            requestBackStep={internalBackStep}
            cameraResetTrigger={polytopeResetTrigger}
            departments={displayDepartments}
            selectedInternalPath={resolvedInternalPath}
            enableCoreWorkspace
            readOnly={!hasWritableDepartment}
            coreWorkspacePhase={corePhase}
            onCoreClickIntent={handleCoreClickIntent}
            onCoreDiveComplete={handleCoreDiveComplete}
            onCoreSurfaceComplete={handleCoreSurfaceComplete}
            voiceIntensityRef={intensityRef}
            bdtWorkspaceLeaves
            cinematicFocus
            coreOverlay={
              showSupercycle ? (
                <SupercycleScene
                  archetype={archetype}
                  instances={supercycleInstances}
                  selectedNodeId={selectedCycleNodeId}
                  onSelectNode={(nodeId) => {
                    if (nodeId !== selectedCycleNodeId) {
                      setSelectedDepartmentCycleId(null);
                      setSelectedStageIsland(null);
                    }
                    setSelectedCycleNodeId(nodeId);
                  }}
                  selectedStageIsland={selectedStageIsland}
                  onSelectStageIsland={setSelectedStageIsland}
                  onOpenStageIsland={(node, stage, stageIndex) => handleOpenStageIsland(node.id, stage, stageIndex)}
                  cycles={valueCycles}
                  departmentCycles={pms.state.departmentCycles}
                  selectedCycleId={selectedValueCycleId}
                  onSelectCycle={(cycleId) => {
                    setSelectedValueCycleId(cycleId);
                    setSelectedCycleNodeId(null);
                    setSelectedDepartmentCycleId(null);
                    setSelectedStageIsland(null);
                  }}
                  selectedDepartmentCycleId={selectedDepartmentCycleId}
                  onSelectDepartmentCycle={setSelectedDepartmentCycleId}
                  onOpenHypercube={(cycle) => handleOpenCycleHypercube(cycle.id)}
                  routeStyle={cycleRouteStyle}
                />
              ) : undefined
            }
          />
        )}
      </div>




      {/* Voice is deliberately separate from the shared Supercycle core. */}
      {coreDestination === 'voice' && voiceState !== 'idle' && (
        <button
          onClick={() => toggle()}
          className="fixed top-20 left-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-purple-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          &larr; Back to Polytope
        </button>
      )}

      {/* Voice AI trigger. The core used to open Voice; now it opens the
          supercycle, so Voice needs its own control. */}
      {isPolytopeInteractive && voiceState === 'idle' && (
        <button
          onClick={() => { setCoreDestination('voice'); toggle(); }}
          className="fixed top-20 right-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-purple-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          Voice AI
        </button>
      )}

      {/* ── Supercycle chrome (inside the core) ── */}
      {showSupercycle && corePhase !== 'surfacing' && (
        <>
          <button
            onClick={() => {
              if (selectedStageIsland) {
                setSelectedStageIsland(null);
              } else if (selectedDepartmentCycleId) {
                setSelectedDepartmentCycleId(null);
              } else if (selectedCycleNode) {
                setSelectedCycleNodeId(null);
              } else if (selectedValueCycleId) {
                setSelectedValueCycleId(null);
              } else {
                surfaceFromCore();
              }
            }}
            className="fixed top-20 left-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-cyan-400/30"
            style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
          >
            &larr; {selectedStageIsland
              ? selectedCycleNode?.label ?? SUPERCYCLE_LABEL
              : selectedDepartmentCycleId
              ? selectedCycleNode?.label ?? SUPERCYCLE_LABEL
              : selectedCycleNode
                ? SUPERCYCLE_LABEL
                : selectedValueCycleId
                  ? SUPERCYCLE_LABEL
                  : 'Back to Polytope'}
          </button>

          <div
            className="fixed top-20 left-1/2 -translate-x-1/2 z-[60] px-4 py-2 rounded-lg border backdrop-blur-md text-center pointer-events-none"
            style={{ background: 'rgba(8,13,26,0.68)', borderColor: 'rgba(79,216,255,0.18)' }}
          >
            <div className="text-[10px] tracking-[3px] uppercase" style={{ color: '#4fd8ff' }}>
              {selectedStageIsland ? 'Selected island' : selectedCycleNode ? selectedCycleNode.subCycle.label : selectedValueCycle ? 'Selected cycle' : 'Supercycle'}
            </div>
            <div className="text-sm font-semibold text-slate-100">
              {selectedStageIsland?.stage ?? (selectedCycleNode ? selectedCycleNode.label : selectedValueCycle?.name ?? SUPERCYCLE_LABEL)}
            </div>
            {selectedCycleNode && (
              <div className="text-[10px] text-slate-400 mt-0.5">
                {selectedCycleNode.subNodes.map((s) => s.label).join(' · ')}
              </div>
            )}
          </div>

          {selectedCycleNode && (
            <button
              onClick={() => {
                const name = window.prompt(`Name this ${selectedCycleNode.subCycle.label} live instance`);
                if (!name?.trim()) return;
                pms.setArchetype(archetypeId);
                pms.createInstance({
                  name: name.trim(),
                  departmentNodeId: selectedCycleNode.id,
                  templateId: selectedCycleNode.subCycle.id,
                  stageIndex: 0,
                  status: 'active',
                });
              }}
              className="fixed top-20 right-36 z-[60] rounded-lg border border-cyan-400/30 bg-cyan-400/10 px-4 py-2 text-xs font-semibold text-cyan-200 backdrop-blur-md transition hover:bg-cyan-400/20"
            >
              + New live instance
            </button>
          )}

          {selectedCycleNode ? (
            <DepartmentCycleEditor
              node={selectedCycleNode}
              cycles={pms.state.departmentCycles.filter((cycle) => cycle.archetypeId === archetypeId && cycle.departmentId === selectedCycleNode.id)}
              onCreate={(draft) => pms.createDepartmentCycle({ ...draft, archetypeId, departmentId: selectedCycleNode.id })}
              onUpdate={(cycleId, draft) => pms.updateDepartmentCycle(cycleId, draft)}
              onDelete={pms.deleteDepartmentCycle}
            />
          ) : (
            <SupercycleCycleEditor
              cycles={valueCycles}
              departments={archetype.nodes}
              onCreate={(draft) => {
                const cycleId = pms.createCycle({ ...draft, archetypeId });
                setSelectedValueCycleId(cycleId);
              }}
              onUpdate={(cycleId, draft) => pms.updateCycle(cycleId, draft)}
              onDelete={(cycleId) => {
                pms.deleteCycle(cycleId);
                if (selectedValueCycleId === cycleId) setSelectedValueCycleId(null);
              }}
            />
          )}

          <div className="fixed right-6 top-32 z-[70] flex rounded-lg border border-white/10 bg-black/65 p-1 text-[10px] font-semibold uppercase tracking-wider backdrop-blur-xl">
            {(['curved', 'spherical'] as const).map((style) => (
              <button key={style} onClick={() => setCycleRouteStyle(style)} className={`rounded-md px-2.5 py-1.5 transition ${cycleRouteStyle === style ? 'bg-cyan-300 text-slate-950' : 'text-slate-500 hover:text-white'}`}>
                {style === 'spherical' ? 'Circular' : 'Curved'}
              </button>
            ))}
          </div>

          {!selectedCycleNode && valueCycles.length > 0 && (
            <div className="fixed bottom-20 left-1/2 z-[60] flex -translate-x-1/2 gap-1.5 rounded-xl border border-white/10 bg-black/65 p-1.5 backdrop-blur-xl">
              {valueCycles.map((cycle) => {
                const active = selectedValueCycleId === cycle.id;
                return <button key={cycle.id} onClick={() => setSelectedValueCycleId(cycle.id)} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium transition" style={{ background: active ? `${cycle.color}22` : 'transparent', color: active ? cycle.color : '#7c879b' }}><span className="h-2 w-2 rounded-full" style={{ background: cycle.color, boxShadow: active ? `0 0 10px ${cycle.color}` : 'none' }} />{cycle.name}</button>;
              })}
            </div>
          )}

          {selectedCycleNode && (
            <div className="fixed bottom-20 left-1/2 z-[60] flex max-w-[70vw] -translate-x-1/2 gap-1.5 rounded-xl border border-white/10 bg-black/65 p-1.5 backdrop-blur-xl">
              {pms.state.departmentCycles
                .filter((cycle) => cycle.archetypeId === archetypeId && cycle.departmentId === selectedCycleNode.id)
                .map((cycle) => (
                  <div key={cycle.id} className="flex items-center gap-2 rounded-lg px-3 py-1.5 text-[11px] font-medium" style={{ color: cycle.color }}>
                    <span className="h-2 w-2 rounded-full" style={{ background: cycle.color, boxShadow: `0 0 10px ${cycle.color}` }} />
                    {cycle.name}
                  </div>
                ))}
            </div>
          )}

          {/* Business-model picker. Same ring, different labels — the point of
              section 8 of the spec is that these stay comparable. */}
          {!selectedCycleNode && (
            <div
              className="fixed bottom-6 left-1/2 -translate-x-1/2 z-[60] flex gap-1 p-1.5 rounded-xl border backdrop-blur-md"
              style={{ background: 'rgba(8,13,26,0.68)', borderColor: 'rgba(79,216,255,0.18)' }}
            >
              {SUPERCYCLE_ARCHETYPE_LIST.map((a) => (
                <button
                  key={a.id}
                  onClick={() => { setArchetypeId(a.id); pms.setArchetype(a.id); setSelectedCycleNodeId(null); setSelectedValueCycleId(null); setSelectedDepartmentCycleId(null); }}
                  title={a.revenueModel}
                  className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                  style={
                    a.id === archetypeId
                      ? { background: 'rgba(79,216,255,0.16)', color: '#4fd8ff' }
                      : { color: '#8b96ab' }
                  }
                >
                  {a.label}
                </button>
              ))}
            </div>
          )}
        </>
      )}

      {/* ── Left sidebar panel — hidden when create panel is shown ── */}
      {isPolytopeInteractive && !isWorkspaceOpen && (
        <div className="fixed bottom-6 left-4 z-[60] pointer-events-auto">
          <PolytopeSidePanel
            departments={displayDepartments}
            selectedDeptId={resolvedSelectedDeptId}
            onDeptSelect={(id) => { clearSidebarPathAuthority(); handleSidebarDeptSelect(id); }}
            selectedInternalPath={resolvedInternalPath}
            onInternalBack={() => {
              // A back press supersedes any pending sidebar pick. Without this the
              // authority guard rejects the scene's `onPathChange([])` for up to
              // two seconds after picking a node, so back appeared to do nothing.
              clearSidebarPathAuthority();
              setInternalBackStep(c => c + 1);
            }}
            onNodeSelect={(path) => {
              const authoritativePath = [...path];
              sidebarPathAuthority.current = authoritativePath;
              if (sidebarPathAuthorityTimer.current !== null) window.clearTimeout(sidebarPathAuthorityTimer.current);
              sidebarPathAuthorityTimer.current = window.setTimeout(() => {
                if (sidebarPathAuthority.current === authoritativePath) sidebarPathAuthority.current = null;
                sidebarPathAuthorityTimer.current = null;
              }, 2_000);
              setRequestSelectDeptId(undefined);
              setInternalPath(authoritativePath);
              setOpenWorkspacePath(authoritativePath);
              setSearchParams((current) => {
                if (!current.has('focus') && !current.has('tab')) return current;
                const next = new URLSearchParams(current);
                next.delete('focus');
                next.delete('tab');
                return next;
              }, { replace: true });
            }}
            bdtWorkspaceLeaves
            onOpenMyWork={() => setShowCommercialMyWork(true)}
          />
        </div>
      )}

      {showCommercialMyWork && <CommercialMyWorkModal onClose={() => setShowCommercialMyWork(false)} onOpenTask={(task) => {
        const dept = store.departments.find(entry => entry.id === task.department_id);
        const findPath = (nodes: UInternalNode[], target: string, path: string[] = []): string[] | null => { for (const entry of nodes) { const next = [...path, entry.id]; if (entry.id === target) return next; const found = findPath(entry.children ?? [], target, next); if (found) return found; } return null; };
        const path = dept ? findPath(dept.internalNodes, task.node_id) : null;
        if (dept && path) {
          setSelectedDeptId(dept.id);
          setRequestSelectDeptId(dept.id);
          setSelectDeptNonce(n => n + 1);
          setInternalPath(path);
          setOpenWorkspacePath(path);
          setShowCommercialMyWork(false);
        }
      }} />}

      {isPolytopeInteractive && store.loaded && !store.loading && store.departments.length === 0 && (
        <div className="fixed left-6 bottom-6 z-[60] max-w-sm rounded-xl border border-slate-800 bg-black/70 p-4 text-sm text-slate-300 backdrop-blur-md">
          No accessible departments are available for your account.
        </div>
      )}

      {/* ── BDT Action Workspace (Leaf Nodes) ── */}
      {selectedDept && workspaceNode && (
        workspaceNode.nodeLevel === 'form' ? <BdtFormWorkspace node={workspaceNode} department={selectedDept} onClose={() => setOpenWorkspacePath(null)} /> : <BdtActionWorkspace
          isOpen={isWorkspaceOpen}
          containerMode={isPaidAcquisitionNode ? 'meta-paid-acquisition' : undefined}
          node={workspaceNode}
          department={selectedDept}
          allDepartments={displayDepartments}
          canEdit={canWriteDept(selectedDept)}
          onOpenActionNode={async (nodeId) => {
            await store.loadDepartments();
            setInternalPath((current) => current[current.length - 1] === nodeId ? current : [...current, nodeId]);
            setOpenWorkspacePath((current) => current?.[current.length - 1] === nodeId ? current : [...internalPath, nodeId]);
          }}
          onClose={() => {
            setOpenWorkspacePath(null);
          }}
          onDepartmentClick={handleInterrelatedDepartmentClick}
          onInterrelatedDepartmentClick={handleInterrelatedDepartmentClick}
          trailSession={isReplayMode ? (replayTrail as any) : trailSession}
          isTrailActive={isTrailActive || isReplayMode}
          isReplayMode={isReplayMode}
          replayStepIndex={replayStepIndex}
          onReplayNext={handleReplayNext}
          onReplayPrev={handleReplayPrev}
          canReadDept={canReadDept}
          onSaveTrail={handleSaveTrail}
          onCancelTrail={isReplayMode ? handleExitReplay : cancelTrail}
          onUndoTrailHop={undoLastStop}
        />
      )}

    </div>
  );
}

function CommercialMyWorkModal({ onClose, onOpenTask }: { onClose: () => void; onOpenTask: (task: BdtTask) => void }) {
  const [items, setItems] = useState<BdtTask[]>([]);
  const [error, setError] = useState<string | null>(null);
  const load = useCallback(async () => {
    try { const result = await bdtTasks.mine(); setItems(result.items); setError(null); }
    catch (cause) { setError(cause instanceof Error ? cause.message : 'Unable to load My Work'); }
  }, []);
  useEffect(() => { void load(); const timer = window.setInterval(() => void load(), 30_000); return () => window.clearInterval(timer); }, [load]);
  return <div className="fixed inset-0 z-[120] flex items-center justify-center bg-black/70 p-4">
    <div className="w-full max-w-xl rounded-2xl border border-white/15 bg-[#111] p-5 shadow-2xl">
      <div className="mb-4 flex items-center justify-between"><h2 className="text-lg font-semibold text-white">My Work</h2><button onClick={onClose} className="rounded-lg border border-white/15 px-3 py-1.5 text-xs text-white/80">Close</button></div>
      {error && <p className="mb-3 text-xs text-rose-200">{error}</p>}
      {items.length === 0 ? <p className="text-sm text-white/45">No BDT tasks are assigned to you.</p> : <div className="max-h-[60vh] space-y-2 overflow-auto">{items.map(item => <button type="button" onClick={() => onOpenTask(item)} key={item.id} className="block w-full rounded-lg border border-white/10 p-3 text-left hover:bg-white/[.06]"><p className="text-sm font-medium text-white">{item.title}</p><p className="mt-1 text-xs text-white/45">{item.status.replace('_',' ')} · {item.priority}{item.due_on ? ` · due ${item.due_on}` : ''}{item.overdue ? ' · overdue' : ''}</p>{item.related && <p className="mt-1 text-xs text-white/40">{item.related.available ? item.related.label : `${item.related.label ?? 'Linked record'} removed`}</p>}</button>)}</div>}
    </div>
  </div>;
}
