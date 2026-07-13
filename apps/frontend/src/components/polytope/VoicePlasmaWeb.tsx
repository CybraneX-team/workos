import React, { useRef, useMemo, useEffect } from 'react';
import { useFrame } from '@react-three/fiber';
import * as THREE from 'three';

export interface VoicePlasmaWebProps {
  coreWorkspacePhase: string;
  voiceIntensityRef?: React.MutableRefObject<number>;
  radius?: number;
  count?: number;
}

export function VoicePlasmaWeb({
  coreWorkspacePhase,
  voiceIntensityRef,
  radius = 1.2,
  count = 8000,
}: VoicePlasmaWebProps) {
  const meshRef = useRef<THREE.InstancedMesh>(null);
  const active = coreWorkspacePhase !== 'idle';

  const dummy = useMemo(() => new THREE.Object3D(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const pColor = useMemo(() => new THREE.Color(), []);

  // Initialize particles at random positions
  const positions = useMemo(() => {
    const pos: THREE.Vector3[] = [];
    for (let i = 0; i < count; i++) {
      pos.push(new THREE.Vector3(
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15,
        (Math.random() - 0.5) * 15
      ));
    }
    return pos;
  }, [count]);

  // When 'active' changes to true, randomize positions again for the fly-in effect
  useEffect(() => {
    if (active) {
      for (let i = 0; i < count; i++) {
        positions[i].set(
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15,
          (Math.random() - 0.5) * 15
        );
      }
    }
  }, [active, count, positions]);

  // Geometry and Material
  // Tetrahedron size scaled to match core geometry scale
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(0.018), []);
  const material = useMemo(() => new THREE.MeshBasicMaterial({
    color: 0xffffff,
    transparent: true,
    opacity: 0.0, // Start completely transparent, will fade in
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  }), []);

  const timeRef = useRef(0);
  const smoothedIntensity = useRef(0);
  const opacityFactorRef = useRef(0.0);

  useFrame((_state, delta) => {
    if (!active || !meshRef.current) return;

    // Smooth the voice intensity to avoid micro-jitter
    const rawVal = voiceIntensityRef?.current ?? 0;
    smoothedIntensity.current += (rawVal - smoothedIntensity.current) * 0.15;
    const v = smoothedIntensity.current;

    // Smoothly fade in/out opacity during zoom transitions
    let targetFactor = 0.0;
    if (coreWorkspacePhase === 'diving-in' || coreWorkspacePhase === 'workspace') {
      targetFactor = 1.0;
    }
    opacityFactorRef.current += (targetFactor - opacityFactorRef.current) * 0.04;
    material.opacity = 0.9 * opacityFactorRef.current;

    // Modulate time delta based on speech intensity (slower, calmer animation)
    timeRef.current += delta * (0.15 + v * 0.25);
    const time = timeRef.current;

    // Calm state (amplitude = 0) when silent, elegant higher frequency waves when active
    const amp = v * 0.12;          // Reduced max amplitude to prevent capsule warping
    const freq = 5.0 + v * 1.5;    // Higher baseline frequency to avoid "two-wave" look
    const thick = v * 0.04;        // Subtle shell thickness
    const spin = 0.12 + v * 0.18;  // Slow rotation speed

    for (let i = 0; i < count; i++) {
      const phi2 = Math.acos(1 - 2 * (i + 0.5) / count);
      const tht2 = 2.3999 * i + time * spin;

      const sx = Math.sin(phi2) * Math.cos(tht2);
      const sy = Math.sin(phi2) * Math.sin(tht2);
      const sz = Math.cos(phi2);

      // 5-source interference math
      const w1 = Math.sin(sx * freq + time) + Math.sin(sy * freq - time * 0.7);
      const w2 = Math.sin(sz * freq + time * 1.3) + Math.sin((sx + sz) * freq * 0.6);
      const w3 = Math.sin((sy - sx) * freq * 0.8 + time * 0.5);
      const warp = (w1 + w2 + w3) * amp / 5;

      const r2 = radius + warp + Math.sin(i * 0.0005 + time) * thick;
      target.set(sx * r2, sy * r2, sz * r2);

      // Smooth lerp for fly-in/warp inertia
      positions[i].lerp(target, 0.1);

      // Set matrix position
      dummy.position.copy(positions[i]);
      dummy.updateMatrix();
      meshRef.current.setMatrixAt(i, dummy.matrix);

      // Set instance color: maps from deep cyan/blue to hot pink/red on wave peaks
      const norm = amp > 0 ? (warp / amp + 1) * 0.5 : 0;
      pColor.setHSL(0.55 + norm * 0.45, 0.95, 0.35 + norm * 0.3);
      meshRef.current.setColorAt(i, pColor);
    }

    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) {
      meshRef.current.instanceColor.needsUpdate = true;
    }
  });

  return (
    <instancedMesh
      ref={meshRef}
      args={[geometry, material, count]}
      visible={active}
    />
  );
}
