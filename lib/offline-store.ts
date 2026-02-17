import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

import { decodeOfflinePayload, encodeOfflinePayload } from '@/lib/offline-crypto';
import type { Announcement, Profile, Resource, Task } from '@/types/supabase';
import type { StudySchedulePlan } from '@/types/study-schedule';

const STORAGE_KEY = 'studyday-offline-state-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

type OutboxTaskUpsert = {
  id: string;
  entity: 'task';
  action: 'upsert';
  userId: string;
  record: Task;
  createdAt: string;
};

type OutboxTaskDelete = {
  id: string;
  entity: 'task';
  action: 'delete';
  userId: string;
  recordId: string;
  createdAt: string;
};

type OutboxResourceUpsert = {
  id: string;
  entity: 'resource';
  action: 'upsert';
  userId: string;
  record: Resource;
  createdAt: string;
};

type OutboxResourceDelete = {
  id: string;
  entity: 'resource';
  action: 'delete';
  userId: string;
  recordId: string;
  createdAt: string;
};

type OutboxProfileUpsert = {
  id: string;
  entity: 'profile';
  action: 'upsert';
  userId: string;
  record: Profile;
  createdAt: string;
};

type OutboxScheduleUpsert = {
  id: string;
  entity: 'schedule';
  action: 'upsert';
  userId: string;
  record: StudySchedulePlan;
  createdAt: string;
};

type OutboxScheduleDelete = {
  id: string;
  entity: 'schedule';
  action: 'delete';
  userId: string;
  recordId: string;
  createdAt: string;
};

export type OutboxOperation =
  | OutboxTaskUpsert
  | OutboxTaskDelete
  | OutboxResourceUpsert
  | OutboxResourceDelete
  | OutboxProfileUpsert
  | OutboxScheduleUpsert
  | OutboxScheduleDelete;

type OfflineState = {
  profilesByUser: Record<string, Profile>;
  tasksByUser: Record<string, Task[]>;
  resourcesByUser: Record<string, Resource[]>;
  schedulesByUser: Record<string, StudySchedulePlan[]>;
  announcements: Announcement[];
  outbox: OutboxOperation[];
  updatedAt: string | null;
};

const defaultState: OfflineState = {
  profilesByUser: {},
  tasksByUser: {},
  resourcesByUser: {},
  schedulesByUser: {},
  announcements: [],
  outbox: [],
  updatedAt: null,
};

let memoryState: OfflineState | null = null;
let loadingPromise: Promise<OfflineState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneState(state: OfflineState): OfflineState {
  return JSON.parse(JSON.stringify(state)) as OfflineState;
}

function ensureStateShape(value: unknown): OfflineState {
  if (!value || typeof value !== 'object') {
    return cloneState(defaultState);
  }

  const partial = value as Partial<OfflineState>;
  return {
    profilesByUser: partial.profilesByUser && typeof partial.profilesByUser === 'object' ? partial.profilesByUser : {},
    tasksByUser: partial.tasksByUser && typeof partial.tasksByUser === 'object' ? partial.tasksByUser : {},
    resourcesByUser:
      partial.resourcesByUser && typeof partial.resourcesByUser === 'object' ? partial.resourcesByUser : {},
    schedulesByUser:
      partial.schedulesByUser && typeof partial.schedulesByUser === 'object' ? partial.schedulesByUser : {},
    announcements: Array.isArray(partial.announcements) ? partial.announcements : [],
    outbox: Array.isArray(partial.outbox) ? partial.outbox : [],
    updatedAt: typeof partial.updatedAt === 'string' ? partial.updatedAt : null,
  };
}

function nowIso(): string {
  return new Date().toISOString();
}

function createUuid(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }

  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = Math.floor(Math.random() * 16);
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}

export function createEntityId(): string {
  return createUuid();
}

export function createLocalId(prefix: string): string {
  return `${prefix}-${createUuid()}`;
}

