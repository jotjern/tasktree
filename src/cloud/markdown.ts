import {
  AppState,
  Task,
  TaskId,
  WorkspaceIndex,
  WorkspaceMeta,
  WorkspaceSnapshot,
  emptyState,
} from '../types';

export function encodeMarkdown(state: AppState): string {
  const lines: string[] = ['# TaskDAG', ''];
  lines.push(...encodeTaskLines(state));
  return lines.join('\n') + '\n';
}

export function encodeWorkspaceMarkdown(snapshot: WorkspaceSnapshot, updatedAt?: number): string {
  const lines: string[] = ['# TaskDAG'];
  if (updatedAt !== undefined) lines.push(`<!-- updated:${updatedAt} -->`);
  lines.push('');
  for (const workspace of snapshot.index.workspaces) {
    lines.push(`## ${workspace.name} <!-- workspace:${workspace.id} -->`, '');
    lines.push(...encodeTaskLines(snapshot.states[workspace.id] ?? emptyState()));
    lines.push('');
  }
  return lines.join('\n').replace(/\n+$/, '\n');
}

function encodeTaskLines(state: AppState): string[] {
  const lines: string[] = [];
  const walk = (id: TaskId, depth: number) => {
    const task = state.tasks[id];
    if (!task) return;
    const indent = '  '.repeat(depth);
    const box = task.completed ? '[x]' : '[ ]';
    const title = task.softDeleted ? `~~${task.title}~~` : task.title;
    lines.push(`${indent}- ${box} ${title} <!-- id:${task.id} ts:${task.createdAt} -->`);
    const children = state.childOrder[id] ?? [];
    for (const childId of children) walk(childId, depth + 1);
  };
  for (const rootId of state.rootOrder) walk(rootId, 0);
  return lines;
}

interface ParsedLine {
  depth: number;
  completed: boolean;
  title: string;
  id: TaskId;
  createdAt: number;
}

const LINE_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*?)(?:\s*<!--\s*id:([^\s]+)(?:\s+ts:(\d+))?\s*-->)?\s*$/;
const WORKSPACE_HEADING_RE = /^##\s*(.*?)(?:\s*<!--\s*workspace:([^\s]+)\s*-->)?\s*$/;
const UPDATED_RE = /^<!--\s*updated:(\d+)\s*-->/m;

export function decodeMarkdown(text: string): AppState {
  return decodeTaskLines(text.split(/\r?\n/));
}

export function decodeWorkspaceMarkdown(
  text: string,
  fallbackWorkspace: WorkspaceMeta,
): WorkspaceSnapshot {
  const sections = splitWorkspaceSections(text);
  if (sections.length === 0) {
    return {
      index: {
        workspaces: [fallbackWorkspace],
        activeId: fallbackWorkspace.id,
        version: 2,
      },
      states: {
        [fallbackWorkspace.id]: decodeMarkdown(text),
      },
    };
  }

  const usedIds = new Set<string>();
  const workspaces: WorkspaceMeta[] = [];
  const states: Record<string, AppState> = {};
  for (const section of sections) {
    const id = uniqueId(section.id ?? newId(), usedIds);
    usedIds.add(id);
    const name = section.name.trim() || 'Untitled';
    workspaces.push({ id, name });
    states[id] = decodeTaskLines(section.lines);
  }

  const index: WorkspaceIndex = {
    workspaces,
    activeId: workspaces.some((w) => w.id === fallbackWorkspace.id)
      ? fallbackWorkspace.id
      : workspaces[0].id,
    version: 2,
  };
  return { index, states };
}

export function getMarkdownUpdatedAt(text: string): number | null {
  const m = UPDATED_RE.exec(text);
  if (!m) return null;
  const value = Number(m[1]);
  return Number.isFinite(value) && value >= 0 ? value : null;
}

function decodeTaskLines(lines: string[]): AppState {
  const state = emptyState();
  const parsed: ParsedLine[] = [];
  for (const raw of lines) {
    const m = LINE_RE.exec(raw);
    if (!m) continue;
    const indent = m[1] ?? '';
    const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2);
    const completed = m[2].toLowerCase() === 'x';
    let title = (m[3] ?? '').trim();
    const softDeleted = /^~~.*~~$/.test(title);
    if (softDeleted) title = title.replace(/^~~/, '').replace(/~~$/, '');
    const id = m[4] ?? newId();
    const createdAt = m[5] ? Number(m[5]) : Date.now();
    parsed.push({ depth, completed, title, id, createdAt });

    const task: Task = {
      id,
      title,
      parentId: null,
      completed,
      softDeleted,
      createdAt,
    };
    state.tasks[id] = task;
    state.childOrder[id] = [];
  }

  const stack: ParsedLine[] = [];
  for (const line of parsed) {
    while (stack.length && stack[stack.length - 1].depth >= line.depth) stack.pop();
    const parent = stack[stack.length - 1];
    if (parent) {
      state.tasks[line.id].parentId = parent.id;
      state.childOrder[parent.id].push(line.id);
    } else {
      state.rootOrder.push(line.id);
    }
    stack.push(line);
  }

  return state;
}

function splitWorkspaceSections(text: string): { name: string; id: string | null; lines: string[] }[] {
  const sections: { name: string; id: string | null; lines: string[] }[] = [];
  let current: { name: string; id: string | null; lines: string[] } | null = null;

  for (const raw of text.split(/\r?\n/)) {
    const heading = WORKSPACE_HEADING_RE.exec(raw);
    if (heading) {
      current = {
        name: (heading[1] ?? '').trim(),
        id: heading[2] ?? null,
        lines: [],
      };
      sections.push(current);
    } else if (current) {
      current.lines.push(raw);
    }
  }

  return sections;
}

function uniqueId(id: string, used: Set<string>): string {
  if (!used.has(id)) return id;
  let next = newId();
  while (used.has(next)) next = newId();
  return next;
}

function newId(): string {
  return typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);
}
