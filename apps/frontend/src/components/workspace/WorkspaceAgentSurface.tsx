import { useState, useRef, useEffect } from 'react';
import {
  Bot, Play, Trash2, Send, Sparkles,
  Lightbulb, CheckCircle2,
  Loader2, Plus, X, ChevronRight, Check, Clock,
  FileText, BarChart2, Users, DollarSign, Scale,
  ThumbsUp, ThumbsDown, RotateCcw, ChevronDown, ChevronUp,
} from 'lucide-react';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';
import { useProjectsStore } from '../../lib/useProjectsStore';
import {
  useAgentStore,
  AGENT_TYPE_META,
  type AgentType,
  type AgentExecution,
  type AgentPlanStep,
  type AgentOutput,
} from '../../lib/useAgentStore';

const ACCENT = '#c1aeff';

/* ── Agent type icons ─────────────────────────────────────── */
const AGENT_ICONS: Record<AgentType, React.ComponentType<{ className?: string; style?: React.CSSProperties }>> = {
  research: Lightbulb,
  strategy: Sparkles,
  project:  CheckCircle2,
  data:     BarChart2,
  writing:  FileText,
  finance:  DollarSign,
  legal:    Scale,
  meeting:  Users,
  custom:   Bot,
};

/* ── Context pack builder ─────────────────────────────────── */
function buildContextSummary(snap: {
  mrrGrowthRate: number; projectedRunway: number; confidenceScore: number;
  openRisks: number; totalGoals: number; doneGoals: number;
  openTasks: number; projects: number;
}): string {
  return `MRR growth ${snap.mrrGrowthRate}%/mo · Runway ${snap.projectedRunway}mo · Confidence ${snap.confidenceScore}% · ${snap.openRisks} open risks · ${snap.doneGoals}/${snap.totalGoals} goals done · ${snap.openTasks} open tasks across ${snap.projects} projects`;
}

/* ── Plan generator (simulated) ───────────────────────────── */
function generatePlan(agentType: AgentType, prompt: string): AgentPlanStep[] {
  const plansByType: Record<AgentType, AgentPlanStep[]> = {
    research: [
      { step: 1, action: 'Scan workspace for related goals, tasks, and decisions', rationale: 'Build context before searching externally' },
      { step: 2, action: `Research: "${prompt.slice(0, 60)}"`, rationale: 'Gather relevant data from workspace signals' },
      { step: 3, action: 'Synthesise findings into structured insights', rationale: 'Convert raw data into actionable intelligence' },
      { step: 4, action: 'Generate recommendations with confidence levels', rationale: 'Prioritise by impact × feasibility' },
    ],
    strategy: [
      { step: 1, action: 'Map current strategic position from goals and metrics', rationale: 'Establish baseline before modelling scenarios' },
      { step: 2, action: 'Identify top 3 strategic options for: ' + prompt.slice(0, 50), rationale: 'Generate divergent paths before converging' },
      { step: 3, action: 'Score each option by impact, risk, and timeline', rationale: 'Quantify trade-offs for decision maker' },
      { step: 4, action: 'Recommend primary path with mitigation plan', rationale: 'Single clear recommendation with contingencies' },
    ],
    project: [
      { step: 1, action: 'Decompose objective into milestones', rationale: 'Break work into trackable chunks' },
      { step: 2, action: 'Assign owners and estimate effort per task', rationale: 'Match skills to tasks; surface capacity gaps' },
      { step: 3, action: 'Map dependencies and identify critical path', rationale: 'Prevent blockers before they form' },
      { step: 4, action: 'Output task list with priorities and due dates', rationale: 'Ready to create in Projects workspace' },
    ],
    data: [
      { step: 1, action: 'Load current metric snapshots and trend data', rationale: 'Establish current state baseline' },
      { step: 2, action: 'Detect anomalies and inflection points', rationale: 'Surface what the numbers are telling you' },
      { step: 3, action: 'Model 3 scenarios: base / optimistic / downside', rationale: 'Quantify range of outcomes' },
      { step: 4, action: 'Present analysis with recommended metric targets', rationale: 'Actionable numbers, not just history' },
    ],
    writing: [
      { step: 1, action: 'Gather context: goals, audience, tone from workspace', rationale: 'Ground the draft in real business context' },
      { step: 2, action: 'Draft structure and key messages', rationale: 'Agree on skeleton before writing prose' },
      { step: 3, action: 'Write full draft of: ' + prompt.slice(0, 50), rationale: 'First complete draft for review' },
      { step: 4, action: 'Polish with clarity and call-to-action', rationale: 'Ensure output drives the intended action' },
    ],
    finance: [
      { step: 1, action: 'Pull current burn, runway, and MRR data', rationale: 'Accurate inputs for reliable model' },
      { step: 2, action: 'Model current trajectory to 18 months', rationale: 'Base case before stress testing' },
      { step: 3, action: 'Apply scenarios: +10% growth / -15% revenue / hire plan', rationale: 'Stress test the assumptions' },
      { step: 4, action: 'Output recommended actions to extend runway or accelerate', rationale: 'Decision-ready financial guidance' },
    ],
    legal: [
      { step: 1, action: 'Identify applicable compliance areas', rationale: 'Scope before diving into specifics' },
      { step: 2, action: 'Check against current workspace context and risks', rationale: 'Flag gaps versus existing risk register' },
      { step: 3, action: 'Generate checklist of required actions', rationale: 'Concrete to-do list, not generic advice' },
      { step: 4, action: 'Highlight high-priority items with deadlines', rationale: 'Prioritise what to act on first' },
    ],
    meeting: [
      { step: 1, action: 'Pull open decisions, at-risk items, and milestone status', rationale: 'Ground agenda in what actually needs discussion' },
      { step: 2, action: 'Draft agenda with time allocations', rationale: 'Respect everyone\'s time with a structured plan' },
      { step: 3, action: 'Prepare briefing doc with context for each agenda item', rationale: 'Arrive informed, not just present' },
      { step: 4, action: 'Output action item template for post-meeting capture', rationale: 'Decisions need owners and dates to move forward' },
    ],
    custom: [
      { step: 1, action: 'Analyse workspace context relevant to this task', rationale: 'Understand what data is available' },
      { step: 2, action: 'Execute: ' + prompt.slice(0, 70), rationale: 'Process user request against workspace state' },
      { step: 3, action: 'Validate output against goals and metrics', rationale: 'Ensure result is aligned with business objectives' },
    ],
  };
  return plansByType[agentType] ?? plansByType.custom;
}

