import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const STORAGE_KEY = 'studyday-user-preferences-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

const MAX_RECENT_SEARCHES = 8;

type UserPreferences = {
  favoriteTaskIds: string[];
  favoriteResourceIds: string[];
  recentSearches: string[];
};

type UserPreferencesState = {
  byUser: Record<string, UserPreferences>;
  updatedAt: string | null;
};

const defaultUserPreferences: UserPreferences = {
  favoriteTaskIds: [],
  favoriteResourceIds: [],
  recentSearches: [],
};

const defaultState: UserPreferencesState = {
  byUser: {},
  updatedAt: null,
};

let memoryState: UserPreferencesState | null = null;
let loadingPromise: Promise<UserPreferencesState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneState(state: UserPreferencesState): UserPreferencesState {
  return JSON.parse(JSON.stringify(state)) as UserPreferencesState;
}

function dedupeNonEmpty(values: string[]): string[] {
  const set = new Set<string>();
  const out: string[] = [];
  for (const value of values) {
    const normalized = value.trim();
    if (!normalized || set.has(normalized)) continue;
    set.add(normalized);
    out.push(normalized);
  }
  return out;
}

function normalizeUserPreferences(value: unknown): UserPreferences {
  if (!value || typeof value !== 'object') {
    return { ...defaultUserPreferences };
  }

  const raw = value as Partial<UserPreferences>;
  return {
    favoriteTaskIds: Array.isArray(raw.favoriteTaskIds)
      ? dedupeNonEmpty(raw.favoriteTaskIds)
      : [],
    favoriteResourceIds: Array.isArray(raw.favoriteResourceIds)
      ? dedupeNonEmpty(raw.favoriteResourceIds)
      : [],
    recentSearches: Array.isArray(raw.recentSearches)
      ? dedupeNonEmpty(raw.recentSearches).slice(0, MAX_RECENT_SEARCHES)
      : [],
  };
}

function normalizeState(value: unknown): UserPreferencesState {
  if (!value || typeof value !== 'object') {
    return cloneState(defaultState);
  }

  const raw = value as Partial<UserPreferencesState>;
  const byUserRaw = raw.byUser && typeof raw.byUser === 'object' ? raw.byUser : {};
  const byUser: Record<string, UserPreferences> = {};

  for (const [userId, preferences] of Object.entries(byUserRaw)) {
    byUser[userId] = normalizeUserPreferences(preferences);
  }

  return {
    byUser,
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

async function readFromStorage(): Promise<UserPreferencesState> {
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

async function writeToStorage(state: UserPreferencesState): Promise<void> {
  if (Platform.OS === 'web') {
    try {
      globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch {
      // Ignore write errors, keep runtime state.
    }
    return;
  }

  if (!FILE_PATH) {
    return;
  }

  try {
    await FileSystem.writeAsStringAsync(FILE_PATH, JSON.stringify(state));
  } catch {
    // Ignore write errors, keep runtime state.
  }
}

async function loadState(): Promise<UserPreferencesState> {
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

async function updateState(mutator: (state: UserPreferencesState) => void): Promise<UserPreferencesState> {
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

function getByUser(state: UserPreferencesState, userId: string): UserPreferences {
  return state.byUser[userId] ?? { ...defaultUserPreferences };
}

export async function getUserPreferences(userId: string): Promise<UserPreferences> {
  const state = await loadState();
  return getByUser(state, userId);
}

export async function toggleFavoriteTask(userId: string, taskId: string): Promise<UserPreferences> {
  const nextState = await updateState((state) => {
    const current = getByUser(state, userId);
    const exists = current.favoriteTaskIds.includes(taskId);
    const favoriteTaskIds = exists
      ? current.favoriteTaskIds.filter((id) => id !== taskId)
      : [taskId, ...current.favoriteTaskIds];
    state.byUser[userId] = {
      ...current,
      favoriteTaskIds,
    };
  });
  return getByUser(nextState, userId);
}

export async function toggleFavoriteResource(userId: string, resourceId: string): Promise<UserPreferences> {
  const nextState = await updateState((state) => {
    const current = getByUser(state, userId);
    const exists = current.favoriteResourceIds.includes(resourceId);
    const favoriteResourceIds = exists
      ? current.favoriteResourceIds.filter((id) => id !== resourceId)
      : [resourceId, ...current.favoriteResourceIds];
    state.byUser[userId] = {
      ...current,
      favoriteResourceIds,
    };
  });
  return getByUser(nextState, userId);
}

export async function saveRecentSearch(userId: string, query: string): Promise<UserPreferences> {
  const cleaned = query.trim();
  if (!cleaned) return getUserPreferences(userId);

  const nextState = await updateState((state) => {
    const current = getByUser(state, userId);
    const withoutDuplicate = current.recentSearches.filter((item) => item.toLowerCase() !== cleaned.toLowerCase());
    state.byUser[userId] = {
      ...current,
      recentSearches: [cleaned, ...withoutDuplicate].slice(0, MAX_RECENT_SEARCHES),
    };
  });
  return getByUser(nextState, userId);
}

export async function clearRecentSearches(userId: string): Promise<UserPreferences> {
  const nextState = await updateState((state) => {
    const current = getByUser(state, userId);
    state.byUser[userId] = {
      ...current,
      recentSearches: [],
    };
  });
  return getByUser(nextState, userId);
}
