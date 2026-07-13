import { useRef, useMemo, useEffect, createContext, useContext, useState, useCallback } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { OrbitControls } from '@react-three/drei/core/OrbitControls';
import { Stars } from '@react-three/drei/core/Stars';
import { Html } from '@react-three/drei/web/Html';
import { Line } from '@react-three/drei/core/Line';
import * as THREE from 'three';
import type { TwinNode, TwinEdge } from '../types';
import { GRAPH_LAYOUT } from '../db';
import { EMERGE_PARENT } from '../data/twinGraph';

/* ------------------------------------------------------------------ */
/*  Props                                                              */
/* ------------------------------------------------------------------ */
export interface Graph3DProps {
  nodes: TwinNode[];
  edges: TwinEdge[];
  selectedNode: string | null;
  hoveredNode: string | null;
  onSelect: (id: string | null) => void;
  onHover: (id: string | null) => void;
  onNavigate?: (route: string) => void;
  myCompanyId?: string | null;
  emergeParentMap?: Record<string, string>;
}

/* ------------------------------------------------------------------ */
/*  Scope state & context                                              */
/* ------------------------------------------------------------------ */

interface ScopeState {
  level: ScopeLevel;
  distance: number;
  cameraPos: THREE.Vector3;
  focusedCluster: string | null;   // which industry cluster camera is inside
  clusterFocus: number;            // smooth 0-1
  focusedCompany: string | null;   // which company is open
  companyFocus: number;            // smooth 0-1
  clusterFilter: ClusterFilter;
  instantCompanyEnter?: boolean;   // one-frame snap for logged-in company
}

type EnterCompanyOptions = {
  /** Skip camera zoom / focus fade (logged-in user's company). */
  instant?: boolean;
  industryId?: string;
};

type ScopeLevel = 'galaxy' | 'cluster' | 'company';
type ClusterFilter = 'all' | 'competitors' | 'allies';
type GalaxyViewMode = 'relational' | 'carousel';

const ScopeCtx = createContext<React.RefObject<ScopeState>>(null!);
function useScope() { return useContext(ScopeCtx); }

function smoothstep(e0: number, e1: number, x: number): number {
  const t = Math.max(0, Math.min(1, (x - e0) / (e1 - e0)));
  return t * t * (3 - 2 * t);
}

/* ------------------------------------------------------------------ */
/*  Layout — derived from DB                                           */
/* ------------------------------------------------------------------ */

/* Layout constants — all derived from DB (src/db/index.ts) */
const {
  CLUSTER_CENTER,
  BUBBLE_RADIUS,
  INDUSTRY_CLR,
  POS3D,
  COMPANY_INDUSTRY,
} = GRAPH_LAYOUT;
/* EMERGE_PARENT imported from src/data/twinGraph.ts */

/* ------------------------------------------------------------------ */
/*  Company View — flat 2D layout                                      */
/* ------------------------------------------------------------------ */

function computeFlatLayout(
  companyId: string,
  companyPos: [number, number, number],
  ep: Record<string, string> = EMERGE_PARENT,
): Record<string, [number, number, number]> {
  const children = Object.entries(ep)
    .filter(([_, parent]) => parent === companyId)
    .map(([id]) => id);

  const depts = children.filter(id => id.startsWith('dept-'));
  const feats = children.filter(id => id.startsWith('feat-'));

  const result: Record<string, [number, number, number]> = {};
  const [cx, cy, cz] = companyPos;

  // Departments in inner ring (radius 10)
  const deptR = 10;
  depts.forEach((id, i) => {
    const angle = (i / depts.length) * Math.PI * 2 - Math.PI / 2;
    result[id] = [
      cx + Math.cos(angle) * deptR,
      cy,
      cz + Math.sin(angle) * deptR,
    ];
  });

  // Features in outer ring (radius 18)
  const featR = 18;
  feats.forEach((id, i) => {
    const angle = (i / feats.length) * Math.PI * 2 - Math.PI / 4;
    result[id] = [
      cx + Math.cos(angle) * featR,
      cy,
      cz + Math.sin(angle) * featR,
    ];
  });

  return result;
}

// Precompute flat 2D layout positions for every company that has children
const FLAT_POS: Record<string, [number, number, number]> = {};
for (const compId of [...new Set(Object.values(EMERGE_PARENT))]) {
  const pos = POS3D[compId];
  if (!pos) continue;
  Object.assign(FLAT_POS, computeFlatLayout(compId, pos));
}

// Precompute which children belong to each company
const COMPANY_CHILDREN: Record<string, string[]> = {};
for (const [childId, parentId] of Object.entries(EMERGE_PARENT)) {
  if (!COMPANY_CHILDREN[parentId]) COMPANY_CHILDREN[parentId] = [];
  COMPANY_CHILDREN[parentId].push(childId);
}

/* ------------------------------------------------------------------ */
/*  Company relationship map (for cluster filter)                      */
/* ------------------------------------------------------------------ */

const COMPANY_RELATION: Record<string, 'you' | 'competitor' | 'ally'> = {
  'comp-you':    'you',
  'comp-rival1': 'competitor',
  'comp-rival2': 'competitor',
  'comp-rival3': 'competitor',
  'comp-saas4':  'competitor',
  'comp-saas5':  'ally',
  'comp-saas6':  'ally',
  'comp-saas7':  'ally',
};

function passesClusterFilter(companyId: string, filter: ClusterFilter): boolean {
  if (filter === 'all') return true;
  const rel = COMPANY_RELATION[companyId];
  if (!rel) return true;          // companies not in map (other clusters) always pass
  if (rel === 'you') return true; // your company always visible
  if (filter === 'competitors') return rel === 'competitor';
  if (filter === 'allies') return rel === 'ally';
  return true;
}

const SCALE: Record<string, number> = {
  industry: 3.0, company: 1.6, department: 0.9, signal: 1.2, kpi: 0.5, feature: 1.1,
};
const COLORS: Record<string, string> = {
  industry: '#0ea5e9', company: '#38bdf8', department: '#2dd4bf',
  you: '#F9C6FF', 'sig-ok': '#34d399', 'sig-warn': '#fbbf24',
  kpi: '#f472b6', feature: '#64748b',
};

function nodeColor(n: TwinNode, myCompanyId?: string | null): string {
  if (n.id === 'comp-you' || (myCompanyId && n.id === myCompanyId)) return COLORS.you;
  if (n.type === 'signal') return n.status === 'warning' ? COLORS['sig-warn'] : COLORS['sig-ok'];
  if (n.type === 'kpi') return n.status === 'warning' ? '#fbbf24' : COLORS.kpi;
  if (n.type === 'feature') return COLORS.feature;
  return COLORS[n.type] ?? '#6b7280';
}

/* ------------------------------------------------------------------ */
/*  Scope result — per-node visibility                                 */
/* ------------------------------------------------------------------ */

interface ScopeResult {
  opacity: number;
  scaleMult: number;
  emergeFactor: number;
  revealFactor: number;
}

