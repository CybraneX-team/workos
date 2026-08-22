// ─────────────────────────────────────────────────────────────────────────────
// Supercycle Scene — what you find inside the BDT polytope's core.
//
// Renders in the SAME r3f canvas as the polytope (see polytope/Scene.tsx), so
// the existing core-dive camera animation flows straight into it rather than
// cutting to a different canvas and re-initialising WebGL.
//
// Geometry is sized for where the dive parks the camera: (0, 0, 4.3) with a
// 45° FOV, which makes the visible height ~3.5 units. Hence a sphere of
// radius ~1.55 — big enough to fill the frame, small enough to keep its poles
// on screen.
// ─────────────────────────────────────────────────────────────────────────────

import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { useFrame } from '@react-three/fiber';
import { Billboard, Text } from '@react-three/drei';
import { NewPmsHypercubeModel } from '../../pages/NewPMS/App';
import {
  nodeHealth,
  supercycleHealth,
  type SupercycleArchetype,
  type SupercycleInstance,
  type SupercycleNode,
  type SupercycleCycle,
} from '../../lib/supercycleData';

const SPHERE_RADIUS = 1.55;
const RING_RADIUS = SPHERE_RADIUS;
const NODE_RADIUS = 0.14;
export type SupercycleRouteStyle = 'curved' | 'spherical';

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

// ── Additive glow sprite ─────────────────────────────────────────────────────
// A radial-gradient canvas texture blended additively. Works here because the
// polytope scene is on black; additive blending adds toward white and would
// contribute nothing on a light background.

const glowTextureCache = new Map<string, THREE.CanvasTexture>();
const planetTextureCache = new Map<string, THREE.CanvasTexture>();

function planetTexture(id: string, color: string): THREE.CanvasTexture {
  const key = `${id}:${color}`;
  const cached = planetTextureCache.get(key);
  if (cached) return cached;
  const canvas = document.createElement('canvas');
  canvas.width = 256;
  canvas.height = 128;
  const ctx = canvas.getContext('2d')!;
  const base = new THREE.Color(color);
  const dark = base.clone().multiplyScalar(0.16);
  const mid = base.clone().multiplyScalar(0.62);
  const rgb = (value: THREE.Color, alpha = 1) => `rgba(${Math.round(value.r * 255)},${Math.round(value.g * 255)},${Math.round(value.b * 255)},${alpha})`;
  ctx.fillStyle = rgb(dark);
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  const gradient = ctx.createLinearGradient(0, 0, canvas.width, 0);
  gradient.addColorStop(0, rgb(dark));
  gradient.addColorStop(0.38, rgb(mid));
  gradient.addColorStop(0.62, rgb(base));
  gradient.addColorStop(1, rgb(dark));
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  let seed = [...id].reduce((sum, char) => (sum * 31 + char.charCodeAt(0)) >>> 0, 2166136261);
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let band = 0; band < 12; band += 1) {
    const y = (band / 12) * canvas.height + random() * 8;
    ctx.strokeStyle = rgb(random() > 0.5 ? base.clone().lerp(new THREE.Color('#ffffff'), 0.35) : dark, 0.16 + random() * 0.22);
    ctx.lineWidth = 1 + random() * 5;
    ctx.beginPath();
    ctx.moveTo(0, y);
    for (let x = 0; x <= canvas.width; x += 16) ctx.lineTo(x, y + Math.sin(x * 0.045 + band) * (2 + random() * 3));
    ctx.stroke();
  }
  for (let spot = 0; spot < 9; spot += 1) {
    ctx.fillStyle = rgb(base.clone().lerp(new THREE.Color('#ffffff'), random() * 0.28), 0.08 + random() * 0.16);
    ctx.beginPath();
    ctx.ellipse(random() * canvas.width, random() * canvas.height, 5 + random() * 20, 2 + random() * 7, random() * Math.PI, 0, Math.PI * 2);
    ctx.fill();
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.colorSpace = THREE.SRGBColorSpace;
  texture.wrapS = THREE.RepeatWrapping;
  planetTextureCache.set(key, texture);
  return texture;
}

function glowTexture(color: string): THREE.CanvasTexture {
  const cached = glowTextureCache.get(color);
  if (cached) return cached;

  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const c = new THREE.Color(color);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.floor(v * 255));
  const grad = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
  grad.addColorStop(0, `rgba(${r},${g},${b},0.95)`);
  grad.addColorStop(0.4, `rgba(${r},${g},${b},0.35)`);
  grad.addColorStop(1, `rgba(${r},${g},${b},0)`);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  glowTextureCache.set(color, tex);
  return tex;
}

