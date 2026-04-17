import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, WorkspaceSnapshot, emptyState } from '../types';
import { UseTasks } from './useTasks';
import { UseWorkspaces } from './useWorkspaces';
import { clearToken, getToken, handleCallback, startLogin } from '../cloud/auth';
import { clearGistId, findOrCreateGist, pullGist, pushGist } from '../cloud/gist';
import {
  decodeWorkspaceMarkdown,
  encodeWorkspaceMarkdown,
  getMarkdownUpdatedAt,
} from '../cloud/markdown';
import {
  loadSyncUpdatedAt,
  loadWorkspaceSnapshot,
  saveSyncUpdatedAt,
  saveWorkspaceSnapshot,
} from '../storage';

export type SyncStatus = 'signed_out' | 'connecting' | 'idle' | 'syncing' | 'error';

export interface UseCloudSync {
  status: SyncStatus;
  error: string | null;
  signedIn: boolean;
  signIn: () => void;
  signOut: () => void;
}

const PUSH_DEBOUNCE_MS = 1500;
const FOCUS_RESYNC_MS = 60_000;

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

function snapshotContent(snapshot: WorkspaceSnapshot): string {
  return encodeWorkspaceMarkdown(snapshot, 0);
}

function inferSnapshotUpdatedAt(snapshot: WorkspaceSnapshot): number {
  let updatedAt = 0;
  for (const state of Object.values(snapshot.states)) {
    for (const task of Object.values(state.tasks)) {
      if (task.createdAt > updatedAt) updatedAt = task.createdAt;
    }
  }
  return updatedAt;
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
  const syncInFlightRef = useRef<Promise<void> | null>(null);
  const unfocusedAtRef = useRef<number | null>(null);
  const tasksRef = useRef(tasks);
  const workspacesRef = useRef(workspaces);
  const snapshotRef = useRef(loadWorkspaceSnapshot(workspaces.index, tasks.state));
  tasksRef.current = tasks;
  workspacesRef.current = workspaces;
  snapshotRef.current = loadWorkspaceSnapshot(workspaces.index, tasks.state);
  const localUpdatedAtRef = useRef(
    loadSyncUpdatedAt() || inferSnapshotUpdatedAt(snapshotRef.current),
  );
  const snapshotContentRef = useRef(snapshotContent(snapshotRef.current));

  useEffect(() => {
    const nextSnapshot = loadWorkspaceSnapshot(workspaces.index, tasks.state);
    const nextContent = snapshotContent(nextSnapshot);
    if (nextContent === snapshotContentRef.current) return;

    snapshotContentRef.current = nextContent;
    const updatedAt = Date.now();
    localUpdatedAtRef.current = updatedAt;
    saveSyncUpdatedAt(updatedAt);
  }, [tasks.state, workspaces.index]);

  const runTimestampSync = useCallback(async () => {
    const existing = syncInFlightRef.current;
    if (existing) return existing;

    const sync = (async () => {
      const token = getToken();
      if (!token) {
        setStatus('signed_out');
        return;
      }

      const gistId = gistIdRef.current ?? (await findOrCreateGist(token));
      gistIdRef.current = gistId;
      console.log('[sync] using gist', gistId);

      const remote = await pullGist(token, gistId);
      console.log('[sync] pulled gist, length:', remote.length);
      const localSnapshot = snapshotRef.current;
      const localUpdatedAt = localUpdatedAtRef.current || inferSnapshotUpdatedAt(localSnapshot);

      const pushLocal = async () => {
        console.log('[sync] pushing local workspaces to gist');
        const updatedAt = localUpdatedAt || Date.now();
        localUpdatedAtRef.current = updatedAt;
        saveSyncUpdatedAt(updatedAt);
        const md = encodeWorkspaceMarkdown(localSnapshot, updatedAt);
        await pushGist(token, gistId, md);
        lastPushedRef.current = md;
      };

      if (hasRemoteContent(remote)) {
        const parsed = decodeWorkspaceMarkdown(remote, workspacesRef.current.activeWorkspace);
        const remoteUpdatedAt = getMarkdownUpdatedAt(remote) ?? inferSnapshotUpdatedAt(parsed);

        if (remoteUpdatedAt > localUpdatedAt) {
          console.log('[sync] applying newer remote workspaces');
          saveWorkspaceSnapshot(parsed);
          saveSyncUpdatedAt(remoteUpdatedAt);
          localUpdatedAtRef.current = remoteUpdatedAt;
          snapshotContentRef.current = snapshotContent(parsed);
          workspacesRef.current.replaceIndex(parsed.index);
          tasksRef.current.replaceState(parsed.states[parsed.index.activeId] ?? emptyState());
          lastPushedRef.current = remote;
        } else {
          await pushLocal();
        }
      } else if (hasSnapshotContent(localSnapshot)) {
        await pushLocal();
      } else {
        lastPushedRef.current = encodeWorkspaceMarkdown(localSnapshot, localUpdatedAt);
      }
    })();

    syncInFlightRef.current = sync;
    try {
      await sync;
    } finally {
      syncInFlightRef.current = null;
    }
  }, []);

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
        await runTimestampSync();
        setStatus('idle');
      } catch (e) {
        console.error('[sync] init failed:', e);
        setError((e as Error).message);
        setStatus('error');
      }
    })();
  }, [runTimestampSync]);

  useEffect(() => {
    const markUnfocused = () => {
      unfocusedAtRef.current = Date.now();
    };
    const maybeSyncOnFocus = () => {
      const unfocusedAt = unfocusedAtRef.current;
      if (unfocusedAt === null) return;
      unfocusedAtRef.current = null;
      if (Date.now() - unfocusedAt < FOCUS_RESYNC_MS) return;
      if (!getToken()) return;

      setStatus('syncing');
      runTimestampSync()
        .then(() => setStatus('idle'))
        .catch((e) => {
          console.error('[sync] focus resume failed:', e);
          setError((e as Error).message);
          setStatus('error');
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'hidden') markUnfocused();
      if (document.visibilityState === 'visible') maybeSyncOnFocus();
    };

    window.addEventListener('blur', markUnfocused);
    window.addEventListener('focus', maybeSyncOnFocus);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => {
      window.removeEventListener('blur', markUnfocused);
      window.removeEventListener('focus', maybeSyncOnFocus);
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    };
  }, [runTimestampSync]);

  useEffect(() => {
    if (status !== 'idle' && status !== 'syncing') return;
    const token = getToken();
    const gistId = gistIdRef.current;
    if (!token || !gistId) return;

    const updatedAt = localUpdatedAtRef.current || Date.now();
    localUpdatedAtRef.current = updatedAt;
    saveSyncUpdatedAt(updatedAt);
    const md = encodeWorkspaceMarkdown(
      loadWorkspaceSnapshot(workspaces.index, tasks.state),
      updatedAt,
    );
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
