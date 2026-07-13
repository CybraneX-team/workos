import { useEffect, useRef } from 'react';
import { Mic, Loader2, AlertCircle } from 'lucide-react';
import { useVoice } from '../context/VoiceContext';
import type { VoiceState } from '../hooks/useGeminiLive';

const STATE_COLORS: Record<VoiceState, string> = {
  idle:       'rgba(30, 27, 75, 0.85)',
  connecting: 'rgba(37, 99, 235, 0.85)',
  listening:  'rgba(109, 40, 217, 0.85)',
  speaking:   'rgba(124, 58, 237, 0.9)',
  error:      'rgba(185, 28, 28, 0.85)',
};

const STATE_GLOW: Record<VoiceState, string> = {
  idle:       'rgba(99, 102, 241, 0.25)',
  connecting: 'rgba(59, 130, 246, 0.5)',
  listening:  'rgba(139, 92, 246, 0.6)',
  speaking:   'rgba(167, 139, 250, 0.7)',
  error:      'rgba(239, 68, 68, 0.5)',
};

function WaveformCanvas({ intensityRef, active }: {
  intensityRef: React.MutableRefObject<number>;
  active: boolean;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    if (!active) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d')!;
    const SIZE = 56;
    canvas.width = SIZE;
    canvas.height = SIZE;
    const cx = SIZE / 2;
    const cy = SIZE / 2;
    const R = 24;
    const BARS = 32;
    let t = 0;
    let rafId = 0;

    const draw = () => {
      rafId = requestAnimationFrame(draw);
      t += 0.016;
      ctx.clearRect(0, 0, SIZE, SIZE);
      const v = Math.max(0, Math.min(1, intensityRef.current));

      for (let i = 0; i < BARS; i++) {
        const angle = (i / BARS) * Math.PI * 2 - Math.PI / 2;
        const wave =
          Math.sin(i * 0.3 + t * 4) * 0.4 +
          Math.sin(i * 0.15 - t * 2.5) * 0.3;
        const barLen = R * (0.03 + v * 0.45 * Math.max(0, 0.3 + wave));

        const x1 = cx + Math.cos(angle) * R;
        const y1 = cy + Math.sin(angle) * R;
        const x2 = cx + Math.cos(angle) * (R + barLen);
        const y2 = cy + Math.sin(angle) * (R + barLen);

        const alpha = 0.4 + v * 0.6;
        ctx.strokeStyle = `hsla(260, 80%, ${65 + v * 20}%, ${alpha})`;
        ctx.lineWidth = 1.5;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
      }
    };
    rafId = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(rafId);
  }, [active, intensityRef]);

  if (!active) return null;
  return (
    <canvas
      ref={canvasRef}
      style={{
        position: 'absolute',
        inset: 0,
        pointerEvents: 'none',
        width: 56,
        height: 56,
      }}
    />
  );
}

export default function VoiceOrb() {
  const { voiceState, intensityRef, toggle } = useVoice();

  const isActive = voiceState === 'listening' || voiceState === 'speaking';
  const isConnecting = voiceState === 'connecting';
  const isError = voiceState === 'error';

  const label =
    voiceState === 'idle'       ? 'Talk to AI'  :
    voiceState === 'connecting' ? 'Connecting…' :
    voiceState === 'listening'  ? 'Listening…'  :
    voiceState === 'speaking'   ? 'AI speaking' :
    'Error — click to dismiss';

  return (
    <div
      style={{
        position: 'fixed',
        bottom: 24,
        right: 24,
        zIndex: 55,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        gap: 6,
        pointerEvents: 'auto',
      }}
    >
      {/* Label */}
      <span
        style={{
          fontSize: 11,
          fontWeight: 500,
          letterSpacing: '0.05em',
          color: isError ? '#fca5a5' : '#c4b5fd',
          opacity: voiceState === 'idle' ? 0.6 : 1,
          textTransform: 'uppercase',
          transition: 'opacity 0.3s',
          textShadow: '0 1px 4px rgba(0,0,0,0.8)',
          userSelect: 'none',
        }}
      >
        {label}
      </span>

      {/* Button */}
      <button
        onClick={toggle}
        title={label}
        style={{
          position: 'relative',
          width: 56,
          height: 56,
          borderRadius: '50%',
          border: `1.5px solid ${isActive ? 'rgba(167,139,250,0.6)' : isError ? 'rgba(239,68,68,0.5)' : 'rgba(99,102,241,0.35)'}`,
          background: STATE_COLORS[voiceState],
          boxShadow: `0 0 ${isActive ? 20 : 10}px ${STATE_GLOW[voiceState]}, 0 4px 16px rgba(0,0,0,0.4)`,
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          transition: 'box-shadow 0.3s, background 0.3s, border-color 0.3s',
          outline: 'none',
        }}
        className={isActive ? 'voice-orb-pulse' : ''}
      >
        <WaveformCanvas intensityRef={intensityRef} active={isActive} />

        {/* Icon */}
        <span style={{ position: 'relative', zIndex: 1, color: '#e0d7ff', display: 'flex' }}>
          {isConnecting && <Loader2 size={22} style={{ animation: 'spin 1s linear infinite' }} />}
          {isError      && <AlertCircle size={22} style={{ color: '#fca5a5' }} />}
          {!isConnecting && !isError && voiceState === 'idle'  && <Mic size={22} />}
          {!isConnecting && !isError && isActive && <Mic size={22} style={{ color: '#c4b5fd' }} />}
        </span>
      </button>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
        .voice-orb-pulse {
          animation: voice-pulse 1.8s ease-in-out infinite;
        }
        @keyframes voice-pulse {
          0%, 100% { box-shadow: 0 0 18px rgba(139,92,246,0.55), 0 4px 16px rgba(0,0,0,0.4); }
          50%       { box-shadow: 0 0 30px rgba(167,139,250,0.75), 0 4px 16px rgba(0,0,0,0.4); }
        }
      `}</style>
    </div>
  );
}
