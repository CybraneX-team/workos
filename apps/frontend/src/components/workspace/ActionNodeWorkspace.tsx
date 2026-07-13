
import { useCallback, useMemo, useState } from 'react';
import {
  X, ChevronRight, Zap, Target, ArrowRight,
  Users, BookOpen, BarChart2, FileText, Activity, Clock,
  Bookmark, BookmarkCheck, ExternalLink,
} from 'lucide-react';
import type {
  PlanetActionNode, PlanetBranchNode, PlanetRootNode, CompanyPlanetContext,
  PlanetBranchNodeType, PlanetCitation,
} from '../../data/companyPlanetRoots';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';

export interface ActionNodeWorkspaceProps {
  actionNode: PlanetActionNode;
  branchNode: PlanetBranchNode;
  rootNode: PlanetRootNode;
  context: CompanyPlanetContext;
  onClose: () => void;
  fullScreen?: boolean;
  isOpen?: boolean;
  /** True when opened from a node already in the workspace — hides the redundant Export button. */
  embedded?: boolean;
}

function getModeColors(role: string, rootColor: string) {
  if (role === 'career') return { primary: '#60a5fa', secondary: '#a78bfa', glow: '#3b82f6' };
  if (role === 'founder') return { primary: '#f97316', secondary: '#fb923c', glow: '#ea580c' };
  if (role === 'investor') return { primary: '#22d3ee', secondary: '#34d399', glow: '#06b6d4' };
  return { primary: rootColor, secondary: rootColor, glow: rootColor };
}

// ── Node-type config — drives the leaf panel layout ─────────────────────────────
const NODE_TYPE_META: Record<PlanetBranchNodeType, { label: string; icon: any; blurb: string }> = {
  information:  { label: 'Information', icon: BookOpen,  blurb: 'Verified fact about this company' },
  metric:       { label: 'Metric',      icon: BarChart2, blurb: 'A comparable measure' },
  signal:       { label: 'Signal',      icon: Activity,  blurb: 'A time-sensitive change to watch' },
  relationship: { label: 'Relationship',icon: Users,     blurb: 'A person or access path' },
  evidence:     { label: 'Evidence',    icon: FileText,  blurb: 'A source artifact or log' },
  decision:     { label: 'Decision',    icon: Target,    blurb: 'Your judgment call' },
};

const IMPACT_COLORS: Record<string, string> = { low: '#94a3b8', medium: '#fbbf24', high: '#f87171' };
const STATUS_LABELS: Record<string, string> = {
  suggested: 'Suggested', planned: 'Planned', active: 'Active', done: 'Done',
};

function GlassCard({ children, className = '', style = {} }: { children: React.ReactNode; className?: string; style?: React.CSSProperties; }) {
  return (
    <div className={`anw-glass-card ${className}`} style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.1)', borderRadius: '16px', padding: '20px', ...style }}>
      {children}
    </div>
  );
}

function SectionTitle({ children, icon: Icon }: { children: React.ReactNode; icon?: any }) {
  return (
    <div className="flex items-center gap-2 mb-3">
      {Icon && <Icon className="w-3.5 h-3.5 text-white/40" />}
      <span className="text-[10px] font-bold tracking-[0.2em] uppercase text-white/40">{children}</span>
    </div>
  );
}

