import type { PlanetCoreDetails } from '../../data/companyPlanetRoots';

export interface PlanetCoreOrb2DProps {
  details: PlanetCoreDetails;
  industryColor: string;
  opacity?: number;
  size?: number;
}

/** Flat 2D hub station at planet center with role-specific details below */
export function PlanetCoreOrb2D({
  details,
  industryColor,
  opacity = 1,
  size = 72,
}: PlanetCoreOrb2DProps) {
  const hub = size;
  const ring = size * 1.35;

  return (
    <div
      className="planet-core-hub"
      style={{
        width: ring * 2,
        minHeight: ring * 2,
        opacity,
        transition: 'opacity 0.48s ease-out',
      }}
    >
      <div
        className="planet-core-hub-station"
        style={{ width: ring * 2, height: ring * 2 }}
      >
        <div
          className="planet-core-hub-ring"
          style={{ borderColor: `${industryColor}44` }}
        />
        <div
          className="planet-core-hub-dish"
          style={{
            borderColor: industryColor,
            background: `linear-gradient(180deg, ${industryColor}55 0%, rgba(8,10,18,0.95) 100%)`,
          }}
        >
          <div
            className="planet-core-hub-body"
            style={{
              width: hub,
              height: hub * 0.55,
              borderColor: `${industryColor}99`,
              boxShadow: `0 0 20px ${industryColor}35`,
            }}
          >
            <span
              className="planet-core-hub-pulse"
              style={{ background: industryColor }}
            />
          </div>
        </div>
      </div>

      <div className="planet-core-hub-details">
        <span
          className="planet-core-hub-tag"
          style={{ color: industryColor, borderColor: `${industryColor}55` }}
        >
          {details.roleTag}
        </span>
        <p className="planet-core-hub-name">{details.headline}</p>
        <p className="planet-core-hub-sub" style={{ color: industryColor }}>
          {details.subline}
        </p>
        <div className="planet-core-hub-metrics">
          {details.metrics.map(m => (
            <div key={m.label} className="planet-core-hub-metric">
              <span className="planet-core-hub-metric-val">{m.value}</span>
              <span className="planet-core-hub-metric-lbl">{m.label}</span>
            </div>
          ))}
        </div>
        <p className="planet-core-hub-focus">{details.focusHint}</p>
      </div>

      <style>{`
        .planet-core-hub {
          position: relative;
          display: flex;
          flex-direction: column;
          align-items: center;
          pointer-events: none;
        }
        .planet-core-hub-station {
          position: relative;
          display: flex;
          align-items: center;
          justify-content: center;
          flex-shrink: 0;
        }
        .planet-core-hub-ring {
          position: absolute;
          inset: 8%;
          border-radius: 50%;
          border: 1px dashed;
          animation: hubRingSpin 24s linear infinite;
        }
        .planet-core-hub-dish {
          width: 58%;
          height: 58%;
          border-radius: 50%;
          border: 2px solid;
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .planet-core-hub-body {
          border-radius: 6px;
          border: 1.5px solid;
          background: rgba(6, 8, 16, 0.95);
          display: flex;
          align-items: center;
          justify-content: center;
        }
        .planet-core-hub-pulse {
          width: 8px;
          height: 8px;
          border-radius: 50%;
          animation: hubPulse 2s ease-in-out infinite;
        }
        .planet-core-hub-details {
          margin-top: 12px;
          text-align: center;
          width: min(280px, 72vw);
        }
        .planet-core-hub-tag {
          display: inline-block;
          font-size: 9px;
          font-weight: 700;
          letter-spacing: 0.14em;
          text-transform: uppercase;
          padding: 3px 10px;
          border-radius: 999px;
          border: 1px solid;
          background: rgba(0,0,0,0.65);
        }
        .planet-core-hub-name {
          margin: 8px 0 2px;
          font-size: 16px;
          font-weight: 700;
          color: #fff;
          line-height: 1.25;
        }
        .planet-core-hub-sub {
          margin: 0;
          font-size: 10px;
          font-weight: 600;
        }
        .planet-core-hub-metrics {
          display: flex;
          justify-content: center;
          flex-wrap: wrap;
          gap: 12px 18px;
          margin-top: 10px;
        }
        .planet-core-hub-metric {
          display: flex;
          flex-direction: column;
          align-items: center;
          min-width: 64px;
        }
        .planet-core-hub-metric-val {
          font-size: 13px;
          font-weight: 700;
          color: #f4f4f5;
          line-height: 1.2;
        }
        .planet-core-hub-metric-lbl {
          font-size: 7px;
          color: rgba(255,255,255,0.5);
          text-transform: uppercase;
          letter-spacing: 0.08em;
          margin-top: 3px;
          max-width: 72px;
          text-align: center;
        }
        .planet-core-hub-focus {
          margin: 10px 0 0;
          font-size: 8px;
          color: rgba(255,255,255,0.38);
          letter-spacing: 0.05em;
          line-height: 1.4;
        }
        @keyframes hubRingSpin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
        @keyframes hubPulse {
          0%, 100% { opacity: 1; transform: scale(1); }
          50% { opacity: 0.5; transform: scale(0.85); }
        }
      `}</style>
    </div>
  );
}
