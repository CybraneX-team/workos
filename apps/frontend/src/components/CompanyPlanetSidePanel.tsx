import { useMemo, useRef, useEffect, useState } from 'react';
import { Search, Command, ArrowLeft, ChevronRight, Globe, Loader2 } from 'lucide-react';
// import { Briefcase, Rocket, TrendingUp} from 'lucide-react';
import type {
  CompanyPlanetContext,
  PlanetExploreLevel,
  PlanetRootNode,
  PlanetBranchNode,
  UserPlanetRole,
} from '../data/companyPlanetRoots';
import { getExploreLevel, getPlanetCoreDetails, PLANET_BRANCH_TYPE_LABELS } from '../data/companyPlanetRoots';
import { PlanetCoreContextCard } from './planet/PlanetCoreContextCard';
import { UniverseNavBackButton } from './UniverseNavBackButton';
import type { CompanyTag } from '../lib/useSavedWorkflows';
import { COMPANY_TAG_LABELS, COMPANY_TAG_ICONS, COMPANY_TAG_COLORS } from '../lib/useSavedWorkflows';

export interface CompanyPlanetSidePanelProps {
  context: CompanyPlanetContext;
  depth: number;
  path: string[];
  onRootSelect: (rootId: string) => void;
  onBranchSelect: (rootId: string, branchId: string) => void;
  onActionSelect: (rootId: string, branchId: string, actionId: string) => void;
  onDrillBack: () => void;
  onExitToSubdomain: () => void;
  exitToSubdomainLabel: string;
  searchQuery: string;
  setSearchQuery: (q: string) => void;
  industryColor?: string;
  onRoleChange?: (role: UserPlanetRole) => void;
  onRefresh?: () => void | Promise<void>;
  canRefresh?: boolean;
  onDelete?: () => void | Promise<void>;
  canDelete?: boolean;
  onResearchCompany?: (url: string, subdomainId: string, classification: CompanyTag) => Promise<void>;
  onClassificationChange?: (tag: CompanyTag | null) => void;
}

function findRoot(ctx: CompanyPlanetContext, rootId: string): PlanetRootNode | undefined {
  return ctx.roots.find(r => r.id === rootId);
}

function findBranch(root: PlanetRootNode, branchId: string): PlanetBranchNode | undefined {
  return root.branches.find(b => b.id === branchId);
}

// const ROLES = [
//   { id: 'career', label: 'Career User', icon: Briefcase, color: '#60a5fa' },
//   { id: 'founder', label: 'Founder', icon: Rocket, color: '#f97316' },
//   { id: 'investor', label: 'Investor', icon: TrendingUp, color: '#22d3ee' },
// ] as const;

