import { useRef, useMemo, useEffect, useState } from 'react';
import { useFrame } from '@react-three/fiber';
import { Text, Billboard, Html } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import type { UInternalNode } from '../../lib/universalPolytopeData';
import { isActionLeafNode, isBdtWorkspaceLeafNode } from '../../lib/universalPolytopeData';
import { isBdtNodeActive } from '../../lib/bdtPolytopeData';
import { PlasmaSphere } from '../PolytopeShared';
import { useDragWorkspaceStore } from '../../lib/useDragWorkspaceStore';
import { usePolytopeStore } from '../../lib/usePolytopeStore';

// DraggableHtmlCard removed per page feedback.

function PosTracker({ posRef }: { posRef: React.MutableRefObject<any> }) {
  const ref = useRef<THREE.Group>(null);
  useFrame(({ camera, gl }) => {
    if (ref.current && posRef) {
      const wp = new THREE.Vector3();
      ref.current.getWorldPosition(wp);
      wp.project(camera);
      const rect = gl.domElement.getBoundingClientRect();
      posRef.current = {
        x: ((wp.x + 1) / 2) * rect.width,
        y: (-(wp.y - 1) / 2) * rect.height,
      };
    }
  });
  return <group ref={ref} />;
}

interface InternalNodeProps {
  node: UInternalNode;
  targetPos: THREE.Vector3;
  startPos: THREE.Vector3;
  color: string;
  depth: number;
  selectedPath: string[];
  onSelectPath: (path: string[], pos: THREE.Vector3) => void;
  pathContext: string[];
  parentPos: THREE.Vector3;
  isVisible: boolean;
  parentLabel: string;
  setBackInfo: (info: { label: string; onClick: () => void } | null) => void;
  isDraft?: boolean;
  draftChildNode?: UInternalNode | null;
  draftMember?: { deptId: string; nodeId: string; member?: any } | null;
  draftMemberScreenPosRef?: React.MutableRefObject<{ x: number; y: number } | null>;
  onNodeFocus?: (pos: THREE.Vector3, node: UInternalNode) => void;
  rootPos?: THREE.Vector3;
  revealDelayMs?: number;
  entryDuration?: number;
  entryEase?: string;
  /** When true, place the node at its target immediately (session restore). */
  skipEntryAnimation?: boolean;
  /** BDT active/inactive gating — omitted by callers outside the BDT department tree (e.g.
   * the reference-company planet view), in which case gating is a no-op (fully active). */
  departmentSourceKey?: string;
  /** This node's level1 ancestor's label — set by the level1 node itself for its children. */
  level1Label?: string;
  /** Nearest branch ancestor label for this subtree; used for active/inactive gating. */
  branchLabel?: string;
  /** Nearest branch ancestor's stable source key for activation matching. */
  branchSourceKey?: string;
}


