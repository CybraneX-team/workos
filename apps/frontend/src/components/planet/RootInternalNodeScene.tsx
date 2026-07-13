import { useRef, useMemo, useEffect, useCallback } from 'react';
import { useThree, useFrame } from '@react-three/fiber';
import { OrbitControls, Stars, Html } from '@react-three/drei';
import * as THREE from 'three';
import { gsap } from 'gsap';
import type { UExternalNode } from '../../lib/universalPolytopeData';
import { getExternalNodeColor } from '../../lib/universalPolytopeData';
import { PlasmaSphere, GlowRing } from '../PolytopeShared';
import { InternalNode } from '../polytope/InternalNode';
import { computeInternalNodePosition, computeCameraFraming } from '../polytope/internalNodeLayout';
import { useDragWorkspaceStore } from '../../lib/useDragWorkspaceStore';

export interface RootInternalNodeSceneProps {
  root: UExternalNode;
  selectedInternalPath: string[];
  onPathChange: (path: string[]) => void;
  requestBackStep?: number;
  /** Increment when switching roots — resets camera */
  rootSwitchKey?: number;
  onBack?: () => void;
}

const ROOT_POS = new THREE.Vector3(0, 0, 8);
const CAMERA_ZOOM_IN = 9.5;
const NODES_REVEAL_DELAY_MS = 320;