export function CompanyPlanetSidePanel({
  context,
  depth,
  path,
  onRootSelect,
  onBranchSelect,
  onActionSelect,
  onDrillBack,
  onExitToSubdomain,
  exitToSubdomainLabel,
  searchQuery,
  setSearchQuery,
  industryColor = '#C1AEFF',
  // onRoleChange,
  onResearchCompany,
  onClassificationChange,
}: CompanyPlanetSidePanelProps) {
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [researchUrl, setResearchUrl] = useState(context.companyWebsite ?? '');
  const [researchClassification, setResearchClassification] = useState<CompanyTag | null>(null);
  const [researching, setResearching] = useState(false);
  const [researchError, setResearchError] = useState<string | null>(null);
  const level = getExploreLevel(depth);
  const isSearchActive = searchQuery.trim().length > 0;
  const coreDetails = useMemo(() => getPlanetCoreDetails(context), [context]);
  const showCoreCard = depth === 0 && !isSearchActive;
  const listKey = `${level}-${path.join('-')}-${context.role}`;
  const isBaseResearchRunning = context.status === 'pending' || context.status === 'running';
  const isClassifyRunning = context.classifyJob?.status === 'pending' || context.classifyJob?.status === 'running';
  const researchStatusLabel = isClassifyRunning
    ? 'Applying lens'
    : context.status === 'pending'
      ? 'Research queued'
      : context.status === 'running'
        ? 'Building twin'
        : null;

  const selectedRoot = path[0] ? findRoot(context, path[0]) : null;
  const selectedBranch = selectedRoot && path[1] ? findBranch(selectedRoot, path[1]) : null;

  const searchResults = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return [];
    const hits: {
      id: string;
      label: string;
      meta: string;
      color: string;
      onClick: () => void;
    }[] = [];

    for (const root of context.roots) {
      if (root.label.toLowerCase().includes(q)) {
        hits.push({
          id: root.id,
          label: root.label,
          meta: 'Root system',
          color: root.color,
          onClick: () => { onRootSelect(root.id); setSearchQuery(''); },
        });
      }
      for (const branch of root.branches) {
        if (branch.label.toLowerCase().includes(q)) {
          hits.push({
            id: branch.id,
            label: branch.label,
            meta: `Branch · ${root.label}`,
            color: root.color,
            onClick: () => { onRootSelect(root.id); onBranchSelect(root.id, branch.id); setSearchQuery(''); },
          });
        }
        for (const action of branch.actions) {
          if (action.label.toLowerCase().includes(q)) {
            hits.push({
              id: action.id,
              label: action.label,
              meta: `Action · ${branch.label}`,
              color: root.color,
              onClick: () => {
                onRootSelect(root.id);
                onBranchSelect(root.id, branch.id);
                onActionSelect(root.id, branch.id, action.id);
                setSearchQuery('');
              },
            });
          }
        }
      }
    }
    return hits.slice(0, 40);
  }, [searchQuery, context, onRootSelect, onBranchSelect, onActionSelect, setSearchQuery]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  let sectionLabel = 'ROOT SYSTEMS';
  let items: { id: string; name: string; color: string; meta?: string; onClick: () => void }[] = [];

  if (isSearchActive) {
    sectionLabel = 'SEARCH RESULTS';
    items = searchResults.map(r => ({
      id: r.id,
      name: r.label,
      color: r.color,
      meta: r.meta,
      onClick: r.onClick,
    }));
  } else if (level === 'roots') {
    sectionLabel = 'ROOT SYSTEMS';
    items = [...context.roots]
      .sort((a, b) => b.relevance - a.relevance)
      .map(root => ({
        id: root.id,
        name: root.label,
        color: root.color,
        meta: `${root.relevance}% relevance`,
        onClick: () => onRootSelect(root.id),
      }));
  } else if (level === 'branches' && selectedRoot) {
    sectionLabel = selectedRoot.label.toUpperCase();
    items = selectedRoot.branches.map(branch => ({
      id: branch.id,
      name: branch.label,
      color: selectedRoot.color,
      meta: `${PLANET_BRANCH_TYPE_LABELS[branch.nodeType]} · ${branch.actions.length} action${branch.actions.length === 1 ? '' : 's'}`,
      onClick: () => onBranchSelect(selectedRoot.id, branch.id),
    }));
  } else if (level === 'actions' && selectedRoot && selectedBranch) {
    sectionLabel = selectedBranch.label.toUpperCase();
    items = selectedBranch.actions.map(action => ({
      id: action.id,
      name: action.label,
      color: selectedRoot.color,
      meta: action.hint ?? 'Action node',
      onClick: () => onActionSelect(selectedRoot.id, selectedBranch.id, action.id),
    }));
  }

  const panelStyle = {
    width: '196px',
    maxHeight: '420px',
    background: 'rgba(0, 0, 0, 0.72)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255,255,255,0.07)',
    boxShadow: '0 12px 40px rgba(0,0,0,0.6), inset 0 1px 0 rgba(255,255,255,0.04)',
  } as const;

  return (
    <div className="flex flex-col items-start gap-3">
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
            placeholder="Search roots..."
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

      {depth > 0 && !isSearchActive && (
        <button
          type="button"
          onClick={onDrillBack}
          className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[11px] font-medium text-gray-400 hover:text-white transition-colors"
          style={{ background: 'rgba(0,0,0,0.55)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <ArrowLeft className="w-3 h-3" />
          Back one level
        </button>
      )}

      <UniverseNavBackButton
        label={`Back to ${exitToSubdomainLabel}`}
        onClick={onExitToSubdomain}
      />

      {(isBaseResearchRunning || isClassifyRunning) && (
        <div
          className="research-status-card"
          style={{
            width: '196px',
            borderColor: `${industryColor}33`,
            boxShadow: `0 0 24px ${industryColor}12, inset 0 1px 0 rgba(255,255,255,0.06)`,
          }}
        >
          <div className="research-status-card__bar" style={{ background: `linear-gradient(90deg, transparent, ${industryColor}, transparent)` }} />
          <div className="flex items-center gap-2 px-3 py-2.5">
            <span className="research-status-card__ring" style={{ color: industryColor }}>
              <Loader2 className="w-3.5 h-3.5 animate-spin" />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider truncate" style={{ color: industryColor }}>
                {researchStatusLabel}
              </p>
              <p className="text-[9px] text-white/38 truncate">
                {isClassifyRunning ? 'Generating dynamic roots' : 'Keeping planet stable'}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Role Switcher (Commented out per feedback)
      <div
        className="rounded-2xl p-2.5 flex flex-col gap-1.5"
        style={{
          width: '196px',
          background: 'rgba(0, 0, 0, 0.72)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(255,255,255,0.07)',
          boxShadow: '0 8px 32px rgba(0,0,0,0.5)',
        }}
      >
        <span className="text-[10px] font-semibold tracking-widest px-1.5" style={{ color: '#5E5E5E' }}>
          EXPLORE AS
        </span>
        <div className="flex flex-col gap-1">
          {ROLES.map(r => {
            const Icon = r.icon;
            const isActive = context.role === r.id;
            return (
              <button
                key={r.id}
                type="button"
                onClick={() => onRoleChange?.(r.id)}
                className={`w-full flex items-center gap-2 px-2.5 py-1.5 rounded-lg text-left transition-all duration-200 ${
                  isActive ? 'scale-[1.02]' : 'opacity-60 hover:opacity-100'
                }`}
                style={{
                  background: isActive ? `${r.color}15` : 'transparent',
                  border: isActive ? `1px solid ${r.color}40` : '1px solid transparent',
                }}
              >
                <span
                  className="flex items-center justify-center w-5 h-5 rounded-md"
                  style={{
                    background: isActive ? `${r.color}22` : 'rgba(255,255,255,0.03)',
                    color: r.color,
                  }}
                >
                  <Icon className="w-3.5 h-3.5" />
                </span>
                <span className="text-[11px] font-semibold text-white">
                  {r.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>
      */}

      {context.needsResearch && (
        <div
          className="rounded-2xl overflow-hidden"
          style={{
            width: '196px',
            background: 'rgba(0, 0, 0, 0.78)',
            border: `1px solid ${industryColor}33`,
            backdropFilter: 'blur(14px)',
          }}
        >
          <div
            className="h-1 w-full"
            style={{ background: `linear-gradient(90deg, transparent, ${industryColor}, transparent)` }}
          />
          <div className="px-3.5 py-3.5">
            <div className="flex items-center gap-2 mb-2">
              <Globe className="w-4 h-4" style={{ color: industryColor }} />
              <span className="text-[11px] font-bold text-white">Research this company</span>
            </div>
            <p className="text-[10px] text-white/50 mb-3 leading-snug">
              Add the company URL to build an AI-powered intelligence planet.
            </p>
            <input
              type="url"
              placeholder="https://company.com"
              value={researchUrl}
              onChange={e => { setResearchUrl(e.target.value); setResearchError(null); }}
              className="w-full bg-white/5 border border-white/10 rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder:text-white/25 outline-none focus:border-white/20 mb-2"
            />
            {/* Classification picker */}
            <div className="flex gap-1.5 mb-2">
              {(Object.keys(COMPANY_TAG_LABELS) as CompanyTag[]).map(tag => {
                const Icon = COMPANY_TAG_ICONS[tag];
                const color = COMPANY_TAG_COLORS[tag];
                const isActive = researchClassification === tag;
                return (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => setResearchClassification(isActive ? null : tag)}
                    className="flex-1 flex flex-col items-center gap-0.5 py-1.5 rounded-lg text-[9px] font-bold uppercase tracking-wider transition-all"
                    style={{
                      background: isActive ? `${color}22` : 'rgba(255,255,255,0.04)',
                      border: `1px solid ${isActive ? color + '55' : 'rgba(255,255,255,0.08)'}`,
                      color: isActive ? color : 'rgba(255,255,255,0.35)',
                    }}
                  >
                    <Icon className="w-3 h-3" />
                    {COMPANY_TAG_LABELS[tag]}
                  </button>
                );
              })}
            </div>
            {researchError && (
              <p className="text-[10px] text-red-400 mb-2">{researchError}</p>
            )}
            <button
              disabled={researching || !researchUrl.trim() || !researchClassification}
              onClick={async () => {
                if (!onResearchCompany || !context.subdomainId || !researchClassification) return;
                setResearching(true);
                setResearchError(null);
                try {
                  await onResearchCompany(researchUrl.trim(), context.subdomainId, researchClassification);
                } catch (err) {
                  setResearchError(err instanceof Error ? err.message : 'Research failed');
                  setResearching(false);
                }
              }}
              className="w-full flex items-center justify-center gap-2 py-1.5 rounded-lg text-[11px] font-semibold transition-all"
              style={{
                background: researching || !researchUrl.trim() || !researchClassification ? 'rgba(255,255,255,0.05)' : `${industryColor}22`,
                border: `1px solid ${researching || !researchUrl.trim() || !researchClassification ? 'rgba(255,255,255,0.08)' : industryColor + '44'}`,
                color: researching || !researchUrl.trim() || !researchClassification ? 'rgba(255,255,255,0.3)' : industryColor,
              }}
            >
              {researching ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Globe className="w-3.5 h-3.5" />}
              {researching ? 'Researching…' : 'Launch Research'}
            </button>
          </div>
        </div>
      )}

      {showCoreCard && !context.needsResearch && (
        <PlanetCoreContextCard
          details={coreDetails}
          industryColor={industryColor}
          referenceCompanyId={context.referenceCompanyId}
          activeClassification={context.classification}
          onClassificationChange={onClassificationChange}
        />
      )}

      <div className="rounded-2xl overflow-hidden flex flex-col" style={panelStyle}>
        <div key={listKey + '-header'} className="px-3 pt-3 pb-1 shrink-0 panel-slide-in">
          <span className="text-[10px] font-semibold tracking-widest" style={{ color: '#5E5E5E' }}>
            {sectionLabel}
          </span>
          {!showCoreCard && (
            <>
              <p className="text-[11px] font-semibold text-white mt-0.5 truncate">
                {context.companyName}
              </p>
              <p className="text-[10px] mt-0.5 truncate" style={{ color: industryColor }}>
                {context.roleLabel}
              </p>
            </>
          )}
        </div>

        <div
          key={listKey}
          className="overflow-y-auto flex-1 px-2 pb-2 panel-slide-in"
          style={{ maxHeight: '320px' }}
        >
          {items.length === 0 ? (
            <p className="text-[11px] text-gray-500 px-2 py-4 text-center">No matches</p>
          ) : (
            items.map(item => (
              <button
                key={item.id}
                type="button"
                onClick={item.onClick}
                className="w-full flex items-center gap-2 px-2 py-2 rounded-lg text-left transition-colors hover:bg-white/5 group"
              >
                <span
                  className="w-2 h-2 rounded-full shrink-0"
                  style={{ background: item.color, boxShadow: `0 0 8px ${item.color}66` }}
                />
                <span className="flex-1 min-w-0">
                  <span className="block text-[11px] font-medium text-white truncate">{item.name}</span>
                  {item.meta && (
                    <span className="block text-[9px] text-gray-500 truncate mt-0.5">{item.meta}</span>
                  )}
                </span>
                <ChevronRight className="w-3 h-3 text-gray-600 group-hover:text-gray-400 shrink-0" />
              </button>
            ))
          )}
        </div>
      </div>
    </div>
  );
}

export type { PlanetExploreLevel };
