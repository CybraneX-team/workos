export type TwinWorkspacePhase = 'closed' | 'zooming' | 'entering' | 'open' | 'closing';
export type TwinWorkspaceMode = 'galaxy' | 'industry' | 'subdomain';

export const TWIN_WORKSPACE_CAMERA_MS = 920;
export const TWIN_GALAXY_NAV_EXIT_MS = 450;
export const TWIN_WORKSPACE_PANEL_MS = 680;
export const TWIN_WORKSPACE_CLOSE_MS = 620;

export function isTwinWorkspaceActive(phase: TwinWorkspacePhase): boolean {
  return phase === 'zooming' || phase === 'entering' || phase === 'open' || phase === 'closing';
}
