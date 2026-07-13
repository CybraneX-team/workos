import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Search, Mail, UploadCloud, ChevronRight, Building2, DollarSign, Users, Globe } from 'lucide-react';
import { usePortfolio, useCohorts, sendInvites, type PortfolioStatus, type PortfolioCompany } from '../../lib/db/incubator';
import {
  PageHeader,
  Card,
  PrimaryButton,
  SecondaryButton,
  Select,
  TextInput,
  StatusBadge,
  StageBadge,
  STAGE_COLORS,
  Avatar,
  Spinner,
  EmptyState,
  StatTile,
  fmt,
} from '../../components/incubator/ui';
import PortfolioDetailModal from '../../components/incubator/PortfolioDetailModal';

const STATUS_OPTIONS: { value: PortfolioStatus | ''; label: string }[] = [
  { value: '', label: 'All statuses' },
  { value: 'provisional', label: 'Provisional' },
  { value: 'invited', label: 'Invited' },
  { value: 'claimed', label: 'Claimed' },
];

function PortfolioRow({
  company,
  selectable,
  selected,
  onToggleSelected,
  onSelect,
}: {
  company: PortfolioCompany;
  selectable: boolean;
  selected: boolean;
  onToggleSelected: () => void;
  onSelect: () => void;
}) {
  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-3 px-4 py-3 cursor-pointer group transition-colors hover:bg-white/[0.025] border-b border-white/[0.05] last:border-b-0"
    >
      <div className="w-4 shrink-0" onClick={(e) => e.stopPropagation()}>
        {selectable && <input type="checkbox" checked={selected} onChange={onToggleSelected} />}
      </div>

      <Avatar name={company.name} size={32} />

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2">
          <span className="text-sm font-medium text-white truncate">{company.name}</span>
        </div>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/35">
          <span>{company.sector ?? company.industry_id ?? '—'}</span>
          <span className="text-white/15">·</span>
          <span>{company.country}</span>
        </div>
      </div>

      <div className="hidden sm:block shrink-0">
        <StageBadge stage={company.stage_label ?? company.stage} />
      </div>

      <div className="hidden md:block shrink-0 w-16 text-xs text-white/50 text-right">
        {company.mrr_usd ? fmt(company.mrr_usd) : <span className="text-white/15">—</span>}
      </div>

      <div className="hidden lg:block shrink-0 w-14 text-xs text-white/50 text-right">
        {company.employees ? company.employees.toLocaleString() : <span className="text-white/15">—</span>}
      </div>

      <div className="hidden xl:block shrink-0 w-24 text-xs text-white/40 truncate">
        {company.cohorts.map((c) => c.name).join(', ') || '—'}
      </div>

      <div className="shrink-0">
        <StatusBadge status={company.status} />
      </div>

      <ChevronRight className="w-3.5 h-3.5 shrink-0 text-white/0 group-hover:text-white/30 transition-colors" />
    </div>
  );
}