function pct(value?: number | null): string | null {
  if (value === undefined || value === null) return null;
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(n)}%`;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

// ── Shared building blocks ──────────────────────────────────────────────────────

/** Confidence / relevance / impact / status chips — only renders the ones present. */
function MetaChips({ actionNode, branchNode, colors }: {
  actionNode: PlanetActionNode; branchNode: PlanetBranchNode; colors: { primary: string };
}) {
  const conf = pct(actionNode.confidence ?? branchNode.confidence);
  const rel = pct(branchNode.relevance);
  const impact = actionNode.impactScore ?? null;
  const status = actionNode.status ?? null;
  if (!conf && !rel && !impact && !status) return null;
  return (
    <div className="flex flex-wrap items-center gap-2">
      {conf && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: `${colors.primary}14`, color: colors.primary, border: `1px solid ${colors.primary}30` }}>
          Confidence {conf}
        </span>
      )}
      {rel && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white/5 text-white/55 border border-white/10">
          Relevance {rel}
        </span>
      )}
      {impact && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md" style={{ background: `${IMPACT_COLORS[impact]}1f`, color: IMPACT_COLORS[impact], border: `1px solid ${IMPACT_COLORS[impact]}40` }}>
          {impact[0].toUpperCase() + impact.slice(1)} impact
        </span>
      )}
      {status && (
        <span className="text-[10px] font-semibold px-2 py-1 rounded-md bg-white/5 text-white/55 border border-white/10">
          {STATUS_LABELS[status] ?? status}
        </span>
      )}
    </div>
  );
}

/** Source / citation cards — the provenance layer. */
function SourceList({ sources, colors }: { sources?: PlanetCitation[] | null; colors: { primary: string }; }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div className="space-y-2">
      {sources.map((s, i) => (
        <a
          key={s.id ?? `${s.url}-${i}`}
          href={s.url}
          target="_blank"
          rel="noopener noreferrer"
          className="block p-3 rounded-xl transition-colors hover:bg-white/[0.06] group"
          style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.06)' }}
        >
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <div className="text-[13px] font-medium text-white/85 truncate">{s.title || hostOf(s.url)}</div>
              {s.snippet && <p className="text-[12px] text-white/45 leading-relaxed mt-1 line-clamp-2">{s.snippet}</p>}
              <div className="flex items-center gap-2 mt-2">
                <span className="text-[10px] font-medium" style={{ color: colors.primary }}>{hostOf(s.url)}</span>
                {s.retrievedAt && <span className="text-[10px] text-white/30">· {new Date(s.retrievedAt).toLocaleDateString()}</span>}
              </div>
            </div>
            <ExternalLink className="w-3.5 h-3.5 text-white/30 shrink-0 group-hover:text-white/60 transition-colors" />
          </div>
        </a>
      ))}
    </div>
  );
}

/** The single recommended move — the action's own label, not a synthetic checklist. */
function SuggestedMove({ actionNode, colors, onExport, embedded }: {
  actionNode: PlanetActionNode; colors: { primary: string; secondary: string }; onExport: () => void; embedded: boolean;
}) {
  const execChips: string[] = [];
  if (actionNode.owner) execChips.push(`Owner: ${actionNode.owner}`);
  if (actionNode.dueDate) execChips.push(`Due: ${actionNode.dueDate}`);
  if (actionNode.output) execChips.push(`Output: ${actionNode.output}`);

  return (
    <GlassCard style={{ background: `linear-gradient(135deg, ${colors.primary}10, rgba(255,255,255,0.02))`, border: `1px solid ${colors.primary}28` }}>
      <SectionTitle icon={Zap}>Suggested move</SectionTitle>
      <div className="flex items-start gap-3">
        <div className="w-7 h-7 rounded-lg grid place-items-center shrink-0 mt-0.5" style={{ background: `${colors.primary}1f`, border: `1px solid ${colors.primary}3a` }}>
          <ArrowRight className="w-4 h-4" style={{ color: colors.primary }} />
        </div>
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-white leading-snug">{actionNode.label}</p>
          {actionNode.hint && <p className="text-[13px] text-white/55 leading-relaxed mt-1">{actionNode.hint}</p>}
        </div>
      </div>

      {actionNode.nextSteps && actionNode.nextSteps.length > 0 && (
        <ul className="mt-4 space-y-1.5">
          {actionNode.nextSteps.map((step, i) => (
            <li key={i} className="flex items-start gap-2 text-[13px] text-white/65">
              <span className="text-white/30 mt-0.5">{i + 1}.</span>
              <span>{step}</span>
            </li>
          ))}
        </ul>
      )}

      {execChips.length > 0 && (
        <div className="flex flex-wrap gap-2 mt-4">
          {execChips.map((c, i) => (
            <span key={i} className="text-[10px] font-medium px-2 py-1 rounded-md bg-white/5 text-white/55 border border-white/10">{c}</span>
          ))}
        </div>
      )}

      {!embedded && (
        <p className="text-[11px] text-white/40 mt-4">
          Use <button onClick={onExport} className="font-medium underline decoration-dotted" style={{ color: colors.primary }}>Export To Workspace</button> to turn this into a task you own.
        </p>
      )}
    </GlassCard>
  );
}

/** Quiet empty state when no research has been captured for this node yet. */
function NoResearchState({ companyName, colors, onExport }: {
  companyName: string; colors: { primary: string }; onExport: () => void;
}) {
  return (
    <GlassCard className="text-center" style={{ padding: '40px 24px' }}>
      <div className="w-12 h-12 rounded-xl grid place-items-center mx-auto mb-4" style={{ background: `${colors.primary}14`, border: `1px solid ${colors.primary}30` }}>
        <BookOpen className="w-5 h-5" style={{ color: colors.primary }} />
      </div>
      <p className="text-[14px] font-semibold text-white/80">No research captured yet</p>
      <p className="text-[13px] text-white/45 leading-relaxed mt-1.5 max-w-sm mx-auto">
        Nothing has been gathered for this node about {companyName}. Export it to your workspace to track it, or run research on the company planet.
      </p>
      <button
        onClick={onExport}
        className="mt-5 inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110"
        style={{ background: `${colors.primary}1a`, border: `1px solid ${colors.primary}40`, color: colors.primary }}
      >
        <ExternalLink className="w-3.5 h-3.5" /> Export To Workspace
      </button>
    </GlassCard>
  );
}

// ── Node-type-driven leaf body ──────────────────────────────────────────────────

function LeafBody({ actionNode, branchNode, rootNode, context, colors, onExport, embedded }: {
  actionNode: PlanetActionNode;
  branchNode: PlanetBranchNode;
  rootNode: PlanetRootNode;
  context: CompanyPlanetContext;
  colors: { primary: string; secondary: string; glow: string };
  onExport: () => void;
  embedded: boolean;
}) {
  const nodeType = branchNode.nodeType;
  const typeMeta = NODE_TYPE_META[nodeType] ?? NODE_TYPE_META.information;
  const TypeIcon = typeMeta.icon;
  const finding = actionNode.summary ?? branchNode.summary ?? null;
  const sources = actionNode.sources ?? branchNode.sources ?? null;
  const hasResearch = Boolean(finding) || (sources?.length ?? 0) > 0;

  // Hero: what the node IS, framed by its type.
  const hero = (
    <div
      className="rounded-2xl p-6 relative overflow-hidden"
      style={{ background: `linear-gradient(135deg, ${colors.primary}14, rgba(255,255,255,0.02))`, border: `1px solid ${colors.primary}30` }}
    >
      <div className="absolute -top-16 -right-12 w-52 h-52 rounded-full pointer-events-none opacity-40" style={{ background: `radial-gradient(circle, ${colors.primary}40, transparent 70%)` }} />
      <div className="relative">
        <div className="flex items-center gap-2 mb-3">
          <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 rounded-md" style={{ background: `${colors.primary}1f`, color: colors.primary, border: `1px solid ${colors.primary}3a` }}>
            <TypeIcon className="w-3 h-3" /> {typeMeta.label}
          </span>
          {nodeType === 'signal' && sources?.[0]?.retrievedAt && (
            <span className="inline-flex items-center gap-1 text-[10px] text-white/40">
              <Clock className="w-3 h-3" /> detected {new Date(sources[0].retrievedAt!).toLocaleDateString()}
            </span>
          )}
        </div>
        {finding ? (
          <p className="text-[17px] text-white leading-relaxed font-medium max-w-2xl">{finding}</p>
        ) : (
          <p className="text-[15px] text-white/50 leading-relaxed max-w-2xl italic">{typeMeta.blurb} — not yet researched.</p>
        )}
        <div className="mt-4">
          <MetaChips actionNode={actionNode} branchNode={branchNode} colors={colors} />
        </div>
      </div>
    </div>
  );

  // Type-specific middle section.
  let typeSection: React.ReactNode = null;

  if (nodeType === 'metric') {
    typeSection = (
      <GlassCard>
        <SectionTitle icon={BarChart2}>Their position</SectionTitle>
        <p className="text-[13px] text-white/60 leading-relaxed">
          {finding ?? `No measure captured for ${context.companyName} yet.`}
        </p>
        <div className="mt-3 pt-3 border-t border-white/5 flex items-center gap-2 text-[11px] text-white/30">
          <BarChart2 className="w-3.5 h-3.5" /> Side-by-side comparison with your company is coming soon.
        </div>
      </GlassCard>
    );
  } else if (nodeType === 'relationship') {
    const initial = (actionNode.label.match(/[A-Za-z]/)?.[0] ?? context.companyName[0] ?? '?').toUpperCase();
    typeSection = (
      <GlassCard>
        <SectionTitle icon={Users}>Contact</SectionTitle>
        <div className="flex items-center gap-3">
          <div className="w-11 h-11 rounded-full grid place-items-center shrink-0 text-sm font-bold" style={{ background: `${colors.primary}18`, color: colors.primary, border: `1px solid ${colors.primary}33` }}>
            {initial}
          </div>
          <div className="min-w-0">
            <p className="text-[14px] font-semibold text-white truncate">{finding ?? actionNode.label}</p>
            {actionNode.owner && <p className="text-[12px] text-white/45">Relationship owner: {actionNode.owner}</p>}
          </div>
        </div>
      </GlassCard>
    );
  } else if (nodeType === 'decision') {
    // Display-only state control. Options inferred from status enum.
    const options = ['suggested', 'planned', 'active', 'done'];
    const current = actionNode.status ?? 'suggested';
    typeSection = (
      <GlassCard>
        <div className="flex items-center justify-between mb-3">
          <SectionTitle icon={Target}>Current state</SectionTitle>
          <span className="text-[9px] font-semibold tracking-wider uppercase text-white/30 border border-white/10 rounded px-1.5 py-0.5">Display only</span>
        </div>
        <div className="flex flex-wrap gap-2" aria-disabled>
          {options.map(opt => {
            const active = opt === current;
            return (
              <span
                key={opt}
                className="text-[12px] font-medium px-3 py-1.5 rounded-lg cursor-default select-none"
                style={{
                  background: active ? `${colors.primary}1f` : 'rgba(255,255,255,0.03)',
                  color: active ? colors.primary : 'rgba(255,255,255,0.4)',
                  border: `1px solid ${active ? colors.primary + '40' : 'rgba(255,255,255,0.07)'}`,
                }}
              >
                {STATUS_LABELS[opt]}
              </span>
            );
          })}
        </div>
        {finding && <p className="text-[13px] text-white/60 leading-relaxed mt-4">{finding}</p>}
      </GlassCard>
    );
  } else if (nodeType === 'evidence') {
    // Provenance is the content. Sources are primary; render below in the shared block,
    // so here we only add a caption if there's a finding.
    typeSection = finding ? (
      <GlassCard>
        <SectionTitle icon={FileText}>What this shows</SectionTitle>
        <p className="text-[13px] text-white/60 leading-relaxed">{finding}</p>
      </GlassCard>
    ) : null;
  }

  return (
    <div className="flex flex-col gap-5">
      {hero}

      {!hasResearch && nodeType !== 'decision' ? (
        <NoResearchState companyName={context.companyName} colors={colors} onExport={onExport} />
      ) : (
        <>
          {typeSection}

          {sources && sources.length > 0 && (
            <GlassCard>
              <SectionTitle icon={FileText}>{nodeType === 'evidence' ? 'Artifacts & sources' : 'Sources'}</SectionTitle>
              <SourceList sources={sources} colors={colors} />
            </GlassCard>
          )}

          <SuggestedMove actionNode={actionNode} colors={colors} onExport={onExport} embedded={embedded} />

          {/* Why this matters — grounded in the root, not a template. */}
          <GlassCard>
            <SectionTitle icon={Activity}>Why this matters</SectionTitle>
            <p className="text-[13px] text-white/60 leading-relaxed">
              {rootNode.description
                ? `${rootNode.label}: ${rootNode.description}. Tracking this sharpens your ${context.roleLabel} view of ${context.companyName}.`
                : `Strengthens your ${context.roleLabel} read on ${context.companyName} via ${rootNode.label}.`}
            </p>
          </GlassCard>
        </>
      )}
    </div>
  );
}

export function ActionNodeWorkspace({ actionNode, branchNode, rootNode, context, onClose, fullScreen = false, isOpen = true, embedded = false }: ActionNodeWorkspaceProps) {
  const colors = getModeColors(context.role, rootNode.color);
  const nodeType = branchNode.nodeType ?? 'information';
  const typeMeta = NODE_TYPE_META[nodeType] ?? NODE_TYPE_META.information;
  const HeaderIcon = typeMeta.icon;

  // ── Save workflow ────────────────────────────────────────────────────────
  const { save, has, getId, remove } = useSavedWorkflows();

  const lookup = useMemo(() => ({
    companyId: context.companyId,
    role: context.role,
    rootId: rootNode.id,
    branchId: branchNode.id,
    actionId: actionNode.id,
  }), [context.companyId, context.role, rootNode.id, branchNode.id, actionNode.id]);

  const alreadySaved = has(lookup);
  const [exported, setExported] = useState(false);

  const savePayload = useCallback(() => ({
    level: 'action' as const,
    companyId: context.companyId,
    companyName: context.companyName,
    role: context.role,
    roleLabel: context.roleLabel,
    rootId: rootNode.id,
    rootLabel: rootNode.label,
    rootColor: rootNode.color,
    rootDescription: rootNode.description,
    branchId: branchNode.id,
    branchLabel: branchNode.label,
    actionId: actionNode.id,
    actionLabel: actionNode.label,
    actionHint: actionNode.hint ?? undefined,
  }), [context, rootNode, branchNode, actionNode]);

  // ── Export to Workspace ──────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const saved = save(savePayload());
    try { localStorage.setItem('ws_pending_node_v1', saved.id); } catch { /* storage full */ }
    setExported(true);

    if (window.opener && !window.opener.closed) {
      window.opener.postMessage({ type: 'EXPORT_TO_WORKSPACE', savedId: saved.id }, '*');
      window.setTimeout(() => window.close(), 380);
    } else {
      window.dispatchEvent(new CustomEvent('request-open-workspace'));
      window.setTimeout(() => onClose(), 380);
    }
  }, [save, savePayload, onClose]);

  const handleToggleSave = useCallback(() => {
    if (alreadySaved) {
      const id = getId(lookup);
      if (id) remove(id);
    } else {
      save(savePayload());
    }
  }, [alreadySaved, save, remove, getId, lookup, savePayload]);

  return (
    <div
      className={
        fullScreen
          ? "absolute inset-0 w-full h-full text-white cosmos-bg flex flex-col z-50 overflow-hidden"
          : "absolute top-0 right-0 h-full w-[75vw] text-white flex flex-col z-50 overflow-hidden rounded-l-2xl"
      }
      style={
        fullScreen
          ? {}
          : {
              background: 'rgba(10, 10, 14, 0.90)',
              backdropFilter: 'blur(32px)',
              WebkitBackdropFilter: 'blur(32px)',
              borderLeft: '1px solid rgba(255,255,255,0.1)',
              boxShadow: '-10px 0 40px rgba(0,0,0,0.5)',
              transform: isOpen ? 'translateX(0)' : 'translateX(100%)',
              opacity: isOpen ? 1 : 0,
              pointerEvents: isOpen ? 'auto' : 'none',
              transition: 'transform 0.6s cubic-bezier(0.16, 1, 0.3, 1), opacity 0.6s cubic-bezier(0.16, 1, 0.3, 1)'
            }
      }
    >
      {/* Dynamic ambient glow based on rootNode color */}
      <div
        className="absolute inset-0 pointer-events-none opacity-20"
        style={{
          background: `radial-gradient(circle at 50% -20%, ${colors.primary}40 0%, transparent 60%),
                       radial-gradient(circle at 120% 80%, ${colors.secondary}30 0%, transparent 50%)`
        }}
      />

      {/* Top Header Navigation */}
      <header className={`relative z-10 shrink-0 px-8 py-5 flex items-center justify-between border-b ${!fullScreen ? 'rounded-tl-2xl' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(0,0,0,0.3)', backdropFilter: 'blur(24px)' }}>
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-lg" style={{ background: `linear-gradient(135deg, ${colors.primary}33, ${colors.secondary}22)`, border: `1px solid ${colors.primary}44`, boxShadow: `0 0 20px ${colors.primary}20` }}>
            <HeaderIcon className="w-5 h-5" style={{ color: colors.primary }} />
          </div>
          <div>
            <div className="flex items-center gap-2 mb-1">
              <span className="text-[10px] font-bold px-2 py-0.5 rounded uppercase tracking-widest" style={{ background: `${colors.primary}22`, color: colors.primary, border: `1px solid ${colors.primary}44` }}>
                {context.roleLabel}
              </span>
              <span className="text-white/20 text-[10px]">/</span>
              <span className="text-[11px] text-white/40 uppercase tracking-wider">{context.companyName}</span>
            </div>
            <div className="flex items-center gap-2 text-sm font-medium">
              <span style={{ color: rootNode.color }}>{rootNode.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/20" />
              <span className="text-white/60">{branchNode.label}</span>
              <ChevronRight className="w-3.5 h-3.5 text-white/20" />
              <span className="text-white drop-shadow-md">{actionNode.label}</span>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {!embedded && (
            <button
              type="button"
              onClick={handleExport}
              disabled={exported}
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-xs font-semibold transition-all hover:brightness-110 shrink-0 disabled:opacity-80"
              style={{
                background: 'linear-gradient(135deg, rgba(249,198,255,0.15), rgba(193,174,255,0.1))',
                border: '1px solid rgba(193,174,255,0.3)',
                color: '#EDD9FF',
                boxShadow: '0 0 16px rgba(193,174,255,0.15)',
              }}
            >
              <ExternalLink className="w-3.5 h-3.5" />
              {exported ? 'Exported ✓' : 'Export To Workspace'}
            </button>
          )}

          <button
            type="button"
            onClick={handleToggleSave}
            className="px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all duration-300"
            style={{
              background: alreadySaved ? `${colors.primary}18` : `rgba(255,255,255,0.04)`,
              border: alreadySaved ? `1px solid ${colors.primary}40` : '1px solid rgba(255,255,255,0.1)',
              color: alreadySaved ? colors.primary : 'rgba(255,255,255,0.6)',
              boxShadow: alreadySaved ? `0 0 16px ${colors.primary}20` : 'none',
              transform: alreadySaved ? 'scale(1.02)' : 'scale(1)',
            }}
            onMouseEnter={e => { (e.currentTarget as HTMLElement).style.background = alreadySaved ? `${colors.primary}28` : 'rgba(255,255,255,0.08)'; }}
            onMouseLeave={e => { (e.currentTarget as HTMLElement).style.background = alreadySaved ? `${colors.primary}18` : 'rgba(255,255,255,0.04)'; }}
          >
            <div className={`transition-transform duration-300 ${alreadySaved ? 'scale-110' : 'scale-100'}`}>
              {alreadySaved ? <BookmarkCheck className="w-3.5 h-3.5" /> : <Bookmark className="w-3.5 h-3.5" />}
            </div>
            <span className="whitespace-nowrap">{alreadySaved ? 'Saved' : 'Save Workflow'}</span>
          </button>

          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-lg flex items-center gap-2 text-xs font-semibold transition-all hover:bg-white/10"
            style={{ border: '1px solid rgba(255,255,255,0.1)', color: 'rgba(255,255,255,0.6)' }}
          >
            <X className="w-3.5 h-3.5" />
            Close Workspace
          </button>
        </div>
      </header>

      {/* Main Workspace Layout */}
      <div className="relative z-10 flex-1 flex overflow-hidden">

        {/* Left Sidebar — node identity & at-a-glance meta */}
        <div className={`w-80 shrink-0 flex flex-col border-r ${!fullScreen ? 'rounded-bl-2xl' : ''}`} style={{ borderColor: 'rgba(255,255,255,0.05)', background: 'rgba(10,10,14,0.4)', backdropFilter: 'blur(16px)' }}>
          <div className="p-6 flex-1 overflow-y-auto scrollbar-hide">
            <span className="inline-flex items-center gap-1.5 text-[10px] font-bold tracking-[0.15em] uppercase px-2 py-1 rounded-md mb-4" style={{ background: `${colors.primary}14`, color: colors.primary, border: `1px solid ${colors.primary}30` }}>
              <HeaderIcon className="w-3 h-3" /> {typeMeta.label}
            </span>
            <h1 className="text-3xl font-bold tracking-tight text-white mb-2 leading-tight" style={{ textShadow: `0 0 30px ${colors.primary}40` }}>
              {actionNode.label}
            </h1>
            {actionNode.hint && (
              <p className="text-sm leading-relaxed mb-6" style={{ color: colors.primary + 'aa' }}>
                {actionNode.hint}
              </p>
            )}

            <div className="space-y-4">
              <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={typeMeta.icon}>About this node</SectionTitle>
                <p className="text-xs text-white/50 leading-relaxed">{typeMeta.blurb}.</p>
              </div>

              <div className="p-4 rounded-xl" style={{ background: 'rgba(255,255,255,0.02)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <SectionTitle icon={ChevronRight}>Where it sits</SectionTitle>
                <p className="text-xs text-white/50 leading-relaxed">
                  Part of the <strong className="text-white/70">{branchNode.label}</strong> branch under <strong className="text-white/70">{rootNode.label}</strong> on {context.companyName}'s planet.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Right Content Area — node-type-driven body */}
        <div className="flex-1 overflow-y-auto p-6 lg:p-10 scrollbar-hide relative">
          <div className="max-w-5xl mx-auto">
            <LeafBody
              actionNode={actionNode}
              branchNode={branchNode}
              rootNode={rootNode}
              context={context}
              colors={colors}
              onExport={handleExport}
              embedded={embedded}
            />
          </div>
        </div>

      </div>
    </div>
  );
}
