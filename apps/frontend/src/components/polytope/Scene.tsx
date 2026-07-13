import { useRef, useState, useMemo, useEffect, useCallback, type MutableRefObject } from 'react';
import { useFrame, useThree } from '@react-three/fiber';
import { OrbitControls, Stars, Sparkles, Billboard, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ConvexGeometry } from 'three-stdlib';
import { gsap } from 'gsap';
import { getExternalNodeColor, isActionLeafNode, isBdtWorkspaceLeafNode } from '../../lib/universalPolytopeData';
import type { UExternalNode, UInternalNode } from '../../lib/universalPolytopeData';
import { OrgCore, PlasmaSphere } from '../PolytopeShared';
import { symmetricDirs, seededShuffle } from './geometry';
import { vertexShader, fragmentShader } from './shaders';
import { GlowRing } from './GlowRing';
import { ExternalNode } from './ExternalNode';
import {
  computeDraftInternalNodePosition,
  computeInternalNodePosition,
  findNodeAtPath,
  computeDraftChildNodePosition,
  computeCameraFraming,
  isValidInternalPath,
  deptZoomDistance,
} from './internalNodeLayout';
import type { CoreWorkspacePhase } from '../../lib/coreWorkspaceTransition';
import { CORE_DIVE_DURATION_S, CORE_SURFACE_DURATION_S } from '../../lib/coreWorkspaceTransition';
import { useDragWorkspaceStore } from '../../lib/useDragWorkspaceStore';
import {
  CORE_AI_MAX_CAMERA_DISTANCE,
  POLYTOPE_EXIT_SCROLL_DELTA,
} from './constants';

const DEPT_ZOOM_DISTANCE = 10;

// ── Types ────────────────────────────────────────────────────────────────────

export interface SceneProps {
  selectedId: string | null;
  setSelectedId: (id: string | null) => void;
  onPathChange: (path: string[]) => void;
  setBackInfo: (info: { label: string; onClick: () => void } | null) => void;
  companyName: string;
  industryName?: string;
  subdomainName?: string;
  hoveredId: string | null;
  setHoveredId: (id: string | null) => void;
  departments: UExternalNode[];
  onExitIntent?: () => void;
  cameraResetTrigger?: number;
  requestSelectDeptId?: string | null;
  /** Bumped on sidebar dept selection to force camera fly-in */
  selectDeptNonce?: number;
  requestBackStep?: number;
  /** Draft external node — rendered as a pulsing preview vertex; not in store */
  draftDept?: UExternalNode | null;
  /** Ref that Scene writes the draft dept's screen-space position to each frame */
  draftNodeScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  /** Draft internal node — preview of a new node being added to the selected dept */
  draftInternalNode?: { deptId: string; node: UInternalNode } | null;
  /** Ref that Scene writes the draft internal node's screen-space position to each frame */
  draftInternalNodeScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  /** Transient draft member preview */
  draftMember?: { deptId: string; nodeId: string; member?: any } | null;
  /** Ref that Scene writes the draft member's screen-space position to each frame */
  draftMemberScreenPosRef?: MutableRefObject<{ x: number; y: number } | null>;
  selectedInternalPathProps?: string[];
  /** BDT: click core → dive animation → workspace */
  enableCoreWorkspace?: boolean;
  coreWorkspacePhase?: CoreWorkspacePhase;
  onCoreClickIntent?: () => void;
  onCoreDiveComplete?: () => void;
  onCoreSurfaceComplete?: () => void;
  voiceIntensityRef?: MutableRefObject<number>;
  /** When true, project leaves also trigger workspace camera framing (BDT route). */
  bdtWorkspaceLeaves?: boolean;
}

function workspaceLeafCheck(node: UInternalNode | null | undefined, bdt: boolean): boolean {
  return bdt ? isBdtWorkspaceLeafNode(node) : isActionLeafNode(node);
}

function findNodePosition(
  deptPos: THREE.Vector3,
  internalNodes: UInternalNode[],
  path: string[],
  currentDepth: number = 1
): THREE.Vector3 | null {
  if (path.length === 0) return deptPos;

  const targetId = path[0];
  const idx = internalNodes.findIndex(n => n.id === targetId);
  if (idx === -1) return null;

  const node = internalNodes[idx];
  const nodePos = computeInternalNodePosition(deptPos, idx, internalNodes.length);

  if (path.length === 1) return nodePos;

  return findChildNodePosition(node, nodePos, path.slice(1), currentDepth);
}

