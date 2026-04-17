import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState } from '../types';
import { UseTasks } from './useTasks';
import { clearToken, getToken, handleCallback, startLogin } from '../cloud/auth';
import { clearGistId, findOrCreateGist, pullGist, pushGist } from '../cloud/gist';
import { decodeMarkdown, encodeMarkdown } from '../cloud/markdown';

export type SyncStatus = 'signed_out' | 'connecting' | 'idle' | 'syncing' | 'error';

export interface UseCloudSync {
  status: SyncStatus;
  error: string | null;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

const PUSH_DEBOUNCE_MS = 1500;

function hasContent(state: AppState): boolean {
  return state.rootOrder.length > 0 || Object.keys(state.tasks).length > 0;
}

export function useCloudSync(tasks: UseTasks): UseCloudSync {
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (getToken()) return 'connecting';
    if (new URLSearchParams(window.location.search).get('code')) return 'connecting';
    return 'signed_out';
  });
  const [error, setError] = useState<string | null>(null);
  const gistIdRef = useRef<string | null>(null);
  const lastPushedRef = useRef<string>('');
  const initializedRef = useRef(false);
  const stateRef = useRef(tasks.state);
  stateRef.current = tasks.state;

  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    (async () => {
      try {
        await handleCallback();
      } catch (e) {
        console.error('[sync] oauth callback failed:', e);
        setError((e as Error).message);
        setStatus('error');
        return;
      }

      const token = getToken();
      if (!token) {
        setStatus('signed_out');
        return;
      }

      setStatus('connecting');
      try {
        console.log('[sync] finding or creating gist…');
        const gistId = await findOrCreateGist(token);
        gistIdRef.current = gistId;
        console.log('[sync] using gist', gistId);

        const remote = await pullGist(token, gistId);
        console.log('[sync] pulled gist, length:', remote.length);
        const remoteHasContent = /^\s*-\s*\[[ xX]\]/m.test(remote);
        const local = stateRef.current;

        if (remoteHasContent) {
          console.log('[sync] applying remote state');
          const parsed = decodeMarkdown(remote);
          tasks.replaceState(parsed);
          lastPushedRef.current = remote;
        } else if (hasContent(local)) {
          console.log('[sync] pushing local state to empty gist');
          const md = encodeMarkdown(local);
          await pushGist(token, gistId, md);
          lastPushedRef.current = md;
        } else {
          lastPushedRef.current = remote;
        }
        setStatus('idle');
      } catch (e) {
        console.error('[sync] init failed:', e);
        setError((e as Error).message);
        setStatus('error');
      }
    })();
  }, [tasks]);

  useEffect(() => {
    if (status !== 'idle' && status !== 'syncing') return;
    const token = getToken();
    const gistId = gistIdRef.current;
    if (!token || !gistId) return;

    const md = encodeMarkdown(tasks.state);
    if (md === lastPushedRef.current) return;

    const handle = window.setTimeout(async () => {
      setStatus('syncing');
      try {
        await pushGist(token, gistId, md);
        lastPushedRef.current = md;
        setStatus('idle');
      } catch (e) {
        console.error('[sync] push failed:', e);
        setError((e as Error).message);
        setStatus('error');
      }
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [tasks.state, status]);

  const signIn = useCallback(() => {
    setError(null);
    startLogin();
  }, []);

  const signOut = useCallback(() => {
    clearToken();
    clearGistId();
    gistIdRef.current = null;
    lastPushedRef.current = '';
    setStatus('signed_out');
    setError(null);
  }, []);

  return {
    status,
    error,
    signedIn: status !== 'signed_out',
    signIn,
    signOut,
  };
}
