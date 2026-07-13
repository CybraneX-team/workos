// ── Polytope scene constants ─────────────────────────────────────────────────

/** Initial camera Z distance (overridden per-scene by node count) */
export const BASE_CAMERA_DISTANCE = 54;

/** Camera must be closer than this (world units) to click the core for AI */
export const CORE_AI_MAX_CAMERA_DISTANCE = 30;

/** Wheel delta (px) while zoomed out past overview before exiting to 3D Twin roots (~2.5 scrolls) */
export const POLYTOPE_EXIT_SCROLL_DELTA = 265;
