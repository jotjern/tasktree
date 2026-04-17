import { AppState, emptyState } from './types';

const KEY = 'taskdag:v1';

export function loadState(): AppState {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw) as Partial<AppState>;
    if (parsed.version !== 1) {
      localStorage.setItem(`taskdag:backup:${Date.now()}`, raw);
      return emptyState();
    }
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

export function saveState(state: AppState): void {
  localStorage.setItem(KEY, JSON.stringify(state));
}
