/**
 * OrbVoiceRing — 2D canvas voice visualizer drawn around the orb boundary.
 * 128 radial bars + pulsing glow ring, all driven by intensityRef (0-1).
 * No particles, no 3D — just the orb edge reacting to the welcome voice.
 */
import { useEffect, useRef } from 'react';

interface Props {
  active: boolean;
  intensityRef: React.MutableRefObject<number>;
  opacity: number;
}

export default function OrbVoiceRing({ active, intensityRef, opacity }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    // Size canvas to actual layout pixels, scaled for DPR
    const dpr = window.devicePixelRatio || 1;
    const W   = window.innerWidth;
    const H   = window.innerHeight - 62; // subtract navbar
    canvas.width  = W * dpr;
    canvas.height = H * dpr;
    canvas.style.width  = `${W}px`;
    canvas.style.height = `${H}px`;

    const ctx = canvas.getContext('2d')!;
    ctx.scale(dpr, dpr);

    const cx = W / 2;
    const cy = H / 2;

    // Orb visual radius ≈ 38% of shorter dimension (calibrated to the orb component)
    const BASE_R = Math.min(W, H) * 0.38;
    const BARS   = 128;

    let time  = 0;
    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      time += 0.016;

      ctx.clearRect(0, 0, W, H);

      const v = Math.max(0, Math.min(1, intensityRef.current));

      // ── Radial bar ring ──────────────────────────────────────────────────
      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;

        // Per-bar variation: two overlapping sine waves give organic speech feel
        const wave =
          Math.sin(i * 0.14 + time * 4.2) * 0.35 +
          Math.sin(i * 0.07 - time * 2.8) * 0.25 +
          Math.sin(i * 0.21 + time * 1.5) * 0.15;

        const barH = BASE_R * (0.015 + v * 0.20 * Math.max(0, 0.4 + wave));

        const x1 = cx + Math.cos(angle) * BASE_R;
        const y1 = cy + Math.sin(angle) * BASE_R;
        const x2 = cx + Math.cos(angle) * (BASE_R + barH);
        const y2 = cy + Math.sin(angle) * (BASE_R + barH);

        // Hue: 255 (violet) → 300 (magenta) based on wave + intensity
        const hue   = 255 + wave * 30 + v * 25;
        const alpha = 0.25 + v * 0.65;
        ctx.strokeStyle = `hsla(${hue}, 85%, ${55 + v * 20}%, ${alpha})`;
        ctx.lineWidth   = 1.5;
        ctx.lineCap     = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }

      // ── Pulsing glow halo at orb edge ────────────────────────────────────
      if (v > 0.05) {
        const haloR  = BASE_R * (1 + v * 0.10);
        const grad   = ctx.createRadialGradient(cx, cy, BASE_R * 0.96, cx, cy, haloR * 1.18);
        grad.addColorStop(0,   `rgba(180, 80, 255, ${v * 0.45})`);
        grad.addColorStop(0.5, `rgba(160, 60, 230, ${v * 0.20})`);
        grad.addColorStop(1,   'rgba(140, 40, 200, 0)');
        ctx.beginPath();
        ctx.arc(cx, cy, haloR * 1.18, 0, Math.PI * 2);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      // ── Thin base ring (always visible when active) ──────────────────────
      ctx.beginPath();
      ctx.arc(cx, cy, BASE_R, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(180, 100, 255, ${0.12 + v * 0.25})`;
      ctx.lineWidth   = 1;
      ctx.stroke();
    };

    draw();

    return () => cancelAnimationFrame(rafId);
  }, [active, intensityRef]);

  if (!active) return null;

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        top: 0, left: 0,
        pointerEvents: 'none',
        zIndex: 10,
        opacity,
        transition: 'opacity 0.5s ease',
      }}
    />
  );
}
