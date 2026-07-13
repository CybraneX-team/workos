import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2 } from 'lucide-react';
import { useIncubatorMe, createIncubator, COMPANY_STAGE_OPTIONS, type ProgramType } from '../../lib/db/incubator';
import { INDUSTRIES } from '../../db/industries';
import { PrimaryButton, SecondaryButton, TextInput, Label, Card, Spinner } from '../../components/incubator/ui';

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

export default function IncubatorOnboarding() {
  const navigate = useNavigate();
  const { incubator, loading, notOnboarded } = useIncubatorMe();
  const [step, setStep] = useState(1);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [name, setName] = useState('');
  const [legalName, setLegalName] = useState('');
  const [website, setWebsite] = useState('');
  const [programType, setProgramType] = useState<ProgramType | ''>('');
  const [hqCountry, setHqCountry] = useState('');
  const [hqCity, setHqCity] = useState('');
  const [focusSectors, setFocusSectors] = useState<string[]>([]);
  const [focusStages, setFocusStages] = useState<string[]>([]);
  const [typicalCohortSize, setTypicalCohortSize] = useState('');
  const [programLengthWeeks, setProgramLengthWeeks] = useState('');

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#0c0c10' }}>
        <Spinner size={28} />
      </div>
    );
  }

  if (!notOnboarded && incubator) {
    navigate('/incubator/dashboard', { replace: true });
    return null;
  }

  function toggle(list: string[], setList: (v: string[]) => void, value: string) {
    setList(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);
  }

  const step1Valid = name.trim().length > 0 && !!programType && hqCountry.trim().length > 0;

  async function handleSubmit() {
    if (!step1Valid || !programType) return;
    setSubmitting(true);
    setError(null);
    try {
      await createIncubator({
        name: name.trim(),
        legal_name: legalName.trim() || undefined,
        website: website.trim() || undefined,
        hq_country: hqCountry.trim(),
        hq_city: hqCity.trim() || undefined,
        program_type: programType,
        focus_sectors: focusSectors,
        focus_stages: focusStages,
        typical_cohort_size: typicalCohortSize ? Number(typicalCohortSize) : undefined,
        program_length_weeks: programLengthWeeks ? Number(programLengthWeeks) : undefined,
      });
      navigate('/incubator/dashboard', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-6 py-12" style={{ background: '#0c0c10' }}>
      <div className="w-full max-w-xl">
        <div className="flex items-center gap-3 mb-8">
          <div
            className="w-10 h-10 rounded-xl flex items-center justify-center"
            style={{ background: 'rgba(167,139,250,0.12)', border: '1px solid rgba(167,139,250,0.28)' }}
          >
            <Building2 size={18} style={{ color: '#a78bfa' }} />
          </div>
          <div>
            <p className="text-sm font-bold text-white">WorkOS</p>
            <p className="text-xs text-white/40">Incubator Portal</p>
          </div>
        </div>

        <Card className="p-8">
          <div className="flex items-center gap-2 mb-6">
            {[1, 2, 3].map((n) => (
              <div key={n} className={`h-1 flex-1 rounded-full ${n <= step ? 'bg-[#a78bfa]' : 'bg-white/10'}`} />
            ))}
          </div>

          {step === 1 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Tell us about your program</h2>
              <p className="text-sm text-white/40 mb-6">The essentials — everything else is editable later in Settings.</p>

              <div className="space-y-4">
                <div>
                  <Label>Program name *</Label>
                  <TextInput value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Nimbus Accelerator" />
                </div>
                <div>
                  <Label>Legal name</Label>
                  <TextInput value={legalName} onChange={(e) => setLegalName(e.target.value)} placeholder="Optional" />
                </div>
                <div>
                  <Label>Website</Label>
                  <TextInput value={website} onChange={(e) => setWebsite(e.target.value)} placeholder="https://" />
                </div>
                <div>
                  <Label>Program type *</Label>
                  <div className="flex flex-wrap gap-2">
                    {PROGRAM_TYPES.map((pt) => (
                      <ChipToggle
                        key={pt.value}
                        label={pt.label}
                        selected={programType === pt.value}
                        onToggle={() => setProgramType(pt.value)}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>HQ country *</Label>
                    <TextInput value={hqCountry} onChange={(e) => setHqCountry(e.target.value)} placeholder="India" />
                  </div>
                  <div>
                    <Label>HQ city</Label>
                    <TextInput value={hqCity} onChange={(e) => setHqCity(e.target.value)} placeholder="Optional" />
                  </div>
                </div>
              </div>

              <div className="flex justify-end mt-8">
                <PrimaryButton disabled={!step1Valid} onClick={() => setStep(2)}>
                  Continue
                </PrimaryButton>
              </div>
            </>
          )}

          {step === 2 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Program shape</h2>
              <p className="text-sm text-white/40 mb-6">Drives cohort defaults and benchmarking — pick as many as apply.</p>

              <div className="space-y-5">
                <div>
                  <Label>Focus sectors</Label>
                  <div className="flex flex-wrap gap-2">
                    {INDUSTRIES.map((ind) => (
                      <ChipToggle
                        key={ind.id}
                        label={ind.label}
                        selected={focusSectors.includes(ind.label)}
                        onToggle={() => toggle(focusSectors, setFocusSectors, ind.label)}
                      />
                    ))}
                  </div>
                </div>
                <div>
                  <Label>Focus stages</Label>
                  <div className="flex flex-wrap gap-2">
                    {COMPANY_STAGE_OPTIONS.map((stage) => (
                      <ChipToggle
                        key={stage}
                        label={stage}
                        selected={focusStages.includes(stage)}
                        onToggle={() => toggle(focusStages, setFocusStages, stage)}
                      />
                    ))}
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <Label>Typical cohort size</Label>
                    <TextInput
                      type="number"
                      min={0}
                      value={typicalCohortSize}
                      onChange={(e) => setTypicalCohortSize(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                  <div>
                    <Label>Program length (weeks)</Label>
                    <TextInput
                      type="number"
                      min={0}
                      value={programLengthWeeks}
                      onChange={(e) => setProgramLengthWeeks(e.target.value)}
                      placeholder="Optional"
                    />
                  </div>
                </div>
              </div>

              <div className="flex justify-between mt-8">
                <SecondaryButton onClick={() => setStep(1)}>Back</SecondaryButton>
                <PrimaryButton onClick={() => setStep(3)}>Continue</PrimaryButton>
              </div>
            </>
          )}

          {step === 3 && (
            <>
              <h2 className="text-lg font-bold text-white mb-1">Ready to go</h2>
              <p className="text-sm text-white/40 mb-6">
                Cohorts can be created any time from the Cohorts page — no need to set one up now.
              </p>

              <Card className="p-4 space-y-2 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/40">Program</span>
                  <span className="text-white font-medium">{name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">Type</span>
                  <span className="text-white font-medium capitalize">{programType}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/40">HQ</span>
                  <span className="text-white font-medium">{[hqCity, hqCountry].filter(Boolean).join(', ')}</span>
                </div>
                {focusSectors.length > 0 && (
                  <div className="flex justify-between">
                    <span className="text-white/40">Sectors</span>
                    <span className="text-white font-medium text-right">{focusSectors.join(', ')}</span>
                  </div>
                )}
              </Card>

              {error && <p className="text-sm text-red-400 mt-4">{error}</p>}

              <div className="flex justify-between mt-8">
                <SecondaryButton onClick={() => setStep(2)} disabled={submitting}>
                  Back
                </SecondaryButton>
                <PrimaryButton onClick={handleSubmit} disabled={submitting}>
                  {submitting ? 'Creating…' : 'Create program'}
                </PrimaryButton>
              </div>
            </>
          )}
        </Card>
      </div>
    </div>
  );
}
