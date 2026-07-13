/** Shared timing/easing for company planet root focus → internal drill animations. */

export const PLANET_ANIM = {
  cameraEase: 'power3.inOut',
  fadeEase: 'power2.inOut',
  expandEase: 'power3.out',
  nodeEase: 'power4.out',
  zoomInDuration: 1.15,
  fadeDuration: 0.9,
  scalePulseDuration: 0.6,
  expandDelay: 0.2,
  expandDuration: 1.1,
  internalCameraDuration: 1.5,
  internalNodeDuration: 1.2,
  internalNodeRevealDelayMs: 480,
  zoomOutDuration: 1.0,
} as const;

/** Wait for planet overlay + R3F canvas before session-restore animations. */
export const RESTORE_CANVAS_READY_MS = 500;

/** Root focus zoom completes, then internal polytope opens. */
export const ROOT_FOCUS_TOTAL_MS =
  Math.round(PLANET_ANIM.zoomInDuration * 1000) + 150;

/** Internal ring expansion finishes before drilling to branch/action. */
export const EXPAND_SETTLE_MS =
  Math.round((PLANET_ANIM.expandDelay + PLANET_ANIM.expandDuration) * 1000) + 250;

/** Camera finishes framing a deeper internal level. */
export const INTERNAL_DRILL_MS =
  Math.round(PLANET_ANIM.internalCameraDuration * 1000) + 200;