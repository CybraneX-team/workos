import { useEffect, useMemo, useState } from 'react';
import { Search, X, MapPin, Users, Globe, Send } from 'lucide-react';
import {
  useDiscoverCompanies,
  connectToCompany,
  COMPANY_STAGE_ENUM,
  type DiscoverCompany,
} from '../../lib/db/incubator';
import {
  PageHeader,
  Card,
  GlassModal,
  PrimaryButton,
  Select,
  TextInput,
  StageBadge,
  Avatar,
  Spinner,
  EmptyState,
} from '../../components/incubator/ui';

const CONNECT_LABELS: Record<string, string> = {
  none: 'Connect',
  pending: 'Request sent',
  accepted: 'Connected',
  declined: 'Request again',
};

function CompanyModal({
  company,
  onClose,
  onConnect,
  connecting,
}: {
  company: DiscoverCompany;
  onClose: () => void;
  onConnect: () => void;
  connecting: boolean;
}) {
  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  const canConnect = company.connection_status === 'none' || company.connection_status === 'declined';

  return (
    <GlassModal onClose={onClose} className="max-w-lg max-h-[80vh] overflow-y-auto">
      <div className="flex items-start gap-3 p-5 border-b border-white/[0.06]">
        <Avatar name={company.name} size={44} />
        <div className="flex-1 min-w-0">
          <h2 className="text-base font-semibold text-white truncate">{company.name}</h2>
          <div className="flex items-center gap-2 flex-wrap mt-1.5">
            <StageBadge stage={company.stage_label ?? company.stage} />
            {company.sector && <span className="text-xs text-white/35">{company.sector}</span>}
          </div>
        </div>
        <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 shrink-0">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="p-5 flex flex-col gap-4">
        <div className="flex items-center gap-3 text-xs text-white/40">
          <span className="flex items-center gap-1">
            <MapPin className="w-3 h-3" />
            {company.country}
          </span>
          {company.founded_year && <span>· Est. {company.founded_year}</span>}
          {company.website && (
            <a href={company.website} target="_blank" rel="noreferrer" className="flex items-center gap-1 text-[#a78bfa] hover:underline">
              <Globe className="w-3 h-3" /> Website
            </a>
          )}
        </div>

        {company.description && <p className="text-sm leading-relaxed text-white/60">{company.description}</p>}

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {[
            { label: 'Team', value: company.employees ? String(company.employees) : '—' },
            { label: 'Founded', value: company.founded_year ? String(company.founded_year) : '—' },
            { label: 'Sector', value: company.sector ?? '—' },
            { label: 'Country', value: company.country ?? '—' },
          ].map(({ label, value }) => (
            <div key={label} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
              <div className="text-[9px] uppercase tracking-wide text-white/25 mb-1">{label}</div>
              <div className="text-sm font-semibold text-white truncate">{value}</div>
            </div>
          ))}
        </div>
      </div>

      <div className="p-5 border-t border-white/[0.06]">
        <PrimaryButton onClick={onConnect} disabled={!canConnect || connecting} className="w-full">
          <span className="inline-flex items-center justify-center gap-1.5">
            <Send size={13} /> {connecting ? 'Sending…' : CONNECT_LABELS[company.connection_status]}
          </span>
        </PrimaryButton>
      </div>
    </GlassModal>
  );
}

function DiscoverRow({ company, onSelect }: { company: DiscoverCompany; onSelect: () => void }) {
  return (
    <div
      onClick={onSelect}
      className="flex items-center gap-4 px-4 py-3 cursor-pointer group transition-colors hover:bg-white/[0.025] border-b border-white/[0.05] last:border-b-0"
    >
      <Avatar name={company.name} size={32} />
      <div className="flex-1 min-w-0">
        <span className="text-sm font-medium text-white truncate block">{company.name}</span>
        <div className="flex items-center gap-2 mt-0.5 text-[11px] text-white/35">
          <span>{company.sector ?? '—'}</span>
          <span className="text-white/15">·</span>
          <span>{company.country}</span>
        </div>
      </div>
      <div className="hidden sm:block shrink-0">
        <StageBadge stage={company.stage_label ?? company.stage} />
      </div>
      <div className="hidden md:flex items-center gap-1 shrink-0 w-16 text-xs text-white/35">
        {company.employees ? (
          <>
            <Users className="w-3 h-3" />
            {company.employees}
          </>
        ) : (
          <span className="text-white/15">—</span>
        )}
      </div>
      <span
        className={`text-[10px] font-medium px-2 py-1 rounded-full shrink-0 ${
          company.connection_status === 'accepted'
            ? 'bg-emerald-500/15 text-emerald-300'
            : company.connection_status === 'pending'
              ? 'bg-amber-500/15 text-amber-300'
              : 'bg-white/[0.06] text-white/40 group-hover:text-white/60'
        }`}
      >
        {CONNECT_LABELS[company.connection_status]}
      </span>
    </div>
  );
}

