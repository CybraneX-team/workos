import { useEffect, useRef, useState } from 'react';
import { gsap } from 'gsap';

// ─── Orb shadows ──────────────────────────────────────────────────────────────
const S_VIOLET = `16px 16px 46px rgba(255,54,54,0.12), 28px 61px 64.6px rgba(234,7,255,0.06), 12px -29px 64.6px rgba(255,94,7,0.08), -8px 14px 82.3px rgba(86,56,255,0.25), inset -4px -6px 15.3px #FFFFFF, inset 48px -53px 45.8px rgba(51,5,255,0.25), inset -43px -53px 45.8px rgba(255,138,5,0.25), inset -18px 10px 45.8px rgba(255,139,7,0.25), inset -21px -86px 64px rgba(78,2,255,0.25), inset -12px -20px 26.3px rgba(255,48,155,0.25), inset 0px -14px 64px rgba(66,2,255,0.25)`;
const S_ORANGE = `16px 16px 46px rgba(255,101,54,0.12), 28px 61px 64.6px rgba(255,152,7,0.06), -8px 21px 82.3px rgba(255,179,56,0.25), inset -4px -9px 15.3px #FFFFFF, inset 48px -53px 45.8px rgba(255,5,126,0.25), inset -43px -53px 45.8px rgba(255,138,5,0.25), inset -18px 10px 45.8px rgba(255,139,7,0.25), inset -21px -86px 64px rgba(78,2,255,0.25), inset -12px -20px 26.3px rgba(255,48,155,0.25), inset 0px -14px 64px rgba(66,2,255,0.25)`;
const S_BLUE = `16px 16px 46px rgba(255,94,54,0.12), 28px 61px 64.6px rgba(7,135,255,0.06), 12px -29px 64.6px rgba(7,11,255,0.08), -8px 14px 82.3px rgba(86,56,255,0.25), inset -4px -6px 15.3px #FFFFFF, inset 48px -53px 45.8px rgba(13,5,255,0.25), inset -43px -53px 45.8px rgba(5,134,255,0.25), inset -18px 10px 45.8px rgba(255,139,7,0.25), inset -21px -86px 64px rgba(78,2,255,0.25), inset -12px -20px 26.3px rgba(255,48,155,0.25), inset 0px -14px 64px rgba(66,2,255,0.25)`;

// ─── Keyframe interpolation ────────────────────────────────────────────────────
interface KF { p: number; x: number; y: number; opacity: number; }

function eio(t: number) { return t < 0.5 ? 2 * t * t : -1 + (4 - 2 * t) * t; }
function lrp(a: number, b: number, t: number) { return a + (b - a) * t; }

function interpKF(kfs: KF[], progress: number) {
  const p = Math.max(kfs[0].p, Math.min(kfs[kfs.length - 1].p, progress));
  for (let i = 0; i < kfs.length - 1; i++) {
    const a = kfs[i], b = kfs[i + 1];
    if (p >= a.p && p <= b.p) {
      const t = eio((p - a.p) / (b.p - a.p));
      return { x: lrp(a.x, b.x, t), y: lrp(a.y, b.y, t), opacity: lrp(a.opacity, b.opacity, t) };
    }
  }
  const last = kfs[kfs.length - 1];
  return { x: last.x, y: last.y, opacity: last.opacity };
}