function sanitizeStateForEntityIds(input: OfflineState): OfflineState {
  const state = cloneState(input);
  const taskIdMapByUser = new Map<string, Map<string, string>>();
  const resourceIdMapByUser = new Map<string, Map<string, string>>();
  const scheduleIdMapByUser = new Map<string, Map<string, string>>();

  Object.entries(state.tasksByUser).forEach(([userId, tasks]) => {
    const map = new Map<string, string>();
    const normalized = tasks.map((task) => {
      if (isUuid(task.id)) return task;
      const nextId = createEntityId();
      map.set(task.id, nextId);
      return { ...task, id: nextId };
    });
    taskIdMapByUser.set(userId, map);
    state.tasksByUser[userId] = normalized;
  });

  Object.entries(state.resourcesByUser).forEach(([userId, resources]) => {
    const map = new Map<string, string>();
    const normalized = resources.map((resource) => {
      if (isUuid(resource.id)) return resource;
      const nextId = createEntityId();
      map.set(resource.id, nextId);
      return { ...resource, id: nextId };
    });
    resourceIdMapByUser.set(userId, map);
    state.resourcesByUser[userId] = normalized;
  });

  Object.entries(state.schedulesByUser).forEach(([userId, schedules]) => {
    const map = new Map<string, string>();
    const normalized = schedules.map((schedule) => {
      if (isUuid(schedule.id)) return schedule;
      const nextId = createEntityId();
      map.set(schedule.id, nextId);
      return { ...schedule, id: nextId };
    });
    scheduleIdMapByUser.set(userId, map);
    state.schedulesByUser[userId] = normalized;
  });

  state.outbox = state.outbox.map((operation) => {
    if (operation.entity === 'profile') {
      return operation;
    }

    if (operation.entity === 'task') {
      const map = taskIdMapByUser.get(operation.userId);
      if (operation.action === 'upsert') {
        const remapped = map?.get(operation.record.id);
        if (remapped) {
          return { ...operation, record: { ...operation.record, id: remapped } };
        }
        if (!isUuid(operation.record.id)) {
          const nextId = createEntityId();
          return { ...operation, record: { ...operation.record, id: nextId } };
        }
        return operation;
      }

      const remapped = map?.get(operation.recordId);
      if (remapped) {
        return { ...operation, recordId: remapped };
      }
      if (!isUuid(operation.recordId)) {
        return { ...operation, recordId: createEntityId() };
      }
      return operation;
    }

    if (operation.entity === 'resource') {
      const map = resourceIdMapByUser.get(operation.userId);
      if (operation.action === 'upsert') {
        const remapped = map?.get(operation.record.id);
        if (remapped) {
          return { ...operation, record: { ...operation.record, id: remapped } };
        }
        if (!isUuid(operation.record.id)) {
          const nextId = createEntityId();
          return { ...operation, record: { ...operation.record, id: nextId } };
        }
        return operation;
      }

      const remapped = map?.get(operation.recordId);
      if (remapped) {
        return { ...operation, recordId: remapped };
      }
      if (!isUuid(operation.recordId)) {
        return { ...operation, recordId: createEntityId() };
      }
      return operation;
    }

    const map = scheduleIdMapByUser.get(operation.userId);
    if (operation.action === 'upsert') {
      const remapped = map?.get(operation.record.id);
      if (remapped) {
        return { ...operation, record: { ...operation.record, id: remapped } };
      }
      if (!isUuid(operation.record.id)) {
        const nextId = createEntityId();
        return { ...operation, record: { ...operation.record, id: nextId } };
      }
      return operation;
    }

    const remapped = map?.get(operation.recordId);
    if (remapped) {
      return { ...operation, recordId: remapped };
    }
    if (!isUuid(operation.recordId)) {
      return { ...operation, recordId: createEntityId() };
    }
    return operation;
  });

  return state;
}

