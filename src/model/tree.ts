import { AppState, Task, TaskId } from '../types';

const newId = (): TaskId =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : Math.random().toString(36).slice(2) + Date.now().toString(36);

export function addRoot(state: AppState, title: string): { state: AppState; id: TaskId } {
  const id = newId();
  const task: Task = {
    id,
    title,
    parentId: null,
    completed: false,
    softDeleted: false,
    createdAt: Date.now(),
  };
  return {
    id,
    state: {
      ...state,
      tasks: { ...state.tasks, [id]: task },
      rootOrder: [...state.rootOrder, id],
      childOrder: { ...state.childOrder, [id]: [] },
    },
  };
}

export function addSubtask(
  state: AppState,
  parentId: TaskId,
  title: string,
): { state: AppState; id: TaskId } {
  const id = newId();
  const task: Task = {
    id,
    title,
    parentId,
    completed: false,
    softDeleted: false,
    createdAt: Date.now(),
  };
  const siblings = state.childOrder[parentId] ?? [];
  return {
    id,
    state: {
      ...state,
      tasks: { ...state.tasks, [id]: task },
      childOrder: {
        ...state.childOrder,
        [parentId]: [...siblings, id],
        [id]: [],
      },
    },
  };
}

export function rename(state: AppState, id: TaskId, title: string): AppState {
  const task = state.tasks[id];
  if (!task) return state;
  return { ...state, tasks: { ...state.tasks, [id]: { ...task, title } } };
}

export function toggleComplete(state: AppState, id: TaskId): AppState {
  const task = state.tasks[id];
  if (!task) return state;
  return {
    ...state,
    tasks: { ...state.tasks, [id]: { ...task, completed: !task.completed } },
  };
}

export function softDelete(state: AppState, id: TaskId): AppState {
  const task = state.tasks[id];
  if (!task) return state;
  return {
    ...state,
    tasks: { ...state.tasks, [id]: { ...task, softDeleted: true } },
  };
}

export function restore(state: AppState, id: TaskId): AppState {
  const task = state.tasks[id];
  if (!task) return state;
  return {
    ...state,
    tasks: { ...state.tasks, [id]: { ...task, softDeleted: false } },
  };
}

export function hardDelete(state: AppState, id: TaskId): AppState {
  const task = state.tasks[id];
  if (!task) return state;

  const tasks = { ...state.tasks };
  const childOrder = { ...state.childOrder };
  let rootOrder = [...state.rootOrder];

  const children = childOrder[id] ?? [];
  for (const childId of children) {
    const child = tasks[childId];
    if (child) tasks[childId] = { ...child, parentId: null };
  }
  rootOrder = insertChildrenAsRoots(rootOrder, id, children);

  if (task.parentId) {
    const siblings = childOrder[task.parentId] ?? [];
    childOrder[task.parentId] = siblings.filter((sid) => sid !== id);
  } else {
    rootOrder = rootOrder.filter((rid) => rid !== id);
  }

  delete tasks[id];
  delete childOrder[id];

  return { ...state, tasks, childOrder, rootOrder };
}

function insertChildrenAsRoots(
  rootOrder: TaskId[],
  removedId: TaskId,
  promoted: TaskId[],
): TaskId[] {
  if (promoted.length === 0) return rootOrder;
  const idx = rootOrder.indexOf(removedId);
  if (idx === -1) return [...rootOrder, ...promoted];
  return [...rootOrder.slice(0, idx + 1), ...promoted, ...rootOrder.slice(idx + 1)];
}

export function findRootOf(state: AppState, id: TaskId): TaskId | null {
  let cursor: TaskId | null = id;
  const seen = new Set<TaskId>();
  while (cursor) {
    if (seen.has(cursor)) return null;
    seen.add(cursor);
    const task: Task | undefined = state.tasks[cursor];
    if (!task) return null;
    if (task.parentId === null) return task.id;
    cursor = task.parentId;
  }
  return null;
}

export function depthFromRoot(state: AppState, id: TaskId): number {
  let depth = 0;
  let cursor: TaskId | null = id;
  while (cursor) {
    const task: Task | undefined = state.tasks[cursor];
    if (!task || task.parentId === null) return depth;
    depth += 1;
    cursor = task.parentId;
  }
  return depth;
}
