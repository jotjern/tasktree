import { useEffect, useRef, useState } from 'react';
import { WorkspaceIndex } from '../types';

interface Props {
  index: WorkspaceIndex;
  onSwitch: (id: string) => void;
  onCreate: (name: string) => void;
  onRename: (id: string, name: string) => void;
  onRemove: (id: string) => void;
}

export function WorkspaceSelector({ index, onSwitch, onCreate, onRename, onRemove }: Props) {
  const [open, setOpen] = useState(false);
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(e.target as Node)) setOpen(false);
    };
    window.addEventListener('mousedown', onDown);
    return () => window.removeEventListener('mousedown', onDown);
  }, [open]);

  const active = index.workspaces.find((w) => w.id === index.activeId) ?? index.workspaces[0];
  const canDelete = index.workspaces.length > 1;

  const startRename = (id: string, name: string) => {
    setRenamingId(id);
    setDraft(name);
  };

  const commitRename = () => {
    if (renamingId) onRename(renamingId, draft);
    setRenamingId(null);
  };

  const handleCreate = () => {
    const name = window.prompt('New workspace name', 'Untitled');
    if (name === null) return;
    onCreate(name);
    setOpen(false);
  };

  const handleDelete = (id: string, name: string) => {
    if (!window.confirm(`Delete workspace "${name}"? This removes its tasks locally.`)) return;
    onRemove(id);
  };

  return (
    <div className="workspace-selector" ref={rootRef}>
      <button
        className="workspace-trigger"
        onClick={() => setOpen((v) => !v)}
        title={`Workspace: ${active.name}`}
      >
        <span className="workspace-trigger-icon" aria-hidden>▾</span>
        <span className="workspace-trigger-name">{active.name}</span>
      </button>
      {open && (
        <div className="workspace-menu" role="menu">
          <div className="workspace-menu-list">
            {index.workspaces.map((w) => (
              <div
                key={w.id}
                className={`workspace-item${w.id === index.activeId ? ' workspace-item--active' : ''}`}
              >
                {renamingId === w.id ? (
                  <input
                    autoFocus
                    className="workspace-rename-input"
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') commitRename();
                      else if (e.key === 'Escape') setRenamingId(null);
                      e.stopPropagation();
                    }}
                    onBlur={commitRename}
                  />
                ) : (
                  <button
                    className="workspace-item-name"
                    onClick={() => {
                      onSwitch(w.id);
                      setOpen(false);
                    }}
                    onDoubleClick={() => startRename(w.id, w.name)}
                    title="Click to switch · double-click to rename"
                  >
                    {w.id === index.activeId ? '● ' : '○ '}
                    {w.name}
                  </button>
                )}
                {canDelete && renamingId !== w.id && (
                  <button
                    className="workspace-item-delete"
                    onClick={() => handleDelete(w.id, w.name)}
                    aria-label={`Delete ${w.name}`}
                    title={`Delete ${w.name}`}
                  >
                    ×
                  </button>
                )}
              </div>
            ))}
          </div>
          <button className="workspace-add" onClick={handleCreate}>
            + New workspace
          </button>
        </div>
      )}
    </div>
  );
}
