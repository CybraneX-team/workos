import React, { useMemo, useRef, useState, useEffect } from 'react';
import { Canvas, useFrame, useThree } from '@react-three/fiber';
import { Billboard, OrbitControls, OrthographicCamera, Text } from '@react-three/drei';
import * as THREE from 'three';
import { ArrowRight, RotateCcw, ChevronLeft, ChevronRight } from 'lucide-react';
import type { ImplementationTask } from './types';
import { ObjectSpaceTaskSidebar } from './ObjectSpaceTaskSidebar';

interface ObjectSpaceHubProps {
  tasks: ImplementationTask[];
  currentUser?: { name: string; email: string };
  onOpenTaskCockpit: (task: ImplementationTask) => void;
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

// 3D Orbital Satellite Node with original iconic constellation style
function TaskOrbitalNode({
  task,
  iconSymbol,
  initialAngle,
  radius,
  speed,
  isSelected,
  isFocused,
  dimmed,
  onPositionUpdate,
  onSelect,
}: {
  task: ImplementationTask;
  iconSymbol: string;
  initialAngle: number;
  radius: number;
  speed: number;
  isSelected: boolean;
  isFocused: boolean;
  dimmed: boolean;
  onPositionUpdate?: (id: string, pos: [number, number, number]) => void;
  onSelect: () => void;
}) {
  const meshRef = useRef<THREE.Group>(null);
  const angleRef = useRef<number>(initialAngle);
  const [hovered, setHovered] = useState(false);

  useFrame((_, delta) => {
    if (!meshRef.current) return;

    if (!hovered && !isFocused) {
      angleRef.current += speed * delta;
    }

    const currentAngle = angleRef.current;
    const x = Math.cos(currentAngle) * radius;
    const z = Math.sin(currentAngle) * radius;
    meshRef.current.position.set(x, 0, z);

    if (onPositionUpdate) {
      onPositionUpdate(task.id, [x, 0, z]);
    }

    const targetScale = dimmed ? 0.65 : isFocused ? 1.25 : isSelected ? 1.18 : hovered ? 1.1 : 1.0;
    meshRef.current.scale.setScalar(
      THREE.MathUtils.damp(meshRef.current.scale.x, targetScale, 8, delta)
    );
  });

  const nodeColor =
    task.status === 'active'
      ? '#8b5cf6'
      : task.status === 'in_progress'
      ? '#3b82f6'
      : '#10b981';

  return (
    <group ref={meshRef} position={[Math.cos(initialAngle) * radius, 0, Math.sin(initialAngle) * radius]}>
      {/* Satellite Core Sphere with original glossy physical specular sheen */}
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
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          setHovered(false);
          document.body.style.cursor = 'auto';
        }}
      >
        <sphereGeometry args={[0.92, 64, 48]} />
        <meshPhysicalMaterial
          color={nodeColor}
          roughness={0.28}
          metalness={0.06}
          clearcoat={0.82}
          clearcoatRoughness={0.18}
          transparent={dimmed}
          opacity={dimmed ? 0.35 : 1}
        />
      </mesh>

      {/* Outer Halo Rim Glow */}
      <mesh scale={isFocused ? 1.22 : 1.12} raycast={() => undefined}>
        <sphereGeometry args={[0.92, 32, 24]} />
        <meshBasicMaterial
          color={isFocused ? '#fef08a' : '#c7a8ff'}
          transparent
          opacity={dimmed ? 0.04 : isFocused ? 0.45 : isSelected ? 0.35 : hovered ? 0.25 : 0.12}
          side={THREE.BackSide}
        />
      </mesh>

      {/* Soft Ground Drop Shadow under sphere on floor */}
      <mesh position={[0, -1.46, 0]} rotation={[-Math.PI / 2, 0, 0]} raycast={() => undefined}>
        <circleGeometry args={[0.95, 36]} />
        <meshBasicMaterial color="#581c87" transparent opacity={dimmed ? 0.03 : 0.12} />
      </mesh>