function findChildNodePosition(
  parentNode: UInternalNode,
  parentPos: THREE.Vector3,
  path: string[],
  depth: number
): THREE.Vector3 | null {
  if (path.length === 0) return parentPos;
  if (!parentNode.children || parentNode.children.length === 0) return null;

  const targetId = path[0];
  const idx = parentNode.children.findIndex(c => c.id === targetId);
  if (idx === -1) return null;

  const node = parentNode.children[idx];
  const count = parentNode.children.length;
  const ringRadius = 1.4 * Math.pow(0.7, depth - 1);

  const dir = parentPos.clone().normalize();
  const localUp = new THREE.Vector3(0, 1, 0);
  if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
  const right = new THREE.Vector3().crossVectors(dir, localUp).normalize();
  const up = new THREE.Vector3().crossVectors(right, dir).normalize();

  const depthStep = 3.0;
  const childCenter = parentPos.clone().add(dir.clone().multiplyScalar(depthStep));

  const angle = (idx / count) * Math.PI * 2;
  const childPos = childCenter.clone()
    .add(right.clone().multiplyScalar(Math.cos(angle) * ringRadius))
    .add(up.clone().multiplyScalar(Math.sin(angle) * ringRadius));

  if (path.length === 1) return childPos;
  return findChildNodePosition(node, childPos, path.slice(1), depth + 1);
}

function isLeafInternalNode(node: UInternalNode | null | undefined, bdtWorkspaceLeaves: boolean): boolean {
  return workspaceLeafCheck(node, bdtWorkspaceLeaves);
}

// ── Scene ────────────────────────────────────────────────────────────────────

