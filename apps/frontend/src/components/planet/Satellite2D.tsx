/** Flat 2D satellite icon for planet root maps (not 3D spheres) */

export interface Satellite2DProps {
  color: string;
  size?: number;
  selected?: boolean;
  hovered?: boolean;
  idSuffix?: string;
}

export function satelliteLabelOffsets(angle: number, bodyR: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  /** Extra push when label would sit over the center hub copy */
  const hubClearance = uy > 0.3 ? 26 : uy < -0.25 ? 10 : 14;
  const gap1 = bodyR + hubClearance;
  return {
    titleX: ux * gap1,
    titleY: uy * gap1,
  };
}

export function Satellite2D({
  color,
  size = 20,
  selected = false,
  hovered = false,
  idSuffix = 'sat',
}: Satellite2DProps) {
  const uid = idSuffix.replace(/[^a-zA-Z0-9_-]/g, '');
  const scale = selected ? 1.12 : hovered ? 1.06 : 1;
  const bodyW = size * 1.35 * scale;
  const bodyH = size * 0.72 * scale;
  const panelW = size * 0.55 * scale;
  const panelH = size * 0.22 * scale;

  return (
    <g className="satellite-2d" opacity={selected ? 1 : hovered ? 0.95 : 0.88}>
      <defs>
        <linearGradient id={`${uid}-panel`} x1="0%" y1="0%" x2="100%" y2="0%">
          <stop offset="0%" stopColor={color} stopOpacity="0.35" />
          <stop offset="50%" stopColor={color} stopOpacity="0.85" />
          <stop offset="100%" stopColor={color} stopOpacity="0.35" />
        </linearGradient>
      </defs>

      {/* Soft footprint — flat, not volumetric */}
      <ellipse
        rx={bodyW * 0.85}
        ry={size * 0.35}
        fill={color}
        opacity={selected ? 0.2 : 0.1}
      />

      {/* Solar panels */}
      <rect
        x={-bodyW / 2 - panelW - 2}
        y={-panelH / 2}
        width={panelW}
        height={panelH}
        rx={2}
        fill={`url(#${uid}-panel)`}
        stroke={color}
        strokeWidth={0.75}
        opacity={0.9}
      />
      <rect
        x={bodyW / 2 + 2}
        y={-panelH / 2}
        width={panelW}
        height={panelH}
        rx={2}
        fill={`url(#${uid}-panel)`}
        stroke={color}
        strokeWidth={0.75}
        opacity={0.9}
      />

      {/* Bus body */}
      <rect
        x={-bodyW / 2}
        y={-bodyH / 2}
        width={bodyW}
        height={bodyH}
        rx={4}
        fill="rgba(8,10,18,0.92)"
        stroke={color}
        strokeWidth={selected ? 2 : 1.25}
      />

      {/* Sensor dish */}
      <circle
        r={size * 0.22 * scale}
        cy={-bodyH / 2 - size * 0.12}
        fill={color}
        opacity={0.85}
      />
      <line
        x1={0}
        y1={-bodyH / 2 - size * 0.12}
        x2={0}
        y2={-bodyH / 2}
        stroke={color}
        strokeWidth={1}
        opacity={0.7}
      />

      {/* Status LED */}
      <circle
        r={2.5}
        cx={bodyW / 2 - 5}
        cy={0}
        fill={color}
        className="satellite-2d-led"
      />

      {selected && (
        <ellipse
          rx={bodyW + panelW + 8}
          ry={bodyH + 10}
          fill="none"
          stroke={color}
          strokeWidth={1}
          strokeDasharray="4 5"
          opacity={0.55}
          className="satellite-2d-orbit-ring"
        />
      )}
    </g>
  );
}

export interface SatelliteNodeLabel2DProps {
  title: string;
  sub?: string;
  color: string;
  angle: number;
  bodyR: number;
}

/** Label pill placed outward from the planet center for readability */
export function SatelliteNodeLabel2D({
  title,
  sub,
  color,
  angle,
  bodyR,
}: SatelliteNodeLabel2DProps) {
  const { titleX, titleY } = satelliteLabelOffsets(angle, bodyR);
  const displayTitle = title.length > 20 ? `${title.slice(0, 18)}…` : title;
  const pillW = Math.max(72, displayTitle.length * 6.2 + 16);
  const pillH = sub ? 34 : 20;

  return (
    <g style={{ pointerEvents: 'none' }}>
      <g transform={`translate(${titleX}, ${titleY})`}>
        <rect
          x={-pillW / 2}
          y={-pillH / 2}
          width={pillW}
          height={pillH}
          rx={5}
          fill="rgba(4,4,10,0.88)"
          stroke={color}
          strokeWidth={1}
          strokeOpacity={0.45}
        />
        <text
          textAnchor="middle"
          y={sub ? -5 : 4}
          fill="#f8fafc"
          fontSize={11}
          fontWeight={700}
        >
          {displayTitle}
        </text>
        {sub && (
          <text
            textAnchor="middle"
            y={9}
            fill="rgba(255,255,255,0.55)"
            fontSize={8}
            fontWeight={500}
          >
            {sub}
          </text>
        )}
      </g>
    </g>
  );
}