function Glow({ color, scale }: { color: string; scale: number }) {
  const texture = useMemo(() => glowTexture(color), [color]);
  return (
    <sprite scale={[scale, scale, scale]}>
      <spriteMaterial
        map={texture}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        transparent
        toneMapped={false}
      />
    </sprite>
  );
}

// ── Health → colour ──────────────────────────────────────────────────────────
// One rule used everywhere so a colour always means the same thing.
function healthColor(health: number | null): string {
  if (health === null) return '#64748b';
  if (health >= 75) return '#34d399';
  if (health >= 50) return '#fbbf24';
  return '#f87171';
}

/** Position of ring slot `i` of `count`, on the sphere's equator. */
function slotPosition(i: number, count: number, radius = RING_RADIUS): THREE.Vector3 {
  const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

function departmentPosition(i: number, count: number): THREE.Vector3 {
  if (count <= 1) return new THREE.Vector3(0, 0, SPHERE_RADIUS);
  const y = 1 - (i / (count - 1)) * 2;
  const radius = Math.sqrt(Math.max(0, 1 - y * y));
  const theta = i * Math.PI * (3 - Math.sqrt(5));
  return new THREE.Vector3(Math.cos(theta) * radius, y, Math.sin(theta) * radius).multiplyScalar(SPHERE_RADIUS);
}

function dynamicDepartmentPositions(nodes: SupercycleNode[], cycles: SupercycleCycle[]): Map<string, THREE.Vector3> {
  const targets = new Map<string, THREE.Vector3[]>();
  cycles.forEach((cycle, cycleIndex) => {
    const memberIds = cycle.departmentIds.filter((id) => nodes.some((node) => node.id === id));
    const normal = new THREE.Vector3(
      Math.sin(cycleIndex * 1.71 + 0.45),
      0.55 + (cycleIndex % 2) * 0.22,
      Math.cos(cycleIndex * 1.71 + 0.45),
    ).normalize();
    const orientation = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 1, 0), normal);
    memberIds.forEach((departmentId, memberIndex) => {
      const angle = (memberIndex / Math.max(memberIds.length, 1)) * Math.PI * 2 - Math.PI / 2 + cycleIndex * 0.31;
      const target = new THREE.Vector3(Math.cos(angle), 0, Math.sin(angle)).applyQuaternion(orientation);
      const ownTargets = targets.get(departmentId) ?? [];
      ownTargets.push(target);
      targets.set(departmentId, ownTargets);
    });
  });

  return new Map(nodes.map((node, index) => {
    const memberships = targets.get(node.id);
    if (!memberships?.length) return [node.id, departmentPosition(index, nodes.length)];
    const position = memberships.reduce((sum, target) => sum.add(target), new THREE.Vector3());
    if (position.lengthSq() < 0.001) return [node.id, departmentPosition(index, nodes.length)];
    return [node.id, position.normalize().multiplyScalar(SPHERE_RADIUS)];
  }));
}

// ── The enclosing sphere ─────────────────────────────────────────────────────