function getNodeScope(
  camToNode: number, nodeType: string, nodeId: string, st: ScopeState,
  myCompanyId?: string | null,
  industryOf?: (id: string) => string | undefined,
  parentOf?: (id: string) => string | undefined,
): ScopeResult {
  const ZERO: ScopeResult = { opacity: 0, scaleMult: 0, emergeFactor: 0, revealFactor: 0 };
  const { focusedCluster: fCl, clusterFocus: clF,
          focusedCompany: fc, companyFocus: cf } = st;
  const inCluster = fCl !== null && clF > 0.15;
  const inCompany = fc !== null && cf > 0.15;

  switch (nodeType) {

    case 'industry': {
      if (inCluster) {
        if (nodeId === fCl) return { opacity: Math.max(0, 1 - clF * 2), scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
        return { opacity: Math.max(0, 1 - clF * 4), scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
      }
      return { opacity: 1, scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
    }

    case 'company': {
      const belongsToCluster = (industryOf ? industryOf(nodeId) : COMPANY_INDUSTRY[nodeId]) === fCl;

      if (inCompany) {
        if (nodeId === fc) {
          // Focused company: stay visible as center of flat layout
          return { opacity: 1, scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
        }
        return { opacity: Math.max(0, 1 - cf * 4), scaleMult: Math.max(0, 1 - cf * 4), emergeFactor: 1, revealFactor: 0 };
      }

      if (inCluster) {
        if (!belongsToCluster) return ZERO;
        if (!passesClusterFilter(nodeId, st.clusterFilter)) return ZERO;
        const isYou = nodeId === 'comp-you' || (!!myCompanyId && nodeId === myCompanyId);
        return {
          opacity: clF,
          scaleMult: clF,
          emergeFactor: 1,
          revealFactor: isYou ? 1 : clF,
        };
      }

      if (nodeId === 'comp-you' || (myCompanyId && nodeId === myCompanyId)) {
        return { opacity: 1.0, scaleMult: 1.0, emergeFactor: 1, revealFactor: 1 };
      }
      return ZERO;
    }

    case 'department':
    case 'feature': {
      const myParent = parentOf ? parentOf(nodeId) : EMERGE_PARENT[nodeId];
      if (!inCompany || myParent !== fc) return ZERO;
      const emerge = smoothstep(0.1, 0.5, cf);
      return { opacity: emerge, scaleMult: Math.max(0.3, emerge), emergeFactor: emerge, revealFactor: 1 };
    }

    case 'kpi':
      return ZERO;

    case 'signal': {
      if (inCompany) return ZERO;
      if (inCluster) return { opacity: Math.max(0, 1 - clF * 2.5), scaleMult: Math.max(0.3, 1 - clF), emergeFactor: 1, revealFactor: 1 };
      return { opacity: smoothstep(30, 60, camToNode), scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
    }

    default:
      return { opacity: 1, scaleMult: 1, emergeFactor: 1, revealFactor: 1 };
  }
}

/* companyVecs built dynamically in Scene to include live companies */

const CLUSTER_VECS = Object.entries(CLUSTER_CENTER)
  .map(([id, pos]) => ({ id, vec: new THREE.Vector3(...pos) }));

/* shared temp objects */
const _v3 = new THREE.Vector3();
const _c1 = new THREE.Color();
const _c2 = new THREE.Color();


/* ------------------------------------------------------------------ */
/*  CameraWatcher — drives scope state each frame                      */
/* ------------------------------------------------------------------ */

// Imperative camera API — drives navigation between levels
interface CameraHandle {
  enterIndustry(id: string, center: [number,number,number]): void;
  exitToGalaxy(): void;
  enterCompany(id: string, pos: [number,number,number], opts?: EnterCompanyOptions): void;
  exitToCluster(): void;
}

function applyCompanyOrbitControls(
  controls: any,
  camera: THREE.Camera,
  companyCenter: THREE.Vector3,
) {
  const camPos = companyCenter.clone().add(new THREE.Vector3(0, 18, 15));
  camera.position.copy(camPos);
  controls.target.copy(companyCenter);
  controls.update();
  controls.enabled = true;
  controls.enableZoom = false;
  controls.minDistance = 6;
  controls.maxDistance = 32;
  controls.autoRotate = false;
}

function CameraWatcher({
  scopeRef, onScopeChange, controlsRef, cameraHandleRef,
  onIndustryEnter, onEnterCompany, onExitCompany,
}: {
  scopeRef: React.RefObject<ScopeState>;
  onScopeChange: (s: ScopeLevel) => void;
  controlsRef: React.RefObject<any>;
  cameraHandleRef: React.MutableRefObject<CameraHandle | null>;
  onIndustryEnter?: (id: string) => void;
  onEnterCompany?: (id: string) => void;
  onExitCompany?: () => void;
}) {
  const { camera } = useThree();
  const lastLevel = useRef<ScopeLevel>('galaxy');

  /* Lerp targets — camera smoothly moves toward these each frame */
  const targetPos    = useRef(new THREE.Vector3(0, 20, 120));
  const targetTarget = useRef(new THREE.Vector3(0,  0,   0));

  /* Smooth 0-1 targets for node visibility transitions */
  const targetClF = useRef(0);   // cluster focus target
  const targetCpF = useRef(0);   // company focus target

  /* ── Events from UI outside Canvas (carousel, back buttons) ── */
  useEffect(() => {
    const onEnterInd = (e: Event) => {
      const { id, center } = (e as CustomEvent).detail;
      cameraHandleRef.current?.enterIndustry(id, center);
    };
    const onExitGal = () => cameraHandleRef.current?.exitToGalaxy();
    const onExitCl  = () => cameraHandleRef.current?.exitToCluster();
    window.addEventListener('founderos:enterIndustry', onEnterInd);
    window.addEventListener('founderos:exitToGalaxy',  onExitGal);
    window.addEventListener('founderos:exitToCluster', onExitCl);
    return () => {
      window.removeEventListener('founderos:enterIndustry', onEnterInd);
      window.removeEventListener('founderos:exitToGalaxy',  onExitGal);
      window.removeEventListener('founderos:exitToCluster', onExitCl);
    };
  }, []);

  /* ── Imperative camera API ── */
  useEffect(() => {
    cameraHandleRef.current = {
      enterIndustry(id, center) {
        const controls = controlsRef.current;
        const p = new THREE.Vector3(...center);
        targetTarget.current.copy(p);
        targetPos.current.copy(p).add(new THREE.Vector3(0, 10, 28));
        targetClF.current = 1; targetCpF.current = 0;
        const s = scopeRef.current!;
        s.level = 'cluster'; s.focusedCluster = id;
        if (controls) { controls.enabled = false; controls.autoRotate = false; controls.enableZoom = false; }
        onIndustryEnter?.(id);
      },
      exitToGalaxy() {
        const controls = controlsRef.current;
        targetTarget.current.set(0, 0, 0);
        targetPos.current.set(0, 20, 120);
        targetClF.current = 0; targetCpF.current = 0;
        const s = scopeRef.current!;
        s.level = 'galaxy';
        // focusedCluster/Company cleared lazily in useFrame once focus reaches 0
        if (controls) { controls.enabled = false; controls.autoRotate = false; controls.enableZoom = true; }
        onExitCompany?.();
      },
      enterCompany(id, pos, opts) {
        const controls = controlsRef.current;
        const p = new THREE.Vector3(...pos);
        targetTarget.current.copy(p);
        targetPos.current.copy(p).add(new THREE.Vector3(0, 18, 15));
        targetClF.current = 1;
        targetCpF.current = 1;
        const s = scopeRef.current!;
        s.level = 'company';
        s.focusedCompany = id;
        if (opts?.industryId && !s.focusedCluster) {
          s.focusedCluster = opts.industryId;
        }
        if (opts?.instant) {
          s.clusterFocus = 1;
          s.companyFocus = 1;
          s.instantCompanyEnter = true;
          if (controls) applyCompanyOrbitControls(controls, camera, p);
        } else if (controls) {
          controls.enabled = false;
        }
        onEnterCompany?.(id);
      },
      exitToCluster() {
        const controls = controlsRef.current;
        const s = scopeRef.current!;
        const cp = CLUSTER_VECS.find(c => c.id === s.focusedCluster)?.vec ?? new THREE.Vector3();
        targetTarget.current.copy(cp);
        targetPos.current.copy(cp).add(new THREE.Vector3(0, 10, 28));
        targetClF.current = 1; targetCpF.current = 0;
        s.level = 'cluster';
        // focusedCompany cleared lazily
        if (controls) controls.enabled = false;
        onExitCompany?.();
      },
    };
  });

  useFrame(() => {
    if (!scopeRef.current) return;
    const controls = controlsRef.current;
    const s = scopeRef.current;

    s.cameraPos.copy(camera.position);
    s.distance = camera.position.length();

    /* Smooth visual focus transitions (always running) */
    s.clusterFocus = THREE.MathUtils.lerp(s.clusterFocus, targetClF.current, 0.06);
    s.companyFocus = THREE.MathUtils.lerp(s.companyFocus, targetCpF.current, 0.06);

    /* Lazy cleanup — clear focused IDs once fully faded out */
    if (s.level === 'galaxy' && s.clusterFocus < 0.03) {
      s.focusedCluster = null; s.focusedCompany = null;
    }
    if (s.level === 'cluster' && s.companyFocus < 0.03) {
      s.focusedCompany = null;
    }

    /* Camera lerp — only while controls are disabled (transitioning) */
    if (controls && !controls.enabled) {
      camera.position.lerp(targetPos.current, 0.065);
      controls.target.lerp(targetTarget.current, 0.065);
      controls.update();

      const arrived = camera.position.distanceTo(targetPos.current)   < 0.8
                   && controls.target.distanceTo(targetTarget.current) < 0.5;
      if (arrived) {
        camera.position.copy(targetPos.current);
        controls.target.copy(targetTarget.current);
        controls.update();
        controls.enabled = true;
        if (s.level === 'galaxy') {
          controls.enableZoom = true;
          controls.minDistance = 60; controls.maxDistance = 260;
          controls.autoRotate = true; controls.autoRotateSpeed = 0.08;
        } else if (s.level === 'cluster') {
          controls.enableZoom = false;  // scroll disabled — click to enter company
          controls.autoRotate = false;
        } else if (s.level === 'company') {
          controls.enableZoom = false;
          controls.minDistance = 6; controls.maxDistance = 32;
          controls.autoRotate = false;
        }
      }
    }

    if (s.instantCompanyEnter) {
      s.instantCompanyEnter = false;
    }

    /* Level change notification */
    if (s.level !== lastLevel.current) {
      lastLevel.current = s.level;
      onScopeChange(s.level);
    }
  });

  return null;
}

/* ------------------------------------------------------------------ */
/*  IndustryBubble — large transparent sphere per cluster               */
/* ------------------------------------------------------------------ */

function IndustryBubble({
  node, position, radius, onClick,
}: {
  node: TwinNode; position: [number, number, number]; radius: number;
  onClick?: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const bubbleMeshRef = useRef<THREE.Mesh>(null);
  const solidMatRef = useRef<THREE.MeshStandardMaterial>(null);
  const wireMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const scopeRef = useScope();
  const color = INDUSTRY_CLR[node.id] || '#0ea5e9';

  useFrame((state) => {
    if (!groupRef.current || !solidMatRef.current || !wireMatRef.current) return;
    const t = state.clock.elapsedTime;
    const s = scopeRef.current;
    if (!s?.cameraPos) return;

    const clF = s.clusterFocus;
    const isFocusedCluster = s.focusedCluster === node.id;

    // Disable raycasting on bubble when inside cluster/company view so
    // company nodes behind the bubble can receive click events
    if (bubbleMeshRef.current) {
      if (clF > 0.3) {
        (bubbleMeshRef.current as any).raycast = () => {};
      } else {
        (bubbleMeshRef.current as any).raycast = (THREE.Mesh as any).prototype.raycast;
      }
    }

    let alpha: number;
    if (s.companyFocus > 0.1) {
      alpha = Math.max(0, 1 - s.companyFocus * 4);
    } else if (clF > 0.1) {
      alpha = isFocusedCluster ? Math.max(0, 1 - clF * 1.8) : Math.max(0, 1 - clF * 4);
    } else {
      alpha = 1;
    }

    solidMatRef.current.opacity = alpha * 0.07;
    wireMatRef.current.opacity = alpha * 0.1;
    groupRef.current.visible = alpha > 0.008;

    groupRef.current.rotation.y = t * 0.018;
    groupRef.current.rotation.x = Math.sin(t * 0.012) * 0.06;
    const pulse = 1 + Math.sin(t * 0.25 + position[0] * 0.08) * 0.015;
    groupRef.current.scale.setScalar(pulse);

    if (labelRef.current) labelRef.current.style.opacity = String(alpha);
  });

  return (
    <group ref={groupRef} position={position}>
      <mesh ref={bubbleMeshRef} onClick={(e) => { e.stopPropagation(); onClick?.(); }}>
        <icosahedronGeometry args={[radius, 2]} />
        <meshStandardMaterial
          ref={solidMatRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.08}
          transparent
          opacity={0.07}
          depthWrite={false}
          side={THREE.DoubleSide}
        />
      </mesh>
      <mesh>
        <icosahedronGeometry args={[radius * 1.01, 1]} />
        <meshBasicMaterial
          ref={wireMatRef}
          color={color}
          wireframe
          transparent
          opacity={0.1}
          depthWrite={false}
        />
      </mesh>
      <Html center distanceFactor={80} style={{ pointerEvents: 'none', userSelect: 'none' }} zIndexRange={[10, 0]}>
        <div ref={labelRef} className="text-center whitespace-nowrap">
          <div className="text-sm font-semibold tracking-wide" style={{ color, textShadow: `0 0 12px ${color}40` }}>
            {node.label}
          </div>
          {node.description && <div className="text-[9px] text-gray-500 mt-0.5">{node.description}</div>}
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  NodeSphere — companies, departments, features                      */
/* ------------------------------------------------------------------ */

function NodeSphere({
  node, position, parentPosition, isSelected, isHovered, onClick, onPointerEnter, onPointerLeave, myCompanyId, industryOf, parentOf, flatPosOf,
}: {
  node: TwinNode;
  position: [number, number, number];
  parentPosition: [number, number, number] | null;
  isSelected: boolean;
  isHovered: boolean;
  onClick: () => void;
  onPointerEnter: () => void;
  onPointerLeave: () => void;
  myCompanyId?: string | null;
  industryOf?: (id: string) => string | undefined;
  parentOf?: (id: string) => string | undefined;
  flatPosOf?: (id: string) => [number, number, number] | undefined;
}) {
  const meshRef = useRef<THREE.Mesh>(null);
  const wireRef = useRef<THREE.Mesh>(null);
  const glowRef = useRef<THREE.Mesh>(null);
  const matRef = useRef<THREE.MeshStandardMaterial>(null);
  const wireMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const glowMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const ringMatRef = useRef<THREE.MeshBasicMaterial>(null);
  const statusRef = useRef<THREE.Mesh>(null);
  const groupRef = useRef<THREE.Group>(null);
  const labelRef = useRef<HTMLDivElement>(null);

  const baseScale = SCALE[node.type] ?? 1;
  const color = nodeColor(node, myCompanyId);
  const isYou = node.id === 'comp-you' || (!!myCompanyId && node.id === myCompanyId);
  const isCompany = node.type === 'company';
  const isFeature = node.type === 'feature';
  const isDept = node.type === 'department';
  const hasEmergence = parentPosition !== null;
  const scopeRef = useScope();

  const animOp = useRef(0);
  const animEmerge = useRef(0);
  const animReveal = useRef(isCompany ? 0 : 1);
  const animScale = useRef(0.01);

  const posVec = useMemo(() => new THREE.Vector3(...position), [position]);
  const parentVec = useMemo(
    () => parentPosition ? new THREE.Vector3(...parentPosition) : null,
    [parentPosition],
  );
  const flatPos = flatPosOf ? flatPosOf(node.id) : FLAT_POS[node.id];
  const flatVec = useMemo(
    () => flatPos ? new THREE.Vector3(...flatPos) : null,
    [flatPos],
  );

  useFrame((state) => {
    if (!meshRef.current || !matRef.current || !groupRef.current) return;
    const t = state.clock.elapsedTime;
    const s = scopeRef.current;
    if (!s?.cameraPos) return;

    const camToNode = _v3.copy(s.cameraPos).distanceTo(posVec);
    const scope = getNodeScope(camToNode, node.type, node.id, s, myCompanyId, industryOf, parentOf);

    /* smooth animated values */
    animOp.current = THREE.MathUtils.lerp(animOp.current, scope.opacity, 0.25);
    animEmerge.current = THREE.MathUtils.lerp(animEmerge.current, scope.emergeFactor, 0.18);
    if (isCompany) {
      animReveal.current = THREE.MathUtils.lerp(animReveal.current, scope.revealFactor, 0.18);
    }

    const myParentId = parentOf ? parentOf(node.id) : EMERGE_PARENT[node.id];
    const snapLayout = !!s.instantCompanyEnter
      && s.level === 'company'
      && s.focusedCompany !== null
      && myParentId === s.focusedCompany;

    const companyViewBoost = (isDept || isFeature) && s.companyFocus > 0.3
      ? THREE.MathUtils.lerp(1, 1.5, smoothstep(0.3, 0.8, s.companyFocus))
      : 1;
    const interactMult = isSelected ? 1.35 : isHovered ? 1.18 : 1;

    if (snapLayout) {
      animOp.current = scope.opacity;
      animEmerge.current = scope.emergeFactor;
      if (isCompany) animReveal.current = scope.revealFactor;
      animScale.current = Math.max(
        0.01,
        baseScale * scope.scaleMult * interactMult * companyViewBoost,
      );
    }

    const op = animOp.current;
    const emerge = animEmerge.current;
    const reveal = animReveal.current;

    const isVisible = op > 0.01;
    groupRef.current.visible = isVisible;
    if (!isVisible) {
      if (labelRef.current) labelRef.current.style.opacity = '0';
      return;
    }

    /* emergence animation: parent → 3D pos → flat 2D pos */
    if (hasEmergence && parentVec) {
      groupRef.current.position.lerpVectors(parentVec, posVec, emerge);
    } else {
      groupRef.current.position.set(...position);
    }

    /* flat 2D layout transition in company view */
    if (flatVec && s.focusedCompany && myParentId === s.focusedCompany) {
      if (snapLayout || s.companyFocus > 0.95) {
        groupRef.current.position.copy(flatVec);
      } else if (s.companyFocus > 0.2) {
        const flatT = smoothstep(0.2, 0.7, s.companyFocus);
        groupRef.current.position.lerp(flatVec, flatT);
      }
    }

    /* material */
    matRef.current.transparent = true;
    matRef.current.opacity = op;
    matRef.current.depthWrite = op > 0.5;

    /* company: dark-to-coloured transition */
    if (isCompany && !isYou) {
      _c1.set(0x12121f);
      _c2.set(color);
      matRef.current.color.copy(_c1).lerp(_c2, reveal);
      matRef.current.emissive.copy(_c1).lerp(_c2, reveal * 0.4);
      matRef.current.emissiveIntensity = THREE.MathUtils.lerp(0.02, 0.3, reveal);
      matRef.current.metalness = THREE.MathUtils.lerp(0.9, 0.6, reveal);
      matRef.current.roughness = THREE.MathUtils.lerp(0.6, 0.25, reveal);
    } else if (isYou) {
      matRef.current.emissiveIntensity = 0.4;
      matRef.current.metalness = 0.5;
      matRef.current.roughness = 0.2;
    } else {
      matRef.current.emissiveIntensity = (isSelected ? 1.0 : isHovered ? 0.55 : 0.25) * op;
    }

    /* company wireframe — only in cluster view (not in flat company view) */
    if (isCompany && wireRef.current && wireMatRef.current) {
      const isFocused = s.focusedCompany === node.id;
      if (isFocused && s.companyFocus < 0.5) {
        const dissolve = 1 - smoothstep(10, 22, camToNode);
        wireRef.current.visible = dissolve > 0.05;
        wireMatRef.current.opacity = dissolve * 0.4;
        wireRef.current.scale.setScalar(meshRef.current.scale.x * 1.02);
      } else {
        wireRef.current.visible = false;
      }
    }

    /* floating (reduced in company view for stability) */
    const floatAmp = s.companyFocus > 0.5 && (isDept || isFeature) ? 0.05 : 0.2;
    meshRef.current.position.y = Math.sin(t * 0.5 + position[0] * 0.3) * floatAmp;

    /* feature rotation */
    if (isFeature) {
      meshRef.current.rotation.y = t * 0.3;
      meshRef.current.rotation.x = t * 0.15;
    }

    /* scale — departments and features scale up in company view */
    const targetScale = baseScale * scope.scaleMult * interactMult * companyViewBoost;
    animScale.current = THREE.MathUtils.lerp(animScale.current, Math.max(0.01, targetScale), 0.18);
    meshRef.current.scale.setScalar(animScale.current);

    if (isYou) meshRef.current.rotation.y = t * 0.15;

    /* glow */
    if (glowRef.current && glowMatRef.current) {
      const gs = animScale.current * (1.7 + Math.sin(t * 1.5) * 0.12);
      glowRef.current.scale.setScalar(gs);
      glowMatRef.current.opacity = (isSelected ? 0.14 : isHovered ? 0.09 : isYou ? 0.06 : 0.03) * op;
    }

    if (ringMatRef.current) ringMatRef.current.opacity = isYou ? Math.max(0.12, 0.25 * op * reveal) : 0.25 * op * reveal;
    if (statusRef.current) statusRef.current.visible = op > 0.3 && reveal > 0.5;

    /* label */
    if (labelRef.current) {
      const labelOp = isYou
        ? op
        : isCompany
          ? Math.max(0, reveal - 0.3) * 1.5 * op
          : op;
      labelRef.current.style.opacity = String(Math.max(0, labelOp - 0.05));
    }
  });

  return (
    <group ref={groupRef} position={position}>
      {/* glow */}
      <mesh ref={glowRef}>
        <sphereGeometry args={[1, 16, 16]} />
        <meshBasicMaterial ref={glowMatRef} color={color} transparent opacity={0.03} depthWrite={false} />
      </mesh>

      {/* core shape */}
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        onPointerEnter={(e) => { e.stopPropagation(); onPointerEnter(); }}
        onPointerLeave={(e) => { e.stopPropagation(); onPointerLeave(); }}
      >
        {isFeature
          ? <boxGeometry args={[1.4, 1.4, 1.4]} />
          : <sphereGeometry args={[1, 32, 32]} />
        }
        <meshStandardMaterial
          ref={matRef}
          color={color}
          emissive={color}
          emissiveIntensity={0.25}
          roughness={isFeature ? 0.15 : 0.25}
          metalness={isFeature ? 0.8 : 0.6}
          transparent
        />
      </mesh>

      {/* wireframe overlay for company dissolution */}
      {isCompany && (
        <mesh ref={wireRef} visible={false}>
          <sphereGeometry args={[1, 16, 16]} />
          <meshBasicMaterial
            ref={wireMatRef}
            color={color}
            wireframe
            transparent
            opacity={0}
            depthWrite={false}
          />
        </mesh>
      )}

      {/* ring for your company */}
      {isYou && (
        <mesh rotation={[Math.PI / 2, 0, 0]}>
          <ringGeometry args={[baseScale * 1.6, baseScale * 1.75, 64]} />
          <meshBasicMaterial ref={ringMatRef} color="#F9C6FF" transparent opacity={0.5} side={THREE.DoubleSide} />
        </mesh>
      )}

      {/* status dot */}
      {node.status && node.type !== 'signal' && node.type !== 'feature' && (
        <mesh ref={statusRef} position={[baseScale * 0.65, baseScale * 0.65, baseScale * 0.4]}>
          <sphereGeometry args={[0.18, 12, 12]} />
          <meshBasicMaterial
            color={node.status === 'healthy' ? '#10b981' : node.status === 'warning' ? '#f59e0b' : '#ef4444'}
          />
        </mesh>
      )}

      {/* label */}
      <Html
        center
        distanceFactor={48}
        style={{ pointerEvents: 'none', userSelect: 'none' }}
        zIndexRange={[10, 0]}
      >
        <div
          ref={labelRef}
          className="whitespace-nowrap text-center"
          style={{
            transform: 'translateY(22px)',
            transition: 'opacity 0.15s',
            pointerEvents: isFeature ? 'auto' : 'none',
            cursor: isFeature ? 'pointer' : 'default',
          }}
          onClick={isFeature ? (e) => { e.stopPropagation(); onClick(); } : undefined}
        >
          <span
            className={`px-1.5 py-0.5 rounded ${
              isFeature
                ? 'text-[10px] text-sky-300 bg-sky-950/70 border border-sky-500/20'
                : isDept
                  ? 'text-[10px] text-teal-300 bg-teal-950/70 border border-teal-500/20'
                  : node.type === 'kpi'
                    ? 'text-[9px] text-pink-300 bg-pink-950/50'
                    : isSelected || isHovered
                      ? 'text-[11px] text-white bg-white/10'
                      : 'text-[11px] text-gray-500'
            }`}
            style={isYou ? { color: '#F9C6FF', background: 'rgba(249,198,255,0.12)', outline: '1px solid rgba(249,198,255,0.4)' } : undefined}
          >
            {isFeature
              ? node.label
              : isYou
                ? <>{'★ '}{node.label}</>
                : node.label}
          </span>
          {isFeature && node.description && (
            <div className="text-[8px] text-gray-500 mt-0.5">{node.description}</div>
          )}
        </div>
      </Html>
    </group>
  );
}

/* ------------------------------------------------------------------ */
/*  ScopedEdgeLine                                                     */
/* ------------------------------------------------------------------ */

function ScopedEdgeLine({
  fromId, toId, fromPos, toPos, isActive, isCompetitor, isSignal, isKpi, isFeatureEdge, strength,
  fromType, toType,
}: {
  fromId: string; toId: string;
  fromPos: [number, number, number]; toPos: [number, number, number];
  isActive: boolean; isCompetitor: boolean; isSignal: boolean;
  isKpi: boolean; isFeatureEdge: boolean;
  strength: number; fromType: string; toType: string;
}) {
  const lineRef = useRef<any>(null);
  const scopeRef = useScope();
  const fromVec = useMemo(() => new THREE.Vector3(...fromPos), [fromPos]);
  const toVec = useMemo(() => new THREE.Vector3(...toPos), [toPos]);

  useFrame(() => {
    if (!lineRef.current) return;
    const s = scopeRef.current;
    if (!s?.cameraPos) return;

    const camToFrom = s.cameraPos.distanceTo(fromVec);
    const camToTo = s.cameraPos.distanceTo(toVec);
    const fromScope = getNodeScope(camToFrom, fromType, fromId, s);
    const toScope = getNodeScope(camToTo, toType, toId, s);
    let edgeOp = Math.min(fromScope.opacity, toScope.opacity);

    /* Hide edges whose endpoints are internal to the focused company —
       the CompanyViewLinks component renders correct flat-layout connections */
    if (s.focusedCompany && s.companyFocus > 0.3) {
      const fromInternal = fromId === s.focusedCompany || EMERGE_PARENT[fromId] === s.focusedCompany;
      const toInternal = toId === s.focusedCompany || EMERGE_PARENT[toId] === s.focusedCompany;
      if (fromInternal && toInternal) {
        edgeOp *= Math.max(0, 1 - smoothstep(0.3, 0.6, s.companyFocus));
      }
    }

    const mat = lineRef.current.material as any;
    const baseOp = isActive ? 0.55 : strength * 0.18;
    mat.opacity = baseOp * edgeOp;
    lineRef.current.visible = edgeOp > 0.02;
  });

  const color = isFeatureEdge ? '#64748b' : isKpi ? '#f472b6' : isCompetitor ? '#ef4444' : isSignal ? '#f59e0b' : '#0ea5e9';

  return (
    <Line
      ref={lineRef as never}
      points={[fromPos, toPos]}
      color={color}
      lineWidth={isFeatureEdge ? 0.8 : isKpi ? 0.5 : isActive ? 2.5 : 0.7}
      transparent
      opacity={isActive ? 0.55 : strength * 0.18}
      dashed={isCompetitor || isSignal || isFeatureEdge}
      dashSize={isFeatureEdge ? 0.4 : isCompetitor ? 0.5 : 0.8}
      gapSize={0.3}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  CompanyViewLink — connecting line for flat 2D layout                */
/* ------------------------------------------------------------------ */

function CompanyViewLink({
  from, to, companyId, color, lineWidth, dashed,
}: {
  from: [number, number, number];
  to: [number, number, number];
  companyId: string;
  color: string;
  lineWidth: number;
  dashed?: boolean;
}) {
  const lineRef = useRef<any>(null);
  const scopeRef = useScope();

  useFrame(() => {
    if (!lineRef.current) return;
    const s = scopeRef.current;
    if (!s) return;
    const visible = s.focusedCompany === companyId && s.companyFocus > 0.3;
    lineRef.current.visible = visible;
    if (visible && lineRef.current.material) {
      const linkFade = s.companyFocus > 0.95 ? 1 : smoothstep(0.4, 0.8, s.companyFocus);
      lineRef.current.material.opacity = linkFade * 0.5;
    }
  });

  return (
    <Line
      ref={lineRef as never}
      points={[from, to]}
      color={color}
      lineWidth={lineWidth}
      transparent
      opacity={0}
      dashed={dashed}
      dashSize={0.4}
      gapSize={0.25}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  CompanyViewLinks — all connections for the flat company view        */
/* ------------------------------------------------------------------ */

function CompanyViewLinks({
  posMap, ep,
}: {
  posMap: Record<string, [number, number, number]>;
  ep: Record<string, string>;
}) {
  // Build COMPANY_CHILDREN dynamically from emergeParent map
  const companyChildren = useMemo(() => {
    const map: Record<string, string[]> = {};
    for (const [childId, parentId] of Object.entries(ep)) {
      if (!map[parentId]) map[parentId] = [];
      map[parentId].push(childId);
    }
    return map;
  }, [ep]);

  // Build flat layout positions for all companies with children
  const flatPos = useMemo(() => {
    const result: Record<string, [number, number, number]> = {};
    for (const compId of Object.keys(companyChildren)) {
      const pos = posMap[compId];
      if (!pos) continue;
      Object.assign(result, computeFlatLayout(compId, pos, ep));
    }
    return result;
  }, [companyChildren, posMap, ep]);

  const links = useMemo(() => {
    const result: Array<{
      key: string;
      from: [number, number, number];
      to: [number, number, number];
      companyId: string;
      color: string;
      lineWidth: number;
      dashed?: boolean;
    }> = [];

    for (const compId of Object.keys(companyChildren)) {
      const compPos = posMap[compId];
      if (!compPos) continue;
      for (const childId of companyChildren[compId]) {
        const fp = flatPos[childId];
        if (!fp) continue;
        const isDept = childId.startsWith('dept-');
        const isFeat = childId.startsWith('feat-');
        if (!isDept && !isFeat) continue;
        result.push({
          key: `cv-${compId}-${childId}`,
          from: compPos, to: fp, companyId: compId,
          color: isDept ? '#2dd4bf' : '#64748b',
          lineWidth: isDept ? 1.5 : 1,
          dashed: isFeat,
        });
      }
    }
    return result;
  }, [companyChildren, posMap, flatPos]);

  return (
    <>
      {links.map(({ key, ...rest }) => <CompanyViewLink key={key} {...rest} />)}
    </>
  );
}

/* ------------------------------------------------------------------ */
/* ------------------------------------------------------------------ */
/*  Scene                                                              */
/* ------------------------------------------------------------------ */

function Scene({
  nodes, edges, selectedNode, hoveredNode, onSelect, onHover, onScopeChange, onNavigate,
  clusterFilter, myCompanyId, emergeParentMap,
  onIndustryEnter, onEnterCompany, onExitCompany,
}: Graph3DProps & {
  onScopeChange: (s: ScopeLevel) => void;
  clusterFilter: ClusterFilter;
  onIndustryEnter?: (id: string) => void;
  onEnterCompany?: (id: string) => void;
  onExitCompany?: () => void;
}) {
  const EP = emergeParentMap ?? EMERGE_PARENT;
  const scopeRef = useRef<ScopeState>({
    level: 'galaxy',
    distance: 120,
    cameraPos: new THREE.Vector3(0, 20, 120),
    focusedCluster: null,
    clusterFocus: 0,
    focusedCompany: null,
    companyFocus: 0,
    clusterFilter: 'all',
  });
  // Sync filter from React state into the scope ref (read by useFrame callbacks)
  scopeRef.current.clusterFilter = clusterFilter;
  const controlsRef = useRef<any>(null);
  const cameraHandleRef = useRef<CameraHandle | null>(null);

  const industryNodes = useMemo(() => nodes.filter(n => n.type === 'industry'), [nodes]);
  const otherNodes = useMemo(() => nodes.filter(n => n.type !== 'industry' && n.type !== 'kpi'), [nodes]);

  // Merge static POS3D with live company positions from node._pos3D
  const mergedPos = useMemo(() => {
    const result: Record<string, [number, number, number]> = { ...POS3D };
    // Add live company positions
    for (const n of nodes) {
      if (!POS3D[n.id] && n._pos3D) {
        result[n.id] = [n._pos3D.x, n._pos3D.y, n._pos3D.z];
      }
    }
    // Shift internal nodes (dept/feat/kpi) to follow the live company position.
    // POS3D has them near comp-you (SaaS cluster origin). If the live company
    // is elsewhere, we offset them by (livePos - compYouPos).
    if (myCompanyId && result[myCompanyId] && POS3D['comp-you']) {
      const [lx, ly, lz] = result[myCompanyId];
      const [cx, cy, cz] = POS3D['comp-you'];
      for (const [childId, parentId] of Object.entries(EP)) {
        if (parentId !== myCompanyId) continue;
        const p = POS3D[childId];
        if (!p) continue;
        result[childId] = [p[0] + lx - cx, p[1] + ly - cy, p[2] + lz - cz];
      }
    }
    return result;
  }, [nodes, myCompanyId, EP]);

  // Flat layout positions for company view — recomputed dynamically from live positions
  const flatPosMap = useMemo(() => {
    const result: Record<string, [number, number, number]> = {};
    const seen = new Set<string>();
    for (const parentId of Object.values(EP)) {
      if (seen.has(parentId)) continue;
      seen.add(parentId);
      const pos = mergedPos[parentId];
      if (pos) Object.assign(result, computeFlatLayout(parentId, pos, EP));
    }
    return result;
  }, [EP, mergedPos]);

  // Merge static COMPANY_INDUSTRY with live company industry IDs
  const mergedIndustry = useMemo(() => {
    const extra: Record<string, string> = {};
    for (const n of nodes) {
      if (!COMPANY_INDUSTRY[n.id] && n._industryId) {
        extra[n.id] = n._industryId;
      }
    }
    return Object.keys(extra).length > 0 ? { ...COMPANY_INDUSTRY, ...extra } : COMPANY_INDUSTRY;
  }, [nodes]);

  const processed = useMemo(() => {
    return edges
      .map((e) => {
        const fn = nodes.find((n) => n.id === e.from);
        const tn = nodes.find((n) => n.id === e.to);
        if (!fn || !tn || !mergedPos[e.from] || !mergedPos[e.to]) return null;
        if (fn.type === 'kpi' || tn.type === 'kpi') return null;
        return {
          fromId: e.from, toId: e.to,
          fromPos: mergedPos[e.from], toPos: mergedPos[e.to],
          fromType: fn.type, toType: tn.type,
          isActive: selectedNode === e.from || selectedNode === e.to ||
                    hoveredNode === e.from || hoveredNode === e.to,
          isCompetitor: !!e.label?.includes('competitor'),
          isSignal: e.from.startsWith('sig-'),
          isKpi: false,
          isFeatureEdge: fn.type === 'feature' || tn.type === 'feature',
          strength: e.strength,
        };
      })
      .filter(Boolean) as Array<{
        fromId: string; toId: string;
        fromPos: [number, number, number]; toPos: [number, number, number];
        fromType: string; toType: string;
        isActive: boolean; isCompetitor: boolean; isSignal: boolean;
        isKpi: boolean; isFeatureEdge: boolean; strength: number;
      }>;
  }, [edges, nodes, selectedNode, hoveredNode]);

  const handleNodeClick = useCallback((node: TwinNode) => {
    if (node.type === 'industry') {
      const center = CLUSTER_CENTER[node.id];
      if (center) cameraHandleRef.current?.enterIndustry(node.id, center);
      return;
    }
    if (node.type === 'feature' && node.route && onNavigate) {
      onNavigate(node.route);
      return;
    }
    if (node.type === 'company') {
      const pos = mergedPos[node.id];
      if (pos && cameraHandleRef.current) {
        if (scopeRef.current?.level === 'company' && scopeRef.current?.focusedCompany === node.id) {
          cameraHandleRef.current.exitToCluster();
        } else {
          const isMyCompany = node.id === 'comp-you' || (!!myCompanyId && node.id === myCompanyId);
          cameraHandleRef.current.enterCompany(node.id, pos, {
            instant: isMyCompany,
            industryId: mergedIndustry[node.id],
          });
        }
      }
      return;
    }
    onSelect(selectedNode === node.id ? null : node.id);
  }, [selectedNode, onSelect, onNavigate, mergedPos, myCompanyId, mergedIndustry]);

  return (
    <ScopeCtx.Provider value={scopeRef}>
      <CameraWatcher
        scopeRef={scopeRef} onScopeChange={onScopeChange}
        controlsRef={controlsRef} cameraHandleRef={cameraHandleRef}
        onIndustryEnter={onIndustryEnter}
        onEnterCompany={onEnterCompany}
        onExitCompany={onExitCompany}
      />

      <ambientLight intensity={0.1} />
      <pointLight position={[40, 25, 50]} intensity={0.8} color="#0ea5e9" />
      <pointLight position={[-30, -20, 40]} intensity={0.5} color="#22d3ee" />
      <pointLight position={[0, 30, -40]} intensity={0.3} color="#ec4899" />

      <Stars radius={400} depth={150} count={8000} factor={6} saturation={0.15} fade speed={0.3} />
      <fog attach="fog" args={['#06061a', 130, 300]} />


      <OrbitControls
        ref={controlsRef}
        enableDamping
        dampingFactor={0.09}
        autoRotate
        autoRotateSpeed={0.1}
        enablePan={false}
        maxPolarAngle={Math.PI * 0.85}
        minPolarAngle={Math.PI * 0.15}
      />

      {/* industry bubbles */}
      {industryNodes.map((node) => {
        const pos = CLUSTER_CENTER[node.id];
        if (!pos) return null;
        return (
          <IndustryBubble
            key={node.id}
            node={node}
            position={pos}
            radius={BUBBLE_RADIUS[node.id] ?? 10}
            onClick={() => handleNodeClick(node)}
          />
        );
      })}

      {/* edges */}
      {processed.map((e, i) => <ScopedEdgeLine key={i} {...e} />)}

      {/* flat layout connections for company view */}
      <CompanyViewLinks posMap={mergedPos} ep={EP} />

      {/* nodes (non-industry) */}
      {otherNodes.map((node) => {
        const pos = mergedPos[node.id];
        if (!pos) return null;
        const parentId = EP[node.id];
        const parentPos = parentId ? mergedPos[parentId] ?? null : null;
        return (
          <NodeSphere
            key={node.id}
            node={node}
            position={pos}
            parentPosition={parentPos}
            isSelected={selectedNode === node.id}
            isHovered={hoveredNode === node.id}
            onClick={() => handleNodeClick(node)}
            onPointerEnter={() => onHover(node.id)}
            onPointerLeave={() => onHover(null)}
            myCompanyId={myCompanyId}
            industryOf={(id) => mergedIndustry[id]}
            parentOf={(id) => EP[id]}
            flatPosOf={(id) => flatPosMap[id]}
          />
        );
      })}
    </ScopeCtx.Provider>
  );
}

/* ------------------------------------------------------------------ */
/*  Scope HUD                                                          */
/* ------------------------------------------------------------------ */

const SCOPE_HUD: Record<ScopeLevel, { label: string; desc: string; color: string }> = {
  galaxy:  { label: 'Galaxy View',  desc: 'Industry constellations', color: '#64748b' },
  cluster: { label: 'Cluster View', desc: 'Companies & competitors', color: '#818cf8' },
  company: { label: 'Company View', desc: 'Departments & modules',   color: '#2dd4bf' },
};

/* ------------------------------------------------------------------ */
/*  Exported wrapper                                                   */
/* ------------------------------------------------------------------ */

export default function Graph3D(props: Graph3DProps) {
  const [scope, setScope] = useState<ScopeLevel>('galaxy');
  const [clusterFilter, setClusterFilter] = useState<ClusterFilter>('all');
  const [galaxyViewMode, setGalaxyViewMode] = useState<GalaxyViewMode>('relational');
  const [carouselIdx, setCarouselIdx] = useState(0);
  const [lockedCompanyId, setLockedCompanyId] = useState<string | null>(null);

  const handleScopeChange = useCallback((s: ScopeLevel) => {
    setScope(s);
    if (s === 'galaxy') {
      setClusterFilter('all');
      setGalaxyViewMode('relational');
      setCarouselIdx(0);
      setLockedCompanyId(null);
    }
    if (s === 'cluster') setLockedCompanyId(null);
  }, []);

  const hud = SCOPE_HUD[scope];

  /* Industry nodes for galaxy carousel */
  const industryNodes = useMemo(() =>
    props.nodes.filter(n => n.type === 'industry'),
  [props.nodes]);

  /* Companies-per-industry count for carousel cards */
  const companiesPerIndustry = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const n of props.nodes) {
      if (n.type !== 'company') continue;
      const ind = n._industryId ?? COMPANY_INDUSTRY[n.id];
      if (ind) counts[ind] = (counts[ind] ?? 0) + 1;
    }
    return counts;
  }, [props.nodes]);

  const carouselIndustry = industryNodes[carouselIdx] ?? null;

  /* Wheel scroll on carousel */
  const carouselRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = carouselRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      setCarouselIdx(i =>
        e.deltaY > 0 ? Math.min(industryNodes.length - 1, i + 1) : Math.max(0, i - 1)
      );
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [industryNodes.length]);

  return (
    <div className="w-full h-full overflow-hidden relative">
      <Canvas
        camera={{ position: [0, 20, 120], fov: 45 }}
        style={{ background: 'transparent' }}
        gl={{ antialias: true, alpha: true }}
      >
        <Scene
          {...props}
          onScopeChange={handleScopeChange}
          clusterFilter={clusterFilter}
          onIndustryEnter={() => { setLockedCompanyId(null); }}
          onEnterCompany={(id) => setLockedCompanyId(id)}
          onExitCompany={() => setLockedCompanyId(null)}
        />
      </Canvas>

      {/* ── Scope HUD — top left ── */}
      <div
        className="absolute top-[4.5rem] left-4 px-3 py-2 rounded-xl backdrop-blur-md"
        style={{ background: 'rgba(27,27,29,0.85)' }}
      >
        <div className="flex items-center gap-2">
          <div className="w-1.5 h-1.5 rounded-full" style={{ background: hud.color, boxShadow: `0 0 6px ${hud.color}` }} />
          <span className="text-xs font-medium" style={{ color: hud.color }}>{hud.label}</span>
        </div>
        <p className="text-[10px] mt-0.5 ml-3.5" style={{ color: '#5E5E5E' }}>{hud.desc}</p>
      </div>

      {/* ── Galaxy controls — Relational / Browse toggle ── */}
      {scope === 'galaxy' && (
        <div className="absolute top-[4.5rem] right-4 flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden p-0.5" style={{ background: '#1B1B1D' }}>
            {(['relational', 'carousel'] as GalaxyViewMode[]).map(m => (
              <button
                key={m}
                onClick={() => { setGalaxyViewMode(m); setCarouselIdx(0); }}
                className="px-3 py-1.5 rounded-lg text-[11px] font-medium transition-all duration-200"
                style={{
                  background: galaxyViewMode === m ? 'linear-gradient(135deg, #F9C6FF, #C1AEFF)' : 'transparent',
                  color: galaxyViewMode === m ? '#161618' : '#5E5E5E',
                }}
              >
                {m === 'relational' ? 'Relational' : 'Browse'}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* ── Cluster controls — filter + back ── */}
      {scope === 'cluster' && (
        <div className="absolute top-[4.5rem] right-4 flex items-center gap-2">
          <div className="flex rounded-xl overflow-hidden p-0.5" style={{ background: '#1B1B1D' }}>
            {(['all', 'competitors', 'allies'] as ClusterFilter[]).map(f => (
              <button
                key={f}
                onClick={() => setClusterFilter(f)}
                className="px-2.5 py-1.5 rounded-lg text-[11px] font-medium transition-all"
                style={{
                  background: clusterFilter === f ? 'rgba(249,198,255,0.15)' : 'transparent',
                  color: clusterFilter === f ? '#F9C6FF' : '#5E5E5E',
                }}
              >
                {f.charAt(0).toUpperCase() + f.slice(1)}
              </button>
            ))}
          </div>
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('founderos:exitToGalaxy'))}
            className="px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ background: '#1B1B1D', color: '#C1AEFF' }}
          >
            ← Galaxy
          </button>
        </div>
      )}

      {/* ── Company controls — back to cluster ── */}
      {scope === 'company' && (
        <div className="absolute top-[4.5rem] right-4 flex items-center gap-3">
          {lockedCompanyId && (
            <span className="text-xs" style={{ color: '#5E5E5E' }}>
              {props.nodes.find(n => n.id === lockedCompanyId)?.label}
            </span>
          )}
          <button
            onClick={() => window.dispatchEvent(new CustomEvent('founderos:exitToCluster'))}
            className="px-3 py-1.5 rounded-xl text-xs font-medium"
            style={{ background: '#1B1B1D', color: '#C1AEFF' }}
          >
            ← Cluster
          </button>
        </div>
      )}

      {/* ── Galaxy Browse carousel — industries ── */}
      {scope === 'galaxy' && galaxyViewMode === 'carousel' && (
        <div
          ref={carouselRef}
          className="absolute inset-0 flex items-center justify-center"
          style={{ background: 'rgba(22,22,24,0.92)', backdropFilter: 'blur(8px)' }}
        >
          <button
            onClick={() => setCarouselIdx(i => Math.max(0, i - 1))}
            disabled={carouselIdx === 0}
            className="absolute left-8 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all"
            style={{ background: carouselIdx === 0 ? 'rgba(27,27,29,0.4)' : '#1B1B1D', color: carouselIdx === 0 ? '#3a3a3e' : '#C1AEFF' }}
          >‹</button>
          <button
            onClick={() => setCarouselIdx(i => Math.min(industryNodes.length - 1, i + 1))}
            disabled={carouselIdx >= industryNodes.length - 1}
            className="absolute right-8 w-10 h-10 rounded-full flex items-center justify-center text-xl transition-all"
            style={{ background: carouselIdx >= industryNodes.length - 1 ? 'rgba(27,27,29,0.4)' : '#1B1B1D', color: carouselIdx >= industryNodes.length - 1 ? '#3a3a3e' : '#C1AEFF' }}
          >›</button>

          {carouselIndustry && (
            <div
              key={carouselIndustry.id}
              className="flex flex-col items-center gap-6 max-w-sm w-full px-8"
              style={{ animation: 'fadeSlideIn 0.3s ease' }}
            >
              {/* Industry orb */}
              <div
                className="w-28 h-28 rounded-full flex items-center justify-center text-4xl font-bold"
                style={{
                  background: `${INDUSTRY_CLR[carouselIndustry.id] ?? '#0ea5e9'}22`,
                  color: INDUSTRY_CLR[carouselIndustry.id] ?? '#0ea5e9',
                  boxShadow: `0 0 50px ${INDUSTRY_CLR[carouselIndustry.id] ?? '#0ea5e9'}40`,
                  border: `1px solid ${INDUSTRY_CLR[carouselIndustry.id] ?? '#0ea5e9'}33`,
                }}
              >
                {carouselIndustry.label.charAt(0)}
              </div>

              <div className="text-center">
                <h2 className="text-white text-xl font-semibold">{carouselIndustry.label}</h2>
                {carouselIndustry.description && (
                  <p className="text-sm mt-1" style={{ color: '#5E5E5E' }}>{carouselIndustry.description}</p>
                )}
              </div>

              <div className="rounded-xl p-3 text-center w-full" style={{ background: '#1B1B1D' }}>
                <p className="text-xs mb-1" style={{ color: '#5E5E5E' }}>Companies</p>
                <p className="text-sm font-semibold text-white">{companiesPerIndustry[carouselIndustry.id] ?? 0}</p>
              </div>

              <button
                onClick={() => {
                  const center = CLUSTER_CENTER[carouselIndustry.id];
                  if (center) {
                    window.dispatchEvent(new CustomEvent('founderos:enterIndustry', {
                      detail: { id: carouselIndustry.id, center },
                    }));
                    setGalaxyViewMode('relational');
                  }
                }}
                className="w-full py-3 rounded-xl text-sm font-semibold"
                style={{ background: 'linear-gradient(135deg, #F9C6FF, #C1AEFF)', color: '#161618' }}
              >
                Enter {carouselIndustry.label} →
              </button>

              <div className="flex gap-1.5">
                {industryNodes.map((_, i) => (
                  <button
                    key={i}
                    onClick={() => setCarouselIdx(i)}
                    className="rounded-full transition-all duration-200"
                    style={{ width: i === carouselIdx ? 16 : 6, height: 6, background: i === carouselIdx ? '#C1AEFF' : '#3a3a3e' }}
                  />
                ))}
              </div>
              <p className="text-[10px]" style={{ color: '#3a3a3e' }}>
                {carouselIdx + 1} / {industryNodes.length} · scroll or arrows
              </p>
            </div>
          )}
        </div>
      )}

      {/* ── Hints ── */}
      {scope === 'galaxy' && galaxyViewMode === 'relational' && (
        <div className="absolute bottom-8 right-6 text-[10px]" style={{ color: '#3a3a3e' }}>
          Click or scroll toward an industry to enter
        </div>
      )}
      {scope === 'cluster' && (
        <div className="absolute bottom-8 right-6 text-[10px]" style={{ color: '#3a3a3e' }}>
          Click a company to open its twin
        </div>
      )}
      {scope === 'company' && (
        <div className="absolute bottom-8 right-6 text-[10px]" style={{ color: '#3a3a3e' }}>
          Drag to orbit · click module to open
        </div>
      )}

      <style>{`
        @keyframes fadeSlideIn {
          from { opacity: 0; transform: translateX(24px); }
          to   { opacity: 1; transform: translateX(0); }
        }
      `}</style>
    </div>
  );
}
