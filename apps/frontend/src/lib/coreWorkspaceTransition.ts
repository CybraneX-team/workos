/** Orchestrates polytope core dive ↔ product workspace on /universal (BDT). */
export type CoreWorkspacePhase = 'idle' | 'diving-in' | 'workspace' | 'surfacing';

export const CORE_DIVE_DURATION_S = 2.1;
export const CORE_SURFACE_DURATION_S = 1.75;
export const WORKSPACE_EXIT_MS = 520;
