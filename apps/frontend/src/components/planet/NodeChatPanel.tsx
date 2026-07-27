import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  X, Send, BookOpen, BarChart2, Activity, Users, FileText, Target,
  ExternalLink, ChevronRight, ChevronDown, Search, Plus, Copy, Pencil, Check,
} from 'lucide-react';
import type {
  PlanetRootNode, PlanetBranchNode, CompanyPlanetContext, PlanetBranchNodeType, PlanetCitation,
} from '../../data/companyPlanetRoots';
import responseChatIconSvg from '../../assets/response-chat-icon.svg';
import { chatWithReferenceCompany, type IdtChatCitation } from '../../lib/db/referenceCompanies';

/**
 * IDT-only floating chat modal opened from a root-focus branch card. Independent
 * from ActionNodeWorkspace/WorkspaceAgentSurface (kept as small local copies of
 * the same visual language) so this panel can evolve without touching either.
 *
 * Replies come from the authenticated, source-grounded reference-company API.
 * Conversations stay in page memory only; they are not stored server-side.
 */

const ACCENT_FALLBACK = '#c1aeff';

function ResponseChatIcon({ className }: { className?: string }) {
  return <img src={responseChatIconSvg} alt="" className={className} draggable={false} />;
}

const NODE_TYPE_META: Record<PlanetBranchNodeType, { label: string; icon: React.ComponentType<{ style?: React.CSSProperties; className?: string }> }> = {
  information: { label: 'Information', icon: BookOpen },
  metric: { label: 'Metric', icon: BarChart2 },
  signal: { label: 'Signal', icon: Activity },
  relationship: { label: 'Relationship', icon: Users },
  evidence: { label: 'Evidence', icon: FileText },
  decision: { label: 'Decision', icon: Target },
};

type ChatMsg = { id: string; role: 'user' | 'ai'; text: string; ts: number; citations?: IdtChatCitation[] };
type ContextHit = { source: string; label: string; text: string };

function pct(value?: number | null): string | null {
  if (value === undefined || value === null) return null;
  const n = value <= 1 ? value * 100 : value;
  return `${Math.round(n)}%`;
}

function hostOf(url: string): string {
  try { return new URL(url).hostname.replace(/^www\./, ''); } catch { return url; }
}

/** Special "contextualization" panel: surfaces the node data that matches whatever
 * was just asked in chat — falls back to a default overview when nothing's been asked yet. */
function computeContextHits(query: string, root: PlanetRootNode, branch: PlanetBranchNode): ContextHit[] {
  const hits: ContextHit[] = [];
  const push = (source: string, label: string, text?: string | null) => {
    if (text) hits.push({ source, label, text });
  };

  const q = query.trim().toLowerCase();
  if (!q) {
    push('Overview', branch.label, branch.summary ?? root.description);
    branch.actions.slice(0, 2).forEach(a => push('Action', a.label, a.hint));
    return hits.slice(0, 4);
  }

  const terms = q.split(/\s+/).filter(w => w.length > 2);
  const matches = (text?: string | null) => !!text && terms.some(t => text.toLowerCase().includes(t));

  if (matches(branch.summary)) push('Summary', branch.label, branch.summary);
  if (matches(root.description)) push('Root', root.label, root.description);
  branch.actions.forEach(a => {
    if (matches(a.label) || matches(a.hint) || (a.nextSteps ?? []).some(s => matches(s))) {
      push('Action', a.label, a.hint ?? (a.nextSteps ?? []).join(' · '));
    }
  });
  (branch.sources ?? []).forEach(s => {
    if (matches(s.title) || matches(s.snippet)) push('Source', s.title || hostOf(s.url), s.snippet ?? s.url);
  });

  if (hits.length === 0) {
    push('No match', 'Nothing found', `No node data matched "${query}" yet — try asking a different way, or check Sources.`);
  }
  return hits.slice(0, 5);
}

