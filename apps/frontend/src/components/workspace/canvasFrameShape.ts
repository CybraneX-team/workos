/**
 * ACTIVE CANVAS frame geometry.
 * ------------------------------------------------------------------
 * The whole shape is driven by the editable values below. Everything
 * else (the SVG stroke path + the clip path) is generated from them,
 * so you only ever edit CANVAS_FRAME_POINTS / CANVAS_CORNER_RADIUS.
 *
 * Coordinate system: a 1000 (wide) × 560 (tall) grid.
 *   - x grows to the RIGHT (0 = left edge, 1000 = right edge)
 *   - y grows DOWNWARD  (0 = top edge,  560 = bottom edge)
 *     → smaller y = higher up on screen.
 *
 * Points are listed CLOCKWISE starting at the top-left corner:
 *
 *      [0]──────[1]            [4]──────[5]      ← raised shoulders (small y)
 *         \                          /
 *          [2]────────────────[3]            ← center valley (larger y = lower)
 *         /                          \
 *      [7]──────────────────────────[6]      ← wide splayed bottom
 *
 * Bottom corners MUST stay within x ∈ [0, 1000] so the SVG viewBox,
 * border stroke, and clip-path all render the same silhouette (no cut edges).
 *
 * HOW TO EDIT THE SHAPE:
 *   • Deeper / shallower center dip → raise/lower y of points [2] & [3].
 *   • Wider / narrower shoulders    → move [1]/[2] (left) and [3]/[4] (right) in x.
 *   • Wider / narrower valley        → move [2] (right) and [3] (left) in x.
 *   • Taller / shorter shoulders     → change y of [0],[1],[4],[5].
 *   • More / less bottom splay        → move [7].x toward 0 and [6].x toward 1000.
 *   • Rounder / sharper corners       → change CANVAS_CORNER_RADIUS.
 */

export const CANVAS_FRAME_VIEWBOX = { w: 1000, h: 560 } as const;

/** Editable shape vertices, clockwise from the top-left corner. */
export const CANVAS_FRAME_POINTS = [
  { x: 40, y: 44 }, // 0 top-left corner
  { x: 335, y: 44 }, // 1 left shoulder → ramp start
  { x: 395, y: 70 }, // 2 valley (left)
  { x: 605, y: 70 }, // 3 valley (right)
  { x: 665, y: 44 }, // 4 ramp end → right shoulder
  { x: 960, y: 44 }, // 5 top-right corner
  { x: 1000, y: 600 }, // 6 bottom-right (splayed, inside viewBox)
  { x: 0, y: 600 }, // 7 bottom-left (splayed, inside viewBox)
] as const;

/** Corner rounding, in grid units. 0 = sharp corners. */
export const CANVAS_CORNER_RADIUS = 20;

/** ACTIVE CANVAS caption sits on the raised TOP-LEFT shoulder. */
export const CANVAS_TAB_REGION = {
  left: 0.165,
  top: 0.082,
  width: 0.2,
  height: 0.055,
} as const;

/** Header/content begins just below the center valley line. */
export const CANVAS_BODY_TOP = 100 / CANVAS_FRAME_VIEWBOX.h;

export const CANVAS_CLIP_PATH_ID = 'wsCanvasClip';

/* ------------------------------------------------------------------ */
/* Generated paths (do not edit by hand)                              */
/* ------------------------------------------------------------------ */

type Pt = { x: number; y: number };

const dist = (a: Pt, b: Pt) => Math.hypot(b.x - a.x, b.y - a.y);
const lerp = (a: Pt, b: Pt, t: number): Pt => ({
  x: a.x + (b.x - a.x) * t,
  y: a.y + (b.y - a.y) * t,
});

/** Per-vertex entry/control/exit points for rounded corners. */
function buildCorners(points: readonly Pt[], radius: number) {
  const n = points.length;
  return points.map((curr, i) => {
    const prev = points[(i - 1 + n) % n];
    const next = points[(i + 1) % n];
    const lenPrev = dist(prev, curr) || 1;
    const lenNext = dist(next, curr) || 1;
    const r = Math.max(0, radius);
    const entry = lerp(curr, prev, Math.min(r, lenPrev / 2) / lenPrev);
    const exit = lerp(curr, next, Math.min(r, lenNext / 2) / lenNext);
    return { entry, corner: curr, exit };
  });
}

function serialize(
  corners: ReturnType<typeof buildCorners>,
  sx: number,
  sy: number,
) {
  const f = (p: Pt) => `${(p.x * sx).toFixed(6)} ${(p.y * sy).toFixed(6)}`;
  const n = corners.length;
  let d = `M ${f(corners[0].entry)}`;
  for (let i = 0; i < n; i++) {
    const c = corners[i];
    d += ` Q ${f(c.corner)} ${f(c.exit)}`;
    d += ` L ${f(corners[(i + 1) % n].entry)}`;
  }
  return `${d} Z`;
}

const CORNERS = buildCorners(CANVAS_FRAME_POINTS, CANVAS_CORNER_RADIUS);

/** Absolute path in viewBox units — used for the visible stroke + fill. */
export const CANVAS_FRAME_PATH = serialize(CORNERS, 1, 1);

/** Normalized 0–1 clip path — same geometry as the SVG path (viewBox 0–1). */
export const CANVAS_FRAME_PATH_NORMALIZED = serialize(
  CORNERS,
  1 / CANVAS_FRAME_VIEWBOX.w,
  1 / CANVAS_FRAME_VIEWBOX.h,
);

/** Rectangular shape for fullscreen state (sides straight down, keeping top shoulders) */
export const CANVAS_FRAME_POINTS_FULL = [
  { x: 0, y: 20 }, // 0 top-left corner
  { x: 335, y: 20 }, // 1 left shoulder → ramp start
  { x: 395, y: 40 }, // 2 valley (left)
  { x: 605, y: 40 }, // 3 valley (right)
  { x: 665, y: 20 }, // 4 ramp end → right shoulder
  { x: 1000, y: 20 }, // 5 top-right corner
  { x: 1000, y: 600 }, // 6 bottom-right (straight down)
  { x: 0, y: 600 }, // 7 bottom-left (straight down)
] as const;

const CORNERS_FULL = buildCorners(CANVAS_FRAME_POINTS_FULL, CANVAS_CORNER_RADIUS);

export const CANVAS_FRAME_PATH_FULL = serialize(CORNERS_FULL, 1, 1);

export const CANVAS_FRAME_PATH_FULL_NORMALIZED = serialize(
  CORNERS_FULL,
  1 / CANVAS_FRAME_VIEWBOX.w,
  1 / CANVAS_FRAME_VIEWBOX.h,
);

export function getInterpolatedPaths(p: number) {
  const points = CANVAS_FRAME_POINTS.map((pt, i) => {
    const ptFull = CANVAS_FRAME_POINTS_FULL[i];
    return {
      x: pt.x + (ptFull.x - pt.x) * p,
      y: pt.y + (ptFull.y - pt.y) * p,
    };
  });
  const corners = buildCorners(points, CANVAS_CORNER_RADIUS);
  const fillPath = serialize(corners, 1, 1);
  const clipPath = serialize(corners, 1 / CANVAS_FRAME_VIEWBOX.w, 1 / CANVAS_FRAME_VIEWBOX.h);
  return { fillPath, clipPath };
}

