import { useMemo, useState } from 'react';
import {
  AlertTriangle, CheckCircle2, Copy, ExternalLink, Loader2, Megaphone,
  PackageSearch, Pause, Play, Plus, RefreshCw, Save, Send, ShieldCheck, Sparkles, Upload,
} from 'lucide-react';
import type { MetaAdsBrandKit, MetaAdsCampaignDraftContent, MetaAdsCreativeAsset, MetaAdsCreativeConcept, MetaAdsLeadFormQuestion } from '@cybranex/shared-types';
import { useAuth } from '../../../lib/auth';
import { fetchMetaAdsProductContext } from '../../../lib/integrations/service';
import { useMetaAdsCampaignStudio } from '../../../lib/integrations/useMetaAdsCampaignStudio';
import { GlassCard, SectionTitle } from './PanelShell';

const inputClass = 'w-full rounded-lg border border-white/10 bg-black/25 px-3 py-2 text-sm text-white outline-none focus:border-violet-300/40 disabled:opacity-50';
const labelClass = 'space-y-1 text-[10px] font-semibold uppercase tracking-[0.12em] text-white/35';

function localDateTime(value: string, timezone: string | null) {
  const date = new Date(value);
  if (!timezone) {
    const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return local.toISOString().slice(0, 16);
  }
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
  }).formatToParts(date);
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}T${values.hour}:${values.minute}`;
}

function isoFromLocal(value: string, timezone: string | null, fallback: string) {
  if (!timezone) {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
  }
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) return fallback;
  const desired = Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3]), Number(match[4]), Number(match[5]));
  const offsetAt = (instant: number) => {
    const parts = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hourCycle: 'h23',
    }).formatToParts(new Date(instant));
    const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
    return Date.UTC(Number(values.year), Number(values.month) - 1, Number(values.day), Number(values.hour), Number(values.minute), Number(values.second)) - instant;
  };
  let instant = desired - offsetAt(desired);
  instant = desired - offsetAt(instant);
  const date = new Date(instant);
  return Number.isFinite(date.getTime()) ? date.toISOString() : fallback;
}

function statusTone(status: string) {
  if (['active', 'scheduled'].includes(status)) return 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100';
  if (['failed'].includes(status)) return 'border-rose-300/25 bg-rose-400/10 text-rose-100';
  if (['submitted', 'publish_approved', 'published_paused', 'launch_approved'].includes(status)) return 'border-amber-300/25 bg-amber-400/10 text-amber-100';
  return 'border-white/10 bg-white/5 text-white/60';
}

function BrandKitEditor({ value, assets, disabled, onSave, onUpload }: {
  value: MetaAdsBrandKit;
  assets: MetaAdsCreativeAsset[];
  disabled: boolean;
  onSave: (value: Omit<MetaAdsBrandKit, 'updatedAt'>) => Promise<unknown>;
  onUpload: (file: File) => Promise<MetaAdsCreativeAsset | null>;
}) {
  const [form, setForm] = useState(value);
  return (
    <GlassCard>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <SectionTitle icon={ShieldCheck}>Brand kit</SectionTitle>
        {!disabled && <button type="button" onClick={() => void onSave({
          businessName: form.businessName, brandVoice: form.brandVoice, valueProposition: form.valueProposition,
          targetAudience: form.targetAudience, primaryColor: form.primaryColor, secondaryColor: form.secondaryColor,
          logoAssetId: form.logoAssetId, requiredPhrases: form.requiredPhrases, prohibitedPhrases: form.prohibitedPhrases,
        })} className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white/70"><Save className="h-3.5 w-3.5" /> Save brand kit</button>}
      </div>
      <p className="mb-4 text-xs text-white/40">Gemini receives only this kit, the explicit campaign brief, and any confirmed ERP item below.</p>
      <div className="grid gap-3 lg:grid-cols-2">
        <label className={labelClass}>Business name<input disabled={disabled} className={inputClass} value={form.businessName} onChange={(event) => setForm({ ...form, businessName: event.target.value })} /></label>
        <label className={labelClass}>Target audience<input disabled={disabled} className={inputClass} value={form.targetAudience} onChange={(event) => setForm({ ...form, targetAudience: event.target.value })} /></label>
        <label className={labelClass}>Brand voice<textarea disabled={disabled} className={`${inputClass} min-h-20`} value={form.brandVoice} onChange={(event) => setForm({ ...form, brandVoice: event.target.value })} /></label>
        <label className={labelClass}>Value proposition<textarea disabled={disabled} className={`${inputClass} min-h-20`} value={form.valueProposition} onChange={(event) => setForm({ ...form, valueProposition: event.target.value })} /></label>
        <label className={labelClass}>Required phrases<input disabled={disabled} className={inputClass} value={form.requiredPhrases.join(', ')} onChange={(event) => setForm({ ...form, requiredPhrases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
        <label className={labelClass}>Prohibited phrases<input disabled={disabled} className={inputClass} value={form.prohibitedPhrases.join(', ')} onChange={(event) => setForm({ ...form, prohibitedPhrases: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) })} /></label>
        <label className={labelClass}>Primary color<input disabled={disabled} type="color" className={`${inputClass} h-10 p-1`} value={form.primaryColor || '#6750ff'} onChange={(event) => setForm({ ...form, primaryColor: event.target.value })} /></label>
        <label className={labelClass}>Secondary color<input disabled={disabled} type="color" className={`${inputClass} h-10 p-1`} value={form.secondaryColor || '#111827'} onChange={(event) => setForm({ ...form, secondaryColor: event.target.value })} /></label>
        <label className={`${labelClass} lg:col-span-2`}>Logo / brand reference<select disabled={disabled} className={inputClass} value={form.logoAssetId ?? ''} onChange={(event) => setForm({ ...form, logoAssetId: event.target.value || null })}><option value="">No logo reference</option>{assets.map((asset) => <option key={asset.id} value={asset.id}>{asset.fileName} · {asset.source}</option>)}</select></label>
      </div>
      {!disabled && <label className="mt-3 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60"><Upload className="h-3.5 w-3.5" /> Upload brand reference<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void onUpload(file).then((asset) => { if (asset) setForm((current) => ({ ...current, logoAssetId: asset.id })); }); }} /></label>}
    </GlassCard>
  );
}

/** `CRM Lead` fields a lead-form answer can be routed into. */
const CRM_LEAD_FIELDS: Array<[string, string]> = [
  ['first_name', 'First name'],
  ['last_name', 'Last name'],
  ['email', 'Email'],
  ['mobile_no', 'Mobile number'],
  ['organization', 'Organization'],
  ['job_title', 'Job title'],
  ['website', 'Website'],
];

/**
 * Meta's four standard question types. Their answer keys are assigned by Meta, not chosen here —
 * PHONE resolves to `phone_number`, which is why it maps to `mobile_no` rather than matching by
 * name. Seeded on the first switch to a lead form so a draft is publishable without extra editing.
 */
function defaultLeadForm(): NonNullable<MetaAdsCampaignDraftContent['leadForm']> {
  return {
    questionSetHash: '',
    questions: [
      { key: 'first_name', type: 'FIRST_NAME', label: 'First name', crmField: 'first_name' },
      { key: 'last_name', type: 'LAST_NAME', label: 'Last name', crmField: 'last_name' },
      { key: 'email', type: 'EMAIL', label: 'Email', crmField: 'email' },
      { key: 'phone_number', type: 'PHONE', label: 'Phone number', crmField: 'mobile_no' },
    ],
    privacyPolicyUrl: '',
    followUpUrl: '',
    contextHeadline: '',
    contextDescription: '',
  };
}

export function MetaAdsCampaignStudio() {
  const auth = useAuth();
  const canWrite = auth.can('paid_media', 'write');
  const canApprove = auth.can('paid_media', 'approve');
  const canExecute = auth.can('paid_media', 'execute');
  const studio = useMetaAdsCampaignStudio();
  const [formOverride, setFormOverride] = useState<{ key: string; value: MetaAdsCampaignDraftContent } | null>(null);
  const [approvalNote, setApprovalNote] = useState('');
  const [itemCode, setItemCode] = useState('');
  const [productBusy, setProductBusy] = useState(false);
  const [productError, setProductError] = useState<string | null>(null);

  const formKey = studio.selected ? `${studio.selected.id}:${studio.selected.version}` : '';
  const form = formOverride?.key === formKey ? formOverride.value : studio.selected?.content ?? null;
  const setForm = (next: MetaAdsCampaignDraftContent | null | ((value: MetaAdsCampaignDraftContent | null) => MetaAdsCampaignDraftContent | null)) => {
    const value = typeof next === 'function' ? next(form) : next;
    setFormOverride(value ? { key: formKey, value } : null);
  };
  const assetById = useMemo(() => new Map(studio.assets.map((asset) => [asset.id, asset])), [studio.assets]);
  const editable = canWrite && studio.selected?.status === 'draft';
  const readiness = studio.readiness;

  if (studio.loading && !readiness) return <GlassCard className="flex min-h-44 items-center justify-center"><Loader2 className="h-5 w-5 animate-spin text-violet-300" /></GlassCard>;
  if (!readiness || !studio.brandKit) return <GlassCard><p className="text-sm text-rose-200">{studio.error || 'Campaign Studio could not be loaded.'}</p></GlassCard>;

  const saveSetup = async () => {
    if (!form) return;
    await studio.saveDraft(form);
  };

  const persistAds = async (ads: MetaAdsCampaignDraftContent['ads']) => {
    if (!form) return;
    setForm({ ...form, ads });
    await studio.saveDraft({ ads });
  };

  // questionSetHash is intentionally left alone here — the server recomputes it on every patch,
  // because it decides which Meta form a publish binds to.
  const setLeadForm = (patch: Partial<NonNullable<MetaAdsCampaignDraftContent['leadForm']>>) => {
    if (!form?.leadForm) return;
    setForm({ ...form, leadForm: { ...form.leadForm, ...patch } });
  };

  const setQuestion = (index: number, patch: Partial<MetaAdsLeadFormQuestion>) => {
    if (!form?.leadForm) return;
    const questions = form.leadForm.questions.map((question, position) => (position === index ? { ...question, ...patch } : question));
    setLeadForm({ questions });
  };

  const addQuestion = () => {
    if (!form?.leadForm) return;
    setLeadForm({
      questions: [...form.leadForm.questions, {
        // Meta assigns keys for standard types but keeps ours for CUSTOM ones.
        key: `custom_${form.leadForm.questions.length + 1}`,
        type: 'CUSTOM', label: '', crmField: null,
      }],
    });
  };

  const removeQuestion = (index: number) => {
    if (!form?.leadForm) return;
    setLeadForm({ questions: form.leadForm.questions.filter((_, position) => position !== index) });
  };

  const chooseConcept = async (concept: MetaAdsCreativeConcept, assetId?: string) => {
    if (!form) return;
    const existing = form.ads.find((ad) => ad.conceptId === concept.id);
    const ads = existing
      ? form.ads.filter((ad) => ad.id !== existing.id)
      : [...form.ads, {
          id: crypto.randomUUID(), conceptId: concept.id, assetId: assetId || concept.assetIds['1:1'] || '', name: concept.name,
          primaryText: concept.primaryText, headline: concept.headline, description: concept.description, callToAction: concept.callToAction,
        }].slice(0, 3);
    await persistAds(ads);
  };

  const selectConceptAsset = async (concept: MetaAdsCreativeConcept, assetId: string) => {
    if (!form) return;
    const ads = form.ads.map((ad) => ad.conceptId === concept.id ? { ...ad, assetId } : ad);
    await persistAds(ads);
  };

  const addUploadedAsset = async (assetId: string) => {
    if (!form || form.ads.length >= 3) return;
    const asset = assetById.get(assetId);
    if (!asset) return;
    await persistAds([...form.ads, {
      id: crypto.randomUUID(),
      conceptId: null,
      assetId,
      name: asset.fileName.replace(/\.[^.]+$/, '').slice(0, 80) || `Uploaded ad ${form.ads.length + 1}`,
      primaryText: '',
      headline: '',
      description: '',
      callToAction: form.brief.callToAction,
    }]);
  };

  const editAd = (adId: string, patch: Partial<MetaAdsCampaignDraftContent['ads'][number]>) => {
    if (!form) return;
    setForm({ ...form, ads: form.ads.map((ad) => ad.id === adId ? { ...ad, ...patch } : ad) });
  };

  const attachProduct = async () => {
    if (!itemCode.trim()) return;
    setProductBusy(true); setProductError(null);
    try {
      const product = await fetchMetaAdsProductContext(itemCode.trim());
      setForm((value) => value ? { ...value, productContext: product } : value);
      await studio.saveDraft({ productContext: product });
    } catch (cause) {
      setProductError(cause instanceof Error ? cause.message : String(cause));
    } finally { setProductBusy(false); }
  };

  const activeJob = studio.campaignJob && ['pending', 'running'].includes(studio.campaignJob.status);
  const activeCreativeJob = studio.creativeJob && ['pending', 'running'].includes(studio.creativeJob.status);

  return (
    <div className="space-y-4 pt-4">
      <GlassCard>
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <SectionTitle icon={Megaphone}>Campaign Studio</SectionTitle>
            <p className="max-w-2xl text-xs leading-relaxed text-white/45">Create a reviewed Website Traffic campaign with one broad ad set and 1–3 single-image ads. Publication always creates paused Meta objects; launch requires a second approval.</p>
          </div>
          <div className={`rounded-lg border px-3 py-2 text-xs ${readiness.permitted ? 'border-emerald-300/25 bg-emerald-400/10 text-emerald-100' : 'border-amber-300/25 bg-amber-400/10 text-amber-100'}`}>
            {readiness.permitted ? `${readiness.accountName} · ready` : 'Authoring not ready'}
          </div>
        </div>
        {readiness.blockers.length > 0 && <div className="mt-4 space-y-2">{readiness.blockers.map((blocker) => <div key={blocker.code} className="rounded-lg border border-amber-300/20 bg-amber-300/10 p-3 text-xs text-amber-100/80"><AlertTriangle className="mr-2 inline h-3.5 w-3.5" />{blocker.message}</div>)}</div>}
        <div className="mt-4 flex flex-wrap gap-2 text-[10px] text-white/40">
          <span className="rounded-full border border-white/10 px-2 py-1">{readiness.mode.replace(/_/g, ' ')}</span>
          <span className="rounded-full border border-white/10 px-2 py-1">{readiness.currency || 'currency pending'}</span>
          <span className="rounded-full border border-white/10 px-2 py-1">{readiness.timezone || 'timezone pending'}</span>
          <span className="rounded-full border border-white/10 px-2 py-1">Launch {readiness.launchEnabled ? 'enabled' : 'disabled'}</span>
        </div>
      </GlassCard>

      <BrandKitEditor key={studio.brandKit.updatedAt ?? 'unsaved-brand-kit'} value={studio.brandKit} assets={studio.assets} disabled={!canWrite || studio.busy} onSave={studio.saveBrand} onUpload={studio.upload} />

      <GlassCard>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <SectionTitle>Campaign drafts</SectionTitle>
          {canWrite && readiness.permitted && <button type="button" disabled={studio.busy} onClick={() => void studio.create()} className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50"><Plus className="h-3.5 w-3.5" /> New campaign</button>}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {studio.drafts.map((draft) => <button key={draft.id} type="button" onClick={() => void studio.open(draft.id)} className={`min-w-48 rounded-xl border p-3 text-left ${studio.selected?.id === draft.id ? 'border-violet-300/35 bg-violet-400/10' : 'border-white/10 bg-white/[0.025]'}`}><p className="truncate text-xs font-semibold text-white/80">{draft.content.name}</p><span className={`mt-2 inline-flex rounded-full border px-2 py-1 text-[9px] uppercase tracking-wide ${statusTone(draft.status)}`}>{draft.status.replace(/_/g, ' ')}</span></button>)}
          {studio.drafts.length === 0 && <p className="text-sm text-white/35">No campaign drafts yet.</p>}
        </div>
      </GlassCard>

      {studio.error && <div className="rounded-xl border border-rose-300/20 bg-rose-400/10 p-4 text-xs text-rose-100">{studio.error}</div>}

      {studio.selected && form && (
        <>
          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><SectionTitle>1. Brief and campaign setup</SectionTitle><p className="text-[10px] text-white/35">Draft v{studio.selected.version} · {studio.selected.status.replace(/_/g, ' ')}</p></div>
              <div className="flex flex-wrap gap-2">
                {!editable && canWrite && <button type="button" onClick={() => void studio.clone()} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65"><Copy className="h-3.5 w-3.5" /> Clone to edit</button>}
                {editable && <button type="button" disabled={studio.busy} onClick={() => void saveSetup()} className="flex items-center gap-1.5 rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white/70"><Save className="h-3.5 w-3.5" /> Save setup</button>}
              </div>
            </div>
            <div className="mt-4 grid gap-3 lg:grid-cols-2">
              <label className={labelClass}>Campaign name<input disabled={!editable} className={inputClass} value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} /></label>
              <label className={labelClass}>Goal<input disabled={!editable} className={inputClass} value={form.brief.goal} onChange={(event) => setForm({ ...form, brief: { ...form.brief, goal: event.target.value } })} placeholder="Drive qualified visits to the pricing page" /></label>
              <label className={labelClass}>Offer<textarea disabled={!editable} className={`${inputClass} min-h-20`} value={form.brief.offer} onChange={(event) => setForm({ ...form, brief: { ...form.brief, offer: event.target.value } })} /></label>
              <label className={labelClass}>Target customer<textarea disabled={!editable} className={`${inputClass} min-h-20`} value={form.brief.targetCustomer} onChange={(event) => setForm({ ...form, brief: { ...form.brief, targetCustomer: event.target.value } })} /></label>
              <label className={labelClass}>Proof points<input disabled={!editable} className={inputClass} value={form.brief.proofPoints.join(', ')} onChange={(event) => setForm({ ...form, brief: { ...form.brief, proofPoints: event.target.value.split(',').map((item) => item.trim()).filter(Boolean) } })} /></label>
              <label className={labelClass}>Destination<select disabled={!editable} className={inputClass} value={form.destination} onChange={(event) => {
                const destination = event.target.value as MetaAdsCampaignDraftContent['destination'];
                setForm({
                  ...form,
                  destination,
                  // Seed the standard question set on first switch so the form is publishable
                  // without further editing; keep whatever the user already built otherwise.
                  leadForm: destination === 'lead_form' ? (form.leadForm ?? defaultLeadForm()) : form.leadForm,
                  brief: destination === 'lead_form' && form.brief.callToAction === 'SHOP_NOW'
                    ? { ...form.brief, callToAction: 'SIGN_UP' }
                    : form.brief,
                });
              }}><option value="website">Website visits</option><option value="lead_form">Lead form (Meta instant form)</option></select></label>
              {form.destination === 'website' && <label className={labelClass}>Landing page<input disabled={!editable} type="url" className={inputClass} value={form.brief.landingPageUrl} onChange={(event) => setForm({ ...form, brief: { ...form.brief, landingPageUrl: event.target.value } })} placeholder="https://example.com/offer" /></label>}
              <label className={labelClass}>Facebook / Instagram identity<select disabled={!editable} className={inputClass} value={form.identity?.pageId ?? ''} onChange={(event) => setForm({ ...form, identity: readiness.pages.find((page) => page.pageId === event.target.value) ?? null })}><option value="">Choose a Page</option>{readiness.pages.map((page) => <option key={page.pageId} value={page.pageId}>{page.pageName}{page.instagramUsername ? ` · @${page.instagramUsername}` : ''}</option>)}</select></label>
              <label className={labelClass}>Call to action<select disabled={!editable} className={inputClass} value={form.brief.callToAction} onChange={(event) => setForm({ ...form, brief: { ...form.brief, callToAction: event.target.value as typeof form.brief.callToAction } })}>{['LEARN_MORE','SHOP_NOW','SIGN_UP','CONTACT_US','GET_QUOTE'].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label className={labelClass}>Campaign category<select disabled={!editable} className={inputClass} value={form.brief.regulatedCategory} onChange={(event) => setForm({ ...form, brief: { ...form.brief, regulatedCategory: event.target.value as typeof form.brief.regulatedCategory } })}>{[['none','Standard / none'],['credit','Credit'],['employment','Employment'],['housing','Housing'],['politics','Politics'],['alcohol','Alcohol'],['gambling','Gambling'],['tobacco','Tobacco'],['healthcare','Healthcare'],['financial_products','Financial products'],['crypto','Crypto'],['adult','Adult'],['weapons','Weapons']].map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select><span className="block normal-case tracking-normal text-white/25">Anything other than standard is blocked and must be completed in Ads Manager.</span></label>
              <label className={labelClass}>Countries<input disabled={!editable} className={inputClass} value={form.audience.countries.join(', ')} onChange={(event) => setForm({ ...form, audience: { ...form.audience, countries: event.target.value.toUpperCase().split(',').map((item) => item.trim()).filter(Boolean) } })} placeholder="US, GB, IN" /></label>
              <div className="grid grid-cols-2 gap-3"><label className={labelClass}>Minimum age<input disabled={!editable} type="number" min={18} max={65} className={inputClass} value={form.audience.ageMin} onChange={(event) => setForm({ ...form, audience: { ...form.audience, ageMin: Number(event.target.value) } })} /></label><label className={labelClass}>Maximum age<input disabled={!editable} type="number" min={18} max={65} className={inputClass} value={form.audience.ageMax} onChange={(event) => setForm({ ...form, audience: { ...form.audience, ageMax: Number(event.target.value) } })} /></label></div>
              <label className={labelClass}>Meta language IDs (optional)<input disabled={!editable} className={inputClass} value={form.audience.languageIds.join(', ')} onChange={(event) => setForm({ ...form, audience: { ...form.audience, languageIds: event.target.value.split(',').map(Number).filter((value) => Number.isInteger(value) && value > 0) } })} /></label>
              <label className={labelClass}>Lifetime budget ({readiness.currency || 'minor units'})<input disabled={!editable} type="number" min={1} max={readiness.maxLifetimeBudgetMinor} className={inputClass} value={form.lifetimeBudgetMinor} onChange={(event) => setForm({ ...form, lifetimeBudgetMinor: Number(event.target.value) })} /></label>
              <label className={labelClass}>Start time ({readiness.timezone || 'browser timezone'})<input disabled={!editable} type="datetime-local" className={inputClass} value={localDateTime(form.startTime, readiness.timezone)} onChange={(event) => setForm({ ...form, startTime: isoFromLocal(event.target.value, readiness.timezone, form.startTime) })} /></label>
              <label className={labelClass}>End time ({readiness.timezone || 'browser timezone'})<input disabled={!editable} type="datetime-local" className={inputClass} value={localDateTime(form.endTime, readiness.timezone)} onChange={(event) => setForm({ ...form, endTime: isoFromLocal(event.target.value, readiness.timezone, form.endTime) })} /></label>
              {form.audience.countries.some((country) => ['AT','BE','BG','HR','CY','CZ','DK','EE','FI','FR','DE','GR','HU','IE','IT','LV','LT','LU','MT','NL','PL','PT','RO','SK','SI','ES','SE','IS','LI','NO'].includes(country)) && <><label className={labelClass}>DSA beneficiary<input disabled={!editable} className={inputClass} value={form.dsaBeneficiary} onChange={(event) => setForm({ ...form, dsaBeneficiary: event.target.value })} /></label><label className={labelClass}>DSA payer<input disabled={!editable} className={inputClass} value={form.dsaPayor} onChange={(event) => setForm({ ...form, dsaPayor: event.target.value })} /></label></>}
            </div>
            {form.destination === 'lead_form' && form.leadForm && (
              <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
                <p className="text-xs uppercase tracking-wide text-white/40">Lead form</p>
                <p className="mt-1 text-xs text-white/35">
                  Answers sync into Frappe CRM as leads. Forms are reused across campaigns that ask the same questions.
                </p>
                <div className="mt-3 grid gap-3 lg:grid-cols-2">
                  <label className={labelClass}>Privacy policy URL<input disabled={!editable} type="url" className={inputClass} value={form.leadForm.privacyPolicyUrl} onChange={(event) => setLeadForm({ privacyPolicyUrl: event.target.value })} placeholder="https://example.com/privacy" /><span className="block normal-case tracking-normal text-white/25">Required by Meta on every lead form.</span></label>
                  <label className={labelClass}>Follow-up URL<input disabled={!editable} type="url" className={inputClass} value={form.leadForm.followUpUrl} onChange={(event) => setLeadForm({ followUpUrl: event.target.value })} placeholder="https://example.com/thanks" /><span className="block normal-case tracking-normal text-white/25">Required whenever an intro card is shown.</span></label>
                  <label className={labelClass}>Intro headline<input disabled={!editable} className={inputClass} value={form.leadForm.contextHeadline} onChange={(event) => setLeadForm({ contextHeadline: event.target.value })} /></label>
                  <label className={labelClass}>Intro description<input disabled={!editable} className={inputClass} value={form.leadForm.contextDescription} onChange={(event) => setLeadForm({ contextDescription: event.target.value })} /></label>
                </div>
                <p className="mt-4 text-xs uppercase tracking-wide text-white/40">Questions</p>
                <div className="mt-2 space-y-2">
                  {form.leadForm.questions.map((question, index) => (
                    <div key={`${question.key}-${index}`} className="flex flex-wrap items-center gap-2">
                      <input
                        disabled={!editable || question.type !== 'CUSTOM'}
                        className={`${inputClass} min-w-40 flex-1`}
                        value={question.label}
                        onChange={(event) => setQuestion(index, { label: event.target.value })}
                        placeholder="Question shown to the person"
                      />
                      <select
                        disabled={!editable}
                        className={`${inputClass} w-44`}
                        value={question.crmField ?? ''}
                        onChange={(event) => setQuestion(index, { crmField: event.target.value || null })}
                      >
                        <option value="">Do not sync</option>
                        {CRM_LEAD_FIELDS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                      </select>
                      {editable && question.type === 'CUSTOM' && (
                        <button type="button" onClick={() => removeQuestion(index)} className="rounded-lg border border-white/10 px-2 py-2 text-xs text-white/50">Remove</button>
                      )}
                    </div>
                  ))}
                </div>
                {editable && <button type="button" onClick={addQuestion} className="mt-2 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65">Add custom question</button>}
                <p className="mt-3 text-xs text-white/25">
                  One question must map to First name — Frappe CRM rejects the form otherwise. Standard questions use Meta&apos;s own wording.
                </p>
              </div>
            )}
            <div className="mt-4 rounded-xl border border-white/10 bg-white/[0.025] p-4">
              <div className="flex flex-wrap items-end gap-3"><label className={`${labelClass} min-w-60 flex-1`}>Optional confirmed ERPNext item<input disabled={!editable} className={inputClass} value={itemCode} onChange={(event) => setItemCode(event.target.value)} placeholder="Item code" /></label>{editable && <button type="button" disabled={productBusy} onClick={() => void attachProduct()} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/65"><PackageSearch className="h-3.5 w-3.5" /> {productBusy ? 'Checking…' : 'Confirm item'}</button>}</div>
              {form.productContext && <p className="mt-3 text-xs text-emerald-100/70">{form.productContext.itemName} · price {form.productContext.price ?? 'not set'} {form.productContext.currency ?? ''} · stock {form.productContext.stockQuantity ?? 'unknown'}</p>}
              {productError && <p className="mt-2 text-xs text-rose-200">{productError}</p>}
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><SectionTitle icon={Sparkles}>2. Creative concepts</SectionTitle><p className="text-xs text-white/40">Three concepts, each with 1:1, 4:5, and 9:16 image variants. Select one to three ads.</p></div>{editable && <button type="button" disabled={Boolean(activeCreativeJob) || studio.busy} onClick={() => void studio.generate()} className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white disabled:opacity-50">{activeCreativeJob ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Sparkles className="h-3.5 w-3.5" />} Generate concepts</button>}</div>
            <div className="mt-4 grid gap-4 xl:grid-cols-3">
              {form.concepts.map((concept) => {
                const selectedAd = form.ads.find((ad) => ad.conceptId === concept.id);
                return <div key={concept.id} className={`rounded-xl border p-3 ${selectedAd ? 'border-violet-300/35 bg-violet-400/10' : 'border-white/10 bg-white/[0.02]'}`}>
                  <div className="grid grid-cols-3 gap-1.5">{(['1:1','4:5','9:16'] as const).map((ratio) => { const asset = concept.assetIds[ratio] ? assetById.get(concept.assetIds[ratio]!) : null; return asset ? <button type="button" key={ratio} disabled={!editable || !selectedAd} onClick={() => void selectConceptAsset(concept, asset.id)} className={`overflow-hidden rounded-lg border ${selectedAd?.assetId === asset.id ? 'border-violet-300' : 'border-white/10'}`}><img src={asset.signedUrl} alt={`${concept.name} ${ratio}`} className="aspect-square h-20 w-full object-cover" /><span className="block py-1 text-[9px] text-white/45">{ratio}</span></button> : <div key={ratio} className="flex h-24 items-center justify-center rounded-lg bg-white/5 text-[9px] text-white/25">{ratio}</div>; })}</div>
                  <p className="mt-3 text-sm font-semibold text-white">{concept.name}</p><p className="mt-1 text-xs leading-relaxed text-white/45">{concept.rationale}</p><p className="mt-3 text-xs text-white/70">{concept.primaryText}</p><p className="mt-2 text-sm font-semibold text-white">{concept.headline}</p>
                  {editable && <div className="mt-3 flex gap-2"><button type="button" disabled={!selectedAd && form.ads.length >= 3} onClick={() => void chooseConcept(concept)} className={`flex-1 rounded-lg px-3 py-2 text-xs font-semibold ${selectedAd ? 'bg-rose-400/10 text-rose-200' : 'bg-violet-500 text-white'} disabled:opacity-40`}>{selectedAd ? 'Remove ad' : 'Use this ad'}</button><button type="button" onClick={() => void studio.generate(concept.id)} className="rounded-lg border border-white/10 px-2 text-white/50" aria-label={`Regenerate ${concept.name}`}><RefreshCw className="h-3.5 w-3.5" /></button></div>}
                </div>;
              })}
              {form.concepts.length === 0 && <div className="col-span-full rounded-xl border border-dashed border-white/10 p-8 text-center text-sm text-white/35">Complete the brand kit and brief, then generate concepts.</div>}
            </div>
            <div className="mt-4 rounded-xl border border-white/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3"><p className="text-xs font-semibold text-white/70">Uploaded image library</p>{editable && <label className="flex cursor-pointer items-center gap-1.5 rounded-lg border border-white/10 px-3 py-2 text-xs text-white/60"><Upload className="h-3.5 w-3.5" /> Upload image<input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" onChange={(event) => { const file = event.target.files?.[0]; if (file) void studio.upload(file); }} /></label>}</div>
              <div className="mt-3 flex gap-2 overflow-x-auto">{studio.assets.filter((asset) => asset.source === 'upload').map((asset) => <div key={asset.id} className="min-w-24"><img src={asset.signedUrl} alt={asset.fileName} className="h-20 w-20 rounded-lg border border-white/10 object-cover" />{editable && <button type="button" disabled={form.ads.length >= 3} onClick={() => void addUploadedAsset(asset.id)} className="mt-1 rounded-md border border-white/10 px-2 py-1 text-[9px] text-white/55 disabled:opacity-35">Use in ad</button>}</div>)}{studio.assets.every((asset) => asset.source !== 'upload') && <p className="text-xs text-white/30">No uploads yet.</p>}</div>
            </div>

            <div className="mt-4 rounded-xl border border-white/10 bg-black/10 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><p className="text-xs font-semibold text-white/75">Selected ads ({form.ads.length}/3)</p><p className="mt-1 text-[10px] text-white/35">Review and edit every image and line of copy before preflight.</p></div>
                {editable && form.ads.length > 0 && <button type="button" disabled={studio.busy} onClick={() => void studio.saveDraft({ ads: form.ads })} className="rounded-lg bg-white/8 px-3 py-2 text-xs font-semibold text-white/70"><Save className="mr-1 inline h-3.5 w-3.5" /> Save selected ads</button>}
              </div>
              <div className="mt-4 space-y-4">
                {form.ads.map((ad, index) => {
                  const asset = assetById.get(ad.assetId);
                  return <div key={ad.id} className="grid gap-4 rounded-xl border border-white/10 bg-white/[0.02] p-4 lg:grid-cols-[160px_1fr]">
                    <div>
                      {asset ? <img src={asset.signedUrl} alt={ad.name} className="aspect-square w-full rounded-lg border border-white/10 object-cover" /> : <div className="flex aspect-square items-center justify-center rounded-lg border border-dashed border-rose-300/25 text-xs text-rose-200">Image missing</div>}
                      <p className="mt-2 text-[10px] text-white/35">{asset?.source === 'gemini' ? 'Gemini-generated' : 'Uploaded'}{asset?.aspectRatio ? ` · ${asset.aspectRatio}` : ''}</p>
                    </div>
                    <div className="grid gap-3 lg:grid-cols-2">
                      <label className={labelClass}>Ad name<input disabled={!editable} className={inputClass} value={ad.name} onChange={(event) => editAd(ad.id, { name: event.target.value })} /></label>
                      <label className={labelClass}>Image<select disabled={!editable} className={inputClass} value={ad.assetId} onChange={(event) => editAd(ad.id, { assetId: event.target.value })}>{studio.assets.map((option) => <option key={option.id} value={option.id}>{option.fileName} · {option.aspectRatio || 'custom'} · {option.source}</option>)}</select></label>
                      <label className={`${labelClass} lg:col-span-2`}>Primary text<textarea disabled={!editable} className={`${inputClass} min-h-24`} maxLength={500} value={ad.primaryText} onChange={(event) => editAd(ad.id, { primaryText: event.target.value })} /></label>
                      <label className={labelClass}>Headline<input disabled={!editable} className={inputClass} maxLength={100} value={ad.headline} onChange={(event) => editAd(ad.id, { headline: event.target.value })} /></label>
                      <label className={labelClass}>Description<input disabled={!editable} className={inputClass} maxLength={150} value={ad.description} onChange={(event) => editAd(ad.id, { description: event.target.value })} /></label>
                      <label className={labelClass}>Call to action<select disabled={!editable} className={inputClass} value={ad.callToAction} onChange={(event) => editAd(ad.id, { callToAction: event.target.value as typeof ad.callToAction })}>{['LEARN_MORE','SHOP_NOW','SIGN_UP','CONTACT_US','GET_QUOTE'].map((value) => <option key={value}>{value}</option>)}</select></label>
                      {editable && <div className="flex items-end justify-end"><button type="button" onClick={() => void persistAds(form.ads.filter((item) => item.id !== ad.id))} className="rounded-lg px-3 py-2 text-xs text-rose-200/70">Remove ad {index + 1}</button></div>}
                    </div>
                  </div>;
                })}
                {form.ads.length === 0 && <p className="rounded-lg border border-dashed border-white/10 p-5 text-center text-xs text-white/30">Choose a generated concept or an uploaded image to build the final ads.</p>}
              </div>
            </div>
          </GlassCard>

          <GlassCard>
            <div className="flex flex-wrap items-center justify-between gap-3"><div><SectionTitle icon={ShieldCheck}>3. Review, publish paused, then launch</SectionTitle><p className="text-xs text-white/40">Every statement below is reproducible from the saved draft snapshot.</p></div><span className={`rounded-full border px-2 py-1 text-[10px] uppercase tracking-wide ${statusTone(studio.selected.status)}`}>{studio.selected.status.replace(/_/g, ' ')}</span></div>
            {studio.selected.preflight ? <div className="mt-4 space-y-2">{studio.selected.preflight.issues.length === 0 ? <div className="rounded-lg border border-emerald-300/20 bg-emerald-300/10 p-3 text-xs text-emerald-100"><CheckCircle2 className="mr-2 inline h-3.5 w-3.5" />Preflight passed for snapshot {studio.selected.preflight.snapshotHash.slice(0, 10)}.</div> : studio.selected.preflight.issues.map((item) => <div key={`${item.code}-${item.field}`} className={`rounded-lg border p-3 text-xs ${item.severity === 'blocking' ? 'border-rose-300/20 bg-rose-300/10 text-rose-100' : 'border-amber-300/20 bg-amber-300/10 text-amber-100'}`}>{item.message}</div>)}</div> : <p className="mt-4 text-xs text-white/35">Run preflight after saving the setup and selecting ads.</p>}
            <div className="mt-4 flex flex-wrap gap-2">
              {editable && <button type="button" disabled={studio.busy} onClick={() => void studio.preflight()} className="rounded-lg border border-white/10 px-3 py-2 text-xs font-semibold text-white/65">Run preflight</button>}
              {editable && studio.selected.preflight?.ready && <button type="button" disabled={studio.busy} onClick={() => void studio.submit()} className="flex items-center gap-1.5 rounded-lg bg-violet-500 px-3 py-2 text-xs font-semibold text-white"><Send className="h-3.5 w-3.5" /> Submit for paused publication</button>}
              {studio.selected.status === 'submitted' && canApprove && <button type="button" disabled={studio.busy || Boolean(activeJob)} onClick={() => void studio.approvePublish(approvalNote)} className="flex items-center gap-1.5 rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold text-black"><ShieldCheck className="h-3.5 w-3.5" /> Approve & publish paused</button>}
              {studio.selected.status === 'published_paused' && canApprove && readiness.launchEnabled && <button type="button" disabled={studio.busy || Boolean(activeJob)} onClick={() => void studio.approveLaunch(approvalNote)} className="flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-black"><Play className="h-3.5 w-3.5" /> Approve launch</button>}
              {['active','scheduled','pending_meta_review','launching'].includes(studio.selected.status) && canExecute && <button type="button" disabled={studio.busy || Boolean(activeJob)} onClick={() => void studio.pause()} className="flex items-center gap-1.5 rounded-lg bg-rose-500 px-3 py-2 text-xs font-semibold text-white"><Pause className="h-3.5 w-3.5" /> Emergency pause</button>}
              {canWrite && !['cancelled','active','scheduled','pending_meta_review','generating','publishing','launching'].includes(studio.selected.status) && <button type="button" onClick={() => void studio.cancel('requirements_changed')} className="rounded-lg px-3 py-2 text-xs text-rose-200/65">Cancel</button>}
            </div>
            {(studio.selected.status === 'submitted' || studio.selected.status === 'published_paused') && canApprove && <label className={`${labelClass} mt-4 block max-w-xl`}>Approval note (optional)<input className={inputClass} value={approvalNote} onChange={(event) => setApprovalNote(event.target.value)} /></label>}
            {(activeJob || activeCreativeJob) && <div className="mt-4 rounded-lg border border-cyan-300/20 bg-cyan-300/10 p-3 text-xs text-cyan-100"><Loader2 className="mr-2 inline h-3.5 w-3.5 animate-spin" />A durable background job is running. It will resume safely after a worker restart.</div>}
            {studio.selected.metaObjects.campaignId && <a href={`https://www.facebook.com/adsmanager/manage/campaigns?act=${encodeURIComponent(studio.selected.accountId.replace(/^act_/, ''))}&selected_campaign_ids=${encodeURIComponent(studio.selected.metaObjects.campaignId)}`} target="_blank" rel="noreferrer" className="mt-4 inline-flex items-center gap-1.5 text-xs font-semibold text-violet-200">Open exact campaign in Ads Manager <ExternalLink className="h-3.5 w-3.5" /></a>}
          </GlassCard>

          {studio.selected.events && studio.selected.events.length > 0 && <GlassCard><SectionTitle>Audit timeline</SectionTitle><div className="space-y-3">{studio.selected.events.map((event) => <div key={event.id} className="flex gap-3 border-l border-white/10 pl-3"><div><p className="text-xs font-semibold text-white/65">{event.type.replace(/_/g, ' ')}</p><p className="mt-1 text-[10px] text-white/30">{event.actorName || 'System'} · {new Date(event.createdAt).toLocaleString()}</p></div></div>)}</div></GlassCard>}
        </>
      )}
    </div>
  );
}
