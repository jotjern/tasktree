import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, TaskId, WorkspaceSnapshot, emptyState } from '../types';
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
  loadCloudBaselineUpdatedAt,
  loadSyncUpdatedAt,
  loadWorkspaceSnapshot,
  saveCloudBaselineUpdatedAt,
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

function mergeSnapshots(remote: WorkspaceSnapshot, local: WorkspaceSnapshot): WorkspaceSnapshot {
  const states: WorkspaceSnapshot['states'] = { ...remote.states };
  const workspaces = [...remote.index.workspaces];
  const remoteIds = new Set(workspaces.map((workspace) => workspace.id));

  for (const localWorkspace of local.index.workspaces) {
    const remoteState = states[localWorkspace.id];
    const localState = local.states[localWorkspace.id] ?? emptyState();
    if (remoteState) {
      states[localWorkspace.id] = mergeStates(remoteState, localState);
      continue;
    }

    const name = remoteIds.has(localWorkspace.id)
      ? `${localWorkspace.name} (local)`
      : localWorkspace.name;
    workspaces.push({ ...localWorkspace, name });
    states[localWorkspace.id] = localState;
    remoteIds.add(localWorkspace.id);
  }

  return {
    index: {
      workspaces,
      activeId: remote.index.activeId,
      version: 2,
    },
    states,
  };
}

function mergeStates(remote: AppState, local: AppState): AppState {
  const tasks = { ...remote.tasks };
  const childOrder: Record<TaskId, TaskId[]> = {};
  const rootOrder = [...remote.rootOrder];

  for (const [id, children] of Object.entries(remote.childOrder)) {
    childOrder[id] = [...children];
  }

  for (const [id, task] of Object.entries(local.tasks)) {
    if (tasks[id]) continue;
    tasks[id] = task;
    childOrder[id] = [...(local.childOrder[id] ?? [])];
  }

  for (const [id, children] of Object.entries(local.childOrder)) {
    if (!tasks[id]) continue;
    const merged = childOrder[id] ? [...childOrder[id]] : [];
    for (const childId of children) {
      if (tasks[childId] && !merged.includes(childId)) merged.push(childId);
    }
    childOrder[id] = merged;
  }

  for (const rootId of local.rootOrder) {
    if (tasks[rootId] && !rootOrder.includes(rootId)) rootOrder.push(rootId);
  }

  return {
    tasks,
    rootOrder,
    childOrder,
    selectedId: remote.selectedId,
    version: 1,
  };
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
      const baselineUpdatedAt = loadCloudBaselineUpdatedAt(gistId);
      const localChangedSinceBaseline = localUpdatedAt > baselineUpdatedAt;

      const pushLocal = async () => {
        console.log('[sync] pushing local workspaces to gist');
        const updatedAt = localUpdatedAt || Date.now();
        localUpdatedAtRef.current = updatedAt;
        saveSyncUpdatedAt(updatedAt);
        saveCloudBaselineUpdatedAt(gistId, updatedAt);
        const md = encodeWorkspaceMarkdown(localSnapshot, updatedAt);
        await pushGist(token, gistId, md);
        lastPushedRef.current = md;
      };

      const applyRemote = (snapshot: WorkspaceSnapshot, updatedAt: number, markdown: string) => {
        saveWorkspaceSnapshot(snapshot);
        saveSyncUpdatedAt(updatedAt);
        saveCloudBaselineUpdatedAt(gistId, updatedAt);
        localUpdatedAtRef.current = updatedAt;
        snapshotContentRef.current = snapshotContent(snapshot);
        workspacesRef.current.replaceIndex(snapshot.index);
        tasksRef.current.replaceState(snapshot.states[snapshot.index.activeId] ?? emptyState());
        lastPushedRef.current = markdown;
      };

      const pushMerged = async (remoteSnapshot: WorkspaceSnapshot, remoteUpdatedAt: number) => {
        console.log('[sync] merging local changes with newer cloud save');
        const merged = mergeSnapshots(remoteSnapshot, localSnapshot);
        const updatedAt = Math.max(Date.now(), localUpdatedAt, remoteUpdatedAt) + 1;
        const md = encodeWorkspaceMarkdown(merged, updatedAt);
        await pushGist(token, gistId, md);
        saveWorkspaceSnapshot(merged);
        saveSyncUpdatedAt(updatedAt);
        saveCloudBaselineUpdatedAt(gistId, updatedAt);
        localUpdatedAtRef.current = updatedAt;
        snapshotContentRef.current = snapshotContent(merged);
        workspacesRef.current.replaceIndex(merged.index);
        tasksRef.current.replaceState(merged.states[merged.index.activeId] ?? emptyState());
        lastPushedRef.current = md;
      };

      if (hasRemoteContent(remote)) {
        const parsed = decodeWorkspaceMarkdown(remote, workspacesRef.current.activeWorkspace);
        const remoteUpdatedAt = getMarkdownUpdatedAt(remote) ?? inferSnapshotUpdatedAt(parsed);
        const remoteChangedSinceBaseline = remoteUpdatedAt > baselineUpdatedAt;

        if (remoteChangedSinceBaseline && localChangedSinceBaseline) {
          await pushMerged(parsed, remoteUpdatedAt);
        } else if (remoteUpdatedAt > localUpdatedAt || !localChangedSinceBaseline) {
          console.log('[sync] applying newer remote workspaces');
          applyRemote(parsed, remoteUpdatedAt, remote);
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
        await runTimestampSync();
        setStatus('idle');
      } catch (e) {
        console.error('[sync] push failed:', e);
        setError((e as Error).message);
        setStatus('error');
      }
    }, PUSH_DEBOUNCE_MS);

    return () => window.clearTimeout(handle);
  }, [tasks.state, workspaces.index, status, runTimestampSync]);

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