async function readFromStorage(): Promise<OfflineState> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return cloneState(defaultState);
      const decoded = await decodeOfflinePayload(raw);
      if (!decoded) return cloneState(defaultState);
      return ensureStateShape(JSON.parse(decoded));
    } catch {
      return cloneState(defaultState);
    }
  }

  if (!FILE_PATH) {
    return cloneState(defaultState);
  }

  try {
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    if (!raw) return cloneState(defaultState);
    const decoded = await decodeOfflinePayload(raw);
    if (!decoded) return cloneState(defaultState);
    return ensureStateShape(JSON.parse(decoded));
  } catch {
    return cloneState(defaultState);
  }
}

async function writeToStorage(nextState: OfflineState): Promise<void> {
  const serialized = JSON.stringify(nextState);
  const encoded = await encodeOfflinePayload(serialized);

  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, encoded);
    } catch {
      // Ignore write errors, in-memory state remains available.
    }
    return;
  }

  if (!FILE_PATH) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, encoded);
  } catch {
    // Ignore write errors, in-memory state remains available.
  }
}

async function loadState(): Promise<OfflineState> {
  if (memoryState) {
    return cloneState(memoryState);
  }

  if (!loadingPromise) {
    loadingPromise = (async () => {
      const loaded = await readFromStorage();
      const normalized = ensureStateShape(loaded);
      const sanitized = sanitizeStateForEntityIds(normalized);
      const hasChanged = JSON.stringify(normalized) !== JSON.stringify(sanitized);
      memoryState = ensureStateShape(sanitized);
      if (hasChanged) {
        await writeToStorage(memoryState);
      }
      return cloneState(memoryState);
    })();
  }

  return loadingPromise;
}

async function withWriteLock<T>(task: () => Promise<T>): Promise<T> {
  let release: () => void = () => {};
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  const previous = writeChain;
  writeChain = previous.then(() => gate);
  await previous;
  try {
    return await task();
  } finally {
    release();
  }
}

async function updateState(mutator: (state: OfflineState) => void): Promise<void> {
  await withWriteLock(async () => {
    const current = await loadState();
    const next = cloneState(current);
    mutator(next);
    next.updatedAt = nowIso();
    memoryState = ensureStateShape(next);
    await writeToStorage(memoryState);
  });
}

export async function getLocalTasks(userId: string): Promise<Task[]> {
  const state = await loadState();
  return [...(state.tasksByUser[userId] ?? [])];
}

export async function getLocalProfileById(userId: string): Promise<Profile | null> {
  const state = await loadState();
  return state.profilesByUser[userId] ?? null;
}

export async function setLocalProfile(userId: string, profile: Profile): Promise<void> {
  await updateState((state) => {
    state.profilesByUser[userId] = profile;
  });
}

export async function removeLocalProfile(userId: string): Promise<void> {
  await updateState((state) => {
    delete state.profilesByUser[userId];
  });
}

export async function getLocalTaskById(userId: string, taskId: string): Promise<Task | null> {
  const tasks = await getLocalTasks(userId);
  return tasks.find((task) => task.id === taskId) ?? null;
}

export async function setLocalTasks(userId: string, tasks: Task[]): Promise<void> {
  await updateState((state) => {
    state.tasksByUser[userId] = [...tasks];
  });
}

export async function upsertLocalTask(userId: string, task: Task): Promise<void> {
  await updateState((state) => {
    const list = state.tasksByUser[userId] ?? [];
    const index = list.findIndex((item) => item.id === task.id);
    if (index === -1) {
      list.push(task);
    } else {
      list[index] = task;
    }
    state.tasksByUser[userId] = list;
  });
}

export async function removeLocalTask(userId: string, taskId: string): Promise<void> {
  await updateState((state) => {
    const list = state.tasksByUser[userId] ?? [];
    state.tasksByUser[userId] = list.filter((task) => task.id !== taskId);
  });
}

export async function getLocalResources(userId: string): Promise<Resource[]> {
  const state = await loadState();
  return [...(state.resourcesByUser[userId] ?? [])];
}

