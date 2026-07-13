/**
 * main.ts — Re-exports for the three-universe module.
 * The actual entry point is UniverseController.ts.
 * This file kept for backwards compatibility / explicit imports.
 */

export { UniverseController, ZOOM_LEVELS } from './UniverseController';
export type { NavPathEntry, ZoomLevel, HoverTarget, UniverseCallbacks } from './UniverseController';
