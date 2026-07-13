import { useEffect, useState } from 'react';
import { Mail, RotateCw, X } from 'lucide-react';
import {
  usePortfolioCompany,
  updatePortfolioCompany,
  sendInvites,
  resendInvite,
  COMPANY_STAGE_ENUM,
} from '../../lib/db/incubator';
import {
  GlassModal,
  PrimaryButton,
  SecondaryButton,
  TextInput,
  TextArea,
  Select,
  Label,
  StatusBadge,
  StageBadge,
  Avatar,
  Spinner,
} from './ui';

export default function PortfolioDetailModal({
  companyId,
  onClose,
  onUpdated,
}: {
  companyId: string | null;
  onClose: () => void;
  onUpdated?: () => void;
}) {
  const { company, loading, error, refresh } = usePortfolioCompany(companyId ?? undefined);

  const [form, setForm] = useState<Record<string, string>>({});
  const [saving, setSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);
  const [inviteBusy, setInviteBusy] = useState(false);
  const [inviteMessage, setInviteMessage] = useState<string | null>(null);

  useEffect(() => {
    const h = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', h);
    return () => window.removeEventListener('keydown', h);
  }, [onClose]);

  useEffect(() => {
    if (!company) return;
    setForm({
      name: company.name,
      website: company.website ?? '',
      description: company.description ?? '',
      country: company.country ?? '',
      stage: company.stage ?? '',
      stageLabel: company.stage_label ?? '',
      sector: company.sector ?? '',
      foundedYear: company.founded_year ? String(company.founded_year) : '',
      incubatorNotes: company.incubator_notes ?? '',
      rosterContactEmail: company.roster_contact_email ?? '',
      rosterContactName: company.roster_contact_name ?? '',
    });
    setSaveMessage(null);
    setInviteMessage(null);
  }, [company]);

  if (!companyId) return null;

  async function handleSave() {
    if (!companyId || !company) return;
    setSaving(true);
    setSaveMessage(null);
    try {
      const patch: Record<string, unknown> = {};
      if (form.name !== company.name) patch.name = form.name;
      if (form.website !== (company.website ?? '')) patch.website = form.website;
      if (form.description !== (company.description ?? '')) patch.description = form.description;
      if (form.country !== (company.country ?? '')) patch.country = form.country;
      if (form.stage !== (company.stage ?? '')) patch.stage = form.stage;
      if (form.stageLabel !== (company.stage_label ?? '')) patch.stageLabel = form.stageLabel;
      if (form.sector !== (company.sector ?? '')) patch.sector = form.sector;
      if (form.foundedYear) patch.foundedYear = Number(form.foundedYear);
      if (form.incubatorNotes !== (company.incubator_notes ?? '')) patch.incubatorNotes = form.incubatorNotes;
      if (form.rosterContactEmail !== (company.roster_contact_email ?? '')) patch.rosterContactEmail = form.rosterContactEmail;
      if (form.rosterContactName !== (company.roster_contact_name ?? '')) patch.rosterContactName = form.rosterContactName;

      if (Object.keys(patch).length === 0) {
        setSaveMessage('Nothing to save');
      } else {
        await updatePortfolioCompany(companyId, patch);
        setSaveMessage('Saved');
        await refresh();
        onUpdated?.();
      }
    } catch (err) {
      setSaveMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setSaving(false);
    }
  }

  async function handleSendInvite() {
    if (!companyId) return;
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      const email = form.rosterContactEmail.trim();
      const { results } = await sendInvites({
        companyIds: [companyId],
        emailOverrides: email ? { [companyId]: email } : undefined,
      });
      setInviteMessage(results[0]?.result === 'sent' ? 'Invite sent' : `Could not send invite: ${results[0]?.result}`);
      await refresh();
      onUpdated?.();
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setInviteBusy(false);
    }
  }

  async function handleResendInvite() {
    if (!company?.latestInvite) return;
    setInviteBusy(true);
    setInviteMessage(null);
    try {
      await resendInvite(company.latestInvite.id);
      setInviteMessage('Invite resent');
      await refresh();
      onUpdated?.();
    } catch (err) {
      setInviteMessage(err instanceof Error ? err.message : String(err));
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <GlassModal onClose={onClose} className="max-w-2xl max-h-[85vh] overflow-y-auto flex flex-col">
      {loading || !company ? (
        <div className="p-10 flex justify-center">
          {error ? <p className="text-sm text-red-400">{error}</p> : <Spinner />}
        </div>
      ) : (
        <>
          <div className="flex items-start gap-3 p-5 border-b border-white/[0.06] shrink-0">
            <Avatar name={company.name} size={44} />
            <div className="flex-1 min-w-0">
              <h2 className="text-base font-semibold text-white truncate">{company.name}</h2>
              <div className="flex items-center gap-2 flex-wrap mt-1.5">
                <StatusBadge status={company.status} />
                <StageBadge stage={company.stage_label || company.stage} />
                {company.cohorts.length > 0 && (
                  <span className="text-xs text-white/35">{company.cohorts.map((c) => c.name).join(', ')}</span>
                )}
              </div>
            </div>
            <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/[0.06] text-white/40 shrink-0">
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="p-5 flex flex-col gap-5 overflow-y-auto">
            <div>
              <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Company details</h3>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label>Name</Label>
                  <TextInput value={form.name ?? ''} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} />
                </div>
                <div>
                  <Label>Website</Label>
                  <TextInput value={form.website ?? ''} onChange={(e) => setForm((f) => ({ ...f, website: e.target.value }))} />
                </div>
                <div>
                  <Label>Stage (funding round)</Label>
                  <Select value={form.stage ?? ''} onChange={(e) => setForm((f) => ({ ...f, stage: e.target.value }))}>
                    <option value="">—</option>
                    {COMPANY_STAGE_ENUM.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </Select>
                </div>
                <div>
                  <Label>Stage label</Label>
                  <TextInput
                    value={form.stageLabel ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, stageLabel: e.target.value }))}
                    placeholder="e.g. MVP in Market"
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <TextInput value={form.country ?? ''} onChange={(e) => setForm((f) => ({ ...f, country: e.target.value }))} />
                </div>
                <div>
                  <Label>Sector</Label>
                  <TextInput
                    value={form.sector ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, sector: e.target.value }))}
                    placeholder="e.g. Policy Tech, TourismTech"
                  />
                </div>
                <div>
                  <Label>Founded year</Label>
                  <TextInput
                    type="number"
                    value={form.foundedYear ?? ''}
                    onChange={(e) => setForm((f) => ({ ...f, foundedYear: e.target.value }))}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>Description</Label>
              <TextArea rows={3} value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
            </div>
            <div>
              <Label>Incubator notes</Label>
              <TextArea
                rows={3}
                value={form.incubatorNotes ?? ''}
                onChange={(e) => setForm((f) => ({ ...f, incubatorNotes: e.target.value }))}
                placeholder="Private notes only you can see"
              />
            </div>

            {company.status === 'claimed' && (
              <div>
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Live metrics</h3>
                {!company.liveMetrics || (company.liveMetrics.normalized.length === 0 && !company.liveMetrics.latestSnapshot) ? (
                  <p className="text-sm text-white/40">No metrics reported yet.</p>
                ) : (
                  <div className="flex flex-col gap-3">
                    {company.liveMetrics.normalized.length > 0 && (
                      <div className="grid grid-cols-2 gap-2">
                        {company.liveMetrics.normalized.map((m) => (
                          <div key={m.metric_key} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                            <div className="text-[9px] uppercase tracking-wide text-white/25 mb-1">{m.metric_key}</div>
                            <div className="text-sm font-semibold text-white">
                              {m.value} {m.unit}
                            </div>
                          </div>
                        ))}
                      </div>
                    )}
                    {company.liveMetrics.latestSnapshot && (
                      <div className="grid grid-cols-2 gap-2">
                        {Object.entries(company.liveMetrics.latestSnapshot)
                          .filter(([k]) => k !== '_snapshotAt')
                          .map(([key, value]) => (
                            <div key={key} className="bg-white/[0.03] border border-white/[0.06] rounded-lg px-3 py-2.5">
                              <div className="text-[9px] uppercase tracking-wide text-white/25 mb-1">{key}</div>
                              <div className="text-sm font-semibold text-white">{String(value)}</div>
                            </div>
                          ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="grid grid-cols-2 gap-4 pt-4 border-t border-white/[0.06]">
              <div>
                <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Contact</h3>
                <div className="flex flex-col gap-3">
                  <div>
                    <Label>Contact name</Label>
                    <TextInput
                      value={form.rosterContactName ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, rosterContactName: e.target.value }))}
                    />
                  </div>
                  <div>
                    <Label>Contact email</Label>
                    <TextInput
                      value={form.rosterContactEmail ?? ''}
                      onChange={(e) => setForm((f) => ({ ...f, rosterContactEmail: e.target.value }))}
                      placeholder="needed to send an invite"
                    />
                  </div>
                </div>
              </div>

              {company.status !== 'claimed' && (
                <div>
                  <h3 className="text-xs font-semibold text-white/50 uppercase tracking-wide mb-3">Invite</h3>
                  {company.latestInvite && <StatusBadge status={company.latestInvite.status} />}
                  <div className="mt-3">
                    {company.status === 'invited' ? (
                      <SecondaryButton onClick={handleResendInvite} disabled={inviteBusy} className="w-full">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <RotateCw size={13} /> {inviteBusy ? 'Resending…' : 'Resend invite'}
                        </span>
                      </SecondaryButton>
                    ) : (
                      <PrimaryButton onClick={handleSendInvite} disabled={inviteBusy || !form.rosterContactEmail?.trim()} className="w-full">
                        <span className="inline-flex items-center justify-center gap-1.5">
                          <Mail size={13} /> {inviteBusy ? 'Sending…' : 'Send invite'}
                        </span>
                      </PrimaryButton>
                    )}
                    {inviteMessage && <p className="text-xs text-white/40 mt-2">{inviteMessage}</p>}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="p-5 border-t border-white/[0.06] shrink-0 flex items-center gap-3">
            <PrimaryButton onClick={handleSave} disabled={saving}>
              {saving ? 'Saving…' : 'Save changes'}
            </PrimaryButton>
            {saveMessage && <span className="text-xs text-white/40">{saveMessage}</span>}
          </div>
        </>
      )}
    </GlassModal>
  );
}