export function InternalNode({
  node,
  targetPos,
  startPos,
  color,
  depth,
  selectedPath,
  onSelectPath,
  pathContext,
  parentPos,
  isVisible,
  parentLabel,
  setBackInfo,
  isDraft = false,
  draftChildNode = null,
  draftMember = null,
  draftMemberScreenPosRef,
  onNodeFocus,
  rootPos,
  revealDelayMs = 320,
  entryDuration = 1.1,
  entryEase = 'power3.out',
  skipEntryAnimation = false,
  departmentSourceKey,
  level1Label,
  branchLabel,
  branchSourceKey,
}: InternalNodeProps) {
  const groupRef = useRef<THREE.Group>(null);
  const currentPos = useRef(startPos.clone());
  const [entryAnimDone, setEntryAnimDone] = useState(isDraft);
  const hasFocusedRef = useRef(false);
  const [showInactiveTooltip, setShowInactiveTooltip] = useState(false);

  const radii = [0.25, 0.20, 0.15, 0.12, 0.09];
  const isLevel1 = node.nodeLevel === 'level1';
  const isBranch = node.nodeLevel === 'branch';
  const radius = isLevel1 ? radii[0] * 1.4 : (radii[depth] || 0.05);
  const childLevel1Label = isLevel1 ? node.label : level1Label;
  const childBranchLabel = isBranch ? node.label : branchLabel;
  // Prefer the content-derived stableSourceKey (survives tree reorders) over the
  // positional sourceKey — see genBdtSeed.ts's buildMetadata / departments.ts's stableSourceKey.
  const childBranchSourceKey = isBranch ? (node.stableSourceKey ?? node.sourceKey) : branchSourceKey;

  const { activeKeys } = usePolytopeStore('bdt');
  const isInactive = !isDraft
    && isBdtWorkspaceLeafNode(node)
    && !isBdtNodeActive(branchSourceKey, branchLabel, level1Label, departmentSourceKey, activeKeys);

  const isMeActiveCenter = selectedPath.length > 0 && selectedPath[selectedPath.length - 1] === node.id;
  const isMeAncestor = selectedPath.includes(node.id) && !isMeActiveCenter;
  const myPath = [...pathContext, node.id];
  /** Parent orb hides when user drills into a child (branch → action, etc.) */
  const hasActiveChild = selectedPath.length > myPath.length;
  const isHiddenParent = hasActiveChild && !isDraft;

  const childPositions = useMemo(() => {
    const hasDraft = isMeActiveCenter && draftChildNode;
    const existingCount = node.children?.length ?? 0;
    const totalCount = existingCount + (hasDraft ? 1 : 0);
    if (totalCount === 0) return [];
    
    const pts: THREE.Vector3[] = [];
    const isFlat = !!rootPos;
    const ringRadius = isFlat
      ? 1.8 * Math.pow(0.7, depth - 1)
      : 1.4 * Math.pow(0.7, depth - 1);

    const effectiveRoot = rootPos || new THREE.Vector3(0, 0, 0);
    const offset = targetPos.clone().sub(effectiveRoot);
    const dir = isFlat 
      ? new THREE.Vector3(0, 0, 1)
      : (offset.lengthSq() > 0.0001 ? offset.normalize() : new THREE.Vector3(0, 0, 1));

    const right = new THREE.Vector3();
    const up = new THREE.Vector3();

    if (isFlat) {
      right.set(1, 0, 0);
      up.set(0, 1, 0);
    } else {
      const localUp = new THREE.Vector3(0, 1, 0);
      if (Math.abs(dir.dot(localUp)) > 0.99) localUp.set(1, 0, 0);
      right.crossVectors(dir, localUp).normalize();
      up.crossVectors(right, dir).normalize();
    }

    const depthStep = isFlat ? 0.5 : 3.0;
    const childCenter = targetPos.clone().add(dir.clone().multiplyScalar(depthStep));

    for (let i = 0; i < totalCount; i++) {
      const angle = (i / totalCount) * Math.PI * 2;
      const pt = childCenter.clone()
        .add(right.clone().multiplyScalar(Math.cos(angle) * ringRadius))
        .add(up.clone().multiplyScalar(Math.sin(angle) * ringRadius));
      pts.push(pt);
    }
    return pts;
  }, [node.children, targetPos, depth, isMeActiveCenter, draftChildNode, rootPos]);

  const visibleChildIndices = useMemo(() => {
    if (!node.children) return [];
    return node.children
      .map((child, i) =>
        isMeActiveCenter || selectedPath[selectedPath.length - 1] === child.id ? i : -1
      )
      .filter(i => i !== -1);
  }, [node.children, isMeActiveCenter, selectedPath]);

  const childEdges = useMemo(() => {
    const hasDraft = isMeActiveCenter && draftChildNode;
    const totalVisibleCount = visibleChildIndices.length + (hasDraft ? 1 : 0);
    if (totalVisibleCount === 0 || childPositions.length === 0) return null;
    
    const pts: THREE.Vector3[] = [];
    const indicesToDraw = [...visibleChildIndices];
    if (hasDraft) {
      indicesToDraw.push(childPositions.length - 1);
    }
    
    for (let i = 0; i < indicesToDraw.length; i++) {
      const idx = indicesToDraw[i];
      pts.push(targetPos.clone());
      pts.push(childPositions[idx].clone());
      if (indicesToDraw.length > 1) {
        const nextIdx = indicesToDraw[(i + 1) % indicesToDraw.length];
        pts.push(childPositions[idx].clone());
        pts.push(childPositions[nextIdx].clone());
      }
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [visibleChildIndices, childPositions, targetPos, isMeActiveCenter, draftChildNode]);

  useEffect(() => {
    if (isDraft) {
      setEntryAnimDone(true);
      if (groupRef.current) {
        currentPos.current.copy(targetPos);
        groupRef.current.position.copy(targetPos);
        groupRef.current.scale.setScalar(1);
      }
      return;
    }

    let targetScale = 0.0;
    if (isHiddenParent) {
      targetScale = 0.0;
    } else if (isVisible) {
      targetScale = isMeActiveCenter ? 1.5 : 1.0;
    }

    if (skipEntryAnimation) {
      setEntryAnimDone(true);
      if (groupRef.current) {
        currentPos.current.copy(targetPos);
        groupRef.current.position.copy(targetPos);
        groupRef.current.scale.setScalar(targetScale);
      }
      return;
    }

    setEntryAnimDone(false);
    if (groupRef.current) {
      currentPos.current.copy(startPos);
      groupRef.current.position.copy(startPos);
      groupRef.current.scale.setScalar(0);
    }

    const revealDelay = revealDelayMs / 1000;

    const posTween = gsap.to(groupRef.current!.position, {
      x: targetPos.x,
      y: targetPos.y,
      z: targetPos.z,
      duration: entryDuration,
      delay: revealDelay,
      ease: entryEase,
      onUpdate: () => {
        if (groupRef.current) {
          currentPos.current.copy(groupRef.current.position);
        }
      },
    });

    const scaleTween = gsap.to(groupRef.current!.scale, {
      x: targetScale,
      y: targetScale,
      z: targetScale,
      duration: entryDuration,
      delay: revealDelay,
      ease: entryEase,
      onComplete: () => {
        setEntryAnimDone(true);
      },
    });

    return () => {
      posTween.kill();
      scaleTween.kill();
    };
  }, [
    startPos.x, startPos.y, startPos.z,
    targetPos.x, targetPos.y, targetPos.z,
    isDraft, entryDuration, entryEase, revealDelayMs,
    isVisible, isHiddenParent, isMeActiveCenter, skipEntryAnimation,
  ]);

  useEffect(() => {
    if (isMeActiveCenter) {
      setBackInfo({
        label: parentLabel,
        onClick: () => onSelectPath(pathContext, parentPos),
      });
      if (!hasFocusedRef.current) {
        if (onNodeFocus) onNodeFocus(targetPos, node);
        hasFocusedRef.current = true;
      }
      return () => {
        setBackInfo(null);
      };
    } else {
      hasFocusedRef.current = false;
    }
  }, [isMeActiveCenter, parentLabel, pathContext, parentPos, onSelectPath, setBackInfo, onNodeFocus, targetPos, node]);

  useFrame(() => {
    if (groupRef.current) {
      if (entryAnimDone) {
        if (!isDraft) {
          currentPos.current.lerp(targetPos, 0.045);
          groupRef.current.position.copy(currentPos.current);
        }

        let targetScale = 0.0;
        if (isHiddenParent) {
          targetScale = 0.0;
        } else if (isVisible) {
          targetScale = isMeActiveCenter ? 1.5 : 1.0;
        }
        const lerpSpeed = isHiddenParent || isMeActiveCenter ? 0.1 : 0.06;
        groupRef.current.scale.lerp(
          new THREE.Vector3(targetScale, targetScale, targetScale),
          lerpSpeed,
        );
      }
    }
  });

  const startDrag = useDragWorkspaceStore(s => s.startDrag);
  const dragTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const startPosClient = useRef<{ x: number; y: number } | null>(null);

  const handlePointerDown = (e: any) => {
    e.stopPropagation();
    if (isDraft || isInactive || !isActionLeafNode(node)) return;
    startPosClient.current = { x: e.clientX, y: e.clientY };
    dragTimer.current = setTimeout(() => {
      startDrag(node, color, e.clientX, e.clientY);
      dragTimer.current = null;
    }, 800);
  };

  const handlePointerMove = (e: any) => {
    if (dragTimer.current && startPosClient.current) {
      const dx = e.clientX - startPosClient.current.x;
      const dy = e.clientY - startPosClient.current.y;
      if (Math.sqrt(dx * dx + dy * dy) > 10) {
        clearTimeout(dragTimer.current);
        dragTimer.current = null;
      }
    }
  };

  const cancelDrag = () => {
    if (dragTimer.current) {
      clearTimeout(dragTimer.current);
      dragTimer.current = null;
    }
  };

  const handleClick = (e: { stopPropagation: () => void }) => {
    e.stopPropagation();
    cancelDrag();
    if (isDraft) return;
    if (isInactive) {
      setShowInactiveTooltip(true);
      setTimeout(() => setShowInactiveTooltip(false), 2000);
      return;
    }
    if (selectedPath[selectedPath.length - 1] === node.id) {
      onSelectPath(pathContext, parentPos);
      return;
    } else {
      onSelectPath(myPath, targetPos);
    }
  };

  return (
    <group>
      <group
        ref={groupRef}
        onClick={handleClick}
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={cancelDrag}
        onPointerOut={() => {
          cancelDrag();
          if (!isDraft) document.body.style.cursor = 'auto';
        }}
        onPointerOver={() => { if (!isDraft) document.body.style.cursor = isInactive ? 'not-allowed' : 'pointer'; }}
      >

        <PlasmaSphere
          color={color}
          radius={radius}
          opacity={isDraft ? 0.85 : isHiddenParent ? 0.0 : isInactive ? 0.25 : 1.0}
          glowIntensity={
            isDraft ? 2.8
            : isHiddenParent ? 0
            : isInactive ? 0.1
            : isMeActiveCenter ? 3.5
            : isLevel1 ? 1.2
            : 0.2
          }
          halo={false}
          depthWrite={!isHiddenParent}
          speed={isMeActiveCenter ? 1.5 : isLevel1 ? 0.6 : 0.2}
        />
        {isVisible && !isHiddenParent && (
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, -radius * 2.8, 0]}>
            <Text
              color={isDraft ? color : "#ffffff"}
              fontSize={Math.max(0.08, 0.15 - depth * 0.02)}
              maxWidth={3.0}
              lineHeight={1.1}
              letterSpacing={0.06}
              textAlign="center"
              anchorX="center"
              anchorY="middle"
              fillOpacity={isDraft ? 1 : isInactive ? 0.35 : isMeActiveCenter || isMeAncestor ? 0.95 : 0.65}
              outlineWidth={0.006}
              outlineColor="#000000"
              outlineOpacity={0.8}
            >
              {isDraft ? `✦ ${node.label}` : node.label}
            </Text>
          </Billboard>
        )}

        {showInactiveTooltip && (
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false} position={[0, radius * 3.2, 0]}>
            <Html center zIndexRange={[100, 0]}>
              <div style={{
                background: 'rgba(0,0,0,0.85)',
                color: '#e2e8f0',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '11px',
                fontWeight: 600,
                whiteSpace: 'nowrap',
                border: '1px solid rgba(255,255,255,0.15)',
                pointerEvents: 'none',
              }}>
                Not connected yet
              </div>
            </Html>
          </Billboard>
        )}

        {isMeActiveCenter && node.type === 'team' && (node.members?.length || (draftMember?.member && draftMember.nodeId === node.id)) && (
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            {[...(node.members || []), ...(draftMember?.member && draftMember.nodeId === node.id ? [draftMember.member] : [])].map((member, i, arr) => {
              const angle = (i / arr.length) * Math.PI * 2;
              // Precisely scale the radius based on member count to perfectly balance spacing
              const r = radius * (5.5 + arr.length * 0.5);
              const x = Math.cos(angle) * r;
              const y = Math.sin(angle) * r;
              const isDraft = draftMember && draftMember.nodeId === node.id && i === arr.length - 1;

              return (
                <group key={i} position={[x, y, 0]}>
                  {isDraft && draftMemberScreenPosRef && (
                    <PosTracker posRef={draftMemberScreenPosRef} />
                  )}
                  <Html center zIndexRange={[100, 0]}>
                    <div style={{
                      display: 'flex',
                      flexDirection: 'column',
                      alignItems: 'center',
                      gap: '6px',
                      width: 'max-content',
                      color: '#ffffff',
                      textAlign: 'center',
                      animation: `popIn 0.5s ${i * 0.05}s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275)`,
                      opacity: 0,
                      transform: 'scale(0)'
                    }}>
                      {member.avatarUrl && (
                        <div style={{
                          width: 72,
                          height: 72,
                          borderRadius: '50%',
                          border: `2px solid ${color}`,
                          overflow: 'hidden',
                          boxShadow: `0 0 15px ${color}66`
                        }}>
                          <img src={member.avatarUrl} alt={member.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} draggable={false} />
                        </div>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                        <span style={{ fontSize: '14px', fontWeight: 'bold', textShadow: '0 2px 4px rgba(0,0,0,0.9)' }}>{member.name}</span>
                        <span style={{ fontSize: '11px', color: '#cbd5e1', textShadow: '0 1px 3px rgba(0,0,0,0.9)', marginTop: '2px' }}>{member.role}</span>
                      </div>
                    </div>
                  </Html>
                </group>
              );
            })}
            <Html>
              <style>{`
                @keyframes popIn {
                  0% { transform: scale(0); opacity: 0; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </Html>
          </Billboard>
        )}

        {isMeActiveCenter && node.type === 'project' && node.projectDetails && (
          <Billboard follow={true} lockX={false} lockY={false} lockZ={false}>
            <Html position={[radius * 7.5, 0, 0]} center zIndexRange={[100, 0]}>
            <div style={{
              background: 'rgba(15, 23, 42, 0.85)',
              backdropFilter: 'blur(8px)',
              border: `1px solid ${color}88`,
              borderRadius: '12px',
              padding: '16px',
              width: '240px',
              color: '#e2e8f0',
              boxShadow: `0 8px 32px ${color}33`,
              animation: 'popIn 0.5s 0s forwards cubic-bezier(0.175, 0.885, 0.32, 1.275)',
              opacity: 0,
              transform: 'scale(0)'
            }}>
              <div style={{ fontSize: '14px', fontWeight: 'bold', borderBottom: `1px solid ${color}66`, paddingBottom: '8px', marginBottom: '8px', color: '#fff' }}>Project Summary</div>
              <div style={{ fontSize: '12px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Status:</span> <span style={{ fontWeight: 600 }}>{node.projectDetails.status || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Deadline:</span> <span style={{ fontWeight: 600 }}>{node.projectDetails.deadline || 'N/A'}</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                  <span style={{ color: '#94a3b8' }}>Budget:</span> <span style={{ fontWeight: 600 }}>{node.projectDetails.budget || 'N/A'}</span>
                </div>
                {node.projectDetails.description && (
                  <div style={{ marginTop: '4px', fontStyle: 'italic', color: '#cbd5e1', lineHeight: 1.4 }}>
                    "{node.projectDetails.description}"
                  </div>
                )}
              </div>
            </div>
              <style>{`
                @keyframes popIn {
                  0% { transform: scale(0); opacity: 0; }
                  100% { transform: scale(1); opacity: 1; }
                }
              `}</style>
            </Html>
          </Billboard>
        )}
      </group>

      {node.children && !(isMeActiveCenter && node.type === 'team' && (node.members?.length || draftMember)) && node.children.map((child, i) => {
        const isChildVisible =
          isMeActiveCenter || selectedPath[selectedPath.length - 1] === child.id;
        return (
          <InternalNode
            key={child.id}
            node={child}
            targetPos={childPositions[i]}
            startPos={targetPos}
            color={color}
            depth={depth + 1}
            selectedPath={selectedPath}
            onSelectPath={onSelectPath}
            pathContext={myPath}
            parentPos={targetPos}
            isVisible={isChildVisible}
            parentLabel={node.label}
            setBackInfo={setBackInfo}
            draftChildNode={draftChildNode}
            draftMember={draftMember}
            draftMemberScreenPosRef={draftMemberScreenPosRef}
            onNodeFocus={onNodeFocus}
            rootPos={rootPos}
            revealDelayMs={revealDelayMs}
            entryDuration={entryDuration}
            entryEase={entryEase}
            departmentSourceKey={departmentSourceKey}
            level1Label={childLevel1Label}
            branchLabel={childBranchLabel}
            branchSourceKey={childBranchSourceKey}
          />
        );
      })}

      {isMeActiveCenter && draftChildNode && (
        <InternalNode
          key={draftChildNode.id}
          node={draftChildNode}
          targetPos={childPositions[childPositions.length - 1]}
          startPos={targetPos}
          color={color}
          depth={depth + 1}
          selectedPath={selectedPath}
          onSelectPath={onSelectPath}
          pathContext={myPath}
          parentPos={targetPos}
          isVisible={true}
          parentLabel={node.label}
          setBackInfo={setBackInfo}
          isDraft
          onNodeFocus={onNodeFocus}
          rootPos={rootPos}
          revealDelayMs={revealDelayMs}
        />
      )}

      {isMeActiveCenter && childEdges && !(isMeActiveCenter && node.type === 'team' && (node.members?.length || draftMember)) && (
        <lineSegments geometry={childEdges}>
          <lineBasicMaterial color={color} transparent opacity={0.4} />
        </lineSegments>
      )}
    </group>
  );
}
