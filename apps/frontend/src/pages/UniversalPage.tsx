import { useState, useRef, useCallback, useLayoutEffect, useEffect, useMemo } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';

import UniversalPolytope from '../components/UniversalPolytope';
import { PolytopeSidePanel } from '../components/PolytopeSidePanel';
import { PolytopeManager } from '../components/PolytopeManager';
import CreateDepartmentPanel from '../components/CreateDepartmentPanel';
import { usePolytopeStore } from '../lib/usePolytopeStore';
import type { UExternalNode, UInternalNode } from '../lib/usePolytopeStore';
import { useAuth } from '../lib/auth';
import { useCompany } from '../lib/db/companies';
import { useTeamMembers } from '../lib/db/team';
import type { CoreWorkspacePhase } from '../lib/coreWorkspaceTransition';
import { getAllIndustries } from '../lib/db/industries';
import { getAllSubdomains } from '../lib/db/subdomains';
import { useVoice } from '../context/VoiceContext';
import { BdtActionWorkspace } from '../components/workspace/BdtActionWorkspace';
import { isBdtWorkspaceLeafNode } from '../lib/usePolytopeStore';
import { canReadDept, canWriteDept as canWriteDeptHelper, canDeleteDept as canDeleteDeptHelper } from '../lib/bdtTrailRbac';
import { useWorkflowTrail } from '../lib/useWorkflowTrail';
import { useBdtSavedTrails } from '../lib/useBdtSavedTrails';
import type { UserPlanetRole } from '../data/companyPlanetRoots';
import { syncMetaMetricsOnce } from '../lib/integrations/service';

