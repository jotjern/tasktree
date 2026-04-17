import { AppState, Task, TaskId, emptyState } from '../types';

export function encodeMarkdown(state: AppState): string {
  const lines: string[] = ['# TaskDAG', ''];
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
  return lines.join('\n') + '\n';
}

interface ParsedLine {
  depth: number;
  completed: boolean;
  title: string;
  id: TaskId;
  createdAt: number;
}

const LINE_RE = /^(\s*)-\s*\[([ xX])\]\s*(.*?)(?:\s*<!--\s*id:([^\s]+)(?:\s+ts:(\d+))?\s*-->)?\s*$/;

export function decodeMarkdown(text: string): AppState {
  const state = emptyState();
  const parsed: ParsedLine[] = [];
  for (const raw of text.split(/\r?\n/)) {
    const m = LINE_RE.exec(raw);
    if (!m) continue;
    const indent = m[1] ?? '';
    const depth = Math.floor(indent.replace(/\t/g, '  ').length / 2);
    const completed = m[2].toLowerCase() === 'x';
    let title = (m[3] ?? '').trim();
    const softDeleted = /^~~.*~~$/.test(title);
    if (softDeleted) title = title.replace(/^~~/, '').replace(/~~$/, '');
    const id = m[4] ?? crypto.randomUUID();
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
