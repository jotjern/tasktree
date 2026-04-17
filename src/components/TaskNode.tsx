import { useEffect, useRef, useState } from 'react';
import { Task } from '../types';
import { NODE_HEIGHT, NODE_WIDTH } from '../model/layout';
import { GREEN, readableText } from '../model/colors';

interface Props {
  task: Task;
  x: number;
  y: number;
  color: string;
  selected: boolean;
  editing: boolean;
  isRoot: boolean;
  descendantsDone: number;
  descendantsTotal: number;
  onSelect: () => void;
  onCommit: (title: string) => void;
  onCancel: () => void;
}

export function TaskNode({
  task,
  x,
  y,
  color,
  selected,
  editing,
  isRoot,
  descendantsDone,
  descendantsTotal,
  onSelect,
  onCommit,
  onCancel,
}: Props) {
  const [draft, setDraft] = useState(task.title);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing) {
      setDraft(task.title);
      requestAnimationFrame(() => inputRef.current?.select());
    }
  }, [editing, task.title]);

  const hasDescendants = descendantsTotal > 0;
  const progress = hasDescendants ? descendantsDone / descendantsTotal : 0;
  const allDone = hasDescendants && progress === 1 && !task.completed;

  const effectiveColor = task.completed ? GREEN : color;
  const textColor = readableText(effectiveColor);

  const style: React.CSSProperties = {
    transform: `translate(${x}px, ${y}px)`,
    width: NODE_WIDTH,
    height: NODE_HEIGHT,
    background: effectiveColor,
    color: textColor,
    opacity: task.softDeleted ? 0.45 : 1,
    filter: task.softDeleted ? 'grayscale(0.8)' : undefined,
    ['--progress' as unknown as keyof React.CSSProperties]: `${progress * 100}%`,
  };

  const classes = [
    'task-node',
    selected ? 'task-node--selected' : '',
    isRoot ? 'task-node--root' : '',
    task.completed ? 'task-node--done' : '',
    hasDescendants && !task.completed ? 'task-node--has-progress' : '',
    allDone ? 'task-node--ready' : '',
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes} style={style} onClick={onSelect}>
      {editing ? (
        <input
          ref={inputRef}
          className="task-input"
          autoFocus
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault();
              onCommit(draft);
            } else if (e.key === 'Escape') {
              e.preventDefault();
              onCancel();
            }
            e.stopPropagation();
          }}
          onBlur={() => onCommit(draft)}
        />
      ) : (
        <span className="task-title">{task.title || <em>Untitled</em>}</span>
      )}
    </div>
  );
}
