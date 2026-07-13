/**
 * OrbWelcomeEffect — Full-screen Fibonacci interference sphere that animates
 * in response to a scripted "speech intensity" curve when welcoming the user.
 *
 * Technique: 5-source interference field warping a Fibonacci sphere (CPU particles).
 * intensityRef drives freq / amp / spin in real time without React re-renders.
 */
import { useEffect, useRef } from 'react';
import * as THREE from 'three';

interface Props {
  active: boolean;
  /** Mutable ref 0-1 — driven each frame by speech intensity curve in parent */
  intensityRef: React.MutableRefObject<number>;
  /** CSS opacity for fade-in / fade-out */
  opacity: number;
}

export default function OrbWelcomeEffect({ active, intensityRef, opacity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const W = window.innerWidth;
    const H = window.innerHeight;

    const renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
    renderer.setSize(W, H, false);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);

    const camera = new THREE.PerspectiveCamera(60, W / H, 0.1, 200);
    camera.position.z = 30;

    const scene = new THREE.Scene();

    // ── Fibonacci sphere particle system ─────────────────────────────────────
    const COUNT = 5000;
    const positions = new Float32Array(COUNT * 3);
    const colors    = new Float32Array(COUNT * 3);

    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geo.setAttribute('color',    new THREE.BufferAttribute(colors,    3));

    const mat = new THREE.PointsMaterial({
      size: 0.16,
      vertexColors: true,
      transparent: true,
      opacity: 0.9,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const pts = new THREE.Points(geo, mat);
    scene.add(pts);

    // Reuse color object — avoids GC pressure inside loop
    const tmpColor = new THREE.Color();

    let time  = 0;
    let rafId = 0;

    const tick = () => {
      rafId = requestAnimationFrame(tick);
      time += 0.016;

      const v = intensityRef.current; // 0-1

      // ── Parameters modulated by speech intensity ─────────────────────────
      const freq  = 3.0 + v * 3.5;   // 3 → 6.5
      const amp   = 3.5 + v * 5.5;   // 3.5 → 9
      const spin  = 0.3 + v * 0.5;   // 0.3 → 0.8
      const thick = 2.0 + v * 3.0;   // 2 → 5
      const rad   = 14;

      const pos = geo.attributes.position.array as Float32Array;
      const col = geo.attributes.color.array as Float32Array;

      for (let i = 0; i < COUNT; i++) {
        const phi2 = Math.acos(1 - 2 * (i + 0.5) / COUNT);
        const tht2 = 2.3999 * i + time * spin;
        const sx = Math.sin(phi2) * Math.cos(tht2);
        const sy = Math.sin(phi2) * Math.sin(tht2);
        const sz = Math.cos(phi2);

        // 5-source interference field
        const w1 = Math.sin(sx * freq + time)           + Math.sin(sy * freq - time * 0.7);
        const w2 = Math.sin(sz * freq + time * 1.3)     + Math.sin((sx + sz) * freq * 0.6);
        const w3 = Math.sin((sy - sx) * freq * 0.8 + time * 0.5);
        const warp = (w1 + w2 + w3) * amp / 5;

        const r2 = rad + warp + Math.sin(i * 0.0005 + time) * thick;
        pos[i * 3]     = sx * r2;
        pos[i * 3 + 1] = sy * r2;
        pos[i * 3 + 2] = sz * r2;

        const norm = (warp / amp + 1) * 0.5;
        tmpColor.setHSL(0.55 + norm * 0.45, 0.95, 0.35 + norm * 0.3);
        col[i * 3]     = tmpColor.r;
        col[i * 3 + 1] = tmpColor.g;
        col[i * 3 + 2] = tmpColor.b;
      }

      geo.attributes.position.needsUpdate = true;
      geo.attributes.color.needsUpdate    = true;

      pts.rotation.y += 0.003 + v * 0.005;
      pts.rotation.x  = Math.sin(time * 0.2) * 0.1;

      renderer.render(scene, camera);
    };

    tick();

    return () => {
      cancelAnimationFrame(rafId);
      geo.dispose();
      mat.dispose();
      renderer.dispose();
    };
  }, [active, intensityRef]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'fixed', inset: 0,
        width: '100%', height: '100%',
        pointerEvents: 'none',
        zIndex: 60,
        opacity,
        transition: 'opacity 0.6s ease',
      }}
    />
  );
}
