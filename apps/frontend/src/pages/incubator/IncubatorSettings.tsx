import { useEffect, useState } from 'react';
import { useIncubatorMe, updateIncubator, COMPANY_STAGE_OPTIONS, type ProgramType } from '../../lib/db/incubator';
import { INDUSTRIES } from '../../db/industries';
import { PageHeader, Card, PrimaryButton, TextInput, TextArea, Select, Label, Spinner } from '../../components/incubator/ui';

const PROGRAM_TYPES: { value: ProgramType; label: string }[] = [
  { value: 'accelerator', label: 'Accelerator' },
  { value: 'incubator', label: 'Incubator' },
  { value: 'studio', label: 'Studio' },
  { value: 'university', label: 'University' },
  { value: 'corporate', label: 'Corporate' },
];

function ChipToggle({ label, selected, onToggle }: { label: string; selected: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition-colors ${
        selected ? 'border-[#a78bfa] bg-[#a78bfa]/15 text-[#c4b5fd]' : 'border-white/10 text-white/50 hover:border-white/25'
      }`}
    >
      {label}
    </button>
  );
}

export default function IncubatorSettings() {
  const { incubator, loading, refresh } = useIncubatorMe();
  const [form, setForm] = useState<Record<string, any>>({});
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!incubator) return;
    setForm({
      name: incubator.name,
      legal_name: incubator.legal_name ?? '',
      website: incubator.website ?? '',
      hq_country: incubator.hq_country ?? '',
      hq_city: incubator.hq_city ?? '',
      program_type: incubator.program_type ?? '',
      focus_sectors: incubator.focus_sectors,
      focus_stages: incubator.focus_stages,
      typical_cohort_size: incubator.typical_cohort_size ? String(incubator.typical_cohort_size) : '',
      program_length_weeks: incubator.program_length_weeks ? String(incubator.program_length_weeks) : '',
      description: incubator.description ?? '',
    });
  }, [incubator]);

  if (loading || !incubator) {
    return (
      <div className="p-8 flex justify-center">
        <Spinner />
      </div>
    );
  }

  function toggleSector(label: string) {
    setForm((f) => ({
      ...f,
      focus_sectors: f.focus_sectors.includes(label) ? f.focus_sectors.filter((s: string) => s !== label) : [...f.focus_sectors, label],
    }));
  }

  function toggleStage(stage: string) {
    setForm((f) => ({
      ...f,
      focus_stages: f.focus_stages.includes(stage) ? f.focus_stages.filter((s: string) => s !== stage) : [...f.focus_stages, stage],
    }));
  }

  async function handleSave() {
    setSaving(true);
    setMessage(null);
    try {
      await updateIncubator({
        name: form.name.trim(),
        legal_name: form.legal_name.trim() || undefined,
        website: form.website.trim() || undefined,
        hq_country: form.hq_country.trim(),
        hq_city: form.hq_city.trim() || undefined,
        program_type: form.program_type || undefined,
        focus_sectors: form.focus_sectors,
        focus_stages: form.focus_stages,
        typical_cohort_size: form.typical_cohort_size ? Number(form.typical_cohort_size) : undefined,
        program_length_weeks: form.program_length_weeks ? Number(form.program_length_weeks) : undefined,
        description: form.description.trim() || undefined,
      });
      setMessage('Saved');
      refresh();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="p-8 max-w-2xl">
      <PageHeader title="Settings" description="Your program's profile." />

      <Card className="p-6 space-y-5">
        <div className="grid grid-cols-2 gap-4">
          <div>
            <Label>Program name</Label>
            <TextInput value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
          </div>
          <div>
            <Label>Legal name</Label>
            <TextInput value={form.legal_name ?? ''} onChange={(e) => setForm((f) => ({ ...f, legal_name: e.target.value }))} />
          </div>
          <div>
            <Label>Website</Label>
            <TextInput value={form.website ?? ''} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
          </div>
          <div>
            <Label>Program type</Label>
            <Select value={form.program_type ?? ''} onChange={(e) => setForm((f) => ({ ...f, program_type: e.target.value }))}>
              <option value="">—</option>
              {PROGRAM_TYPES.map((pt) => (
                <option key={pt.value} value={pt.value}>
                  {pt.label}
                </option>
              ))}
            </Select>
          </div>
          <div>
            <Label>HQ country</Label>
            <TextInput value={form.hq_country ?? ''} onChange={(e) => setForm((f) => ({ ...f, hq_country: e.target.value }))} />
          </div>
          <div>
            <Label>HQ city</Label>
            <TextInput value={form.hq_city ?? ''} onChange={(e) => setForm((f) => ({ ...f, hq_city: e.target.value }))} />
          </div>
          <div>
            <Label>Typical cohort size</Label>
            <TextInput
              type="number"
              min={0}
              value={form.typical_cohort_size ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, typical_cohort_size: e.target.value }))}
            />
          </div>
          <div>
            <Label>Program length (weeks)</Label>
            <TextInput
              type="number"
              min={0}
              value={form.program_length_weeks ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, program_length_weeks: e.target.value }))}
            />
          </div>
        </div>

        <div>
          <Label>Description</Label>
          <TextArea rows={3} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
        </div>

        <div>
          <Label>Focus sectors</Label>
          <div className="flex flex-wrap gap-2">
            {INDUSTRIES.map((ind) => (
              <ChipToggle key={ind.id} label={ind.label} selected={(form.focus_sectors ?? []).includes(ind.label)} onToggle={() => toggleSector(ind.label)} />
            ))}
          </div>
        </div>

        <div>
          <Label>Focus stages</Label>
          <div className="flex flex-wrap gap-2">
            {COMPANY_STAGE_OPTIONS.map((stage) => (
              <ChipToggle key={stage} label={stage} selected={(form.focus_stages ?? []).includes(stage)} onToggle={() => toggleStage(stage)} />
            ))}
          </div>
        </div>

        <div className="flex items-center gap-3 pt-2">
          <PrimaryButton onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : 'Save changes'}
          </PrimaryButton>
          {message && <span className="text-xs text-white/40">{message}</span>}
        </div>
      </Card>
    </div>
  );
}
