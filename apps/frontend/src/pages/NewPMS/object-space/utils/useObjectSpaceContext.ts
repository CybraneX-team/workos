import { useEffect, useState } from 'react';
import { objectSpaceContextApi, type ObjectSpaceContext } from '../../../../lib/db/objectSpaceContext';

export type ContextState =
  | { status: 'idle' | 'loading' }
  | { status: 'ready'; data: ObjectSpaceContext }
  // Signed out (public prototype routes) or the backend is unreachable: the form falls back to free text.
  | { status: 'unavailable' };

let cached: ObjectSpaceContext | null = null;
let pending: Promise<ObjectSpaceContext> | null = null;

/** Loads the context once per page load, and only after `enabled` first becomes true. */
export function useObjectSpaceContext(enabled: boolean): ContextState {
  const [state, setState] = useState<ContextState>(cached ? { status: 'ready', data: cached } : { status: 'idle' });

  useEffect(() => {
    if (!enabled || state.status === 'ready' || state.status === 'unavailable') return;
    let cancelled = false;
    setState({ status: 'loading' });
    pending ??= objectSpaceContextApi.get().finally(() => {
      pending = null;
    });
    pending
      .then((data) => {
        cached = data;
        if (!cancelled) setState({ status: 'ready', data });
      })
      .catch(() => {
        if (!cancelled) setState({ status: 'unavailable' });
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled]);

  return state;
}
