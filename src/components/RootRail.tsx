import { useEffect, useState } from 'react';
import { AppState, TaskId } from '../types';
import { LayoutResult, NODE_HEIGHT, NODE_WIDTH } from '../model/layout';
import { colorForRoot, readableText } from '../model/colors';

interface Props {
  state: AppState;
  layout: LayoutResult;
  scrollRef: React.RefObject<HTMLDivElement>;
  onSelect: (id: TaskId) => void;
}

interface PinnedChip {
  id: TaskId;
  top: number;
}

export function RootRail({ state, layout, scrollRef, onSelect }: Props) {
  const [pinned, setPinned] = useState<PinnedChip[]>([]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;

    const recompute = () => {
      const next: PinnedChip[] = [];
      const rightEdge = el.scrollLeft + el.clientWidth;
      for (const id of state.rootOrder) {
        const pos = layout.positions[id];
        if (!pos) continue;
        const nodeRight = pos.x + NODE_WIDTH;
        if (nodeRight > rightEdge) {
          next.push({ id, top: pos.y - el.scrollTop });
        }
      }
      setPinned(next);
    };

    recompute();
    el.addEventListener('scroll', recompute);
    window.addEventListener('resize', recompute);
    return () => {
      el.removeEventListener('scroll', recompute);
      window.removeEventListener('resize', recompute);
    };
  }, [state.rootOrder, layout, scrollRef]);

  if (pinned.length === 0) return null;

  return (
    <aside className="root-rail">
      {pinned.map(({ id, top }) => {
        const task = state.tasks[id];
        if (!task) return null;
        const rootIndex = state.rootOrder.indexOf(id);
        const color = colorForRoot(rootIndex);
        return (
          <button
            key={id}
            className="rail-chip"
            style={{
              top,
              height: NODE_HEIGHT,
              background: color,
              color: readableText(color),
              opacity: task.softDeleted ? 0.5 : 1,
              textDecoration: task.completed ? 'line-through' : undefined,
            }}
            onClick={() => onSelect(id)}
            title={task.title || 'Untitled'}
          >
            <span className="rail-chip-arrow" aria-hidden>
              »
            </span>
            <span className="rail-chip-text">{task.title || 'Untitled'}</span>
          </button>
        );
      })}
    </aside>
  );
}
