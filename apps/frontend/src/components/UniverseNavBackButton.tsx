import { ArrowLeft } from 'lucide-react';
import { ZOOM_LEVELS, type NavPathEntry, type ZoomLevel } from '../three-universe/UniverseController';

export function getUniverseBackLabel(currentLevel: ZoomLevel, navPath: NavPathEntry[]): string | null {
  if (currentLevel === ZOOM_LEVELS.GALAXY) return null;
  if (currentLevel === ZOOM_LEVELS.INDUSTRY) return 'Galaxy';
  if (currentLevel === ZOOM_LEVELS.SUBDOMAIN) return navPath[0]?.name ?? 'Industry';
  if (currentLevel === ZOOM_LEVELS.COMPANY) return navPath[1]?.name ?? 'Subdomain';
  if (currentLevel === ZOOM_LEVELS.DEPARTMENT) return navPath[2]?.name ?? 'Company';
  return 'Back';
}

export interface UniverseNavBackButtonProps {
  label: string;
  onClick: () => void;
}

/** Shared back control for 3D universe sidebar (industry / subdomain / company / polytope). */
export function UniverseNavBackButton({ label, onClick }: UniverseNavBackButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="flex items-center gap-2 px-3 py-2.5 rounded-2xl text-[11px] font-semibold transition-all hover:opacity-90 active:scale-[0.98]"
      style={{
        width: '196px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: '1px solid rgba(193, 174, 255, 0.35)',
        color: '#C1AEFF',
        boxShadow: '0 8px 24px rgba(0,0,0,0.45)',
      }}
    >
      <ArrowLeft className="w-3.5 h-3.5 shrink-0" />
      <span className="truncate">{label}</span>
    </button>
  );
}
