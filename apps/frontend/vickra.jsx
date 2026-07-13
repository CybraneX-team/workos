import React, { useRef, useMemo, useEffect } from 'react';
import { Canvas, useFrame, extend } from '@react-three/fiber';
import { OrbitControls, Effects } from '@react-three/drei';
import { UnrealBloomPass } from 'three-stdlib';
import * as THREE from 'three';

extend({ UnrealBloomPass });

const ParticleSwarm = () => {
  const meshRef = useRef();
  const count = 20000;
  const speedMult = 1;
  const dummy = useMemo(() => new THREE.Object3D(), []);
  const target = useMemo(() => new THREE.Vector3(), []);
  const pColor = useMemo(() => new THREE.Color(), []);
  const color = pColor; // Alias for user code compatibility
  
  const positions = useMemo(() => {
     const pos = [];
     for(let i=0; i<count; i++) pos.push(new THREE.Vector3((Math.random()-0.5)*100, (Math.random()-0.5)*100, (Math.random()-0.5)*100));
     return pos;
  }, []);

  // Material & Geom
  const material = useMemo(() => new THREE.MeshBasicMaterial({ color: 0xffffff }), []);
  const geometry = useMemo(() => new THREE.TetrahedronGeometry(0.25), []);

  const PARAMS = useMemo(() => ({"freq":3,"amp":3.5,"rad":14,"spin":0.3,"thick":2}), []);
  const addControl = (id, l, min, max, val) => {
      return PARAMS[id] !== undefined ? PARAMS[id] : val;
  };
  const setInfo = () => {};
  const annotate = () => {};

  useFrame((state) => {
    if (!meshRef.current) return;
    const time = state.clock.getElapsedTime() * speedMult;
    const THREE_LIB = THREE;

    if(material.uniforms && material.uniforms.uTime) {
         material.uniforms.uTime.value = time;
    }

    for (let i = 0; i < count; i++) {
        // USER CODE START
        // Spherical shell warped by 5-source interference field
        const freq  = addControl("freq",  "Frequency",  1,  8,  3.0);
        const amp   = addControl("amp",   "Amplitude",  0,  8,  3.5);
        const rad   = addControl("rad",   "Radius",     5,  30, 14);
        const spin  = addControl("spin",  "Spin",       0,  2,  0.3);
        const thick = addControl("thick", "Shell Thick",0,  6,  2.0);
        
        const phi2  = Math.acos(1 - 2 * (i + 0.5) / count);
        const tht2  = 2.3999 * i + time * spin;
        const sx    = Math.sin(phi2) * Math.cos(tht2);
        const sy    = Math.sin(phi2) * Math.sin(tht2);
        const sz    = Math.cos(phi2);
        
        // 5-source interference
        const w1 = Math.sin(sx * freq + time) + Math.sin(sy * freq - time * 0.7);
        const w2 = Math.sin(sz * freq + time * 1.3) + Math.sin((sx + sz) * freq * 0.6);
        const w3 = Math.sin((sy - sx) * freq * 0.8 + time * 0.5);
        const warp = (w1 + w2 + w3) * amp / 5;
        
        const r2 = rad + warp + Math.sin(i * 0.0005 + time) * thick;
        target.set(sx * r2, sy * r2, sz * r2);
        const norm = (warp / amp + 1) * 0.5;
        color.setHSL(0.55 + norm * 0.45, 0.95, 0.35 + norm * 0.3);
        if (i === 0) setInfo("Plasma Web", "5-source interference field warping a Fibonacci sphere. Color = wave height.");
        // USER CODE END

        positions[i].lerp(target, 0.1);
        dummy.position.copy(positions[i]);
        dummy.updateMatrix();
        meshRef.current.setMatrixAt(i, dummy.matrix);
        meshRef.current.setColorAt(i, pColor);
    }
    meshRef.current.instanceMatrix.needsUpdate = true;
    if (meshRef.current.instanceColor) meshRef.current.instanceColor.needsUpdate = true;
  });

  return (
    <instancedMesh ref={meshRef} args={[geometry, material, count]} />
  );
};

export default function App() {
  return (
    <div style={{ width: '100vw', height: '100vh', background: '#000' }}>
      <Canvas camera={{ position: [0, 0, 100], fov: 60 }}>
        <fog attach="fog" args={['#000000', 0.01]} />
        <ParticleSwarm />
        <OrbitControls autoRotate={true} />
        <Effects disableGamma>
            <unrealBloomPass threshold={0} strength={1.8} radius={0.4} />
        </Effects>
      </Canvas>
    </div>
  );
}