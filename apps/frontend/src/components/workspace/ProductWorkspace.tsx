import { useEffect } from 'react';
import { ArrowLeft } from 'lucide-react';
import type { DbCompany } from '../../lib/supabase';
import { getIndustryContext } from '../../lib/productWorkspaceData';
import type { UExternalNode } from '../../lib/usePolytopeStore';
import { WorkspaceBottomDock } from './WorkspaceBottomDock';
import { WorkspacePlanetHero } from './WorkspacePlanetHero';
import {
  WorkspaceLeftPanel,
  WorkspaceActiveCanvasPanel,
  WorkspaceRightPanel,
} from './panels';
import { FounderWorkspaceProvider } from '../../context/FounderWorkspaceContext';

export interface ProductWorkspaceProps {
  company: DbCompany | null;
  companyName: string;
  departments: UExternalNode[];
  onBackToCompany: () => void;
  exiting?: boolean;
}

export function ProductWorkspace({
  company,
  companyName,
  departments,
  onBackToCompany,
  exiting = false,
}: ProductWorkspaceProps) {
  const industry = getIndustryContext(company?.industry_id);

  // Inner surfaces (e.g. the empty saved-nodes state) can request a full close.
  useEffect(() => {
    const handleRequestClose = () => onBackToCompany();
    window.addEventListener('request-close-workspace', handleRequestClose);
    return () => window.removeEventListener('request-close-workspace', handleRequestClose);
  }, [onBackToCompany]);

  return (
    <FounderWorkspaceProvider>
      <div className="absolute inset-0 z-[70] flex flex-col overflow-hidden ws-shell">
        <button
          type="button"
          onClick={onBackToCompany}
          disabled={exiting}
          className="ws-back-fab"
          aria-label="Back to polytope"
        >
          <ArrowLeft className="w-4 h-4" />
        </button>

        <div className="ws-layout flex-1 min-h-0 flex gap-3 px-3 pb-2 pt-14">
          <div className="twin-workspace-fullscreen-hover-zone" />
          <WorkspaceLeftPanel />

          <div className="ws-center flex-1 min-w-0 flex flex-col gap-3 min-h-0">
            <section className="ws-planet-zone shrink-0 overflow-hidden relative scale-125">
              <WorkspacePlanetHero
                companyName={companyName}
                industryColor={industry.color}
                departments={departments}
              />
            </section>

            <WorkspaceActiveCanvasPanel />
          </div>

          <div className="twin-workspace-fullscreen-hover-zone-right" />
          <WorkspaceRightPanel />
        </div>

        <WorkspaceBottomDock />
      </div>
    </FounderWorkspaceProvider>
  );
}

