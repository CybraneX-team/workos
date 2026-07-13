import { useRef, useMemo } from 'react';
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
}

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
  isHovered,
  draftChildNode,
  draftMember,
  draftMemberScreenPosRef,
}: ExternalNodeProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const labelRef = useRef<HTMLDivElement>(null);
  const linesMaterialRef = useRef<THREE.LineBasicMaterial>(null);

  const fullLabel = node.label;
  const shortLabel = fullLabel.split(/[\s_\-]/)[0] || fullLabel;

  const level1Nodes = node.internalNodes.filter(n => n.nodeLevel === 'level1');
  const ringNodes = level1Nodes.length > 0 ? level1Nodes : node.internalNodes;

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

  useFrame(state => {
    if (meshRef.current) {
      const targetScale = isSelected
        ? isDeepDrillDown ? 0.0 : 1.5
        : isDimmed ? 0.6 : 1.0;
      meshRef.current.scale.lerp(
        new THREE.Vector3(targetScale, targetScale, targetScale),
        0.1
      );
    }
    if (labelRef.current) {
      const isFront = state.camera.position.dot(pos) > 0;
      labelRef.current.style.opacity = isFront ? '1' : '0';
      const dist = state.camera.position.distanceTo(pos);
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
        <GlowRing color={color} active={!isDimmed} isSelected={isSelected} idx={idx} />
      </group>
      <group
        ref={meshRef}
        position={pos}
        onClick={e => { e.stopPropagation(); onClick(); }}
        onPointerOver={e => {
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
          opacity={isDimmed ? 0.08 : 1.0}
          glowIntensity={isSelected ? 2.5 : isHovered ? 1.8 : 1.2}
          depthWrite={!isDimmed}
          speed={1.5}
        />
      </group>

      {(!isDimmed || isSelected) && !isDeepDrillDown && (
        <Html position={[pos.x, pos.y - 1.2, pos.z]} center zIndexRange={[100, 0]}>
          <div
            ref={labelRef}
            style={{
              color: 'white',
              background: 'rgba(0,0,0,0.6)',
              padding: '4px 8px',
              borderRadius: '4px',
              fontSize: '12px',
              fontWeight: 'bold',
              backdropFilter: 'blur(4px)',
              border: `1px solid ${color}40`,
              pointerEvents: 'none',
              whiteSpace: 'nowrap',
              transition: 'opacity 0.2s',
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
            // Real BDT departments (loaded via /api/departments) always set sourceKey; the
            // legacy Twin-scope seed (universalPolytopeData.ts) never does — leaving this
            // undefined there is what correctly excludes Twin from gating (see isBdtNodeActive).
            departmentSourceKey={node.sourceKey}
            branchLabel={undefined}
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
