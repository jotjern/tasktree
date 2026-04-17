import { useCallback, useEffect, useState } from 'react';
import { WorkspaceIndex, WorkspaceMeta } from '../types';
import { deleteWorkspaceState, loadIndex, saveIndex } from '../storage';

export interface UseWorkspaces {
  index: WorkspaceIndex;
  activeWorkspace: WorkspaceMeta;
  switchTo: (id: string) => void;
  create: (name: string) => string;
  rename: (id: string, name: string) => void;
  remove: (id: string) => void;
  replaceIndex: (next: WorkspaceIndex) => void;
}

export function useWorkspaces(): UseWorkspaces {
  const [index, setIndex] = useState<WorkspaceIndex>(() => loadIndex());

  useEffect(() => {
    saveIndex(index);
  }, [index]);

  const switchTo = useCallback((id: string) => {
    setIndex((i) => (i.workspaces.some((w) => w.id === id) ? { ...i, activeId: id } : i));
  }, []);

  const create = useCallback((name: string): string => {
    const id = crypto.randomUUID();
    const trimmed = name.trim() || 'Untitled';
    setIndex((i) => ({
      ...i,
      workspaces: [...i.workspaces, { id, name: trimmed }],
      activeId: id,
    }));
    return id;
  }, []);

  const rename = useCallback((id: string, name: string) => {
    const trimmed = name.trim() || 'Untitled';
    setIndex((i) => ({
      ...i,
      workspaces: i.workspaces.map((w) => (w.id === id ? { ...w, name: trimmed } : w)),
    }));
  }, []);

  const remove = useCallback((id: string) => {
    setIndex((i) => {
      if (i.workspaces.length <= 1) return i;
      const workspaces = i.workspaces.filter((w) => w.id !== id);
      const activeId = i.activeId === id ? workspaces[0].id : i.activeId;
      deleteWorkspaceState(id);
      return { ...i, workspaces, activeId };
    });
  }, []);

  const replaceIndex = useCallback((next: WorkspaceIndex) => {
    setIndex(next);
  }, []);

  const activeWorkspace =
    index.workspaces.find((w) => w.id === index.activeId) ?? index.workspaces[0];

  return { index, activeWorkspace, switchTo, create, rename, remove, replaceIndex };
}
