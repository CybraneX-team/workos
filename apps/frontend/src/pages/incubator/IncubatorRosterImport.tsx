import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { UploadCloud, CheckCircle2, XCircle, FileSpreadsheet } from 'lucide-react';
import {
  uploadRoster,
  getRosterJob,
  commitRoster,
  useCohorts,
  COMPANY_STAGE_ENUM,
  type RosterRow,
  type RosterCommitResult,
} from '../../lib/db/incubator';
import { INDUSTRIES } from '../../db/industries';
import { PageHeader, Card, PrimaryButton, SecondaryButton, Select, TextInput, Spinner } from '../../components/incubator/ui';

type Stage = 'idle' | 'uploading' | 'processing' | 'review' | 'committing' | 'done' | 'error';

const KNOWN_SECTORS = new Set(INDUSTRIES.map((i) => i.label.toLowerCase()));

function ConfidenceDot({ value }: { value: number }) {
  const color = value >= 0.8 ? '#34d399' : value >= 0.4 ? '#fbbf24' : '#f87171';
  return <span className="inline-block w-1.5 h-1.5 rounded-full shrink-0" style={{ background: color }} title={`confidence: ${Math.round(value * 100)}%`} />;
}

interface ReviewRow extends RosterRow {
  _include: boolean;
}