export default function IncubatorDiscover() {
  const [search, setSearch] = useState('');
  const [stage, setStage] = useState('');
  const [sector, setSector] = useState('');
  const [selected, setSelected] = useState<DiscoverCompany | null>(null);
  const [connecting, setConnecting] = useState(false);

  const { companies, total, loading, refresh } = useDiscoverCompanies({ search: search || undefined, stage: stage || undefined });

  const sectorCounts = useMemo(() => {
    const map = new Map<string, number>();
    for (const c of companies) {
      if (!c.sector) continue;
      map.set(c.sector, (map.get(c.sector) ?? 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[1] - a[1]);
  }, [companies]);

  const filtered = useMemo(() => (sector ? companies.filter((c) => c.sector === sector) : companies), [companies, sector]);

  const connectedCount = useMemo(() => companies.filter((c) => c.connection_status === 'accepted').length, [companies]);
  const hasFilters = !!(search || stage || sector);

  async function handleConnect(companyId: string) {
    setConnecting(true);
    try {
      await connectToCompany(companyId);
      await refresh();
      setSelected((prev) => (prev && prev.id === companyId ? { ...prev, connection_status: 'pending' } : prev));
    } finally {
      setConnecting(false);
    }
  }

  return (
    <div className="p-8 max-w-6xl">
      <PageHeader
        title="Discover"
        description={`${total} ${total === 1 ? 'company' : 'companies'} · ${sectorCounts.length} sectors · ${connectedCount} connected`}
      />

      <div className="flex flex-wrap gap-2 mb-4">
        <div className="relative flex-1 min-w-[220px]">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-white/30" />
          <TextInput value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search startups…" className="pl-8" />
        </div>
        <Select value={stage} onChange={(e) => setStage(e.target.value)} className="w-40">
          <option value="">All stages</option>
          {COMPANY_STAGE_ENUM.map((s) => (
            <option key={s} value={s}>
              {s}
            </option>
          ))}
        </Select>
        {hasFilters && (
          <button
            onClick={() => {
              setSearch('');
              setStage('');
              setSector('');
            }}
            className="flex items-center gap-1.5 px-3 py-2 rounded-xl text-sm text-white/40 border border-white/[0.08] hover:bg-white/[0.04] hover:text-white/60 transition-colors"
          >
            <X className="w-3.5 h-3.5" /> Clear
          </button>
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

      {loading ? (
        <div className="p-10 flex justify-center">
          <Spinner />
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState title="No startups found" description="Try a different search or clear your filters." />
      ) : (
        <Card className="overflow-hidden">
          <div className="flex items-center gap-4 px-4 py-2.5 border-b border-white/[0.06] bg-white/[0.015]">
            <div className="w-8 shrink-0" />
            <div className="flex-1 text-[10px] uppercase tracking-widest text-white/25">Company</div>
            <div className="hidden sm:block shrink-0 text-[10px] uppercase tracking-widest text-white/25">Stage</div>
            <div className="hidden md:block shrink-0 w-16 text-[10px] uppercase tracking-widest text-white/25">Team</div>
            <div className="shrink-0 w-24 text-[10px] uppercase tracking-widest text-white/25 text-right">Status</div>
          </div>
          {filtered.map((c) => (
            <DiscoverRow key={c.id} company={c} onSelect={() => setSelected(c)} />
          ))}
        </Card>
      )}

      {selected && (
        <CompanyModal
          company={selected}
          onClose={() => setSelected(null)}
          onConnect={() => handleConnect(selected.id)}
          connecting={connecting}
        />
      )}
    </div>
  );
}
