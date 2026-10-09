import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls, OrthographicCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImplementationTask } from './types';
import { ObjectSpaceTaskSidebar } from './ObjectSpaceTaskSidebar';

interface ObjectSpaceHubProps {
  tasks: ImplementationTask[];
  currentUser?: { name: string; email: string };
  onOpenTaskStudio?: (task: ImplementationTask) => void;
  onOpenTaskCockpit?: (task: ImplementationTask) => void;
  onOpenCreateModal?: () => void;
  onEditTask?: (task: ImplementationTask) => void;
  onDeleteTask?: (task: ImplementationTask) => void;
}

const PAGE_SIZE = 12;

// Camera controller that smoothly pans and zooms onto a searched or selected task and then releases control
function CameraFocusRig({
  focusedPosition,
  focusZoom,
  onTransitionComplete,
}: {
  focusedPosition: [number, number, number] | null;
  focusZoom: number | null;
  onTransitionComplete?: () => void;
}) {
  const { camera } = useThree();
  const controlsRef = useThree((state) => state.controls) as any;
  const isTransitioningRef = useRef(false);
  const targetZoomRef = useRef<number | null>(null);
  const targetPosRef = useRef<THREE.Vector3 | null>(null);

  // When focusedPosition or focusZoom changes from user action, begin smooth transition
  useEffect(() => {
    if (focusZoom !== null || focusedPosition !== null) {
      isTransitioningRef.current = true;
      targetZoomRef.current = focusZoom;
      targetPosRef.current = focusedPosition
        ? new THREE.Vector3(focusedPosition[0], focusedPosition[1], focusedPosition[2])
        : new THREE.Vector3(0, 0, 0);
    }
  }, [focusedPosition, focusZoom]);

  // If user starts manually interacting (mouse wheel scroll, dragging), cancel programmatic lock immediately
  useEffect(() => {
    if (!controlsRef) return;
    const handleStart = () => {
      isTransitioningRef.current = false;
      targetZoomRef.current = null;
      targetPosRef.current = null;
      if (onTransitionComplete) onTransitionComplete();
    };
    controlsRef.addEventListener('start', handleStart);
    return () => {
      controlsRef.removeEventListener('start', handleStart);
    };
  }, [controlsRef, onTransitionComplete]);

  useFrame((_, delta) => {
    if (!controlsRef || !isTransitioningRef.current) return;

    let posDone = true;
    let zoomDone = true;

    if (targetPosRef.current) {
      controlsRef.target.lerp(targetPosRef.current, Math.min(1, 8 * delta));
      if (controlsRef.target.distanceTo(targetPosRef.current) > 0.05) {
        posDone = false;
      }
    }

    if (targetZoomRef.current !== null && 'zoom' in camera) {
      const currentZoom = camera.zoom;
      const targetZ = targetZoomRef.current;
      camera.zoom = THREE.MathUtils.damp(currentZoom, targetZ, 8, delta);
      camera.updateProjectionMatrix();

      if (Math.abs(camera.zoom - targetZ) > 0.5) {
        zoomDone = false;
      }
    }

    controlsRef.update();

    if (posDone && zoomDone) {
      // Transition complete: release all camera locks so user manual zoom and pan is completely unrestricted
      isTransitioningRef.current = false;
      targetZoomRef.current = null;
      targetPosRef.current = null;
      if (onTransitionComplete) {
        onTransitionComplete();
      }
    }
  });

  return null;
}

