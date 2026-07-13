import { useEffect, useId, useRef, useState, type CSSProperties, type ReactNode } from 'react';

/**
 * Liquid-glass panel built on the technique described in
 * https://aave.com/design/building-glass-for-the-web:
 *
 *  - A single `feDisplacementMap` primitive does the real work. It reads a
 *    generated map where the red channel encodes horizontal displacement
 *    and the green channel encodes vertical displacement, and pushes each
 *    pixel of the *actual rendered content* (not a copy of it) by that
 *    amount. Outside the lens the map sits at a neutral (128,128), so nothing
 *    there moves — only the rim bends, text stays selectable, the DOM under
 *    the glass is the DOM that moves.
 *  - Three displacement passes at slightly different `scale` values,
 *    isolated per-channel and screen-blended back together, give the faint
 *    chromatic fringe real curved glass shows at its edges.
 *  - `feSpecularLighting` off the same (blurred) map adds a highlight that
 *    keeps the glass legible against whatever is behind it, clipped to the
 *    panel's own alpha so it doesn't bloom past the rounded corners.
 *  - The map is only ever computed for its top-left quadrant and mirrored
 *    into the other three — a plain rounded rect has four-fold symmetry, so
 *    this cuts per-pixel work to a quarter, which is what keeps map
 *    regeneration inside the frame budget on a squish/resize.
 *  - Safari caches SVG filter output by `id`; we mint a fresh id on every
 *    regeneration so it never serves a stale, frozen frame.
 *
 * Two refinements from https://atlaspuplabs.com/blog/liquid-glass-but-in-css:
 * a `feTurbulence`-driven wobble layered on top of the geometric bulge so the
 * rim reads as liquid rather than a perfectly mathematical lens, and a
 * `contrast()` pass alongside `saturate()` on the backdrop blur for the
 * slightly washed-out vibrancy real glass has.
 */
interface LiquidGlassProps {
  children?: ReactNode;
  className?: string;
  style?: CSSProperties;
  /** Corner radius in px — should match the element's visual border-radius. */
  radius?: number;
  /** Bottom-corner radius, if different from `radius` (e.g. a panel flush against another edge). Defaults to `radius`. */
  bottomRadius?: number;
  /** How many px inward from the edge the bulge/refraction extends. */
  depth?: number;
  /** Falloff exponent — higher stays flatter longer, then curves sharply at the rim. */
  curvature?: number;
  /** 0–1: how much corner pixels bulge radially (1) vs. push straight out from the nearest edge (0). */
  splay?: number;
  /**
   * Max pixel displacement at the rim, i.e. the feDisplacementMap `scale`.
   * The generated map itself always holds a fixed full-range unit vector
   * field, so this can be changed on every render (hover/press states,
   * springs, etc.) without ever touching the canvas or the filter id.
   */
  scale?: number;
  /** Per-channel scale offset (px) around `scale` — the source of the chromatic fringe. */
  chroma?: number;
  /** Extra blur (px) baked into the map before it drives the filter. */
  blur?: number;
  /** Specular highlight strength (0–1). */
  glow?: number;
  /** Opacity of the specular highlight once clipped to the panel (0–1). */
  edgeHighlight?: number;
  /** Light direction for the specular highlight and Fresnel rim, in degrees (0 = from the right, 90 = from the top). */
  specularAngle?: number;
  /** Organic wobble (px) layered on top of the geometric bulge via feTurbulence, so the rim doesn't read as a perfect lens. 0 disables it. */
  turbulence?: number;
  /** Noise frequency for the turbulence wobble — lower is slower/larger waves. */
  turbulenceFrequency?: number;
  /** Backdrop saturation multiplier. */
  saturation?: number;
  /** Backdrop contrast multiplier — real glass slightly flattens contrast. */
  contrast?: number;
  /** Plain CSS backdrop-blur (px) layered on top of the distortion — Tailwind's `blur-md` is 12px. 0 disables it. */
  backdropBlur?: number;
  /** Safety ceiling on the map's rendered pixel size — Safari breaks or drops filters past a platform-dependent limit. */
  maxSourceSize?: number;
  /**
   * Outer drop-shadow(s) for the rim, as a raw `box-shadow` value (no `inset`).
   * The default is tuned for card/button-sized surfaces — its 56px blur
   * radius reads as a subtle lift there, but visibly balloons a small pill
   * (e.g. a tab chip) into a much bigger-looking blob. Pass a lighter value
   * for compact elements.
   */
  outerShadow?: string;
}

