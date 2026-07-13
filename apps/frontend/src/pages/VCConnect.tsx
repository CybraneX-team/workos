import { useState, useEffect, useMemo } from 'react';
import {
  Handshake, BadgeDollarSign, FileText, Users, Plus, Search,
  ChevronRight, Send, Calendar, Clock, CheckCircle2,
  XCircle, Trash2, Edit3, Check, X, Sparkles,
  ArrowUpRight, UserCheck, Loader, ExternalLink,
} from 'lucide-react';
import PageHeader from '../components/PageHeader';
import { useAuth } from '../lib/auth';
import {
  getVcFirms, useInvestorPipeline, useInvestorUpdates, useMentors, useMentorSessions,
  addInvestorToPipeline, updateInvestorStatus, updateInvestorNotes, removeInvestorFromPipeline,
  createInvestorUpdate, saveInvestorUpdate, markUpdateSent,
  addMentor, removeMentorById, addMentorSession, updateMentorSession,
} from '../lib/db/vc';
import type {
  VcFirm, InvestorPipeline, InvestorStatus, InvestorUpdate,
  VcMentor, MentorSession,
} from '../lib/db/vc';

/* ── Status config ── */
const STATUS_CFG: Record<InvestorStatus, { label: string; color: string; bg: string; border: string }> = {
  prospect:        { label: 'Prospect',      color: 'text-gray-400',    bg: 'bg-gray-500/10',    border: 'border-gray-500/20' },
  contacted:       { label: 'Contacted',     color: 'text-blue-400',    bg: 'bg-blue-500/10',    border: 'border-blue-500/20' },
  'in-discussion': { label: 'In Discussion', color: 'text-amber-400',   bg: 'bg-amber-500/10',   border: 'border-amber-500/20' },
  'term-sheet':    { label: 'Term Sheet',    color: 'text-sky-400',     bg: 'bg-sky-500/10',     border: 'border-sky-500/20' },
  committed:       { label: 'Committed',     color: 'text-emerald-400', bg: 'bg-emerald-500/10', border: 'border-emerald-500/20' },
  passed:          { label: 'Passed',        color: 'text-red-400',     bg: 'bg-red-500/10',     border: 'border-red-500/20' },
};
const PIPELINE_ORDER: InvestorStatus[] = ['prospect','contacted','in-discussion','term-sheet','committed','passed'];

const SESSION_ICON: Record<MentorSession['status'], typeof CheckCircle2> = {
  completed: CheckCircle2, scheduled: Clock, cancelled: XCircle,
};
const SESSION_COLOR: Record<MentorSession['status'], string> = {
  completed: 'text-emerald-400', scheduled: 'text-amber-400', cancelled: 'text-red-400',
};

type Tab = 'pipeline' | 'updates' | 'mentors';

