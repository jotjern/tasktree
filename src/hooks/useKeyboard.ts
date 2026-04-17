import { useEffect, useRef } from 'react';
import { AppState, TaskId } from '../types';
import { LayoutResult } from '../model/layout';
import { Direction, neighbor } from '../model/navigation';
import { UseTasks } from './useTasks';

interface Args {
  tasks: UseTasks;
  state: AppState;
  layout: LayoutResult;
}

const INITIAL_DELAY_MS = 315;
const REPEAT_INTERVAL_MS = 93;

function detectDirection(e: KeyboardEvent): Direction | null {
  if (e.key === 'ArrowLeft') return 'left';
  if (e.key === 'ArrowRight') return 'right';
  if (e.key === 'ArrowUp') return 'up';
  if (e.key === 'ArrowDown') return 'down';
  if (e.key.length === 1) {
    const k = e.key.toLowerCase();
    if (k === 'a') return 'left';
    if (k === 'd') return 'right';
    if (k === 'w') return 'up';
    if (k === 's') return 'down';
  }
  return null;
}

function isWasdKey(e: KeyboardEvent): boolean {
  if (e.key.length !== 1) return false;
  const k = e.key.toLowerCase();
  return k === 'w' || k === 'a' || k === 's' || k === 'd';
}

export function useKeyboard({ tasks, state, layout }: Args): void {
  const stateRef = useRef(state);
  const layoutRef = useRef(layout);
  const tasksRef = useRef(tasks);
  stateRef.current = state;
  layoutRef.current = layout;
  tasksRef.current = tasks;

  useEffect(() => {
    const timers = new Map<Direction, number>();

    const fireDirection = (dir: Direction) => {
      const s = stateRef.current;
      const l = layoutRef.current;
      const t = tasksRef.current;
      if (t.editingId !== null) return;
      const selected: TaskId | null = s.selectedId;
      if (!selected) {
        const first = s.rootOrder[0] ?? Object.keys(s.tasks)[0];
        if (first) t.select(first);
        return;
      }
      const next = neighbor(s, l, selected, dir);
      if (next) t.select(next);
    };

    const scheduleRepeat = (dir: Direction) => {
      fireDirection(dir);
      const tid = window.setTimeout(() => scheduleRepeat(dir), REPEAT_INTERVAL_MS);
      timers.set(dir, tid);
    };

    const startPress = (dir: Direction) => {
      if (timers.has(dir)) return;
      fireDirection(dir);
      const tid = window.setTimeout(() => scheduleRepeat(dir), INITIAL_DELAY_MS);
      timers.set(dir, tid);
    };

    const stopPress = (dir: Direction) => {
      const tid = timers.get(dir);
      if (tid !== undefined) {
        clearTimeout(tid);
        timers.delete(dir);
      }
    };

    const clearAll = () => {
      for (const tid of timers.values()) clearTimeout(tid);
      timers.clear();
    };

    const onKey = (e: KeyboardEvent) => {
      if (isEditable(document.activeElement)) return;
      if (tasksRef.current.editingId !== null) return;

      const dir = detectDirection(e);
      if (dir) {
        const hasModifier = e.metaKey || e.ctrlKey || e.altKey || e.shiftKey;
        if (isWasdKey(e) && hasModifier) return;
        if (e.repeat) {
          e.preventDefault();
          return;
        }
        startPress(dir);
        e.preventDefault();
        return;
      }

      const s = stateRef.current;
      const t = tasksRef.current;
      const selected = s.selectedId;

      if (e.key === ' ') {
        if (selected) t.toggleComplete(selected);
        e.preventDefault();
        return;
      }

      if (e.key === 'Backspace') {
        if (selected) {
          if (e.shiftKey) t.restore(selected);
          else t.backspace(selected);
        }
        e.preventDefault();
        return;
      }

      if (e.key === 'Enter') {
        if (e.metaKey || e.ctrlKey) {
          if (e.shiftKey) {
            t.newRoot();
            e.preventDefault();
            return;
          }
        }
        if (e.shiftKey) {
          t.newSubtask(selected);
          e.preventDefault();
          return;
        }
        if (selected) t.startEditing(selected);
        e.preventDefault();
        return;
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      const dir = detectDirection(e);
      if (dir) stopPress(dir);
    };

    const onBlur = () => clearAll();

    window.addEventListener('keydown', onKey);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);

    return () => {
      clearAll();
      window.removeEventListener('keydown', onKey);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);
}

function isEditable(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  return (
    tag === 'INPUT' ||
    tag === 'TEXTAREA' ||
    (el as HTMLElement).isContentEditable === true
  );
}