export function RootInternalNodeScene({
  root,
  selectedInternalPath,
  onPathChange,
  requestBackStep = 0,
  rootSwitchKey = 0,
  onBack,
}: RootInternalNodeSceneProps) {
  const color = getExternalNodeColor(root);
  const isDragging = useDragWorkspaceStore(s => s.isDragging);
  const { camera } = useThree();
  const orbitRef = useRef<any>(null);
  const rootVisualRef = useRef<THREE.Group>(null);
  const rootEdgesMatRef = useRef<THREE.LineBasicMaterial>(null);
  const isDeepDrillDown = selectedInternalPath.length > 0;
  const prevBackStepRef = useRef(0);
  const setBackInfo = useCallback((_info: { label: string; onClick: () => void } | null) => {}, []);

  const internalPositions = useMemo(() => {
    const n = root.internalNodes.length;
    return root.internalNodes.map((_, i) => computeInternalNodePosition(ROOT_POS, i, n));
  }, [root.internalNodes]);

  const internalEdgesGeometry = useMemo(() => {
    if (internalPositions.length === 0) return null;
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i < internalPositions.length; i++) {
      pts.push(internalPositions[i].clone());
      pts.push(internalPositions[(i + 1) % internalPositions.length].clone());
      pts.push(internalPositions[i].clone());
      pts.push(ROOT_POS.clone());
    }
    return new THREE.BufferGeometry().setFromPoints(pts);
  }, [internalPositions]);

  useEffect(() => {
    if (selectedInternalPath.length > 0) {
      // If we mount directly into a deep path, don't play the root zoom-out animation
      // The InternalNode will trigger onNodeFocus
      return;
    }
    
    const dir = new THREE.Vector3(0, 0, 1);
    // Use 18 as the base distance (26 - 8 = 18)
    const { camPos, orbitTarget } = computeCameraFraming(ROOT_POS, dir, root.internalNodes.length, 18);

    camera.position.set(camPos.x, camPos.y, CAMERA_ZOOM_IN);
    if (orbitRef.current) {
      orbitRef.current.target.set(orbitTarget.x, orbitTarget.y, orbitTarget.z);
      orbitRef.current.update();
    }

    const revealDelay = NODES_REVEAL_DELAY_MS / 1000;
    const camTween = gsap.to(camera.position, {
      x: camPos.x, y: camPos.y, z: camPos.z,
      duration: 1.05,
      delay: revealDelay,
      ease: 'power2.out',
      onUpdate: () => orbitRef.current?.update(),
    });

    let targetTween: gsap.core.Tween | undefined;
    if (orbitRef.current) {
      targetTween = gsap.to(orbitRef.current.target, {
        x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z,
        duration: 0.8,
        delay: revealDelay,
        ease: 'power2.out',
        onUpdate: () => orbitRef.current?.update(),
      });
    }

    return () => {
      camTween.kill();
      targetTween?.kill();
    };
  }, [root.id, root.internalNodes.length, rootSwitchKey, camera]);

  const flyToRootOverview = useCallback(() => {
    const dir = new THREE.Vector3(0, 0, 1);
    const { camPos, orbitTarget } = computeCameraFraming(ROOT_POS, dir, root.internalNodes.length, 18);
    
    if (orbitRef.current) {
      gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.0, ease: 'power2.inOut' });
    }
    gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.0, ease: 'power2.inOut' });
  }, [camera, root.internalNodes.length]);

  const handleNodeFocus = useCallback((targetPos: THREE.Vector3, node?: any) => {
    if (orbitRef.current) {
      const dir = new THREE.Vector3(0, 0, 1);
      const { camPos, orbitTarget } = computeCameraFraming(targetPos, dir, node?.children?.length ?? 0, 10);
      gsap.to(orbitRef.current.target, { x: orbitTarget.x, y: orbitTarget.y, z: orbitTarget.z, duration: 1.0, ease: 'power2.inOut' });
      gsap.to(camera.position, { x: camPos.x, y: camPos.y, z: camPos.z, duration: 1.0, ease: 'power2.inOut' });
    }
  }, [camera]);

  const handleInternalClick = (path: string[], _targetPos: THREE.Vector3) => {
    if (path.length === 0) {
      onPathChange([]);
      flyToRootOverview();
      return;
    }
    onPathChange(path);
    // targetPos camera animation will be handled by handleNodeFocus triggered by InternalNode
  };

  useEffect(() => {
    if (!requestBackStep || requestBackStep === prevBackStepRef.current) return;
    prevBackStepRef.current = requestBackStep;

    if (selectedInternalPath.length > 0) {
      const nextPath = selectedInternalPath.slice(0, -1);
      onPathChange(nextPath);
      if (nextPath.length === 0) {
        flyToRootOverview();
      }
    } else {
      onPathChange([]);
      flyToRootOverview();
    }
  }, [requestBackStep, onPathChange, selectedInternalPath, flyToRootOverview]);

  useFrame(() => {
    if (rootVisualRef.current) {
      const target = isDeepDrillDown ? 0 : 1;
      rootVisualRef.current.scale.lerp(
        new THREE.Vector3(target, target, target),
        0.12,
      );
    }
    if (rootEdgesMatRef.current) {
      const targetOpacity = isDeepDrillDown ? 0 : 0.35;
      rootEdgesMatRef.current.opacity = THREE.MathUtils.lerp(
        rootEdgesMatRef.current.opacity,
        targetOpacity,
        0.1,
      );
    }
  });

  return (
    <>
      <ambientLight intensity={0.55} />
      <pointLight position={[0, 0, 12]} intensity={1.8} color="#ffffff" distance={40} />
      <directionalLight position={[8, 12, 10]} intensity={0.9} />
      <Stars radius={80} depth={40} count={2500} factor={3} saturation={0.4} fade speed={0.3} />

      <group>
        <group ref={rootVisualRef} position={ROOT_POS}>
          <GlowRing color={color} active={!isDeepDrillDown} isSelected={true} idx={0} />
          <PlasmaSphere
            color={color}
            radius={0.42}
            opacity={1}
            glowIntensity={2.8}
            depthWrite={true}
            speed={1.2}
          />
          {/* Invisible click target on center orb */}
          <mesh
            onClick={(e) => {
              e.stopPropagation();
              if (selectedInternalPath.length > 0) {
                // Go back one level in internal nodes
                const nextPath = selectedInternalPath.slice(0, -1);
                onPathChange(nextPath);
                if (nextPath.length === 0) {
                  flyToRootOverview();
                }
              } else if (onBack) {
                // At root level — exit back to planet roots
                onBack();
              }
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
            <sphereGeometry args={[0.7, 16, 16]} />
            <meshBasicMaterial transparent opacity={0} />
          </mesh>
          {!isDeepDrillDown && (
            <Html position={[0, -1.4, 0]} center zIndexRange={[-10, -100]} prepend>
              <div style={{
                color: 'white',
                background: 'rgba(0,0,0,0.65)',
                padding: '6px 14px',
                borderRadius: '6px',
                fontSize: '14px',
                fontWeight: 'bold',
                backdropFilter: 'blur(6px)',
                border: `1px solid ${color}55`,
                pointerEvents: 'none',
                whiteSpace: 'nowrap',
                boxShadow: `0 0 20px ${color}40`,
              }}>
                {root.label}
              </div>
            </Html>
          )}
        </group>

        {internalEdgesGeometry && (
          <lineSegments geometry={internalEdgesGeometry}>
            <lineBasicMaterial
              ref={rootEdgesMatRef}
              color={color}
              transparent
              opacity={0.35}
              depthWrite={false}
            />
          </lineSegments>
        )}

        {root.internalNodes.map((intNode, i) => {
          const isChildVisible =
            selectedInternalPath.length === 0 ||
            selectedInternalPath[selectedInternalPath.length - 1] === intNode.id ||
            selectedInternalPath.includes(intNode.id);
          return (
            <InternalNode
              key={intNode.id}
              node={intNode}
              targetPos={internalPositions[i]}
              startPos={ROOT_POS}
              color={color}
              depth={1}
              selectedPath={selectedInternalPath}
              onSelectPath={handleInternalClick}
              pathContext={[]}
              parentPos={ROOT_POS}
              isVisible={isChildVisible}
              parentLabel={root.label}
              setBackInfo={setBackInfo}
              onNodeFocus={handleNodeFocus}
              rootPos={ROOT_POS}
            />
          );
        })}
      </group>

      <OrbitControls
        ref={orbitRef}
        enablePan={false}
        minDistance={8}
        maxDistance={55}
        target={ROOT_POS}
        enabled={!isDragging}
      />
    </>
  );
}