      {/* Crisp White Iconic Constellation Typography */}
      {!dimmed && (
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
          {/* Top Glyph Icon Symbol */}
          <Text
            position={[0, 0.38, 0.98]}
            fontSize={0.15}
            color="#ffffff"
            anchorX="center"
            anchorY="middle"
            fontWeight={800}
          >
            {iconSymbol || '✦'}
          </Text>

          {/* Primary Task Name rendered in prominent, clear typography */}
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
            color="#f3e8ff"
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

// Ambient Floating Bubbles Particle Cloud surrounding the constellation
function ConstellationBubbles() {
  const groupRef = useRef<THREE.Group>(null);

  const bubbleData = useMemo(() => {
    let seed = 49182;
    const random = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };

    return Array.from({ length: 96 }, (_, idx) => {
      const angle = random() * Math.PI * 2;
      const radius = 1.2 + random() * 8.8;
      const y = -0.9 + random() * 2.8;
      const size = 0.04 + random() * 0.14;
      const speed = 0.35 + random() * 0.65;
      const phase = random() * Math.PI * 2;

      return {
        id: idx,
        initialX: Math.cos(angle) * radius,
        initialY: y,
        initialZ: Math.sin(angle) * radius,
        size,
        speed,
        phase,
      };
    });
  }, []);

  useFrame((state) => {
    if (!groupRef.current) return;
    const t = state.clock.getElapsedTime();

    groupRef.current.children.forEach((child, i) => {
      const p = bubbleData[i];
      if (p) {
        child.position.y = p.initialY + Math.sin(t * p.speed + p.phase) * 0.25;
      }
    });
  });

  return (
    <group ref={groupRef}>
      {bubbleData.map((p) => (
        <mesh key={p.id} position={[p.initialX, p.initialY, p.initialZ]}>
          <sphereGeometry args={[p.size, 20, 16]} />
          <meshPhysicalMaterial
            color="#ddd6fe"
            roughness={0.22}
            metalness={0.04}
            clearcoat={0.9}
            clearcoatRoughness={0.15}
            transparent
            opacity={0.52}
          />
        </mesh>
      ))}
    </group>
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
  const innerRadius = 3.6;
  const middleRadius = 5.4;
  const outerRadius = 7.3;

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
      <color attach="background" args={['#f5f3ff']} />
      <fog attach="fog" args={['#f5f3ff', 18, 42]} />
      
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
      <ambientLight intensity={1.9} color="#ffffff" />
      <directionalLight position={[-6, 14, 8]} intensity={2.6} color="#ffffff" castShadow />
      <directionalLight position={[6, 8, -6]} intensity={0.8} color="#e0e7ff" />
      <pointLight position={[0, 5, 2]} intensity={28} distance={18} color="#ede9fe" />

      {/* Translucent Floor Base Disc */}
      <mesh position={[0, -1.48, 0]} rotation={[-Math.PI / 2, 0, 0]} receiveShadow>
        <circleGeometry args={[11, 128]} />
        <meshBasicMaterial color="#e9e5f5" transparent opacity={0.65} />
      </mesh>

      {/* Orbit Rings (3 Concentric Tracks: Active purple, In Progress blue, Completed emerald) */}
      {[
        { r: innerRadius, color: '#8b5cf6', opacity: 0.45 },
        { r: middleRadius, color: '#3b82f6', opacity: 0.4 },
        { r: outerRadius, color: '#10b981', opacity: 0.35 },
      ].map((ring, idx) => (
        <group key={idx}>
          <mesh rotation={[-Math.PI / 2, 0, 0]} position={[0, -1.45, 0]}>
            <ringGeometry args={[ring.r - 0.035, ring.r + 0.035, 128]} />
            <meshBasicMaterial color={ring.color} transparent opacity={ring.opacity} side={THREE.DoubleSide} />
          </mesh>
        </group>
      ))}

      {/* Floating Particle Bubbles Cloud */}
      <ConstellationBubbles />

      {/* Central Root Department Core Orb */}
      <group position={[0, 0, 0]}>
        <mesh castShadow receiveShadow>
          <sphereGeometry args={[1.5, 64, 48]} />
          <meshPhysicalMaterial
            color={departmentColor || '#a855f7'}
            roughness={0.24}
            metalness={0.08}
            clearcoat={0.9}
            clearcoatRoughness={0.15}
            emissive={departmentColor || '#7e22ce'}
            emissiveIntensity={0.22}
          />
        </mesh>

        {/* Outer Halo */}
        <mesh scale={1.12}>
          <sphereGeometry args={[1.5, 32, 24]} />
          <meshBasicMaterial color="#f3e8ff" transparent opacity={0.2} side={THREE.BackSide} />
        </mesh>

        {/* Central Root Floor Shadow */}
        <mesh position={[0, -1.46, 0]} rotation={[-Math.PI / 2, 0, 0]}>
          <circleGeometry args={[1.7, 48]} />
          <meshBasicMaterial color="#581c87" transparent opacity={0.35} />
        </mesh>

        {/* Central Root Billboard Typography */}
        <Billboard follow lockX={false} lockY={false} lockZ={false}>
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
            color="#f3e8ff"
            anchorX="center"
            anchorY="middle"
            fontWeight={700}
          >
            Acme Corp · {departmentName}
          </Text>
        </Billboard>
      </group>

      {/* 1. Active Tasks on Inner Ring (Purple) */}
      {activeTasks.map((task, index) => {
        const initialAngle = (index / Math.max(1, activeTasks.length)) * Math.PI * 2;
        const isDimmed = filterStatus !== 'all' && filterStatus !== 'active';
        const categoryMeta = nodeCategories[index % nodeCategories.length];
        return (
          <TaskOrbitalNode
            key={task.id}
            task={task}
            iconSymbol={categoryMeta.symbol}
            initialAngle={initialAngle}
            radius={innerRadius}
            speed={0.05}
            isSelected={selectedTaskId === task.id}
            isFocused={selectedTaskId === task.id}
            dimmed={isDimmed}
            onPositionUpdate={handleNodeCoord}
            onSelect={() => onSelectTask(task)}
          />
        );
      })}

      {/* 2. In-Progress Tasks on Middle Ring (Blue) */}
      {inProgressTasks.map((task, index) => {
        const initialAngle = (index / Math.max(1, inProgressTasks.length)) * Math.PI * 2 + 1.8;
        const isDimmed = filterStatus !== 'all' && filterStatus !== 'in_progress';
        const categoryMeta = nodeCategories[(index + 3) % nodeCategories.length];
        return (
          <TaskOrbitalNode
            key={task.id}
            task={task}
            iconSymbol={categoryMeta.symbol}
            initialAngle={initialAngle}
            radius={middleRadius}
            speed={0.035}
            isSelected={selectedTaskId === task.id}
            isFocused={selectedTaskId === task.id}
            dimmed={isDimmed}
            onPositionUpdate={handleNodeCoord}
            onSelect={() => onSelectTask(task)}
          />
        );
      })}

      {/* 3. Completed Tasks on Outer Ring */}
      {completedTasks.map((task, index) => {
        const initialAngle = (index / Math.max(1, completedTasks.length)) * Math.PI * 2 + 3.2;
        const isDimmed = filterStatus !== 'all' && filterStatus !== 'completed';
        const categoryMeta = nodeCategories[(index + 6) % nodeCategories.length];
        return (
          <TaskOrbitalNode
            key={task.id}
            task={task}
            iconSymbol={categoryMeta.symbol}
            initialAngle={initialAngle}
            radius={outerRadius}
            speed={0.02}
            isSelected={selectedTaskId === task.id}
            isFocused={selectedTaskId === task.id}
            dimmed={isDimmed}
            onPositionUpdate={handleNodeCoord}
            onSelect={() => onSelectTask(task)}
          />
        );
      })}
    </>
  );
}

export const ObjectSpaceHub: React.FC<ObjectSpaceHubProps> = ({
  tasks,
  currentUser,
  onOpenTaskCockpit,
  onOpenCreateModal,
  onEditTask,
  onDeleteTask,
}) => {
  const [filterStatus, setFilterStatus] = useState<string>('all');
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [focusedPosition, setFocusedPosition] = useState<[number, number, number] | null>(null);
  const [focusZoom, setFocusZoom] = useState<number | null>(null);
  const [currentPage, setCurrentPage] = useState<number>(1);

  const nodePositions = useRef<Map<string, [number, number, number]>>(new Map());

  const handlePositionUpdate = (id: string, pos: [number, number, number]) => {
    nodePositions.current.set(id, pos);
  };

  const handleTransitionComplete = () => {
    setFocusedPosition(null);
    setFocusZoom(null);
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

  // Zoom to and focus on a specific task (auto-switches to page if necessary)
  const handleSelectAndZoomTask = (task: ImplementationTask) => {
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
  };

  // Reset camera view
  const handleResetCamera = () => {
    setSelectedTaskId(null);
    setFocusedPosition([0, 0, 0]);
    setFocusZoom(54);
  };

  return (
    <div className="absolute inset-0 w-full h-full bg-[#f5f3ff] text-slate-800 overflow-hidden font-sans select-none">
      
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
              onOpenTaskCockpit(t);
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
        onOpenTaskCockpit={onOpenTaskCockpit}
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
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white/90 hover:bg-white text-slate-700 border border-slate-200 text-xs font-semibold shadow-md backdrop-blur-md transition-all active:scale-95"
          >
            <RotateCcw size={12} className="text-slate-500" />
            <span>Reset Camera</span>
          </button>
        </div>
      )}

      {/* Floating Focus Action Pill */}
      {selectedTaskId && (
        <div className="absolute top-28 left-1/2 -translate-x-1/2 z-30 pointer-events-auto animate-bounce">
          {(() => {
            const task = employeeTasks.find((t) => t.id === selectedTaskId);
            if (!task) return null;
            return (
              <button
                type="button"
                onClick={() => onOpenTaskCockpit(task)}
                className="flex items-center gap-2 px-4 py-2 rounded-2xl bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold shadow-xl border border-violet-400 transition-transform active:scale-95"
              >
                <span>Launch {task.title}</span>
                <ArrowRight size={14} />
              </button>
            );
          })()}
        </div>
      )}

      {/* Bottom Center: 12-Node Constellation Page Switcher */}
      {totalPages > 1 && (
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 z-20 pointer-events-auto flex items-center gap-2 bg-white/95 px-3.5 py-1.5 rounded-2xl border border-slate-200 shadow-lg backdrop-blur-md text-xs font-semibold text-slate-700">
          <button
            type="button"
            disabled={currentPage <= 1}
            onClick={() => {
              setCurrentPage((prev) => Math.max(1, prev - 1));
              handleResetCamera();
            }}
            className={`p-1 rounded-lg border transition-all ${
              currentPage <= 1
                ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                : 'bg-white hover:bg-violet-50 hover:text-violet-700 border-slate-200'
            }`}
            title="Previous Cluster"
          >
            <ChevronLeft size={13} />
          </button>

          <span className="text-[11px] font-medium text-slate-600 px-1">
            Constellation <span className="font-bold text-violet-700">{currentPage}</span> of{' '}
            <span className="font-bold text-slate-800">{totalPages}</span>
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
                ? 'opacity-40 cursor-not-allowed bg-slate-100 border-slate-200 text-slate-400'
                : 'bg-white hover:bg-violet-50 hover:text-violet-700 border-slate-200'
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