export default function UniversalPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const replayTrailId = searchParams.get('replayTrail');
  const { user, profile, canRead, canWrite, role: authRole } = useAuth();
  const canCreateDepartments = canWrite('twin') && canWrite('team');
  const { company } = useCompany(profile?.company_id);
  const { members: workspaceMembers } = useTeamMembers(profile?.company_id);
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
  const canDeleteDept = (dept?: UExternalNode | null) => canCreateDepartments && canDeleteDeptHelper(dept);
  const hasWritableDepartment = canCreateDepartments && (
    store.departments.length === 0 || store.departments.some(d => canWriteDept(d))
  );

  /** New session id */
  const [bdtSessionId] = useState(() => Date.now());
  const [showBdtCanvas, setShowBdtCanvas] = useState(false);

  // Sidebar state — which dept is selected in sidebar, and internal drill-down path
  const [selectedDeptId, setSelectedDeptId] = useState<string | null>(null);
  const [internalPath, setInternalPath] = useState<string[]>([]);
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

  // ── Draft dept state (for "Add Department" inline flow) ───────────────────
  const [draftDept, setDraftDept] = useState<UExternalNode | null>(null);
  const draftDeptScreenPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Draft internal node state (for "Add Node" inline flow) ───────────────
  const [draftInternalNode, setDraftInternalNode] = useState<{ deptId: string; node: UInternalNode } | null>(null);
  const draftInternalNodeScreenPosRef = useRef<{ x: number; y: number } | null>(null);

  // ── Draft member state (for "Add Member" inline flow) ───────────────
  const [draftMember, setDraftMember] = useState<{ deptId: string; nodeId: string } | null>(null);
  const draftMemberScreenPosRef = useRef<{ x: number; y: number } | null>(null);

  // Camera reset trigger — increment to fly back to overview
  const [polytopeResetTrigger, setPolytopeResetTrigger] = useState(0);

  // PolytopeManager (CRUD modal) — only used for edit/delete flows now
  const [managerOpen, setManagerOpen] = useState(false);
  const [managerView, setManagerView] = useState<any>({ type: 'home' });

  useEffect(() => {
    void store.loadDepartments();
  }, [store.loadDepartments]);

  // ── Compute current node for BDT action workspace (leaf drill) ──
  const selectedDept = selectedDeptId ? store.departments.find(d => d.id === selectedDeptId) : null;
  useEffect(() => {
    if (selectedDept && (selectedDept.sourceKey === 'dept_marketing' || selectedDept.label === 'Marketing')) {
      void syncMetaMetricsOnce().catch(() => {});
    }
  }, [selectedDept]);
  const getSelectedInternalNode = () => {
    if (!selectedDept || internalPath.length === 0) return null;
    let currentNodes = selectedDept.internalNodes;
    let targetNode: UInternalNode | null = null;
    for (const p of internalPath) {
      targetNode = currentNodes?.find(n => n.id === p) || null;
      if (targetNode) currentNodes = targetNode.children || [];
    }
    return targetNode;
  };
  const selectedNode = getSelectedInternalNode();
  const isLeafNode = !!selectedNode && isBdtWorkspaceLeafNode(selectedNode);

  const handleEditDepartment = (dept: UExternalNode) => {
    if (!canWriteDept(dept)) return;
    setManagerView({ type: 'editDept', dept });
    setManagerOpen(true);
  };

  const handleEditNode = (dept: UExternalNode, node: UInternalNode) => {
    if (!canWriteDept(dept)) return;
    setManagerView({ type: 'editNode', dept, node });
    setManagerOpen(true);
  };

  const handleDeleteDepartmentClick = (dept: UExternalNode) => {
    if (!canDeleteDept(dept)) return;
    setManagerView({ type: 'deleteDept', dept });
    setManagerOpen(true);
  };

  const handleDeleteNodeClick = (dept: UExternalNode, node: UInternalNode) => {
    if (!canDeleteDept(dept)) return;
    setManagerView({ type: 'deleteNode', dept, node });
    setManagerOpen(true);
  };

  const handleDeleteMemberClick = async (dept: UExternalNode, node: UInternalNode, memberIndex: number) => {
    if (!canWriteDept(dept)) return;
    const member = node.members?.[memberIndex];
    if (!member) return;

    if (member.companyMemberId) {
      await store.removeNodeMember(node.id, member.companyMemberId);
      return;
    }

    const newMembers = (node.members || []).filter((_, index) => index !== memberIndex);
    await store.updateNode(dept.id, node.id, { members: newMembers, memberCount: newMembers.length });
  };

  // Core workspace/Voice AI zoom state
  const [corePhase, setCorePhase] = useState<CoreWorkspacePhase>('idle');
  const isPolytopeInteractive = corePhase === 'idle';

  useEffect(() => {
    if (voiceState === 'idle' && corePhase === 'workspace') {
      setCorePhase('surfacing');
    } else if (voiceState !== 'idle' && corePhase === 'idle') {
      setCorePhase('diving-in');
    }
  }, [voiceState, corePhase]);

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

  // ── Add Department: spawn draft node + show panel ─────────────────────────
  // Camera fly is handled internally by Scene via useEffect on draftNodePos.
  const handleAddDepartment = () => {
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
    setDraftDept(draft);
    // Deselect any current dept so the polytope returns to overview
    setRequestSelectDeptId(null);
  };

  const handleDraftDeptUpdate = (patch: Partial<Pick<UExternalNode, 'label' | 'domain'>>) => {
    setDraftDept(prev => prev ? { ...prev, ...patch } : prev);
  };

  const handleDraftDeptClose = (isCancel?: boolean) => {
    if (isCancel) {
      setDraftDept(null);
      setRequestSelectDeptId(null);
      setPolytopeResetTrigger(c => c + 1);
    }
  };

  const handleDraftDeptCreated = async (data: Omit<UExternalNode, 'id' | 'internalNodes' | 'isDraft'>) => {
    const saved = await store.addDepartment(data);
    setDraftDept(null);
    setPolytopeResetTrigger(c => c + 1);
    // Select the newly created real dept
    setSelectedDeptId(saved.id);
    setRequestSelectDeptId(saved.id);
  };

  // ── Add Node: spawn draft internal node + show panel ─────────────────────
  const handleAddNode = (deptId: string) => {
    const dept = store.departments.find(d => d.id === deptId);
    if (!dept || !canWriteDept(dept)) return;
    const draftNode: UInternalNode = {
      id: `draft_node_${Date.now()}`,
      label: 'New Node',
      type: 'team',
      score: 75,
      children: [],
    };
    setDraftInternalNode({ deptId, node: draftNode });
    if (selectedDeptId !== deptId) {
      setSelectedDeptId(deptId);
      setRequestSelectDeptId(deptId);
    }
  };

  const handleDraftNodeUpdate = (patch: Partial<Pick<UInternalNode, 'label' | 'type'>>) => {
    setDraftInternalNode(prev => prev ? { ...prev, node: { ...prev.node, ...patch } } : prev);
  };

  const handleDraftNodeClose = (isCancel?: boolean) => {
    if (isCancel) {
      setDraftInternalNode(null);
    }
  };

  const handleDraftNodeCreated = async (data: Omit<UInternalNode, 'id' | 'children'>) => {
    if (!draftInternalNode) return;
    const deptId = draftInternalNode.deptId;
    await store.addNode(deptId, data, internalPath);
    setDraftInternalNode(null);
    setSelectedDeptId(deptId);
  };

  // ── Add Member: spawn draft member + show panel ─────────────────────
  const handleAddMember = (deptId: string, nodeId: string) => {
    const dept = store.departments.find(d => d.id === deptId);
    if (!canWriteDept(dept)) return;
    setDraftMember({ deptId, nodeId });
    if (selectedDeptId !== deptId) {
      setSelectedDeptId(deptId);
      setRequestSelectDeptId(deptId);
    }
  };

  const handleDraftMemberClose = (isCancel?: boolean) => {
    if (isCancel) {
      setDraftMember(null);
    }
  };

  const handleDraftMemberCreated = async (data: { memberId: string }) => {
    if (!draftMember) return;
    const { deptId, nodeId } = draftMember;
    await store.addNodeMember(nodeId, data.memberId);
    setDraftMember(null);
    setSelectedDeptId(deptId);
  };

  // When dept is selected in 3D scene → update sidebar highlight
  const handleDepartmentChange = (id: string | null) => {
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



  const handleCoreClickIntent = useCallback(() => {
    toggle();
  }, [toggle]);

  const handleCoreDiveComplete = useCallback(() => {
    if (corePhase === 'diving-in') {
      setCorePhase('workspace');
    }
  }, [corePhase]);

  const handleCoreSurfaceComplete = useCallback(() => {
    if (corePhase === 'surfacing') {
      setCorePhase('idle');
    }
  }, [corePhase]);

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
            onInternalPathChange={setInternalPath}
            requestSelectDeptId={requestSelectDeptId}
            selectDeptNonce={selectDeptNonce}
            requestBackStep={internalBackStep}
            draftDept={draftDept}
            draftNodeScreenPosRef={draftDeptScreenPosRef}
            draftInternalNode={draftInternalNode}
            draftInternalNodeScreenPosRef={draftInternalNodeScreenPosRef}
            draftMember={draftMember}
            draftMemberScreenPosRef={draftMemberScreenPosRef}
            cameraResetTrigger={polytopeResetTrigger}
            departments={store.departments}
            selectedInternalPath={internalPath}
            enableCoreWorkspace={hasWritableDepartment}
            readOnly={!hasWritableDepartment}
            coreWorkspacePhase={corePhase}
            onCoreClickIntent={handleCoreClickIntent}
            onCoreDiveComplete={handleCoreDiveComplete}
            onCoreSurfaceComplete={handleCoreSurfaceComplete}
            voiceIntensityRef={intensityRef}
            bdtWorkspaceLeaves
          />
        )}
      </div>




      {/* Back button when Voice AI is active */}
      {voiceState !== 'idle' && (
        <button
          onClick={() => toggle()}
          className="fixed top-20 left-6 z-[60] flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-purple-500/30"
          style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
        >
          &larr; Back to Polytope
        </button>
      )}

      {/* ── Left sidebar panel — hidden when create panel is shown ── */}
      {isPolytopeInteractive && !isLeafNode && !draftDept && !draftInternalNode && !draftMember && (
        <div className="fixed bottom-6 left-4 z-[60] pointer-events-auto">
          <PolytopeSidePanel
            departments={store.departments}
            selectedDeptId={selectedDeptId}
            onDeptSelect={(id) => handleSidebarDeptSelect(id)}
            selectedInternalPath={internalPath}
            onAddDepartment={handleAddDepartment}
            onAddNode={handleAddNode}
            onAddMember={handleAddMember}
            onInternalBack={() => setInternalBackStep(c => c + 1)}
            onUpdateDepartment={store.updateDepartment}
            onDeleteDepartment={store.deleteDepartment}
            onUpdateNode={store.updateNode}
            onDeleteNode={store.deleteNode}
            onNodeSelect={(path) => {
              setInternalPath(path);
              if (selectedDeptId) setSelectDeptNonce(n => n + 1);
            }}
            onEditDepartment={handleEditDepartment}
            onEditNode={handleEditNode}
            onDeleteDepartmentClick={handleDeleteDepartmentClick}
            onDeleteNodeClick={handleDeleteNodeClick}
            onDeleteMemberClick={handleDeleteMemberClick}
            canEdit={canCreateDepartments}
            canCreateDepartment={canCreateDepartments}
            bdtWorkspaceLeaves
          />
        </div>
      )}

      {isPolytopeInteractive && store.loaded && !store.loading && store.departments.length === 0 && !draftDept && (
        <div className="fixed left-6 bottom-6 z-[60] max-w-sm rounded-xl border border-slate-800 bg-black/70 p-4 text-sm text-slate-300 backdrop-blur-md">
          No accessible departments are available for your account.
        </div>
      )}

      {/* ── Draft Dept Creation Panel ── */}
      {canCreateDepartments && draftDept && (
        <CreateDepartmentPanel
          mode="department"
          draftNodeScreenPosRef={draftDeptScreenPosRef}
          onDraftUpdate={handleDraftDeptUpdate}
          onClose={handleDraftDeptClose}
          onCreated={handleDraftDeptCreated}
        />
      )}

      {/* ── Draft Internal Node Creation Panel ── */}
      {draftInternalNode && (() => {
        const dept = store.departments.find(d => d.id === draftInternalNode.deptId);
        if (!dept || !canWriteDept(dept)) return null;
        return (
          <CreateDepartmentPanel
            mode="node"
            dept={dept}
            draftNodeScreenPosRef={draftInternalNodeScreenPosRef}
            onDraftUpdate={handleDraftNodeUpdate}
            onClose={handleDraftNodeClose}
            onCreated={handleDraftNodeCreated}
          />
        );
      })()}

      {/* ── Draft Member Creation Panel ── */}
      {draftMember && (() => {
        const dept = store.departments.find(d => d.id === draftMember.deptId);
        const findNode = (nodes: UInternalNode[], id: string): UInternalNode | null => {
          for (const entry of nodes) {
            if (entry.id === id) return entry;
            const child = findNode(entry.children || [], id);
            if (child) return child;
          }
          return null;
        };
        const node = dept ? findNode(dept.internalNodes, draftMember.nodeId) : null;
        if (!dept || !node || !canWriteDept(dept)) return null;
        return (
          <CreateDepartmentPanel
            mode="member"
            dept={dept}
            node={node}
            availableMembers={workspaceMembers}
            assignedMemberIds={(node.members || []).map(member => member.companyMemberId).filter((id): id is string => Boolean(id))}
            draftNodeScreenPosRef={draftMemberScreenPosRef}
            onClose={handleDraftMemberClose}
            onCreated={handleDraftMemberCreated}
          />
        );
      })()}

      {/* ── BDT Action Workspace (Leaf Nodes) ── */}
      {selectedDept && selectedNode && (
        <BdtActionWorkspace
          isOpen={isLeafNode}
          node={selectedNode}
          department={selectedDept}
          allDepartments={store.departments}
          canEdit={canWriteDept(selectedDept)}
          onAddMember={handleAddMember}
          onDeleteMember={handleDeleteMemberClick}
          onClose={() => {
            // go up one level
            setInternalPath(prev => prev.slice(0, -1));
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

      {/* ── CRUD modal — only for edit/delete flows now ── */}
      {hasWritableDepartment && <PolytopeManager
        departments={store.departments}
        onAddDepartment={store.addDepartment}
        onUpdateDepartment={store.updateDepartment}
        onDeleteDepartment={(id) => {
          if (selectedDeptId === id) {
            setSelectedDeptId(null);
            setRequestSelectDeptId(null);
          }
          void store.deleteDepartment(id);
        }}
        onAddNode={store.addNode}
        onUpdateNode={store.updateNode}
        onDeleteNode={store.deleteNode}
        forceOpen={managerOpen}
        forcedView={managerView}
        onForcedClose={() => setManagerOpen(false)}
      />}
    </div>
  );
}
