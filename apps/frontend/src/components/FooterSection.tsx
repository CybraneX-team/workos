export default function FooterSection() {
  return (
    <div style={{
      width: '100%',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      {/* Main illustration area */}
      <div style={{
        position: 'relative', width: '100%', height: '1300px',
        overflow: 'hidden',
      }}>

        {/* Footer illustration */}
        <img
          src="/footer_illustration.png"
          alt=""
          style={{
            position: 'absolute',
            left: 0, top: '128px',
            width: '100%', height: '100%',
            objectFit: 'contain',
            objectPosition: 'center top',
            pointerEvents: 'none', zIndex: 0,
          }}
        />

        {/* Rectangle 183 */}
        <div style={{
          position: 'absolute',
          width: '100%',
          height: '200px',
          left: '0px',
          bottom: '0px',
          background: 'linear-gradient(180deg, rgba(17, 17, 17, 0) 0%, #111111 86.66%)',
          pointerEvents: 'none',
          zIndex: 101,
        }} />

        {/* Work OS — SVG */}
        <div style={{
          position: 'absolute',
          left: '-29.28px',
          bottom: '0px',
          pointerEvents: 'none',
          userSelect: 'none',
          zIndex: 100,
        }}>
          {/* <svg
            width="100%"
            height="260"
            viewBox="0 0 1400 260"
            xmlns="http://www.w3.org/2000/svg"
          >
            <defs>
              <linearGradient id="workos-stroke" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#6A65FF" />
                <stop offset="100%" stop-color="#FF9959" />
              </linearGradient>

              <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
                <feGaussianBlur stdDeviation="2" result="coloredBlur" />
                <feMerge>
                  <feMergeNode in="coloredBlur" />
                  <feMergeNode in="SourceGraphic" />
                </feMerge>
              </filter>
            </defs>

            <text
              x="50%"
              y="50%"
              text-anchor="middle"
              dominant-baseline="middle"
              font-family="'Plus Jakarta Sans', system-ui, sans-serif"
              font-weight="600"
              font-size="200"
              fill="#000"
              stroke="url(#workos-stroke)"
              stroke-width="2"
              stroke-linejoin="round"
              stroke-linecap="round"
              filter="url(#glow)"
            >
              Work OS
            </text>
          </svg> */}

          <img src="/workOS.png" alt="" className="h-[15rem]" />

        </div>

        {/* Footer links */}
        <div style={{
          position: 'absolute', left: '64px', bottom: '300px',
          zIndex: 5,
        }}>
          <p style={{
            margin: '0 0 12px', fontSize: '1rem',
            fontWeight: 600, color: '#ffffff', letterSpacing: '0.01em',
          }}>
            Company
          </p>
          {['About Us', 'Documentation', 'Return & Refund Policy'].map((link) => (
            <p key={link} style={{
              margin: '0 0 6px', fontSize: '0.9rem',
              fontWeight: 400, color: 'rgba(255,255,255,0.45)',
              cursor: 'pointer', letterSpacing: '0.01em',
            }}>
              {link}
            </p>
          ))}
        </div>
      </div>
    </div >
  );
}
