import { useState, useCallback, type MutableRefObject } from 'react';
import { Canvas } from '@react-three/fiber';
import type { UExternalNode, UInternalNode } from '../../lib/universalPolytopeData';
import { usePolytopeStore, type PolytopeStoreScope } from '../../lib/usePolytopeStore';
import { PolytopeManager } from '../PolytopeManager';
import { AnalyticHoverCard } from './AnalyticHoverCard';
import { Scene } from './Scene';
import { BASE_CAMERA_DISTANCE } from './constants';
import type { CoreWorkspacePhase } from '../../lib/coreWorkspaceTransition';

// ── Props ─────────────────────────────────────────────────────────────────────

export interface UniversalPolytopeProps {
  companyName?: string;
  industryName?: string;
  subdomainName?: string;
  onExitIntent?: () => void;
  transparent?: boolean;
  cameraResetTrigger?: number;
  /** Called whenever a department is selected (id) or deselected (null) in the 3D scene */
  onDepartmentChange?: (id: string | null) => void;
  /** Called whenever the internal drill-down path changes */
  onInternalPathChange?: (path: string[]) => void;
  /** When set, auto-flies camera to this department and selects it */
  requestSelectDeptId?: string | null;
  /** Increment on sidebar dept picks to re-fly camera even to the same dept */
  selectDeptNonce?: number;
  /** Increment to trigger going back exactly one internal node level with camera animation */
  requestBackStep?: number;
  /** Transient draft dept rendered as a pulsing preview node (not persisted) */
  draftDept?: UExternalNode | null;
  /** Ref written by Scene each frame with screen-space position of the draft dept node */
  draftNodeScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  /** Transient draft internal node preview */
  draftInternalNode?: { deptId: string; node: UInternalNode } | null;
  /** Ref written by Scene each frame with screen-space position of the draft internal node */
  draftInternalNodeScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  /** Transient draft member preview */
  draftMember?: { deptId: string; nodeId: string; member?: any } | null;
  /** Ref written by Scene each frame with screen-space position of the draft member */
  draftMemberScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  /** Optional departments list to synchronize with external state store */
  departments?: UExternalNode[];
  /** Optional current selected internal path to synchronize drill-down state */
  selectedInternalPath?: string[];
  /** BDT route: click core → dive → product workspace */
  enableCoreWorkspace?: boolean;
  coreWorkspacePhase?: CoreWorkspacePhase;
  onCoreClickIntent?: () => void;
  onCoreDiveComplete?: () => void;
  onCoreSurfaceComplete?: () => void;
  /** Which persisted graph to use when `departments` is not passed (default: twin /3d) */
  storeScope?: PolytopeStoreScope;
  voiceIntensityRef?: MutableRefObject<number>;
  readOnly?: boolean;
  /** BDT: project leaves open the action workspace side panel */
  bdtWorkspaceLeaves?: boolean;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function UniversalPolytope({
  companyName = 'Universal Polytope',
  industryName,
  subdomainName,
  onExitIntent,
  transparent = false,
  cameraResetTrigger = 0,
  onDepartmentChange,
  onInternalPathChange,
  requestSelectDeptId,
  selectDeptNonce = 0,
  requestBackStep,
  draftDept,
  draftNodeScreenPosRef,
  draftInternalNode,
  draftInternalNodeScreenPosRef,
  draftMember,
  draftMemberScreenPosRef,
  departments,
  selectedInternalPath,
  enableCoreWorkspace = false,
  coreWorkspacePhase = 'idle',
  onCoreClickIntent,
  onCoreDiveComplete,
  onCoreSurfaceComplete,
  storeScope = 'twin',
  voiceIntensityRef,
  readOnly = false,
  bdtWorkspaceLeaves = false,
}: UniversalPolytopeProps) {
  const [selectedId, setSelectedIdRaw] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  // no-op — back info is used only when rendering an in-canvas back button
  const setBackInfo = useCallback(
    (_info: { label: string; onClick: () => void } | null) => { },
    []
  );

  const setSelectedId = (id: string | null) => {
    setSelectedIdRaw(id);
    onDepartmentChange?.(id);
  };

  const store = usePolytopeStore(storeScope);
  const displayDepartments = departments ?? store.departments;

  return (
    <div style={{ position: 'relative', width: '100%', height: '100%' }}>
      <Canvas
        camera={{ position: [0, 0, BASE_CAMERA_DISTANCE], fov: 45, near: 0.1, far: 300 }}
        dpr={[1, 1.5]}
        gl={{ antialias: true, alpha: transparent }}
      >
        <Scene
          selectedId={selectedId}
          setSelectedId={setSelectedId}
          onPathChange={path => { onInternalPathChange?.(path); }}
          setBackInfo={setBackInfo}
          companyName={companyName}
          industryName={industryName}
          subdomainName={subdomainName}
          hoveredId={hoveredId}
          setHoveredId={setHoveredId}
          departments={displayDepartments}
          onExitIntent={onExitIntent}
          cameraResetTrigger={cameraResetTrigger}
          requestSelectDeptId={requestSelectDeptId}
          selectDeptNonce={selectDeptNonce}
          requestBackStep={requestBackStep}
          draftDept={draftDept}
          draftNodeScreenPosRef={draftNodeScreenPosRef}
          draftInternalNode={draftInternalNode}
          draftInternalNodeScreenPosRef={draftInternalNodeScreenPosRef}
          draftMember={draftMember}
          draftMemberScreenPosRef={draftMemberScreenPosRef}
          selectedInternalPathProps={selectedInternalPath}
          enableCoreWorkspace={enableCoreWorkspace && !readOnly}
          coreWorkspacePhase={coreWorkspacePhase}
          onCoreClickIntent={onCoreClickIntent}
          onCoreDiveComplete={onCoreDiveComplete}
          onCoreSurfaceComplete={onCoreSurfaceComplete}
          voiceIntensityRef={voiceIntensityRef}
          bdtWorkspaceLeaves={bdtWorkspaceLeaves}
        />
      </Canvas>

      <AnalyticHoverCard hoveredId={hoveredId} departments={displayDepartments} />

      {!transparent && !readOnly && (
        <PolytopeManager
          departments={displayDepartments}
          onAddDepartment={store.addDepartment}
          onUpdateDepartment={store.updateDepartment}
          onDeleteDepartment={store.deleteDepartment}
          onAddNode={store.addNode}
          onUpdateNode={store.updateNode}
          onDeleteNode={store.deleteNode}
        />
      )}
    </div>
  );
}
