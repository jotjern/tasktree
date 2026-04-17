import { useMemo, useRef } from 'react';
import { useTasks } from './hooks/useTasks';
import { useKeyboard } from './hooks/useKeyboard';
import { useCloudSync } from './hooks/useCloudSync';
import { computeLayout } from './model/layout';
import { Graph } from './components/Graph';
import { RootRail } from './components/RootRail';

const SHORTCUTS: [string, string][] = [
  ['Arrows / WASD', 'Move between tasks'],
  ['Space', 'Complete / uncomplete'],
  ['Enter', 'Rename'],
  ['Shift + Enter', 'New subtask'],
  ['⌘ / Ctrl + Shift + Enter', 'New root task'],
  ['Backspace', 'Soft delete (again: hard delete)'],
  ['Shift + Backspace', 'Restore soft-deleted task'],
];

const STATUS_LABELS: Record<string, string> = {
  signed_out: 'Sign in',
  connecting: 'Connecting…',
  idle: 'Synced',
  syncing: 'Syncing…',
  error: 'Sync error',
};

export default function App() {
  const tasks = useTasks();
  const sync = useCloudSync(tasks);
  const layout = useMemo(() => computeLayout(tasks.state), [tasks.state]);
  const scrollRef = useRef<HTMLDivElement>(null);

  useKeyboard({ tasks, state: tasks.state, layout });

  const empty = tasks.state.rootOrder.length === 0;

  return (
    <div className="app">
      <div className="scroll-area" ref={scrollRef}>
        {empty ? (
          <div className="empty">
            <p>No tasks yet.</p>
            <p>
              Press <kbd>⌘</kbd>+<kbd>⇧</kbd>+<kbd>⏎</kbd> to create your first root task.
            </p>
          </div>
        ) : (
          <Graph state={tasks.state} layout={layout} tasks={tasks} scrollRef={scrollRef} />
        )}
      </div>
      <RootRail
        state={tasks.state}
        layout={layout}
        scrollRef={scrollRef}
        onSelect={(id) => tasks.select(id)}
      />
      <div className="sync-indicator">
        {sync.status === 'signed_out' ? (
          <button className="sync-button" onClick={sync.signIn}>
            Sign in with GitHub
          </button>
        ) : (
          <button
            className={`sync-button sync-button--${sync.status}`}
            onClick={sync.signOut}
            title={sync.error ?? 'Click to sign out'}
          >
            <span className={`sync-dot sync-dot--${sync.status}`} />
            {STATUS_LABELS[sync.status]}
          </button>
        )}
      </div>
      <div className="help-button" tabIndex={0} aria-label="Keyboard shortcuts">
        ?
        <div className="help-tooltip" role="tooltip">
          <strong>Shortcuts</strong>
          <ul>
            {SHORTCUTS.map(([keys, desc]) => (
              <li key={keys}>
                <span className="help-keys">{keys}</span>
                <span className="help-desc">{desc}</span>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