// ─── Planet config ─────────────────────────────────────────────────────────────
// Each planet enters from a unique direction, dwells, then exits upward.
// Keyframe x = vw from left (can be negative/over 100 for off-screen)
// Keyframe y = vh from top
// At p≈0.60 all 5 are simultaneously visible — the "full constellation" moment.
const PLANETS = [
  {
    label: 'Engineering',
    description: 'Build systems that scale across complexity',
    size: 'clamp(140px,18.2vw,314px)',
    bg: 'rgba(0,0,0,0.01)', shadow: S_VIOLET, labelSide: 'right' as const,
    floatY: -14, floatX: 5, floatDur: 4.5, floatDelay: 0,
    featureStart: 0.00,
    keyframes: [
      { p: 0.00, x: -42, y: 115, opacity: 0 },  // off bottom-left
      { p: 0.14, x: 3, y: 18, opacity: 1 },  // enters left side
      { p: 0.64, x: 3, y: 18, opacity: 1 },  // holds
      { p: 0.78, x: 5, y: -55, opacity: 0 },  // exits top
    ],
  },
  {
    label: 'Pharmacy',
    description: 'Navigate drug discovery and regulatory flows',
    size: 'clamp(48px,5.6vw,96px)',
    bg: 'rgba(0,0,0,0.01)', shadow: S_VIOLET, labelSide: 'left' as const,
    floatY: -8, floatX: -4, floatDur: 3.5, floatDelay: 0.6,
    featureStart: 0.22,
    keyframes: [
      { p: 0.08, x: 105, y: -25, opacity: 0 },  // off top-right
      { p: 0.24, x: 82, y: 7, opacity: 1 },  // top-right corner
      { p: 0.70, x: 82, y: 7, opacity: 1 },
      { p: 0.84, x: 86, y: -28, opacity: 0 },  // exits top
    ],
  },
  {
    label: 'Education',
    description: 'Map learning pathways and skill ecosystems',
    size: 'clamp(90px,11.2vw,193px)',
    bg: '#FF823F', shadow: S_ORANGE, labelSide: 'right' as const,
    floatY: -11, floatX: 3, floatDur: 5.2, floatDelay: 1.1,
    featureStart: 0.36,
    keyframes: [
      { p: 0.20, x: 44, y: 132, opacity: 0 },   // from bottom center
      { p: 0.37, x: 42, y: 36, opacity: 1 },   // center
      { p: 0.74, x: 42, y: 36, opacity: 1 },
      { p: 0.89, x: 44, y: -52, opacity: 0 },
    ],
  },
  {
    label: 'Agriculture',
    description: 'Cultivate intelligent crop intelligence networks',
    size: 'clamp(64px,7.3vw,126px)',
    bg: '#FF823F', shadow: S_ORANGE, labelSide: 'right' as const,
    floatY: -9, floatX: -5, floatDur: 4.0, floatDelay: 1.7,
    featureStart: 0.46,
    keyframes: [
      { p: 0.30, x: -32, y: 80, opacity: 0 },   // from left edge
      { p: 0.46, x: 16, y: 60, opacity: 1 },   // lower-left
      { p: 0.79, x: 16, y: 60, opacity: 1 },
      { p: 0.91, x: 12, y: -32, opacity: 0 },
    ],
  },
  {
    label: 'Transportation',
    description: 'Optimize logistics from first to last mile',
    size: 'clamp(90px,11.2vw,193px)',
    bg: 'rgba(0,0,0,0.01)', shadow: S_BLUE, labelSide: 'left' as const,
    floatY: -12, floatX: 6, floatDur: 5.5, floatDelay: 2.2,
    featureStart: 0.57,
    keyframes: [
      { p: 0.40, x: 112, y: 78, opacity: 0 },  // from right edge
      { p: 0.57, x: 66, y: 54, opacity: 1 },  // right-center
      { p: 0.84, x: 66, y: 54, opacity: 1 },
      { p: 1.00, x: 68, y: 6, opacity: 0.5 }, // lingers, slow exit
    ],
  },
];

const SCROLL_HEIGHT = '600vh';

// ─── Star field ────────────────────────────────────────────────────────────────
function StarField() {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    type Star = { x: number; y: number; r: number; base: number; twinkle: number; ts: number; vx: number; vy: number };
    let stars: Star[] = [];
    let animId: number;

    const init = () => {
      canvas.width = window.innerWidth;
      canvas.height = window.innerHeight;
      stars = Array.from({ length: 130 }, () => ({
        x: Math.random() * canvas.width,
        y: Math.random() * canvas.height,
        r: Math.random() * 1.3 + 0.2,
        base: Math.random() * 0.45 + 0.08,
        twinkle: Math.random() * Math.PI * 2,
        ts: Math.random() * 0.012 + 0.004,
        vx: (Math.random() - 0.5) * 0.012,
        vy: (Math.random() - 0.5) * 0.012,
      }));
    };

    const render = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (const s of stars) {
        s.x += s.vx; s.y += s.vy; s.twinkle += s.ts;
        if (s.x < 0) s.x = canvas.width;
        if (s.x > canvas.width) s.x = 0;
        if (s.y < 0) s.y = canvas.height;
        if (s.y > canvas.height) s.y = 0;
        const op = s.base * (0.5 + 0.5 * Math.sin(s.twinkle));
        ctx.beginPath();
        ctx.arc(s.x, s.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = `rgba(255,255,255,${op.toFixed(3)})`;
        ctx.fill();
      }
      animId = requestAnimationFrame(render);
    };

    init();
    render();
    window.addEventListener('resize', init);
    return () => { cancelAnimationFrame(animId); window.removeEventListener('resize', init); };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
    />
  );
}

