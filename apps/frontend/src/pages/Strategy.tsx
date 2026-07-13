import { useState } from 'react';
import {
  Compass, Target, GitBranch,
  Calendar, CalendarDays, CalendarRange, Milestone,
  Plus, CheckCircle2, AlertTriangle, Clock, XCircle, Sparkles,
  ArrowRight, Link2, ChevronDown, ChevronUp, Rocket, TrendingUp,
  ArrowDownToLine, ArrowUpFromLine,
  Loader2, Shield, Zap, BarChart3, User, Bot,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import {
  goals as initialGoals, suggestedGoals, stageGoalRecommendations,
  decisions as initialDecisions,
} from '../data/mockData';
import type { Goal, GoalHorizon, FundingStage, Decision, DecisionOption } from '../types';

/* ------------------------------------------------------------------ */
/*  Config constants                                                   */
/* ------------------------------------------------------------------ */

const HORIZON_CFG: Record<GoalHorizon, { icon: typeof Calendar; label: string; color: string; bg: string }> = {
  daily:   { icon: Calendar,      label: 'Daily',   color: 'text-cyan-400',    bg: 'bg-cyan-500/10 border-cyan-500/20' },
  weekly:  { icon: CalendarDays,  label: 'Weekly',  color: 'text-sky-400',  bg: 'bg-sky-500/10 border-sky-500/20' },
  monthly: { icon: CalendarRange, label: 'Monthly', color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  stage:   { icon: Milestone,     label: 'Stage',   color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
};

const GOAL_STATUS_CFG = {
  active:    { icon: Clock,          color: 'text-sky-400',  bg: 'bg-sky-500/10' },
  completed: { icon: CheckCircle2,   color: 'text-emerald-400', bg: 'bg-emerald-500/10' },
  'at-risk': { icon: AlertTriangle,  color: 'text-amber-400',   bg: 'bg-amber-500/10' },
  missed:    { icon: XCircle,        color: 'text-red-400',     bg: 'bg-red-500/10' },
};

const ORIGIN_CFG = {
  'top-down':  { icon: ArrowDownToLine,  color: 'text-amber-400', bg: 'bg-amber-500/10', border: 'border-amber-500/20', label: 'Top-Down' },
  'bottom-up': { icon: ArrowUpFromLine,  color: 'text-cyan-400',  bg: 'bg-cyan-500/10',  border: 'border-cyan-500/20', label: 'Bottom-Up' },
};

const DEC_STATUS_CFG = {
  draft:      { color: 'text-gray-400',    bg: 'bg-gray-500/10 border-gray-500/20' },
  evaluating: { color: 'text-sky-400',  bg: 'bg-sky-500/10 border-sky-500/20' },
  ranked:     { color: 'text-amber-400',   bg: 'bg-amber-500/10 border-amber-500/20' },
  decided:    { color: 'text-emerald-400', bg: 'bg-emerald-500/10 border-emerald-500/20' },
};

const EVAL_BARS: { key: keyof DecisionOption['evaluation']; label: string; color: string; goodHigh: boolean }[] = [
  { key: 'impact',      label: 'Impact',     color: 'bg-emerald-500', goodHigh: true },
  { key: 'confidence',  label: 'Confidence', color: 'bg-sky-500', goodHigh: true },
  { key: 'risk',        label: 'Risk',       color: 'bg-red-500',    goodHigh: false },
  { key: 'resources',   label: 'Resources',  color: 'bg-amber-500',  goodHigh: false },
  { key: 'sensitivity', label: 'Sensitivity',color: 'bg-cyan-500',   goodHigh: false },
];

const FUNDING_STAGES: { stage: FundingStage; label: string; color: string }[] = [
  { stage: 'FFF',      label: 'FFF',     color: 'text-gray-400 border-gray-600' },
  { stage: 'Seed',     label: 'Seed',    color: 'text-emerald-400 border-emerald-500/30' },
  { stage: 'Series A', label: 'A',       color: 'text-cyan-400 border-cyan-500/30' },
  { stage: 'Series B', label: 'B',       color: 'text-sky-400 border-sky-500/30' },
  { stage: 'Series C', label: 'C',       color: 'text-sky-400 border-sky-500/30' },
  { stage: 'Series D', label: 'D',       color: 'text-purple-400 border-purple-500/30' },
  { stage: 'Pre-IPO',  label: 'Pre-IPO', color: 'text-amber-400 border-amber-500/30' },
  { stage: 'IPO',      label: 'IPO',     color: 'text-rose-400 border-rose-500/30' },
];

function optimizationScore(ev: DecisionOption['evaluation']): number {
  return Math.round(ev.impact * 0.35 + ev.confidence * 0.25 - ev.risk * 0.2 - ev.resources * 0.1 - ev.sensitivity * 0.1);
}

/* ------------------------------------------------------------------ */
/*  Main component                                                     */
/* ------------------------------------------------------------------ */

type StrategyView = 'goals' | 'decisions';

export default function Strategy() {
  const [view, setView] = useState<StrategyView>('goals');

  return (
    <div>
      <PageHeader
        title="Strategy"
        subtitle="Goals define where you're going. Decisions define how you get there."
        icon={<Compass className="w-6 h-6" />}
        badge="Active"
      />

      {/* View toggle */}
      <div className="flex items-center gap-3 mb-6">
        <div className="flex rounded-lg p-0.5 bg-gray-900/60 border border-gray-800">
          <button
            onClick={() => setView('goals')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === 'goals'
                ? 'bg-emerald-600/15 text-emerald-400 border border-emerald-500/20'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            <Target className="w-4 h-4" /> Goals
          </button>
          <button
            onClick={() => setView('decisions')}
            className={`flex items-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-all ${
              view === 'decisions'
                ? 'bg-sky-600/15 text-sky-400 border border-sky-500/20'
                : 'text-gray-400 hover:text-gray-200 border border-transparent'
            }`}
          >
            <GitBranch className="w-4 h-4" /> Decisions
          </button>
        </div>
        <span className="text-[10px] text-gray-600 ml-2">
          {view === 'goals'
            ? 'Set targets from user input & environment signals'
            : 'Evaluate strategic choices that affect your goals'}
        </span>
      </div>

      {view === 'goals' ? <GoalsView /> : <DecisionsView />}
    </div>
  );
}

/* ================================================================== */
/*  GOALS VIEW                                                         */
/* ================================================================== */

function GoalsView() {
  const [activeHorizon, setActiveHorizon] = useState<GoalHorizon>('monthly');
  const [allGoals, setGoals] = useState<Goal[]>(initialGoals);
  const [showAdd, setShowAdd] = useState(false);
  const [newTitle, setNewTitle] = useState('');
  const [cascadeOpen, setCascadeOpen] = useState(false);
  const [selectedFundingStage, setSelectedFundingStage] = useState<FundingStage>('Seed');
  const [lifecycleOpen, setLifecycleOpen] = useState(true);

  const horizonGoals = allGoals.filter((g) => g.horizon === activeHorizon);
  const crucialGoals = horizonGoals.filter((g) => g.crucial);
  const otherGoals = horizonGoals.filter((g) => !g.crucial);
  const horizonTabs = (['stage', 'monthly', 'weekly', 'daily'] as GoalHorizon[]);

  const addGoal = (title: string, crucial = false) => {
    if (!title.trim()) return;
    const newGoal: Goal = {
      id: `g-new-${Date.now()}`,
      title: title.trim(),
      horizon: activeHorizon,
      department: 'All',
      owner: 'Founder',
      source: 'user',
      status: 'active',
      progress: 0,
      dueDate: new Date().toISOString().split('T')[0],
      crucial,
    };
    setGoals((prev) => [...prev, newGoal]);
    setNewTitle('');
    setShowAdd(false);
  };

  const addSuggested = (idx: number) => {
    const s = suggestedGoals[idx];
    const newGoal: Goal = {
      id: `g-sug-${Date.now()}-${idx}`,
      title: s.title,
      horizon: s.horizon,
      department: s.department,
      owner: 'Founder',
      source: 'suggested',
      status: 'active',
      progress: 0,
      dueDate: new Date().toISOString().split('T')[0],
      crucial: false,
    };
    setGoals((prev) => [...prev, newGoal]);
  };

  const addLifecycleGoal = (rec: typeof stageGoalRecommendations[0]) => {
    const newGoal: Goal = {
      id: `g-lc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: rec.title,
      horizon: 'stage',
      department: rec.department,
      owner: 'Founder',
      source: 'simulator',
      status: 'active',
      progress: 0,
      dueDate: new Date(Date.now() + 180 * 86400000).toISOString().split('T')[0],
      crucial: rec.crucial,
      kpiLinked: rec.kpiLinked,
      fundingStage: rec.stage,
    };
    setGoals((prev) => [...prev, newGoal]);
  };

  const currentStageRecs = stageGoalRecommendations.filter((r) => r.stage === selectedFundingStage);
  const currentStageIdx = FUNDING_STAGES.findIndex((f) => f.stage === selectedFundingStage);
  const stageGoals = allGoals.filter((g) => g.horizon === 'stage');

  return (
    <>
      {/* Horizon Tabs */}
      <div className="flex gap-2 mb-6">
        {horizonTabs.map((h) => {
          const cfg = HORIZON_CFG[h];
          const Icon = cfg.icon;
          const count = allGoals.filter((g) => g.horizon === h).length;
          return (
            <button
              key={h}
              onClick={() => setActiveHorizon(h)}
              className={`flex items-center gap-2 px-4 py-2.5 text-sm rounded-lg border transition-all ${
                activeHorizon === h
                  ? `${cfg.bg} ${cfg.color} font-medium`
                  : 'bg-gray-900/50 border-gray-800 text-gray-400 hover:border-gray-700'
              }`}
            >
              <Icon className="w-4 h-4" />
              {cfg.label}
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-gray-800 text-gray-500">{count}</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Goals List */}
        <div className="col-span-2 space-y-4">
          {crucialGoals.length > 0 && (
            <div>
              <h4 className="text-xs text-amber-400 uppercase tracking-wider mb-3 flex items-center gap-1.5">
                <AlertTriangle className="w-3 h-3" /> Crucial ({crucialGoals.length})
              </h4>
              <div className="space-y-2">
                {crucialGoals.map((g) => <GoalCard key={g.id} goal={g} allGoals={allGoals} />)}
              </div>
            </div>
          )}

          {otherGoals.length > 0 && (
            <div>
              <h4 className="text-xs text-gray-500 uppercase tracking-wider mb-3">Goals ({otherGoals.length})</h4>
              <div className="space-y-2">
                {otherGoals.map((g) => <GoalCard key={g.id} goal={g} allGoals={allGoals} />)}
              </div>
            </div>
          )}

          {horizonGoals.length === 0 && (
            <div className="glass-card p-8 text-center">
              <Target className="w-8 h-8 text-gray-600 mx-auto mb-3" />
              <p className="text-sm text-gray-400">No {activeHorizon} goals yet</p>
              <p className="text-xs text-gray-600 mt-1">Add one below or accept a suggestion</p>
            </div>
          )}

          {/* Add goal */}
          <div className="glass-card p-4">
            {showAdd ? (
              <div className="flex gap-2">
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && addGoal(newTitle)}
                  placeholder={`New ${activeHorizon} goal...`}
                  autoFocus
                  className="flex-1 px-3 py-2 bg-gray-900/70 border border-gray-700 rounded-lg text-sm text-white placeholder-gray-600 focus:outline-none focus:border-sky-500"
                />
                <button onClick={() => addGoal(newTitle, true)} className="px-3 py-2 text-xs bg-amber-500/10 border border-amber-500/20 text-amber-400 rounded-lg hover:bg-amber-500/15 transition-colors">Crucial</button>
                <button onClick={() => addGoal(newTitle)} className="px-3 py-2 text-xs bg-sky-600 text-white rounded-lg hover:bg-sky-500 transition-colors">Add</button>
                <button onClick={() => setShowAdd(false)} className="px-3 py-2 text-xs text-gray-500 hover:text-gray-300 transition-colors">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setShowAdd(true)} className="flex items-center gap-2 text-sm text-gray-400 hover:text-sky-300 transition-colors">
                <Plus className="w-4 h-4" /> Add {activeHorizon} goal
              </button>
            )}
          </div>

          {/* Cascade Alignment */}
          <div className="glass-card p-5">
            <button onClick={() => setCascadeOpen(!cascadeOpen)} className="w-full flex items-center justify-between">
              <h4 className="text-sm font-medium text-gray-300 flex items-center gap-2">
                <Link2 className="w-4 h-4" /> Cascade Alignment
              </h4>
              {cascadeOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
            </button>
            {cascadeOpen && (
              <div className="mt-4 space-y-4">
                {stageGoals.map((sg) => {
                  const monthChildren = allGoals.filter((g) => g.parentGoalId === sg.id);
                  return (
                    <div key={sg.id}>
                      <div className="flex items-center gap-2 mb-2">
                        <Milestone className="w-4 h-4 text-emerald-400" />
                        <span className="text-sm text-emerald-300 font-medium">{sg.title}</span>
                        <span className="text-[10px] text-gray-500 ml-auto">{sg.progress}%</span>
                      </div>
                      {monthChildren.length > 0 && (
                        <div className="ml-5 border-l border-gray-800 pl-4 space-y-2">
                          {monthChildren.map((mg) => {
                            const weekChildren = allGoals.filter((g) => g.parentGoalId === mg.id);
                            return (
                              <div key={mg.id}>
                                <div className="flex items-center gap-2">
                                  <ArrowRight className="w-3 h-3 text-amber-400/50" />
                                  <span className="text-xs text-amber-300">{mg.title}</span>
                                  <span className="text-[10px] text-gray-600 ml-auto">{mg.progress}%</span>
                                </div>
                                {weekChildren.length > 0 && (
                                  <div className="ml-5 border-l border-gray-800/50 pl-3 mt-1 space-y-1">
                                    {weekChildren.map((wg) => {
                                      const dayChildren = allGoals.filter((g) => g.parentGoalId === wg.id);
                                      return (
                                        <div key={wg.id}>
                                          <div className="flex items-center gap-2">
                                            <ArrowRight className="w-2.5 h-2.5 text-sky-400/40" />
                                            <span className="text-[11px] text-sky-300/80">{wg.title}</span>
                                            <span className="text-[10px] text-gray-600 ml-auto">{wg.progress}%</span>
                                          </div>
                                          {dayChildren.map((dg) => (
                                            <div key={dg.id} className="ml-5 flex items-center gap-2 mt-0.5">
                                              <ArrowRight className="w-2 h-2 text-cyan-400/30" />
                                              <span className="text-[10px] text-cyan-400/60">{dg.title}</span>
                                            </div>
                                          ))}
                                        </div>
                                      );
                                    })}
                                  </div>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Right: Summary + Suggested */}
        <div className="space-y-4">
          {/* Progress summary */}
          <div className="glass-card p-5">
            <h4 className="text-sm font-medium text-gray-300 mb-4">{HORIZON_CFG[activeHorizon].label} Summary</h4>
            <div className="grid grid-cols-2 gap-3">
              {Object.entries(GOAL_STATUS_CFG).map(([status, cfg]) => {
                const Icon = cfg.icon;
                const count = horizonGoals.filter((g) => g.status === status).length;
                return (
                  <div key={status} className={`py-2.5 px-3 rounded-lg ${cfg.bg} text-center`}>
                    <Icon className={`w-4 h-4 ${cfg.color} mx-auto mb-1`} />
                    <p className={`text-lg font-bold ${cfg.color}`}>{count}</p>
                    <span className="text-[10px] text-gray-500 capitalize">{status}</span>
                  </div>
                );
              })}
            </div>
            {horizonGoals.length > 0 && (
              <div className="mt-4">
                <div className="flex items-center justify-between text-xs text-gray-500 mb-1">
                  <span>Overall Progress</span>
                  <span>{Math.round(horizonGoals.reduce((s, g) => s + g.progress, 0) / horizonGoals.length)}%</span>
                </div>
                <div className="h-2 rounded-full bg-gray-800 overflow-hidden">
                  <div className="h-full rounded-full bg-sky-500" style={{ width: `${horizonGoals.reduce((s, g) => s + g.progress, 0) / horizonGoals.length}%` }} />
                </div>
              </div>
            )}
          </div>

          {/* Suggested from environment signals */}
          <div className="glass-card p-5">
            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" /> Recommended from Environment
            </h4>
            <p className="text-[10px] text-gray-500 mb-3">
              Derived from market signals, competitor moves, and integrations. Click to adopt.
            </p>
            <div className="space-y-2">
              {suggestedGoals.map((sg, i) => {
                const alreadyAdded = allGoals.some((g) => g.title === sg.title);
                return (
                  <button
                    key={i}
                    onClick={() => !alreadyAdded && addSuggested(i)}
                    disabled={alreadyAdded}
                    className={`w-full text-left p-3 rounded-lg border transition-all ${
                      alreadyAdded
                        ? 'bg-emerald-500/[0.04] border-emerald-500/15 opacity-60'
                        : 'bg-gray-900/50 border-gray-800/50 hover:border-sky-500/30 hover:bg-sky-500/[0.03]'
                    }`}
                  >
                    <p className="text-xs text-gray-300">{sg.title}</p>
                    <div className="flex items-center gap-2 mt-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded ${HORIZON_CFG[sg.horizon].bg} ${HORIZON_CFG[sg.horizon].color}`}>{sg.horizon}</span>
                      <span className="text-[10px] text-gray-600">{sg.department}</span>
                      {alreadyAdded && <CheckCircle2 className="w-3 h-3 text-emerald-400 ml-auto" />}
                    </div>
                    <p className="text-[10px] text-gray-600 mt-1 italic">{sg.source}</p>
                  </button>
                );
              })}
            </div>
          </div>
        </div>
      </div>

      {/* Lifecycle / Funding Stage Goals */}
      <div className="mt-8">
        <button onClick={() => setLifecycleOpen(!lifecycleOpen)} className="w-full flex items-center justify-between mb-4">
          <h3 className="text-sm font-semibold text-gray-200 flex items-center gap-2">
            <Rocket className="w-4 h-4 text-sky-400" /> Lifecycle Stage Goals
          </h3>
          {lifecycleOpen ? <ChevronUp className="w-4 h-4 text-gray-500" /> : <ChevronDown className="w-4 h-4 text-gray-500" />}
        </button>

        {lifecycleOpen && (
          <div className="space-y-4">
            <div className="glass-card p-5">
              <p className="text-[10px] text-gray-500 mb-3">Select your funding stage — simulator recommends key goals for each phase</p>
              <div className="flex items-center gap-1">
                {FUNDING_STAGES.map((fs, i) => {
                  const isActive = fs.stage === selectedFundingStage;
                  const isPast = i < currentStageIdx;
                  return (
                    <button key={fs.stage} onClick={() => setSelectedFundingStage(fs.stage)} className="flex-1 flex flex-col items-center group">
                      <div className={`w-full h-1.5 rounded-full mb-2 transition-all ${
                        isActive ? 'bg-sky-500 shadow-[0_0_8px_rgba(14,165,233,0.4)]' :
                        isPast ? 'bg-sky-500/30' : 'bg-gray-800'
                      }`} />
                      <span className={`text-[10px] font-medium transition-all ${
                        isActive ? `${fs.color.split(' ')[0]} font-bold` :
                        isPast ? 'text-sky-400/50' : 'text-gray-600 group-hover:text-gray-400'
                      }`}>{fs.label}</span>
                    </button>
                  );
                })}
              </div>
              <div className="mt-3 flex items-center justify-center gap-2">
                <TrendingUp className="w-3.5 h-3.5 text-sky-400" />
                <span className="text-xs text-sky-300 font-medium">{selectedFundingStage}</span>
                <span className="text-[10px] text-gray-500">
                  — {currentStageRecs.filter((r) => r.crucial).length} crucial, {currentStageRecs.filter((r) => !r.crucial).length} recommended
                </span>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              {currentStageRecs.map((rec, i) => {
                const alreadyAdded = allGoals.some((g) => g.title === rec.title);
                return (
                  <button
                    key={`${rec.stage}-${i}`}
                    onClick={() => !alreadyAdded && addLifecycleGoal(rec)}
                    disabled={alreadyAdded}
                    className={`text-left p-4 rounded-xl border transition-all ${
                      alreadyAdded
                        ? 'bg-emerald-500/[0.04] border-emerald-500/15 opacity-60'
                        : 'bg-gray-900/40 border-gray-800/50 hover:border-sky-500/30 hover:bg-sky-500/[0.03]'
                    }`}
                  >
                    <div className="flex items-start justify-between mb-1.5">
                      <p className="text-xs text-gray-300 flex-1 pr-2">{rec.title}</p>
                      {alreadyAdded && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    </div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-[10px] text-gray-600">{rec.department}</span>
                      {rec.kpiLinked && <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">{rec.kpiLinked}</span>}
                      {rec.crucial && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">Crucial</span>}
                      <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">Simulator</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

/* ================================================================== */
/*  DECISIONS VIEW                                                     */
/* ================================================================== */

function DecisionsView() {
  const [decs, setDecs] = useState<Decision[]>(initialDecisions);
  const [selectedId, setSelectedId] = useState<string>('dec-pricing');
  const [evaluating, setEvaluating] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);

  const active = decs.find((d) => d.id === selectedId)!;
  const oCfg = ORIGIN_CFG[active.origin];
  const OIcon = oCfg.icon;

  const sortedOptions = [...active.options].sort((a, b) => {
    if (a.rank && b.rank) return a.rank - b.rank;
    return optimizationScore(b.evaluation) - optimizationScore(a.evaluation);
  });

  const handleEvaluate = () => {
    setEvaluating(true);
    setTimeout(() => {
      setDecs((prev) =>
        prev.map((d) => {
          if (d.id !== selectedId) return d;
          const scored = d.options
            .map((o) => ({ ...o, rank: undefined as number | undefined }))
            .sort((a, b) => optimizationScore(b.evaluation) - optimizationScore(a.evaluation))
            .map((o, i) => ({ ...o, rank: i + 1 }));
          return { ...d, options: scored, status: 'ranked' as const };
        }),
      );
      setEvaluating(false);
    }, 2000);
  };

  const handleSelect = (optId: string, by: string) => {
    setDecs((prev) =>
      prev.map((d) =>
        d.id === selectedId ? { ...d, selectedOption: optId, decidedBy: by, status: 'decided' as const } : d,
      ),
    );
  };

  return (
    <>
      {/* Decision List */}
      <div className="flex gap-3 mb-6 overflow-x-auto pb-1">
        {decs.map((d) => {
          const cfg = DEC_STATUS_CFG[d.status];
          const origin = ORIGIN_CFG[d.origin];
          const OI = origin.icon;
          return (
            <button
              key={d.id}
              onClick={() => setSelectedId(d.id)}
              className={`flex-shrink-0 text-left px-4 py-3 rounded-xl border transition-all ${
                selectedId === d.id
                  ? 'bg-sky-600/10 border-sky-500/30'
                  : 'bg-gray-900/50 border-gray-800 hover:border-gray-700'
              }`}
              style={{ minWidth: 240 }}
            >
              <div className="flex items-center gap-2 mb-1">
                <OI className={`w-3.5 h-3.5 ${origin.color}`} />
                <span className="text-xs text-gray-400">{d.department}</span>
                <span className={`text-[10px] px-1.5 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ml-auto`}>{d.status}</span>
              </div>
              <p className="text-sm text-white font-medium truncate">{d.title}</p>
              <span className="text-[10px] text-gray-500">by {d.proposedBy} · {d.options.length} options</span>
            </button>
          );
        })}
      </div>

      <div className="grid grid-cols-3 gap-6">
        {/* Left: Decision Context */}
        <div className="space-y-4">
          <div className="glass-card p-5">
            <div className="flex items-center gap-2 mb-3">
              <OIcon className={`w-4 h-4 ${oCfg.color}`} />
              <span className={`text-xs px-2 py-0.5 rounded-full ${oCfg.bg} border ${oCfg.border} ${oCfg.color}`}>{oCfg.label}</span>
            </div>
            <h3 className="text-base font-semibold text-white mb-1">{active.title}</h3>
            <div className="flex items-center gap-3 text-xs text-gray-500 mb-4">
              <span>{active.department}</span><span>·</span><span>by {active.proposedBy}</span>
            </div>

            <div className="space-y-2">
              <p className="text-[10px] text-gray-500 uppercase tracking-wider">Options ({active.options.length})</p>
              {active.options.map((o) => (
                <div
                  key={o.id}
                  className={`px-3 py-2 rounded-lg border transition-all cursor-pointer ${
                    expanded === o.id ? 'bg-sky-500/5 border-sky-500/20' : 'bg-gray-900/50 border-gray-800/50 hover:border-gray-700'
                  } ${active.selectedOption === o.id ? 'ring-1 ring-emerald-500/40' : ''}`}
                  onClick={() => setExpanded(expanded === o.id ? null : o.id)}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {o.rank && <span className="text-[10px] w-5 h-5 rounded-full bg-sky-500/15 text-sky-300 flex items-center justify-center font-bold">{o.rank}</span>}
                      <span className="text-sm text-gray-200">{o.label}</span>
                    </div>
                    {expanded === o.id ? <ChevronUp className="w-3.5 h-3.5 text-gray-500" /> : <ChevronDown className="w-3.5 h-3.5 text-gray-500" />}
                  </div>
                  {expanded === o.id && (
                    <div className="mt-2 pt-2 border-t border-gray-800/50">
                      <p className="text-xs text-gray-400 mb-2">{o.description}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className={`text-[10px] px-1.5 py-0.5 rounded ${o.source === 'generated' ? 'bg-cyan-500/10 text-cyan-400' : 'bg-gray-800 text-gray-400'}`}>
                          {o.source === 'generated' ? 'AI Generated' : 'User Proposed'}
                        </span>
                        {o.dependencies.map((dep) => (
                          <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500">{dep}</span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Actions */}
            <div className="flex gap-2 mt-4">
              {active.status !== 'decided' && (
                <button
                  onClick={handleEvaluate}
                  disabled={evaluating}
                  className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 bg-sky-600 hover:bg-sky-500 text-white text-sm font-medium rounded-lg transition-all disabled:opacity-50"
                >
                  {evaluating ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  {evaluating ? 'Optimizing...' : 'Run Evaluation'}
                </button>
              )}
              {active.status === 'decided' && (
                <div className="flex-1 flex items-center gap-2 px-4 py-2.5 bg-emerald-500/10 border border-emerald-500/20 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span className="text-sm text-emerald-400">Decided by {active.decidedBy}</span>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Center+Right: Ranked Results */}
        <div className="col-span-2 space-y-4">
          <div className="glass-card p-5">
            <h4 className="text-sm font-medium text-gray-300 mb-4 flex items-center gap-2">
              <Zap className="w-4 h-4 text-amber-400" /> Quantum-Optimized Ranking
            </h4>
            <div className="space-y-4">
              {sortedOptions.map((opt, idx) => {
                const score = optimizationScore(opt.evaluation);
                const isSelected = active.selectedOption === opt.id;
                return (
                  <div
                    key={opt.id}
                    className={`p-4 rounded-xl border transition-all ${
                      isSelected ? 'bg-emerald-500/[0.06] border-emerald-500/20' : 'bg-gray-900/40 border-gray-800/50'
                    }`}
                  >
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-3">
                        <span className={`text-sm w-7 h-7 rounded-lg flex items-center justify-center font-bold ${
                          idx === 0 ? 'bg-amber-500/15 text-amber-400' :
                          idx === 1 ? 'bg-gray-700 text-gray-300' :
                          'bg-gray-800 text-gray-500'
                        }`}>{idx + 1}</span>
                        <div>
                          <h5 className="text-sm font-medium text-white">{opt.label}</h5>
                          <p className="text-[10px] text-gray-500">{opt.description}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <div className="text-right">
                          <span className="text-xs text-gray-500">Score</span>
                          <p className={`text-lg font-bold ${score > 30 ? 'text-emerald-400' : score > 10 ? 'text-amber-400' : 'text-red-400'}`}>{score}</p>
                        </div>
                        {active.status === 'ranked' && !active.selectedOption && (
                          <div className="flex gap-1">
                            <button onClick={() => handleSelect(opt.id, 'Founder')} className="p-1.5 rounded-lg bg-gray-800 hover:bg-gray-700 transition-colors" title="Founder decides">
                              <User className="w-3.5 h-3.5 text-gray-400" />
                            </button>
                            <button onClick={() => handleSelect(opt.id, 'AI Agent')} className="p-1.5 rounded-lg bg-cyan-500/10 hover:bg-cyan-500/15 transition-colors" title="AI decides">
                              <Bot className="w-3.5 h-3.5 text-cyan-400" />
                            </button>
                          </div>
                        )}
                        {isSelected && <CheckCircle2 className="w-5 h-5 text-emerald-400" />}
                      </div>
                    </div>

                    <div className="grid grid-cols-5 gap-3">
                      {EVAL_BARS.map((bar) => {
                        const val = opt.evaluation[bar.key];
                        const absVal = bar.key === 'impact' ? Math.abs(val) : val;
                        const isNeg = bar.key === 'impact' && val < 0;
                        return (
                          <div key={bar.key}>
                            <div className="flex items-center justify-between mb-1">
                              <span className="text-[10px] text-gray-500">{bar.label}</span>
                              <span className="text-[10px] text-gray-400 font-mono">{isNeg ? '-' : ''}{absVal}</span>
                            </div>
                            <div className="h-1.5 rounded-full bg-gray-800 overflow-hidden">
                              <div className={`h-full rounded-full ${bar.color}`} style={{ width: `${absVal}%`, opacity: 0.8 }} />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {opt.dependencies.length > 0 && (
                      <div className="flex items-center gap-2 mt-3 pt-3 border-t border-gray-800/50">
                        <AlertTriangle className="w-3 h-3 text-amber-500/60" />
                        <span className="text-[10px] text-gray-500">Dependencies:</span>
                        {opt.dependencies.map((dep) => (
                          <span key={dep} className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400/70">{dep}</span>
                        ))}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Trade-off Matrix */}
          <div className="glass-card p-5">
            <h4 className="text-sm font-medium text-gray-300 mb-3 flex items-center gap-2">
              <BarChart3 className="w-4 h-4" /> Trade-off Matrix
            </h4>
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-gray-800">
                    <th className="text-left py-2 px-3 text-gray-500 font-medium">Option</th>
                    {EVAL_BARS.map((b) => <th key={b.key} className="text-center py-2 px-3 text-gray-500 font-medium">{b.label}</th>)}
                    <th className="text-center py-2 px-3 text-gray-500 font-medium"><Shield className="w-3 h-3 inline" /> Score</th>
                  </tr>
                </thead>
                <tbody>
                  {sortedOptions.map((opt) => {
                    const score = optimizationScore(opt.evaluation);
                    return (
                      <tr key={opt.id} className="border-b border-gray-800/50">
                        <td className="py-2 px-3 text-gray-300">{opt.label}</td>
                        {EVAL_BARS.map((b) => {
                          const v = opt.evaluation[b.key];
                          const abs = b.key === 'impact' ? Math.abs(v) : v;
                          const good = b.goodHigh ? abs > 60 : abs < 40;
                          return <td key={b.key} className={`text-center py-2 px-3 font-mono ${good ? 'text-emerald-400' : 'text-gray-400'}`}>{b.key === 'impact' && v < 0 ? '-' : ''}{abs}</td>;
                        })}
                        <td className={`text-center py-2 px-3 font-bold ${score > 30 ? 'text-emerald-400' : score > 10 ? 'text-amber-400' : 'text-red-400'}`}>{score}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-[10px] text-gray-600 mt-3">
              Score = Impact(35%) + Confidence(25%) - Risk(20%) - Resources(10%) - Sensitivity(10%). QUBO-optimized.
            </p>
          </div>
        </div>
      </div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/*  Goal Card                                                          */
/* ------------------------------------------------------------------ */

function GoalCard({ goal, allGoals }: { goal: Goal; allGoals: Goal[] }) {
  const cfg = GOAL_STATUS_CFG[goal.status];
  const Icon = cfg.icon;
  const parent = goal.parentGoalId ? allGoals.find((g) => g.id === goal.parentGoalId) : null;

  return (
    <div className="glass-card p-4">
      <div className="flex items-start justify-between mb-2">
        <div className="flex items-start gap-2 flex-1">
          <Icon className={`w-4 h-4 mt-0.5 ${cfg.color} shrink-0`} />
          <div className="flex-1 min-w-0">
            <p className="text-sm text-white">{goal.title}</p>
            <div className="flex items-center gap-2 mt-1 flex-wrap">
              <span className="text-[10px] text-gray-500">{goal.department}</span>
              <span className="text-[10px] text-gray-600">&middot;</span>
              <span className="text-[10px] text-gray-500">{goal.owner}</span>
              {goal.kpiLinked && (
                <>
                  <span className="text-[10px] text-gray-600">&middot;</span>
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-sky-500/10 text-sky-400">{goal.kpiLinked}</span>
                </>
              )}
              {goal.source === 'suggested' && <span className="text-[10px] px-1.5 py-0.5 rounded bg-cyan-500/10 text-cyan-400">Signal</span>}
              {goal.source === 'cascaded' && parent && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-gray-800 text-gray-500 truncate max-w-[150px]">from: {parent.title}</span>
              )}
              {goal.crucial && <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-400 font-medium">Crucial</span>}
            </div>
          </div>
        </div>
        <span className="text-[10px] text-gray-600 shrink-0 ml-2">{goal.dueDate}</span>
      </div>
      <div className="flex items-center gap-2 mt-1">
        <div className="flex-1 h-1.5 rounded-full bg-gray-800 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all ${
              goal.status === 'completed' ? 'bg-emerald-500' : goal.status === 'at-risk' ? 'bg-amber-500' : 'bg-sky-500'
            }`}
            style={{ width: `${goal.progress}%` }}
          />
        </div>
        <span className="text-[10px] text-gray-500 font-mono w-8 text-right">{goal.progress}%</span>
      </div>
    </div>
  );
}
