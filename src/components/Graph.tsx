import { useEffect, useMemo, useRef } from 'react';
import { AppState, TaskId } from '../types';
import {
  LayoutResult,
  NODE_HEIGHT,
  NODE_WIDTH,
} from '../model/layout';
import { colorForRoot, tintForDepth } from '../model/colors';
import { depthFromRoot, findRootOf } from '../model/tree';
import { TaskNode } from './TaskNode';
import { TaskActionBar, ACTION_BAR_HEIGHT } from './TaskActionBar';
import { UseTasks } from '../hooks/useTasks';
import { useIsTouch } from '../hooks/useIsTouch';

interface Props {
  state: AppState;
  layout: LayoutResult;
  tasks: UseTasks;
  scrollRef: React.RefObject<HTMLDivElement>;
}

export function Graph({ state, layout, tasks, scrollRef }: Props) {
  const isTouch = useIsTouch();
  const nodeColors = useMemo(() => {
    const rootIndex: Record<TaskId, number> = {};
    state.rootOrder.forEach((id, i) => {
      rootIndex[id] = i;
    });
    const colors: Record<TaskId, string> = {};
    for (const id of Object.keys(state.tasks)) {
      const rootId = findRootOf(state, id);
      const base = rootId ? colorForRoot(rootIndex[rootId] ?? 0) : '#888';
      const depth = rootId ? depthFromRoot(state, id) : 0;
      colors[id] = tintForDepth(base, depth);
    }
    return colors;
  }, [state]);

  const progress = useMemo(() => {
    const cache: Record<TaskId, { done: number; total: number }> = {};
    const visit = (id: TaskId): { done: number; total: number } => {
      if (cache[id]) return cache[id];
      const children = state.childOrder[id] ?? [];
      let done = 0;
      let total = 0;
      for (const cid of children) {
        const child = state.tasks[cid];
        if (!child || child.softDeleted) continue;
        total += 1;
        if (child.completed) done += 1;
        const sub = visit(cid);
        done += sub.done;
        total += sub.total;
      }
      cache[id] = { done, total };
      return cache[id];
    };
    for (const id of Object.keys(state.tasks)) visit(id);
    return cache;
  }, [state]);

  const prevSelected = useRef<TaskId | null>(null);
  useEffect(() => {
    if (state.selectedId && state.selectedId !== prevSelected.current) {
      const pos = layout.positions[state.selectedId];
      const el = scrollRef.current;
      if (pos && el) {
        const left = pos.x - el.clientWidth / 2 + NODE_WIDTH / 2;
        const top = pos.y - el.clientHeight / 2 + NODE_HEIGHT / 2;
        el.scrollTo({ left, top, behavior: 'smooth' });
      }
    }
    prevSelected.current = state.selectedId;
  }, [state.selectedId, layout, scrollRef]);

  const edges: { id: string; d: string; stroke: string }[] = [];
  for (const id of Object.keys(state.tasks)) {
    const task = state.tasks[id];
    if (!task.parentId) continue;
    const from = layout.positions[id];
    const to = layout.positions[task.parentId];
    if (!from || !to) continue;
    const x1 = from.x + NODE_WIDTH;
    const y1 = from.y + NODE_HEIGHT / 2;
    const x2 = to.x;
    const y2 = to.y + NODE_HEIGHT / 2;
    const mx = (x1 + x2) / 2;
    edges.push({
      id: `${id}->${task.parentId}`,
      d: `M ${x1} ${y1} C ${mx} ${y1} ${mx} ${y2} ${x2} ${y2}`,
      stroke: nodeColors[id] ?? '#888',
    });
  }

  return (
    <div className="graph-canvas" style={{ width: layout.width, height: layout.height }}>
      <svg
        className="graph-edges"
        width={layout.width}
        height={layout.height}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
      >
        {edges.map((e) => (
          <path
            key={e.id}
            d={e.d}
            fill="none"
            stroke={e.stroke}
            strokeWidth={2}
            strokeOpacity={0.65}
          />
        ))}
      </svg>
      {(() => {
        const framedId =
          isTouch && state.selectedId && tasks.editingId !== state.selectedId
            ? state.selectedId
            : null;
        const framedPos = framedId ? layout.positions[framedId] : null;
        const frame = framedId && framedPos && (
          <div
            className="task-selection-frame"
            style={{
              transform: `translate(${framedPos.x}px, ${framedPos.y - ACTION_BAR_HEIGHT}px)`,
              width: NODE_WIDTH,
              height: ACTION_BAR_HEIGHT + NODE_HEIGHT,
            }}
          />
        );
        return (
          <>
            {frame}
            {Object.keys(state.tasks).map((id) => {
              const task = state.tasks[id];
              const pos = layout.positions[id];
              if (!pos) return null;
              const stats = progress[id] ?? { done: 0, total: 0 };
              return (
                <TaskNode
                  key={id}
                  task={task}
                  x={pos.x}
                  y={pos.y}
                  color={nodeColors[id]}
                  selected={state.selectedId === id}
                  editing={tasks.editingId === id}
                  isRoot={task.parentId === null}
                  descendantsDone={stats.done}
                  descendantsTotal={stats.total}
                  framed={framedId === id}
                  onSelect={() => tasks.select(id)}
                  onCommit={(title) => tasks.commitRename(id, title)}
                  onCancel={() => tasks.stopEditing()}
                />
              );
            })}
            {framedId &&
              framedPos &&
              (() => {
                const task = state.tasks[framedId];
                if (!task) return null;
                return (
                  <TaskActionBar
                    task={task}
                    x={framedPos.x}
                    y={framedPos.y}
                    color={nodeColors[framedId] ?? '#888'}
                    onRename={() => tasks.startEditing(framedId)}
                    onToggleComplete={() => tasks.toggleComplete(framedId)}
                    onDelete={() => tasks.backspace(framedId)}
                    onRestore={() => tasks.restore(framedId)}
                    onAddSubtask={() => tasks.newSubtask(framedId)}
                  />
                );
              })()}
          </>
        );
      })()}
    </div>
  );
}
