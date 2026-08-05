import { useRef, useMemo, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Html } from '@react-three/drei';
import * as THREE from 'three';
import type { UExternalNode, UInternalNode } from '../../lib/universalPolytopeData';
import { PlasmaSphere } from '../PolytopeShared';
import { GlowRing } from './GlowRing';
import { InternalNode } from './InternalNode';
import { computeInternalNodePosition } from './internalNodeLayout';

interface ExternalNodeProps {
  node: UExternalNode;
  pos: THREE.Vector3;
  isSelected: boolean;
  isDimmed: boolean;
  onClick: () => void;
  color: string;
  selectedInternalPath: string[];
  onSelectInternal: (path: string[], pos: THREE.Vector3) => void;
  setBackInfo: (info: { label: string; onClick: () => void } | null) => void;
  isDeepDrillDown: boolean;
  onHover: (id: string | null) => void;
  idx: number;
  isHovered: boolean;
  /** Preview node while "Add internal node" form is open */
  draftChildNode?: UInternalNode | null;
  draftMember?: { deptId: string; nodeId: string; member?: any } | null;
  draftMemberScreenPosRef?: React.MutableRefObject<{ x: number; y: number } | null>;
  /** Extra hold before a freshly revealed ring unfolds, so the camera lands first. */
  entryLeadInMs?: number;
  /** Per-slot offset so ring nodes appear one after another rather than at once. */
  entryStaggerMs?: number;
  /**
   * Continuous depth cueing driven by the node's true world position: nodes
   * swinging toward the camera brighten, grow and surface their label; nodes
   * swinging behind the hull dim and fade out.
   */
  depthCue?: boolean;
}

/**
 * Facing is cos(angle) between the node and the camera, so 0 is the hull's
 * silhouette edge. Ramping symmetrically about 0 puts a node at half strength
 * as it crosses the limb and spreads the fade across the whole sweep, rather
 * than snapping over a few degrees.
 */
const DEPTH_CUE_BACK = -0.45;
const DEPTH_CUE_FRONT = 0.45;

