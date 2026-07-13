import { useRef } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

interface GlowRingProps {
  color: string;
  active: boolean;
  isSelected: boolean;
  idx: number;
}

export function GlowRing({ color, active, isSelected, idx }: GlowRingProps) {
  const meshRef = useRef<THREE.Mesh>(null);

  useFrame(({ clock }) => {
    if (!meshRef.current) return;
    const t = clock.elapsedTime;
    const s = 0.5 + Math.sin(t * 2 + idx) * 0.15;
    meshRef.current.scale.setScalar(s);
  });

  return (
    <mesh ref={meshRef} visible={active}>
      <ringGeometry args={[0.3, 0.35, 32]} />
      <meshBasicMaterial
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
