// Shared BDT Supercycle visualisation. This intentionally uses the same rich
// visual vocabulary as the original Supercycle scene, but every node and route
// here is derived from the persisted BDT representation — never PMS stages,
// instances, health, or static archetypes.
import { useEffect, useMemo, useRef } from 'react';
import * as THREE from 'three';
import { Billboard, Text } from '@react-three/drei';
import { useFrame } from '@react-three/fiber';
import type { SupercycleDepartment, SupercycleRoute } from '../../lib/db/bdtSupercycle';

const SPHERE_RADIUS = 1.55;
const NODE_RADIUS = 0.115;
const ROUTE_COLORS = ['#4fd8ff', '#a78bfa', '#34d399', '#fbbf24', '#f472b6', '#60a5fa'];

class SphericalArcCurve extends THREE.Curve<THREE.Vector3> {
  private readonly startDirection: THREE.Vector3;
  private readonly rotation: THREE.Quaternion;
  private readonly laneBulge: number;

  constructor(start: THREE.Vector3, end: THREE.Vector3, laneBulge: number) {
    super();
    this.startDirection = start.clone().normalize();
    this.rotation = new THREE.Quaternion().setFromUnitVectors(this.startDirection, end.clone().normalize());
    this.laneBulge = laneBulge;
  }

  getPoint(t: number, target = new THREE.Vector3()): THREE.Vector3 {
    const step = new THREE.Quaternion().slerpQuaternions(new THREE.Quaternion(), this.rotation, t);
    return target.copy(this.startDirection).applyQuaternion(step).normalize()
      .multiplyScalar(SPHERE_RADIUS + this.laneBulge * Math.sin(Math.PI * t));
  }
}

const glowTextureCache = new Map<string, THREE.CanvasTexture>();

function glowTexture(color: string): THREE.CanvasTexture {
  const cached = glowTextureCache.get(color);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Unable to create Supercycle glow texture');
  const rgb = new THREE.Color(color);
  const [red, green, blue] = [rgb.r, rgb.g, rgb.b].map((value) => Math.floor(value * 255));
  const gradient = context.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  gradient.addColorStop(0, `rgba(${red},${green},${blue},0.95)`);
  gradient.addColorStop(0.4, `rgba(${red},${green},${blue},0.32)`);
  gradient.addColorStop(1, `rgba(${red},${green},${blue},0)`);
  context.fillStyle = gradient;
  context.fillRect(0, 0, size, size);

  const texture = new THREE.CanvasTexture(canvas);
  glowTextureCache.set(color, texture);
  return texture;
}

function Glow({ color, scale }: { color: string; scale: number }) {
  const texture = useMemo(() => glowTexture(color), [color]);
  return <sprite scale={[scale, scale, scale]}>
    <spriteMaterial map={texture} blending={THREE.AdditiveBlending} depthWrite={false} transparent toneMapped={false} />
  </sprite>;
}

/** Distribute arbitrary configured departments evenly over a sphere. */
function departmentPosition(index: number, count: number): THREE.Vector3 {
  if (count <= 1) return new THREE.Vector3(0, 0, SPHERE_RADIUS);
  if (count === 2) return new THREE.Vector3(index === 0 ? -1 : 1, 0, 0).multiplyScalar(SPHERE_RADIUS);
  const y = 1 - (index / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = index * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).multiplyScalar(SPHERE_RADIUS);
}

function workspacePosition(index: number, count: number, radius = 0.72): THREE.Vector3 {
  const angle = (index / Math.max(count, 1)) * Math.PI * 2 - Math.PI / 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function CycleSphere() {
  const wireRef = useRef<THREE.LineSegments>(null);
  const wireGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16), 1),
    [],
  );
  useFrame((_, delta) => { if (wireRef.current) wireRef.current.rotation.y += delta * 0.03; });

  return <group>
    <mesh>
      <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
      <meshBasicMaterial color="#4fd8ff" transparent opacity={0.035} side={THREE.BackSide} depthWrite={false} toneMapped={false} />
    </mesh>
    <lineSegments ref={wireRef} geometry={wireGeometry}>
      <lineBasicMaterial color="#4fd8ff" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
    </lineSegments>
  </group>;
}

/**
 * The configured department ordering is expressed as one neutral visual route.
 * It is a representation cue only: it creates no commercial state or workflow.
 */
