import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, WorkspaceSnapshot, emptyState } from '../types';
import { UseTasks } from './useTasks';
import { UseWorkspaces } from './useWorkspaces';
import { clearToken, getToken, handleCallback, startLogin } from '../cloud/auth';
import { clearGistId, findOrCreateGist, pullGist, pushGist } from '../cloud/gist';
import { decodeWorkspaceMarkdown, encodeWorkspaceMarkdown } from '../cloud/markdown';
import { loadWorkspaceSnapshot, saveWorkspaceSnapshot } from '../storage';

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

function hasSnapshotContent(snapshot: WorkspaceSnapshot): boolean {
  return (
    snapshot.index.workspaces.length > 1 ||
    Object.values(snapshot.states).some((state) => hasContent(state))
  );
}

function hasRemoteContent(markdown: string): boolean {
  return /^##\s+/m.test(markdown) || /^\s*-\s*\[[ xX]\]/m.test(markdown);
}

export function useCloudSync(tasks: UseTasks, workspaces: UseWorkspaces): UseCloudSync {
  const [status, setStatus] = useState<SyncStatus>(() => {
    if (getToken()) return 'connecting';
    if (new URLSearchParams(window.location.search).get('code')) return 'connecting';
    return 'signed_out';
  });
  const [error, setError] = useState<string | null>(null);
  const gistIdRef = useRef<string | null>(null);
  const lastPushedRef = useRef<string>('');
  const initializedRef = useRef(false);
  const snapshotRef = useRef(loadWorkspaceSnapshot(workspaces.index, tasks.state));
  snapshotRef.current = loadWorkspaceSnapshot(workspaces.index, tasks.state);

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

        if (hasRemoteContent(remote)) {
          console.log('[sync] applying remote workspaces');
          const parsed = decodeWorkspaceMarkdown(remote, workspaces.activeWorkspace);
          saveWorkspaceSnapshot(parsed);
          workspaces.replaceIndex(parsed.index);
          tasks.replaceState(parsed.states[parsed.index.activeId] ?? emptyState());
          lastPushedRef.current = remote;
        } else if (hasSnapshotContent(snapshotRef.current)) {
          console.log('[sync] pushing local workspaces to empty gist');
          const md = encodeWorkspaceMarkdown(snapshotRef.current);
          await pushGist(token, gistId, md);
          lastPushedRef.current = md;
        } else {
          lastPushedRef.current = encodeWorkspaceMarkdown(snapshotRef.current);
        }
        setStatus('idle');
      } catch (e) {
        console.error('[sync] init failed:', e);
        setError((e as Error).message);
        setStatus('error');
      }
    })();
  }, [tasks, workspaces]);

  useEffect(() => {
    if (status !== 'idle' && status !== 'syncing') return;
    const token = getToken();
    const gistId = gistIdRef.current;
    if (!token || !gistId) return;

    const md = encodeWorkspaceMarkdown(loadWorkspaceSnapshot(workspaces.index, tasks.state));
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
  }, [tasks.state, workspaces.index, status]);

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