export function ExternalNode({
  node,
  pos,
  isSelected,
  isDimmed,
  onClick,
  color,
  selectedInternalPath,
  onSelectInternal,
  setBackInfo,
  isDeepDrillDown,
  onHover,
  idx,
  isHovered: _isHovered,
  draftChildNode,
  draftMember,
  draftMemberScreenPosRef,
  entryLeadInMs = 0,
  entryStaggerMs = 0,
  depthCue = false,
}: ExternalNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const linesMaterialRef = useRef<THREE.LineBasicMaterial>(null);

  const fullLabel = node.label;
  const shortLabel = fullLabel.split(/[\s_\-]/)[0] || fullLabel;

  const ringNodes = node.internalNodes;

  const internalPositions = useMemo(() => {
    const isDraftAtRoot = selectedInternalPath.length === 0;
    const count = ringNodes.length + (draftChildNode && isDraftAtRoot ? 1 : 0);
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < ringNodes.length; i++) {
      pts.push(computeInternalNodePosition(pos, i, count));
    }
    if (draftChildNode && isDraftAtRoot) {
      pts.push(computeInternalNodePosition(pos, ringNodes.length, count));
    }
    return pts;
  }, [ringNodes.length, draftChildNode, pos, selectedInternalPath]);

  const internalEdgesGeometry = useMemo(() => {
    if (internalPositions.length === 0) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < internalPositions.length; i++) {
      pts.push(internalPositions[i].clone());
      pts.push(internalPositions[(i + 1) % internalPositions.length].clone());
      pts.push(internalPositions[i].clone());
      pts.push(pos.clone());
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [internalPositions, pos]);

  const isFrontRef = useRef(true);
  const [isFront, setIsFront] = useState(true);

  /** Live depth-cue values, written every frame and read by the shader materials. */
  const sphereOpacityRef = useRef(1);
  const sphereGlowRef = useRef(1.2);
  const ringOpacityRef = useRef(0.4);
  const worldPosRef = useRef(new THREE.Vector3());
  const scaleTargetRef = useRef(new THREE.Vector3());

  useFrame(state => {
    // `pos` is hull-local. While the hull spins, the node's world position moves
    // but `pos` does not — so dotting the camera against `pos` reports the same
    // facing forever and every node stays lit. Read the real world position.
    if (meshRef.current) meshRef.current.getWorldPosition(worldPosRef.current);
    else worldPosRef.current.copy(pos);
    const worldPos = worldPosRef.current;

    let front01 = 1;
    let front: boolean;
    if (depthCue) {
      const nodeLen = worldPos.length();
      const camLen = state.camera.position.length();
      const facing = nodeLen > 1e-4 && camLen > 1e-4
        ? worldPos.dot(state.camera.position) / (nodeLen * camLen)
        : 1;
      front01 = THREE.MathUtils.smoothstep(facing, DEPTH_CUE_BACK, DEPTH_CUE_FRONT);
      front = front01 > 0.5;
    } else {
      front = state.camera.position.dot(pos) > 0.05;
    }

    if (isFrontRef.current !== front) {
      isFrontRef.current = front;
      setIsFront(front);
    }

    if (depthCue) {
      const dimmedAway = isDimmed && !isSelected;
      sphereOpacityRef.current = isSelected
        ? 1.0
        : (dimmedAway ? 0.08 : 1.0) * THREE.MathUtils.lerp(0.14, 1.0, front01);
      sphereGlowRef.current = isSelected
        ? 2.5
        : _isHovered ? 1.8 : THREE.MathUtils.lerp(0.45, 1.35, front01);
      ringOpacityRef.current = isSelected
        ? 0.8
        : dimmedAway ? 0.0 : THREE.MathUtils.lerp(0.0, 0.45, front01);
    }

    if (meshRef.current) {
      const targetScale = isSelected
        ? isDeepDrillDown ? 0.0 : 1.5
        : depthCue
          // Nodes swinging toward the camera overshoot slightly so they read as
          // popping forward rather than merely brightening.
          ? (isDimmed ? 0.6 : 1.0) * THREE.MathUtils.lerp(0.55, 1.08, front01)
          : isDimmed || !front ? 0.6 : 1.0;
      meshRef.current.scale.lerp(
        scaleTargetRef.current.setScalar(targetScale),
        0.1
      );
    }
    if (labelRef.current) {
      if (depthCue) {
        const labelOpacity = isSelected
          ? 1
          : isDimmed ? 0 : Math.pow(front01, 1.4);
        labelRef.current.style.opacity = labelOpacity.toFixed(3);
        labelRef.current.style.pointerEvents = labelOpacity > 0.45 ? 'auto' : 'none';
        labelRef.current.style.transform = `scale(${(0.86 + 0.14 * front01).toFixed(3)})`;
      } else {
        labelRef.current.style.opacity = front || isSelected ? '1' : '0';
      }
      const dist = state.camera.position.distanceTo(depthCue ? worldPos : pos);
      const isClose = dist < 15;
      const newText = isSelected || isClose ? fullLabel : shortLabel;
      if (labelRef.current.innerText !== newText) labelRef.current.innerText = newText;
    }
    if (linesMaterialRef.current) {
      const targetOpacity = isSelected && !isDeepDrillDown ? 0.7 : 0;
      linesMaterialRef.current.opacity = THREE.MathUtils.lerp(
        linesMaterialRef.current.opacity,
        targetOpacity,
        0.05
      );
    }
  });

  if (node.domain === 'inactive') return null;

  return (
    <group>
      <group position={pos}>
        <GlowRing
          color={color}
          active={depthCue ? true : !isDimmed && isFront}
          isSelected={isSelected}
          idx={idx}
          opacityRef={depthCue ? ringOpacityRef : undefined}
        />
      </group>
      <group
        ref={meshRef}
        position={pos}
        onClick={e => {
          if (!isFrontRef.current && !isSelected) return;
          e.stopPropagation();
          onClick();
        }}
        onPointerOver={e => {
          if (!isFrontRef.current && !isSelected) return;
          e.stopPropagation();
          document.body.style.cursor = 'pointer';
          onHover(node.id);
        }}
        onPointerOut={e => {
          e.stopPropagation();
          document.body.style.cursor = 'auto';
          onHover(null);
        }}
      >
        <PlasmaSphere
          color={color}
          radius={0.22}
          opacity={!isFront && !isSelected ? 0.15 : isDimmed ? 0.08 : 1.0}
          glowIntensity={isSelected ? 2.5 : _isHovered ? 1.8 : 1.2}
          depthWrite={!isDimmed && isFront}
          speed={1.5}
          // Depth cueing keeps the halo mounted and rides its opacity instead,
          // so the bloom grows in rather than blinking on at the halfway point.
          halo={depthCue ? true : isFront || isSelected}
          opacityRef={depthCue ? sphereOpacityRef : undefined}
          glowIntensityRef={depthCue ? sphereGlowRef : undefined}
        />
      </group>

      {/* Depth cueing keeps the label mounted so it can fade with the node;
          unmounting at the halfway point is what made labels blink in and out. */}
      {(depthCue ? !isDeepDrillDown : (!isDimmed || isSelected) && isFront && !isDeepDrillDown) && (
        <Html position={[pos.x, pos.y - 1.2, pos.z]} center zIndexRange={[100, 0]}>
          <div
            ref={labelRef}
            onClick={e => {
              if (!isFrontRef.current && !isSelected) return;
              e.stopPropagation();
              onClick();
            }}
            onPointerOver={e => {
              if (!isFrontRef.current && !isSelected) return;
              e.stopPropagation();
              document.body.style.cursor = 'pointer';
              onHover(node.id);
            }}
            onPointerOut={e => {
              e.stopPropagation();
              document.body.style.cursor = 'auto';
              onHover(null);
            }}
            style={{
              color: 'white',
              background: 'rgba(0,0,0,0.6)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: `1px solid ${color}40`,
              pointerEvents: isFront || isSelected ? 'auto' : 'none',
              cursor: isFront ? 'pointer' : 'default',
              whiteSpace: 'nowrap',
              // Depth cueing writes opacity every frame; a CSS transition on top
              // of that would fight the per-frame value and smear it.
              transition: depthCue ? 'none' : 'opacity 0.2s',
              ...(depthCue ? { willChange: 'opacity, transform' } : null),
            }}
          >
            {node.label}
          </div>
        </Html>
      )}

      {internalEdgesGeometry && isSelected && (
        <lineSegments geometry={internalEdgesGeometry}>
          <lineBasicMaterial
            ref={linesMaterialRef}
            color={color}
            transparent
            opacity={0}
            depthWrite={false}
          />
        </lineSegments>
      )}

      {isSelected && ringNodes.map((intNode, i) => {
        const pathRootId = selectedInternalPath[0];
        const pathMatchesDept =
          selectedInternalPath.length === 0 ||
          ringNodes.some(n => n.id === pathRootId);
        const isChildVisible =
          !pathMatchesDept ||
          selectedInternalPath.length === 0 ||
          selectedInternalPath[selectedInternalPath.length - 1] === intNode.id;
        return (
          <InternalNode
            key={intNode.id}
            node={intNode}
            targetPos={internalPositions[i]}
            startPos={pos}
            color={color}
            depth={1}
            selectedPath={selectedInternalPath}
            onSelectPath={onSelectInternal}
            pathContext={[]}
            parentPos={pos}
            isVisible={isChildVisible}
            parentLabel={node.label}
            setBackInfo={setBackInfo}
            draftChildNode={draftChildNode}
            draftMember={draftMember}
            draftMemberScreenPosRef={draftMemberScreenPosRef}
            entryIndex={i}
            entryLeadInMs={entryLeadInMs}
            entryStaggerMs={entryStaggerMs}
          />
        );
      })}

      {isSelected && draftChildNode && selectedInternalPath.length === 0 && (
        <InternalNode
          key={draftChildNode.id}
          node={draftChildNode}
          targetPos={internalPositions[internalPositions.length - 1]}
          startPos={pos}
          color={color}
          depth={1}
          selectedPath={selectedInternalPath}
          onSelectPath={onSelectInternal}
          pathContext={[]}
          parentPos={pos}
          isVisible={true}
          parentLabel={node.label}
          setBackInfo={setBackInfo}
          isDraft
        />
      )}

    </group>
  );
}