function CycleRoute({ route, positionsByDepartmentId, dimmed }: { route: SupercycleRoute; positionsByDepartmentId: Map<string, THREE.Vector3>; dimmed: boolean }) {
  const curve = useMemo(() => {
    const positions = route.departmentIds.map((departmentId) => positionsByDepartmentId.get(departmentId)).filter((position): position is THREE.Vector3 => Boolean(position));
    if (positions.length < 2) return null;
    const path = new THREE.CurvePath<THREE.Vector3>();
    positions.forEach((position, index) => {
      path.add(new SphericalArcCurve(position, positions[(index + 1) % positions.length], 0.045));
    });
    return path;
  }, [positionsByDepartmentId, route.departmentIds]);
  if (!curve) return null;
  return <mesh>
    <tubeGeometry args={[curve, 192, dimmed ? 0.007 : 0.011, 8, true]} />
    <meshBasicMaterial color={route.color} transparent opacity={dimmed ? 0.075 : 0.56} depthWrite={false} toneMapped={false} />
  </mesh>;
}

function DepartmentNode({ department, position, color, selected, dimmed, onSelect }: {
  department: SupercycleDepartment; position: THREE.Vector3; color: string; selected: boolean; dimmed: boolean; onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const positionRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (groupRef.current) {
      const target = selected ? 1.45 : dimmed ? 0.75 : 1;
      const breathe = 1 + Math.sin(timeRef.current * 1.4) * 0.04;
      groupRef.current.scale.setScalar(THREE.MathUtils.damp(groupRef.current.scale.x, target * breathe, 5.5, delta));
    }
    if (positionRef.current) {
      positionRef.current.position.x = THREE.MathUtils.damp(positionRef.current.position.x, position.x, 5.5, delta);
      positionRef.current.position.y = THREE.MathUtils.damp(positionRef.current.position.y, position.y, 5.5, delta);
      positionRef.current.position.z = THREE.MathUtils.damp(positionRef.current.position.z, position.z, 5.5, delta);
    }
  });

  const opacity = dimmed ? 0.25 : 1;
  return <group ref={positionRef} position={position}>
    <group ref={groupRef} onClick={(event) => { event.stopPropagation(); onSelect(); }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={(event) => { event.stopPropagation(); document.body.style.cursor = 'auto'; }}>
      <mesh><sphereGeometry args={[NODE_RADIUS, 24, 24]} /><meshBasicMaterial color={color} transparent opacity={opacity} toneMapped={false} /></mesh>
      <Glow color={color} scale={NODE_RADIUS * (dimmed ? 5 : 8)} />
      {!selected && <mesh rotation={[Math.PI / 2, 0, 0]}>
        <torusGeometry args={[NODE_RADIUS * 1.7, 0.008, 8, 32]} />
        <meshBasicMaterial color={color} transparent opacity={opacity * 0.9} depthWrite={false} toneMapped={false} />
      </mesh>}
    </group>
    <Billboard position={[0, NODE_RADIUS * 2.9, 0]}>
      <Text fontSize={0.088} color={dimmed ? '#5b6b86' : '#e7edf7'} anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#05070f">{department.label}</Text>
    </Billboard>
  </group>;
}

function BdtCore() {
  const coreRef = useRef<THREE.Group>(null);
  const wireGeometry = useMemo(() => new THREE.EdgesGeometry(new THREE.BoxGeometry(0.34, 0.34, 0.34)), []);
  useFrame((_, delta) => {
    if (!coreRef.current) return;
    coreRef.current.rotation.x += delta * 0.07;
    coreRef.current.rotation.y += delta * 0.11;
  });
  return <group ref={coreRef}>
    <Glow color="#a78bfa" scale={1.12} />
    <mesh><octahedronGeometry args={[0.17, 1]} /><meshBasicMaterial color="#c4b5fd" transparent opacity={0.9} toneMapped={false} /></mesh>
    <lineSegments geometry={wireGeometry}><lineBasicMaterial color="#67e8f9" transparent opacity={0.75} depthWrite={false} toneMapped={false} /></lineSegments>
    <mesh rotation={[Math.PI / 2, 0, 0]}><torusGeometry args={[0.27, 0.006, 8, 64]} /><meshBasicMaterial color="#67e8f9" transparent opacity={0.65} depthWrite={false} toneMapped={false} /></mesh>
    <mesh rotation={[0.42, 0.72, 0.24]}><torusGeometry args={[0.37, 0.004, 8, 64]} /><meshBasicMaterial color="#a78bfa" transparent opacity={0.48} depthWrite={false} toneMapped={false} /></mesh>
  </group>;
}