export default function IncubatorRosterImport() {
  const navigate = useNavigate();
  const { cohorts } = useCohorts();
  const [stage, setStage] = useState<Stage>('idle');
  const [error, setError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [jobId, setJobId] = useState<string | null>(null);
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [cohortId, setCohortId] = useState('');
  const [result, setResult] = useState<RosterCommitResult | null>(null);
  const pollRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  async function handleFileSelected(file: File) {
    setFileName(file.name);
    setStage('uploading');
    setError(null);
    try {
      const { jobId: id } = await uploadRoster(file);
      setJobId(id);
      setStage('processing');
      pollRef.current = window.setInterval(async () => {
        try {
          const job = await getRosterJob(id);
          if (job.status === 'complete') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            const parsedRows = (job.rosterStaging?.rows ?? []).map((r) => ({ ...r, _include: true }));
            setRows(parsedRows);
            setWarnings(job.rosterStaging?.warnings ?? []);
            setStage('review');
          } else if (job.status === 'failed') {
            if (pollRef.current) window.clearInterval(pollRef.current);
            setError(job.last_error ?? 'Parsing failed');
            setStage('error');
          }
        } catch (err) {
          if (pollRef.current) window.clearInterval(pollRef.current);
          setError(err instanceof Error ? err.message : String(err));
          setStage('error');
        }
      }, 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('error');
    }
  }

  function updateRow(idx: number, patch: Partial<ReviewRow>) {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  }

  const includedCount = rows.filter((r) => r._include && r.name?.trim()).length;

  async function handleCommit() {
    if (!jobId) return;
    setStage('committing');
    setError(null);
    try {
      const rowsToCommit = rows.filter((r) => r._include && r.name?.trim());
      const commitResult = await commitRoster(jobId, {
        cohortId: cohortId || undefined,
        rows: rowsToCommit,
      });
      setResult(commitResult);
      setStage('done');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setStage('review');
    }
  }

  return (
    <div className="p-8 max-w-5xl">
      <PageHeader title="Import roster" description="Upload a spreadsheet of startups in any format — we'll figure out the columns." />

      {stage === 'idle' && (
        <Card className="p-10">
          <label className="flex flex-col items-center justify-center gap-3 cursor-pointer py-10 border-2 border-dashed border-white/15 rounded-xl hover:border-[#a78bfa]/40 transition-colors">
            <UploadCloud size={32} className="text-white/30" />
            <p className="text-sm text-white/70 font-medium">Click to choose a file</p>
            <p className="text-xs text-white/30">.xlsx, .xls, or .csv — any format, messy headers are handled automatically</p>
            <input
              type="file"
              accept=".xlsx,.xls,.csv"
              className="hidden"
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) handleFileSelected(file);
              }}
            />
          </label>
        </Card>
      )}

      {(stage === 'uploading' || stage === 'processing') && (
        <Card className="p-10 flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-sm text-white/70">
            {stage === 'uploading' ? `Uploading ${fileName}…` : 'Parsing spreadsheet…'}
          </p>
        </Card>
      )}

      {stage === 'error' && (
        <Card className="p-8 text-center">
          <XCircle size={28} className="text-red-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-1">Something went wrong</p>
          <p className="text-sm text-white/40 mb-4">{error}</p>
          <SecondaryButton onClick={() => setStage('idle')}>Try again</SecondaryButton>
        </Card>
      )}

      {stage === 'review' && (
        <>
          {warnings.length > 0 && (
            <Card className="p-3 mb-4 border-amber-500/20 bg-amber-500/[0.04]">
              {warnings.map((w, i) => (
                <p key={i} className="text-xs text-amber-300">
                  {w}
                </p>
              ))}
            </Card>
          )}

          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2 text-sm text-white/50">
              <FileSpreadsheet size={15} />
              {fileName} · {rows.length} row{rows.length === 1 ? '' : 's'} parsed, {includedCount} will be imported
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-white/40">Assign to cohort</span>
              <Select value={cohortId} onChange={(e) => setCohortId(e.target.value)} className="w-48">
                <option value="">None</option>
                {cohorts.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </Select>
            </div>
          </div>

          <Card className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-white/40 border-b border-white/10">
                  <th className="p-3 font-medium w-8"></th>
                  <th className="p-3 font-medium">Name</th>
                  <th className="p-3 font-medium">Contact email</th>
                  <th className="p-3 font-medium">Stage</th>
                  <th className="p-3 font-medium">Sector</th>
                  <th className="p-3 font-medium">Country</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((row, idx) => {
                  const sectorUnknown = !!row.sector && !KNOWN_SECTORS.has(row.sector.toLowerCase());
                  return (
                    <tr key={idx} className={`border-b border-white/5 ${!row._include ? 'opacity-40' : ''}`}>
                      <td className="p-3">
                        <input
                          type="checkbox"
                          checked={row._include}
                          onChange={(e) => updateRow(idx, { _include: e.target.checked })}
                        />
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot value={row.confidence.name ?? 0} />
                          <TextInput
                            value={row.name ?? ''}
                            onChange={(e) => updateRow(idx, { name: e.target.value })}
                            className="min-w-[160px]"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot value={row.confidence.contactEmail ?? 0} />
                          <TextInput
                            value={row.contactEmail ?? ''}
                            onChange={(e) => updateRow(idx, { contactEmail: e.target.value })}
                            placeholder="needs contact"
                            className="min-w-[180px]"
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot value={row.confidence.stage ?? 0} />
                          <Select value={row.stage ?? ''} onChange={(e) => updateRow(idx, { stage: e.target.value })} className="min-w-[120px]">
                            <option value="">—</option>
                            {COMPANY_STAGE_ENUM.map((s) => (
                              <option key={s} value={s}>
                                {s}
                              </option>
                            ))}
                          </Select>
                        </div>
                      </td>
                      <td className="p-2">
                        <div className="flex items-center gap-1.5">
                          <ConfidenceDot value={row.confidence.sector ?? 0} />
                          <TextInput
                            value={row.sector ?? ''}
                            onChange={(e) => updateRow(idx, { sector: e.target.value })}
                            className="min-w-[120px]"
                            title={sectorUnknown ? 'Unrecognized sector — industry link will be skipped' : undefined}
                            style={sectorUnknown ? { borderColor: 'rgba(251,191,36,0.4)' } : undefined}
                          />
                        </div>
                      </td>
                      <td className="p-2">
                        <TextInput value={row.country ?? ''} onChange={(e) => updateRow(idx, { country: e.target.value })} className="min-w-[100px]" />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </Card>

          {error && <p className="text-sm text-red-400 mt-3">{error}</p>}

          <div className="flex justify-end gap-2 mt-6">
            <SecondaryButton onClick={() => setStage('idle')}>Start over</SecondaryButton>
            <PrimaryButton onClick={handleCommit} disabled={includedCount === 0}>
              Import {includedCount} startup{includedCount === 1 ? '' : 's'}
            </PrimaryButton>
          </div>
        </>
      )}

      {stage === 'committing' && (
        <Card className="p-10 flex flex-col items-center gap-3">
          <Spinner size={28} />
          <p className="text-sm text-white/70">Creating startup profiles…</p>
        </Card>
      )}

      {stage === 'done' && result && (
        <Card className="p-8 text-center">
          <CheckCircle2 size={28} className="text-emerald-400 mx-auto mb-3" />
          <p className="text-white font-medium mb-1">
            {result.imported} startup{result.imported === 1 ? '' : 's'} imported
          </p>
          <p className="text-sm text-white/40 mb-6">
            {result.duplicatesSkipped > 0 && `${result.duplicatesSkipped} duplicate${result.duplicatesSkipped === 1 ? '' : 's'} skipped. `}
            {result.missingName > 0 && `${result.missingName} row${result.missingName === 1 ? '' : 's'} without a name skipped.`}
          </p>
          <div className="flex justify-center gap-2">
            <SecondaryButton onClick={() => setStage('idle')}>Import another</SecondaryButton>
            <PrimaryButton onClick={() => navigate('/incubator/portfolio')}>View portfolio</PrimaryButton>
          </div>
        </Card>
      )}
    </div>
  );
}