function CycleSphere() {
  const guidesRef = useRef<THREE.LineSegments>(null);
  const guideGeometry = useMemo(() => {
    const vertices: number[] = [];
    const radius = SPHERE_RADIUS + 0.006;
    const segments = 96;
    const addSegment = (from: THREE.Vector3, to: THREE.Vector3) => {
      vertices.push(from.x, from.y, from.z, to.x, to.y, to.z);
    };

    [-0.72, 0, 0.72].forEach((latitude) => {
      const y = Math.sin(latitude) * radius;
      const ringRadius = Math.cos(latitude) * radius;
      for (let index = 0; index < segments; index += 1) {
        const start = (index / segments) * Math.PI * 2;
        const end = ((index + 1) / segments) * Math.PI * 2;
        addSegment(
          new THREE.Vector3(Math.cos(start) * ringRadius, y, Math.sin(start) * ringRadius),
          new THREE.Vector3(Math.cos(end) * ringRadius, y, Math.sin(end) * ringRadius),
        );
      }
    });

    for (let meridian = 0; meridian < 6; meridian += 1) {
      const longitude = (meridian / 6) * Math.PI;
      for (let index = 0; index < segments; index += 1) {
        const start = (index / segments) * Math.PI * 2;
        const end = ((index + 1) / segments) * Math.PI * 2;
        addSegment(
          new THREE.Vector3(Math.sin(start) * Math.cos(longitude) * radius, Math.cos(start) * radius, Math.sin(start) * Math.sin(longitude) * radius),
          new THREE.Vector3(Math.sin(end) * Math.cos(longitude) * radius, Math.cos(end) * radius, Math.sin(end) * Math.sin(longitude) * radius),
        );
      }
    }

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    return geometry;
  }, []);

  useFrame((_, delta) => {
    if (guidesRef.current) guidesRef.current.rotation.y += delta * 0.018;
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
        <meshBasicMaterial
          color="#4fd8ff"
          transparent
          opacity={0.025}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments ref={guidesRef} geometry={guideGeometry} raycast={() => undefined}>
        <lineBasicMaterial color="#4fd8ff" transparent opacity={0.075} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ── The cycle ring ───────────────────────────────────────────────────────────

function CycleRoute({ cycle, nodePositions, lane, selected, anotherSelected, planetActive, routeStyle, onSelect }: {
  cycle: SupercycleCycle;
  nodePositions: Map<string, THREE.Vector3>;
  lane: number;
  selected: boolean;
  anotherSelected: boolean;
  planetActive: boolean;
  routeStyle: SupercycleRouteStyle;
  onSelect: () => void;
}) {
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);
  const curve = useMemo(() => {
    const departments = cycle.departmentIds.map((id) => nodePositions.get(id)).filter((point): point is THREE.Vector3 => Boolean(point));
    if (departments.length < 2) return null;
    const routeRadius = SPHERE_RADIUS + 0.018 + lane * 0.008;
    if (routeStyle === 'spherical') {
      let points = departments.map((point) => point.clone());
      if (points.length === 2) {
        const perpendicular = points[0].clone().cross(points[1]);
        if (perpendicular.lengthSq() < 0.001) perpendicular.set(points[0].z, points[0].x, points[0].y);
        perpendicular.normalize().multiplyScalar(SPHERE_RADIUS);
        points = [points[0], perpendicular, points[1], perpendicular.clone().negate()];
      }
      const path = new THREE.CurvePath<THREE.Vector3>();
      const laneBulge = 0.018 + lane * 0.016;
      points.forEach((point, index) => path.add(new SphericalArcCurve(point, points[(index + 1) % points.length], laneBulge)));
      return path;
    }
    if (departments.length === 2) {
      const perpendicular = departments[0].clone().cross(departments[1]);
      if (perpendicular.lengthSq() < 0.001) perpendicular.set(departments[0].z, departments[0].x, departments[0].y);
      perpendicular.normalize().multiplyScalar(routeRadius + 0.05);
      return new THREE.CatmullRomCurve3([
        departments[0].clone(), perpendicular, departments[1].clone(), perpendicular.clone().negate(),
      ], true, 'centripetal', 0.3);
    }
    const points: THREE.Vector3[] = [];
    departments.forEach((point, index) => {
      const next = departments[(index + 1) % departments.length];
      points.push(point.clone());
      const midpoint = point.clone().add(next);
      if (midpoint.lengthSq() < 0.001) midpoint.set(point.z, point.x, point.y);
      points.push(midpoint.normalize().multiplyScalar(routeRadius + 0.025));
    });
    return new THREE.CatmullRomCurve3(points, true, 'centripetal', 0.3);
  }, [cycle.departmentIds, lane, nodePositions, routeStyle]);

  const opacity = planetActive ? 0.045 : selected ? 1 : anotherSelected ? 0.055 : 0.52;

  useFrame((_, delta) => {
    if (materialRef.current) {
      materialRef.current.opacity = THREE.MathUtils.damp(materialRef.current.opacity, opacity, 8, delta);
    }
  });

  if (!curve) return null;
  return (
    <group>
      <mesh>
        <tubeGeometry args={[curve, 160, selected ? 0.012 : 0.007, 8, true]} />
        <meshBasicMaterial ref={materialRef} color={cycle.color} transparent opacity={opacity} depthWrite={false} toneMapped={false} />
      </mesh>
      <mesh
        onClick={(event) => { event.stopPropagation(); onSelect(); }}
        onPointerOver={(event) => { event.stopPropagation(); document.body.style.cursor = 'pointer'; }}
        onPointerOut={(event) => { event.stopPropagation(); document.body.style.cursor = 'auto'; }}
      >
        <tubeGeometry args={[curve, 128, 0.04, 6, true]} />
        <meshBasicMaterial transparent opacity={0} depthWrite={false} />
      </mesh>
    </group>
  );
}

// ── A department node on the ring ────────────────────────────────────────────

function CycleNode({
  node,
  position,
  health,
  dimmed,
  selected,
  onSelect,
}: {
  node: SupercycleNode;
  position: THREE.Vector3;
  health: number | null;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const positionRef = useRef<THREE.Group>(null);
  const surfaceRef = useRef<THREE.Mesh>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    pulseRef.current += delta;
    if (surfaceRef.current) surfaceRef.current.rotation.y += delta * (selected ? 0.28 : 0.055);
    const group = groupRef.current;
    if (!group) return;
    const target = selected ? 1.45 : dimmed ? 0.75 : 1;
    const breathe = 1 + Math.sin(pulseRef.current * 1.4) * 0.04;
    const next = THREE.MathUtils.lerp(group.scale.x, target * breathe, 0.12);
    group.scale.setScalar(next);
    if (positionRef.current) {
      positionRef.current.position.x = THREE.MathUtils.damp(positionRef.current.position.x, position.x, 5.5, delta);
      positionRef.current.position.y = THREE.MathUtils.damp(positionRef.current.position.y, position.y, 5.5, delta);
      positionRef.current.position.z = THREE.MathUtils.damp(positionRef.current.position.z, position.z, 5.5, delta);
    }
  });

  const opacity = dimmed ? 0.25 : 1;
  const surface = useMemo(() => planetTexture(node.id, node.color), [node.id, node.color]);

  return (
    <group ref={positionRef} position={position}>
      <group
        ref={groupRef}
        onClick={(e) => {
          e.stopPropagation();
          onSelect();
        }}
        onPointerOver={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
        }}
        onPointerOut={(e) => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
        }}
      >
        <mesh ref={surfaceRef}>
          <sphereGeometry args={[NODE_RADIUS, 40, 28]} />
          <meshBasicMaterial map={surface} color="#ffffff" transparent opacity={opacity} toneMapped={false} />
        </mesh>
        <mesh raycast={() => undefined}>
          <sphereGeometry args={[NODE_RADIUS * 1.09, 32, 24]} />
          <meshBasicMaterial color={node.color} transparent opacity={dimmed ? 0.025 : 0.12} side={THREE.BackSide} blending={THREE.AdditiveBlending} depthWrite={false} toneMapped={false} />
        </mesh>
        <Glow color={node.color} scale={NODE_RADIUS * (dimmed ? 4.5 : selected ? 10 : 7.5)} />
        {!selected && (
          <mesh rotation={[Math.PI / 2, 0, 0]} raycast={() => undefined}>
            <torusGeometry args={[NODE_RADIUS * 2.08, 0.005, 8, 96]} />
            <meshBasicMaterial color={node.color} transparent opacity={dimmed ? 0.04 : 0.28} depthWrite={false} toneMapped={false} />
          </mesh>
        )}
      </group>

      <Billboard position={[0, NODE_RADIUS * 2.9, 0]}>
        <Text
          fontSize={0.088}
          color={dimmed ? '#5b6b86' : '#e7edf7'}
          anchorX="center"
          anchorY="middle"
          outlineWidth={0.004}
          outlineColor="#05070f"
        >
          {node.label}
        </Text>
      </Billboard>
      {!dimmed && (
        <Billboard position={[0, NODE_RADIUS * 2.9 - 0.1, 0]}>
          <Text fontSize={0.055} color={healthColor(health)} anchorX="center" anchorY="middle">
            {health === null ? 'No execution' : `${health}%`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// ── The supercycle-specific execution hypercube ─────────────────────────────

function SupercycleCore({ health, archetype, overviewMuted }: { health: number | null; archetype: SupercycleArchetype; overviewMuted: boolean }) {
  const cubeRef = useRef<THREE.Group>(null);

  useFrame((_, delta) => {
    if (!cubeRef.current) return;
    cubeRef.current.rotation.x += delta * 0.07;
    cubeRef.current.rotation.y += delta * 0.11;
  });

  return (
    <group>
      <group ref={cubeRef}>
        <Glow color={healthColor(health)} scale={1.15} />
        <group scale={0.012}>
          <NewPmsHypercubeModel interactive={false} overviewMuted={overviewMuted} />
        </group>
      </group>
      <Billboard position={[0, -0.34, 0]}>
        <Text fontSize={0.075} color="#e7edf7" anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#05070f">
          {archetype.label} Hypercube
        </Text>
      </Billboard>
      <Billboard position={[0, -0.44, 0]}>
        <Text fontSize={0.05} color={healthColor(health)} anchorX="center" anchorY="middle">
          {health === null ? 'No execution linked' : `${health}% health`}
        </Text>
      </Billboard>
    </group>
  );
}

// ── Sub-cycle track (a node opened) ──────────────────────────────────────────

/**
 * The opened node's workflow, as a closed track of stage stations with live
 * instances parked on whichever stage they've reached. This is the level a
 * manager actually reads: "where is our revenue stuck right now".
 */
function SubCycleTrack({
  node,
  instances,
  onOpenInstance,
  open,
}: {
  node: SupercycleNode;
  instances: SupercycleInstance[];
  onOpenInstance: (instance: SupercycleInstance) => void;
  open: boolean;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const contentsRef = useRef<THREE.Group>(null);
  const stages = node.subCycle.stages;
  const trackRadius = 0.72;
  const collapsedScale = (NODE_RADIUS * 2.08) / trackRadius;

  const torusGeometry = useMemo(
    () => new THREE.TorusGeometry(trackRadius, 0.005, 8, 96),
    [],
  );

  useFrame((_, delta) => {
    if (!groupRef.current) return;
    const target = open ? 1 : collapsedScale;
    const next = THREE.MathUtils.damp(groupRef.current.scale.x, target, 7, delta);
    groupRef.current.scale.setScalar(next);
    groupRef.current.visible = open || next > collapsedScale + 0.006;
    if (contentsRef.current) {
      contentsRef.current.visible = open && next > collapsedScale + 0.08;
    }
  });

  return (
    <group ref={groupRef} scale={collapsedScale}>
      <mesh geometry={torusGeometry} rotation={[Math.PI / 2, 0, 0]}>
        <meshBasicMaterial color={node.color} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
      </mesh>

      <group ref={contentsRef} visible={false}>
        {stages.map((stage, i) => {
          const pos = slotPosition(i, stages.length, trackRadius);
          return (
            <group key={stage} position={pos}>
              <mesh>
                <sphereGeometry args={[0.035, 16, 16]} />
                <meshBasicMaterial color={node.color} toneMapped={false} />
              </mesh>
              <Glow color={node.color} scale={0.22} />
              <Billboard position={[0, 0.11, 0]}>
                <Text
                  fontSize={0.05}
                  color="#cfd8e8"
                  anchorX="center"
                  anchorY="middle"
                  outlineWidth={0.003}
                  outlineColor="#05070f"
                >
                  {stage}
                </Text>
              </Billboard>
            </group>
          );
        })}

      {/* Live instances parked on their current stage. Several on the same
          stage are fanned outward so they don't occupy the same point. */}
        {instances.map((instance) => {
        const sameStage = instances.filter((i) => i.stageIndex === instance.stageIndex);
        const orderInStage = sameStage.indexOf(instance);
        const fan = trackRadius + 0.13 + orderInStage * 0.1;
        const pos = slotPosition(instance.stageIndex, stages.length, fan);
        return (
          <group key={instance.id} position={pos}>
            <mesh
              onClick={(e) => {
                e.stopPropagation();
                onOpenInstance(instance);
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={(e) => {
                e.stopPropagation();
                document.body.style.cursor = 'auto';
              }}
            >
              <boxGeometry args={[0.055, 0.055, 0.055]} />
              <meshBasicMaterial color={healthColor(instance.health)} toneMapped={false} />
            </mesh>
            <Glow color={healthColor(instance.health)} scale={0.2} />
            <Billboard position={[0, -0.075, 0]}>
              <Text
                fontSize={0.04}
                color="#8b96ab"
                anchorX="center"
                anchorY="middle"
                outlineWidth={0.003}
                outlineColor="#05070f"
              >
                {instance.label}
              </Text>
            </Billboard>
          </group>
        );
        })}
      </group>
    </group>
  );
}

// ── Scene root ───────────────────────────────────────────────────────────────

export type SupercycleSceneProps = {
  archetype: SupercycleArchetype;
  instances: SupercycleInstance[];
  selectedNodeId: string | null;
  onSelectNode: (nodeId: string | null) => void;
  onOpenInstance: (instance: SupercycleInstance) => void;
  cycles: SupercycleCycle[];
  selectedCycleId: string | null;
  onSelectCycle: (cycleId: string | null) => void;
  routeStyle: SupercycleRouteStyle;
  /** 0 while diving in, 1 once arrived — fades the whole thing in with the dive. */
  visibility?: number;
};

export function SupercycleScene({
  archetype,
  instances,
  selectedNodeId,
  onSelectNode,
  onOpenInstance,
  cycles,
  selectedCycleId,
  onSelectCycle,
  routeStyle,
}: SupercycleSceneProps) {
  const contentRef = useRef<THREE.Group>(null);
  const [displayedNodeId, setDisplayedNodeId] = useState<string | null>(selectedNodeId);
  const nodes = archetype.nodes;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const displayedNode = nodes.find((n) => n.id === displayedNodeId) ?? null;
  const selectedIndex = selectedNode ? nodes.findIndex((n) => n.id === selectedNode.id) : -1;
  const displayedIndex = displayedNode ? nodes.findIndex((n) => n.id === displayedNode.id) : -1;
  const nodePositions = useMemo(() => dynamicDepartmentPositions(nodes, cycles), [nodes, cycles]);
  const selectedPosition = selectedIndex >= 0 ? nodePositions.get(selectedNode!.id) ?? null : null;
  const displayedPosition = displayedIndex >= 0 ? nodePositions.get(displayedNode!.id) ?? null : null;
  const selectedCycle = cycles.find((cycle) => cycle.id === selectedCycleId) ?? null;
  const health = useMemo(() => supercycleHealth(nodes, instances), [nodes, instances]);

  useEffect(() => {
    if (selectedNodeId) setDisplayedNodeId(selectedNodeId);
  }, [selectedNodeId]);

  useFrame((_, delta) => {
    const content = contentRef.current;
    if (!content) return;
    const targetScale = selectedPosition ? 1.9 : 1;
    const nextScale = THREE.MathUtils.damp(content.scale.x, targetScale, 4.8, delta);
    content.scale.setScalar(nextScale);

    const targetPosition = selectedPosition
      ? selectedPosition.clone().multiplyScalar(-targetScale)
      : new THREE.Vector3();
    content.position.x = THREE.MathUtils.damp(content.position.x, targetPosition.x, 4.8, delta);
    content.position.y = THREE.MathUtils.damp(content.position.y, targetPosition.y, 4.8, delta);
    content.position.z = THREE.MathUtils.damp(content.position.z, targetPosition.z, 4.8, delta);
  });

  return (
    <group ref={contentRef}>
      <CycleSphere />
      {cycles.map((cycle, index) => (
        <CycleRoute
          key={cycle.id}
          cycle={cycle}
          nodePositions={nodePositions}
          lane={index}
          selected={selectedCycleId === cycle.id}
          anotherSelected={selectedCycleId !== null && selectedCycleId !== cycle.id}
          planetActive={selectedNode !== null}
          routeStyle={routeStyle}
          onSelect={() => onSelectCycle(selectedCycleId === cycle.id ? null : cycle.id)}
        />
      ))}
      <SupercycleCore
        health={health}
        archetype={archetype}
        overviewMuted={selectedCycleId === null && selectedNode === null}
      />

      {nodes.map((n, i) => (
        <CycleNode
          key={n.id}
          node={n}
          position={nodePositions.get(n.id) ?? departmentPosition(i, nodes.length)}
          health={nodeHealth(n.id, instances)}
          dimmed={(selectedNode !== null && selectedNode.id !== n.id) || (selectedCycle !== null && !selectedCycle.departmentIds.includes(n.id))}
          selected={selectedNode?.id === n.id}
          onSelect={() => onSelectNode(selectedNode?.id === n.id ? null : n.id)}
        />
      ))}

      {displayedNode && displayedPosition && (
        <group position={displayedPosition}>
          <SubCycleTrack
            node={displayedNode}
            instances={instances.filter((i) => i.nodeId === displayedNode.id)}
            onOpenInstance={onOpenInstance}
            open={selectedNode?.id === displayedNode.id}
          />
        </group>
      )}
    </group>
  );
}

export default SupercycleScene;
