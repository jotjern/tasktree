import { AppState, TaskId } from '../types';
import { LayoutResult } from './layout';

export type Direction = 'left' | 'right' | 'up' | 'down';

export function neighbor(
  state: AppState,
  layout: LayoutResult,
  selectedId: TaskId,
  direction: Direction,
): TaskId | null {
  const task = state.tasks[selectedId];
  if (!task) return null;
  const pos = layout.positions[selectedId];
  if (!pos) return null;

  if (direction === 'right' && task.parentId) return task.parentId;
  if (direction === 'left') {
    const children = state.childOrder[selectedId] ?? [];
    if (children.length > 0) {
      const best = nearestByRow(children, layout, pos.row);
      if (best) return best;
    }
  }

  return nearestInDirection(state, layout, selectedId, pos, direction);
}

function nearestInDirection(
  state: AppState,
  layout: LayoutResult,
  fromId: TaskId,
  from: { col: number; row: number },
  direction: Direction,
): TaskId | null {
  let bestId: TaskId | null = null;
  let bestScore = Infinity;
  for (const id of Object.keys(layout.positions)) {
    if (id === fromId) continue;
    if (!state.tasks[id]) continue;
    const p = layout.positions[id];
    let forward = 0;
    let perp = 0;
    switch (direction) {
      case 'right':
        forward = p.col - from.col;
        perp = p.row - from.row;
        break;
      case 'left':
        forward = from.col - p.col;
        perp = p.row - from.row;
        break;
      case 'up':
        forward = from.row - p.row;
        perp = p.col - from.col;
        break;
      case 'down':
        forward = p.row - from.row;
        perp = p.col - from.col;
        break;
    }
    if (forward <= 0) continue;
    const score = forward + 1.5 * Math.abs(perp);
    if (score < bestScore) {
      bestScore = score;
      bestId = id;
    }
  }
  return bestId;
}

function nearestByRow(ids: TaskId[], layout: LayoutResult, row: number): TaskId | null {
  let best: TaskId | null = null;
  let bestDist = Infinity;
  for (const id of ids) {
    const p = layout.positions[id];
    if (!p) continue;
    const d = Math.abs(p.row - row);
    if (d < bestDist) {
      bestDist = d;
      best = id;
    }
  }
  return best;
}
