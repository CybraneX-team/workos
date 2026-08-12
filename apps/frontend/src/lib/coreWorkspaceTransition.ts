/** Orchestrates polytope core dive ↔ product workspace on /universal (BDT). */
export type CoreWorkspacePhase = 'idle' | 'diving-in' | 'workspace' | 'surfacing';

/**
 * What the dive arrives at.
 *
 * The dive used to be inferred from `voiceState` — voice running meant we were
 * inside the core — which hard-wired the core to Voice AI and left no way to
 * dive anywhere else. Naming the destination explicitly lets the same camera
 * animation serve the supercycle sphere, and keeps room for further ones.
 */
export type CoreDestination = 'supercycle' | 'voice';

export const CORE_DIVE_DURATION_S = 2.1;
export const CORE_SURFACE_DURATION_S = 1.75;
export const WORKSPACE_EXIT_MS = 520;
