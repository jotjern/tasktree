import { AppState, WorkspaceIndex, WorkspaceSnapshot, emptyState } from './types';

const INDEX_KEY = 'taskdag:workspaces';
const LEGACY_KEY = 'taskdag:v1';
const SYNC_UPDATED_AT_KEY = 'taskdag:sync_updated_at';

const workspaceKey = (id: string) => `taskdag:ws:${id}`;

export function loadIndex(): WorkspaceIndex {
  try {
    const raw = localStorage.getItem(INDEX_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as Partial<WorkspaceIndex>;
      if (parsed.version === 2 && parsed.workspaces && parsed.workspaces.length > 0) {
        const activeId = parsed.workspaces.some((w) => w.id === parsed.activeId)
          ? parsed.activeId!
          : parsed.workspaces[0].id;
        return { workspaces: parsed.workspaces, activeId, version: 2 };
      }
    }
  } catch {}
  return migrateOrCreateDefault();
}

function migrateOrCreateDefault(): WorkspaceIndex {
  const id = crypto.randomUUID();
  const index: WorkspaceIndex = {
    workspaces: [{ id, name: 'Default' }],
    activeId: id,
    version: 2,
  };
  const legacy = localStorage.getItem(LEGACY_KEY);
  if (legacy) {
    try {
      const state = JSON.parse(legacy) as Partial<AppState>;
      if (state.version === 1) {
        localStorage.setItem(workspaceKey(id), legacy);
        localStorage.setItem(`taskdag:backup:v1:${Date.now()}`, legacy);
        localStorage.removeItem(LEGACY_KEY);
      }
    } catch {}
  }
  saveIndex(index);
  return index;
}

export function saveIndex(index: WorkspaceIndex): void {
  localStorage.setItem(INDEX_KEY, JSON.stringify(index));
}

export function loadWorkspaceState(id: string): AppState {
  try {
    const raw = localStorage.getItem(workspaceKey(id));
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1) return emptyState();
    return {
      tasks: parsed.tasks ?? {},
      rootOrder: parsed.rootOrder ?? [],
      childOrder: parsed.childOrder ?? {},
      selectedId: parsed.selectedId ?? null,
      version: 1,
    };
  } catch {
    return emptyState();
  }
}

export function saveWorkspaceState(id: string, state: AppState): void {
  localStorage.setItem(workspaceKey(id), JSON.stringify(state));
}

export function loadWorkspaceSnapshot(
  index: WorkspaceIndex,
  activeState?: AppState,
): WorkspaceSnapshot {
  const states: Record<string, AppState> = {};
  for (const workspace of index.workspaces) {
    states[workspace.id] =
      workspace.id === index.activeId && activeState ? activeState : loadWorkspaceState(workspace.id);
  }
  return { index, states };
}

export function saveWorkspaceSnapshot(snapshot: WorkspaceSnapshot): void {
  saveIndex(snapshot.index);
  for (const workspace of snapshot.index.workspaces) {
    saveWorkspaceState(workspace.id, snapshot.states[workspace.id] ?? emptyState());
  }
}

export function loadSyncUpdatedAt(): number {
  const raw = localStorage.getItem(SYNC_UPDATED_AT_KEY);
  if (!raw) return 0;
  const value = Number(raw);
  return Number.isFinite(value) && value >= 0 ? value : 0;
}

export function saveSyncUpdatedAt(updatedAt: number): void {
  localStorage.setItem(SYNC_UPDATED_AT_KEY, String(Math.max(0, Math.floor(updatedAt))));
}

export function deleteWorkspaceState(id: string): void {
  localStorage.removeItem(workspaceKey(id));
}
