import { useRef, type MutableRefObject } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlowRingProps {
  color: string;
  active: boolean;
  isSelected: boolean;
  idx: number;
  /**
   * Per-frame opacity override. Supplying it lets the ring fade continuously
   * (e.g. as its node rotates away from the camera) instead of blinking off
   * with `active`. When omitted the static selected/idle opacity is used.
   */
  opacityRef?: MutableRefObject<number>;
}

export function GlowRing({ color, active, isSelected, idx, opacityRef }: GlowRingProps) {
  const meshRef = useRef<THREE.Mesh>(null);
  const materialRef = useRef<THREE.MeshBasicMaterial>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime;
    const s = 0.5 + Math.sin(t * 2 + idx) * 0.15;
    meshRef.current.scale.setScalar(s);

    if (opacityRef && materialRef.current) {
      const o = opacityRef.current;
      materialRef.current.opacity = o;
      // A fully transparent additive ring still costs a draw call.
      meshRef.current.visible = active && o > 0.005;
    }
  });

  return (
    <mesh ref={meshRef} visible={active}>
      <ringGeometry args={[0.3, 0.35, 32]} />
      <meshBasicMaterial
        ref={materialRef}
        color={color}
        transparent
        opacity={isSelected ? 0.8 : 0.4}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
        side={THREE.DoubleSide}
      />
    </mesh>
  );
}
