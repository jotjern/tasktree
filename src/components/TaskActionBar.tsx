import { Task } from '../types';
import { NODE_HEIGHT, NODE_WIDTH } from '../model/layout';
import { GREEN, readableText } from '../model/colors';

export const ACTION_BAR_HEIGHT = 30;
export const ACTION_PLUS_SIZE = 36;
export const ACTION_PLUS_GAP = 6;

interface Props {
  task: Task;
  x: number;
  y: number;
  color: string;
  onRename: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onAddSubtask: () => void;
}

export function TaskActionBar({
  task,
  x,
  y,
  color,
  onRename,
  onToggleComplete,
  onDelete,
  onAddSubtask,
}: Props) {
  const effectiveColor = task.completed ? GREEN : color;
  const text = readableText(effectiveColor);
  const barStyle: React.CSSProperties = {
    transform: `translate(${x}px, ${y - ACTION_BAR_HEIGHT + 2}px)`,
    width: NODE_WIDTH,
    height: ACTION_BAR_HEIGHT,
    background: effectiveColor,
    color: text,
  };
  const plusStyle: React.CSSProperties = {
    transform: `translate(${x - ACTION_PLUS_SIZE - ACTION_PLUS_GAP}px, ${y + (NODE_HEIGHT - ACTION_PLUS_SIZE) / 2}px)`,
    width: ACTION_PLUS_SIZE,
    height: ACTION_PLUS_SIZE,
    background: effectiveColor,
    color: text,
  };
  const stop = (fn: () => void) => (e: React.MouseEvent) => {
    e.stopPropagation();
    fn();
  };
  return (
    <>
      <button
        className="task-action-plus"
        style={plusStyle}
        onClick={stop(onAddSubtask)}
        aria-label="Add subtask"
        title="Add subtask"
      >
        +
      </button>
      <div className="task-action-bar" style={barStyle}>
        <button
          className="task-action-btn"
          onClick={stop(onRename)}
          aria-label="Rename"
          title="Rename"
        >
          ✎
        </button>
        <button
          className="task-action-btn"
          onClick={stop(onToggleComplete)}
          aria-label={task.completed ? 'Uncomplete' : 'Complete'}
          title={task.completed ? 'Uncomplete' : 'Complete'}
        >
          ✓
        </button>
        <button
          className="task-action-btn"
          onClick={stop(onDelete)}
          aria-label="Delete"
          title="Delete"
        >
          ×
        </button>
      </div>
    </>
  );
}
