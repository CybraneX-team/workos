import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Plus, X } from 'lucide-react';
import { useCohorts, createCohort } from '../../lib/db/incubator';
import { PageHeader, Card, PrimaryButton, SecondaryButton, TextInput, TextArea, Label, StatusBadge, Spinner, EmptyState } from '../../components/incubator/ui';

function NewCohortModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id: string) => void }) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [startsOn, setStartsOn] = useState('');
  const [endsOn, setEndsOn] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleCreate() {
    if (!name.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const cohort = await createCohort({
        name: name.trim(),
        description: description.trim() || undefined,
        startsOn: startsOn || null,
        endsOn: endsOn || null,
      });
      onCreated(cohort.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-6" onClick={onClose}>
      <Card className="w-full max-w-md p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-base font-bold text-white">New cohort</h3>
          <button onClick={onClose} className="text-white/40 hover:text-white/70">
            <X size={18} />
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <Label>Name</Label>
            <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Fall 2026" autoFocus />
          </div>
          <div>
            <Label>Description</Label>
            <TextArea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Starts on</Label>
              <TextInput type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} />
            </div>
            <div>
              <Label>Ends on</Label>
              <TextInput type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} />
            </div>
          </div>
        </div>
        {error && <p className="text-sm text-red-400 mt-3">{error}</p>}
        <div className="flex justify-end gap-2 mt-5">
          <SecondaryButton onClick={onClose}>Cancel</SecondaryButton>
          <PrimaryButton onClick={handleCreate} disabled={saving || !name.trim()}>
            {saving ? 'Creating…' : 'Create cohort'}
          </PrimaryButton>
        </div>
      </Card>
    </div>
  );
}

export default function IncubatorCohorts() {
  const navigate = useNavigate();
  const { cohorts, loading, refresh } = useCohorts();
  const [showModal, setShowModal] = useState(false);

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader
        title="Cohorts"
        description={`${cohorts.length} cohort${cohorts.length === 1 ? '' : 's'}`}
        actions={
          <PrimaryButton onClick={() => setShowModal(true)}>
            <span className="inline-flex items-center gap-1.5">
              <Plus size={14} /> New cohort
            </span>
          </PrimaryButton>
        }
      />

      {loading ? (
        <div className="p-10 flex justify-center">
          <Spinner />
        </div>
      ) : cohorts.length === 0 ? (
        <EmptyState
          title="No cohorts yet"
          description="Group startups into a cohort to track shared goals and progress."
          action={<PrimaryButton onClick={() => setShowModal(true)}>New cohort</PrimaryButton>}
        />
      ) : (
        <div className="grid md:grid-cols-3 gap-4">
          {cohorts.map((c) => (
            <Card
              key={c.id}
              className="p-5 cursor-pointer hover:border-white/20 transition-colors"
              onClick={() => navigate(`/incubator/cohorts/${c.id}`)}
            >
              <div className="flex items-start justify-between mb-2">
                <h3 className="text-white font-semibold">{c.name}</h3>
                <StatusBadge status={c.status} />
              </div>
              {c.description && <p className="text-xs text-white/40 mb-3 line-clamp-2">{c.description}</p>}
              <p className="text-sm text-white/50">
                {c.memberCount} member{c.memberCount === 1 ? '' : 's'}
              </p>
              {(c.starts_on || c.ends_on) && (
                <p className="text-xs text-white/30 mt-1">
                  {c.starts_on ? new Date(c.starts_on).toLocaleDateString() : '—'} –{' '}
                  {c.ends_on ? new Date(c.ends_on).toLocaleDateString() : '—'}
                </p>
              )}
            </Card>
          ))}
        </div>
      )}

      {showModal && (
        <NewCohortModal
          onClose={() => setShowModal(false)}
          onCreated={(id) => {
            setShowModal(false);
            refresh();
            navigate(`/incubator/cohorts/${id}`);
          }}
        />
      )}
    </div>
  );
}
