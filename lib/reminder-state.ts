import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const STORAGE_KEY = 'studyday-reminder-state-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

type ReminderState = {
  byUser: Record<string, Record<string, string>>;
  updatedAt: string | null;
};

const defaultState: ReminderState = {
  byUser: {},
  updatedAt: null,
};

let memoryState: ReminderState | null = null;
let loadingPromise: Promise<ReminderState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneState(state: ReminderState): ReminderState {
  return JSON.parse(JSON.stringify(state)) as ReminderState;
}

function normalizeState(value: unknown): ReminderState {
  if (!value || typeof value !== 'object') {
    return cloneState(defaultState);
  }

  const raw = value as Partial<ReminderState>;
  const byUser = raw.byUser && typeof raw.byUser === 'object' ? raw.byUser : {};
  return {
    byUser: Object.fromEntries(
      Object.entries(byUser).map(([userId, record]) => {
        if (!record || typeof record !== 'object') return [userId, {}];
        const normalized: Record<string, string> = {};
        for (const [key, dateIso] of Object.entries(record)) {
          if (typeof dateIso === 'string' && dateIso) {
            normalized[key] = dateIso;
          }
        }
        return [userId, normalized];
      })
    ),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

async function readFromStorage(): Promise<ReminderState> {
  if (Platform.OS === 'web') {
    try {
      const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
      if (!raw) return cloneState(defaultState);
      return normalizeState(JSON.parse(raw));
    } catch {
      return cloneState(defaultState);
    }
  }

  if (!FILE_PATH) return cloneState(defaultState);

  try {
    const raw = await FileSystem.readAsStringAsync(FILE_PATH);
    if (!raw) return cloneState(defaultState);
    return normalizeState(JSON.parse(raw));
  } catch {
    return cloneState(defaultState);
  }
}

async function writeToStorage(state: ReminderState): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore persistence errors.
    }
    return;
  }

  if (!FILE_PATH) return;

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(state));
  } catch {
    // Ignore persistence errors.
  }
}

async function loadState(): Promise<ReminderState> {
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

async function updateState(mutator: (state: ReminderState) => void): Promise<ReminderState> {
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

export async function shouldSendReminder(
  userId: string,
  reminderKey: string,
  cooldownMs: number
): Promise<boolean> {
  const state = await loadState();
  const userRecord = state.byUser[userId] ?? {};
  const lastSentAt = userRecord[reminderKey];
  if (!lastSentAt) return true;

  const elapsed = Date.now() - Date.parse(lastSentAt);
  if (Number.isNaN(elapsed)) return true;
  return elapsed >= cooldownMs;
}

export async function markReminderSent(userId: string, reminderKey: string): Promise<void> {
  await updateState((state) => {
    const userRecord = state.byUser[userId] ?? {};
    userRecord[reminderKey] = new Date().toISOString();
    state.byUser[userId] = userRecord;
  });
}