// ─── Main component ────────────────────────────────────────────────────────────
export default function OrbConstellation() {
  const outerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);
  const planetRefs = useRef<(HTMLDivElement | null)[]>([]);

  // Scroll progress
  useEffect(() => {
    const onScroll = () => {
      const el = outerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      const scrolled = -rect.top;
      setProgress(Math.min(1, Math.max(0, scrolled / scrollable)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  // GSAP idle float — uses transform so no conflict with left/top driven by React
  useEffect(() => {
    const anims = PLANETS.map((planet, i) => {
      const el = planetRefs.current[i];
      if (!el) return null;
      return gsap.to(el, {
        y: planet.floatY,
        x: planet.floatX,
        duration: planet.floatDur,
        repeat: -1,
        yoyo: true,
        ease: 'sine.inOut',
        delay: planet.floatDelay,
      });
    });
    return () => anims.forEach(a => a?.kill());
  }, []);

  // Compute per-planet state from scroll progress
  const states = PLANETS.map(p => interpKF(p.keyframes, progress));

  // Active planet = last one whose featureStart <= progress (deterministic, no ties)
  const activeIdx = PLANETS.reduce((acc, planet, i) =>
    planet.featureStart <= progress ? i : acc, 0
  );
  const visibleCount = states.filter(s => s.opacity > 0.45).length;
  const storyOpacity = states[activeIdx].opacity > 0.3 ? states[activeIdx].opacity : 0;

  return (
    <div ref={outerRef} style={{ height: SCROLL_HEIGHT, width: '100%' }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh', overflow: 'hidden',
        background: '#111111', fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>

        {/* Twinkling star field */}
        <StarField />

        {/* Section label */}
        <p style={{
          position: 'absolute', top: '80px', left: '50%', transform: 'translateX(-50%)', zIndex: 10,
          margin: 0, fontSize: 'clamp(2.5rem, 5vw, 3rem)',
          fontWeight: 400, color: '#ffffff', letterSpacing: '-0.01em',
        }}>
          Every node is expressive
        </p>

        {/* Planet counter */}
        <p style={{
          position: 'absolute', top: '40px', right: '60px', zIndex: 10,
          margin: 0, fontSize: '0.82rem', fontWeight: 500,
          color: 'rgba(255,255,255,0.3)', letterSpacing: '0.12em',
          opacity: visibleCount > 0 ? 1 : 0,
          transition: 'opacity 0.5s ease',
        }}>
          {String(visibleCount).padStart(2, '0')} / 05
        </p>

        {/* Planets */}
        {PLANETS.map((planet, i) => {
          const s = states[i];
          return (
            <div
              key={planet.label}
              ref={el => { planetRefs.current[i] = el; }}
              style={{
                position: 'absolute',
                left: `${s.x}vw`,
                top: `${s.y}vh`,
                width: planet.size,
                height: planet.size,
                background: planet.bg,
                boxShadow: planet.shadow,
                borderRadius: '50%',
                opacity: s.opacity,
                willChange: 'transform, opacity, left, top',
                zIndex: 2,
              }}
            >
              {/* Label chip */}
              <div style={{
                position: 'absolute', top: '50%',
                transform: 'translateY(-50%)',
                ...(planet.labelSide === 'right'
                  ? { left: 'calc(100% + 10px)' }
                  : { right: 'calc(100% + 10px)' }),
                whiteSpace: 'nowrap',
                background: 'rgba(255,255,255,0.06)',
                backdropFilter: 'blur(8px)',
                border: '1px solid rgba(255,255,255,0.1)',
                borderRadius: '6px', padding: '5px 12px',
                fontSize: '0.72rem', color: 'rgba(255,255,255,0.75)',
                letterSpacing: '0.03em',
              }}>
                {planet.label}
              </div>
            </div>
          );
        })}

        {/* Story text — bottom center, narrates active planet */}
        <div style={{
          position: 'absolute', bottom: '52px',
          left: 0, right: 0,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          gap: '6px', zIndex: 10,
          opacity: storyOpacity,
          transition: 'opacity 0.5s ease',
          pointerEvents: 'none', userSelect: 'none',
        }}>
          <p style={{
            margin: 0,
            fontSize: 'clamp(1.8rem, 3.2vw, 3rem)',
            fontWeight: 600, letterSpacing: '-0.03em',
            color: '#ffffff', lineHeight: 1,
          }}>
            {PLANETS[activeIdx].label}
          </p>
          <p style={{
            margin: 0,
            fontSize: 'clamp(0.8rem, 1.1vw, 0.95rem)',
            fontWeight: 400, color: 'rgba(255,255,255,0.4)',
            letterSpacing: '0.02em',
          }}>
            {PLANETS[activeIdx].description}
          </p>
        </div>

      </div>
    </div >
  );
}