function WorkspaceTrack({ department, onOpenNode }: { department: SupercycleDepartment; onOpenNode: (departmentId: string, nodeId: string) => void }) {
  const groupRef = useRef<THREE.Group>(null);
  const contentRef = useRef<THREE.Group>(null);
  const trackGeometry = useMemo(() => new THREE.TorusGeometry(0.72, 0.006, 8, 96), []);
  useFrame((_, delta) => {
    if (!groupRef.current) return;
    groupRef.current.rotation.y += delta * 0.08;
    if (contentRef.current) contentRef.current.rotation.y -= delta * 0.08;
  });
  const color = '#34d399';
  return <group ref={groupRef}>
    <mesh geometry={trackGeometry} rotation={[Math.PI / 2, 0, 0]}><meshBasicMaterial color={color} transparent opacity={0.86} depthWrite={false} toneMapped={false} /></mesh>
    <Glow color={color} scale={1.65} />
    <group ref={contentRef}>
      {department.nodes.map((node, index) => <group key={node.id} position={workspacePosition(index, department.nodes.length)}>
        <mesh onClick={(event) => { event.stopPropagation(); onOpenNode(department.id, node.id); }} onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }} onPointerOut={(event) => { event.stopPropagation(); document.body.style.cursor = 'auto'; }}>
          <sphereGeometry args={[0.05, 20, 20]} /><meshBasicMaterial color={color} toneMapped={false} />
        </mesh>
        <Glow color={color} scale={0.27} />
        <Billboard position={[0, 0.12, 0]}>
          <Text fontSize={0.054} color="#d1fae5" maxWidth={0.48} textAlign="center" anchorX="center" anchorY="middle" outlineWidth={0.003} outlineColor="#05070f">{node.label}</Text>
        </Billboard>
      </group>)}
    </group>
  </group>;
}

export function SupercycleScene({ departments, routes, selectedDepartmentId, onSelectDepartment, onOpenNode }: {
  departments: SupercycleDepartment[]; routes: SupercycleRoute[]; selectedDepartmentId: string | null; onSelectDepartment: (id: string | null) => void; onOpenNode: (departmentId: string, nodeId: string) => void;
}) {
  const contentRef = useRef<THREE.Group>(null);
  const displayedDepartmentRef = useRef<string | null>(selectedDepartmentId);
  const positions = useMemo(() => departments.map((_, index) => departmentPosition(index, departments.length)), [departments]);
  const positionsByDepartmentId = useMemo(() => new Map(departments.map((department, index) => [department.id, positions[index]])), [departments, positions]);
  const colorsByDepartmentId = useMemo(() => {
    const colors = new Map<string, string>();
    routes.forEach((route) => route.departmentIds.forEach((departmentId) => { if (!colors.has(departmentId)) colors.set(departmentId, route.color); }));
    return colors;
  }, [routes]);
  const selectedIndex = departments.findIndex((department) => department.id === selectedDepartmentId);
  const selected = selectedIndex >= 0 ? departments[selectedIndex] : null;
  const selectedPosition = selectedIndex >= 0 ? positions[selectedIndex] : null;

  useEffect(() => { if (selectedDepartmentId) displayedDepartmentRef.current = selectedDepartmentId; }, [selectedDepartmentId]);
  const displayed = departments.find((department) => department.id === displayedDepartmentRef.current) ?? null;
  const displayedPosition = displayed ? positions[departments.findIndex((department) => department.id === displayed.id)] : null;

  useFrame((_, delta) => {
    const content = contentRef.current;
    if (!content) return;
    const targetScale = selectedPosition ? 1.48 : 1;
    content.scale.setScalar(THREE.MathUtils.damp(content.scale.x, targetScale, 4.8, delta));
    const targetPosition = selectedPosition ? selectedPosition.clone().multiplyScalar(-targetScale) : new THREE.Vector3();
    content.position.x = THREE.MathUtils.damp(content.position.x, targetPosition.x, 4.8, delta);
    content.position.y = THREE.MathUtils.damp(content.position.y, targetPosition.y, 4.8, delta);
    content.position.z = THREE.MathUtils.damp(content.position.z, targetPosition.z, 4.8, delta);
  });

  return <group ref={contentRef}>
    <CycleSphere />
    {routes.map((route) => <CycleRoute key={route.id} route={route} positionsByDepartmentId={positionsByDepartmentId} dimmed={Boolean(selected)} />)}
    {!selected && <BdtCore />}
    {departments.map((department, index) => <DepartmentNode key={department.id} department={department} position={positions[index]} color={colorsByDepartmentId.get(department.id) ?? ROUTE_COLORS[index % ROUTE_COLORS.length]} selected={department.id === selected?.id} dimmed={Boolean(selected && department.id !== selected.id)} onSelect={() => onSelectDepartment(department.id === selected?.id ? null : department.id)} />)}
    {selected && displayed && displayedPosition && <group position={displayedPosition}><WorkspaceTrack department={displayed} onOpenNode={onOpenNode} /></group>}
  </group>;
}

export default SupercycleScene;