/* ── Output generator (simulated) ────────────────────────── */
function generateOutput(exec: AgentExecution, snap: Record<string, unknown>): AgentOutput {
  const ts = new Date().toISOString();
  const baseMRR = snap.baseMRR as number;
  const projectedRunway = snap.projectedRunway as number;
  const openRisks = (snap.risks as { status: string }[]).filter(r => r.status !== 'Mitigated').length;
  const goalProgress = snap.goalProgress as number;

  const outputs: Record<AgentType, AgentOutput> = {
    research: {
      format: 'structured',
      headline: `Research complete: "${exec.prompt.slice(0, 60)}"`,
      body: `Based on your workspace context (${exec.contextSummary}), here are the key findings:\n\nYour current signals suggest strong product-market fit indicators with activation trends improving. The competitive landscape requires monitoring, particularly around pricing differentiation.`,
      bullets: [
        `Current MRR $${(baseMRR/1000).toFixed(0)}k — trajectory needs acceleration to hit annual target`,
        `${openRisks} open risks that may impact research conclusions`,
        `Goal completion at ${goalProgress}% — aligned with research priorities`,
        'Recommend: validate findings with customer interviews this sprint',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    strategy: {
      format: 'structured',
      headline: 'Strategic Options Analysis',
      body: `Three strategic paths identified for: "${exec.prompt.slice(0, 80)}"`,
      bullets: [
        '🔵 Option A (Recommended): Double down on product-led growth — 6-month payback, low risk',
        '🟡 Option B: Expand into enterprise — higher revenue ceiling, 12-month sales cycle',
        '🔴 Option C: Raise bridge round now — extends runway but dilutes at lower valuation',
        `Current runway ${projectedRunway}mo supports Option A without additional fundraising`,
        'Next step: schedule strategy session to align team on Option A execution plan',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    project: {
      format: 'bullet_list',
      headline: 'Project Plan Generated',
      body: `Decomposed "${exec.prompt.slice(0, 80)}" into ${4 + Math.floor(Math.random() * 3)} tasks across 3 milestones:`,
      bullets: [
        'M1 (Week 1-2): Discovery & scoping — owner: Founder',
        'M2 (Week 3-4): Build & validate — owner: Engineering lead',
        'M3 (Week 5-6): Ship & measure — owner: Product',
        'Critical dependency: M2 depends on M1 sign-off',
        'Risk: scope creep — recommend weekly scope review',
        'Ready to create in Projects workspace — click Sync to add tasks',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    data: {
      format: 'structured',
      headline: 'Metric Analysis Complete',
      body: `Data analysis across ${exec.contextSummary}:`,
      bullets: [
        `Base case: ${projectedRunway}mo runway at current burn — stable`,
        `Optimistic (+15% MRR growth): runway extends to ${Math.round(projectedRunway * 1.2)}mo`,
        `Downside (-20% revenue): runway compresses to ${Math.round(projectedRunway * 0.75)}mo — action required`,
        `${openRisks} risk factors could impact downside scenario`,
        'Recommended metric focus: Activation Rate — highest leverage on MRR',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    writing: {
      format: 'text',
      headline: 'Draft Ready for Review',
      body: `Draft for: "${exec.prompt.slice(0, 80)}"\n\n---\n\nWe're excited to share an update on our progress this quarter. Our team has been executing against our core objectives, and the results reflect the discipline and focus we've maintained.\n\nKey highlights:\n• Revenue growing at a healthy pace, with strong signals from our most engaged customers\n• Product improvements shipping on schedule, with positive early feedback\n• Team remains aligned on our north star and committed to the mission\n\nLooking ahead, our priorities are clear and our plan is in motion. We'd love to connect to discuss in more detail.\n\n---\n\n[Edit before sending — personalise for your audience]`,
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    finance: {
      format: 'structured',
      headline: `Financial Forecast — ${projectedRunway}mo Runway`,
      body: `Financial model for current workspace state:`,
      bullets: [
        `Current burn: ~$${Math.round(baseMRR * 1.4 / 1000)}k/mo · Revenue: $${Math.round(baseMRR/1000)}k/mo`,
        `Net burn: $${Math.max(0, Math.round((baseMRR * 0.4) / 1000))}k/mo · Runway: ${projectedRunway} months`,
        `${projectedRunway < 12 ? '⚠ Below 12-month safe threshold — begin fundraise process' : '✓ Runway comfortable — no immediate funding pressure'}`,
        'To extend runway 6 months: reduce burn 12% OR grow MRR by 20%',
        'Recommended: model hiring plan against revenue milestones before next board meeting',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    legal: {
      format: 'bullet_list',
      headline: 'Compliance Checklist Generated',
      body: `Legal / compliance review for: "${exec.prompt.slice(0, 60)}"`,
      bullets: [
        '✓ Privacy policy — ensure GDPR-compliant data processing addendum with all vendors',
        '⚠ Terms of service — review indemnification clauses before Series A due diligence',
        '✓ IP assignment — confirm all team members have signed IP agreements',
        '⚠ Employment — review contractor vs employee classification for engineers',
        '✓ Equity — cap table current; 409A valuation needed if >12 months old',
        'Priority: address ⚠ items before next funding round',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    meeting: {
      format: 'structured',
      headline: 'Meeting Agenda Prepared',
      body: `Agenda for: "${exec.prompt.slice(0, 60)}" (45 min suggested)`,
      bullets: [
        '0:00–0:05 · Check-in & blockers (Facilitator)',
        '0:05–0:15 · Metric review — MRR, Activation, Runway (Data lead)',
        `0:15–0:25 · Open decisions (${openRisks > 0 ? openRisks + ' items' : 'none this week'}) (Decision owner)`,
        '0:25–0:35 · Sprint priorities & unblocking (Engineering lead)',
        '0:35–0:45 · Action items capture & next meeting date (All)',
        'Pre-read: share metric snapshot 24h before meeting',
      ],
      generatedAt: ts,
      reviewStatus: 'pending',
    },
    custom: {
      format: 'text',
      headline: `Analysis: "${exec.prompt.slice(0, 60)}"`,
      body: `Custom agent task executed against workspace context.\n\n${exec.contextSummary}\n\nBased on the available data, here is the analysis for your request. The workspace signals suggest prioritising execution velocity over new initiatives in the near term, given the current metric positions and risk profile.\n\nRecommend reviewing this output with your team and creating specific tasks to act on the insights.`,
      generatedAt: ts,
      reviewStatus: 'pending',
    },
  };
  return outputs[exec.agentType] ?? outputs.custom;
}


/* ── Status badge ─────────────────────────────────────────── */
function StatusBadge({ status }: { status: AgentExecution['status'] }) {
  const cfg: Record<AgentExecution['status'], { label: string; color: string }> = {
    idle:              { label: 'Idle',             color: '#94a3b8' },
    planning:          { label: 'Planning…',        color: '#a78bfa' },
    awaiting_approval: { label: 'Needs Approval',   color: '#fbbf24' },
    executing:         { label: 'Executing…',       color: '#60a5fa' },
    reviewing:         { label: 'Review Output',    color: '#34d399' },
    approved:          { label: 'Approved',         color: '#34d399' },
    rejected:          { label: 'Rejected',         color: '#fb7185' },
    done:              { label: 'Done',             color: '#34d399' },
  };
  const c = cfg[status];
  return (
    <span className="text-[9px] font-bold px-1.5 py-0.5 rounded-full" style={{ background: `${c.color}20`, color: c.color, border: `1px solid ${c.color}35` }}>
      {c.label}
    </span>
  );
}

/* ── Main component ───────────────────────────────────────── */
export function WorkspaceAgentSurface() {
  const {
    baseMRR, mrrGrowthRate, projectedRunway, operatingBurn,
    cashBalance, monthlyRev, confidenceScore,
    risks, goals, goalProgress, gtmChannels, tasks: founderTasks, totalFTE,
  } = useFounderWorkspace();
  const { projects } = useProjectsStore();

  const {
    executions, pending, active,
    createExecution, setPlan, approvePlan, rejectPlan,
    setOutput, approveOutput, requestRevision, deleteExecution, clearAll,
  } = useAgentStore();

  const snap = {
    baseMRR, mrrGrowthRate, projectedRunway, operatingBurn,
    cashBalance, monthlyRev, confidenceScore,
    risks, goals, goalProgress, gtmChannels, tasks: founderTasks, totalFTE,
  };

  const contextSummary = buildContextSummary({
    mrrGrowthRate,
    projectedRunway,
    confidenceScore,
    openRisks: risks.filter(r => r.status !== 'Mitigated').length,
    totalGoals: goals.length,
    doneGoals: goals.filter(g => g.done).length,
    openTasks: founderTasks.filter(t => !t.done && t.status !== 'done').length,
    projects: projects.length,
  });

  // New execution form
  const [selectedType, setSelectedType] = useState<AgentType>('strategy');
  const [prompt, setPrompt] = useState('');
  const [showForm, setShowForm] = useState(false);

  // Expanded execution detail
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [revisionNote, setRevisionNote] = useState('');

  // Chat
  const [chatInput, setChatInput] = useState('');
  const [chatMsgs, setChatMsgs] = useState<{ id: string; role: 'user' | 'agent'; text: string }[]>([]);
  const [chatTyping, setChatTyping] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => { chatEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [chatMsgs, chatTyping]);

  const launchAgent = () => {
    if (!prompt.trim()) return;
    const id = createExecution({
      agentType: selectedType,
      title: prompt.slice(0, 60),
      prompt,
      contextSummary,
    });
    setPrompt('');
    setShowForm(false);
    setExpandedId(id);

    // Simulate planning phase
    setTimeout(() => {
      const plan = generatePlan(selectedType, prompt);
      setPlan(id, plan);
    }, 1200);
  };

  const runApprovedExecution = (exec: AgentExecution) => {
    approvePlan(exec.id);
    setTimeout(() => {
      const output = generateOutput(exec, snap as unknown as Record<string, unknown>);
      setOutput(exec.id, output);
    }, 1800 + Math.random() * 800);
  };

  const sendChat = () => {
    const text = chatInput.trim();
    if (!text) return;
    setChatMsgs(m => [...m, { id: Date.now().toString(), role: 'user', text }]);
    setChatInput('');
    setChatTyping(true);
    setTimeout(() => {
      setChatTyping(false);
      const q = text.toLowerCase();
      let reply = `I've analysed your workspace (${contextSummary}). `;
      if (q.includes('agent') || q.includes('run') || q.includes('start'))
        reply += `You can launch any of the ${Object.keys(AGENT_TYPE_META).length} agent types using the + New Task button. Each follows a plan → approve → execute → review workflow so you stay in control.`;
      else if (q.includes('metric') || q.includes('mrr') || q.includes('revenue'))
        reply += `MRR is at $${(baseMRR/1000).toFixed(0)}k growing ${mrrGrowthRate}%/mo. Try the Data agent for a full metric scenario analysis.`;
      else if (q.includes('risk') || q.includes('blocker'))
        reply += `There are ${risks.filter(r => r.status !== 'Mitigated').length} open risks. Confidence score is ${confidenceScore}%. Launch the Strategy agent to model mitigation options.`;
      else if (q.includes('runway') || q.includes('burn') || q.includes('cash'))
        reply += `Runway is ${projectedRunway} months at current burn. ${projectedRunway < 12 ? 'This is below the 12-month safety threshold — consider the Finance agent for a full scenario model.' : 'Runway is healthy.'}`;
      else
        reply += `Ask me about metrics, risks, runway, or goals — or launch an agent to get structured analysis and output you can act on.`;
      setChatMsgs(m => [...m, { id: (Date.now()+1).toString(), role: 'agent', text: reply }]);
    }, 1200 + Math.random() * 500);
  };

  const pendingCount = pending.length;
  const activeCount = active.length;

  return (
    <div className="flex flex-col h-full min-h-0 w-full overflow-hidden gap-3">

      {/* ── Header bar ────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-3 px-1">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full shrink-0" style={{
            background: activeCount > 0 ? ACCENT : pendingCount > 0 ? '#fbbf24' : 'rgba(255,255,255,0.2)',
            boxShadow: activeCount > 0 ? `0 0 8px ${ACCENT}88` : 'none',
          }} />
          <span className="text-[11px] font-semibold text-white/50">
            {activeCount > 0 ? `${activeCount} agent${activeCount > 1 ? 's' : ''} running`
             : pendingCount > 0 ? `${pendingCount} awaiting your approval`
             : 'Agent surface ready'}
          </span>
        </div>
        <div className="flex-1" />
        {executions.length > 0 && (
          <button type="button" onClick={clearAll} className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-[10px] text-white/30 hover:text-white/60 transition-all cursor-pointer border border-white/8">
            <Trash2 className="w-3 h-3" /> Clear all
          </button>
        )}
        <button
          type="button"
          onClick={() => setShowForm(p => !p)}
          className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer"
          style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}35`, color: ACCENT }}
        >
          <Plus className="w-3 h-3" /> New Task
        </button>
      </div>

      {/* ── Mission statement ─────────────────────────────────────── */}
      <p className="shrink-0 px-1 -mt-1 text-[11px] text-white/35 leading-relaxed">
        Agents research, draft, and execute multi-step work using your live workspace data — every plan is shown to you before it runs, so nothing ships without your approval.
      </p>

      {/* ── New task form ─────────────────────────────────────────── */}
      {showForm && (
        <div className="shrink-0 rounded-2xl p-4 flex flex-col gap-3" style={{ background: 'rgba(193,174,255,0.04)', border: `1px solid ${ACCENT}25` }}>
          <div className="text-[10px] font-bold uppercase tracking-widest text-white/40">Launch Agent — pick a type, describe the task</div>

          {/* Agent type grid */}
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1.5">
            {(Object.keys(AGENT_TYPE_META) as AgentType[]).map(type => {
              const meta = AGENT_TYPE_META[type];
              const Icon = AGENT_ICONS[type];
              const active = selectedType === type;
              return (
                <button
                  key={type}
                  type="button"
                  onClick={() => setSelectedType(type)}
                  title={meta.description}
                  className="flex flex-col items-center gap-1 p-2 rounded-xl text-[9px] font-bold uppercase tracking-wide transition-all cursor-pointer"
                  style={{
                    background: active ? `${meta.color}20` : 'rgba(255,255,255,0.03)',
                    border: `1px solid ${active ? meta.color + '50' : 'rgba(255,255,255,0.08)'}`,
                    color: active ? meta.color : 'rgba(255,255,255,0.4)',
                  }}
                >
                  <Icon className="w-4 h-4" />
                  {meta.label}
                </button>
              );
            })}
          </div>

          {/* Selected type description — always visible, not just on hover */}
          <p className="text-[10px] text-white/40 leading-relaxed -mt-1.5 px-0.5">
            {AGENT_TYPE_META[selectedType].description}
          </p>

          {/* Prompt */}
          <div className="flex gap-2">
            <textarea
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              onKeyDown={e => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) launchAgent(); }}
              placeholder={`What should the ${AGENT_TYPE_META[selectedType].label} agent do? (⌘↵ to launch)`}
              rows={2}
              className="flex-1 text-[11px] bg-white/[0.04] border border-white/10 rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 transition-colors resize-none"
            />
            <button
              type="button"
              disabled={!prompt.trim()}
              onClick={launchAgent}
              className="px-4 rounded-xl text-[11px] font-bold transition-all cursor-pointer disabled:opacity-40"
              style={{ background: `${ACCENT}20`, border: `1px solid ${ACCENT}40`, color: ACCENT }}
            >
              <Play className="w-4 h-4" />
            </button>
          </div>

          <p className="text-[9px] text-white/25">Context snapshot: {contextSummary}</p>
        </div>
      )}

      {/* ── Main area ─────────────────────────────────────────────── */}
      <div className="flex-1 min-h-0 flex gap-3 overflow-hidden">

        {/* ── LEFT: Execution queue ────────────────────────────────── */}
        <div className="flex flex-col shrink-0 overflow-hidden rounded-2xl" style={{ width: 270, background: 'rgba(255,255,255,0.015)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <Bot className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Agent Queue</span>
            <span className="ml-auto text-[10px] font-bold px-1.5 py-0.5 rounded-md" style={{ background: `${ACCENT}18`, color: ACCENT }}>
              {executions.length}
            </span>
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto">
            {executions.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-2 p-6 text-center">
                <Bot className="w-8 h-8 text-violet-400/30" />
                <p className="text-[11px] text-white/25">No agent tasks yet</p>
                <p className="text-[9px] text-white/15">Click "+ New Task" to launch an agent</p>
              </div>
            )}

            {executions.map(exec => {
              const meta = AGENT_TYPE_META[exec.agentType];
              const Icon = AGENT_ICONS[exec.agentType];
              const isExpanded = expandedId === exec.id;
              const needsAction = exec.status === 'awaiting_approval' || exec.status === 'reviewing';
              return (
                <div
                  key={exec.id}
                  className="border-b border-white/[0.04] transition-colors"
                  style={{ background: isExpanded ? `${meta.color}08` : undefined }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(isExpanded ? null : exec.id)}
                    className="w-full flex items-start gap-2 px-4 py-3 text-left hover:bg-white/[0.02] transition-colors cursor-pointer"
                  >
                    <div className="w-6 h-6 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${meta.color}18`, border: `1px solid ${meta.color}30` }}>
                      <Icon className="w-3 h-3" style={{ color: meta.color }} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-[11px] font-semibold text-white/80 leading-tight truncate">{exec.title}</div>
                      <div className="flex items-center gap-1.5 mt-1">
                        <span className="text-[8px] font-bold uppercase tracking-wider" style={{ color: meta.color }}>{meta.label}</span>
                        {needsAction && <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />}
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1 shrink-0">
                      <StatusBadge status={exec.status} />
                      {isExpanded ? <ChevronUp className="w-3 h-3 text-white/20" /> : <ChevronDown className="w-3 h-3 text-white/20" />}
                    </div>
                  </button>

                  {/* Expanded plan/output controls */}
                  {isExpanded && (
                    <div className="px-4 pb-3 space-y-2">
                      {/* Plan steps */}
                      {exec.plan && exec.status === 'awaiting_approval' && (
                        <>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-1">Proposed Plan</div>
                          {exec.plan.map(s => (
                            <div key={s.step} className="flex gap-2 text-[10px]">
                              <span className="w-4 h-4 rounded-full flex items-center justify-center text-[8px] font-bold shrink-0 mt-0.5" style={{ background: `${meta.color}20`, color: meta.color }}>{s.step}</span>
                              <div>
                                <div className="text-white/70 font-medium leading-tight">{s.action}</div>
                                <div className="text-white/30 text-[9px]">{s.rationale}</div>
                              </div>
                            </div>
                          ))}
                          <div className="flex gap-2 pt-1">
                            <button type="button" onClick={() => runApprovedExecution(exec)} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer transition-all" style={{ background: `${meta.color}20`, border: `1px solid ${meta.color}35`, color: meta.color }}>
                              <ThumbsUp className="w-3 h-3" /> Approve
                            </button>
                            <button type="button" onClick={() => rejectPlan(exec.id, 'Plan rejected')} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] text-white/35 hover:text-rose-400 cursor-pointer border border-white/10">
                              <ThumbsDown className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}

                      {/* Output review */}
                      {exec.output && exec.status === 'reviewing' && (
                        <>
                          <div className="text-[9px] font-bold uppercase tracking-wider text-white/30">Review Output</div>
                          <textarea
                            value={revisionNote}
                            onChange={e => setRevisionNote(e.target.value)}
                            placeholder="Optional revision notes…"
                            rows={2}
                            className="w-full text-[10px] bg-white/[0.03] border border-white/10 rounded-lg px-2 py-1.5 text-white placeholder-white/20 focus:outline-none resize-none"
                          />
                          <div className="flex gap-2">
                            <button type="button" onClick={() => { approveOutput(exec.id, revisionNote || undefined); setRevisionNote(''); }} className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded-lg text-[10px] font-bold cursor-pointer" style={{ background: '#34d39920', border: '1px solid #34d39935', color: '#34d399' }}>
                              <Check className="w-3 h-3" /> Approve
                            </button>
                            <button type="button" onClick={() => { requestRevision(exec.id, revisionNote || 'Needs revision'); setRevisionNote(''); }} className="flex items-center gap-1 px-3 py-1.5 rounded-lg text-[10px] text-white/35 hover:text-amber-400 cursor-pointer border border-white/10">
                              <RotateCcw className="w-3 h-3" />
                            </button>
                          </div>
                        </>
                      )}

                      {/* Running indicator */}
                      {(exec.status === 'planning' || exec.status === 'executing') && (
                        <div className="flex items-center gap-2 text-[10px] text-violet-300/70">
                          <Loader2 className="w-3 h-3 animate-spin" />
                          {exec.status === 'planning' ? 'Generating plan…' : 'Executing…'}
                        </div>
                      )}

                      <button type="button" onClick={() => deleteExecution(exec.id)} className="flex items-center gap-1 text-[9px] text-white/20 hover:text-rose-400 cursor-pointer mt-1">
                        <X className="w-3 h-3" /> Remove
                      </button>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        {/* ── RIGHT: Output log + chat ─────────────────────────────── */}
        <div className="flex-1 min-w-0 flex flex-col overflow-hidden rounded-2xl" style={{ background: 'rgba(255,255,255,0.012)', border: '1px solid rgba(255,255,255,0.07)' }}>
          <div className="shrink-0 flex items-center gap-2 px-4 py-3 border-b border-white/[0.06]">
            <Sparkles className="w-3.5 h-3.5 text-violet-400 shrink-0" />
            <span className="text-[10px] font-black uppercase tracking-widest text-white/50">Agent Output</span>
            {pendingCount > 0 && (
              <span className="ml-2 text-[9px] font-bold px-1.5 py-0.5 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/30">
                {pendingCount} need review
              </span>
            )}
          </div>

          <div className="flex-1 min-h-0 overflow-y-auto px-4 py-4 space-y-3">
            {executions.length === 0 && chatMsgs.length === 0 && (
              <div className="flex flex-col items-center justify-center h-full gap-4 opacity-60">
                <div className="w-12 h-12 rounded-2xl flex items-center justify-center" style={{ background: `${ACCENT}10`, border: `1px solid ${ACCENT}20` }}>
                  <Bot className="w-6 h-6 text-violet-400" />
                </div>
                <div className="text-center">
                  <p className="text-[12px] font-semibold text-white/40">Agent surface ready</p>
                  <p className="text-[10px] text-white/25 mt-1">Launch an agent task or ask a question below</p>
                </div>
              </div>
            )}

            {/* Execution output cards */}
            {executions.map(exec => {
              if (!exec.output) return null;
              const meta = AGENT_TYPE_META[exec.agentType];
              const Icon = AGENT_ICONS[exec.agentType];
              const isDone = exec.status === 'done';
              return (
                <div key={`out-${exec.id}`} className="rounded-xl overflow-hidden" style={{ background: `${meta.color}08`, border: `1px solid ${meta.color}${isDone ? '30' : '15'}` }}>
                  <div className="flex items-center gap-2 px-3 py-2 border-b" style={{ borderColor: `${meta.color}15` }}>
                    <Icon className="w-3 h-3 shrink-0" style={{ color: meta.color }} />
                    <span className="text-[9px] font-black uppercase tracking-widest" style={{ color: meta.color }}>{meta.label}</span>
                    <ChevronRight className="w-3 h-3 text-white/15" />
                    <span className="text-[10px] font-bold text-white/80 flex-1 truncate">{exec.output.headline}</span>
                    <StatusBadge status={exec.status} />
                    {isDone && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400 shrink-0" />}
                    <button type="button" onClick={() => deleteExecution(exec.id)} className="p-0.5 text-white/15 hover:text-white/40 cursor-pointer">
                      <X className="w-3 h-3" />
                    </button>
                  </div>
                  <div className="px-4 py-3 space-y-2">
                    <p className="text-[11px] text-white/75 leading-relaxed whitespace-pre-line">{exec.output.body}</p>
                    {exec.output.bullets && (
                      <ul className="space-y-1">
                        {exec.output.bullets.map((b, i) => (
                          <li key={i} className="text-[11px] text-white/60 flex gap-2">
                            <span className="text-white/25 shrink-0">·</span> {b}
                          </li>
                        ))}
                      </ul>
                    )}
                    {exec.output.reviewNotes && (
                      <p className="text-[10px] text-white/35 italic border-t border-white/5 pt-2">Note: {exec.output.reviewNotes}</p>
                    )}
                    {exec.output.reviewStatus === 'pending' && exec.status === 'reviewing' && (
                      <div className="flex items-center gap-1 text-[10px] text-amber-400/70 border-t border-white/5 pt-2">
                        <Clock className="w-3 h-3" /> Awaiting your review — approve or request revision in the queue
                      </div>
                    )}
                  </div>
                </div>
              );
            })}

            {/* Chat messages */}
            {chatMsgs.map(msg => (
              <div key={msg.id} className={`flex gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'agent' && (
                  <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}25` }}>
                    <Bot className="w-3 h-3 text-violet-400" />
                  </div>
                )}
                <div className="max-w-[80%] rounded-xl px-3 py-2" style={msg.role === 'user'
                  ? { background: `${ACCENT}12`, border: `1px solid ${ACCENT}25` }
                  : { background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }
                }>
                  <p className="text-[11px] leading-relaxed text-white/70">{msg.text}</p>
                </div>
              </div>
            ))}

            {chatTyping && (
              <div className="flex gap-2 justify-start">
                <div className="w-5 h-5 rounded-lg flex items-center justify-center shrink-0 mt-0.5" style={{ background: `${ACCENT}18`, border: `1px solid ${ACCENT}25` }}>
                  <Bot className="w-3 h-3 text-violet-400" />
                </div>
                <div className="rounded-xl px-4 py-3 flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  {[0, 1, 2].map(i => <div key={i} className="w-1.5 h-1.5 rounded-full bg-violet-400/60 animate-bounce" style={{ animationDelay: `${i * 0.15}s` }} />)}
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat input */}
          <div className="shrink-0 border-t border-white/[0.06] px-4 py-3">
            <form onSubmit={e => { e.preventDefault(); sendChat(); }} className="flex items-center gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={e => setChatInput(e.target.value)}
                placeholder="Ask the agent about your workspace…"
                className="flex-1 text-[11px] bg-white/[0.04] border border-white/[0.08] rounded-xl px-3 py-2 text-white placeholder-white/20 focus:outline-none focus:border-violet-500/40 transition-colors"
              />
              <button type="submit" disabled={!chatInput.trim() || chatTyping} className="p-2 rounded-xl text-violet-400 disabled:opacity-30 cursor-pointer hover:bg-violet-500/10">
                <Send className="w-4 h-4" />
              </button>
            </form>
          </div>
        </div>
      </div>
    </div>
  );
}
