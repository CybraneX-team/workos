export default function RolesSection() {
  return (
    <div style={{
      width: '100%', background: '#111111',
      padding: '80px 40px', boxSizing: 'border-box',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Outer card */}
      <div style={{
        position: 'relative',
        borderRadius: '20px', overflow: 'hidden',
        paddingTop: '69px', paddingLeft: '110px', paddingRight: '111px', paddingBottom: '0',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', gap: '139px',
      }}>

        {/* Background — gradient.png */}
        <img
          src="/gradient.png"
          alt=""
          style={{
            position: 'absolute', inset: 0,
            width: '100%', height: '100%',
            objectFit: 'cover',
            filter: 'blur(18px)',
            transform: 'scale(1.08)',
            pointerEvents: 'none', zIndex: 0,
          }}
        />

        {/* SVG gradient — commented out
        <svg viewBox="0 0 1879 905" fill="none" xmlns="http://www.w3.org/2000/svg"
          preserveAspectRatio="xMidYMid slice"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none', zIndex: 0 }}
        >
          <g opacity="0.5" filter="url(#filter0_bg)" style={{ mixBlendMode: 'plus-lighter' }}>
            <path d="M1582.5 450.5C1728 440.757 2063.33 44.6845 2110 4.3512C1508.33 -32.1488 -232 -56.6486 -232 15.3514C-232 105.351 98 591.5 307 591.5C516 591.5 670 367.5 911.5 367.5C1069.5 367.5 1448.12 459.498 1582.5 450.5Z" fill="url(#paint0_bg)"/>
          </g>
          <defs>
            <filter id="filter0_bg" x="-545.3" y="-344.291" width="2968.6" height="1249.09" filterUnits="userSpaceOnUse" colorInterpolationFilters="sRGB">
              <feFlood floodOpacity="0" result="BackgroundImageFix"/>
              <feColorMatrix in="SourceAlpha" type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 127 0" result="hardAlpha"/>
              <feOffset dy="4"/>
              <feGaussianBlur stdDeviation="2"/>
              <feComposite in2="hardAlpha" operator="out"/>
              <feColorMatrix type="matrix" values="0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0.25 0"/>
              <feBlend mode="normal" in2="BackgroundImageFix" result="effect1_dropShadow"/>
              <feBlend mode="normal" in="SourceGraphic" in2="effect1_dropShadow" result="shape"/>
              <feGaussianBlur stdDeviation="156.65"/>
            </filter>
            <linearGradient id="paint0_bg" x1="1875.5" y1="93.9402" x2="40.0025" y2="93.9404" gradientUnits="userSpaceOnUse">
              <stop stopColor="#5912FF"/>
              <stop offset="0.548077" stopColor="#FE6232"/>
              <stop offset="1" stopColor="#3033FF"/>
            </linearGradient>
          </defs>
        </svg>
        */}

        {/* Title */}
        <p style={{
          position: 'relative', zIndex: 1,
          margin: 0, flexShrink: 0,
          fontSize: '48px', fontWeight: 600,
          color: '#ffffff', letterSpacing: '-0.44px',
          lineHeight: 1.4, textAlign: 'center',
          whiteSpace: 'nowrap',
        }}>
          For every Skill, For Every Role
        </p>

        {/* Inner dark card */}
        <div style={{
          position: 'relative', zIndex: 1, flexShrink: 0,
          backdropFilter: 'blur(5px)',
          background: 'rgba(17,17,17,0.70)',
          borderRadius: '15px',
          padding: '62px 32px',
          height: '759px',
          display: 'flex', gap: '36px',
          width: '100%', boxSizing: 'border-box',
          fontWeight: 500,
        }}>
          {COLS.map((col) => (
            <div key={col.heading} style={{
              flex: '1 0 0', minWidth: 0,
              display: 'flex', flexDirection: 'column', gap: '42px',
            }}>
              <p style={{
                margin: 0, fontSize: '22px', fontWeight: 500,
                color: '#ffffff', letterSpacing: '-0.44px', lineHeight: 1.01,
                whiteSpace: 'nowrap',
              }}>
                {col.heading}
              </p>
              <div style={{ display: 'flex', flexDirection: 'column', gap: '28px' }}>
                {col.blocks.map((block, j) => (
                  <p key={j} style={{
                    margin: 0, fontSize: '18px', fontWeight: 500,
                    color: '#6d6d6d', lineHeight: 1.4,
                  }}
                    dangerouslySetInnerHTML={{ __html: block }}
                  />
                ))}
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

const COLS = [
  {
    heading: 'For Investors',
    blocks: [
      'For investors Work OS becomes a capital intelligence layer creating visual nodes of every sector,  It tracks every sector momentum, find emerging companies, assess risk, and make capital allocation decisions aligned to their thesis.',
      '<span style="color:#b4b4b4">Creates thesis evolution, sector heat, portfolio exposure, exit landscapes, and downside risks over time</span>',
    ],
  },
  {
    heading: 'For Founders',
    blocks: [
      'Acts as a market discovery and product strategy system finding pinpoint fault in the system, what is the cause and let you know what wedge can win.',
      '<span style="color:#b4b4b4">Shows important metrics such as competition level, growth stage,  and buying behaviour,</span> It tracks product-market fit signals, pricing experiments and fundraising readiness over time. Adapts recommendations as market conditions change',
    ],
  },
  {
    heading: 'For Career User',
    blocks: [
      'Work OS  builds your context twin, with your skills, goals, risk level and all other factors into consideration and <span style="color:#b4b4b4">turns generic data into personalized career pathfinding system. </span>',
      '<span style="color:#6d6d6d">Identifies skill gaps and suggests what to build next\nTracks career readiness over time as markets evolve.</span>',
    ],
  },
];