function CollapsibleSection({ title, defaultOpen = false, children }: { title: string; defaultOpen?: boolean; children: React.ReactNode }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-t" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
      <button
        type="button"
        onClick={() => setOpen(o => !o)}
        className="w-full flex items-center justify-between py-3 text-[11px] font-bold uppercase tracking-widest text-white/40 hover:text-white/70 transition-colors"
      >
        {title}
        <ChevronDown className="w-3.5 h-3.5 transition-transform" style={{ transform: open ? 'rotate(180deg)' : 'rotate(0deg)' }} />
      </button>
      {open && <div className="pb-4">{children}</div>}
    </div>
  );
}

/** Cheap CSS starfield for the modal's galaxy backdrop — no WebGL, self-contained. */
const STARFIELD_STARS = Array.from({ length: 110 }, (_, index) => ({
  left: (index * 37.19) % 100,
  top: (index * 61.73) % 100,
  size: 0.6 + ((index * 17) % 16) / 10,
  duration: 3 + (index % 5),
  delay: (index % 6),
}));

function Starfield() {

  return (
    <div className="absolute inset-0 pointer-events-none overflow-hidden">
      <style>{`@keyframes idt-twinkle { 0%, 100% { opacity: 0.12; } 50% { opacity: 0.9; } }`}</style>
      {STARFIELD_STARS.map((s, i) => (
        <div
          key={i}
          style={{
            position: 'absolute',
            left: `${s.left}%`,
            top: `${s.top}%`,
            width: s.size,
            height: s.size,
            borderRadius: '50%',
            background: '#fff',
            animation: `idt-twinkle ${s.duration}s ease-in-out ${s.delay}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

export interface NodeChatPanelProps {
  rootNode: PlanetRootNode;
  initialBranchId: string;
  context: CompanyPlanetContext;
  isOpen: boolean;
  onClose: () => void;
}

export function NodeChatPanel({ rootNode, initialBranchId, context, isOpen, onClose }: NodeChatPanelProps) {
  const color = rootNode.color || ACCENT_FALLBACK;

  const [activeBranchId, setActiveBranchId] = useState(initialBranchId);
  const [search, setSearch] = useState('');
  const [messagesByBranch, setMessagesByBranch] = useState<Record<string, ChatMsg[]>>({});
  const [lastQueryByBranch, setLastQueryByBranch] = useState<Record<string, string>>({});
  const [input, setInput] = useState('');
  const [typing, setTyping] = useState(false);
  const [errorByBranch, setErrorByBranch] = useState<Record<string, string | null>>({});
  const [selectedText, setSelectedText] = useState<string>('');
  const [selectionPos, setSelectionPos] = useState<{ x: number; y: number } | null>(null);
  const [copiedMsgId, setCopiedMsgId] = useState<string | null>(null);
  
  const endRef = useRef<HTMLDivElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const activeBranch = useMemo(
    () => rootNode.branches.find(b => b.id === activeBranchId) ?? rootNode.branches[0],
    [rootNode.branches, activeBranchId],
  );

  const handleCopyMessage = useCallback((msgId: string, text: string) => {
    try {
      navigator.clipboard.writeText(text);
      setCopiedMsgId(msgId);
      window.setTimeout(() => setCopiedMsgId(null), 2000);
    } catch {
      /* noop */
    }
  }, []);

  const handleEditUserMessage = useCallback((msgText: string) => {
    setInput(msgText);
    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, []);

  // Detect text selection inside the panel to quote/add text to input
  const handleSelectionChange = useCallback(() => {
    const sel = window.getSelection();
    if (!sel || sel.isCollapsed) {
      setSelectedText('');
      setSelectionPos(null);
      return;
    }

    const rawText = sel.toString().trim();
    if (rawText.length > 0 && panelRef.current && panelRef.current.contains(sel.anchorNode)) {
      try {
        const range = sel.getRangeAt(0);
        const rect = range.getBoundingClientRect();
        const panelRect = panelRef.current.getBoundingClientRect();

        setSelectedText(rawText);
        setSelectionPos({
          x: Math.max(10, Math.min(rect.left - panelRect.left + rect.width / 2, panelRect.width - 150)),
          y: Math.max(10, rect.top - panelRect.top - 36),
        });
      } catch {
        setSelectedText(rawText);
      }
    } else {
      setSelectedText('');
      setSelectionPos(null);
    }
  }, []);

  useEffect(() => {
    document.addEventListener('selectionchange', handleSelectionChange);
    return () => document.removeEventListener('selectionchange', handleSelectionChange);
  }, [handleSelectionChange]);

  const addTextToInput = useCallback((textToAdd?: string) => {
    const text = (textToAdd || selectedText).trim();
    if (!text) return;

    const formattedQuote = text.startsWith('"') && text.endsWith('"') ? text : `"${text}"`;

    setInput(prev => {
      const trimmed = prev.trim();
      if (!trimmed) {
        return `Regarding ${formattedQuote}: `;
      }
      return `${trimmed} ${formattedQuote} `;
    });

    setSelectedText('');
    setSelectionPos(null);
    try {
      window.getSelection()?.removeAllRanges();
    } catch {
      /* noop */
    }

    window.setTimeout(() => {
      inputRef.current?.focus();
    }, 50);
  }, [selectedText]);

  // Reset to the branch that was clicked whenever the modal is (re)opened.
  useEffect(() => {
    if (!isOpen) return;
    const frame = window.requestAnimationFrame(() => setActiveBranchId(initialBranchId));
    return () => window.cancelAnimationFrame(frame);
  }, [isOpen, initialBranchId]);

  const messages = useMemo(() => activeBranch ? (messagesByBranch[activeBranch.id] ?? []) : [], [activeBranch, messagesByBranch]);
  const lastQuery = activeBranch ? (lastQueryByBranch[activeBranch.id] ?? '') : '';

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages, typing]);

  const sources = useMemo(
    () => activeBranch ? (activeBranch.sources ?? activeBranch.actions.flatMap(a => a.sources ?? [])) : [],
    [activeBranch],
  );
  const conf = activeBranch ? pct(activeBranch.confidence) : null;
  const rel = activeBranch ? pct(activeBranch.relevance) : null;

  const contextHits = useMemo(
    () => activeBranch ? computeContextHits(lastQuery, rootNode, activeBranch) : [],
    [lastQuery, rootNode, activeBranch],
  );

  const send = useCallback(async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed || !activeBranch || typing || !context.referenceCompanyId) return;
    const branchId = activeBranch.id;
    const userMessage: ChatMsg = { id: `u-${Date.now()}`, role: 'user', text: trimmed, ts: Date.now() };
    const history = [...(messagesByBranch[branchId] ?? []), userMessage]
      .map((message) => ({ role: message.role === 'ai' ? 'assistant' as const : 'user' as const, text: message.text }));
    setMessagesByBranch(prev => ({ ...prev, [branchId]: [...(prev[branchId] ?? []), userMessage] }));
    setLastQueryByBranch(prev => ({ ...prev, [branchId]: trimmed }));
    setErrorByBranch(prev => ({ ...prev, [branchId]: null }));
    setInput('');
    setTyping(true);

    try {
      const result = await chatWithReferenceCompany(context.referenceCompanyId, {
        rootId: rootNode.id,
        branchId,
        messages: history,
      });
      setMessagesByBranch(prev => ({
        ...prev,
        [branchId]: [...(prev[branchId] ?? []), {
          id: `a-${Date.now()}`,
          role: 'ai',
          text: result.reply,
          citations: result.citations,
          ts: Date.now(),
        }],
      }));
    } catch (err) {
      const message = err instanceof Error ? err.message.replace(/^\d+:\s*/, '') : '';
      setErrorByBranch(prev => ({ ...prev, [branchId]: message || 'IDT chat is temporarily unavailable. Please try again.' }));
    } finally {
      setTyping(false);
    }
  }, [activeBranch, context.referenceCompanyId, messagesByBranch, rootNode.id, typing]);

  const filteredBranches = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rootNode.branches;
    return rootNode.branches.filter(b => b.label.toLowerCase().includes(q) || (b.summary ?? '').toLowerCase().includes(q));
  }, [rootNode.branches, search]);

  // Branches with an actual conversation, most recently active first — a chat
  // history rail separate from the full branch list below it.
  const recentBranches = useMemo(() => {
    return rootNode.branches
      .map(b => ({ branch: b, lastTs: (messagesByBranch[b.id] ?? []).at(-1)?.ts ?? 0 }))
      .filter(x => x.lastTs > 0)
      .sort((a, b) => b.lastTs - a.lastTs)
      .slice(0, 4)
      .map(x => x.branch);
  }, [rootNode.branches, messagesByBranch]);

  const isSearching = search.trim().length > 0;
  const recentIds = useMemo(() => new Set(recentBranches.map(b => b.id)), [recentBranches]);
  const otherBranches = isSearching ? filteredBranches : filteredBranches.filter(b => !recentIds.has(b.id));

  if (!activeBranch) return null;

  const typeMeta = NODE_TYPE_META[activeBranch.nodeType] ?? NODE_TYPE_META.information;

  // Shared row renderer for both the "Recent" and full branch lists — switching
  // here always updates activeBranchId, which the chat, Context panel, and Notes
  // all key off, so everything downstream follows the newly selected chat.
  const renderBranchRow = (branch: PlanetBranchNode) => {
    const active = branch.id === activeBranch.id;
    const preview = branch.summary ?? branch.actions[0]?.hint ?? 'No research captured yet';
    return (
      <button
        key={branch.id}
        type="button"
        onClick={() => setActiveBranchId(branch.id)}
        className="w-full flex items-start gap-2.5 px-3 py-2.5 rounded-xl text-left transition-colors"
        style={{ background: active ? `${color}16` : 'transparent' }}
      >
        <div className="min-w-0">
          <div className="text-[12px] font-semibold truncate" style={{ color: active ? '#fff' : 'rgba(255,255,255,0.7)' }}>
            {branch.label}
          </div>
          <div className="text-[10.5px] text-white/30 truncate leading-relaxed">{preview}</div>
        </div>
      </button>
    );
  };

  return (
    <div
      className="fixed inset-0 z-[100]"
      style={{
        // Fully opaque — nothing behind (navbar, 3D scene, other chrome) should
        // ever show through, in the gap around the panel or through the panel itself.
        background: '#020207',
        opacity: isOpen ? 1 : 0,
        pointerEvents: isOpen ? 'auto' : 'none',
        transition: 'opacity 0.4s ease',
      }}
      onClick={onClose}
    >
      {/* Floating panel — pops up from the bottom with a soft bounce, framed with
          a margin against the solid backdrop above (not the page behind it). Extra
          top margin so it clears the fixed navbar (h-14 = 56px) instead of touching it. */}
      <div
        ref={panelRef}
        className="absolute top-20 left-6 right-6 bottom-6 md:top-24 md:left-10 md:right-10 md:bottom-10 text-white overflow-hidden rounded-[28px] flex flex-col"
        style={{
          background: '#020207',
          border: '1px solid rgba(255,255,255,0.08)',
          boxShadow: '0 40px 120px rgba(0,0,0,0.7)',
          transform: isOpen ? 'translateY(0) scale(1)' : 'translateY(48px) scale(0.97)',
          opacity: isOpen ? 1 : 0,
          transition: 'transform 0.6s cubic-bezier(0.34, 1.56, 0.64, 1), opacity 0.4s ease',
        }}
        onClick={e => e.stopPropagation()}
      >
        {/* Floating text selection Quote action badge */}
        {selectedText && selectionPos && (
          <div
            style={{
              position: 'absolute',
              left: selectionPos.x,
              top: selectionPos.y,
              transform: 'translateX(-50%)',
              zIndex: 999,
            }}
          >
            <button
              type="button"
              onMouseDown={(e) => {
                e.preventDefault();
                e.stopPropagation();
                addTextToInput();
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-semibold text-white shadow-xl transition-transform hover:scale-105 cursor-pointer"
              style={{
                background: '#12121e',
                border: `1.5px solid ${color}`,
                boxShadow: `0 8px 24px rgba(0,0,0,0.85), 0 0 16px ${color}66`,
                backdropFilter: 'blur(8px)',
              }}
            >
              <Plus className="w-3.5 h-3.5" style={{ color }} />
              <span>Add selection to chat</span>
            </button>
          </div>
        )}
        {/* Galaxy backdrop: nebula gradient + twinkling stars + root-color glow */}
        <div
          className="absolute inset-0 pointer-events-none"
          style={{
            background: `radial-gradient(ellipse at 20% 0%, rgba(40,20,70,0.55) 0%, transparent 55%),
                         radial-gradient(ellipse at 85% 100%, rgba(20,30,60,0.5) 0%, transparent 55%),
                         radial-gradient(circle at 50% -10%, ${color}30 0%, transparent 50%),
                         #020207`,
          }}
        />
        <Starfield />

        {/* Top bar */}
        <header className="relative z-10 h-14 shrink-0 px-6 flex items-center justify-between">
          <div className="flex items-center gap-2 text-[12px] text-white/45">
            <span>{context.companyName}</span>
            <ChevronRight className="w-3 h-3" />
            <span style={{ color }}>{rootNode.label}</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-full text-white/40 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </header>

        {/* 3-column body */}
        <div className="relative z-10 flex-1 min-h-0 flex">

          {/* Left: conversation list + search */}
          <div className="w-[260px] shrink-0 flex flex-col">
            <div className="px-4 pb-3 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 absolute left-2 top-1/2 -translate-y-1/2 text-white/25" />
                <input
                  type="text"
                  value={search}
                  onChange={e => setSearch(e.target.value)}
                  placeholder="Search branches…"
                  className="w-full text-[12px] bg-transparent border-b border-white/10 pl-6 pr-2 py-2 text-white placeholder-white/25 focus:outline-none focus:border-white/25 transition-colors"
                />
              </div>
            </div>
            <div className="flex-1 min-h-0 overflow-y-auto px-2 pb-2">
              {!isSearching && recentBranches.length > 0 && (
                <>
                  <div className="px-3 pt-1 pb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-white/25">Recent</div>
                  <div className="space-y-0.5 mb-3">{recentBranches.map(renderBranchRow)}</div>
                </>
              )}
              <div className="px-3 pt-1 pb-1.5 text-[9.5px] font-bold uppercase tracking-widest text-white/25">
                {isSearching ? 'Results' : 'All branches'}
              </div>
              <div className="space-y-0.5">{otherBranches.map(renderBranchRow)}</div>
              {filteredBranches.length === 0 && (
                <div className="px-3 py-6 text-center text-[11px] text-white/25">No branches match "{search}"</div>
              )}
            </div>
          </div>

          {/* Middle: chat */}
          <div className="flex-1 min-w-0 flex flex-col">
            <div className="shrink-0 px-6 py-3 flex items-center gap-2.5">
              <div className="min-w-0">
                <div className="text-[13px] font-semibold text-white truncate">{activeBranch.label}</div>
                <div className="text-[10px] text-white/35">{typeMeta.label}</div>
              </div>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto px-6 py-4 space-y-3">
              {messages.length === 0 && (
                <div className="rounded-2xl px-4 py-3 text-[13px] leading-relaxed text-white/70" style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}>
                  Ask about this branch’s captured research, sources, confidence, or next steps. Answers are grounded only in this IDT data.
                </div>
              )}
              {messages.map(msg => (
                <div key={msg.id} className={`flex gap-2.5 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                  {msg.role === 'ai' && <ResponseChatIcon className="w-6 h-6 mt-1 shrink-0 object-contain" />}
                  <div
                    className="max-w-[80%] rounded-2xl px-4 py-3 whitespace-pre-line flex flex-col"
                    style={msg.role === 'user'
                      ? { background: `${color}18`, border: `1px solid ${color}35` }
                      : { background: 'rgba(255, 255, 255, 0.04)', border: '1px solid rgba(255, 255, 255, 0.08)' }
                    }
                  >
                    <p className="text-[13px] leading-relaxed text-white/90">{msg.text}</p>

                    {msg.role === 'ai' && msg.citations && msg.citations.length > 0 && (
                      <div className="mt-2 space-y-1">
                        <div className="text-[9px] font-bold uppercase tracking-wider text-white/30">Citations</div>
                        {msg.citations.map((citation) => (
                          <a
                            key={citation.id}
                            href={citation.url}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="flex items-center gap-1 text-[11px] text-white/50 hover:text-white transition-colors"
                          >
                            <ExternalLink className="w-3 h-3 shrink-0" />
                            <span className="truncate">{citation.title}</span>
                          </a>
                        ))}
                      </div>
                    )}

                    {/* Clean Icon Action Bar below AI Response (matching reference) */}
                    {msg.role === 'ai' && (
                      <div className="mt-2 pt-1.5 flex items-center gap-2 border-t border-white/10 text-white/40">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          title={copiedMsgId === msg.id ? 'Copied!' : 'Copy response'}
                          className="p-1 rounded-md hover:text-white hover:bg-white/10 transition-colors"
                          style={copiedMsgId === msg.id ? { color: '#34d399' } : {}}
                        >
                          {copiedMsgId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>
                      </div>
                    )}

                    {/* Clean Icon Action Bar below User Message */}
                    {msg.role === 'user' && (
                      <div className="mt-2 pt-1.5 flex items-center justify-end gap-2 border-t border-white/10 text-white/40 w-full">
                        <button
                          type="button"
                          onClick={() => handleCopyMessage(msg.id, msg.text)}
                          title={copiedMsgId === msg.id ? 'Copied!' : 'Copy message'}
                          className="p-1 rounded-md hover:text-white hover:bg-white/10 transition-colors"
                          style={copiedMsgId === msg.id ? { color: '#34d399' } : {}}
                        >
                          {copiedMsgId === msg.id ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        </button>

                        <button
                          type="button"
                          onClick={() => handleEditUserMessage(msg.text)}
                          title="Edit message (stops AI generation mid-stream & loads to input)"
                          className="p-1 rounded-md hover:text-white hover:bg-white/10 transition-colors"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {typing && (
                <div className="flex gap-2 justify-start">
                  <ResponseChatIcon className="w-6 h-6 mt-0.5 shrink-0 object-contain" />
                  <div className="rounded-2xl px-4 py-3 flex items-center gap-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
                    {[0, 1, 2].map(i => (
                      <div key={i} className="w-1.5 h-1.5 rounded-full animate-bounce" style={{ background: color, animationDelay: `${i * 0.15}s` }} />
                    ))}
                  </div>
                </div>
              )}
              {errorByBranch[activeBranch.id] && (
                <div className="rounded-xl px-3 py-2 text-[11px] text-rose-200" style={{ background: 'rgba(244,63,94,0.12)', border: '1px solid rgba(244,63,94,0.28)' }}>
                  {errorByBranch[activeBranch.id]}
                </div>
              )}
              <div ref={endRef} />
            </div>

            <div className="shrink-0 px-5 py-4">
              <form onSubmit={e => { e.preventDefault(); send(input); }} className="flex items-center gap-2 rounded-full px-2 py-1" style={{ background: 'rgba(255,255,255,0.05)' }}>
                <input
                  ref={inputRef}
                  type="text"
                  value={input}
                  onChange={e => setInput(e.target.value)}
                  placeholder={`Ask about ${activeBranch.label}…`}
                  className="flex-1 text-[13px] bg-transparent px-3 py-2.5 text-white placeholder-white/25 focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={!input.trim() || typing || !context.referenceCompanyId}
                  className="p-2.5 rounded-full disabled:opacity-30 transition-colors shrink-0"
                  style={{ background: `${color}25`, color }}
                >
                  <Send className="w-4 h-4" />
                </button>
              </form>
            </div>
          </div>

          {/* Right: general info + context + notes */}
          <div className="w-[320px] shrink-0 flex flex-col overflow-y-auto">
            <div className="px-5 pt-5 pb-1">
              <div className="text-[16px] font-bold text-white leading-tight">{activeBranch.label}</div>
              <div className="text-[11px] text-white/35 mt-0.5">
                {rootNode.label}
                {(conf || rel) && ' · '}
                {conf && <span>Confidence {conf}</span>}
                {conf && rel && ' · '}
                {rel && <span>Relevance {rel}</span>}
              </div>
            </div>

            {/* Special contextualization space — reacts to whatever was just asked */}
            <div className="mx-5 mt-4 mb-4 p-4 rounded-2xl" style={{ background: `${color}0d`, border: `1px solid ${color}28` }}>
              <div className="flex items-center gap-1.5 mb-2.5">
                <span className="text-[11px] font-bold uppercase tracking-widest" style={{ color }}>
                  {lastQuery ? 'Context for your question' : 'Context'}
                </span>
              </div>
              {lastQuery && (
                <div className="text-[10px] text-white/35 mb-2.5 italic truncate">"{lastQuery}"</div>
              )}
              <div className="space-y-2.5">
                {contextHits.map((hit, i) => (
                  <div key={i} className="group relative pr-6">
                    <div className="text-[9px] font-bold uppercase tracking-wider text-white/30 mb-0.5">{hit.source} · {hit.label}</div>
                    <div className="text-[11.5px] text-white/70 leading-relaxed line-clamp-3">{hit.text}</div>
                    <button
                      type="button"
                      onClick={() => addTextToInput(hit.text)}
                      title="Add context to chat input"
                      className="opacity-0 group-hover:opacity-100 transition-opacity absolute right-0 top-1 p-1 text-white/30 hover:text-white hover:bg-white/10 rounded"
                    >
                      <Plus className="w-3 h-3" />
                    </button>
                  </div>
                ))}
              </div>
            </div>

            <div className="px-5">
              <CollapsibleSection title="Quick ask">
                <div className="flex flex-wrap gap-1.5">
                  {['Summarize this branch', 'What evidence supports this?', 'What are the next steps?'].map(question => (
                    <button
                      key={question}
                      type="button"
                      onClick={() => { void send(question); }}
                      className="text-[11px] px-2.5 py-1.5 rounded-full text-white/60 hover:text-white transition-colors"
                      style={{ background: 'rgba(255,255,255,0.05)' }}
                    >
                      {question}
                    </button>
                  ))}
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="Sources">
                {sources.length === 0 && <p className="text-[11px] text-white/25">No sources attached yet.</p>}
                <div className="space-y-2">
                  {sources.map((s: PlanetCitation, i) => (
                    <a
                      key={s.id ?? `${s.url}-${i}`}
                      href={s.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-1.5 text-[11px] text-white/40 hover:text-white/70 transition-colors truncate"
                    >
                      <ExternalLink className="w-3 h-3 shrink-0" />
                      <span className="truncate">{s.title || hostOf(s.url)}</span>
                    </a>
                  ))}
                </div>
              </CollapsibleSection>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
