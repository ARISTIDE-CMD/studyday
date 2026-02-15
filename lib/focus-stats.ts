import * as FileSystem from 'expo-file-system/legacy';
import { Platform } from 'react-native';

const STORAGE_KEY = 'studyday-focus-stats-v1';
const FILE_PATH = FileSystem.documentDirectory
  ? `${FileSystem.documentDirectory}${STORAGE_KEY}.json`
  : null;

type FocusDayStats = {
  sessions: number;
  minutes: number;
};

type FocusUserStats = {
  byDay: Record<string, FocusDayStats>;
};

type FocusStatsState = {
  byUser: Record<string, FocusUserStats>;
  updatedAt: string | null;
};

type FocusStatsSummary = {
  todaySessions: number;
  weekSessions: number;
  totalSessions: number;
  totalMinutes: number;
  streakDays: number;
};

const defaultState: FocusStatsState = {
  byUser: {},
  updatedAt: null,
};

let memoryState: FocusStatsState | null = null;
let loadingPromise: Promise<FocusStatsState> | null = null;
let writeChain: Promise<void> = Promise.resolve();

function cloneState(state: FocusStatsState): FocusStatsState {
  return JSON.parse(JSON.stringify(state)) as FocusStatsState;
}

function toIsoDate(value: Date): string {
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, '0');
  const day = String(value.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function normalizeState(value: unknown): FocusStatsState {
  if (!value || typeof value !== 'object') {
    return cloneState(defaultState);
  }

  const raw = value as Partial<FocusStatsState>;
  const byUser = raw.byUser && typeof raw.byUser === 'object' ? raw.byUser : {};
  return {
    byUser: Object.fromEntries(
      Object.entries(byUser).map(([userId, userStats]) => {
        const typedUser = userStats as Partial<FocusUserStats>;
        const byDay = typedUser.byDay && typeof typedUser.byDay === 'object' ? typedUser.byDay : {};
        const normalizedByDay: Record<string, FocusDayStats> = {};
        for (const [day, stats] of Object.entries(byDay)) {
          const typedStats = stats as Partial<FocusDayStats>;
          normalizedByDay[day] = {
            sessions: Number.isFinite(typedStats.sessions) ? Math.max(0, Number(typedStats.sessions)) : 0,
            minutes: Number.isFinite(typedStats.minutes) ? Math.max(0, Number(typedStats.minutes)) : 0,
          };
        }
        return [userId, { byDay: normalizedByDay }];
      })
    ),
    updatedAt: typeof raw.updatedAt === 'string' ? raw.updatedAt : null,
  };
}

async function readFromStorage(): Promise<FocusStatsState> {
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

async function writeToStorage(state: FocusStatsState): Promise<void> {
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

async function loadState(): Promise<FocusStatsState> {
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

async function updateState(mutator: (state: FocusStatsState) => void): Promise<FocusStatsState> {
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

function getUserStats(state: FocusStatsState, userId: string): FocusUserStats {
  return state.byUser[userId] ?? { byDay: {} };
}

function computeStreakDays(byDay: Record<string, FocusDayStats>): number {
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const dayKey = toIsoDate(cursor);
    const day = byDay[dayKey];
    if (!day || day.sessions <= 0) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

export async function recordFocusSession(userId: string, minutes: number, at = new Date()): Promise<void> {
  const iso = toIsoDate(at);
  await updateState((state) => {
    const user = getUserStats(state, userId);
    const day = user.byDay[iso] ?? { sessions: 0, minutes: 0 };
    user.byDay[iso] = {
      sessions: day.sessions + 1,
      minutes: day.minutes + Math.max(1, Math.round(minutes)),
    };
    state.byUser[userId] = user;
  });
}

export async function getFocusStats(userId: string): Promise<FocusStatsSummary> {
  const state = await loadState();
  const user = getUserStats(state, userId);
  const today = new Date();
  const todayKey = toIsoDate(today);

  const weekStart = new Date(today);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() - 6);
  const weekStartMs = weekStart.getTime();

  let weekSessions = 0;
  let totalSessions = 0;
  let totalMinutes = 0;

  for (const [dayKey, stats] of Object.entries(user.byDay)) {
    totalSessions += stats.sessions;
    totalMinutes += stats.minutes;

    const dayMs = Date.parse(`${dayKey}T00:00:00`);
    if (!Number.isNaN(dayMs) && dayMs >= weekStartMs) {
      weekSessions += stats.sessions;
    }
  }

  return {
    todaySessions: user.byDay[todayKey]?.sessions ?? 0,
    weekSessions,
    totalSessions,
    totalMinutes,
    streakDays: computeStreakDays(user.byDay),
  };
}
