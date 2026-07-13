import { Lock } from 'lucide-react';
import type { PlanetCoreDetails } from '../../data/companyPlanetRoots';
import { CompanyTagDropdown } from './CompanyTagDropdown';
import type { CompanyTag } from '../../lib/useSavedWorkflows';
import { COMPANY_TAG_LABELS, COMPANY_TAG_ICONS, COMPANY_TAG_COLORS } from '../../lib/useSavedWorkflows';

export interface PlanetCoreContextCardProps {
  details: PlanetCoreDetails;
  industryColor?: string;
  referenceCompanyId?: string;
  activeClassification?: 'competitor' | 'customer' | 'collaborator' | null;
  onClassificationChange?: (tag: CompanyTag | null) => void;
}

/** Company + role summary — lives in the side panel, not on the map center */
export function PlanetCoreContextCard({
  details,
  industryColor = '#C1AEFF',
  referenceCompanyId,
  activeClassification,
  onClassificationChange,
}: PlanetCoreContextCardProps) {

  // For the active card styling, we can check if it's tagged right here or just rely on the inner component.
  // We can leave the outer card style without the tag color, or we can fetch it again here to keep the glowing border.
  // To keep it simple and clean, let's just let the inner dropdown handle its colors, while the card uses industryColor.
  
  return (
    <div
      className="rounded-2xl shrink-0 relative"
      style={{
        width: '196px',
        background: 'rgba(0, 0, 0, 0.78)',
        backdropFilter: 'blur(14px)',
        WebkitBackdropFilter: 'blur(14px)',
        border: `1px solid ${industryColor}33`,
        boxShadow: `0 12px 40px rgba(0,0,0,0.55), inset 0 1px 0 ${industryColor}18`,
        transition: 'all 0.3s ease',
      }}
    >
      <div
        className="h-1 w-full rounded-t-2xl transition-all duration-500"
        style={{
          background: `linear-gradient(90deg, transparent, ${industryColor}, transparent)`,
        }}
      />
      <div className="px-3.5 py-3.5">
        <span
          className="inline-block text-[9px] font-bold tracking-[0.14em] uppercase px-2.5 py-1 rounded-full transition-all"
          style={{
            color: industryColor,
            border: `1px solid ${industryColor}55`,
            background: `${industryColor}14`,
          }}
        >
          {details.roleTag}
        </span>
        <h2 className="mt-2.5 text-[15px] font-bold text-white leading-tight truncate">
          {details.headline}
        </h2>
        <p className="text-[10px] font-semibold mt-0.5" style={{ color: industryColor }}>
          {details.subline}
        </p>

        <div className="mt-3 pt-3 grid grid-cols-3 gap-2 border-t border-white/[0.06]">
          {details.metrics.map(m => (
            <div key={m.label} className="text-center min-w-0">
              <p className="text-[11px] font-bold text-zinc-100 truncate">{m.value}</p>
              <p className="text-[7px] uppercase tracking-wider text-zinc-500 mt-1 leading-tight">
                {m.label}
              </p>
            </div>
          ))}
        </div>

        {/* Classification UI */}
        <div className="mt-4 pt-3 border-t border-white/[0.06] relative">
          {activeClassification ? (() => {
            const Icon = COMPANY_TAG_ICONS[activeClassification];
            const color = COMPANY_TAG_COLORS[activeClassification];
            return (
              <div
                className="flex items-center gap-2 px-2.5 py-1.5 rounded-lg"
                style={{ background: `${color}12`, border: `1px solid ${color}30` }}
              >
                <Icon className="w-3.5 h-3.5" style={{ color }} />
                <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color }}>
                  {COMPANY_TAG_LABELS[activeClassification]}
                </span>
                <Lock className="w-3 h-3 ml-auto opacity-40" style={{ color }} />
              </div>
            );
          })() : (
            <CompanyTagDropdown
              companyId={details.companyId}
              companyName={details.companyName}
              role={details.role}
              industryColor={industryColor}
              referenceCompanyId={referenceCompanyId}
              activeClassification={activeClassification}
              onClassificationChange={onClassificationChange}
            />
          )}
        </div>

        <p className="mt-3 text-[8px] text-zinc-500 leading-relaxed tracking-wide">
          {details.focusHint}
        </p>
      </div>
    </div>
  );
}
