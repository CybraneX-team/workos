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
import {
  nodeHealth,
  supercycleHealth,
  SUPERCYCLE_LABEL,
  type SupercycleArchetype,
  type SupercycleInstance,
  type SupercycleNode,
} from '../../lib/supercycleData';

const SPHERE_RADIUS = 1.55;
const RING_RADIUS = 1.15;
const NODE_RADIUS = 0.115;

// ── Additive glow sprite ─────────────────────────────────────────────────────
// A radial-gradient canvas texture blended additively. Works here because the
// polytope scene is on black; additive blending adds toward white and would
// contribute nothing on a light background.

const glowTextureCache = new Map<string, THREE.CanvasTexture>();

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
function healthColor(health: number): string {
  if (health >= 75) return '#34d399';
  if (health >= 50) return '#fbbf24';
  return '#f87171';
}

/** Position of ring slot `i` of `count`, on the sphere's equator. */
function slotPosition(i: number, count: number, radius = RING_RADIUS): THREE.Vector3 {
  const angle = (i / count) * Math.PI * 2 - Math.PI / 2;
  return new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius);
}

// ── The enclosing sphere ─────────────────────────────────────────────────────

function CycleSphere() {
  const wireRef = useRef<THREE.LineSegments>(null);

  const wireGeometry = useMemo(
    () => new THREE.EdgesGeometry(new THREE.SphereGeometry(SPHERE_RADIUS, 24, 16), 1),
    [],
  );

  // A slow drift so the shell reads as a living boundary rather than a decal.
  useFrame((_, delta) => {
    if (wireRef.current) wireRef.current.rotation.y += delta * 0.03;
  });

  return (
    <group>
      <mesh>
        <sphereGeometry args={[SPHERE_RADIUS, 48, 32]} />
        <meshBasicMaterial
          color="#4fd8ff"
          transparent
          opacity={0.035}
          side={THREE.BackSide}
          depthWrite={false}
          toneMapped={false}
        />
      </mesh>
      <lineSegments ref={wireRef} geometry={wireGeometry}>
        <lineBasicMaterial color="#4fd8ff" transparent opacity={0.12} depthWrite={false} toneMapped={false} />
      </lineSegments>
    </group>
  );
}

// ── The cycle ring ───────────────────────────────────────────────────────────

