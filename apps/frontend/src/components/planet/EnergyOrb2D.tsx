/** SVG energy sphere / orb for 2D planet maps */

export interface EnergyOrb2DProps {
  color: string;
  radius: number;
  intensity?: number;
  selected?: boolean;
  hovered?: boolean;
  idSuffix?: string;
}

export function EnergyOrb2D({
  color,
  radius,
  intensity = 0.85,
  selected = false,
  hovered = false,
  idSuffix = 'orb',
}: EnergyOrb2DProps) {
  const uid = idSuffix.replace(/[^a-zA-Z0-9_-]/g, '');
  const isCenter = intensity >= 1 || idSuffix === 'planet-core';
  
  // Outer radius for the halo. Center gets a bigger halo.
  const outerR = radius * (selected ? 1.6 : hovered ? 1.4 : isCenter ? 1.8 : 1.35);
  const glowOp = selected ? 1 : hovered ? 0.9 : intensity;

  return (
    <g className="energy-orb-2d">
      <defs>
        <radialGradient id={`${uid}-halo`} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor={color} stopOpacity={0.65 * glowOp} />
          <stop offset="40%" stopColor={color} stopOpacity={0.25 * glowOp} />
          <stop offset="100%" stopColor={color} stopOpacity="0" />
        </radialGradient>
        
        {/* Bright white core fading to color at the edges */}
        <radialGradient id={`${uid}-body`} cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#ffffff" stopOpacity="1" />
          <stop offset="55%" stopColor="#ffffff" stopOpacity="0.95" />
          <stop offset="85%" stopColor={color} stopOpacity="0.75" />
          <stop offset="100%" stopColor={color} stopOpacity="0.3" />
        </radialGradient>
        
        <filter id={`${uid}-glow`} x="-60%" y="-60%" width="220%" height="220%">
          <feGaussianBlur stdDeviation={isCenter ? 5 : selected ? 4 : 2.5} result="blur" />
          <feMerge>
            {isCenter && <feMergeNode in="blur" />}
            <feMergeNode in="blur" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      {/* Halo */}
      <circle r={outerR} fill={`url(#${uid}-halo)`} className="energy-orb-halo" />
      
      {/* Extra glow for the center orb */}
      {isCenter && (
        <circle r={radius * 1.4} fill={`url(#${uid}-halo)`} opacity={0.7} className="energy-orb-halo" />
      )}

      {/* Main body */}
      <circle
        r={radius}
        fill={`url(#${uid}-body)`}
        stroke={color}
        strokeWidth={selected ? 2 : hovered ? 1.5 : 1}
        strokeOpacity={0.8}
        filter={`url(#${uid}-glow)`}
        className="energy-orb-core"
      />

      {selected && (
        <circle
          r={radius + 6}
          fill="none"
          stroke={color}
          strokeWidth={1.5}
          strokeOpacity={0.6}
          strokeDasharray="4 6"
          className="energy-orb-ring-spin"
        />
      )}
    </g>
  );
}

export function measureOrbLabelPill(title: string, sub?: string) {
  const displayTitle = title.length > 22 ? `${title.slice(0, 20)}…` : title;
  const pillW = Math.max(76, displayTitle.length * 6 + 18);
  const pillH = sub ? 34 : 20;
  return { displayTitle, pillW, pillH };
}

export function orbLabelOffsets(angle: number, orbR: number) {
  const ux = Math.cos(angle);
  const uy = Math.sin(angle);
  const gap = orbR * 1.15 + 28;
  return { x: ux * gap, y: uy * gap };
}

export interface RootLabelLayoutInput {
  id: string;
  label: string;
  angle: number;
  localX: number;
  localY: number;
  relevance?: number;
}

