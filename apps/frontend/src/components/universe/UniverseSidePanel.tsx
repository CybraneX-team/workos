import { useMemo } from 'react';
import { Plus } from 'lucide-react';
import { useUniverseGraph } from '../../data/universeGraph';
import type { UniverseIndustry, UniverseSubdomain } from '../../data/universeGraph';
import {
  UniverseController,
  type NavPathEntry,
  type ZoomLevel,
  ZOOM_LEVELS,
} from '../../three-universe/UniverseController';
import { SearchTrie } from '../../lib/SearchTrie';
import { CompanyTagDropdown } from '../planet/CompanyTagDropdown';

export interface UniverseSidePanelProps {
  data: ReturnType<typeof useUniverseGraph>['data'];
  navPath: NavPathEntry[];
  currentLevel: ZoomLevel;
  controllerRef: React.MutableRefObject<UniverseController | null>;
  onAddCompany: (industry: UniverseIndustry, subdomain: UniverseSubdomain) => void;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
}

export function UniverseSidePanel({
  data,
  navPath,
  currentLevel,
  controllerRef,
  onAddCompany,
  searchQuery,
  setSearchQuery,
}: UniverseSidePanelProps) {
  const industryId = navPath[0]?.data?.id ?? null;
  const subdomainId = navPath[1]?.data?.id ?? null;

  const industry =
    data?.industries.find(i => i.id === industryId) ??
    (navPath[0]?.data as UniverseIndustry | null) ??
    null;
  const subdomain =
    industry?.subdomains.find(s => s.id === subdomainId) ??
    (navPath[1]?.data as UniverseSubdomain | null) ??
    null;

  const isGalaxy = currentLevel === ZOOM_LEVELS.GALAXY;
  const isIndustry = currentLevel === ZOOM_LEVELS.INDUSTRY;
  const isSubdomainOrDeeper = !isGalaxy && !isIndustry;

  const listKey = `${currentLevel}-${navPath.map(e => e.id).join('-')}`;

  let sectionLabel = 'GALAXIES';
  let items: { id: string; name: string; color?: string; meta?: string; type?: string; onClick?: () => void }[] = [];
  let onItemClick = (_id: string) => {};

  const isSearchActive = searchQuery.trim().length > 0;

  const searchTrie = useMemo(() => {
    const trie = new SearchTrie();
    if (data?.industries) {
      data.industries.forEach(ind => {
        trie.insert(ind.name, {
          id: ind.id,
          name: ind.name,
          color: ind.color,
          meta: 'Industry',
          type: 'industry',
          industryId: ind.id,
        });
        ind.subdomains.forEach(sub => {
          trie.insert(sub.name, {
            id: sub.id,
            name: sub.name,
            color: sub.color ?? ind.color,
            meta: `Subdomain in ${ind.name}`,
            type: 'subdomain',
            industryId: ind.id,
            subdomainId: sub.id,
          });
          sub.companies.forEach(co => {
            trie.insert(co.name, {
              id: co.id,
              name: co.name,
              color: ind.color,
              meta: `Company in ${sub.name}`,
              type: 'company',
              industryId: ind.id,
              subdomainId: sub.id,
              companyId: co.id,
            });
          });
        });
      });
    }
    return trie;
  }, [data]);

  if (isSearchActive) {
    const results = searchTrie.search(searchQuery, 50);

    sectionLabel = 'SEARCH RESULTS';
    items = results.map(r => ({
      id: r.id,
      name: r.name,
      color: r.color,
      meta: r.meta,
      type: r.type,
      onClick: () => {
        if (r.type === 'industry') controllerRef.current?.routeTo('industry', r.industryId!);
        else if (r.type === 'subdomain') {
          controllerRef.current?.routeTo('subdomain', r.industryId!, r.subdomainId!);
        } else if (r.type === 'company') {
          controllerRef.current?.routeTo('company', r.industryId!, r.subdomainId!, r.companyId!);
        }
        setSearchQuery('');
      },
    }));
  } else if (isGalaxy) {
    sectionLabel = 'GALAXIES';
    items = (data?.industries ?? []).map(ind => ({
      id: ind.id,
      name: ind.name,
      color: ind.color,
      meta: `${ind.subdomains.length} domains`,
      type: 'industry',
    }));
    onItemClick = id => controllerRef.current?.zoomToIndustry(id);
  } else if (isIndustry && industry) {
    sectionLabel = 'SUBDOMAINS';
    items = industry.subdomains.map(sd => ({
      id: sd.id,
      name: sd.name,
      color: sd.color ?? industry.color,
      meta: `${sd.companies.length} companies`,
      type: 'subdomain',
    }));
    onItemClick = id => controllerRef.current?.zoomToSubdomain(industry.id, id);
  } else if (isSubdomainOrDeeper && industry && subdomain) {
    sectionLabel = 'COMPANIES';
    items = subdomain.companies.map(co => ({
      id: co.id,
      name: co.name,
      color: industry.color,
      meta: co.employees ? `${co.employees.toLocaleString()} emp` : (co.stage ?? ''),
      type: 'company',
    }));
    onItemClick = id => controllerRef.current?.zoomToCompany(industry.id, subdomain.id, id);
  }

  return (
    <div
      className="rounded-2xl overflow-hidden flex flex-col"
      style={{
        width: '196px',
        maxHeight: '420px',
        background: 'rgba(0, 0, 0, 0.72)',
        backdropFilter: 'blur(12px)',
        WebkitBackdropFilter: 'blur(12px)',
        border: '1px solid rgba(255,255,255,0.07)',
        boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
      }}
    >
      <div key={listKey + '-header'} className="px-3 pt-3 pb-1 shrink-0 panel-slide-in">
        <span className="text-[10px] font-semibold tracking-widest" style={{ color: '#5E5E5E' }}>
          {sectionLabel}
        </span>
        {!isGalaxy && industry && (
          <p className="text-[11px] font-semibold text-white mt-0.5 truncate">
            {isSubdomainOrDeeper && subdomain ? subdomain.name : industry.name}
          </p>
        )}
      </div>

      <div key={listKey} className="overflow-y-auto pb-2" style={{ scrollbarWidth: 'none' }}>
        {items.map((item, i) => (
          <div
            key={item.meta + '-' + item.id}
            onClick={() => {
              if (item.onClick) item.onClick();
              else onItemClick(item.id);
            }}
            className="panel-item-in w-full flex flex-col items-start px-3 py-2 text-left transition-colors hover:bg-white/[0.06] group cursor-pointer"
            style={{ animationDelay: `${i * 28}ms` }}
            role="button"
            tabIndex={0}
          >
            <div className="flex items-center gap-2.5 w-full">
              <span
                className="w-2 h-2 rounded-full shrink-0 transition-transform group-hover:scale-125"
                style={{
                  background: item.color ?? '#7c3aed',
                  boxShadow: `0 0 8px ${item.color ?? '#7c3aed'}70`,
                }}
              />
              <span className="flex-1 min-w-0">
                <span className="block text-[12px] text-gray-300 group-hover:text-white transition-colors leading-tight truncate">
                  {item.name}
                </span>
                {item.meta && (
                  <span className="block text-[10px] leading-tight mt-0.5" style={{ color: '#4b5563' }}>
                    {item.meta}
                  </span>
                )}
              </span>
            </div>
            
            {item.type === 'company' && (
              <div 
                className="w-full mt-2 overflow-hidden max-h-0 opacity-0 group-hover:max-h-20 group-hover:opacity-100 transition-all duration-300"
                onClick={e => e.stopPropagation()}
              >
                <CompanyTagDropdown 
                  companyId={item.id} 
                  companyName={item.name} 
                  industryColor={item.color} 
                />
              </div>
            )}
          </div>
        ))}
      </div>

      {isSubdomainOrDeeper && industry && subdomain && !isSearchActive && (
        <div className="px-3 pb-3 pt-1 shrink-0" style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={() => onAddCompany(industry, subdomain)}
            className="w-full flex items-center justify-center gap-1.5 py-2 rounded-xl text-[11px] font-semibold transition-all hover:opacity-90"
            style={{
              background: `${industry.color ?? '#7c3aed'}18`,
              border: `1px solid ${industry.color ?? '#7c3aed'}30`,
              color: industry.color ?? '#C1AEFF',
            }}
          >
            <Plus className="w-3.5 h-3.5" />
            Add Company
          </button>
        </div>
      )}
    </div>
  );
}
