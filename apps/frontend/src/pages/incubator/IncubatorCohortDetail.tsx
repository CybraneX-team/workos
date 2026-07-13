import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ArrowLeft, Plus, Trash2, X } from 'lucide-react';
import {
  useCohort,
  useCohortTracking,
  usePortfolio,
  updateCohort,
  deleteCohort,
  addCohortMembers,
  removeCohortMember,
  type Cohort,
} from '../../lib/db/incubator';
import {
  PageHeader,
  Card,
  PrimaryButton,
  SecondaryButton,
  DangerButton,
  TextInput,
  TextArea,
  Select,
  Label,
  StatusBadge,
  StageBadge,
  Avatar,
  StatTile,
  Spinner,
  EmptyState,
} from '../../components/incubator/ui';

type Tab = 'overview' | 'members' | 'tracking';

function AddMembersModal({
  cohortId,
  existingIds,
  onClose,
  onAdded,
}: {
  cohortId: string;
  existingIds: Set<string>;
  onClose: () => void;
  onAdded: () => void;
}) {
  const { companies, loading } = usePortfolio();
  const candidates = companies.filter((c) => !existingIds.has(c.id));
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleAdd() {
    if (selected.size === 0) return;
    setSaving(true);
    try {
      await addCohortMembers(cohortId, [...selected]);
      onAdded();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <Card className="w-full max-w-lg p-6 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">Add members</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X size={18} />
          </button>
        </div>
        {loading ? (
          <Spinner />
        ) : candidates.length === 0 ? (
          <p className="text-sm text-white/40">Every startup in your portfolio is already in this cohort.</p>
        ) : (
          <div className="overflow-y-auto space-y-1 flex-1">
            {candidates.map((c) => (
              <label key={c.id} className="flex items-center gap-2.5 px-2 py-1.5 rounded-lg hover:bg-white/[0.04] cursor-pointer">
                <input type="checkbox" checked={selected.has(c.id)} onChange={() => toggle(c.id)} />
                <Avatar name={c.name} size={22} />
                <span className="text-sm text-white flex-1">{c.name}</span>
                <StatusBadge status={c.status} />
              </label>
            ))}
          </div>
        )}
        <div className="flex justify-end gap-2 mt-4">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleAdd} disabled={saving || selected.size === 0}>
            {saving ? 'Adding…' : `Add ${selected.size || ''}`}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

function ProgressBar({ pct }: { pct: number }) {
  const clamped = Math.max(0, Math.min(100, pct));
  return (
    <div className="w-full h-1.5 rounded-full bg-white/10 overflow-hidden">
      <div className="h-full rounded-full" style={{ width: `${clamped}%`, background: '#a78bfa' }} />
    </div>
  );
}

export default function IncubatorCohortDetail() {
  const { cohortId } = useParams<{ cohortId: string }>();
  const navigate = useNavigate();
  const { cohort, loading, refresh } = useCohort(cohortId);
  const { tracking, loading: trackingLoading, refresh: refreshTracking } = useCohortTracking(cohortId);
  const [tab, setTab] = useState<Tab>('overview');
  const [showAddModal, setShowAddModal] = useState(false);

  const [editName, setEditName] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [editStatus, setEditStatus] = useState<Cohort['status'] | ''>('');
  const [savingOverview, setSavingOverview] = useState(false);

  function startEditing() {
    if (!cohort) return;
    setEditName(cohort.name);
    setEditDescription(cohort.description ?? '');
    setEditStatus(cohort.status);
  }

  if (loading || !cohort) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  async function handleSaveOverview() {
    if (!cohortId) return;
    setSavingOverview(true);
    try {
      await updateCohort(cohortId, {
        name: editName.trim() || undefined,
        description: editDescription,
        status: editStatus || undefined,
      });
      refresh();
    } finally {
      setSavingOverview(false);
    }
  }

  async function handleDelete() {
    if (!cohortId) return;
    if (!window.confirm(`Delete "${cohort!.name}"? This removes all cohort membership but not the startups themselves.`)) return;
    await deleteCohort(cohortId);
    navigate('/incubator/cohorts');
  }

  async function handleRemoveMember(companyId: string) {
    if (!cohortId) return;
    await removeCohortMember(cohortId, companyId);
    refresh();
    refreshTracking();
  }

  const existingIds = new Set(cohort.members.map((m) => m.companyId));

  return (
    <div className="p-8 max-w-5xl">
      <SecondaryButton onClick={() => navigate('/incubator/cohorts')} className="mb-4">
        <span className="inline-flex items-center gap-1.5">
          <ArrowLeft size={14} /> Back to cohorts
        </span>
      </SecondaryButton>

      <PageHeader title={cohort.name} description={`${cohort.memberCount} member${cohort.memberCount === 1 ? '' : 's'}`} actions={<StatusBadge status={cohort.status} />} />

      <div className="flex gap-1 mb-6 border-b border-white/10">
        {(['overview', 'members', 'tracking'] as Tab[]).map((t) => (
          <button
            key={t}
            onClick={() => {
              setTab(t);
              if (t === 'overview') startEditing();
            }}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              tab === t ? 'border-[#a78bfa] text-white' : 'border-transparent text-white/40 hover:text-white/70'
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {tab === 'overview' && (
        <Card className="p-5 max-w-xl space-y-4">
          <div>
            <Label>Name</Label>
            <TextInput value={editName || cohort.name} onChange={(e) => setEditName(e.target.value)} />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea rows={3} value={editDescription || cohort.description || ''} onChange={(e) => setEditDescription(e.target.value)} />
          </div>
          <div>
            <Label>Status</Label>
            <Select value={editStatus || cohort.status} onChange={(e) => setEditStatus(e.target.value as Cohort['status'])}>
              <option value="draft">Draft</option>
              <option value="active">Active</option>
              <option value="completed">Completed</option>
              <option value="archived">Archived</option>
            </Select>
          </div>
          <div className="flex items-center justify-between pt-2">
            <PrimaryButton onClick={handleSaveOverview} disabled={savingOverview}>
              {savingOverview ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
            <DangerButton onClick={handleDelete}>
              <span className="inline-flex items-center gap-1.5">
                <Trash2 size={13} /> Delete cohort
              </span>
            </DangerButton>
          </div>
        </Card>
      )}

      {tab === 'members' && (
        <>
          <div className="flex justify-end mb-3">
            <PrimaryButton onClick={() => setShowAddModal(true)}>
              <span className="inline-flex items-center gap-1.5">
                <Plus size={14} /> Add members
              </span>
            </PrimaryButton>
          </div>
          {cohort.members.length === 0 ? (
            <EmptyState title="No members yet" description="Add startups from your portfolio to this cohort." />
          ) : (
            <Card className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="text-left text-xs text-white/40 border-b border-white/10">
                    <th className="p-3 font-medium">Startup</th>
                    <th className="p-3 font-medium">Status</th>
                    <th className="p-3 font-medium">Stage</th>
                    <th className="p-3 font-medium">Joined</th>
                    <th className="p-3 font-medium"></th>
                  </tr>
                </thead>
                <tbody>
                  {cohort.members.map((m) => (
                    <tr key={m.companyId} className="border-b border-white/5">
                      <td
                        className="p-3 text-white font-medium cursor-pointer hover:underline"
                        onClick={() => navigate(`/incubator/portfolio/${m.companyId}`)}
                      >
                        <span className="inline-flex items-center gap-2.5">
                          <Avatar name={m.company?.name ?? m.companyId} size={24} />
                          {m.company?.name ?? m.companyId}
                        </span>
                      </td>
                      <td className="p-3">
                        <StatusBadge status={m.company?.kind === 'active' ? 'claimed' : 'provisional'} />
                      </td>
                      <td className="p-3 text-white/60">{m.company?.stage && <StageBadge stage={m.company.stage} />}</td>
                      <td className="p-3 text-white/40">{new Date(m.joinedAt).toLocaleDateString()}</td>
                      <td className="p-3">
                        <SecondaryButton onClick={() => handleRemoveMember(m.companyId)}>Remove</SecondaryButton>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </Card>
          )}
        </>
      )}

      {tab === 'tracking' &&
        (trackingLoading || !tracking ? (
          <div className="p-10 flex justify-center">
            <Spinner />
          </div>
        ) : (
          <div className="space-y-6">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              <StatTile label="Members" value={tracking.aggregate.memberCount} hint={`${tracking.aggregate.claimedCount} claimed · ${tracking.aggregate.provisionalCount} provisional`} />
              <StatTile label="Combined MRR" value={`$${tracking.aggregate.totalMrrUsd.toLocaleString()}`} />
              <StatTile label="Combined ARR" value={`$${tracking.aggregate.totalAnnualRevenue.toLocaleString()}`} />
              <StatTile label="Total headcount" value={tracking.aggregate.totalEmployees} />
            </div>

            {Object.keys(tracking.byStage).length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white/70 mb-3">By stage</h3>
                <div className="space-y-2">
                  {Object.entries(tracking.byStage).map(([stage, count]) => (
                    <div key={stage} className="flex items-center gap-3 text-sm">
                      <span className="w-28 text-white/60 shrink-0">{stage}</span>
                      <div className="flex-1">
                        <ProgressBar pct={(count / tracking.aggregate.memberCount) * 100} />
                      </div>
                      <span className="w-6 text-right text-white/40">{count}</span>
                    </div>
                  ))}
                </div>
              </Card>
            )}

            {tracking.goalsProgress.length > 0 && (
              <Card className="p-5">
                <h3 className="text-sm font-semibold text-white/70 mb-3">Goals</h3>
                <div className="space-y-4">
                  {tracking.goalsProgress.map((g, i) => (
                    <div key={i}>
                      <div className="flex justify-between text-sm mb-1">
                        <span className="text-white">{g.label}</span>
                        <span className="text-white/40">
                          {g.actual !== null ? `${g.actual.toLocaleString()} / ${g.target.toLocaleString()}` : 'not trackable yet'}
                        </span>
                      </div>
                      {g.progressPct !== null ? (
                        <ProgressBar pct={g.progressPct} />
                      ) : (
                        <p className="text-xs text-white/30">{g.note}</p>
                      )}
                    </div>
                  ))}
                </div>
              </Card>
            )}
          </div>
        ))}

      {showAddModal && cohortId && (
        <AddMembersModal
          cohortId={cohortId}
          existingIds={existingIds}
          onClose={() => setShowAddModal(false)}
          onAdded={() => {
            setShowAddModal(false);
            refresh();
            refreshTracking();
          }}
        />
      )}
    </div>
  );
}
