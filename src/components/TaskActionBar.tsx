import { Task } from '../types';
import { NODE_HEIGHT, NODE_WIDTH } from '../model/layout';
import { readableText } from '../model/colors';

export const ACTION_BAR_HEIGHT = 30;
export const ACTION_PLUS_SIZE = 30;
export const ACTION_PLUS_GAP = 8;

interface Props {
  task: Task;
  x: number;
  y: number;
  color: string;
  onRename: () => void;
  onToggleComplete: () => void;
  onDelete: () => void;
  onRestore: () => void;
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
  onRestore,
  onAddSubtask,
}: Props) {
  const textColor = readableText(color);
  const barStyle: React.CSSProperties = {
    transform: `translate(${x}px, ${y - ACTION_BAR_HEIGHT}px)`,
    width: NODE_WIDTH,
    height: ACTION_BAR_HEIGHT,
    background: color,
    color: textColor,
  };
  const plusStyle: React.CSSProperties = {
    transform: `translate(${x - ACTION_PLUS_SIZE - ACTION_PLUS_GAP}px, ${y - ACTION_BAR_HEIGHT + (ACTION_BAR_HEIGHT + NODE_HEIGHT - ACTION_PLUS_SIZE) / 2}px)`,
    width: ACTION_PLUS_SIZE,
    height: ACTION_PLUS_SIZE,
    background: color,
    color: textColor,
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
        <svg
          viewBox="0 0 24 24"
          width="16"
          height="16"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          aria-hidden="true"
        >
          <path d="M12 5v14" />
          <path d="M5 12h14" />
        </svg>
      </button>
      <div className="task-action-bar" style={barStyle}>
        <button
          className="task-action-btn"
          onClick={stop(onRename)}
          aria-label="Rename"
          title="Rename"
        >
          <svg
            viewBox="0 0 24 24"
            width="16"
            height="16"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M4 20h4L19 9l-4-4L4 16z" />
          </svg>
        </button>
        {task.softDeleted ? (
          <button
            className="task-action-btn"
            onClick={stop(onRestore)}
            aria-label="Restore"
            title="Restore"
          >
            <svg
              viewBox="0 0 24 24"
              width="16"
              height="16"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M3 12a9 9 0 1 0 3-6.7" />
              <path d="M3 4v5h5" />
            </svg>
          </button>
        ) : (
          <button
            className="task-action-btn"
            onClick={stop(onToggleComplete)}
            aria-label={task.completed ? 'Uncomplete' : 'Complete'}
            title={task.completed ? 'Uncomplete' : 'Complete'}
          >
            ✓
          </button>
        )}
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