// 3D Orbital Satellite Node with hollow 3D circle / spherical ring design matching the dark space background
function TaskOrbitalNode({
  task,
  iconSymbol,
  isSelected,
  isFocused,
  dimmed,
  onSelect,
  onHoverChange,
}: {
  task: ImplementationTask;
  iconSymbol: string;
  isSelected: boolean;
  isFocused: boolean;
  dimmed: boolean;
  onSelect: () => void;
  onHoverChange: (isHovered: boolean) => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    const targetScale = dimmed ? 0.65 : isFocused ? 1.25 : isSelected ? 1.18 : hovered ? 1.1 : 1.0;
    meshRef.current.scale.setScalar(
      THREE.MathUtils.damp(meshRef.current.scale.x, targetScale, 8, delta)
    );
  });

  // Cosmic color themes: status accents applied to glowing 3D circle rims while core matches dark space
  const statusTheme = useMemo(() => {
    if (task.status === 'active') {
      return {
        accent: '#c084fc',      // Bright cosmic purple / lavender
        glow: '#9333ea',        // Violet glow
        rim: '#e9d5ff',         // Starlight purple rim
      };
    }
    if (task.status === 'in_progress') {
      return {
        accent: '#38bdf8',      // Starlight cyan / azure
        glow: '#0284c7',        // Ocean blue glow
        rim: '#bae6fd',         // Ice cyan rim
      };
    }
    return {
      accent: '#34d399',        // Aurora emerald
      glow: '#059669',          // Deep emerald glow
      rim: '#a7f3d0',           // Mint starlight rim
    };
  }, [task.status]);

  return (
    <group ref={meshRef}>
      {/* 1. Hollow Core Sphere: dark body matching the space background with subtle specular reflection */}
      <mesh
        castShadow
        receiveShadow
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          setHovered(true);
          onHoverChange(true);
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          onHoverChange(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.92, 48, 36]} />
        <meshPhysicalMaterial
          color="#05070f"
          roughness={0.14}
          metalness={0.45}
          clearcoat={1.0}
          clearcoatRoughness={0.1}
          transparent
          opacity={dimmed ? 0.35 : 0.95}
          emissive={statusTheme.glow}
          emissiveIntensity={dimmed ? 0.02 : isFocused ? 0.2 : isSelected ? 0.16 : hovered ? 0.12 : 0.05}
        />
      </mesh>

      {/* 2. Outer Ethereal Halo */}
      <mesh scale={isFocused ? 1.25 : 1.12} raycast={() => undefined}>
        <sphereGeometry args={[0.92, 32, 24]} />
        <meshBasicMaterial
          color={isFocused ? '#fef08a' : statusTheme.accent}
          transparent
          opacity={dimmed ? 0.01 : isFocused ? 0.28 : isSelected ? 0.22 : hovered ? 0.16 : 0.07}
          side={THREE.BackSide}
        />
      </mesh>

      {/* 3. Front-Facing 3D Luminous Circle Rim & Typography Billboard */}
      {!dimmed && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          {/* Outer soft glow ring */}
          <mesh position={[0, 0, 0.94]} raycast={() => undefined}>
            <ringGeometry args={[0.85, 0.98, 64]} />
            <meshBasicMaterial
              color={statusTheme.glow}
              transparent
              opacity={isFocused ? 0.5 : isSelected ? 0.42 : hovered ? 0.32 : 0.2}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Crisp 3D Hollow Circle Rim in bright status accent */}
          <mesh position={[0, 0, 0.95]} raycast={() => undefined}>
            <ringGeometry args={[0.89, 0.94, 64]} />
            <meshBasicMaterial
              color={isFocused ? '#fef08a' : statusTheme.accent}
              transparent
              opacity={isFocused ? 0.98 : isSelected ? 0.92 : hovered ? 0.88 : 0.78}
              side={THREE.DoubleSide}
            />
          </mesh>

          {/* Top Glyph Icon Symbol */}
          <Text
            position={[0, 0.38, 0.98]}
            fontSize={0.15}
            color={statusTheme.rim}
            anchorX="center"
            anchorY="middle"
            fontWeight={800}
          >
            {iconSymbol || '✦'}
          </Text>

          {/* Primary Task Name rendered in crisp white typography */}
          <Text
            position={[0, 0.02, 0.98]}
            fontSize={0.122}
            maxWidth={1.46}
            lineHeight={1.14}
            textAlign="center"
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={800}
            letterSpacing={0.01}
          >
            {task.title}
          </Text>

          {/* Subtitle / Assignee & Progress */}
          <Text
            position={[0, -0.36, 0.98]}
            fontSize={0.088}
            maxWidth={1.38}
            textAlign="center"
            color="#cbd5e1"
            anchorX="center"
            anchorY="middle"
            fontWeight={600}
          >
            {task.assignee.name} · {task.progress}%
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// Orbital Ring Controller: locks all satellite nodes on an orbit into synchronized phase motion
// with guaranteed uniform angular distribution and continuous physics-based collision avoidance.
interface OrbitalRingGroupProps {
  tasks: ImplementationTask[];
  radius: number;
  speed: number;
  basePhaseOffset: number;
  isOrbitPaused: boolean;
  selectedTaskId?: string;
  filterStatus: string;
  expectedStatus: ImplementationTask['status'];
  nodeCategories: { symbol: string; label: string }[];
  categoryOffset: number;
  onPositionUpdate: (id: string, pos: [number, number, number]) => void;
  onSelectTask: (task: ImplementationTask) => void;
  onHoverChange: (isHovered: boolean, taskId: string) => void;
}