/* ──────────────────────────────────────────────────
   Main
────────────────────────────────────────────────── */
export default function VCConnect() {
  const { user, profile } = useAuth();
  const companyId = profile?.company_id ?? null;

  const { pipeline, loading: pipelineLoading, refetch: refetchPipeline } = useInvestorPipeline(companyId);
  const { updates, loading: updatesLoading, refetch: refetchUpdates } = useInvestorUpdates(companyId);
  const { mentors, loading: mentorsLoading, refetch: refetchMentors } = useMentors(companyId);
  const { sessions, loading: sessionsLoading, refetch: refetchSessions } = useMentorSessions(companyId);

  const [tab, setTab] = useState<Tab>('pipeline');
  const [selectedPipeline, setSelectedPipeline] = useState<string | null>(null);
  const [selectedSession, setSelectedSession] = useState<string | null>(null);

  return (
    <div>
      <PageHeader
        title="VC & Mentor Connect"
        subtitle="Manage your investor pipeline, send structured updates, and track mentor sessions"
        icon={<Handshake className="w-6 h-6" />}
        badge={`${pipeline.length} investors · ${mentors.length} mentors`}
      />

      {/* Tab bar */}
      <div className="flex gap-1 mb-6 p-1 rounded-xl w-fit" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(14,165,233,0.12)' }}>
        {([
          ['pipeline', BadgeDollarSign, 'Investor Pipeline'],
          ['updates',  FileText,        'Monthly Updates'],
          ['mentors',  Users,           'Mentors'],
        ] as const).map(([key, Icon, label]) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm transition-all ${
              tab === key
                ? 'text-sky-300 font-medium'
                : 'text-gray-400 hover:text-gray-200 hover:bg-white/[0.04]'
            }`}
            style={tab === key ? { background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.2)' } : {}}
          >
            <Icon className="w-4 h-4" />{label}
          </button>
        ))}
      </div>

      {tab === 'pipeline' && (
        <PipelineTab
          companyId={companyId}
          userId={user?.id ?? ''}
          pipeline={pipeline}
          loading={pipelineLoading}
          selectedId={selectedPipeline}
          onSelect={setSelectedPipeline}
          onRefetch={refetchPipeline}
        />
      )}
      {tab === 'updates' && (
        <UpdatesTab
          companyId={companyId}
          userId={user?.id ?? ''}
          updates={updates}
          loading={updatesLoading}
          pipeline={pipeline}
          onRefetch={refetchUpdates}
        />
      )}
      {tab === 'mentors' && (
        <MentorsTab
          companyId={companyId}
          userId={user?.id ?? ''}
          mentors={mentors}
          sessions={sessions}
          loading={mentorsLoading || sessionsLoading}
          selectedSessionId={selectedSession}
          onSelectSession={setSelectedSession}
          onRefetchMentors={refetchMentors}
          onRefetchSessions={refetchSessions}
        />
      )}
    </div>
  );
}

/* ══════════════════════════════════════════════════
   PIPELINE TAB
══════════════════════════════════════════════════ */
function PipelineTab({
  companyId, userId, pipeline, loading, selectedId, onSelect, onRefetch,
}: {
  companyId: string | null;
  userId: string;
  pipeline: InvestorPipeline[];
  loading: boolean;
  selectedId: string | null;
  onSelect: (id: string | null) => void;
  onRefetch: () => void;
}) {
  const [showAdd, setShowAdd] = useState(false);
  const [filterStatus, setFilterStatus] = useState<InvestorStatus | 'all'>('all');

  const filtered = filterStatus === 'all'
    ? pipeline
    : pipeline.filter(p => p.status === filterStatus);

  const counts = useMemo(() => {
    const c: Partial<Record<InvestorStatus, number>> = {};
    for (const st of PIPELINE_ORDER) c[st] = pipeline.filter(p => p.status === st).length;
    return c;
  }, [pipeline]);

  const selected = selectedId ? pipeline.find(p => p.id === selectedId) : null;

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Left: pipeline list */}
      <div className="col-span-2 space-y-4">
        {/* Summary strip */}
        <div className="flex gap-2 flex-wrap">
          <button
            onClick={() => setFilterStatus('all')}
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
              filterStatus === 'all' ? 'border-sky-500/30 text-sky-300 bg-sky-500/10' : 'border-white/5 text-gray-500 hover:border-gray-700'
            }`}
          >
            All <span className="font-semibold">{pipeline.length}</span>
          </button>
          {PIPELINE_ORDER.map(st => {
            const cfg = STATUS_CFG[st];
            const count = counts[st] ?? 0;
            return (
              <button
                key={st}
                onClick={() => setFilterStatus(st === filterStatus ? 'all' : st)}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs transition-all ${
                  filterStatus === st ? `${cfg.bg} ${cfg.border} ${cfg.color}` : 'border-white/5 text-gray-500 hover:border-gray-700'
                }`}
              >
                {cfg.label} <span className="font-semibold">{count}</span>
              </button>
            );
          })}
        </div>

        {/* Add investor button */}
        <button
          onClick={() => setShowAdd(true)}
          className="w-full flex items-center justify-center gap-2 py-2.5 rounded-xl border border-dashed text-sm font-medium transition-all hover:border-sky-500/40 hover:text-sky-300"
          style={{ borderColor: 'rgba(255,255,255,0.08)', color: '#5E5E5E' }}
        >
          <Plus className="w-4 h-4" /> Add Investor
        </button>

        {/* Add investor modal */}
        {showAdd && (
          <AddInvestorModal
            companyId={companyId ?? ''}
            userId={userId}
            onClose={() => setShowAdd(false)}
            onAdded={() => { setShowAdd(false); onRefetch(); }}
          />
        )}

        {loading ? (
          <div className="flex items-center justify-center py-12">
            <Loader className="w-5 h-5 text-gray-500 animate-spin" />
          </div>
        ) : filtered.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Handshake className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No investors in pipeline yet</p>
            <p className="text-xs text-gray-600 mt-1">Click "Add Investor" to start tracking</p>
          </div>
        ) : (
          <div className="space-y-2">
            {filtered.map(inv => (
              <PipelineCard
                key={inv.id}
                inv={inv}
                isSelected={selectedId === inv.id}
                onSelect={() => onSelect(selectedId === inv.id ? null : inv.id)}
                onStatusChange={async (st) => { await updateInvestorStatus(inv.id, st); onRefetch(); }}
                onRemove={async () => { await removeInvestorFromPipeline(inv.id); onSelect(null); onRefetch(); }}
              />
            ))}
          </div>
        )}
      </div>

      {/* Right: detail panel */}
      <div className="col-span-1">
        {selected ? (
          <InvestorDetailPanel
            inv={selected}
            onSaveNotes={async (notes) => { await updateInvestorNotes(selected.id, notes); onRefetch(); }}
            onStatusChange={async (st) => { await updateInvestorStatus(selected.id, st); onRefetch(); }}
          />
        ) : (
          <div className="glass-card p-8 flex flex-col items-center justify-center text-gray-500">
            <Handshake className="w-10 h-10 mb-3 opacity-30" />
            <p className="text-sm">Select an investor to view details</p>
          </div>
        )}
      </div>
    </div>
  );
}

function PipelineCard({
  inv, isSelected, onSelect, onStatusChange, onRemove,
}: {
  inv: InvestorPipeline;
  isSelected: boolean;
  onSelect: () => void;
  onStatusChange: (st: InvestorStatus) => void;
  onRemove: () => void;
}) {
  const cfg = STATUS_CFG[inv.status];
  const firm = inv.vc_firm;
  const name = firm?.name ?? inv.custom_name ?? 'Unknown';
  const firmName = firm?.short_name ?? inv.custom_firm ?? '';
  const initials = name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase();
  const [changingStatus, setChangingStatus] = useState(false);

  return (
    <div
      className={`glass-card p-4 transition-all cursor-pointer hover:border-sky-500/20 ${isSelected ? 'border-sky-500/40 bg-sky-600/5' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-full flex items-center justify-center text-xs font-bold text-sky-300 shrink-0"
            style={{ background: 'rgba(14,165,233,0.15)' }}>
            {initials}
          </div>
          <div className="min-w-0">
            <h4 className="text-sm font-medium text-white truncate">{name}</h4>
            {firmName && <p className="text-xs text-gray-500 truncate">{firmName}</p>}
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={(e) => { e.stopPropagation(); setChangingStatus(v => !v); }}
            className={`text-[10px] px-2 py-0.5 rounded-full border ${cfg.bg} ${cfg.color} ${cfg.border} font-medium`}
          >
            {cfg.label}
          </button>
          <button
            onClick={(e) => { e.stopPropagation(); onRemove(); }}
            className="text-gray-600 hover:text-red-400 transition-colors p-0.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {changingStatus && (
        <div className="flex flex-wrap gap-1.5 mt-2 pt-2 border-t border-white/5" onClick={e => e.stopPropagation()}>
          {PIPELINE_ORDER.map(st => (
            <button
              key={st}
              onClick={() => { onStatusChange(st); setChangingStatus(false); }}
              className={`text-[10px] px-2 py-0.5 rounded-full border font-medium transition-all ${
                st === inv.status
                  ? `${STATUS_CFG[st].bg} ${STATUS_CFG[st].color} ${STATUS_CFG[st].border}`
                  : 'border-white/5 text-gray-600 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {STATUS_CFG[st].label}
            </button>
          ))}
        </div>
      )}

      <div className="flex items-center gap-3 mt-2 text-xs text-gray-500">
        {inv.ask_amount && <span>{inv.ask_amount}</span>}
        {firm?.focus_stage?.slice(0,2).map(s => (
          <span key={s} className="px-1.5 py-0.5 rounded text-[10px]" style={{ background: 'rgba(255,255,255,0.04)' }}>{s}</span>
        ))}
        {inv.warm_intro && (
          <span className="flex items-center gap-1 text-emerald-400">
            <UserCheck className="w-3 h-3" /> Warm intro
          </span>
        )}
        {inv.next_followup && (
          <span className="flex items-center gap-1 text-amber-400">
            <Clock className="w-3 h-3" />
            {new Date(inv.next_followup).toLocaleDateString('en-IN', { month: 'short', day: 'numeric' })}
          </span>
        )}
      </div>
    </div>
  );
}

function InvestorDetailPanel({
  inv, onSaveNotes, onStatusChange,
}: {
  inv: InvestorPipeline;
  onSaveNotes: (notes: string) => void;
  onStatusChange: (st: InvestorStatus) => void;
}) {
  const [notes, setNotes] = useState(inv.notes ?? '');
  const [editingNotes, setEditingNotes] = useState(false);
  const firm = inv.vc_firm;
  const name = firm?.name ?? inv.custom_name ?? 'Unknown';

  useEffect(() => { setNotes(inv.notes ?? ''); setEditingNotes(false); }, [inv.id]);

  return (
    <div className="glass-card p-6 space-y-5 sticky top-[4.5rem]">
      {/* Header */}
      <div className="flex items-center gap-3">
        <div className="w-12 h-12 rounded-xl flex items-center justify-center text-sm font-bold text-sky-300"
          style={{ background: 'rgba(14,165,233,0.15)' }}>
          {name.split(' ').map(w => w[0]).join('').slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h3 className="text-base font-semibold text-white">{name}</h3>
          {(firm?.short_name ?? inv.custom_firm) && (
            <p className="text-xs text-gray-400">{firm?.short_name ?? inv.custom_firm}</p>
          )}
        </div>
      </div>

      {/* Status selector */}
      <div>
        <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-2">Pipeline Status</p>
        <div className="flex flex-wrap gap-1.5">
          {PIPELINE_ORDER.map(st => (
            <button
              key={st}
              onClick={() => onStatusChange(st)}
              className={`text-[10px] px-2.5 py-1 rounded-full border font-medium transition-all ${
                st === inv.status
                  ? `${STATUS_CFG[st].bg} ${STATUS_CFG[st].color} ${STATUS_CFG[st].border}`
                  : 'border-white/5 text-gray-600 hover:border-gray-600 hover:text-gray-300'
              }`}
            >
              {STATUS_CFG[st].label}
            </button>
          ))}
        </div>
      </div>

      {/* Firm info */}
      {firm && (
        <div className="grid grid-cols-2 gap-2 text-xs">
          {[
            { label: 'Avg Ticket', val: firm.avg_ticket },
            { label: 'Fund Size', val: firm.total_fund },
            { label: 'Region', val: firm.region },
            { label: 'HQ', val: firm.hq_city },
          ].filter(x => x.val).map(({ label, val }) => (
            <div key={label} className="p-2 rounded-lg" style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
              <p className="text-gray-500 mb-0.5 text-[10px]">{label}</p>
              <p className="text-white font-medium">{val}</p>
            </div>
          ))}
        </div>
      )}

      {/* Sectors */}
      {firm?.sectors?.length ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Focus Sectors</p>
          <div className="flex flex-wrap gap-1">
            {firm.sectors.map(s => (
              <span key={s} className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#9ca3af' }}>{s}</span>
            ))}
          </div>
        </div>
      ) : null}

      {/* Notable investments */}
      {firm?.notable_investments?.length ? (
        <div>
          <p className="text-[10px] text-gray-500 uppercase tracking-wider mb-1.5">Notable Portfolio</p>
          <p className="text-xs text-gray-400">{firm.notable_investments.slice(0, 5).join(', ')}</p>
        </div>
      ) : null}

      {/* Warm intro */}
      {inv.warm_intro && (
        <div className="flex items-center gap-2 text-xs text-emerald-400">
          <UserCheck className="w-3.5 h-3.5" />
          Warm intro via {inv.intro_by ?? 'known contact'}
        </div>
      )}

      {/* Notes */}
      <div>
        <div className="flex items-center justify-between mb-1.5">
          <p className="text-[10px] text-gray-500 uppercase tracking-wider">Notes</p>
          {!editingNotes ? (
            <button onClick={() => setEditingNotes(true)} className="text-gray-600 hover:text-gray-300 transition-colors">
              <Edit3 className="w-3 h-3" />
            </button>
          ) : (
            <div className="flex items-center gap-1">
              <button onClick={() => { onSaveNotes(notes); setEditingNotes(false); }} className="text-emerald-400 hover:text-emerald-300">
                <Check className="w-3.5 h-3.5" />
              </button>
              <button onClick={() => { setNotes(inv.notes ?? ''); setEditingNotes(false); }} className="text-gray-500 hover:text-gray-300">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          )}
        </div>
        {editingNotes ? (
          <textarea
            value={notes}
            onChange={e => setNotes(e.target.value)}
            rows={4}
            className="w-full text-xs text-gray-300 rounded-lg px-3 py-2 outline-none resize-none"
            style={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.08)' }}
            autoFocus
          />
        ) : (
          <p className="text-xs text-gray-400 leading-relaxed min-h-[36px]">
            {notes || <span className="text-gray-600 italic">No notes yet. Click edit to add.</span>}
          </p>
        )}
      </div>

      {/* Website */}
      {firm?.website && (
        <a
          href={firm.website}
          target="_blank"
          rel="noopener noreferrer"
          className="flex items-center gap-2 text-xs text-sky-400 hover:text-sky-300 transition-colors"
        >
          <ExternalLink className="w-3 h-3" /> Visit website
        </a>
      )}
    </div>
  );
}

/* ── Add Investor Modal ── */
function AddInvestorModal({
  companyId, userId, onClose, onAdded,
}: {
  companyId: string;
  userId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mode, setMode] = useState<'search' | 'custom'>('search');
  const [search, setSearch] = useState('');
  const [allFirms, setAllFirms] = useState<VcFirm[]>([]);
  const [region, setRegion] = useState<string>('All');
  const [selectedFirm, setSelectedFirm] = useState<VcFirm | null>(null);
  const [partnerName, setPartnerName] = useState('');
  const [askAmount, setAskAmount] = useState('');
  const [warmIntro, setWarmIntro] = useState(false);
  const [introBy, setIntroBy] = useState('');
  const [notes, setNotes] = useState('');
  const [customName, setCustomName] = useState('');
  const [customFirm, setCustomFirm] = useState('');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getVcFirms().then(setAllFirms);
  }, []);

  const filtered = useMemo(() => {
    let list = allFirms;
    if (region !== 'All') list = list.filter(f => f.region === region);
    if (search.trim()) {
      const q = search.toLowerCase();
      list = list.filter(f => f.name.toLowerCase().includes(q) || (f.sectors ?? []).some(s => s.toLowerCase().includes(q)));
    }
    return list.slice(0, 12);
  }, [allFirms, search, region]);

  async function handleAdd() {
    setSaving(true);
    await addInvestorToPipeline({
      company_id: companyId,
      created_by: userId,
      vc_firm_id: selectedFirm?.id,
      custom_name: mode === 'custom' ? customName : undefined,
      custom_firm: mode === 'custom' ? customFirm : undefined,
      partner_name: partnerName || undefined,
      ask_amount: askAmount || undefined,
      warm_intro: warmIntro,
      intro_by: introBy || undefined,
      notes: notes || undefined,
    });
    setSaving(false);
    onAdded();
  }

  const canSave = mode === 'search' ? !!selectedFirm : !!customName.trim();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Add Investor</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white transition-colors"><X className="w-5 h-5" /></button>
        </div>

        {/* Mode toggle */}
        <div className="flex gap-1 p-1 rounded-xl mb-5" style={{ background: '#161618' }}>
          {(['search', 'custom'] as const).map(m => (
            <button key={m} onClick={() => setMode(m)}
              className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                mode === m ? 'text-white' : 'text-gray-500'
              }`}
              style={mode === m ? { background: 'rgba(14,165,233,0.2)', color: '#38bdf8' } : {}}
            >
              {m === 'search' ? 'From VC Database' : 'Add Custom'}
            </button>
          ))}
        </div>

        {mode === 'search' ? (
          <>
            {/* Region filter */}
            <div className="flex gap-2 mb-4 flex-wrap">
              {['All','India','US','Global','SEA'].map(r => (
                <button key={r} onClick={() => setRegion(r)}
                  className={`px-3 py-1 rounded-lg text-xs border transition-all ${
                    region === r
                      ? 'bg-sky-500/15 border-sky-500/30 text-sky-300'
                      : 'border-white/5 text-gray-500 hover:border-gray-700'
                  }`}
                >
                  {r}
                </button>
              ))}
            </div>

            {/* Search */}
            <div className="relative mb-4">
              <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="Search by name or sector..."
                className="w-full pl-9 pr-4 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#161618' }}
              />
            </div>

            {/* Firm list */}
            <div className="space-y-2 max-h-56 overflow-y-auto mb-5 pr-1">
              {filtered.map(f => (
                <button
                  key={f.id}
                  onClick={() => setSelectedFirm(f.id === selectedFirm?.id ? null : f)}
                  className={`w-full text-left p-3 rounded-xl border transition-all ${
                    selectedFirm?.id === f.id
                      ? 'border-sky-500/40 bg-sky-500/10'
                      : 'border-white/5 hover:border-gray-700'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-sm font-medium text-white">{f.name}</span>
                      {f.avg_ticket && <span className="ml-2 text-[10px] text-gray-500">{f.avg_ticket}</span>}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.05)', color: '#6b7280' }}>{f.region}</span>
                      {selectedFirm?.id === f.id && <Check className="w-4 h-4 text-sky-400" />}
                    </div>
                  </div>
                  <div className="flex gap-1 mt-1 flex-wrap">
                    {(f.sectors ?? []).slice(0, 3).map(s => (
                      <span key={s} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#6b7280' }}>{s}</span>
                    ))}
                  </div>
                </button>
              ))}
            </div>
          </>
        ) : (
          <div className="space-y-4 mb-5">
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Partner / Contact Name *</label>
                <input value={customName} onChange={e => setCustomName(e.target.value)}
                  placeholder="Rahul Mehta" className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#161618' }} />
              </div>
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Fund / Firm Name</label>
                <input value={customFirm} onChange={e => setCustomFirm(e.target.value)}
                  placeholder="Angel / Family Office" className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#161618' }} />
              </div>
            </div>
          </div>
        )}

        {/* Common fields */}
        <div className="space-y-4 border-t pt-4" style={{ borderColor: 'rgba(255,255,255,0.06)' }}>
          <div className="grid grid-cols-2 gap-4">
            {mode === 'search' && (
              <div>
                <label className="text-xs text-gray-500 mb-1.5 block">Partner Name (optional)</label>
                <input value={partnerName} onChange={e => setPartnerName(e.target.value)}
                  placeholder="e.g. Anand Daniel" className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#161618' }} />
              </div>
            )}
            <div>
              <label className="text-xs text-gray-500 mb-1.5 block">Ask Amount</label>
              <input value={askAmount} onChange={e => setAskAmount(e.target.value)}
                placeholder="e.g. $500K" className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#161618' }} />
            </div>
          </div>

          <div className="flex items-center gap-3">
            <button
              onClick={() => setWarmIntro(v => !v)}
              className={`w-8 h-4 rounded-full transition-all relative ${warmIntro ? 'bg-emerald-500' : 'bg-gray-700'}`}
            >
              <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-white transition-all ${warmIntro ? 'left-4' : 'left-0.5'}`} />
            </button>
            <span className="text-xs text-gray-400">Warm introduction</span>
            {warmIntro && (
              <input value={introBy} onChange={e => setIntroBy(e.target.value)}
                placeholder="via who?" className="flex-1 px-3 py-1.5 rounded-lg text-xs text-white outline-none"
                style={{ background: '#161618' }} />
            )}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1.5 block">Initial notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)}
              rows={2} placeholder="Meeting context, thesis alignment..."
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
              style={{ background: '#161618' }} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 border border-white/5 hover:border-gray-700 transition-all">
            Cancel
          </button>
          <button
            onClick={handleAdd}
            disabled={!canSave || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold transition-all disabled:opacity-40 flex items-center justify-center gap-2"
            style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#161618' }}
          >
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Adding…' : 'Add to Pipeline'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   UPDATES TAB
══════════════════════════════════════════════════ */
function UpdatesTab({
  companyId, userId, updates, loading, pipeline, onRefetch,
}: {
  companyId: string | null;
  userId: string;
  updates: InvestorUpdate[];
  loading: boolean;
  pipeline: InvestorPipeline[];
  onRefetch: () => void;
}) {
  const [editing, setEditing] = useState<InvestorUpdate | null>(null);

  async function handleCreate() {
    if (!companyId) return;
    const upd = await createInvestorUpdate(companyId, userId, {
      title: 'Investor Update',
      period: new Date().toLocaleDateString('en-US', { month: 'long', year: 'numeric' }),
    });
    if (upd) { setEditing(upd); onRefetch(); }
  }

  if (loading) return <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-gray-500 animate-spin" /></div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-medium text-gray-300">Investor Updates</h3>
        <button
          onClick={handleCreate}
          className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-xs font-medium text-sky-300 transition-all hover:opacity-80"
          style={{ background: 'rgba(14,165,233,0.15)', border: '1px solid rgba(14,165,233,0.2)' }}
        >
          <Plus className="w-3 h-3" /> New Update
        </button>
      </div>

      {updates.length === 0 ? (
        <div className="glass-card p-8 text-center">
          <FileText className="w-8 h-8 text-gray-600 mx-auto mb-3" />
          <p className="text-sm text-gray-400">No updates sent yet</p>
          <p className="text-xs text-gray-600 mt-1">Create structured monthly updates for your investors</p>
          <button onClick={handleCreate} className="mt-4 text-xs text-sky-400 hover:text-sky-300 underline">
            Create first update
          </button>
        </div>
      ) : (
        updates.map(upd => (
          <UpdateCard
            key={upd.id}
            update={upd}
            pipeline={pipeline}
            onEdit={() => setEditing(upd)}
            onSent={onRefetch}
          />
        ))
      )}

      {editing && (
        <UpdateEditorModal
          update={editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); onRefetch(); }}
        />
      )}
    </div>
  );
}

function UpdateCard({
  update, pipeline, onEdit, onSent,
}: {
  update: InvestorUpdate;
  pipeline: InvestorPipeline[];
  onEdit: () => void;
  onSent: () => void;
}) {
  const [sending, setSending] = useState(false);

  async function handleSend() {
    const recipientIds = pipeline.filter(p => p.status !== 'passed' && p.status !== 'prospect').map(p => p.id);
    setSending(true);
    await markUpdateSent(update.id, recipientIds);
    setSending(false);
    onSent();
  }

  return (
    <div className="glass-card p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <Calendar className="w-5 h-5 text-sky-400" />
          <div>
            <h4 className="text-base font-semibold text-white">{update.title}</h4>
            <p className="text-xs text-gray-500">
              {update.period}
              {update.status === 'sent'
                ? ` · Sent to ${update.sent_to.length} investor${update.sent_to.length !== 1 ? 's' : ''}`
                : ' · Draft'}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-[10px] px-2 py-0.5 rounded-full font-medium ${
            update.status === 'sent' ? 'bg-emerald-500/10 text-emerald-400' : 'bg-amber-500/10 text-amber-400'
          }`}>
            {update.status === 'sent' ? 'Sent' : 'Draft'}
          </span>
          <button onClick={onEdit} className="text-gray-600 hover:text-gray-300 transition-colors p-1">
            <Edit3 className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {update.highlights.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-medium text-gray-400 mb-2">Highlights</h5>
          <ul className="space-y-1">
            {update.highlights.map((h, i) => (
              <li key={i} className="flex items-start gap-2 text-xs text-gray-300">
                <Sparkles className="w-3 h-3 mt-0.5 text-amber-400 shrink-0" />{h}
              </li>
            ))}
          </ul>
        </div>
      )}

      {Object.values(update.metrics).some(v => v) && (
        <div className="mb-4">
          <h5 className="text-xs font-medium text-gray-400 mb-2">Metrics Snapshot</h5>
          <div className="flex flex-wrap gap-3">
            {Object.entries(update.metrics).filter(([, v]) => v).map(([k, v]) => (
              <div key={k} className="px-3 py-2 rounded-lg text-center min-w-[72px]"
                style={{ background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.05)' }}>
                <p className="text-sm font-semibold text-white">
                  {typeof v === 'number' && v >= 1000 ? `${(v / 1000).toFixed(1)}K` : v}
                </p>
                <p className="text-[10px] text-gray-500 uppercase">{k}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {update.asks.length > 0 && (
        <div className="mb-4">
          <h5 className="text-xs font-medium text-gray-400 mb-2">Asks</h5>
          <ul className="space-y-1">
            {update.asks.map((a, i) => (
              <li key={i} className="flex items-center gap-2 text-xs text-gray-300">
                <ArrowUpRight className="w-3 h-3 text-cyan-400 shrink-0" />{a}
              </li>
            ))}
          </ul>
        </div>
      )}

      {update.status === 'draft' && (
        <button
          onClick={handleSend}
          disabled={sending}
          className="flex items-center gap-2 px-3 py-2 rounded-lg text-xs font-medium transition-all"
          style={{ background: 'rgba(14,165,233,0.15)', color: '#38bdf8', border: '1px solid rgba(14,165,233,0.2)' }}
        >
          {sending ? <Loader className="w-3 h-3 animate-spin" /> : <Send className="w-3 h-3" />}
          {sending ? 'Sending…' : 'Mark as Sent'}
        </button>
      )}
    </div>
  );
}

function UpdateEditorModal({
  update, onClose, onSaved,
}: {
  update: InvestorUpdate;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(update.title);
  const [period, setPeriod] = useState(update.period);
  const [highlights, setHighlights] = useState(update.highlights.join('\n'));
  const [asks, setAsks] = useState(update.asks.join('\n'));
  const [metrics, setMetrics] = useState<Record<string, string>>({
    mrr: String(update.metrics.mrr ?? ''),
    customers: String(update.metrics.customers ?? ''),
    burn: String(update.metrics.burn ?? ''),
    runway: String(update.metrics.runway ?? ''),
  });
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    await saveInvestorUpdate(update.id, {
      title,
      period,
      highlights: highlights.split('\n').map(s => s.trim()).filter(Boolean),
      asks: asks.split('\n').map(s => s.trim()).filter(Boolean),
      metrics: {
        mrr: metrics.mrr ? Number(metrics.mrr) : undefined,
        customers: metrics.customers ? Number(metrics.customers) : undefined,
        burn: metrics.burn ? Number(metrics.burn) : undefined,
        runway: metrics.runway ? Number(metrics.runway) : undefined,
      },
    });
    setSaving(false);
    onSaved();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-2xl rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Edit Update</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Title</label>
              <input value={title} onChange={e => setTitle(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#161618' }} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Period</label>
              <input value={period} onChange={e => setPeriod(e.target.value)}
                placeholder="March 2025"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                style={{ background: '#161618' }} />
            </div>
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Highlights (one per line)</label>
            <textarea value={highlights} onChange={e => setHighlights(e.target.value)}
              rows={4} placeholder="Crossed $50K MRR&#10;Launched in 2 new cities..."
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
              style={{ background: '#161618' }} />
          </div>

          <div className="grid grid-cols-2 gap-4">
            {(['mrr','customers','burn','runway'] as const).map(k => (
              <div key={k}>
                <label className="text-xs text-gray-500 mb-1 block capitalize">
                  {k === 'mrr' ? 'MRR ($)' : k === 'burn' ? 'Monthly Burn ($)' : k === 'runway' ? 'Runway (months)' : 'Customers'}
                </label>
                <input
                  type="number"
                  value={metrics[k]}
                  onChange={e => setMetrics(m => ({ ...m, [k]: e.target.value }))}
                  placeholder="0"
                  className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
                  style={{ background: '#161618' }}
                />
              </div>
            ))}
          </div>

          <div>
            <label className="text-xs text-gray-500 mb-1 block">Asks (one per line)</label>
            <textarea value={asks} onChange={e => setAsks(e.target.value)}
              rows={3} placeholder="Intro to logistics VCs&#10;B2B SaaS advisor referrals..."
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
              style={{ background: '#161618' }} />
          </div>
        </div>

        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 border border-white/5">Cancel</button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all disabled:opacity-50"
            style={{ background: 'linear-gradient(135deg, #38bdf8, #818cf8)', color: '#161618' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Update'}
          </button>
        </div>
      </div>
    </div>
  );
}

/* ══════════════════════════════════════════════════
   MENTORS TAB
══════════════════════════════════════════════════ */
function MentorsTab({
  companyId, userId, mentors, sessions, loading, selectedSessionId, onSelectSession,
  onRefetchMentors, onRefetchSessions,
}: {
  companyId: string | null;
  userId: string;
  mentors: VcMentor[];
  sessions: MentorSession[];
  loading: boolean;
  selectedSessionId: string | null;
  onSelectSession: (id: string | null) => void;
  onRefetchMentors: () => void;
  onRefetchSessions: () => void;
}) {
  const [showAddMentor, setShowAddMentor] = useState(false);
  const [showAddSession, setShowAddSession] = useState(false);
  const [selectedMentorId, setSelectedMentorId] = useState<string | null>(null);

  if (loading) return <div className="flex justify-center py-12"><Loader className="w-5 h-5 text-gray-500 animate-spin" /></div>;

  return (
    <div className="grid grid-cols-3 gap-6">
      {/* Mentor list */}
      <div className="col-span-1 space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Mentors</h3>
          <button
            onClick={() => setShowAddMentor(true)}
            className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
          >
            <Plus className="w-3 h-3" /> Add
          </button>
        </div>

        {mentors.length === 0 ? (
          <div className="glass-card p-5 text-center">
            <Users className="w-6 h-6 text-gray-600 mx-auto mb-2" />
            <p className="text-xs text-gray-500">No mentors added yet</p>
            <button onClick={() => setShowAddMentor(true)} className="text-xs text-sky-400 underline mt-1">Add first mentor</button>
          </div>
        ) : (
          mentors.map(m => {
            const nextSess = sessions.find(s => s.mentor_id === m.id && s.status === 'scheduled');
            return (
              <div
                key={m.id}
                onClick={() => setSelectedMentorId(m.id === selectedMentorId ? null : m.id)}
                className={`glass-card p-4 cursor-pointer hover:border-sky-500/20 transition-all ${selectedMentorId === m.id ? 'border-sky-500/30 bg-sky-500/5' : ''}`}
              >
                <div className="flex items-center justify-between gap-2 mb-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="w-8 h-8 rounded-full shrink-0 flex items-center justify-center text-xs font-bold text-cyan-300"
                      style={{ background: 'rgba(34,211,238,0.15)' }}>
                      {m.name.split(' ').map(w => w[0]).join('').slice(0, 2)}
                    </div>
                    <div className="min-w-0">
                      <h4 className="text-sm font-medium text-white truncate">{m.name}</h4>
                      {(m.role ?? m.company) && (
                        <p className="text-xs text-gray-500 truncate">{[m.role, m.company].filter(Boolean).join(' · ')}</p>
                      )}
                    </div>
                  </div>
                  <button
                    onClick={async (e) => { e.stopPropagation(); await removeMentorById(m.id); onRefetchMentors(); }}
                    className="text-gray-600 hover:text-red-400 transition-colors shrink-0"
                  >
                    <Trash2 className="w-3 h-3" />
                  </button>
                </div>
                <div className="flex flex-wrap gap-1">
                  {(m.expertise ?? []).slice(0, 2).map(e => (
                    <span key={e} className="text-[9px] px-1.5 py-0.5 rounded" style={{ background: 'rgba(255,255,255,0.04)', color: '#6b7280' }}>{e}</span>
                  ))}
                  <span className="text-[9px] text-gray-600 capitalize">{m.availability}</span>
                </div>
                {nextSess && (
                  <div className="flex items-center gap-1 mt-1.5 text-[10px] text-amber-400">
                    <Clock className="w-3 h-3" />
                    {new Date(nextSess.session_date).toLocaleDateString('en-IN', { day:'numeric', month:'short' })}
                  </div>
                )}
              </div>
            );
          })
        )}

        {/* Add mentor modal */}
        {showAddMentor && (
          <AddMentorModal
            companyId={companyId ?? ''}
            userId={userId}
            onClose={() => setShowAddMentor(false)}
            onAdded={() => { setShowAddMentor(false); onRefetchMentors(); }}
          />
        )}
      </div>

      {/* Sessions */}
      <div className="col-span-2 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="text-xs font-medium text-gray-400 uppercase tracking-wider">Session Log</h3>
          {mentors.length > 0 && (
            <button
              onClick={() => setShowAddSession(true)}
              className="text-xs text-sky-400 hover:text-sky-300 flex items-center gap-1 transition-colors"
            >
              <Plus className="w-3 h-3" /> Schedule
            </button>
          )}
        </div>

        {sessions.length === 0 ? (
          <div className="glass-card p-8 text-center">
            <Calendar className="w-8 h-8 text-gray-600 mx-auto mb-3" />
            <p className="text-sm text-gray-400">No sessions logged yet</p>
          </div>
        ) : (
          sessions
            .filter(s => !selectedMentorId || s.mentor_id === selectedMentorId)
            .map(s => (
              <SessionCard
                key={s.id}
                session={s}
                mentor={mentors.find(m => m.id === s.mentor_id)}
                isSelected={selectedSessionId === s.id}
                onSelect={() => onSelectSession(selectedSessionId === s.id ? null : s.id)}
                onStatusChange={async (st) => {
                  await updateMentorSession(s.id, { status: st });
                  onRefetchSessions();
                }}
              />
            ))
        )}

        {showAddSession && (
          <AddSessionModal
            companyId={companyId ?? ''}
            userId={userId}
            mentors={mentors}
            onClose={() => setShowAddSession(false)}
            onAdded={() => { setShowAddSession(false); onRefetchSessions(); }}
          />
        )}
      </div>
    </div>
  );
}

function SessionCard({
  session, mentor, isSelected, onSelect, onStatusChange,
}: {
  session: MentorSession;
  mentor?: VcMentor;
  isSelected: boolean;
  onSelect: () => void;
  onStatusChange: (st: MentorSession['status']) => void;
}) {
  const Icon = SESSION_ICON[session.status];
  const statusColor = SESSION_COLOR[session.status];

  return (
    <div
      className={`glass-card p-5 cursor-pointer transition-all hover:border-sky-500/20 ${isSelected ? 'border-sky-500/30 bg-sky-500/5' : ''}`}
      onClick={onSelect}
    >
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-3">
          <Icon className={`w-4 h-4 ${statusColor}`} />
          <div>
            <h4 className="text-sm font-medium text-white">
              {mentor?.name ?? 'Unknown'}{' '}
              <span className="text-gray-400 font-normal">
                · {new Date(session.session_date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
              </span>
            </h4>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Quick status change */}
          {(['scheduled','completed','cancelled'] as const).map(st => (
            <button
              key={st}
              onClick={e => { e.stopPropagation(); onStatusChange(st); }}
              className={`text-[9px] px-1.5 py-0.5 rounded-full border font-medium transition-all ${
                st === session.status
                  ? st === 'completed' ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                    : st === 'scheduled' ? 'bg-amber-500/10 border-amber-500/30 text-amber-400'
                    : 'bg-red-500/10 border-red-500/30 text-red-400'
                  : 'border-white/5 text-gray-600 hover:border-gray-600'
              }`}
            >
              {st}
            </button>
          ))}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { label: 'Agenda', items: session.agenda, color: 'text-sky-500' },
          { label: 'Actions', items: session.actions, color: 'text-cyan-500' },
          { label: 'Follow-ups', items: session.follow_ups, color: 'text-amber-500' },
        ].map(({ label, items, color }) => (
          <div key={label}>
            <h5 className="text-[10px] uppercase tracking-wider text-gray-500 mb-1.5">{label}</h5>
            {items.length > 0 ? (
              <ul className="space-y-1">
                {items.map((item, i) => (
                  <li key={i} className="flex items-start gap-1.5 text-xs text-gray-300">
                    <ChevronRight className={`w-3 h-3 mt-0.5 ${color} shrink-0`} />
                    {item}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="text-xs text-gray-600 italic">—</p>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

function AddMentorModal({
  companyId, userId, onClose, onAdded,
}: {
  companyId: string;
  userId: string;
  onClose: () => void;
  onAdded: () => void;
}) {
  const [name, setName] = useState('');
  const [role, setRole] = useState('');
  const [company, setCompany] = useState('');
  const [linkedin, setLinkedin] = useState('');
  const [expertise, setExpertise] = useState('');
  const [availability, setAvailability] = useState('monthly');
  const [notes, setNotes] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!name.trim()) return;
    setSaving(true);
    await addMentor(companyId, userId, {
      name: name.trim(),
      role: role.trim() || null,
      company: company.trim() || null,
      linkedin: linkedin.trim() || null,
      expertise: expertise.split(',').map(s => s.trim()).filter(Boolean),
      availability,
      notes: notes.trim() || null,
    });
    setSaving(false);
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-lg rounded-2xl p-6" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Add Mentor</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Name *</label>
              <input value={name} onChange={e => setName(e.target.value)} placeholder="Kunal Shah"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: '#161618' }} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Role / Title</label>
              <input value={role} onChange={e => setRole(e.target.value)} placeholder="Founder & CEO"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: '#161618' }} />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Company / Fund</label>
              <input value={company} onChange={e => setCompany(e.target.value)} placeholder="CRED"
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: '#161618' }} />
            </div>
            <div>
              <label className="text-xs text-gray-500 mb-1 block">Availability</label>
              <select value={availability} onChange={e => setAvailability(e.target.value)}
                className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
                style={{ background: '#161618' }}>
                {['weekly','biweekly','monthly','quarterly'].map(a => <option key={a} value={a}>{a}</option>)}
              </select>
            </div>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Expertise (comma-separated)</label>
            <input value={expertise} onChange={e => setExpertise(e.target.value)} placeholder="Growth, Fintech, Fundraising"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: '#161618' }} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">LinkedIn URL</label>
            <input value={linkedin} onChange={e => setLinkedin(e.target.value)} placeholder="https://linkedin.com/in/..."
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none" style={{ background: '#161618' }} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Notes</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2}
              placeholder="How you know them, what they focus on..."
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none resize-none" style={{ background: '#161618' }} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 border border-white/5">Cancel</button>
          <button onClick={handleAdd} disabled={!name.trim() || saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #818cf8)', color: '#161618' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Plus className="w-4 h-4" />}
            {saving ? 'Adding…' : 'Add Mentor'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AddSessionModal({
  companyId, userId, mentors, onClose, onAdded,
}: {
  companyId: string;
  userId: string;
  mentors: VcMentor[];
  onClose: () => void;
  onAdded: () => void;
}) {
  const [mentorId, setMentorId] = useState(mentors[0]?.id ?? '');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [agenda, setAgenda] = useState('');
  const [saving, setSaving] = useState(false);

  async function handleAdd() {
    if (!mentorId || !date) return;
    setSaving(true);
    await addMentorSession(companyId, userId, {
      mentor_id: mentorId,
      session_date: date,
      status: 'scheduled',
      agenda: agenda.split('\n').map(s => s.trim()).filter(Boolean),
    });
    setSaving(false);
    onAdded();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4" style={{ background: 'rgba(0,0,0,0.7)' }}>
      <div className="w-full max-w-md rounded-2xl p-6" style={{ background: '#1B1B1D', border: '1px solid rgba(255,255,255,0.06)' }}>
        <div className="flex items-center justify-between mb-5">
          <h3 className="text-base font-semibold text-white">Schedule Session</h3>
          <button onClick={onClose} className="text-gray-500 hover:text-white"><X className="w-5 h-5" /></button>
        </div>
        <div className="space-y-4">
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Mentor</label>
            <select value={mentorId} onChange={e => setMentorId(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none appearance-none"
              style={{ background: '#161618' }}>
              {mentors.map(m => <option key={m.id} value={m.id}>{m.name}</option>)}
            </select>
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Session Date</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)}
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none"
              style={{ background: '#161618', colorScheme: 'dark' }} />
          </div>
          <div>
            <label className="text-xs text-gray-500 mb-1 block">Agenda (one item per line)</label>
            <textarea value={agenda} onChange={e => setAgenda(e.target.value)} rows={3}
              placeholder="Review fundraising strategy&#10;Get intro to Accel partner&#10;Pricing model feedback"
              className="w-full px-3 py-2.5 rounded-xl text-sm text-white outline-none resize-none"
              style={{ background: '#161618' }} />
          </div>
        </div>
        <div className="flex gap-3 mt-5">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl text-sm text-gray-400 border border-white/5">Cancel</button>
          <button onClick={handleAdd} disabled={saving}
            className="flex-1 py-2.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 disabled:opacity-40"
            style={{ background: 'linear-gradient(135deg, #22d3ee, #818cf8)', color: '#161618' }}>
            {saving ? <Loader className="w-4 h-4 animate-spin" /> : <Calendar className="w-4 h-4" />}
            {saving ? 'Scheduling…' : 'Schedule Session'}
          </button>
        </div>
      </div>
    </div>
  );
}
