import { useState } from 'react';
import { Scale, Check, X, MessageSquarePlus, Clock } from 'lucide-react';
import { useProjectsStore, DECISION_META, type DecisionStatus } from '../../lib/useProjectsStore';
import { useFounderWorkspace } from '../../context/FounderWorkspaceContext';

const ACCENT = '#C1AEFF';
const B = 'rgba(255,255,255,0.06)';

function Chip({ label, color }: { label: string; color: string }) {
  return (
    <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full shrink-0" style={{ background: `${color}1f`, color, border: `1px solid ${color}40` }}>
      {label}
    </span>
  );
}

function timeAgo(iso: string): string {
  const ms = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(ms / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

function DecisionRow({ decisionId, canApprove }: { decisionId: string; canApprove: boolean }) {
  const { decisions, projects, setDecisionStatus, currentMemberId, addChat } = useProjectsStore();
  const d = decisions.find(x => x.id === decisionId);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState('');
  const [commentOpen, setCommentOpen] = useState(false);
  const [comment, setComment] = useState('');

  if (!d) return null;
  const meta = DECISION_META[d.status];
  const project = projects.find(p => p.id === d.projectId);

  const submitNote = (status: DecisionStatus) => {
    setDecisionStatus(d.id, status, note.trim() || undefined);
    setNote('');
    setNoteOpen(false);
  };

  const submitComment = () => {
    if (!comment.trim()) return;
    addChat(d.projectId, currentMemberId, 'member', `On "${d.title}": ${comment.trim()}`);
    setComment('');
    setCommentOpen(false);
  };

  return (
    <div className="rounded-xl border p-3.5" style={{ borderColor: B, background: 'rgba(255,255,255,0.02)' }}>
      <div className="flex items-start gap-2.5">
        <Scale className="w-3.5 h-3.5 shrink-0 mt-0.5" style={{ color: meta.color }} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-[13px] font-semibold text-white">{d.title}</span>
            <Chip label={meta.label} color={meta.color} />
          </div>
          {d.rationale && <p className="text-[11px] text-white/45 mt-1 leading-relaxed">{d.rationale}</p>}
          <div className="flex items-center gap-2 mt-1.5 text-[10px] text-white/30">
            {project && <span>{project.name}</span>}
            <span className="flex items-center gap-1"><Clock className="w-2.5 h-2.5" /> {timeAgo(d.createdAt)}</span>
            {d.reviewNote && d.status !== 'open' && (
              <span className="text-white/40 italic">— "{d.reviewNote}"</span>
            )}
          </div>
        </div>
      </div>

      {d.status === 'open' && (
        <div className="mt-3 pl-6">
          {canApprove ? (
            <>
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => submitNote('approved')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-emerald-300 bg-emerald-500/10 border border-emerald-500/25 hover:bg-emerald-500/20">
                  <Check className="w-3 h-3" /> Approve
                </button>
                <button type="button" onClick={() => submitNote('rejected')}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-rose-300 bg-rose-500/10 border border-rose-500/25 hover:bg-rose-500/20">
                  <X className="w-3 h-3" /> Reject
                </button>
                <button type="button" onClick={() => setNoteOpen(v => !v)}
                  className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/45 hover:text-white/70 transition-colors">
                  <MessageSquarePlus className="w-3 h-3" /> {noteOpen ? 'Cancel' : 'Add note'}
                </button>
              </div>
              {noteOpen && (
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  placeholder="Optional feedback — will be attached when you approve or reject…"
                  rows={2}
                  className="mt-2 w-full bg-white/5 border rounded-lg px-2.5 py-2 text-[11px] text-white placeholder-white/25 outline-none resize-none"
                  style={{ borderColor: B }}
                />
              )}
            </>
          ) : (
            <>
              <div className="text-[10px] text-white/30 mb-1.5">You can comment on this decision but not approve or reject it.</div>
              <button type="button" onClick={() => setCommentOpen(v => !v)}
                className="flex items-center gap-1 px-2.5 py-1 rounded-lg text-[10px] font-semibold text-white/45 hover:text-white/70 transition-colors">
                <MessageSquarePlus className="w-3 h-3" /> {commentOpen ? 'Cancel' : 'Add comment'}
              </button>
              {commentOpen && (
                <div className="flex items-center gap-2 mt-2">
                  <input
                    value={comment}
                    onChange={e => setComment(e.target.value)}
                    placeholder="Share your input…"
                    className="flex-1 bg-white/5 border rounded-lg px-2.5 py-1.5 text-[11px] text-white placeholder-white/25 outline-none"
                    style={{ borderColor: B }}
                  />
                  <button type="button" onClick={submitComment}
                    className="px-2.5 py-1.5 rounded-lg text-[10px] font-semibold"
                    style={{ background: `${ACCENT}26`, border: `1px solid ${ACCENT}44`, color: ACCENT }}>
                    Send
                  </button>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}

export function WorkspaceDecisionsPanel() {
  const { decisions } = useProjectsStore();
  const { activeRole } = useFounderWorkspace();
  const [filter, setFilter] = useState<'open' | 'approved' | 'rejected' | 'all'>('open');

  const canApprove = activeRole !== 'member';

  const counts = {
    open: decisions.filter(d => d.status === 'open').length,
    approved: decisions.filter(d => d.status === 'approved').length,
    rejected: decisions.filter(d => d.status === 'rejected').length,
  };

  const visible = decisions
    .filter(d => filter === 'all' || d.status === filter)
    .sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

  return (
    <div className="w-full h-full overflow-y-auto scrollbar-hide flex flex-col gap-4 pb-6 pr-1">

      {/* ── Header stats ─────────────────────────────────────────────── */}
      <div className="shrink-0 grid grid-cols-3 gap-2">
        {[
          { label: 'Open', value: counts.open, color: '#fbbf24' },
          { label: 'Approved', value: counts.approved, color: '#34d399' },
          { label: 'Rejected', value: counts.rejected, color: '#fb7185' },
        ].map(s => (
          <div key={s.label} className="rounded-xl p-3 border" style={{ borderColor: B, background: 'rgba(255,255,255,0.02)' }}>
            <div className="text-[9px] uppercase tracking-wider text-white/30">{s.label}</div>
            <div className="text-xl font-bold mt-0.5" style={{ color: s.color }}>{s.value}</div>
          </div>
        ))}
      </div>

      {/* ── Filter tabs ──────────────────────────────────────────────── */}
      <div className="shrink-0 flex items-center gap-1 p-1 rounded-xl bg-white/[0.03] border w-fit" style={{ borderColor: B }}>
        {(['open', 'approved', 'rejected', 'all'] as const).map(f => (
          <button
            key={f}
            type="button"
            onClick={() => setFilter(f)}
            className={`px-3 py-1.5 rounded-lg text-[11px] font-semibold capitalize transition-all ${filter === f ? 'bg-white/10 text-white' : 'text-white/40 hover:text-white/70'}`}
          >
            {f}
          </button>
        ))}
      </div>

      {!canApprove && (
        <div className="shrink-0 flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-[11px]" style={{ background: 'rgba(251,191,36,0.06)', border: '1px solid rgba(251,191,36,0.18)', color: '#fbbf24' }}>
          You're in Member preview mode — you can view and comment on decisions, but approving or rejecting requires Founder or Manager.
        </div>
      )}

      {/* ── Decision list ────────────────────────────────────────────── */}
      <div className="flex flex-col gap-2.5">
        {visible.length === 0 && (
          <div className="py-10 text-center text-white/25 text-sm">No {filter !== 'all' ? filter : ''} decisions.</div>
        )}
        {visible.map(d => (
          <DecisionRow key={d.id} decisionId={d.id} canApprove={canApprove} />
        ))}
      </div>
    </div>
  );
}