function supportsSvgBackdropFilter(): boolean {
  if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
  try {
    return CSS.supports('backdrop-filter', 'url(#a)') || CSS.supports('-webkit-backdrop-filter', 'url(#a)');
  } catch {
    return false;
  }
}

/**
 * Computes only the left half of the displacement map and mirrors it onto
 * the right (a rounded rect is always left-right symmetric), writing
 * R = 128 + dx, G = 128 + dy directly into the shared ImageData buffer.
 * Top and bottom corners take independent radii so panels flush against
 * another edge (rounded on top only, say) still get the right bulge shape —
 * that rules out mirroring top-to-bottom too, so this is a 2x saving
 * rather than the 4x a fully symmetric shape would allow.
 */
function paintDisplacementHalf(
  data: Uint8ClampedArray,
  w: number,
  h: number,
  topRadius: number,
  bottomRadius: number,
  depth: number,
  curvature: number,
  splay: number,
) {
  const rTop = Math.min(topRadius, w / 2, h / 2);
  const rBottom = Math.min(bottomRadius, w / 2, h / 2);
  const halfW = Math.ceil(w / 2);

  const writePixel = (x: number, y: number, dx: number, dy: number) => {
    if (x < 0 || y < 0 || x >= w || y >= h) return;
    const idx = (y * w + x) * 4;
    data[idx] = Math.max(0, Math.min(255, 128 + dx));
    data[idx + 1] = Math.max(0, Math.min(255, 128 + dy));
    data[idx + 2] = 128;
    data[idx + 3] = 255;
  };

  for (let y = 0; y < h; y++) {
    const inTopBand = y < rTop;
    const inBottomBand = y > h - 1 - rBottom;

    for (let x = 0; x < halfW; x++) {
      let axisNx: number;
      let axisNy: number;
      let radialNx: number;
      let radialNy: number;
      let distFromEdge: number;

      if (inTopBand && x < rTop) {
        const vx = x - rTop;
        const vy = y - rTop;
        const len = Math.hypot(vx, vy) || 1;
        radialNx = vx / len;
        radialNy = vy / len;
        distFromEdge = rTop - len;
        const dominant = Math.abs(vx) > Math.abs(vy);
        axisNx = dominant ? -1 : 0;
        axisNy = dominant ? 0 : -1;
      } else if (inBottomBand && x < rBottom) {
        const vx = x - rBottom;
        const vy = y - (h - 1 - rBottom);
        const len = Math.hypot(vx, vy) || 1;
        radialNx = vx / len;
        radialNy = vy / len;
        distFromEdge = rBottom - len;
        const dominant = Math.abs(vx) > Math.abs(vy);
        axisNx = dominant ? -1 : 0;
        axisNy = dominant ? 0 : 1;
      } else if (inTopBand) {
        axisNx = 0;
        axisNy = -1;
        radialNx = 0;
        radialNy = -1;
        distFromEdge = y;
      } else if (inBottomBand) {
        axisNx = 0;
        axisNy = 1;
        radialNx = 0;
        radialNy = 1;
        distFromEdge = h - 1 - y;
      } else {
        axisNx = -1;
        axisNy = 0;
        radialNx = -1;
        radialNy = 0;
        distFromEdge = x;
      }

      const nx = axisNx + (radialNx - axisNx) * splay;
      const ny = axisNy + (radialNy - axisNy) * splay;

      const t = Math.max(0, 1 - Math.min(Math.max(distFromEdge, 0), depth) / depth);
      const bulge = Math.pow(t, curvature);
      // Full unit-vector amplitude — the feDisplacementMap `scale` attribute (not baked in
      // here) is what actually controls displacement strength, so it can be animated live
      // (hover/press) without ever touching the canvas or minting a new filter id.
      const dx = nx * bulge * 127;
      const dy = ny * bulge * 127;

      writePixel(x, y, dx, dy);
      writePixel(w - 1 - x, y, -dx, dy);
    }
  }
}

