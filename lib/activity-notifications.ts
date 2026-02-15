import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

export type ActivityNotificationEntity = 'task' | 'resource';

export type ActivityNotificationItem = {
  id: string;
  userId: string;
  entityType: ActivityNotificationEntity;
  entityId: string;
  title: string;
  message: string;
  createdAt: string;
  readAt: string | null;
};

type ActivityNotificationsState = {
  notificationsByUser: Record<string, ActivityNotificationItem[]>;
  updatedAt: string | null;
};

const STORAGE_KEY = 'studyday-activity-notifications-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;
const MAX_NOTIFICATIONS_PER_USER = 120;
const MAX_NOTIFICATION_AGE_MS = 30 * 24 * 60 * 60 * 1000;

const defaultState: ActivityNotificationsState = {
  notificationsByUser: {},
  updatedAt: null,
};

let memoryState: ActivityNotificationsState | null = null;
let loadingPromise: Promise<ActivityNotificationsState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneState(state: ActivityNotificationsState): ActivityNotificationsState {
  return JSON.parse(JSON.stringify(state)) as ActivityNotificationsState;
}

function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `notif-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function normalizeState(value: unknown): ActivityNotificationsState {
  if (!value || typeof value !== 'object') {
    return cloneState(defaultState);
  }

  const raw = value as Partial<ActivityNotificationsState>;
  return {
    notificationsByUser:
      raw.notificationsByUser && typeof raw.notificationsByUser === 'object'
        ? raw.notificationsByUser
        : {},
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

async function readFromStorage(): Promise<ActivityNotificationsState> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return cloneState(defaultState);
      return normalizeState(JSON.parse(raw));
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
    return normalizeState(JSON.parse(raw));
  } catch {
    return cloneState(defaultState);
  }
}

async function writeToStorage(state: ActivityNotificationsState): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence errors. Runtime state still works.
    }
    return;
  }

  if (!FILE_PATH) return;

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(state));
  } catch {
    // Ignore persistence errors. Runtime state still works.
  }
}

async function loadState(): Promise<ActivityNotificationsState> {
  if (memoryState) return cloneState(memoryState);

  if (!loadingPromise) {
    loadingPromise = (async () => {
      const loaded = await readFromStorage();
      memoryState = normalizeState(loaded);
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

async function updateState(
  mutator: (state: ActivityNotificationsState) => void
): Promise<ActivityNotificationsState> {
  return withWriteLock(async () => {
    const current = await loadState();
    const next = cloneState(current);
    mutator(next);
    next.updatedAt = new Date().toISOString();
    memoryState = normalizeState(next);
    await writeToStorage(memoryState);
    return cloneState(memoryState);
  });
}

function sortNotifications(items: ActivityNotificationItem[]): ActivityNotificationItem[] {
  return [...items].sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

function pruneNotifications(items: ActivityNotificationItem[]): ActivityNotificationItem[] {
  const now = Date.now();
  const filtered = items.filter((item) => {
    const createdAtMs = Date.parse(item.createdAt);
    if (Number.isNaN(createdAtMs)) return false;
    return now - createdAtMs <= MAX_NOTIFICATION_AGE_MS;
  });
  return sortNotifications(filtered).slice(0, MAX_NOTIFICATIONS_PER_USER);
}

export async function getActivityNotifications(userId: string): Promise<ActivityNotificationItem[]> {
  const nextState = await updateState((state) => {
    const list = state.notificationsByUser[userId] ?? [];
    state.notificationsByUser[userId] = pruneNotifications(list);
  });
  return nextState.notificationsByUser[userId] ?? [];
}

export async function addActivityNotification(input: {
  userId: string;
  entityType: ActivityNotificationEntity;
  entityId: string;
  title: string;
  message: string;
}): Promise<ActivityNotificationItem> {
  const now = new Date().toISOString();
  const item: ActivityNotificationItem = {
    id: createId(),
    userId: input.userId,
    entityType: input.entityType,
    entityId: input.entityId,
    title: input.title,
    message: input.message,
    createdAt: now,
    readAt: null,
  };

  await updateState((state) => {
    const current = state.notificationsByUser[input.userId] ?? [];
    const next = pruneNotifications([item, ...current]);
    state.notificationsByUser[input.userId] = next;
  });

  return item;
}

export async function markAllActivityNotificationsAsRead(userId: string): Promise<ActivityNotificationItem[]> {
  const now = new Date().toISOString();
  const nextState = await updateState((state) => {
    const list = pruneNotifications(state.notificationsByUser[userId] ?? []);
    state.notificationsByUser[userId] = list.map((item) => (item.readAt ? item : { ...item, readAt: now }));
  });
  return sortNotifications(nextState.notificationsByUser[userId] ?? []);
}

export async function markActivityNotificationAsRead(
  userId: string,
  notificationId: string
): Promise<ActivityNotificationItem[]> {
  const now = new Date().toISOString();
  const nextState = await updateState((state) => {
    const list = pruneNotifications(state.notificationsByUser[userId] ?? []);
    state.notificationsByUser[userId] = list.map((item) =>
      item.id === notificationId && !item.readAt ? { ...item, readAt: now } : item
    );
  });
  return sortNotifications(nextState.notificationsByUser[userId] ?? []);
}