export function Scene({
  selectedId,
  setSelectedId,
  onPathChange,
  setBackInfo,
  companyName,
  industryName,
  subdomainName,
  hoveredId,
  setHoveredId,
  departments,
  onExitIntent,
  cameraResetTrigger,
  requestSelectDeptId,
  selectDeptNonce = 0,
  requestBackStep,
  draftDept,
  draftNodeScreenPosRef,
  draftInternalNode,
  draftInternalNodeScreenPosRef,
  draftMember,
  draftMemberScreenPosRef,
  selectedInternalPathProps,
  enableCoreWorkspace = false,
  coreWorkspacePhase = 'idle',
  onCoreClickIntent,
  onCoreDiveComplete,
  onCoreSurfaceComplete,
  voiceIntensityRef,
  bdtWorkspaceLeaves = false,
}: SceneProps) {
  const isDragging = useDragWorkspaceStore(s => s.isDragging);
  const diveBlendRef = useRef({ value: 0 });
  const savedOverviewRef = useRef<{ camPos: THREE.Vector3; orbitTarget: THREE.Vector3 } | null>(null);
  const coreAnimTokenRef = useRef(0);
  const isCoreTransitioning =
    coreWorkspacePhase === 'diving-in' ||
    coreWorkspacePhase === 'workspace' ||
    coreWorkspacePhase === 'surfacing';
  // ── Derive geometry ───────────────────────────────────────────────────────
  // Draft dept is included so the convex hull + shader preview the exact final state.
  const {
    ACTIVE_NODES,
    ACTIVE_NODE_POSITIONS,
    SHUFFLED_ACTIVE_DIRS,
    NODE_COLORS,
    INITIAL_CAMERA_DISTANCE,
  } = useMemo(() => {
    const base = departments.filter(n => n.domain !== 'inactive');
    const nodes = draftDept ? [...base, draftDept] : base;
    const dirs = symmetricDirs(nodes.length);
    const shuffledDirs = seededShuffle(dirs, 137);
    const positions = nodes.map((_, i) => shuffledDirs[i].clone().multiplyScalar(12));
    const maxR = positions.length > 0 ? Math.max(...positions.map(p => p.length())) : 12;
    const colors = nodes.map(node => new THREE.Color(getExternalNodeColor(node)));
    return {
      ACTIVE_NODES: nodes,
      ACTIVE_NODE_POSITIONS: positions,
      SHUFFLED_ACTIVE_DIRS: shuffledDirs,
      NODE_COLORS: colors,
      INITIAL_CAMERA_DISTANCE: Math.max(45, maxR * 4.5),
    };
  }, [departments, draftDept]); // eslint-disable-line react-hooks/exhaustive-deps

  const EXTERNAL_NODE_POSITIONS = ACTIVE_NODE_POSITIONS;
  const orbitRef = useRef<any>(null);
  const { camera, gl } = useThree();

  // ── Exit intent (zoom out from overview → parent view e.g. planet roots) ──
  const onExitIntentRef = useRef(onExitIntent);
  onExitIntentRef.current = onExitIntent;
  const exitScrollDeltaRef = useRef(0);
  const selectedInternalPathRef = useRef<string[]>([]);

  useEffect(() => {
    exitScrollDeltaRef.current = 0;
  }, [selectedId]);

  useEffect(() => {
    if (!onExitIntentRef.current) return;
    const handleWheel = (e: WheelEvent) => {
      if (e.deltaY <= 0) {
        exitScrollDeltaRef.current = 0;
        return;
      }
      if (selectedId !== null) return;
      if (selectedInternalPathRef.current.length > 0) return;

      const dist = orbitRef.current
        ? camera.position.distanceTo(orbitRef.current.target)
        : camera.position.length();

      // Count zoom-out only once camera is at or past the default overview distance
      if (dist < INITIAL_CAMERA_DISTANCE - 2) {
        exitScrollDeltaRef.current = 0;
        return;
      }

      exitScrollDeltaRef.current += e.deltaY;
      if (exitScrollDeltaRef.current >= POLYTOPE_EXIT_SCROLL_DELTA) {
        exitScrollDeltaRef.current = 0;
        onExitIntentRef.current?.();
      }
    };
    gl.domElement.addEventListener('wheel', handleWheel, { passive: true });
    return () => gl.domElement.removeEventListener('wheel', handleWheel);
  }, [gl.domElement, camera, selectedId, INITIAL_CAMERA_DISTANCE]);

  // ── Camera fly to draft dept node when a new draft is spawned ─────────────
  const prevDraftIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (!draftDept) { prevDraftIdRef.current = null; return; }
    if (draftDept.id === prevDraftIdRef.current) return;
    prevDraftIdRef.current = draftDept.id;

    const draftIdx = ACTIVE_NODES.findIndex(n => n.id === draftDept.id);
    if (draftIdx === -1) return;
    const pos = ACTIVE_NODE_POSITIONS[draftIdx];

    if (orbitRef.current) {
      gsap.to(orbitRef.current.target, { x: pos.x, y: pos.y, z: pos.z, duration: 1.5, ease: 'power3.inOut' });
      const dir = pos.clone().normalize();
      const camTarget = pos.clone().add(dir.multiplyScalar(22));
      gsap.to(camera.position, { x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: 1.5, ease: 'power3.inOut' });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftDept?.id]);

  // ── Draft internal node: save camera, fly to preview slot, restore on exit ──
  const preDraftInternalCameraRef = useRef<{
    orbitTarget: THREE.Vector3;
    camPos: THREE.Vector3;
    internalPath: string[];
  } | null>(null);
  const prevDraftInternalIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!draftInternalNode) {
      if (prevDraftInternalIdRef.current && preDraftInternalCameraRef.current) {
        const saved = preDraftInternalCameraRef.current;
        preDraftInternalCameraRef.current = null;
        prevDraftInternalIdRef.current = null;
        setSelectedInternalPath(saved.internalPath);
        onPathChange(saved.internalPath);
        if (orbitRef.current) {
          gsap.to(orbitRef.current.target, {
            x: saved.orbitTarget.x, y: saved.orbitTarget.y, z: saved.orbitTarget.z,
            duration: 1.2, ease: 'power3.inOut',
          });
          gsap.to(camera.position, {
            x: saved.camPos.x, y: saved.camPos.y, z: saved.camPos.z,
            duration: 1.2, ease: 'power3.inOut',
          });
        }
      }
      return;
    }

    if (draftInternalNode.node.id === prevDraftInternalIdRef.current) return;
    prevDraftInternalIdRef.current = draftInternalNode.node.id;

    if (orbitRef.current) {
      preDraftInternalCameraRef.current = {
        orbitTarget: orbitRef.current.target.clone(),
        camPos: camera.position.clone(),
        internalPath: [...selectedInternalPath],
      };
    }
    // Keep camera fixed — draft preview appears at its final ring slot (see ExternalNode)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [draftInternalNode?.node.id, draftInternalNode?.deptId]);

  // ── Camera reset to overview (entry, create confirm, draft dept cancel) ────
  useEffect(() => {
    if (!cameraResetTrigger || coreWorkspacePhase !== 'idle') return;
    setSelectedId(null);
    setSelectedInternalPath([]);
    onPathChange([]);
    cameraHistoryRef.current = [];
    if (orbitRef.current) {
      gsap.to(orbitRef.current.target, { x: 0, y: 0, z: 0, duration: 1.4, ease: 'power3.inOut' });
    }
    gsap.to(camera.position, { x: 0, y: 0, z: INITIAL_CAMERA_DISTANCE, duration: 1.4, ease: 'power3.inOut' });
  }, [cameraResetTrigger]); // eslint-disable-line react-hooks/exhaustive-deps

  const facesMatRef = useRef<THREE.ShaderMaterial>(null);
  const coreGroupRef = useRef<THREE.Group>(null);
  const cameraPosRef = useRef(new THREE.Vector3());

  const runCoreDiveAnimation = () => {
    const token = ++coreAnimTokenRef.current;
    gsap.killTweensOf(camera.position);
    if (orbitRef.current) gsap.killTweensOf(orbitRef.current.target);
    if (orbitRef.current) {
      savedOverviewRef.current = {
        camPos: camera.position.clone(),
        orbitTarget: orbitRef.current.target.clone(),
      };
    }
    setSelectedId(null);
    setSelectedInternalPath([]);
    onPathChange([]);
    cameraHistoryRef.current = [];

    const tl = gsap.timeline({
      onComplete: () => {
        if (token !== coreAnimTokenRef.current) return;
        onCoreDiveComplete?.();
      },
    });

    tl.to(diveBlendRef.current, { value: 1, duration: CORE_DIVE_DURATION_S, ease: 'power4.inOut' }, 0);

    if (orbitRef.current) {
      tl.to(orbitRef.current.target, { x: 0, y: 0, z: 0, duration: CORE_DIVE_DURATION_S, ease: 'power4.inOut' }, 0);
    }
    tl.to(
      camera.position,
      { x: 0, y: 0, z: 4.3, duration: CORE_DIVE_DURATION_S, ease: 'power4.inOut' },
      0,
    );
  };

  const runCoreSurfaceAnimation = () => {
    const token = ++coreAnimTokenRef.current;
    gsap.killTweensOf(camera.position);
    if (orbitRef.current) gsap.killTweensOf(orbitRef.current.target);
    const saved = savedOverviewRef.current;
    const camTarget = saved?.camPos ?? new THREE.Vector3(0, 0, INITIAL_CAMERA_DISTANCE);
    const orbitTarget = saved?.orbitTarget ?? new THREE.Vector3(0, 0, 0);

    const tl = gsap.timeline({
      onComplete: () => {
        if (token !== coreAnimTokenRef.current) return;
        savedOverviewRef.current = null;
        onCoreSurfaceComplete?.();
      },
    });

    tl.to(diveBlendRef.current, { value: 0, duration: CORE_SURFACE_DURATION_S, ease: 'power3.out' }, 0);

    if (orbitRef.current) {
      tl.to(
        orbitRef.current.target,
        { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: CORE_SURFACE_DURATION_S, ease: 'power3.out' },
        0,
      );
    }
    tl.to(
      camera.position,
      { x: camTarget.x, y: camTarget.y, z: camTarget.z, duration: CORE_SURFACE_DURATION_S, ease: 'power3.out' },
      0,
    );
  };

  const prevCorePhaseRef = useRef<CoreWorkspacePhase>('idle');
  useEffect(() => {
    const prev = prevCorePhaseRef.current;
    prevCorePhaseRef.current = coreWorkspacePhase;

    if (coreWorkspacePhase === 'diving-in' && prev !== 'diving-in') {
      runCoreDiveAnimation();
    }
    if (coreWorkspacePhase === 'surfacing' && prev !== 'surfacing') {
      runCoreSurfaceAnimation();
    }
    if (coreWorkspacePhase === 'idle' && prev === 'workspace') {
      diveBlendRef.current.value = 0;
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [coreWorkspacePhase]);

  // ── Camera history for sidebar back-step navigation ───────────────────────
  const cameraHistoryRef = useRef<Array<{
    path: string[];
    orbitTarget: THREE.Vector3;
    camPos: THREE.Vector3;
  }>>([]);
  const prevBackStepRef = useRef(0);

  const [selectedInternalPath, setSelectedInternalPath] = useState<string[]>([]);
  selectedInternalPathRef.current = selectedInternalPath;
  const isDeepDrillDown = selectedInternalPath.length > 0;

  const [isCoreZoomedIn, setIsCoreZoomedIn] = useState(false);

  useFrame(() => {
    if (!orbitRef.current) return;
    const dist = camera.position.distanceTo(orbitRef.current.target);
    const zoomedIn = dist <= CORE_AI_MAX_CAMERA_DISTANCE;
    setIsCoreZoomedIn(prev => (prev !== zoomedIn ? zoomedIn : prev));
  });

  const handleCoreClick = () => {
    if (!enableCoreWorkspace || coreWorkspacePhase !== 'idle') return;
    if (selectedId || isDeepDrillDown || draftDept) return;
    if (!isCoreZoomedIn) return;
    onCoreClickIntent?.();
  };

  const prevPathPropsRef = useRef<string[]>([]);
  useEffect(() => {
    const nextPath = selectedInternalPathProps ?? [];
    if (nextPath.length === prevPathPropsRef.current.length &&
      nextPath.every((id, idx) => id === prevPathPropsRef.current[idx])) {
      return;
    }
    prevPathPropsRef.current = nextPath;

    const deptIdx = selectedId !== null ? ACTIVE_NODES.findIndex(n => n.id === selectedId) : -1;
    const deptNodes = deptIdx >= 0 ? ACTIVE_NODES[deptIdx].internalNodes : [];
    const validatedPath =
      deptIdx >= 0 && isValidInternalPath(deptNodes, nextPath) ? nextPath : [];

    if (validatedPath.length !== nextPath.length) {
      onPathChange(validatedPath);
    }

    if (validatedPath.length === selectedInternalPath.length &&
      validatedPath.every((id, idx) => id === selectedInternalPath[idx])) {
      return;
    }

    // If drilling deeper from sidebar selection, save current camera to history
    if (validatedPath.length > selectedInternalPath.length && orbitRef.current) {
      cameraHistoryRef.current.push({
        path: [...selectedInternalPath],
        orbitTarget: orbitRef.current.target.clone(),
        camPos: camera.position.clone(),
      });
    } else if (validatedPath.length < selectedInternalPath.length) {
      // If we are jumping to a shallower path direct from sidebar (not back button),
      // we can truncate history to match the new path length to keep history in sync.
      cameraHistoryRef.current = cameraHistoryRef.current.filter(h => h.path.length < validatedPath.length);
    }

    setSelectedInternalPath(validatedPath);

    if (selectedId === null) return;
    if (deptIdx === -1) return;
    const deptPos = ACTIVE_NODE_POSITIONS[deptIdx];
    const internalCount = ACTIVE_NODES[deptIdx].internalNodes.length;
    const zoom = deptZoomDistance(internalCount, DEPT_ZOOM_DISTANCE);

    if (validatedPath.length === 0) {
      if (orbitRef.current && deptPos) {
        const dir = deptPos.clone().normalize();
        const { camPos, orbitTarget } = computeCameraFraming(deptPos, dir, internalCount, zoom);
        gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.2, ease: 'power2.inOut' });
        gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.2, ease: 'power2.inOut' });
      }
    } else {
      const targetPos = findNodePosition(deptPos, ACTIVE_NODES[deptIdx].internalNodes, validatedPath);
      const parentNode = findNodeAtPath(ACTIVE_NODES[deptIdx].internalNodes, validatedPath);
      if (targetPos && orbitRef.current) {
        const dir = targetPos.clone().normalize();
        const isLeaf = isLeafInternalNode(parentNode, bdtWorkspaceLeaves);
        const shift = isLeaf ? 2.5 : 0.0;
        const leafZoom = isLeaf ? 4.0 : zoom;
        const { camPos, orbitTarget } = computeCameraFraming(targetPos, dir, parentNode?.children?.length ?? 0, leafZoom, shift);
        gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.0, ease: 'power2.inOut' });
        gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.0, ease: 'power2.inOut' });
      }
    }
  }, [selectedInternalPathProps, selectedId, ACTIVE_NODES, ACTIVE_NODE_POSITIONS, camera, selectedInternalPath, bdtWorkspaceLeaves]);

  useEffect(() => {
    setBackInfo(null);
    cameraHistoryRef.current = [];
    if (selectedId === null) {
      setSelectedInternalPath([]);
      onPathChange([]);
    }
  }, [selectedId, setBackInfo]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (selectedId === null && orbitRef.current) {
      setSelectedInternalPath([]);
      gsap.to(orbitRef.current.target, { x: 0, y: 0, z: 0, duration: 1.5, ease: 'power3.inOut' });
      const currentDir = camera.position.clone().normalize();
      const targetCamPos = currentDir.multiplyScalar(INITIAL_CAMERA_DISTANCE);
      gsap.to(camera.position, {
        x: targetCamPos.x, y: targetCamPos.y, z: targetCamPos.z,
        duration: 1.5, ease: 'power3.inOut',
      });
    }
  }, [selectedId, camera]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleInternalClick = (path: string[], pos: THREE.Vector3, parentId: string) => {
    if (path.length === 0) {
      cameraHistoryRef.current = [];
      setSelectedInternalPath([]);
      onPathChange([]);
      const extNodeIdx = ACTIVE_NODES.findIndex(n => n.id === parentId);
      const extPos = EXTERNAL_NODE_POSITIONS[extNodeIdx];
      if (orbitRef.current && extPos) {
        const dir = extPos.clone().normalize();
        const internalCount = ACTIVE_NODES[extNodeIdx].internalNodes.length;
        const zoom = deptZoomDistance(internalCount, DEPT_ZOOM_DISTANCE);
        const { camPos, orbitTarget } = computeCameraFraming(extPos, dir, internalCount, zoom);
        gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.2, ease: 'power2.inOut' });
        gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.2, ease: 'power2.inOut' });
      }
    } else {
      if (orbitRef.current) {
        cameraHistoryRef.current.push({
          path: selectedInternalPath,
          orbitTarget: orbitRef.current.target.clone(),
          camPos: camera.position.clone(),
        });
      }
      setSelectedInternalPath(path);
      onPathChange(path);
      if (orbitRef.current) {
        const extNodeIdx = ACTIVE_NODES.findIndex(n => n.id === parentId);
        const parentNode = findNodeAtPath(ACTIVE_NODES[extNodeIdx].internalNodes, path);
        const dir = pos.clone().normalize();
        const isLeaf = isLeafInternalNode(parentNode, bdtWorkspaceLeaves);
        const shift = isLeaf ? 2.5 : 0.0;
        const zoom = isLeaf ? 4.0 : 10;
        const { camPos, orbitTarget } = computeCameraFraming(pos, dir, parentNode?.children?.length ?? 0, zoom, shift);
        gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.0, ease: 'power2.inOut' });
        gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.0, ease: 'power2.inOut' });
      }
    }
  };

  // ── Sidebar back-step request ─────────────────────────────────────────────
  useEffect(() => {
    if (!requestBackStep || requestBackStep === prevBackStepRef.current) return;
    prevBackStepRef.current = requestBackStep;

    const history = cameraHistoryRef.current;
    if (history.length > 0) {
      const prev = history[history.length - 1];
      cameraHistoryRef.current = history.slice(0, -1);
      setSelectedInternalPath(prev.path);
      onPathChange(prev.path);
      if (orbitRef.current) {
        gsap.to(orbitRef.current.target, {
          x: prev.orbitTarget.x, y: prev.orbitTarget.y, z: prev.orbitTarget.z,
          duration: 1.0, ease: 'power2.inOut',
        });
        gsap.to(camera.position, {
          x: prev.camPos.x, y: prev.camPos.y, z: prev.camPos.z,
          duration: 1.0, ease: 'power2.inOut',
        });
      }
    } else {
      setSelectedInternalPath([]);
      onPathChange([]);
      if (selectedId && orbitRef.current) {
        const extIdx = ACTIVE_NODES.findIndex(n => n.id === selectedId);
        const extPos = ACTIVE_NODE_POSITIONS[extIdx];
        if (extPos) {
          const dir = extPos.clone().normalize();
          const internalCount = ACTIVE_NODES[extIdx].internalNodes.length;
          const zoom = deptZoomDistance(internalCount, DEPT_ZOOM_DISTANCE);
          const { camPos, orbitTarget } = computeCameraFraming(extPos, dir, internalCount, zoom);
          gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.2, ease: 'power2.inOut' });
          gsap.to(camera.position, {
            x: camPos.x, y: camPos.y, z: camPos.z,
            duration: 1.2, ease: 'power2.inOut',
          });
        }
      }
    }
  }, [requestBackStep]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Neighbor highlight for hovered node ──────────────────────────────────
  const neighborIds = useMemo(() => {
    if (!hoveredId) return [];
    const hoveredIdx = ACTIVE_NODES.findIndex(n => n.id === hoveredId);
    if (hoveredIdx === -1) return [];

    const neighbors: string[] = [];
    let minDist = Infinity;
    const allPairs: { i: number; j: number; dist: number }[] = [];

    for (let i = 0; i < ACTIVE_NODES.length; i++) {
      for (let j = i + 1; j < ACTIVE_NODES.length; j++) {
        const d = SHUFFLED_ACTIVE_DIRS[i].distanceTo(SHUFFLED_ACTIVE_DIRS[j]);
        allPairs.push({ i, j, dist: d });
        if (d < minDist) minDist = d;
      }
    }
    const threshold = minDist * 1.05;
    allPairs.forEach(p => {
      if (p.dist <= threshold) {
        if (p.i === hoveredIdx) neighbors.push(ACTIVE_NODES[p.j].id);
        if (p.j === hoveredIdx) neighbors.push(ACTIVE_NODES[p.i].id);
      }
    });
    return neighbors;
  }, [hoveredId]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Per-frame updates ─────────────────────────────────────────────────────
  useFrame(() => {
    if (coreWorkspacePhase !== 'idle' && orbitRef.current) {
      orbitRef.current.update();
    }
    camera.getWorldPosition(cameraPosRef.current);
    const dive = diveBlendRef.current.value;
    if (facesMatRef.current) {
      facesMatRef.current.uniforms.uCameraPos.value.copy(cameraPosRef.current);
      let targetOpacity = selectedId !== null ? 0.03 : 0.22;
      if (hoveredId !== null) targetOpacity = 0.04;
      targetOpacity *= 1 - dive * 0.92;
      facesMatRef.current.uniforms.uOpacity.value = THREE.MathUtils.lerp(
        facesMatRef.current.uniforms.uOpacity.value,
        targetOpacity,
        0.08
      );
    }
    if (coreGroupRef.current) {
      const deepScale = selectedId !== null ? 0.0 : 1.0;
      const diveScale = 1.0;
      const targetScale = deepScale * diveScale;
      coreGroupRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.12
      );
    }
  });

  // ── Screen-space position tracking for draft nodes ────────────────────────
  useFrame(({ camera: cam, gl: renderer }) => {
    if (draftNodeScreenPosRef) {
      const draftIdx = draftDept ? ACTIVE_NODES.findIndex(n => n.id === draftDept.id) : -1;
      if (draftIdx !== -1) {
        const wp = ACTIVE_NODE_POSITIONS[draftIdx].clone().project(cam);
        const rect = renderer.domElement.getBoundingClientRect();
        draftNodeScreenPosRef.current = {
          x: rect.left + (wp.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-wp.y * 0.5 + 0.5) * rect.height,
        };
      } else {
        draftNodeScreenPosRef.current = null;
      }
    }

    if (draftInternalNodeScreenPosRef && draftInternalNode && selectedId === draftInternalNode.deptId) {
      const deptIdx = ACTIVE_NODES.findIndex(n => n.id === draftInternalNode.deptId);
      if (deptIdx !== -1) {
        const dept = ACTIVE_NODES[deptIdx];
        const deptPos = ACTIVE_NODE_POSITIONS[deptIdx];

        let draftPos: THREE.Vector3;
        const path = selectedInternalPathProps ?? [];
        if (path.length === 0) {
          draftPos = computeDraftInternalNodePosition(
            deptPos,
            dept.internalNodes.length,
          );
        } else {
          const parentNode = findNodeAtPath(dept.internalNodes, path);
          const parentPos = findNodePosition(deptPos, dept.internalNodes, path);
          if (parentNode && parentPos) {
            draftPos = computeDraftChildNodePosition(
              parentPos,
              parentNode.children?.length ?? 0,
              path.length + 1
            );
          } else {
            draftPos = computeDraftInternalNodePosition(
              deptPos,
              dept.internalNodes.length,
            );
          }
        }

        const wp3 = draftPos.clone().project(cam);
        const rect = renderer.domElement.getBoundingClientRect();
        draftInternalNodeScreenPosRef.current = {
          x: rect.left + (wp3.x * 0.5 + 0.5) * rect.width,
          y: rect.top + (-wp3.y * 0.5 + 0.5) * rect.height,
        };
      }
    }
  });

  // ── Convex hull face geometry ─────────────────────────────────────────────
  const { facesGeometry } = useMemo(() => {
    const baseGeo = new ConvexGeometry(ACTIVE_NODE_POSITIONS);
    const fGeo = baseGeo.toNonIndexed();
    fGeo.computeVertexNormals();

    const posAttr = fGeo.getAttribute('position') as THREE.BufferAttribute;
    const colors = new Float32Array(posAttr.count * 3);
    const alphas = new Float32Array(posAttr.count);
    for (let i = 0; i < posAttr.count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(posAttr, i);
      const idx = ACTIVE_NODE_POSITIONS.findIndex(p => p.distanceToSquared(v) < 0.01);
      const col = idx >= 0 ? NODE_COLORS[idx] : new THREE.Color(0, 0, 0);
      colors[i * 3] = col.r; colors[i * 3 + 1] = col.g; colors[i * 3 + 2] = col.b;
      alphas[i] = idx >= 0 ? 1.0 : 0.0;
    }
    fGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    fGeo.setAttribute('vertexAlpha', new THREE.BufferAttribute(alphas, 1));
    return { facesGeometry: fGeo };
  }, [ACTIVE_NODE_POSITIONS, NODE_COLORS]);

  // ── Interaction handlers ──────────────────────────────────────────────────
  const flyToDepartment = useCallback((
    deptId: string,
    internalPath: string[] = [],
  ) => {
    const idx = ACTIVE_NODES.findIndex(n => n.id === deptId);
    if (idx === -1) return;
    const pos = ACTIVE_NODE_POSITIONS[idx];
    const dept = ACTIVE_NODES[idx];
    const validatedPath = isValidInternalPath(dept.internalNodes, internalPath) ? internalPath : [];

    setSelectedId(deptId);
    setSelectedInternalPath(validatedPath);
    onPathChange(validatedPath);

    if (!orbitRef.current) return;

    if (validatedPath.length === 0) {
      const internalCount = dept.internalNodes.length;
      const zoom = deptZoomDistance(internalCount, DEPT_ZOOM_DISTANCE);
      const dir = pos.clone().normalize();
      const { camPos, orbitTarget } = computeCameraFraming(pos, dir, internalCount, zoom);
      gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.5, ease: 'power3.inOut' });
      gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.5, ease: 'power3.inOut' });
      return;
    }

    const targetPos = findNodePosition(pos, dept.internalNodes, validatedPath);
    const parentNode = findNodeAtPath(dept.internalNodes, validatedPath);
    if (!targetPos) return;
    const dir = targetPos.clone().normalize();
        const isLeaf = isLeafInternalNode(parentNode, bdtWorkspaceLeaves);
    const shift = isLeaf ? 2.5 : 0.0;
    const zoom = isLeaf ? 4.0 : deptZoomDistance(dept.internalNodes.length, DEPT_ZOOM_DISTANCE);
    const { camPos, orbitTarget } = computeCameraFraming(
      targetPos,
      dir,
      parentNode?.children?.length ?? 0,
      zoom,
      shift,
    );
    gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.0, ease: 'power2.inOut' });
    gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.0, ease: 'power2.inOut' });
  }, [ACTIVE_NODES, ACTIVE_NODE_POSITIONS, camera, onPathChange, setSelectedId, bdtWorkspaceLeaves]);

  const handleNodeClick = (id: string, pos: THREE.Vector3) => {
    if (selectedId === id) {
      setSelectedId(null);
    } else {
      setSelectedId(id);
      setSelectedInternalPath([]);
      onPathChange([]);
      if (orbitRef.current) {
        const nodeObj = ACTIVE_NODES.find(n => n.id === id);
        const internalCount = nodeObj?.internalNodes.length ?? 0;
        const zoom = deptZoomDistance(internalCount, DEPT_ZOOM_DISTANCE);
        const dir = pos.clone().normalize();
        const { camPos, orbitTarget } = computeCameraFraming(pos, dir, internalCount, zoom);
        gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.5, ease: 'power3.inOut' });
        gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.5, ease: 'power3.inOut' });
      }
    }
  };

  const prevSelectRequestRef = useRef<{ id: string | null | undefined; nonce: number }>({
    id: undefined,
    nonce: -1,
  });
  useEffect(() => {
    if (requestSelectDeptId === undefined) return;
    const nonce = selectDeptNonce ?? 0;
    if (
      prevSelectRequestRef.current.id === requestSelectDeptId &&
      prevSelectRequestRef.current.nonce === nonce
    ) {
      return;
    }
    prevSelectRequestRef.current = { id: requestSelectDeptId, nonce };

    if (requestSelectDeptId === null) {
      setSelectedId(null);
      setSelectedInternalPath([]);
      onPathChange([]);
      return;
    }

    const pathFromProps = selectedInternalPathProps ?? [];
    flyToDepartment(requestSelectDeptId, pathFromProps);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requestSelectDeptId, selectDeptNonce]);

  const handlePointerMissed = () => {
    // Intentionally left blank: clicking the background should not reset the view
    // so users don't accidentally lose their deep drill-down context.
  };

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <>
      <color attach="background" args={['#000000']} />
      <ambientLight intensity={0.5} />
      <Stars radius={100} depth={50} count={5000} factor={4} saturation={0.5} fade speed={0.4} />
      <Sparkles count={600} scale={45} size={2} speed={0.2} opacity={0.2} color="#88aaff" />
      <Sparkles count={300} scale={30} size={3} speed={0.5} opacity={0.3} color="#ffaaff" />
      <pointLight position={[0, 0, 0]} intensity={2} color="#ffffff" distance={20} />
      <directionalLight position={[10, 10, 10]} intensity={1} />

      <group onPointerMissed={handlePointerMissed}>
        <group ref={coreGroupRef}>
          <OrgCore
            dimmed={selectedId !== null && coreWorkspacePhase === 'idle'}
            companyName={companyName}
            industryName={industryName}
            subdomainName={subdomainName}
            isDeepDrillDown={isDeepDrillDown}
            showWorkspaceCta={
              enableCoreWorkspace &&
              isCoreZoomedIn &&
              coreWorkspacePhase === 'idle' &&
              !selectedId &&
              !isDeepDrillDown &&
              !draftDept
            }
            coreClickEnabled={isCoreZoomedIn}
            onClick={enableCoreWorkspace ? handleCoreClick : undefined}
            voiceIntensityRef={voiceIntensityRef}
            hideCompanyName={coreWorkspacePhase !== 'idle'}
            coreWorkspacePhase={coreWorkspacePhase}
          />
        </group>

        {ACTIVE_NODES.map((node, i) => {
          const pos = ACTIVE_NODE_POSITIONS[i];

          if (node.isDraft) {
            const color = '#' + NODE_COLORS[i].getHexString();
            return (
              <group key={node.id}>
                <group position={pos}>
                  <GlowRing color={color} active={true} isSelected={false} idx={i + 500} />
                </group>
                <group position={pos}>
                  <PlasmaSphere color={color} radius={0.3} opacity={1.0} glowIntensity={4.0} depthWrite={false} speed={4} />
                </group>
                <Billboard position={[pos.x, pos.y - 1.5, pos.z]} follow={true} lockX={false} lockY={false} lockZ={false}>
                  <Text
                    color={color}
                    fontSize={0.25}
                    maxWidth={4.0}
                    lineHeight={1.1}
                    letterSpacing={0.06}
                    textAlign="center"
                    anchorX="center"
                    anchorY="middle"
                    fillOpacity={0.95}
                    outlineWidth={0.01}
                    outlineColor="#000000"
                    outlineOpacity={0.8}
                  >
                    ✦ {node.label}
                  </Text>
                </Billboard>
              </group>
            );
          }

          const isSelected = selectedId === node.id;
          const isHighlighted = hoveredId === null || node.id === hoveredId || neighborIds.includes(node.id);
          const isDimmed =
            isCoreTransitioning ||
            (selectedId !== null && selectedId !== node.id) ||
            (hoveredId !== null && !isHighlighted);
          const color = '#' + NODE_COLORS[i].getHexString();

          const draftChild =
            draftInternalNode && draftInternalNode.deptId === node.id
              ? draftInternalNode.node
              : null;

          return (
            <ExternalNode
              key={node.id}
              node={node}
              pos={pos}
              isSelected={isSelected}
              isDimmed={isDimmed}
              onClick={() => handleNodeClick(node.id, pos)}
              color={color}
              selectedInternalPath={selectedInternalPath}
              onSelectInternal={(path, targetPos) => handleInternalClick(path, targetPos, node.id)}
              setBackInfo={setBackInfo}
              isDeepDrillDown={isDeepDrillDown}
              onHover={setHoveredId}
              idx={i}
              isHovered={hoveredId === node.id}
              draftChildNode={draftChild}
              draftMember={draftMember && draftMember.deptId === node.id ? draftMember : null}
              draftMemberScreenPosRef={draftMemberScreenPosRef}
            />
          );
        })}

        {/* Translucent spectral shell */}
        <mesh geometry={facesGeometry}>
          <shaderMaterial
            ref={facesMatRef}
            vertexShader={vertexShader}
            fragmentShader={fragmentShader}
            uniforms={{
              uOpacity: { value: selectedId !== null ? 0.05 : 0.22 },
              uCameraPos: { value: new THREE.Vector3() },
            }}
            transparent
            side={THREE.DoubleSide}
            blending={THREE.AdditiveBlending}
            vertexColors
            depthWrite={false}
          />
        </mesh>
      </group>

      <OrbitControls
        ref={orbitRef}
        makeDefault
        minDistance={5}
        maxDistance={65}
        enablePan={false}
        enabled={coreWorkspacePhase === 'idle' && !isDragging}
      />
    </>
  );
}
