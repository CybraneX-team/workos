import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Lenis from 'lenis';
import { gsap } from 'gsap';
import Orb from '../components/Orb';
import OrbConstellation from '../components/OrbConstellation';
import RolesSection from '../components/RolesSection';
import ResearchSection from '../components/ResearchSection';
import TextRevealSection from '../components/TextRevealSection';
import FooterSection from '../components/FooterSection';

const REVEAL_TEXT = 'Core Industry Dynamics as a Product.';
const WORDS = REVEAL_TEXT.split(' ');
const REVEAL_START = 0.45;
const REVEAL_END   = 0.92;

// ─── Timing knobs ──────────────────────────────────────────────────────────
const MINIMIZE_DURATION = 0.9;   // seconds — orb flies to corner
const RESTORE_DURATION  = 0.9;   // seconds — orb flies back to center
const CARDS_APPEAR_DELAY = 200;  // ms after minimize completes before cards show
const CORNER_SIZE       = 80;    // px — diameter of orb in corner
const CORNER_MARGIN     = 24;    // px — distance from screen edges
// ───────────────────────────────────────────────────────────────────────────

export default function LandingNew() {
  const [insideOrb, setInsideOrb]       = useState(false);
  const [scrollProgress, setScrollProgress] = useState(0);
  const [orbMinimized, setOrbMinimized]     = useState(false);
  const [orbAnimating, setOrbAnimating]     = useState(false);
  const [showCards, setShowCards]           = useState(false);

  const orbSectionRef    = useRef<HTMLDivElement>(null);
  const orbDivRef        = useRef<HTMLDivElement>(null);
  const lenisRef         = useRef<Lenis | null>(null);
  const welcomeIntensity  = useRef(0); // driven each frame by scripted curve, no re-renders
  const intensityDriverRef = useRef(0); // rAF id — allows canceling from anywhere

  // ── Lenis smooth scroll ──────────────────────────────────────────────────
  useEffect(() => {
    const lenis = new Lenis({ lerp: 0.08, smoothWheel: true });
    lenisRef.current = lenis;
    let rafId: number;
    const raf = (time: number) => { lenis.raf(time); rafId = requestAnimationFrame(raf); };
    rafId = requestAnimationFrame(raf);
    return () => { cancelAnimationFrame(rafId); lenis.destroy(); };
  }, []);

  // ── Scroll progress ───────────────────────────────────────────────────────
  useEffect(() => {
    const onScroll = () => {
      const el = orbSectionRef.current;
      if (!el) return;
      const rect      = el.getBoundingClientRect();
      const scrollable = el.offsetHeight - window.innerHeight;
      setScrollProgress(Math.min(1, Math.max(0, -rect.top / scrollable)));
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const orbScale   = 1 + scrollProgress * 5.5;
  const orbOpacity = Math.max(0, 1 - scrollProgress * 7);
  const uiOpacity  = Math.max(0, 1 - scrollProgress * 7);

  // ── Apply scroll-driven transform directly to DOM — never via React style.
  //    This lets GSAP own the same property during animation without conflicts.
  useLayoutEffect(() => {
    const el = orbDivRef.current;
    if (!el || orbAnimating || orbMinimized) return;
    el.style.transform = `scale(${orbScale})`;
    el.style.opacity   = String(orbOpacity);
  });

  // ── Derived display values ────────────────────────────────────────────────
  const isOrbBusy       = orbAnimating || orbMinimized;
  const effectiveUiOpacity = isOrbBusy ? 0 : uiOpacity;

  // ── Word reveal ──────────────────────────────────────────────────────────
  const revealProgress    = Math.min(1, Math.max(0, (scrollProgress - REVEAL_START) / (REVEAL_END - REVEAL_START)));
  const revealTextOpacity = Math.min(1, revealProgress * 3);
  const activeWordCount   = Math.floor(revealProgress * WORDS.length);

  // ── Orb hit-test ─────────────────────────────────────────────────────────
  function isInOrb(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left - rect.width / 2;
    const y = e.clientY - rect.top  - rect.height / 2;
    return Math.sqrt(x * x + y * y) <= Math.min(rect.width, rect.height) / 2 * 0.82;
  }

  // ── Speech intensity curve — maps elapsed seconds to 0-1 loudness ────────
  function speechIntensity(t: number): number {
    if (t <= 0 || t >= 2.4) return 0;
    if (t < 0.15) return (t / 0.15) * 0.65;            // "Wel-"  ramp up
    if (t < 0.55) return 0.65 - (t - 0.15) / 0.4 * 0.2; // "-come" sustain
    if (t < 0.80) return 0.45 - (t - 0.55) / 0.25 * 0.25; // " to "  valley
    if (t < 1.10) return 0.20 + (t - 0.80) / 0.30 * 0.75; // "Work-" build
    if (t < 1.55) return 0.95 - (t - 1.10) / 0.45 * 0.55; // "-OS"   decay
    return Math.max(0, 0.40 - (t - 1.55) / 0.85 * 0.40);  // tail
  }

  // ── Minimize: welcome animation → voice → orb flies to corner ─────────────
  const triggerMinimize = () => {
    if (orbAnimating || orbMinimized) return;
    const el = orbDivRef.current;
    if (!el) return;

    lenisRef.current?.stop();

    welcomeIntensity.current = 0;

    /*
    // Speak "Welcome to Work OS"
    if ('speechSynthesis' in window) {
      window.speechSynthesis.cancel();
      const utter = new SpeechSynthesisUtterance('Welcome to Work OS');
      utter.rate   = 0.88;
      utter.pitch  = 1.05;
      utter.volume = 1.0;
      // Prefer a premium voice if available
      const pickVoice = () => {
        const voices = window.speechSynthesis.getVoices();
        return (
          voices.find(v => /Samantha|Daniel|Google UK|Google US|Aaron/i.test(v.name)) ||
          voices.find(v => v.lang.startsWith('en')) ||
          null
        );
      };
      const voice = pickVoice();
      if (voice) utter.voice = voice;
      window.speechSynthesis.speak(utter);
    }
    */

    // 3. Drive intensity ref each frame via scripted curve
    cancelAnimationFrame(intensityDriverRef.current); // kill any leftover loop from previous play
    welcomeIntensity.current = 0;
    const startTime = performance.now();
    const driveIntensity = () => {
      const t = (performance.now() - startTime) / 1000;
      if (t >= 2.4) {
        welcomeIntensity.current = 0; // explicit zero — orb stops reacting
        return;
      }
      welcomeIntensity.current = speechIntensity(t);
      intensityDriverRef.current = requestAnimationFrame(driveIntensity);
    };
    intensityDriverRef.current = requestAnimationFrame(driveIntensity);

    // 4. After ~600ms (orb has been reacting), start the minimize flight
    const WELCOME_HOLD_MS = 600;
    setTimeout(() => {
      setOrbAnimating(true);

      const W = window.innerWidth;
      const H = window.innerHeight;
      const navH = 62;

      const dx = (W - CORNER_MARGIN - CORNER_SIZE / 2) - W / 2;
      const dy = (H - CORNER_MARGIN - CORNER_SIZE / 2) - (navH + (H - navH) / 2);
      const visualDiameter = Math.min(W, H - navH) * 0.72;
      const targetScale    = CORNER_SIZE / visualDiameter;

      gsap.killTweensOf(el);
      gsap.set(el, { x: 0, y: 0, scale: 1 }); // sync GSAP internal state to DOM
      gsap.to(el, {
          x: dx, y: dy, scale: targetScale,
          duration: MINIMIZE_DURATION,
          ease: 'power3.inOut',
          onComplete: () => {
            setOrbAnimating(false);
            setOrbMinimized(true);
            setTimeout(() => setShowCards(true), CARDS_APPEAR_DELAY);
          },
        }
      );
    }, WELCOME_HOLD_MS);
  };

  // ── Restore: orb flies back to center ────────────────────────────────────
  const triggerRestore = () => {
    if (orbAnimating) return;
    // Kill any running intensity loop immediately
    cancelAnimationFrame(intensityDriverRef.current);
    intensityDriverRef.current = 0;
    welcomeIntensity.current = 0;
    // window.speechSynthesis?.cancel();
    setShowCards(false);
    setOrbMinimized(false);
    setOrbAnimating(true);

    const el = orbDivRef.current;
    if (!el) return;

    gsap.killTweensOf(el);
    gsap.to(el, {
      x: 0, y: 0, scale: 1,
      duration: RESTORE_DURATION,
      ease: 'power3.inOut',
      onComplete: () => {
        setOrbAnimating(false);
        lenisRef.current?.start();
      },
    });
  };

  const handleOrbClick = (e: React.MouseEvent<HTMLDivElement>) => {
    if (orbMinimized) { triggerRestore(); return; }
    if (!isInOrb(e))  return;
    triggerMinimize();
  };

  const navigate = useNavigate();

  // ── Orb AI voice: speaks any text, drives orb boundary via oscillating intensity ──
  const speakWithOrb = (_text: string) => {
    /*
    if (!('speechSynthesis' in window)) return;
    window.speechSynthesis.cancel();
    cancelAnimationFrame(intensityDriverRef.current);
    intensityDriverRef.current = 0;
    welcomeIntensity.current = 0;

    const utter = new SpeechSynthesisUtterance(text);
    utter.rate = 0.88; utter.pitch = 1.05; utter.volume = 1.0;
    const voices = window.speechSynthesis.getVoices();
    const voice = voices.find(v => /Samantha|Daniel|Google UK|Google US|Aaron/i.test(v.name))
      || voices.find(v => v.lang.startsWith('en')) || null;
    if (voice) utter.voice = voice;

    // Start driver immediately — don't wait for onstart (async, unreliable on some browsers)
    const driveStart = performance.now();
    const drive = () => {
      const t = (performance.now() - driveStart) / 1000;
      // Ramp in first 80ms to avoid abrupt jump
      const ramp = Math.min(1, t / 0.08);
      welcomeIntensity.current =
        ramp * (0.25 + 0.30 * Math.abs(Math.sin(t * 6.8)) * (0.65 + 0.35 * Math.sin(t * 2.9 + 1.1)));
      intensityDriverRef.current = requestAnimationFrame(drive);
    };
    intensityDriverRef.current = requestAnimationFrame(drive);

    utter.onend = utter.onerror = () => {
      cancelAnimationFrame(intensityDriverRef.current);
      intensityDriverRef.current = 0;
      // Smooth ramp-out over 200ms
      const fadeStart = performance.now();
      const lastVal = welcomeIntensity.current;
      const fade = () => {
        const p = Math.min(1, (performance.now() - fadeStart) / 200);
        welcomeIntensity.current = lastVal * (1 - p);
        if (p < 1) intensityDriverRef.current = requestAnimationFrame(fade);
        else { welcomeIntensity.current = 0; intensityDriverRef.current = 0; }
      };
      intensityDriverRef.current = requestAnimationFrame(fade);
    };

    window.speechSynthesis.speak(utter);
    */
  };

  // Speak greeting when choose-path screen appears
  useEffect(() => {
    if (!showCards) return;
    const t = setTimeout(() => speakWithOrb('Choose your path to enter Work OS.'), 300);
    return () => clearTimeout(t);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showCards]);

  const ROLE_CARDS: { label: string; sub: string; route: string; voiceHint: string; highlight?: boolean; external?: boolean }[] = [
    {
      label: 'VC',
      sub: 'Portfolio & deal flow intelligence',
      route: '/auth/vc',
      voiceHint: 'Venture capital mode. Access portfolio intelligence and deal flow analytics.',
    },
    {
      label: 'Incubator',
      sub: 'Build & track your digital twin',
      route: '/auth/incubator',
      voiceHint: 'Incubator mode. Manage institutional capital allocation and investment tracking.',
    },
    {
      label: 'Company',
      sub: 'Build & track your digital twin',
      route: '/3d',
      voiceHint: 'Company mode. Build and monitor your digital twin in real time.',
    },
    // { label: 'Unicorn Simulator', sub: 'Explore the 3D galaxy universe', route: 'https://unicornsimulator.com', voiceHint: 'Explore the unicorn galaxy universe.', highlight: true, external: true },
  ];

  return (
    <div style={{ width: '100%', background: '#111111', fontFamily: "'Plus Jakarta Sans', sans-serif" }}>

      {/* ── Navbar ── */}
      <header style={{
        position: 'fixed', top: 0, left: 0, right: 0, zIndex: 100,
        height: '62px', display: 'flex', alignItems: 'center',
        justifyContent: 'space-between', padding: '30px 80px',
        background: 'rgba(10,10,10,0.7)', backdropFilter: 'blur(12px)',
        opacity: effectiveUiOpacity,
        transition: isOrbBusy ? 'opacity 0.3s ease' : 'none',
        pointerEvents: showCards ? 'none' : 'auto',
      }}>
        {/* <span style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.45)', letterSpacing: '0.04em' }}>Company</span> */}
        <span style={{ fontSize: '1rem', fontWeight: 600, color: '#ffffff', letterSpacing: '0.18em' }}>WORK OS</span>
        <button onClick={() => navigate('/auth')} style={{
          padding: '10px 24px', borderRadius: '999px', border: 'none',
          background: '#ffffff', color: '#0a0a0a', fontSize: '0.8rem',
          fontWeight: 600, cursor: 'pointer', letterSpacing: '0.02em',
          fontFamily: "'Plus Jakarta Sans', sans-serif",
        }}>Try Demo</button>
      </header>

      {/* ── Orb scroll zone ── */}
      <div ref={orbSectionRef} style={{ height: '320vh' }}>
        <div style={{
          position: 'sticky', top: 0, height: '100vh',
          overflow: isOrbBusy ? 'visible' : 'hidden',
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', paddingTop: '62px',
          // Lift stacking context so orb renders above fixed overlay
          zIndex: orbMinimized ? 401 : 'auto',
          // Pass clicks through to overlay when minimized (back button etc.)
          pointerEvents: orbMinimized ? 'none' : 'auto',
        }}>

          {/* hero_bg.svg — fixed to sticky container, NOT inside orb div so it stays put */}
          <img src="/hero_bg.svg" alt="" style={{
            position: 'absolute', bottom: -140, left: '50%',
            transform: 'translateX(-50%)', width: '100%',
            pointerEvents: 'none', zIndex: 0,
            opacity: isOrbBusy ? 0 : orbOpacity,
          }} />

          {/* Orb div — transform owned by useLayoutEffect (scroll) or GSAP (animation).
              Never set transform in React style to avoid conflicts. */}
          <div
            ref={orbDivRef}
            onMouseMove={(e) => setInsideOrb(isInOrb(e))}
            onMouseLeave={() => setInsideOrb(false)}
            onClick={handleOrbClick}
            style={{
              width: '100%', flex: 1, position: 'relative',
              willChange: 'transform, opacity',
              zIndex: 1, pointerEvents: 'auto',
              cursor: orbMinimized
                ? 'pointer'
                : (insideOrb && !orbAnimating ? 'pointer' : 'default'),
            }}
          >
            <div style={{ position: 'relative', width: '100%', height: '100%', zIndex: 1 }}>
              <Orb hoverIntensity={0} rotateOnHover={false} hue={0} forceHoverState={false} intensityRef={welcomeIntensity} />
            </div>
          </div>

          {/* Hero text — outside scaling div, only fades */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 2,
            display: 'flex', flexDirection: 'column',
            alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', userSelect: 'none',
            opacity: effectiveUiOpacity,
            transition: isOrbBusy ? 'opacity 0.3s ease' : 'none',
          }}>
            <h1 style={{ margin: 0, fontSize: 'clamp(2.5rem, 6vw, 5rem)', fontWeight: 300, letterSpacing: '0.02em', color: '#ffffff', lineHeight: 1 }}>
              Work OS
            </h1>
            <p style={{ margin: '0.75rem 0 0', fontSize: 'clamp(0.85rem, 1.5vw, 1.1rem)', fontWeight: 400, letterSpacing: '0.08em', color: 'rgba(255,255,255,0.55)' }}>
              One System. Infinite Opportunities.
            </p>
          </div>

          {/* Enter pill — bottom-center */}
          {!isOrbBusy && (
            <button onClick={triggerMinimize} style={{
              position: 'absolute', bottom: '37vh', left: '50%',
              transform: 'translateX(-50%)',
              zIndex: 5, opacity: effectiveUiOpacity,
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '11px 28px', borderRadius: '999px',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.18)',
              backdropFilter: 'blur(12px)',
              color: 'rgba(255,255,255,0.75)',
              fontSize: '0.82rem', fontWeight: 500,
              letterSpacing: '0.06em', cursor: 'pointer',
              fontFamily: "'Plus Jakarta Sans', sans-serif",
              transition: 'background 0.2s, border-color 0.2s, color 0.2s',
            }}
            onMouseEnter={e => {
              e.currentTarget.style.background    = 'rgba(255,255,255,0.12)';
              e.currentTarget.style.borderColor   = 'rgba(255,255,255,0.35)';
              e.currentTarget.style.color         = '#fff';
            }}
            onMouseLeave={e => {
              e.currentTarget.style.background    = 'rgba(255,255,255,0.06)';
              e.currentTarget.style.borderColor   = 'rgba(255,255,255,0.18)';
              e.currentTarget.style.color         = 'rgba(255,255,255,0.75)';
            }}>
              Experience Work OS
              <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                <path d="M2.5 7h9M7.5 3.5L11 7l-3.5 3.5" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
              </svg>
            </button>
          )}

          {/* Reveal text */}
          <div style={{
            position: 'absolute', inset: 0, zIndex: 10,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            pointerEvents: 'none', userSelect: 'none',
            opacity: revealTextOpacity, padding: '0 10vw',
          }}>
            <p style={{ margin: 0, textAlign: 'center', fontSize: 'clamp(2rem, 4.5vw, 3.8rem)', fontWeight: 500, lineHeight: 1.2, color: '#ffffff' }}>
              {WORDS.map((word, i) => (
                <span key={i} style={{ opacity: i <= activeWordCount ? 1 : 0.08, transition: 'opacity 0.4s ease', display: 'inline' }}>
                  {word}{i < WORDS.length - 1 ? ' ' : ''}
                </span>
              ))}
            </p>
          </div>

        </div>
      </div>

      {/* ── Choose-path overlay ── */}
      {showCards && (
        <>
          <style>{`
            @keyframes cpFadeIn   { from { opacity:0 } to { opacity:1 } }
            @keyframes cpSlideUp  { from { opacity:0; transform:translateY(32px) } to { opacity:1; transform:translateY(0) } }
            @keyframes cpCardIn   {
              from { opacity:0; transform:translateY(40px) scale(0.94) }
              to   { opacity:1; transform:translateY(0)   scale(1)     }
            }
            @keyframes cpPulse {
              0%,100% { opacity:0.5; transform:scale(1) }
              50%      { opacity:1;   transform:scale(1.15) }
            }
            .cp-card {
              position: relative;
              background: rgba(255,255,255,0.035);
              border: 1px solid rgba(255,255,255,0.09);
              border-radius: 20px;
              width: 210px;
              padding: 32px 24px 28px;
              cursor: pointer;
              display: flex; flex-direction: column; align-items: flex-start; gap: 0;
              backdrop-filter: blur(20px);
              transition: transform 0.3s cubic-bezier(0.34,1.56,0.64,1),
                          box-shadow 0.3s ease,
                          border-color 0.3s ease,
                          background 0.3s ease;
              font-family: 'Plus Jakarta Sans', sans-serif;
              text-align: left;
              color: #fff;
              outline: none;
            }
            .cp-card::before {
              content: '';
              position: absolute; inset: 0;
              border-radius: 20px;
              padding: 1px;
              background: linear-gradient(135deg, rgba(168,85,247,0) 0%, rgba(168,85,247,0) 100%);
              -webkit-mask: linear-gradient(#fff 0 0) content-box, linear-gradient(#fff 0 0);
              -webkit-mask-composite: xor;
              mask-composite: exclude;
              transition: background 0.3s ease;
              pointer-events: none;
            }
            .cp-card:hover {
              transform: translateY(-6px) scale(1.02);
              background: rgba(120,50,220,0.12);
              border-color: rgba(168,85,247,0.4);
              box-shadow: 0 20px 60px rgba(100,30,200,0.25), 0 0 0 1px rgba(168,85,247,0.2);
            }
            .cp-card:hover::before {
              background: linear-gradient(135deg, rgba(168,85,247,0.6) 0%, rgba(236,72,153,0.3) 100%);
            }
            .cp-card-arrow {
              opacity: 0;
              transform: translateX(-6px);
              transition: opacity 0.25s ease, transform 0.25s ease;
            }
            .cp-card:hover .cp-card-arrow {
              opacity: 1;
              transform: translateX(0);
            }
          `}</style>

          {/* Backdrop */}
          <div
            onClick={(e) => { if (e.target === e.currentTarget) triggerRestore(); }}
            style={{
              position: 'fixed', inset: 0, zIndex: 300,
              // background: 'radial-gradient(ellipse at 50% 45%, rgba(70,15,110,0.45) 0%, rgba(8,4,16,0.92) 55%, rgba(4,2,8,0.97) 100%)',
              backdropFilter: 'blur(6px)',
              animation: 'cpFadeIn 0.5s ease forwards',
              overflow: 'hidden',
            }}
          >
            {/* Subtle grid lines */}
            <div style={{
              position: 'absolute', inset: 0, pointerEvents: 'none',
              backgroundImage: 'linear-gradient(rgba(168,85,247,0.04) 1px, transparent 1px), linear-gradient(90deg, rgba(168,85,247,0.04) 1px, transparent 1px)',
              backgroundSize: '60px 60px',
            }} />

            {/* Center glow */}
            {/* <div style={{
              position: 'absolute', left: '50%', top: '42%',
              width: '600px', height: '400px',
              transform: 'translate(-50%,-50%)',
              background: 'radial-gradient(ellipse, rgba(120,40,200,0.18) 0%, transparent 70%)',
              pointerEvents: 'none',
            }} /> */}

            {/* Content */}
            <div style={{
              position: 'relative', zIndex: 1,
              display: 'flex', flexDirection: 'column',
              alignItems: 'center', justifyContent: 'center',
              height: '100%', gap: '0', padding: '0 24px',
            }}>


              {/* Title */}
              <div style={{ textAlign: 'center', marginBottom: '8px', animation: 'cpSlideUp 0.5s ease 0.1s both' }}>
                <h2 style={{
                  margin: 0, fontFamily: "'Plus Jakarta Sans', sans-serif",
                  fontSize: 'clamp(1.8rem, 3.5vw, 2.8rem)', fontWeight: 300,
                  color: '#ffffff', letterSpacing: '-0.01em', lineHeight: 1.1,
                }}>
                  Select your role
                </h2>
                <p style={{
                  margin: '10px 0 0', fontSize: '0.82rem', fontWeight: 400,
                  color: 'rgba(255,255,255,0.38)', letterSpacing: '0.06em',
                  fontFamily: "'Plus Jakarta Sans', sans-serif",
                }}>
                  Each path unlocks a tailored Work OS experience
                </p>
              </div>

              {/* Cards row */}
              <div style={{ display: 'flex', gap: '16px', flexWrap: 'wrap', justifyContent: 'center', marginTop: '36px' }}>
                {ROLE_CARDS.map((card, i) => (
                  <button
                    key={card.label}
                    className="cp-card"
                    onMouseEnter={() => speakWithOrb(card.voiceHint)}
                    onClick={() => card.external
                      ? window.open(card.route, '_blank', 'noopener,noreferrer')
                      : navigate(card.route)}
                    style={{ animation: `cpCardIn 0.6s cubic-bezier(0.16,1,0.3,1) ${0.18 + i * 0.1}s both` }}
                  >
                    {/* Icon */}
                    <div style={{
                      width: '44px', height: '44px', borderRadius: '12px',
                      // background: 'rgba(168,85,247,0.12)',
                      // border: '1px solid rgba(168,85,247,0.2)',
                      position: 'absolute', bottom: '15%', right: '15%',
                      opacity: 0.5,
                      transition: 'opacity 0.2s ease',
                    }}>
                      {card.label === 'VC' && (
                        <svg width="60" height="60" viewBox="0 0 22 22" fill="none">
                          <polyline points="2,16 8,9 13,13 20,5" stroke="url(#vc-g)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                          <circle cx="20" cy="5" r="2" fill="url(#vc-g)"/>
                          <defs><linearGradient id="vc-g" x1="2" y1="16" x2="20" y2="5" gradientUnits="userSpaceOnUse"><stop stopColor="#a855f7"/><stop offset="1" stopColor="#ec4899"/></linearGradient></defs>
                        </svg>
                      )}
                      {card.label === 'Incubator' && (
                        <svg width="60" height="60" viewBox="0 0 22 22" fill="none">
                          <rect x="2" y="13" width="5" height="7" rx="1.5" fill="url(#inv-g)" opacity="0.5"/>
                          <rect x="8.5" y="9" width="5" height="11" rx="1.5" fill="url(#inv-g)" opacity="0.75"/>
                          <rect x="15" y="4" width="5" height="16" rx="1.5" fill="url(#inv-g)"/>
                          <defs><linearGradient id="inv-g" x1="2" y1="20" x2="20" y2="4" gradientUnits="userSpaceOnUse"><stop stopColor="#a855f7"/><stop offset="1" stopColor="#818cf8"/></linearGradient></defs>
                        </svg>
                      )}
                      {card.label === 'Company' && (
                        <svg width="60" height="60" viewBox="0 0 22 22" fill="none">
                          <path d="M11 2L20 7V15L11 20L2 15V7L11 2Z" stroke="url(#co-g)" strokeWidth="1.5" strokeLinejoin="round"/>
                          <path d="M11 2V20M2 7L11 12L20 7" stroke="url(#co-g)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                          <defs><linearGradient id="co-g" x1="2" y1="2" x2="20" y2="20" gradientUnits="userSpaceOnUse"><stop stopColor="#a855f7"/><stop offset="1" stopColor="#22d3ee"/></linearGradient></defs>
                        </svg>
                      )}
                    </div>

                    {/* Label */}
                    <span style={{ fontSize: '1.5rem', fontWeight: 700, color: '#ffffff', letterSpacing: '-0.01em', marginBottom: '6px', display: 'block' }}>
                      {card.label}
                    </span>

                    {/* Sub */}
                    <span style={{ fontSize: '1rem', fontWeight: 400, color: 'rgba(255,255,255,0.38)', lineHeight: 1.5, letterSpacing: '0.01em', display: 'block', marginBottom: '24px' }}>
                      {card.sub}
                    </span>

                    {/* Enter link */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: '6px', marginTop: 'auto' }}>
                      <span style={{ fontSize: '0.75rem', fontWeight: 600, color: 'rgba(168,85,247,0.8)', letterSpacing: '0.04em' }}>Enter</span>
                      <svg className="cp-card-arrow" width="14" height="14" viewBox="0 0 14 14" fill="none">
                        <path d="M2 7h10M8 3.5L11.5 7 8 10.5" stroke="rgba(168,85,247,0.8)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                  </button>
                ))}
              </div>

              {/* Back */}
              <button
                onClick={triggerRestore}
                style={{
                  marginTop: '36px',
                  display: 'flex', alignItems: 'center', gap: '6px',
                  padding: '9px 22px', borderRadius: '999px',
                  background: 'transparent',
                  border: '1px solid rgba(255,255,255,0.12)',
                  color: 'rgba(255,255,255,0.35)',
                  fontSize: '0.75rem', fontWeight: 500, cursor: 'pointer',
                  fontFamily: "'Plus Jakarta Sans', sans-serif", letterSpacing: '0.05em',
                  animation: `cpSlideUp 0.5s ease ${0.2 + ROLE_CARDS.length * 0.1}s both`,
                  transition: 'color 0.2s, border-color 0.2s, background 0.2s',
                }}
                onMouseEnter={e => { e.currentTarget.style.color='rgba(255,255,255,0.7)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.3)'; }}
                onMouseLeave={e => { e.currentTarget.style.color='rgba(255,255,255,0.35)'; e.currentTarget.style.borderColor='rgba(255,255,255,0.12)'; }}
              >
                <svg width="12" height="12" viewBox="0 0 12 12" fill="none">
                  <path d="M9 6H3M5.5 3L2 6l3.5 3" stroke="currentColor" strokeWidth="1.4" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
                Go back
              </button>

            </div>
          </div>
        </>
      )}

      <OrbConstellation />
      <RolesSection />
      <ResearchSection />
      <TextRevealSection />
      <FooterSection />
    </div>
  );
}
