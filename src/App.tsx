import { useMemo, useRef, useState } from 'react';
import { useTasks } from './hooks/useTasks';
import { useKeyboard } from './hooks/useKeyboard';
import { useCloudSync } from './hooks/useCloudSync';
import { useWorkspaces } from './hooks/useWorkspaces';
import { computeLayout } from './model/layout';
import { Graph } from './components/Graph';
import { RootRail } from './components/RootRail';
import { WorkspaceSelector } from './components/WorkspaceSelector';
import logoUrl from '../logo.png';

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

const HELP_HIDDEN_KEY = 'taskdag:hide_shortcuts';

export default function App() {
  const workspaces = useWorkspaces();
  const tasks = useTasks(workspaces.activeWorkspace.id);
  const sync = useCloudSync(tasks, workspaces);
  const layout = useMemo(() => computeLayout(tasks.state), [tasks.state]);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [helpHidden, setHelpHidden] = useState<boolean>(
    () => localStorage.getItem(HELP_HIDDEN_KEY) === '1',
  );

  useKeyboard({ tasks, state: tasks.state, layout });

  const dismissHelp = () => {
    localStorage.setItem(HELP_HIDDEN_KEY, '1');
    setHelpHidden(true);
  };

  const showHelp = () => {
    localStorage.removeItem(HELP_HIDDEN_KEY);
    setHelpHidden(false);
  };

  return (
    <div className="app">
      <div className="scroll-area" ref={scrollRef}>
        <Graph state={tasks.state} layout={layout} tasks={tasks} scrollRef={scrollRef} />
      </div>
      <div className="brand-mark" aria-label="TaskDAG">
        <img src={logoUrl} alt="" />
      </div>
      <RootRail
        state={tasks.state}
        layout={layout}
        scrollRef={scrollRef}
        onSelect={(id) => tasks.select(id)}
      />
      <div className="storage-indicator">
        {sync.status === 'signed_out' ? (
          <button
            className="storage-button storage-button--local"
            onClick={sync.signIn}
            title="Saving to this browser only — click to sync to GitHub"
          >
            <span className="storage-dot storage-dot--local" />
            Local only · Sign in with GitHub
          </button>
        ) : (
          <button
            className={`storage-button storage-button--cloud storage-button--${sync.status}`}
            onClick={sync.signOut}
            title={sync.error ?? 'Stored in a private GitHub Gist — click to sign out'}
          >
            <span className={`storage-dot storage-dot--${sync.status}`} />
            GitHub Gist · {STATUS_LABELS[sync.status]}
          </button>
        )}
      </div>
      <div className="bottom-right-stack">
        <WorkspaceSelector
          index={workspaces.index}
          onSwitch={workspaces.switchTo}
          onCreate={workspaces.create}
          onRename={workspaces.rename}
          onRemove={workspaces.remove}
        />
      </div>
      <div className="top-right-stack">
        {helpHidden ? (
          <button
            className="help-button"
            onClick={showHelp}
            aria-label="Show shortcuts"
            title="Show shortcuts"
          >
            ?
          </button>
        ) : (
          <div className="help-panel" role="complementary" aria-label="Keyboard shortcuts">
            <button
              className="help-close"
              onClick={dismissHelp}
              aria-label="Hide shortcuts"
              title="Hide shortcuts"
            >
              ×
            </button>
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
        )}
      </div>
    </div>
  );
}
