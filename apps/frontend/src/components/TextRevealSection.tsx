import { useEffect, useRef, useState } from 'react';

const LINE1 = 'With Work OS';
const LINE2 = 'Every possibility is addressed.';
const ALL_WORDS = [...LINE1.split(' '), ...LINE2.split(' ')];
const LINE1_COUNT = LINE1.split(' ').length;

export default function TextRevealSection() {
  const outerRef = useRef<HTMLDivElement>(null);
  const [progress, setProgress] = useState(0);

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

  const activeCount = Math.floor(progress * ALL_WORDS.length);

  return (
    <div ref={outerRef} style={{ height: '300vh', width: '100%' }}>
      <div style={{
        position: 'sticky', top: 0, height: '100vh',
        background: '#111111', overflow: 'hidden',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontFamily: "'Plus Jakarta Sans', sans-serif",
      }}>
        <div style={{
          textAlign: 'center',
          padding: '0 10vw',
          userSelect: 'none', pointerEvents: 'none',
        }}>
          {/* Line 1 */}
          <p style={{
            margin: '0 0 0.1em',
            fontSize: 'clamp(2.4rem, 5.5vw, 5rem)',
            fontWeight: 300, lineHeight: 1.15,
            letterSpacing: '-0.02em', color: '#ffffff',
          }}>
            {LINE1.split(' ').map((word, i) => (
              <span key={i} style={{
                opacity: i < activeCount ? 1 : 0.1,
                transition: 'opacity 0.45s ease',
                display: 'inline',
              }}>
                {word}{i < LINE1_COUNT - 1 ? ' ' : ''}
              </span>
            ))}
          </p>

          {/* Line 2 */}
          <p style={{
            margin: 0,
            fontSize: 'clamp(2.4rem, 5.5vw, 5rem)',
            fontWeight: 300, lineHeight: 1.15,
            letterSpacing: '-0.02em', color: '#ffffff',
          }}>
            {LINE2.split(' ').map((word, i) => {
              const globalIdx = LINE1_COUNT + i;
              return (
                <span key={i} style={{
                  opacity: globalIdx < activeCount ? 1 : 0.1,
                  transition: 'opacity 0.45s ease',
                  display: 'inline',
                }}>
                  {word}{i < LINE2.split(' ').length - 1 ? ' ' : ''}
                </span>
              );
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