export default function IncubatorPortfolio() {
  const navigate = useNavigate();
  const [status, setStatus] = useState<PortfolioStatus | ''>('');
  const [cohortId, setCohortId] = useState('');
  const [search, setSearch] = useState('');
  const [sector, setSector] = useState('');
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [sending, setSending] = useState(false);
  const [sendSummary, setSendSummary] = useState<string | null>(null);
  const [openCompanyId, setOpenCompanyId] = useState<string | null>(null);

  const { cohorts } = useCohorts();
  const { companies, loading, refresh } = usePortfolio({
    status: status || undefined,
    cohortId: cohortId || undefined,
    search: search || undefined,
  });

  const totalMRR = useMemo(() => companies.reduce((s, c) => s + (c.mrr_usd ?? 0), 0), [companies]);
  const totalTeam = useMemo(() => companies.reduce((s, c) => s + (c.employees ?? 0), 0), [companies]);
  const countryCount = useMemo(() => new Set(companies.map((c) => c.country).filter(Boolean)).size, [companies]);
  const stageBreakdown = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of companies) {
      const key = c.stage_label || c.stage;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()];
  }, [companies]);

  const sectorCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of companies) {
      const key = c.sector?.trim();
      if (!key) continue;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [companies]);

  const filtered = useMemo(() => (sector ? companies.filter((c) => c.sector === sector) : companies), [companies, sector]);

  function toggleSelected(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  const selectableIds = filtered.filter((c) => c.status !== 'claimed').map((c) => c.id);
  const allSelectableSelected = selectableIds.length > 0 && selectableIds.every((id) => selected.has(id));

  async function handleBulkInvite() {
    if (selected.size === 0) return;
    setSending(true);
    setSendSummary(null);
    try {
      const { results } = await sendInvites({ companyIds: [...selected] });
      const sent = results.filter((r) => r.result === 'sent').length;
      const rest = results.length - sent;
      setSendSummary(`${sent} invite${sent === 1 ? '' : 's'} sent${rest > 0 ? `, ${rest} skipped (see Invites page)` : ''}.`);
      setSelected(new Set());
      refresh();
    } catch (err) {
      setSendSummary(err instanceof Error ? err.message : String(err));
    } finally {
      setSending(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Portfolio"
        description={`${companies.length} startup${companies.length === 1 ? '' : 's'}`}
        actions={
          <PrimaryButton onClick={() => navigate('/incubator/import')}>
            <span className="inline-flex items-center gap-1.5">
              <UploadCloud size={14} /> Import roster
            </span>
          </PrimaryButton>
        }
      />

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
        <StatTile icon={Building2} color="#a78bfa" label="Companies" value={companies.length} />
        <StatTile icon={DollarSign} color="#22d3ee" label="Total MRR" value={fmt(totalMRR)} />
        <StatTile icon={Users} color="#34d399" label="Total Team" value={totalTeam.toLocaleString()} />
        <StatTile icon={Globe} color="#fbbf24" label="Countries" value={countryCount} />
      </div>

      {stageBreakdown.length > 1 && (
        <Card className="p-4 mb-4">
          <p className="text-[10px] uppercase tracking-wide text-white/30 mb-3">Stage distribution</p>
          <div className="flex flex-wrap gap-2">
            {stageBreakdown.map(([stage, count]) => {
              const color = STAGE_COLORS[stage] ?? '#8a8a9a';
              return (
                <div
                  key={stage}
                  className="flex items-center gap-2 px-3 py-1.5 rounded-full"
                  style={{ background: `${color}12`, border: `1px solid ${color}25` }}
                >
                  <span className="w-2 h-2 rounded-full" style={{ background: color }} />
                  <span className="text-xs font-medium" style={{ color }}>{stage}</span>
                  <span className="text-xs text-white/30">×{count}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex flex-wrap items-center gap-3 mb-4">
        <div className="relative w-56">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search by name" className="pl-8" />
        </div>
        <Select value={status} onChange={(e) => setStatus(e.target.value as PortfolioStatus | '')} className="w-40">
          {STATUS_OPTIONS.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </Select>
        <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className="w-48">
          <option value="">All cohorts</option>
          {cohorts.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </Select>

        {selected.size > 0 && (
          <div className="ml-auto flex items-center gap-2">
            <span className="text-xs text-white/40">{selected.size} selected</span>
            <SecondaryButton onClick={handleBulkInvite} disabled={sending}>
              <span className="inline-flex items-center gap-1.5">
                <Mail size={13} /> {sending ? 'Sending…' : 'Send invites'}
              </span>
            </SecondaryButton>
          </div>
        )}
      </div>

      {sectorCounts.length > 1 && (
        <div className="flex gap-2 overflow-x-auto pb-1 mb-4" style={{ scrollbarWidth: 'none' }}>
          <button
            onClick={() => setSector('')}
            className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
              !sector ? 'bg-white/[0.08] text-white border-white/15' : 'bg-transparent text-white/40 border-transparent hover:text-white/60'
            }`}
          >
            All <span className="text-white/30 ml-1">{companies.length}</span>
          </button>
          {sectorCounts.map(([label, count]) => {
            const active = sector === label;
            return (
              <button
                key={label}
                onClick={() => setSector(active ? '' : label)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-all shrink-0 border ${
                  active ? 'bg-[#a78bfa]/15 text-[#c4b5fd] border-[#a78bfa]/30' : 'bg-transparent text-white/40 border-transparent hover:text-white/60'
                }`}
              >
                {label} <span className={active ? 'text-[#c4b5fd]/60 ml-1' : 'text-white/25 ml-1'}>{count}</span>
              </button>
            );
          })}
        </div>
      )}

      {sendSummary && <p className="text-xs text-white/50 mb-3">{sendSummary}</p>}

      {loading ? (
        <div className="p-10 flex justify-center">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No startups match"
          description="Try clearing filters, or import a roster to add startups."
          action={<PrimaryButton onClick={() => navigate('/incubator/import')}>Import roster</PrimaryButton>}
        />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-3 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
            <div className="w-4 shrink-0">
              <input
                type="checkbox"
                checked={allSelectableSelected}
                onChange={(e) => setSelected(e.target.checked ? new Set(selectableIds) : new Set())}
              />
            </div>
            <div className="w-8 shrink-0" />
            <div className="flex-1 text-[10px] uppercase tracking-widest text-white/25">Company</div>
            <div className="hidden sm:block shrink-0 text-[10px] uppercase tracking-widest text-white/25">Stage</div>
            <div className="hidden md:block shrink-0 w-16 text-[10px] uppercase tracking-widest text-white/25 text-right">MRR</div>
            <div className="hidden lg:block shrink-0 w-14 text-[10px] uppercase tracking-widest text-white/25 text-right">Team</div>
            <div className="hidden xl:block shrink-0 w-24 text-[10px] uppercase tracking-widest text-white/25">Cohorts</div>
            <div className="shrink-0 text-[10px] uppercase tracking-widest text-white/25">Status</div>
            <div className="w-3.5 shrink-0" />
          </div>
          {filtered.map((c) => (
            <PortfolioRow
              key={c.id}
              company={c}
              selectable={c.status !== 'claimed'}
              selected={selected.has(c.id)}
              onToggleSelected={() => toggleSelected(c.id)}
              onSelect={() => setOpenCompanyId(c.id)}
            />
          ))}
        </Card>
      )}

      <PortfolioDetailModal
        companyId={openCompanyId}
        onClose={() => setOpenCompanyId(null)}
        onUpdated={refresh}
      />
    </div>
  );
}
