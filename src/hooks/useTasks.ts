import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { AppState, TaskId } from '../types';
import { loadState, saveState } from '../storage';
import * as tree from '../model/tree';

export interface UseTasks {
  state: AppState;
  editingId: TaskId | null;
  startEditing: (id: TaskId) => void;
  stopEditing: () => void;
  commitRename: (id: TaskId, title: string) => void;
  select: (id: TaskId | null) => void;
  toggleComplete: (id: TaskId) => void;
  backspace: (id: TaskId) => void;
  restore: (id: TaskId) => void;
  newSubtask: (parentId: TaskId | null) => void;
  newRoot: () => void;
  replaceState: (next: AppState) => void;
}

export function useTasks(): UseTasks {
  const [state, setState] = useState<AppState>(() => loadState());
  const [editingId, setEditingId] = useState<TaskId | null>(null);
  const timer = useRef<number | null>(null);

  useEffect(() => {
    if (timer.current !== null) window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => saveState(state), 150);
    return () => {
      if (timer.current !== null) window.clearTimeout(timer.current);
    };
  }, [state]);

  const prevCompletedRoots = useRef<Set<TaskId> | null>(null);
  useEffect(() => {
    const current = new Set<TaskId>();
    for (const id of state.rootOrder) {
      const task = state.tasks[id];
      if (task?.completed && !task.softDeleted) current.add(id);
    }
    if (prevCompletedRoots.current !== null) {
      for (const id of current) {
        if (!prevCompletedRoots.current.has(id)) fireRootConfetti();
      }
    }
    prevCompletedRoots.current = current;
  }, [state.rootOrder, state.tasks]);

  const select = useCallback((id: TaskId | null) => {
    setState((s) => ({ ...s, selectedId: id }));
  }, []);

  const startEditing = useCallback((id: TaskId) => setEditingId(id), []);
  const stopEditing = useCallback(() => setEditingId(null), []);

  const commitRename = useCallback((id: TaskId, title: string) => {
    setState((s) => tree.rename(s, id, title.trim() || 'Untitled'));
    setEditingId(null);
  }, []);

  const toggleComplete = useCallback((id: TaskId) => {
    setState((s) => tree.toggleComplete(s, id));
  }, []);

  const backspace = useCallback((id: TaskId) => {
    setState((s) => {
      const task = s.tasks[id];
      if (!task) return s;
      if (!task.softDeleted) return tree.softDelete(s, id);
      const nextSelected = pickNextSelected(s, id);
      const after = tree.hardDelete(s, id);
      return { ...after, selectedId: nextSelected };
    });
  }, []);

  const restore = useCallback((id: TaskId) => {
    setState((s) => tree.restore(s, id));
  }, []);

  const newSubtask = useCallback((parentId: TaskId | null) => {
    setState((s) => {
      if (parentId === null) {
        const { state: next, id } = tree.addRoot(s, '');
        setEditingId(id);
        return { ...next, selectedId: id };
      }
      const { state: next, id } = tree.addSubtask(s, parentId, '');
      setEditingId(id);
      return { ...next, selectedId: id };
    });
  }, []);

  const newRoot = useCallback(() => {
    setState((s) => {
      const { state: next, id } = tree.addRoot(s, '');
      setEditingId(id);
      return { ...next, selectedId: id };
    });
  }, []);

  const replaceState = useCallback((next: AppState) => {
    setState(next);
  }, []);

  return {
    state,
    editingId,
    startEditing,
    stopEditing,
    commitRename,
    select,
    toggleComplete,
    backspace,
    restore,
    newSubtask,
    newRoot,
    replaceState,
  };
}

function fireRootConfetti(): void {
  const colors = ['#22c55e', '#f59e0b', '#ef6f6c', '#4f6df5', '#ec4899', '#2ec4b6'];
  const end = performance.now() + 700;
  const frame = () => {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 60,
      startVelocity: 55,
      origin: { x: 0, y: 0.9 },
      colors,
      disableForReducedMotion: true,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 60,
      startVelocity: 55,
      origin: { x: 1, y: 0.9 },
      colors,
      disableForReducedMotion: true,
    });
    if (performance.now() < end) requestAnimationFrame(frame);
  };
  requestAnimationFrame(frame);
}

function pickNextSelected(state: AppState, removedId: TaskId): TaskId | null {
  const task = state.tasks[removedId];
  if (!task) return null;
  if (task.parentId) {
    const siblings = state.childOrder[task.parentId] ?? [];
    const idx = siblings.indexOf(removedId);
    const neighbor = siblings[idx + 1] ?? siblings[idx - 1] ?? task.parentId;
    return neighbor ?? null;
  }
  const idx = state.rootOrder.indexOf(removedId);
  return state.rootOrder[idx + 1] ?? state.rootOrder[idx - 1] ?? null;
}