function buildDisplacementMap(
  width: number,
  height: number,
  topRadius: number,
  bottomRadius: number,
  depth: number,
  curvature: number,
  splay: number,
  maxSourceSize: number,
): string {
  // Safari has an undocumented, platform-dependent ceiling on filter source size —
  // stay conservative rather than let the effect break into mismatched blocks.
  const clampedW = Math.min(Math.max(1, Math.round(width)), maxSourceSize);
  const clampedH = Math.min(Math.max(1, Math.round(height)), maxSourceSize);

  const canvas = document.createElement('canvas');
  canvas.width = clampedW;
  canvas.height = clampedH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const image = ctx.createImageData(clampedW, clampedH);
  paintDisplacementHalf(image.data, clampedW, clampedH, topRadius, bottomRadius, depth, curvature, splay);
  ctx.putImageData(image, 0, 0);
  return canvas.toDataURL();
}

export function LiquidGlass({
  children,
  className,
  style,
  radius = 24,
  bottomRadius,
  depth = 26,
  curvature = 1.6,
  splay = 1,
  scale = 16,
  chroma = 4,
  blur = 0.6,
  glow = 0.35,
  edgeHighlight = 0.3,
  specularAngle = 45,
  turbulence = 1.2,
  turbulenceFrequency = 0.02,
  saturation = 1.3,
  contrast = 0.92,
  backdropBlur = 12,
  maxSourceSize = 900,
  outerShadow = '0 4px 16px rgba(17,17,26,0.08), 0 16px 56px rgba(17,17,26,0.08)',
}: LiquidGlassProps) {
  const effectiveBottomRadius = bottomRadius ?? radius;
  const containerRef = useRef<HTMLDivElement>(null);
  const baseFilterId = useId().replace(/[:]/g, '');
  const [revision, setRevision] = useState(0);
  const [mapUrl, setMapUrl] = useState('');
  const [canDistort, setCanDistort] = useState(false);

  useEffect(() => {
    setCanDistort(supportsSvgBackdropFilter());
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el || !canDistort) return;

    let frame = 0;
    const regenerate = () => {
      const rect = el.getBoundingClientRect();
      if (rect.width < 1 || rect.height < 1) return;
      setMapUrl(buildDisplacementMap(rect.width, rect.height, radius, effectiveBottomRadius, depth, curvature, splay, maxSourceSize));
      // Fresh id forces Safari to drop its cached filter output instead of serving a frozen frame.
      setRevision((n) => n + 1);
    };

    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(regenerate);
    });
    observer.observe(el);
    regenerate();

    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [canDistort, radius, effectiveBottomRadius, depth, curvature, splay, maxSourceSize]);

  const filterId = `${baseFilterId}-${revision}`;
  // Inline `style` always beats a class for the same CSS property, so a hardcoded
  // `position: relative` here would silently override a caller's `absolute`/`fixed`
  // positioning class (e.g. a panel anchored to `absolute bottom-0`). Only fall back
  // to `relative` when the caller hasn't already taken a position via className.
  const hasPositionClass = /\b(absolute|fixed|sticky|static|relative)\b/.test(className ?? '');

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...(hasPositionClass ? {} : { position: 'relative' }),
        isolation: 'isolate',
        borderTopLeftRadius: radius,
        borderTopRightRadius: radius,
        borderBottomLeftRadius: effectiveBottomRadius,
        borderBottomRightRadius: effectiveBottomRadius,
        ...style,
      }}
    >
      {canDistort && mapUrl && (
        <svg width="0" height="0" style={{ position: 'absolute' }} aria-hidden="true">
          <filter id={filterId} colorInterpolationFilters="sRGB">
            <feImage href={mapUrl} x="0" y="0" width="100%" height="100%" result="map" />
            <feGaussianBlur in="map" stdDeviation={blur} result="mapBlurred" />

            {/* Chromatic fringe: three displacement passes at slightly different scales, screen-blended. */}
            <feDisplacementMap in="SourceGraphic" in2="mapBlurred" xChannelSelector="R" yChannelSelector="G" scale={scale - chroma} result="dispRed" />
            <feColorMatrix in="dispRed" type="matrix" values="1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0" result="red" />

            <feDisplacementMap in="SourceGraphic" in2="mapBlurred" xChannelSelector="R" yChannelSelector="G" scale={scale} result="dispGreen" />
            <feColorMatrix in="dispGreen" type="matrix" values="0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0" result="green" />

            <feDisplacementMap in="SourceGraphic" in2="mapBlurred" xChannelSelector="R" yChannelSelector="G" scale={scale + chroma} result="dispBlue" />
            <feColorMatrix in="dispBlue" type="matrix" values="0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0" result="blue" />

            <feBlend in="red" in2="green" mode="screen" result="rg" />
            <feBlend in="rg" in2="blue" mode="screen" result="distorted" />

            {/* Organic wobble on top of the geometric bulge, so the rim reads as liquid rather than a mathematically perfect lens. */}
            {turbulence > 0 ? (
              <>
                <feTurbulence type="fractalNoise" baseFrequency={turbulenceFrequency} numOctaves={2} seed={7} result="noise" />
                <feDisplacementMap in="distorted" in2="noise" xChannelSelector="R" yChannelSelector="G" scale={turbulence} result="liquid" />
              </>
            ) : null}

            {/* Specular highlight off the same map, clipped to the panel so it never bleeds past the rounded corners. */}
            <feSpecularLighting in="mapBlurred" surfaceScale={4} specularConstant={glow} specularExponent={14} lightingColor="#ffffff" result="specularRaw">
              <feDistantLight azimuth={specularAngle} elevation={55} />
            </feSpecularLighting>
            <feComposite in="specularRaw" in2="SourceGraphic" operator="in" result="specularClipped" />
            <feColorMatrix
              in="specularClipped"
              type="matrix"
              values={`1 0 0 0 0  0 1 0 0 0  0 0 1 0 0  0 0 0 ${edgeHighlight} 0`}
              result="specularFaded"
            />

            <feComposite in="specularFaded" in2={turbulence > 0 ? 'liquid' : 'distorted'} operator="over" />
          </filter>
        </svg>
      )}

      {/* Distortion layer: bends the live backdrop through the generated map, flat away from the rim. */}
      <div
        aria-hidden="true"
        className="absolute inset-0"
        style={{
          borderRadius: 'inherit',
          backdropFilter: canDistort && mapUrl
            ? `url(#${filterId}) blur(${backdropBlur}px) saturate(${saturation}) contrast(${contrast})`
            : `blur(${Math.max(backdropBlur, 20)}px) saturate(${saturation}) contrast(${contrast})`,
          WebkitBackdropFilter: `blur(${Math.max(backdropBlur, 20)}px) saturate(${saturation}) contrast(${contrast})`,
        }}
      />

      {/* Physical rim: Fresnel-like — a brighter inset highlight on the lit side (per specularAngle), a
          faint dark inset on the opposite side, plus a soft outer drop shadow for a raised, curved surface. */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0"
        style={{
          borderRadius: 'inherit',
          boxShadow: [
            `inset ${(Math.cos((specularAngle * Math.PI) / 180) * 2).toFixed(2)}px ${(-Math.sin((specularAngle * Math.PI) / 180) * 2).toFixed(2)}px 3px rgba(255,255,255,0.65)`,
            `inset ${(-Math.cos((specularAngle * Math.PI) / 180) * 3).toFixed(2)}px ${(Math.sin((specularAngle * Math.PI) / 180) * 3).toFixed(2)}px 6px rgba(0,0,0,0.08)`,
            'inset 0 0 10px 4px rgba(255,255,255,0.15)',
            outerShadow,
          ].join(', '),
        }}
      />

      {/* w-full/h-full: the SVG filter/displacement math above is unchanged — this only
          makes the content slot match the root's resolved size, so callers whose content
          relies on a percentage-height chain (h-full) aren't collapsed by this wrapper. */}
      <div className="relative z-10 w-full h-full" style={{ borderRadius: 'inherit' }}>
        {children}
      </div>
    </div>
  );
}
