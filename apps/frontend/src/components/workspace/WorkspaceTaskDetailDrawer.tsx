import { useState, useEffect, useRef } from 'react';
import {
  X, Bot, Check, Send, Terminal, AlertTriangle,
  Folder, Target, Bookmark, Trash2, Edit2, Play,
} from 'lucide-react';
import { useProjectsStore, type ProjectTask, type TaskStatus } from '../../lib/useProjectsStore';
import { useBdtGoals } from '../../lib/db/metrics';
import { useAuth } from '../../lib/auth';
import { useSavedWorkflows } from '../../lib/useSavedWorkflows';

interface WorkspaceTaskDetailDrawerProps {
  taskId: string;
  onClose: () => void;
}



export function WorkspaceTaskDetailDrawer({ taskId, onClose }: WorkspaceTaskDetailDrawerProps) {
  const {
    projects,
    tasks,
    members,
    updateTask,
    deleteTask,
  } = useProjectsStore();
  const { profile } = useAuth();
  const { goals } = useBdtGoals(profile?.company_id ?? null);
  const { items: savedCards } = useSavedWorkflows();

  const task = tasks.find(t => t.id === taskId);
  const project = task ? projects.find(p => p.id === task.projectId) : null;
  const projectTasks = task ? tasks.filter(t => t.projectId === task.projectId && t.id !== task.id) : [];

  const [activeTab, setActiveTab] = useState<'details' | 'chat' | 'execution'>('details');

  // Chat state
  const [messages, setMessages] = useState<Array<{ id: string; role: 'user' | 'agent'; text: string; time: string }>>([]);
  const [chatInput, setChatInput] = useState('');
  const [thinking, setThinking] = useState(false);
  const chatScrollRef = useRef<HTMLDivElement>(null);

  // Agent Execution state
  const [execStatus, setExecStatus] = useState<'idle' | 'running' | 'success' | 'failed'>('idle');
  const [execLogs, setExecLogs] = useState<string[]>([]);
  const [execOutput, setExecOutput] = useState('');
  const logsScrollRef = useRef<HTMLDivElement>(null);

  // Initialize Chat
  useEffect(() => {
    if (task) {
      setMessages([
        {
          id: 'welcome',
          role: 'agent',
          text: `Hi! I'm the Task Agent for "${task.title}". You can ask me to write a draft, detail the next steps, or run the automated agent execution from the Execution tab.`,
          time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }
  }, [taskId]); // eslint-disable-line react-hooks/exhaustive-deps

  // Scroll Chat
  useEffect(() => {
    chatScrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, thinking]);

  // Scroll Logs
  useEffect(() => {
    if (logsScrollRef.current) {
      logsScrollRef.current.scrollTop = logsScrollRef.current.scrollHeight;
    }
  }, [execLogs]);

  if (!task) return null;

  const blocker = tasks.find(t => t.id === task.blockedByTaskId);
  const goalTitle = project ? (goals.find(g => g.id === project.goalId)?.title ?? project.goalLink) : null;
  const linkedCard = task.sourceCardId ? savedCards.find(c => c.id === task.sourceCardId) : null;

  const handleFieldChange = (patch: Partial<ProjectTask>) => {
    updateTask(task.id, patch);
  };

  const handleSendChat = (e: React.FormEvent) => {
    e.preventDefault();
    if (!chatInput.trim()) return;

    const userMsg = chatInput.trim();
    setMessages(prev => [
      ...prev,
      {
        id: Math.random().toString(),
        role: 'user',
        text: userMsg,
        time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      },
    ]);
    setChatInput('');
    setThinking(true);

    setTimeout(() => {
      let reply = '';
      const lower = userMsg.toLowerCase();
      if (lower.includes('run') || lower.includes('execut')) {
        reply = `You can run the agent automatically by switching to the "Execution" tab at the top and clicking the "Run Agent" button!`;
      } else if (lower.includes('next') || lower.includes('plan') || lower.includes('step')) {
        reply = `Here is a plan for "${task.title}":\n1. Analyze context: ${linkedCard ? `Use saved node card detail "${linkedCard.actionLabel || linkedCard.rootLabel}"` : 'Verify general requirements.'}\n2. Draft layout: Write structure and gather references.\n3. Implement & Test: Validate that all tests compile.\n4. Complete: Mark task as Done on project board.`;
      } else {
        reply = `I've analyzed task "${task.title}" under project "${project?.name ?? 'unknown'}". ${goalTitle ? `This aligns with goal "${goalTitle}".` : ''} Let me know if you want me to generate next steps or compose a draft plan!`;
      }

      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'agent',
          text: reply,
          time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
      setThinking(false);
    }, 1200);
  };

  const runAgent = () => {
    if (execStatus === 'running') return;
    setExecStatus('running');
    setExecLogs([]);
    setExecOutput('');

    const cardName = linkedCard ? (linkedCard.actionLabel || linkedCard.rootLabel || linkedCard.companyName) : null;

    const logSteps = [
      { text: '[system] Initializing Task Agent Copilot execution context...', delay: 0 },
      { text: `[agent] Context resolved. Target: "${task.title}"`, delay: 400 },
      { text: `[agent] Querying related saved nodes... ${cardName ? `found "${cardName}"` : 'none linked.'}`, delay: 900 },
      { text: `[agent] Retrieving target alignments... ${goalTitle ? `found goal "${goalTitle}"` : 'no goal context.'}`, delay: 1400 },
      { text: '[agent] Formulating structured implementation steps...', delay: 1900 },
      { text: '[agent] Executing Sub-task 1: Parse requirements... OK', delay: 2400 },
      { text: '[agent] Executing Sub-task 2: Gather dependencies... OK', delay: 2800 },
      { text: '[agent] Executing Sub-task 3: Generating draft artifacts...', delay: 3400 },
      { text: '[system] Writing synthesized output to scratchpad...', delay: 4000 },
      { text: '[agent] Execution complete. Synthesized artifact compiled successfully ✔', delay: 4500 },
    ];

    logSteps.forEach(step => {
      setTimeout(() => {
        setExecLogs(prev => [...prev, step.text]);
      }, step.delay);
    });

    setTimeout(() => {
      setExecStatus('success');
      const docDraft = `# Synthesized Artifact: ${task.title}
Generated by AI Agent at: ${new Date().toLocaleString()}
Goal Alignment: ${goalTitle ?? 'General Task Execution'}

## Executive Summary
This document fulfills the requirements of "${task.title}". The context has been analyzed against BDT metrics.

## Action Plan & Steps Completed
1. Checked active blocker chains (blockedByTaskId: "${task.blockedByTaskId ?? 'none'}").
2. Consolidated details from ${cardName ? `saved node card: "${cardName}"` : 'local state context'}.
3. Drafted initial structure and validated with TypeScript strict rules.

## Recommended Next Action
Review this generated scratch draft and mark the task status as "review" or "done" on the project Kanban board.
`;
      setExecOutput(docDraft);
      // Append success notification to chat too
      setMessages(prev => [
        ...prev,
        {
          id: Math.random().toString(),
          role: 'agent',
          text: `🚨 **Agent Execution Complete!** I have finished compiling the execution plan and output. Check the details in the **Execution** tab!`,
          time: new Date().toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
        },
      ]);
    }, 4600);
  };

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[150] bg-black/60 backdrop-blur-sm transition-opacity"
        onClick={onClose}
      />

      {/* Drawer */}
      <aside
        className="fixed top-0 right-0 bottom-0 z-[160] w-full max-w-[440px] bg-[#0c0c12]/95 border-l border-white/12 shadow-2xl flex flex-col min-h-0 backdrop-blur-md animate-slide-in"
        style={{
          boxShadow: `0 0 50px rgba(193, 174, 255, 0.08)`,
        }}
      >
        {/* Header */}
        <div className="shrink-0 p-4 border-b border-white/10 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="w-2.5 h-2.5 rounded-full bg-violet-400" />
            <h3 className="text-sm font-bold text-white truncate max-w-[280px]">{task.title}</h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1 rounded-lg text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Tabs */}
        <div className="shrink-0 flex items-center border-b border-white/8 px-4 py-1.5 gap-2 bg-white/[0.01]">
          {([
            { id: 'details', label: 'Details', Icon: Edit2 },
            { id: 'chat', label: 'Copilot Chat', Icon: Bot },
            { id: 'execution', label: 'Execution', Icon: Terminal },
          ] as const).map(t => (
            <button
              key={t.id}
              type="button"
              onClick={() => setActiveTab(t.id)}
              className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-[11px] font-semibold transition-all ${
                activeTab === t.id ? 'bg-white/10 text-white' : 'text-white/45 hover:text-white/70'
              }`}
            >
              <t.Icon className="w-3.5 h-3.5" />
              {t.label}
            </button>
          ))}
        </div>

        {/* Body content */}
        <div className="flex-1 min-h-0 overflow-y-auto p-5 space-y-5 scrollbar-hide">
          {activeTab === 'details' && (
            <div className="space-y-4 text-xs">
              {/* Project Title */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Project</label>
                <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/8 text-white/80">
                  <Folder className="w-4 h-4 text-indigo-400 shrink-0" />
                  <span className="font-semibold">{project?.name ?? 'Unknown Project'}</span>
                </div>
              </div>

              {/* Status Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Status</label>
                <select
                  value={task.status}
                  onChange={e => handleFieldChange({ status: e.target.value as TaskStatus })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 focus:outline-none focus:border-white/20 cursor-pointer"
                >
                  <option value="todo" className="bg-[#0c0c12]">To Do</option>
                  <option value="in_progress" className="bg-[#0c0c12]">In Progress</option>
                  <option value="review" className="bg-[#0c0c12]">Review</option>
                  <option value="done" className="bg-[#0c0c12]">Done</option>
                </select>
              </div>

              {/* Assignee Selector */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Assignee</label>
                <select
                  value={task.assigneeId ?? ''}
                  onChange={e => handleFieldChange({ assigneeId: e.target.value || null })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 focus:outline-none focus:border-white/20 cursor-pointer"
                >
                  <option value="" className="bg-[#0c0c12]">Unassigned</option>
                  {members.map(m => (
                    <option key={m.id} value={m.id} className="bg-[#0c0c12]">{m.name}</option>
                  ))}
                </select>
              </div>

              {/* Due Date */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Due Date</label>
                <input
                  type="date"
                  value={task.dueDate ?? ''}
                  onChange={e => handleFieldChange({ dueDate: e.target.value || undefined })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 focus:outline-none focus:border-white/20"
                />
              </div>

              {/* Blocker Dropdown */}
              <div className="space-y-1">
                <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold flex items-center gap-1">
                  <AlertTriangle className="w-3 h-3 text-amber-400" />
                  Blocked By (Task Blocker)
                </label>
                <select
                  value={task.blockedByTaskId ?? ''}
                  onChange={e => handleFieldChange({ blockedByTaskId: e.target.value || undefined })}
                  className="w-full bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-white/80 focus:outline-none focus:border-white/20 cursor-pointer"
                >
                  <option value="" className="bg-[#0c0c12]">No Blocker (Open)</option>
                  {projectTasks.map(pt => (
                    <option key={pt.id} value={pt.id} className="bg-[#0c0c12]">{pt.title}</option>
                  ))}
                </select>
                {blocker && (
                  <p className="text-[10px] text-amber-300 px-1 mt-1 font-medium">
                    {blocker.status === 'done' ? '✓ Blocker task is done (Unblocked)' : '🔒 Blocker task is open (Blocked)'}
                  </p>
                )}
              </div>

              {/* Goal Alignment display */}
              {goalTitle && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Goal Alignment</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/8 text-white/80">
                    <Target className="w-4 h-4 text-rose-400 shrink-0" />
                    <span>{goalTitle}</span>
                  </div>
                </div>
              )}

              {/* Linked Card display */}
              {linkedCard && (
                <div className="space-y-1">
                  <label className="text-[10px] uppercase tracking-wider text-white/35 font-bold">Linked Saved Node</label>
                  <div className="flex items-center gap-2 p-2.5 rounded-xl bg-white/[0.02] border border-white/8 text-white/80">
                    <Bookmark className="w-4 h-4 text-violet-400 shrink-0" />
                    <span className="truncate">{linkedCard.actionLabel || linkedCard.rootLabel || linkedCard.companyName}</span>
                  </div>
                </div>
              )}

              {/* Delete Task */}
              <div className="pt-4 border-t border-white/8 flex justify-end">
                <button
                  type="button"
                  onClick={() => {
                    if (confirm('Delete this task?')) {
                      deleteTask(task.id);
                      onClose();
                    }
                  }}
                  className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20 transition-all font-semibold"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Delete Task
                </button>
              </div>
            </div>
          )}

          {activeTab === 'chat' && (
            <div className="h-[460px] flex flex-col min-h-0 border border-white/10 rounded-2xl bg-white/[0.01] overflow-hidden">
              {/* Message scroll list */}
              <div className="flex-1 overflow-y-auto p-4 space-y-3.5 scrollbar-hide">
                {messages.map(m => {
                  const isAgent = m.role === 'agent';
                  return (
                    <div key={m.id} className={`flex gap-2.5 ${!isAgent ? 'flex-row-reverse' : ''}`}>
                      {isAgent ? (
                        <span className="w-7 h-7 rounded-full grid place-items-center shrink-0 bg-violet-500/10 border border-violet-500/30">
                          <Bot className="w-4 h-4 text-violet-300" />
                        </span>
                      ) : (
                        <span className="w-7 h-7 rounded-full grid place-items-center shrink-0 bg-white/5 border border-white/15 text-white/60 font-bold text-[10px]">
                          U
                        </span>
                      )}
                      <div className="max-w-[78%]">
                        <div className={`text-[9px] text-white/30 mb-0.5 ${!isAgent ? 'text-right' : ''}`}>
                          {isAgent ? 'Task Copilot' : 'You'} · {m.time}
                        </div>
                        <div
                          className="rounded-2xl px-3 py-2 text-[11px] leading-relaxed break-words whitespace-pre-line"
                          style={
                            isAgent
                              ? { background: 'rgba(193, 174, 255, 0.08)', border: '1px solid rgba(193, 174, 255, 0.16)', color: 'rgba(255,255,255,0.85)' }
                              : { background: 'rgba(255,255,255,0.08)', color: '#fff' }
                          }
                        >
                          {m.text}
                        </div>
                      </div>
                    </div>
                  );
                })}
                {thinking && (
                  <div className="flex gap-2.5">
                    <span className="w-7 h-7 rounded-full grid place-items-center shrink-0 bg-violet-500/10 border border-violet-500/30 animate-pulse">
                      <Bot className="w-4 h-4 text-violet-300 animate-spin" style={{ animationDuration: '3s' }} />
                    </span>
                    <div className="max-w-[78%]">
                      <div className="text-[9px] text-white/30 mb-0.5">Task Copilot thinking...</div>
                      <div className="rounded-2xl px-3 py-2 text-[11px] bg-white/[0.02] border border-white/5 text-white/40 italic">
                        Writing response...
                      </div>
                    </div>
                  </div>
                )}
                <div ref={chatScrollRef} />
              </div>

              {/* Chat Input form */}
              <form onSubmit={handleSendChat} className="p-3 border-t border-white/10 flex gap-2">
                <input
                  type="text"
                  value={chatInput}
                  onChange={e => setChatInput(e.target.value)}
                  placeholder="Ask about task execution details..."
                  className="flex-1 bg-white/5 border border-white/10 rounded-xl px-3 py-2 text-xs text-white placeholder-white/30 focus:outline-none focus:border-white/20"
                />
                <button
                  type="submit"
                  disabled={!chatInput.trim() || thinking}
                  className="w-8 h-8 rounded-xl bg-violet-500/20 border border-violet-500/35 text-violet-300 flex items-center justify-center disabled:opacity-40 transition-all"
                >
                  <Send className="w-3.5 h-3.5" />
                </button>
              </form>
            </div>
          )}

          {activeTab === 'execution' && (
            <div className="space-y-4">
              {/* Info panel */}
              <p className="text-[11.5px] text-white/60 leading-relaxed bg-white/[0.02] border border-white/8 p-3 rounded-xl">
                The AI Agent will validate task constraints, check blocking milestones, fetch linked saved node context, and run execution simulations.
              </p>

              {/* Run Agent button */}
              <div className="flex justify-center">
                <button
                  type="button"
                  onClick={runAgent}
                  disabled={execStatus === 'running'}
                  className="flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-semibold text-white transition-all disabled:opacity-50 hover:scale-[1.02] active:scale-[0.98]"
                  style={{
                    background: 'linear-gradient(135deg, #7c3aed, #4f46e5)',
                    boxShadow: '0 4px 15px rgba(124, 58, 237, 0.3)',
                  }}
                >
                  <Play className="w-3.5 h-3.5 fill-current" />
                  {execStatus === 'running' ? 'Agent Running...' : execStatus === 'success' ? 'Run Agent Again' : 'Run Agent Execution'}
                </button>
              </div>

              {/* Terminal Logs */}
              {(execLogs.length > 0 || execStatus === 'running') && (
                <div className="space-y-1">
                  <span className="text-[9px] uppercase tracking-wider text-white/30 font-bold flex items-center gap-1">
                    <Terminal className="w-3.5 h-3.5" />
                    Agent Execution logs
                  </span>
                  <div
                    ref={logsScrollRef}
                    className="h-[150px] overflow-y-auto bg-black border border-white/15 rounded-xl p-3.5 font-mono text-[10px] text-emerald-400 space-y-1 scrollbar-hide"
                  >
                    {execLogs.map((log, idx) => (
                      <div key={idx} className="leading-relaxed whitespace-pre-wrap">{log}</div>
                    ))}
                    {execStatus === 'running' && (
                      <div className="text-white/45 animate-pulse">Running execution cycles... cursor block _</div>
                    )}
                  </div>
                </div>
              )}

              {/* Synthesized Output */}
              {execOutput && (
                <div className="space-y-2 animate-slide-up-fade">
                  <span className="text-[9px] uppercase tracking-wider text-white/35 font-bold flex items-center gap-1">
                    <Check className="w-3.5 h-3.5 text-emerald-400" />
                    Synthesized Artifact Output
                  </span>
                  <div className="bg-white/[0.02] border border-white/8 rounded-xl p-3.5 font-mono text-[10px] text-white/85 whitespace-pre-wrap max-h-[200px] overflow-y-auto scrollbar-hide">
                    {execOutput}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </aside>
    </>
  );
}
