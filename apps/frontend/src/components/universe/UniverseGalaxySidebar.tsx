import { Search, Command } from 'lucide-react';
import type { RefObject } from 'react';
import { useUniverseGraph } from '../../data/universeGraph';
import type { UniverseIndustry, UniverseSubdomain } from '../../data/universeGraph';
import {
  UniverseController,
  type NavPathEntry,
  type ZoomLevel,
} from '../../three-universe/UniverseController';
import { UniverseNavBackButton, getUniverseBackLabel } from '../UniverseNavBackButton';
import { UniverseSidePanel } from './UniverseSidePanel';

export interface UniverseGalaxySidebarProps {
  data: ReturnType<typeof useUniverseGraph>['data'];
  navPath: NavPathEntry[];
  currentLevel: ZoomLevel;
  controllerRef: RefObject<UniverseController | null>;
  onAddCompany: (industry: UniverseIndustry, subdomain: UniverseSubdomain) => void;
  canAddCompany?: boolean;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  searchInputRef: RefObject<HTMLInputElement | null>;
  canReadEcosystem: boolean;
  onNavigateEcosystem: (path: '/ecosystem/vc-connect' | '/ecosystem/network') => void;
  onBackClick?: () => void;
  className?: string;
}

/** Galaxy-mode search + level nav — floats bottom-left or docks left when workspace opens. */
export function UniverseGalaxySidebar({
  data,
  navPath,
  currentLevel,
  controllerRef,
  onAddCompany,
  searchQuery,
  setSearchQuery,
  searchInputRef,
  canReadEcosystem,
  onNavigateEcosystem,
  onBackClick,
  className = '',
}: UniverseGalaxySidebarProps) {
  const backTarget = searchQuery.trim() ? null : getUniverseBackLabel(currentLevel, navPath);

  return (
    <div className={`universe-galaxy-sidebar flex flex-col items-start gap-3 pointer-events-auto ${className}`}>
      <div
        className="relative rounded-2xl overflow-hidden shadow-xl"
        style={{
          width: '196px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.07)',
        }}
      >
        <div className="flex items-center px-3 py-2.5">
          <Search className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
          <input
            ref={searchInputRef}
            type="text"
            placeholder="Search universe..."
            value={searchQuery}
            onChange={e => setSearchQuery(e.target.value)}
            className="bg-transparent border-none outline-none text-xs text-white w-full placeholder:text-gray-500"
          />
          <div className="flex items-center gap-0.5 ml-2 opacity-50 shrink-0 bg-white/10 px-1.5 py-0.5 rounded">
            <Command className="w-2.5 h-2.5 text-gray-300" />
            <span className="text-[9px] text-gray-300 font-medium">K</span>
          </div>
        </div>
      </div>

      {backTarget && (
        <UniverseNavBackButton
          label={`Back to ${backTarget}`}
          onClick={() => {
            if (onBackClick) {
              onBackClick();
            } else {
              controllerRef.current?.goBack();
            }
          }}
        />
      )}

      {data && (
        <UniverseSidePanel
          data={data}
          navPath={navPath}
          currentLevel={currentLevel}
          controllerRef={controllerRef}
          onAddCompany={onAddCompany}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
        />
      )}

      {canReadEcosystem && (
        <div className="flex flex-col gap-2 w-full">
          <button
            type="button"
            onClick={() => onNavigateEcosystem('/ecosystem/vc-connect')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-sky-500/30"
            style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-sky-400" />
            VC &amp; Mentors
          </button>
          <button
            type="button"
            onClick={() => onNavigateEcosystem('/ecosystem/network')}
            className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium text-slate-300 border backdrop-blur-md transition-all hover:text-white hover:border-teal-500/30"
            style={{ background: 'rgba(0,0,0,0.55)', borderColor: 'rgba(148,163,184,0.1)' }}
          >
            <span className="w-1.5 h-1.5 rounded-full bg-teal-400" />
            Startup Network
          </button>
        </div>
      )}
    </div>
  );
}