export async function getLocalResourceById(userId: string, resourceId: string): Promise<Resource | null> {
  const resources = await getLocalResources(userId);
  return resources.find((resource) => resource.id === resourceId) ?? null;
}

export async function setLocalResources(userId: string, resources: Resource[]): Promise<void> {
  await updateState((state) => {
    state.resourcesByUser[userId] = [...resources];
  });
}

export async function upsertLocalResource(userId: string, resource: Resource): Promise<void> {
  await updateState((state) => {
    const list = state.resourcesByUser[userId] ?? [];
    const index = list.findIndex((item) => item.id === resource.id);
    if (index === -1) {
      list.push(resource);
    } else {
      list[index] = resource;
    }
    state.resourcesByUser[userId] = list;
  });
}

export async function removeLocalResource(userId: string, resourceId: string): Promise<void> {
  await updateState((state) => {
    const list = state.resourcesByUser[userId] ?? [];
    state.resourcesByUser[userId] = list.filter((resource) => resource.id !== resourceId);
  });
}

export async function getLocalSchedules(userId: string): Promise<StudySchedulePlan[]> {
  const state = await loadState();
  return [...(state.schedulesByUser[userId] ?? [])];
}

export async function getLocalScheduleById(userId: string, scheduleId: string): Promise<StudySchedulePlan | null> {
  const schedules = await getLocalSchedules(userId);
  return schedules.find((schedule) => schedule.id === scheduleId) ?? null;
}

export async function setLocalSchedules(userId: string, schedules: StudySchedulePlan[]): Promise<void> {
  await updateState((state) => {
    state.schedulesByUser[userId] = [...schedules];
  });
}

export async function upsertLocalSchedule(userId: string, schedule: StudySchedulePlan): Promise<void> {
  await updateState((state) => {
    const list = state.schedulesByUser[userId] ?? [];
    const index = list.findIndex((item) => item.id === schedule.id);
    if (index === -1) {
      list.push(schedule);
    } else {
      list[index] = schedule;
    }
    state.schedulesByUser[userId] = list;
  });
}

export async function removeLocalSchedule(userId: string, scheduleId: string): Promise<void> {
  await updateState((state) => {
    const list = state.schedulesByUser[userId] ?? [];
    state.schedulesByUser[userId] = list.filter((schedule) => schedule.id !== scheduleId);
  });
}

export async function getCachedAnnouncements(): Promise<Announcement[]> {
  const state = await loadState();
  return [...state.announcements];
}

export async function setCachedAnnouncements(announcements: Announcement[]): Promise<void> {
  await updateState((state) => {
    state.announcements = [...announcements];
  });
}

export async function upsertCachedAnnouncement(announcement: Announcement): Promise<void> {
  await updateState((state) => {
    const index = state.announcements.findIndex((item) => item.id === announcement.id);
    if (index === -1) {
      state.announcements.unshift(announcement);
    } else {
      state.announcements[index] = announcement;
    }
  });
}

export async function getOutboxOperations(userId?: string): Promise<OutboxOperation[]> {
  const state = await loadState();
  const operations = [...state.outbox];
  if (!userId) {
    return operations;
  }
  return operations.filter((operation) => operation.userId === userId);
}

export async function enqueueOutboxOperation(operation: OutboxOperation): Promise<void> {
  await updateState((state) => {
    state.outbox.push(operation);
  });
}

export async function removeOutboxOperation(operationId: string): Promise<void> {
  await updateState((state) => {
    state.outbox = state.outbox.filter((operation) => operation.id !== operationId);
  });
}

export async function updateOutboxOperation(operationId: string, operation: OutboxOperation): Promise<void> {
  await updateState((state) => {
    const index = state.outbox.findIndex((item) => item.id === operationId);
    if (index === -1) return;
    state.outbox[index] = operation;
  });
}

export async function getOutboxSize(userId?: string): Promise<number> {
  const state = await loadState();
  if (!userId) {
    return state.outbox.length;
  }
  return state.outbox.filter((operation) => operation.userId === userId).length;
}