function CycleFlow({ dimmed }: { dimmed: boolean }) {
  const torusGeometry = useMemo(
    () => new THREE.TorusGeometry(RING_RADIUS, 0.006, 8, 128),
    [],
  );

  return (
    <mesh geometry={torusGeometry} rotation={[Math.PI / 2, 0, 0]}>
      <meshBasicMaterial
        color="#4fd8ff"
        transparent
        opacity={dimmed ? 0.12 : 0.4}
        depthWrite={false}
        toneMapped={false}
      />
    </mesh>
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
  health: number;
  dimmed: boolean;
  selected: boolean;
  onSelect: () => void;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const pulseRef = useRef(0);

  useFrame((_, delta) => {
    pulseRef.current += delta;
    const group = groupRef.current;
    if (!group) return;
    const target = selected ? 1.45 : dimmed ? 0.75 : 1;
    const breathe = 1 + Math.sin(pulseRef.current * 1.4) * 0.04;
    const next = THREE.MathUtils.lerp(group.scale.x, target * breathe, 0.12);
    group.scale.setScalar(next);
  });

  const opacity = dimmed ? 0.25 : 1;

  return (
    <group position={position}>
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
        <mesh>
          <sphereGeometry args={[NODE_RADIUS, 24, 24]} />
          <meshBasicMaterial color={node.color} transparent opacity={opacity} toneMapped={false} />
        </mesh>
        <Glow color={node.color} scale={NODE_RADIUS * (dimmed ? 5 : 8)} />
        {!selected && (
          <mesh rotation={[Math.PI / 2, 0, 0]}>
            <torusGeometry args={[NODE_RADIUS * 1.7, 0.008, 8, 32]} />
            <meshBasicMaterial
              color={healthColor(health)}
              transparent
              opacity={opacity}
              depthWrite={false}
              toneMapped={false}
            />
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
            {`${health}%`}
          </Text>
        </Billboard>
      )}
    </group>
  );
}

// ── The core nucleus ─────────────────────────────────────────────────────────

function SupercycleCore({ health }: { health: number }) {
  const glowRef = useRef<THREE.Group>(null);
  const timeRef = useRef(0);

  useFrame((_, delta) => {
    timeRef.current += delta;
    if (glowRef.current) {
      const s = 1 + Math.sin(timeRef.current * 1.1) * 0.08;
      glowRef.current.scale.setScalar(s);
    }
  });

  return (
    <group>
      <group ref={glowRef}>
        <Glow color={healthColor(health)} scale={1.5} />
      </group>
      <mesh>
        <sphereGeometry args={[0.075, 32, 32]} />
        <meshBasicMaterial color="#ffffff" toneMapped={false} />
      </mesh>
      <Billboard position={[0, -0.26, 0]}>
        <Text fontSize={0.075} color="#e7edf7" anchorX="center" anchorY="middle" outlineWidth={0.004} outlineColor="#05070f">
          {SUPERCYCLE_LABEL}
        </Text>
      </Billboard>
      <Billboard position={[0, -0.36, 0]}>
        <Text fontSize={0.05} color={healthColor(health)} anchorX="center" anchorY="middle">
          {`${health}% health`}
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
  health,
}: {
  node: SupercycleNode;
  instances: SupercycleInstance[];
  onOpenInstance: (instance: SupercycleInstance) => void;
  open: boolean;
  health: number;
}) {
  const groupRef = useRef<THREE.Group>(null);
  const contentsRef = useRef<THREE.Group>(null);
  const stages = node.subCycle.stages;
  const trackRadius = 0.72;
  const collapsedScale = (NODE_RADIUS * 1.7) / trackRadius;

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
        <meshBasicMaterial color={healthColor(health)} transparent opacity={0.8} depthWrite={false} toneMapped={false} />
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
  /** 0 while diving in, 1 once arrived — fades the whole thing in with the dive. */
  visibility?: number;
};

export function SupercycleScene({
  archetype,
  instances,
  selectedNodeId,
  onSelectNode,
  onOpenInstance,
}: SupercycleSceneProps) {
  const contentRef = useRef<THREE.Group>(null);
  const [displayedNodeId, setDisplayedNodeId] = useState<string | null>(selectedNodeId);
  const nodes = archetype.nodes;
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;
  const displayedNode = nodes.find((n) => n.id === displayedNodeId) ?? null;
  const selectedIndex = selectedNode ? nodes.findIndex((n) => n.id === selectedNode.id) : -1;
  const displayedIndex = displayedNode ? nodes.findIndex((n) => n.id === displayedNode.id) : -1;
  const selectedPosition = selectedIndex >= 0 ? slotPosition(selectedIndex, nodes.length) : null;
  const displayedPosition = displayedIndex >= 0 ? slotPosition(displayedIndex, nodes.length) : null;
  const health = useMemo(() => supercycleHealth(nodes, instances), [nodes, instances]);

  useEffect(() => {
    if (selectedNodeId) setDisplayedNodeId(selectedNodeId);
  }, [selectedNodeId]);

  useFrame((_, delta) => {
    const content = contentRef.current;
    if (!content) return;
    const targetScale = selectedPosition ? 1.5 : 1;
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
      <CycleFlow dimmed={selectedNode !== null} />
      {selectedNode === null && <SupercycleCore health={health} />}

      {nodes.map((n, i) => (
        <CycleNode
          key={n.id}
          node={n}
          position={slotPosition(i, nodes.length)}
          health={nodeHealth(n.id, instances)}
          dimmed={selectedNode !== null && selectedNode.id !== n.id}
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
            health={nodeHealth(displayedNode.id, instances)}
          />
        </group>
      )}
    </group>
  );
}

export default SupercycleScene;
