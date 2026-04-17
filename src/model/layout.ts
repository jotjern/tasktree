import { AppState, TaskId } from '../types';

export const COL_WIDTH = 220;
export const ROW_HEIGHT = 56;
export const NODE_WIDTH = 180;
export const NODE_HEIGHT = 40;
export const PADDING = 40;

export interface NodePosition {
  x: number;
  y: number;
  col: number;
  row: number;
}

export interface LayoutResult {
  positions: Record<TaskId, NodePosition>;
  width: number;
  height: number;
  maxCol: number;
}

export function computeLayout(state: AppState): LayoutResult {
  const positions: Record<TaskId, NodePosition> = {};
  const depthFromLeaf: Record<TaskId, number> = {};

  const computeDepth = (id: TaskId, seen: Set<TaskId>): number => {
    if (depthFromLeaf[id] !== undefined) return depthFromLeaf[id];
    if (seen.has(id)) return 0;
    seen.add(id);
    const children = state.childOrder[id] ?? [];
    if (children.length === 0) {
      depthFromLeaf[id] = 0;
      return 0;
    }
    let max = 0;
    for (const childId of children) {
      const d = computeDepth(childId, seen);
      if (d + 1 > max) max = d + 1;
    }
    depthFromLeaf[id] = max;
    return max;
  };

  for (const id of Object.keys(state.tasks)) computeDepth(id, new Set());

  let maxCol = 0;
  for (const id of Object.keys(depthFromLeaf)) {
    if (depthFromLeaf[id] > maxCol) maxCol = depthFromLeaf[id];
  }

  let rowCursor = 0;
  const rowFor: Record<TaskId, number> = {};

  const visit = (id: TaskId): number => {
    const children = state.childOrder[id] ?? [];
    if (children.length === 0) {
      const row = rowCursor++;
      rowFor[id] = row;
      return row;
    }
    const childRows = children.map(visit);
    const avg = (childRows[0] + childRows[childRows.length - 1]) / 2;
    rowFor[id] = avg;
    return avg;
  };

  for (const rootId of state.rootOrder) visit(rootId);

  for (const id of Object.keys(state.tasks)) {
    const col = depthFromLeaf[id];
    const row = rowFor[id] ?? 0;
    positions[id] = {
      col,
      row,
      x: PADDING + col * COL_WIDTH,
      y: PADDING + row * ROW_HEIGHT,
    };
  }

  const width = PADDING * 2 + maxCol * COL_WIDTH + NODE_WIDTH;
  const height = PADDING * 2 + Math.max(0, rowCursor - 1) * ROW_HEIGHT + NODE_HEIGHT;

  return { positions, width, height, maxCol };
}
