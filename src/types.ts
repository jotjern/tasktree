export type TaskId = string;

export interface Task {
  id: TaskId;
  title: string;
  parentId: TaskId | null;
  completed: boolean;
  softDeleted: boolean;
  createdAt: number;
}

export interface AppState {
  tasks: Record<TaskId, Task>;
  rootOrder: TaskId[];
  childOrder: Record<TaskId, TaskId[]>;
  selectedId: TaskId | null;
  version: 1;
}

export const emptyState = (): AppState => ({
  tasks: {},
  rootOrder: [],
  childOrder: {},
  selectedId: null,
  version: 1,
});
