import { useCallback, useEffect, useState } from 'react';
import type { MetaAdsOperatingBrief, MetaAdsSyncRun } from '@cybranex/shared-types';
import { fetchMetaAdsBrief, fetchMetaAdsSyncRun, requestMetaAdsRefresh } from './service';

let sharedRequest: Promise<MetaAdsOperatingBrief> | null = null;

function loadShared(force = false) {
  if (force || !sharedRequest) {
    const request = fetchMetaAdsBrief();
    sharedRequest = request;
    void request.then(
      () => { if (sharedRequest === request) sharedRequest = null; },
      () => { if (sharedRequest === request) sharedRequest = null; },
    );
  }
  return sharedRequest;
}

function wait(ms: number) {
  return new Promise((resolve) => window.setTimeout(resolve, ms));
}

export function invalidateMetaAdsBrief() {
  sharedRequest = null;
}

export function useMetaAdsBrief(enabled = true) {
  const [brief, setBrief] = useState<MetaAdsOperatingBrief | null>(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState<string | null>(null);
  const [refreshRun, setRefreshRun] = useState<MetaAdsSyncRun | null>(null);

  const reload = useCallback(async (force = false) => {
    if (!enabled) return null;
    setLoading(true);
    setError(null);
    try {
      const next = await loadShared(force);
      setBrief(next);
      return next;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    } finally {
      setLoading(false);
    }
  }, [enabled]);

  useEffect(() => {
    if (!enabled) return;
    let active = true;
    loadShared()
      .then((next) => { if (active) setBrief(next); })
      .catch((cause) => { if (active) setError(cause instanceof Error ? cause.message : String(cause)); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [enabled]);

  const refresh = useCallback(async () => {
    setError(null);
    try {
      let run = await requestMetaAdsRefresh();
      setRefreshRun(run);
      let polls = 0;
      while ((run.status === 'pending' || run.status === 'running') && polls < 80) {
        await wait(1500);
        run = await fetchMetaAdsSyncRun(run.id);
        setRefreshRun(run);
        polls += 1;
      }
      invalidateMetaAdsBrief();
      await reload(true);
      if (run.status === 'failed') setError(run.error ?? 'Meta Ads refresh failed.');
      else if (run.status === 'pending' || run.status === 'running') {
        setError('Refresh is still running in the background.');
        setRefreshRun(null);
      }
      return run;
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : String(cause));
      return null;
    }
  }, [reload]);

  return { brief, loading, error, refreshRun, reload, refresh };
}
