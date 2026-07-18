import { useCallback, useEffect, useState } from 'react';
import type {
  MetaAdsAuthoringReadiness,
  MetaAdsBrandKit,
  MetaAdsCampaignDraft,
  MetaAdsCampaignDraftContent,
  MetaAdsCampaignJob,
  MetaAdsCreativeAsset,
  MetaAdsCreativeGenerationJob,
} from '@cybranex/shared-types';
import {
  approveMetaAdsCampaignLaunch,
  approveMetaAdsCampaignPublish,
  cancelMetaAdsCampaign,
  cloneMetaAdsCampaign,
  createMetaAdsCampaignDraft,
  fetchMetaAdsAuthoringReadiness,
  fetchMetaAdsBrandKit,
  fetchMetaAdsCampaignDraft,
  fetchMetaAdsCampaignDrafts,
  fetchMetaAdsCampaignJob,
  fetchMetaAdsCreativeAssets,
  fetchMetaAdsCreativeJob,
  generateMetaAdsCreative,
  pauseMetaAdsPublishedCampaign,
  preflightMetaAdsCampaign,
  saveMetaAdsBrandKit,
  submitMetaAdsCampaign,
  updateMetaAdsCampaignDraft,
  uploadMetaAdsCreative,
} from './service';

function key(prefix: string) {
  return `${prefix}-${crypto.randomUUID()}`;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function useMetaAdsCampaignStudio() {
  const [readiness, setReadiness] = useState<MetaAdsAuthoringReadiness | null>(null);
  const [brandKit, setBrandKit] = useState<MetaAdsBrandKit | null>(null);
  const [assets, setAssets] = useState<MetaAdsCreativeAsset[]>([]);
  const [drafts, setDrafts] = useState<MetaAdsCampaignDraft[]>([]);
  const [selected, setSelected] = useState<MetaAdsCampaignDraft | null>(null);
  const [creativeJob, setCreativeJob] = useState<MetaAdsCreativeGenerationJob | null>(null);
  const [campaignJob, setCampaignJob] = useState<MetaAdsCampaignJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const selectedId = selected?.id;

  const load = useCallback(async (preferredDraftId?: string) => {
    setLoading(true);
    setError(null);
    try {
      const [nextReadiness, nextBrand, nextAssets, nextDrafts] = await Promise.all([
        fetchMetaAdsAuthoringReadiness(), fetchMetaAdsBrandKit(), fetchMetaAdsCreativeAssets(), fetchMetaAdsCampaignDrafts(),
      ]);
      setReadiness(nextReadiness); setBrandKit(nextBrand); setAssets(nextAssets); setDrafts(nextDrafts);
      const id = preferredDraftId ?? selectedId ?? nextDrafts[0]?.id;
      if (id) setSelected(await fetchMetaAdsCampaignDraft(id));
      else setSelected(null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
    } finally {
      setLoading(false);
    }
  }, [selectedId]);

  useEffect(() => {
    const timeout = window.setTimeout(() => { void load(); }, 0);
    return () => window.clearTimeout(timeout);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(async <T,>(operation: () => Promise<T>): Promise<T | null> => {
    setBusy(true); setError(null);
    try { return await operation(); }
    catch (cause) { setError(cause instanceof Error ? cause.message : String(cause)); return null; }
    finally { setBusy(false); }
  }, []);

  const open = useCallback(async (draftId: string) => {
    const draft = await act(() => fetchMetaAdsCampaignDraft(draftId));
    if (draft) setSelected(draft);
  }, [act]);

  const create = useCallback(async () => {
    const draft = await act(() => createMetaAdsCampaignDraft());
    if (draft) { setSelected(draft); await load(draft.id); }
  }, [act, load]);

  const saveBrand = useCallback(async (value: Omit<MetaAdsBrandKit, 'updatedAt'>) => {
    const saved = await act(() => saveMetaAdsBrandKit(value));
    if (saved) setBrandKit(saved);
    return saved;
  }, [act]);

  const saveDraft = useCallback(async (patch: Partial<MetaAdsCampaignDraftContent>) => {
    if (!selected) return null;
    const saved = await act(() => updateMetaAdsCampaignDraft(selected.id, selected.version, patch));
    if (saved) {
      setSelected(saved);
      setDrafts((values) => values.map((draft) => draft.id === saved.id ? saved : draft));
    }
    return saved;
  }, [act, selected]);

  const upload = useCallback(async (file: File) => {
    const asset = await act(() => uploadMetaAdsCreative(file));
    if (asset) setAssets((values) => [asset, ...values]);
    return asset;
  }, [act]);

  const pollCreative = useCallback(async (job: MetaAdsCreativeGenerationJob) => {
    let current = job;
    for (let poll = 0; poll < 180 && ['pending', 'running'].includes(current.status); poll += 1) {
      await wait(1_000);
      current = await fetchMetaAdsCreativeJob(current.id);
      setCreativeJob(current);
    }
    await load(job.draftId);
    if (current.status === 'failed') setError(current.error || 'Creative generation failed.');
  }, [load]);

  const generate = useCallback(async (replaceConceptId?: string) => {
    if (!selected) return;
    const job = await act(() => generateMetaAdsCreative(selected.id, {
      expectedVersion: selected.version, replaceConceptId, idempotencyKey: key('creative'),
    }));
    if (job) { setCreativeJob(job); void pollCreative(job); }
  }, [act, pollCreative, selected]);

  const preflight = useCallback(async () => {
    if (!selected) return null;
    const result = await act(() => preflightMetaAdsCampaign(selected.id));
    if (result) setSelected((draft) => draft ? { ...draft, preflight: result } : draft);
    return result;
  }, [act, selected]);

  const submit = useCallback(async () => {
    if (!selected) return;
    const draft = await act(() => submitMetaAdsCampaign(selected.id, selected.version));
    if (draft) setSelected(draft);
  }, [act, selected]);

  const pollCampaign = useCallback(async (job: MetaAdsCampaignJob) => {
    let current = job;
    for (let poll = 0; poll < 240 && ['pending', 'running'].includes(current.status); poll += 1) {
      await wait(1_000);
      current = await fetchMetaAdsCampaignJob(current.id);
      setCampaignJob(current);
    }
    await load(job.draftId);
    if (current.status === 'failed') setError(current.error || 'Meta campaign operation failed.');
  }, [load]);

  const approvePublish = useCallback(async (note?: string) => {
    if (!selected) return;
    const result = await act(() => approveMetaAdsCampaignPublish(selected.id, { note, idempotencyKey: key('publish') }));
    if (result) { setSelected(result.draft); setCampaignJob(result.job); void pollCampaign(result.job); }
  }, [act, pollCampaign, selected]);

  const approveLaunch = useCallback(async (note?: string) => {
    if (!selected) return;
    const result = await act(() => approveMetaAdsCampaignLaunch(selected.id, { note, idempotencyKey: key('launch') }));
    if (result) { setSelected(result.draft); setCampaignJob(result.job); void pollCampaign(result.job); }
  }, [act, pollCampaign, selected]);

  const pause = useCallback(async () => {
    if (!selected) return;
    const result = await act(() => pauseMetaAdsPublishedCampaign(selected.id, key('pause')));
    if (result) {
      setSelected(result.draft);
      if (result.job) { setCampaignJob(result.job); void pollCampaign(result.job); }
    }
  }, [act, pollCampaign, selected]);

  const clone = useCallback(async () => {
    if (!selected) return;
    const draft = await act(() => cloneMetaAdsCampaign(selected.id));
    if (draft) await load(draft.id);
  }, [act, load, selected]);

  const cancel = useCallback(async (reason: string, note?: string) => {
    if (!selected) return;
    const draft = await act(() => cancelMetaAdsCampaign(selected.id, { reason, note, idempotencyKey: key('cancel') }));
    if (draft) setSelected(draft);
  }, [act, selected]);

  return {
    readiness, brandKit, assets, drafts, selected, creativeJob, campaignJob, loading, busy, error,
    load, open, create, saveBrand, saveDraft, upload, generate, preflight, submit, approvePublish, approveLaunch, pause, clone, cancel,
  };
}