function OrbitalRingGroup({
  tasks,
  radius,
  speed,
  basePhaseOffset,
  isOrbitPaused,
  selectedTaskId,
  filterStatus,
  expectedStatus,
  nodeCategories,
  categoryOffset,
  onPositionUpdate,
  onSelectTask,
  onHoverChange,
}: OrbitalRingGroupProps) {
  const ringPhaseRef = useRef<number>(basePhaseOffset);
  const nodeAnglesRef = useRef<Map<string, number>>(new Map());
  const nodeGroupRefs = useRef<Map<string, THREE.Group>>(new Map());

  // Clean up removed tasks
  useEffect(() => {
    const currentIds = new Set(tasks.map((t) => t.id));
    for (const id of Array.from(nodeAnglesRef.current.keys())) {
      if (!currentIds.has(id)) {
        nodeAnglesRef.current.delete(id);
        nodeGroupRefs.current.delete(id);
      }
    }
  }, [tasks]);

  useFrame((_, delta) => {
    const count = tasks.length;
    if (count === 0) return;

    // Advance unified ring orbital phase when not paused
    if (!isOrbitPaused) {
      ringPhaseRef.current += speed * delta;
      if (ringPhaseRef.current > Math.PI * 2) {
        ringPhaseRef.current -= Math.PI * 2;
      }
    }

    const currentBasePhase = ringPhaseRef.current;
    const slotStep = (Math.PI * 2) / count;

    // Safe minimum angular distance between any two node centers on this ring (sphere diameter ~ 2.4 units)
    const minSafeAngle = Math.min(slotStep * 0.9, Math.max(0.44, 2.4 / radius));

    // Calculate/smooth angles for each task
    const angleEntries: { id: string; angle: number }[] = [];

    tasks.forEach((task, index) => {
      // Distinct uniform slot per task index
      const idealTarget = currentBasePhase + index * slotStep;

      let curAngle = nodeAnglesRef.current.get(task.id);
      if (curAngle === undefined) {
        curAngle = idealTarget;
        nodeAnglesRef.current.set(task.id, curAngle);
      } else {
        // Smooth transition towards target slot
        let diff = (idealTarget - curAngle) % (Math.PI * 2);
        if (diff > Math.PI) diff -= Math.PI * 2;
        if (diff < -Math.PI) diff += Math.PI * 2;
        curAngle = curAngle + diff * Math.min(1, delta * 6);
        nodeAnglesRef.current.set(task.id, curAngle);
      }

      angleEntries.push({ id: task.id, angle: curAngle });
    });

    // Collision Avoidance & Angular Separation Enforcement:
    // Guarantees no two 3D spheres ever coincide or collide on the same orbit.
    if (count > 1) {
      // Sort in circular order around [0, 2PI)
      angleEntries.sort((a, b) => {
        const normA = ((a.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        const normB = ((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
        return normA - normB;
      });

      // Relaxation passes to resolve any overlap
      for (let pass = 0; pass < 3; pass++) {
        for (let i = 0; i < count; i++) {
          const nextIdx = (i + 1) % count;
          const a = angleEntries[i];
          const b = angleEntries[nextIdx];

          let normA = ((a.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);
          let normB = ((b.angle % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2);

          let diff = normB - normA;
          if (diff < 0) diff += Math.PI * 2;

          if (diff < minSafeAngle) {
            const overlap = (minSafeAngle - diff) * 0.5;
            a.angle -= overlap;
            b.angle += overlap;
            nodeAnglesRef.current.set(a.id, a.angle);
            nodeAnglesRef.current.set(b.id, b.angle);
          }
        }
      }
    }

    // Apply collision-free coordinates to Three.js groups
    angleEntries.forEach((item) => {
      const group = nodeGroupRefs.current.get(item.id);
      const x = Math.cos(item.angle) * radius;
      const z = Math.sin(item.angle) * radius;

      if (group) {
        group.position.set(x, 0, z);
      }
      onPositionUpdate(item.id, [x, 0, z]);
    });
  });

  const isDimmed = filterStatus !== 'all' && filterStatus !== expectedStatus;

  return (
    <>
      {tasks.map((task, index) => {
        const categoryMeta = nodeCategories[(index + categoryOffset) % nodeCategories.length];
        const slotAngle = basePhaseOffset + (index / Math.max(1, tasks.length)) * Math.PI * 2;
        const initialX = Math.cos(slotAngle) * radius;
        const initialZ = Math.sin(slotAngle) * radius;

        return (
          <group
            key={task.id}
            position={[initialX, 0, initialZ]}
            ref={(el) => {
              if (el) nodeGroupRefs.current.set(task.id, el);
              else nodeGroupRefs.current.delete(task.id);
            }}
          >
            <TaskOrbitalNode
              task={task}
              iconSymbol={categoryMeta.symbol}
              isSelected={selectedTaskId === task.id}
              isFocused={selectedTaskId === task.id}
              dimmed={isDimmed}
              onSelect={() => onSelectTask(task)}
              onHoverChange={(isHov) => onHoverChange(isHov, task.id)}
            />
          </group>
        );
      })}
    </>
  );
}

// Background Starfield matching PMS space aesthetic
function Starfield({ count = 1400, spread = 120, seed = 5150 }: { count?: number; spread?: number; seed?: number }) {
  const geometry = useMemo(() => {
    let s = seed >>> 0;
    const random = () => {
      s = (s + 0x6d2b79f5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
    const positions = new Float32Array(count * 3);
    for (let i = 0; i < count * 3; i += 1) positions[i] = (random() - 0.5) * spread;
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    return geo;
  }, [count, spread, seed]);

  return (
    <points geometry={geometry} raycast={() => undefined}>
      <pointsMaterial color="#bfe0ff" size={1.6} sizeAttenuation={false} transparent opacity={0.75} depthWrite={false} toneMapped={false} />
    </points>
  );
}

// 3D Orbital Constellation Scene
function OrbitScene({
  tasks,
  departmentName,
  departmentColor,
  filterStatus,
  selectedTaskId,
  focusedPosition,
  focusZoom,
  onPositionUpdate,
  onSelectTask,
  onTransitionComplete,
}: {
  tasks: ImplementationTask[];
  departmentName: string;
  departmentColor: string;
  filterStatus: string;
  selectedTaskId?: string;
  focusedPosition: [number, number, number] | null;
  focusZoom: number | null;
  onPositionUpdate: (id: string, pos: [number, number, number]) => void;
  onSelectTask: (task: ImplementationTask) => void;
  onTransitionComplete?: () => void;
}) {
  const innerRadius = 3.8;
  const middleRadius = 5.8;
  const outerRadius = 7.8;

  const [hoveredTaskId, setHoveredTaskId] = useState<string | null>(null);
  const isOrbitPaused = Boolean(hoveredTaskId || selectedTaskId || focusedPosition);

  const activeTasks = useMemo(() => tasks.filter((t) => t.status === 'active'), [tasks]);
  const inProgressTasks = useMemo(() => tasks.filter((t) => t.status === 'in_progress'), [tasks]);
  const completedTasks = useMemo(() => tasks.filter((t) => t.status === 'completed'), [tasks]);

  const handleNodeCoord = (id: string, pos: [number, number, number]) => {
    onPositionUpdate(id, pos);
  };

  // 8 Canonical Constellation Category Labels & Symbols
  const nodeCategories = [
    { symbol: '●●', label: 'CUSTOMER' },
    { symbol: '◎', label: 'OPPORTUNITY' },
    { symbol: '☵', label: 'PROJECT' },
    { symbol: '⎈', label: 'INVOICE' },
    { symbol: '○', label: 'PERSON' },
    { symbol: '≡', label: 'ASSET' },
    { symbol: '⌘', label: 'DEPARTMENT' },
    { symbol: '◈', label: 'PRODUCT' },
  ];

  return (
    <>
      <color attach="background" args={['#05070f']} />
      <Starfield count={1400} spread={120} seed={5150} />
      
      {/* Starting camera framing matching user's requested pulled-back angle */}
      <OrthographicCamera makeDefault position={[-6.2, 7.8, 12.4]} zoom={54} near={-50} far={100} />
      
      {/* Unrestricted Zoom & Smooth Orbit Controls with expanded zoom-out limit */}
      <OrbitControls
        makeDefault
        enableDamping
        dampingFactor={0.075}
        enablePan
        minZoom={8}
        maxZoom={400}
        minPolarAngle={0.2}
        maxPolarAngle={1.35}
      />

      <CameraFocusRig
        focusedPosition={focusedPosition}
        focusZoom={focusZoom}
        onTransitionComplete={onTransitionComplete}
      />

      {/* Lighting with Specular Sheen */}
      <ambientLight intensity={1.8} color="#ffffff" />
      <directionalLight position={[-6, 14, 8]} intensity={2.6} color="#ffffff" castShadow />
      <directionalLight position={[6, 8, -6]} intensity={0.9} color="#93c5fd" />
      <pointLight position={[0, 5, 2]} intensity={28} distance={18} color="#c4b5fd" />

      {/* Orbit Rings (3 Concentric Tracks: Active purple, In Progress blue, Completed emerald) aligned to orbital plane */}
      {[
        { r: innerRadius, color: '#a78bfa', opacity: 0.35 },
        { r: middleRadius, color: '#38bdf8', opacity: 0.3 },
        { r: outerRadius, color: '#34d399', opacity: 0.28 },
      ].map((ring, idx) => (
        <group key={idx}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, 0, 0]}>
            <ringGeometry args={[ring.r - 0.02, ring.r + 0.02, 128]} />
            <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* Central Root Department Core Node with Clean Hollow 3D Circle */}
      <group position={[0, 0, 0]}>
        {/* Hollow Core Sphere matching dark cosmic space */}
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[1.5, 64, 48]} />
          <meshPhysicalMaterial
            color="#05070f"
            roughness={0.12}
            metalness={0.5}
            clearcoat={1.0}
            clearcoatRoughness={0.08}
            transparent
            opacity={0.92}
            emissive="#4338ca"
            emissiveIntensity={0.08}
          />
        </mesh>

        {/* Outer Soft Halo */}
        <mesh scale={1.14} raycast={() => undefined}>
          <sphereGeometry args={[1.5, 32, 24]} />
          <meshBasicMaterial color={departmentColor || '#a855f7'} transparent opacity={0.15} side={THREE.BackSide} />
        </mesh>

        {/* Front-Facing Luminous 3D Circle Rim & Organization Typography */}
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          {/* Outer glow ring */}
          <mesh position={[0, 0, 1.54]} raycast={() => undefined}>
            <ringGeometry args={[1.4, 1.58, 96]} />
            <meshBasicMaterial color="#6366f1" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>

          {/* Sharp 3D Hollow Circle Rim in starlight purple */}
          <mesh position={[0, 0, 1.55]} raycast={() => undefined}>
            <ringGeometry args={[1.46, 1.52, 96]} />
            <meshBasicMaterial color="#c084fc" transparent opacity={0.9} side={THREE.DoubleSide} />
          </mesh>

          <Text
            position={[0, 0.48, 1.58]}
            fontSize={0.26}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={900}
          >
            🏢
          </Text>

          <Text
            position={[0, 0.08, 1.58]}
            fontSize={0.17}
            maxWidth={2.2}
            textAlign="center"
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={900}
            letterSpacing={0.08}
          >
            ORGANIZATION
          </Text>

          <Text
            position={[0, -0.32, 1.58]}
            fontSize={0.11}
            maxWidth={2.2}
            textAlign="center"
            color="#cbd5e1"
            anchorX="center"
            anchorY="middle"
            fontWeight={700}
          >
            Acme Corp · {departmentName}
          </Text>
        </Billboard>
      </group>

      {/* 1. Active Tasks on Inner Ring (Purple) */}
      <OrbitalRingGroup
        tasks={activeTasks}
        radius={innerRadius}
        speed={0.045}
        basePhaseOffset={0}
        isOrbitPaused={isOrbitPaused}
        selectedTaskId={selectedTaskId}
        filterStatus={filterStatus}
        expectedStatus="active"
        nodeCategories={nodeCategories}
        categoryOffset={0}
        onPositionUpdate={handleNodeCoord}
        onSelectTask={onSelectTask}
        onHoverChange={(isHov, id) => setHoveredTaskId(isHov ? id : null)}
      />

      {/* 2. In-Progress Tasks on Middle Ring (Blue) */}
      <OrbitalRingGroup
        tasks={inProgressTasks}
        radius={middleRadius}
        speed={0.03}
        basePhaseOffset={1.8}
        isOrbitPaused={isOrbitPaused}
        selectedTaskId={selectedTaskId}
        filterStatus={filterStatus}
        expectedStatus="in_progress"
        nodeCategories={nodeCategories}
        categoryOffset={3}
        onPositionUpdate={handleNodeCoord}
        onSelectTask={onSelectTask}
        onHoverChange={(isHov, id) => setHoveredTaskId(isHov ? id : null)}
      />

      {/* 3. Completed Tasks on Outer Ring (Emerald) */}
      <OrbitalRingGroup
        tasks={completedTasks}
        radius={outerRadius}
        speed={0.018}
        basePhaseOffset={3.4}
        isOrbitPaused={isOrbitPaused}
        selectedTaskId={selectedTaskId}
        filterStatus={filterStatus}
        expectedStatus="completed"
        nodeCategories={nodeCategories}
        categoryOffset={6}
        onPositionUpdate={handleNodeCoord}
        onSelectTask={onSelectTask}
        onHoverChange={(isHov, id) => setHoveredTaskId(isHov ? id : null)}
      />
    </>
  );
}

export const ObjectSpaceHub: React.FC<ObjectSpaceHubProps> = ({
  tasks,
  currentUser,
  onOpenTaskStudio,
  onOpenTaskCockpit,
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
}) => {
  const openTask = onOpenTaskStudio || onOpenTaskCockpit || (() => {});
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<[number, number, number] | null>(null);
  const [focusZoom, setFocusZoom] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const nodePositions = useRef<Map<string, [number, number, number]>>(new Map());
  const pendingTaskToOpenRef = useRef<ImplementationTask | null>(null);
  const openTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    return () => {
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
    };
  }, []);

  const handlePositionUpdate = (id: string, pos: [number, number, number]) => {
    nodePositions.current.set(id, pos);
  };

  const handleTransitionComplete = () => {
    setFocusedPosition(null);
    setFocusZoom(null);
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    if (pendingTaskToOpenRef.current) {
      const task = pendingTaskToOpenRef.current;
      pendingTaskToOpenRef.current = null;
      openTask(task);
    }
  };

  // Every task in this space belongs to the signed-in user; department is just a label on each task.
  const employeeTasks = tasks;

  // Total pages based on 12 tasks per constellation page
  const totalPages = Math.max(1, Math.ceil(employeeTasks.length / PAGE_SIZE));

  // Current 12 tasks visible in 3D scene
  const paginated3DTasks = useMemo(() => {
    const start = (currentPage - 1) * PAGE_SIZE;
    return employeeTasks.slice(start, start + PAGE_SIZE);
  }, [employeeTasks, currentPage]);

  // Zoom to and focus on a specific task (auto-switches to page if necessary) and then automatically opens its workspace
  const handleSelectAndZoomTask = (task: ImplementationTask, autoOpen = true) => {
    const taskIndex = employeeTasks.findIndex((t) => t.id === task.id);
    if (taskIndex !== -1) {
      const targetPage = Math.floor(taskIndex / PAGE_SIZE) + 1;
      if (targetPage !== currentPage) {
        setCurrentPage(targetPage);
      }
    }
    setSelectedTaskId(task.id);
    const pos = nodePositions.current.get(task.id) || [3, 0, 3];
    setFocusedPosition(pos);
    setFocusZoom(110);

    if (autoOpen) {
      pendingTaskToOpenRef.current = task;
      if (openTimeoutRef.current) clearTimeout(openTimeoutRef.current);
      // Fallback timer: opens workspace when camera zoom animation concludes (~700ms)
      openTimeoutRef.current = setTimeout(() => {
        if (pendingTaskToOpenRef.current) {
          const t = pendingTaskToOpenRef.current;
          pendingTaskToOpenRef.current = null;
          openTask(t);
        }
      }, 700);
    }
  };

  // Reset camera view
  const handleResetCamera = () => {
    if (openTimeoutRef.current) {
      clearTimeout(openTimeoutRef.current);
      openTimeoutRef.current = null;
    }
    pendingTaskToOpenRef.current = null;
    setSelectedTaskId(null);
    setFocusedPosition([0, 0, 0]);
    setFocusZoom(54);
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-[#05070f] text-slate-100 overflow-hidden font-sans select-none">
      
      {/* Full Viewport 3D Canvas rendering exactly up to 12 nodes at a time */}
      <div className="absolute inset-0 w-full h-full">
        <Canvas shadows dpr={[1, 2]} gl={{ antialias: true, alpha: false }}>
          <OrbitScene
            tasks={paginated3DTasks}
            departmentName="Object Space"
            departmentColor="#8b5cf6"
            filterStatus={filterStatus}
            selectedTaskId={selectedTaskId || undefined}
            focusedPosition={focusedPosition}
            focusZoom={focusZoom}
            onPositionUpdate={handlePositionUpdate}
            onTransitionComplete={handleTransitionComplete}
            onSelectTask={(t) => {
              handleSelectAndZoomTask(t);
              openTask(t);
            }}
          />
        </Canvas>
      </div>

      {/* Task Search & Navigation Sidebar with Pagination and CRUD Controls */}
      <ObjectSpaceTaskSidebar
        tasks={employeeTasks}
        selectedTaskId={selectedTaskId}
        filterStatus={filterStatus}
        currentPage={currentPage}
        totalPages={totalPages}
        currentUser={currentUser}
        onPageChange={(p) => {
          setCurrentPage(p);
          handleResetCamera();
        }}
        onFilterChange={(status) => {
          setFilterStatus(status);
          handleResetCamera();
        }}
        onSelectAndZoomTask={handleSelectAndZoomTask}
        onOpenTaskStudio={openTask}
        onOpenCreateModal={onOpenCreateModal}
        onEditTask={onEditTask}
        onDeleteTask={onDeleteTask}
      />

      {/* Top Left Floating Action: Reset Camera if focused */}
      {selectedTaskId && (
        <div className="absolute top-20 left-6 z-30 pointer-events-auto">
          <button
            type="button"
            onClick={handleResetCamera}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-[#0c101d]/90 hover:bg-[#13192b] text-slate-200 hover:text-white border border-slate-800 text-xs font-semibold shadow-xl backdrop-blur-xl transition-all active:scale-95"
          >
            <RotateCcw size={12} className="text-slate-400" />
            <span>Reset Camera</span>
          </button>
        </div>
      )}

      {/* Bottom Center: 12-Node Constellation Page Switcher */}
      {totalPages > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 bg-[#0c101d]/90 px-3.5 py-1.5 rounded-2xl border border-slate-800 shadow-2xl backdrop-blur-xl text-xs font-semibold text-slate-200">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => {
              setCurrentPage((prev) => Math.max(1, prev - 1));
              handleResetCamera();
            }}
            className={`p-1 rounded-lg border transition-all ${
              currentPage <= 1
                ? 'opacity-30 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
            }`}
            title="Previous Cluster"
          >
            <ChevronLeft size={13} />
          </button>

          <span className="text-[11px] font-medium text-slate-400 px-1">
            Constellation <span className="font-bold text-violet-400">{currentPage}</span> of{' '}
            <span className="font-bold text-slate-100">{totalPages}</span>
          </span>

          <button
            type="button"
            disabled={currentPage >= totalPages}
            onClick={() => {
              setCurrentPage((prev) => Math.min(totalPages, prev + 1));
              handleResetCamera();
            }}
            className={`p-1 rounded-lg border transition-all ${
              currentPage >= totalPages
                ? 'opacity-30 cursor-not-allowed bg-slate-950 border-slate-800 text-slate-600'
                : 'bg-slate-900 hover:bg-slate-800 text-slate-300 hover:text-white border-slate-800'
            }`}
            title="Next Cluster"
          >
            <ChevronRight size={13} />
          </button>
        </div>
      )}
    </div>
  );
};
