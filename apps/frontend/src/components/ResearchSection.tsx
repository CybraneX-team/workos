export default function ResearchSection() {
  return (
    <div className="max-w-[95rem] mx-auto" style={{
      width: '100%', background: '#111111',
      padding: '10rem 0 0 0', boxSizing: 'border-box',
      fontFamily: "'Plus Jakarta Sans', sans-serif",
    }}>
      <div style={{
        position: 'relative', width: '100%',
        minHeight: '100vh',
        background: 'transparent',
        // backgroundImage: `radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px)`,
        backgroundSize: '28px 28px',
        overflow: 'hidden',
        display: 'flex', flexDirection: 'column',
      }}>

        {/* Header row */}
        <div style={{
          display: 'flex', alignItems: 'flex-start',
          justifyContent: 'space-between',
          padding: '56px 64px 0',
          flexShrink: 0,
        }}>
          <h2 style={{
            margin: 0,
            fontSize: 'clamp(2rem, 3.8vw, 3.2rem)',
            fontWeight: 600, color: '#ffffff',
            letterSpacing: '-0.03em', lineHeight: 1.1,
          }}>
            Achieve peak research efficiency.
          </h2>
          <span style={{
            flexShrink: 0,
            background: 'rgba(180,60,30,0.75)',
            border: '1px solid rgba(220,80,40,0.5)',
            borderRadius: '6px',
            padding: '8px 16px',
            fontSize: '0.82rem', fontWeight: 500,
            color: '#FF8A65', letterSpacing: '0.02em',
            whiteSpace: 'nowrap',
          }}>
            Adaptive Spatial Intelligence
          </span>
        </div>

        {/* Illustration fills rest of section */}
        <div style={{
          flex: 1, position: 'relative',
          display: 'flex', alignItems: 'center',
          marginTop: '8px',
        }}>
          <img
            src="/illustration.png"
            alt="Work OS framework illustration"
            style={{
              width: '100%',
              display: 'block',
              objectFit: 'contain',
            }}
          />
        </div>
      </div>
    </div>
  );
}