export function computeRootLabelLayouts(
  nodes: RootLabelLayoutInput[],
  orbRFor: (relevance?: number) => number,
  coreOrbR: number,
) {
  const n = Math.max(nodes.length, 1);
  const minSin = Math.max(Math.sin(Math.PI / n), 0.26);

  type Slot = {
    id: string;
    ux: number;
    uy: number;
    localX: number;
    localY: number;
    pillW: number;
    pillH: number;
    gap: number;
  };

  const slots: Slot[] = nodes.map(node => {
    const orbR = orbRFor(node.relevance);
    const haloR = orbR * 1.15;
    const sub = node.relevance != null ? `${node.relevance}% relevance` : undefined;
    const { pillW, pillH } = measureOrbLabelPill(node.label, sub);
    const ux = Math.cos(node.angle);
    const uy = Math.sin(node.angle);
    const ringDist = Math.hypot(node.localX, node.localY);

    let gap = haloR + pillH / 2 + 18;

    const labelArcMin = pillW + 16;
    const requiredRadius = labelArcMin / (2 * minSin);
    if (ringDist + gap < requiredRadius) {
      gap = requiredRadius - ringDist;
    }

    const hubClear = coreOrbR + 44 + pillH / 2;
    const labelDist = () => Math.hypot(node.localX + ux * gap, node.localY + uy * gap);
    if (labelDist() < hubClear) {
      gap += hubClear - labelDist();
    }

    for (let pass = 0; pass < 4; pass++) {
      for (const other of nodes) {
        if (other.id === node.id) continue;
        const oOrbR = orbRFor(other.relevance) * 1.15;
        const lx = node.localX + ux * gap;
        const ly = node.localY + uy * gap;
        const d = Math.hypot(lx - other.localX, ly - other.localY);
        const minSep = oOrbR + Math.max(pillW, pillH) / 2 + 12;
        if (d < minSep) {
          gap += minSep - d;
        }
      }
    }

    return { id: node.id, ux, uy, localX: node.localX, localY: node.localY, pillW, pillH, gap };
  });

  const labelPos = (s: Slot) => ({
    x: s.localX + s.ux * s.gap,
    y: s.localY + s.uy * s.gap,
  });

  for (let pass = 0; pass < 6; pass++) {
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const a = slots[i];
        const b = slots[j];
        const pa = labelPos(a);
        const pb = labelPos(b);
        const d = Math.hypot(pa.x - pb.x, pa.y - pb.y);
        const minD = (a.pillW + b.pillW) / 2 + 10;
        if (d < minD) {
          const push = (minD - d) / 2 + 0.5;
          a.gap += push;
          b.gap += push;
        }
      }
    }
  }

  const out = new Map<string, { x: number; y: number }>();
  for (const s of slots) {
    out.set(s.id, { x: s.ux * s.gap, y: s.uy * s.gap });
  }
  return out;
}

export interface EnergyOrbLabel2DProps {
  title: string;
  sub?: string;
  color: string;
  angle: number;
  orbR: number;
  offsetX?: number;
  offsetY?: number;
  className?: string;
  compact?: boolean;
}

export function EnergyOrbLabel2D({
  title,
  sub,
  color,
  angle,
  orbR,
  offsetX,
  offsetY,
  className,
  compact = false,
}: EnergyOrbLabel2DProps) {
  const fallback = orbLabelOffsets(angle, orbR);
  const x = offsetX ?? fallback.x;
  const y = offsetY ?? fallback.y;
  const { displayTitle, pillW, pillH } = measureOrbLabelPill(title, sub);

  if (compact) {
    return (
      <g transform={`translate(${x}, ${y})`} className={className} style={{ pointerEvents: 'none' }}>
        <text
          textAnchor="middle"
          y={-4}
          fill="#f8fafc"
          fontSize={9}
          fontWeight={700}
          letterSpacing="0.06em"
        >
          {displayTitle.toUpperCase()}
        </text>
        {sub && (
          <text textAnchor="middle" y={8} fill="rgba(255,255,255,0.55)" fontSize={8} fontWeight={600}>
            {sub}
          </text>
        )}
      </g>
    );
  }

  return (
    <g transform={`translate(${x}, ${y})`} className={className} style={{ pointerEvents: 'none' }}>
      <rect
        x={-pillW / 2}
        y={-pillH / 2}
        width={pillW}
        height={pillH}
        rx={5}
        fill="rgba(4,4,12,0.9)"
        stroke={color}
        strokeWidth={1}
        strokeOpacity={0.4}
      />
      <text textAnchor="middle" y={sub ? -5 : 4} fill="#f8fafc" fontSize={11} fontWeight={700}>
        {displayTitle}
      </text>
      {sub && (
        <text textAnchor="middle" y={9} fill="rgba(255,255,255,0.5)" fontSize={8} fontWeight={500}>
          {sub}
        </text>
      )}
    </g>
  );
}
