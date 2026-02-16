import {
  createEntityId,
  createLocalId,
  enqueueOutboxOperation,
  getLocalScheduleById,
  getLocalSchedules,
  getOutboxSize,
  removeLocalSchedule,
  setLocalSchedules,
  upsertLocalSchedule,
} from '@/lib/offline-store';
import { isLikelyNetworkError, shouldAutoSync, syncPendingOperations } from '@/lib/sync-engine';
import { supabase } from '@/lib/supabase';
import type { Resource, Task } from '@/types/supabase';
import type {
  StudyDayKey,
  StudyPeriodPreset,
  StudySchedulePlan,
  StudySchedulePreferences,
  StudyScheduleSession,
  StudySlot,
} from '@/types/study-schedule';

const DAY_ORDER: StudyDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SLOT_ORDER: StudySlot[] = ['morning', 'afternoon', 'evening'];

function nowIso(): string {
  return new Date().toISOString();
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  if (date.getUTCFullYear() !== y || date.getUTCMonth() + 1 !== m || date.getUTCDate() !== d) return null;
  return date;
}

function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function daysDiffInclusive(startIso: string, endIso: string): number {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return 1;
  const diff = Math.floor((end.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(1, diff + 1);
}

function normalizeSelectedDays(days: StudyDayKey[], includeWeekend: boolean, sessionsPerWeek: number): StudyDayKey[] {
  const allowed = includeWeekend ? DAY_ORDER : DAY_ORDER.filter((day) => day !== 'sat' && day !== 'sun');
  const selected: StudyDayKey[] = [];

  for (const day of days) {
    if (!allowed.includes(day) || selected.includes(day)) continue;
    selected.push(day);
  }

  if (selected.length > 0) {
    return selected;
  }

  const count = Math.min(Math.max(1, sessionsPerWeek), allowed.length);
  return allowed.slice(0, count);
}

function getDayKey(date: Date): StudyDayKey {
  const jsDay = date.getUTCDay();
  if (jsDay === 0) return 'sun';
  if (jsDay === 1) return 'mon';
  if (jsDay === 2) return 'tue';
  if (jsDay === 3) return 'wed';
  if (jsDay === 4) return 'thu';
  if (jsDay === 5) return 'fri';
  return 'sat';
}

function rotateSlot(preferred: StudySlot, offset: number): StudySlot {
  const base = SLOT_ORDER.indexOf(preferred);
  const start = base === -1 ? 0 : base;
  return SLOT_ORDER[(start + offset) % SLOT_ORDER.length];
}

export function resolveStudyPeriodEndDate(startDate: string, preset: StudyPeriodPreset, customWeeks: number | null): string {
  const safeStart = parseIsoDate(startDate) ?? new Date();

  if (preset === 'year') {
    return toIsoDate(addDays(safeStart, 364));
  }
  if (preset === 'semester') {
    return toIsoDate(addDays(safeStart, 181));
  }
  if (preset === 'trimester') {
    return toIsoDate(addDays(safeStart, 90));
  }

  const weeks = clamp(customWeeks ?? 6, 1, 104);
  return toIsoDate(addDays(safeStart, weeks * 7 - 1));
}

function normalizePreferences(preferences: StudySchedulePreferences): StudySchedulePreferences {
  const startDate = parseIsoDate(preferences.startDate) ? preferences.startDate : toIsoDate(new Date());
  const periodPreset = preferences.periodPreset;
  const customWeeks = periodPreset === 'custom' ? clamp(preferences.customWeeks ?? 6, 1, 104) : null;

  let endDate = parseIsoDate(preferences.endDate)
    ? preferences.endDate
    : resolveStudyPeriodEndDate(startDate, periodPreset, customWeeks);

  if (parseIsoDate(endDate) && parseIsoDate(startDate)) {
    const start = parseIsoDate(startDate) as Date;
    const end = parseIsoDate(endDate) as Date;
    if (end.getTime() < start.getTime()) {
      endDate = startDate;
    }
  }

  const sessionsPerWeek = clamp(Math.round(preferences.sessionsPerWeek), 1, 21);
  const sessionMinutes = clamp(Math.round(preferences.sessionMinutes), 15, 240);
  const includeWeekend = Boolean(preferences.includeWeekend);
  const selectedDays = normalizeSelectedDays(preferences.selectedDays, includeWeekend, sessionsPerWeek);

  return {
    ...preferences,
    periodPreset,
    startDate,
    endDate,
    customWeeks,
    sessionsPerWeek,
    sessionMinutes,
    includeWeekend,
    selectedDays,
  };
}

function toTokens(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/gi, ' ')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter((item) => item.length >= 3);
}

function buildFocusPool(goal: string, tasks: Task[], resources: Resource[]): string[] {
  const goalLines = goal
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .slice(0, 3);

  const activeTasks = tasks
    .filter((task) => task.status !== 'done')
    .sort((a, b) => (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31'))
    .map((task) => task.title.trim())
    .filter(Boolean)
    .slice(0, 16);

  const resourceTopics = resources
    .map((resource) => resource.title.trim())
    .filter(Boolean)
    .slice(0, 16);

  const keywordSource = `${goal} ${activeTasks.join(' ')} ${resourceTopics.join(' ')}`;
  const tags = [...new Set(toTokens(keywordSource))].slice(0, 8);

  const merged = [...goalLines, ...activeTasks, ...resourceTopics, ...tags.map((tag) => `Revision ${tag}`)];
  const unique: string[] = [];

  for (const entry of merged) {
    const normalized = entry.toLowerCase();
    if (unique.some((item) => item.toLowerCase() === normalized)) continue;
    unique.push(entry);
  }

  if (unique.length > 0) return unique;
  return ['Revision generale', 'Exercices pratiques', 'Synthese'];
}

function buildSessions(preferences: StudySchedulePreferences, focusPool: string[]): StudyScheduleSession[] {
  const start = parseIsoDate(preferences.startDate);
  const end = parseIsoDate(preferences.endDate);
  if (!start || !end || end.getTime() < start.getTime()) return [];

  const sessions: StudyScheduleSession[] = [];
  let cursorWeekStart = new Date(start);
  let focusIndex = 0;

  while (cursorWeekStart.getTime() <= end.getTime()) {
    const weekEnd = addDays(cursorWeekStart, 6);
    const candidates: Date[] = [];

    for (let date = new Date(cursorWeekStart); date.getTime() <= weekEnd.getTime(); date = addDays(date, 1)) {
      if (date.getTime() < start.getTime() || date.getTime() > end.getTime()) continue;
      const day = getDayKey(date);
      if (!preferences.selectedDays.includes(day)) continue;
      candidates.push(new Date(date));
    }

    if (candidates.length > 0) {
      for (let index = 0; index < preferences.sessionsPerWeek; index += 1) {
        const dayDate = candidates[index % candidates.length];
        const day = getDayKey(dayDate);
        sessions.push({
          id: createEntityId(),
          date: toIsoDate(dayDate),
          day,
          slot: rotateSlot(preferences.preferredSlot, index),
          durationMinutes: preferences.sessionMinutes,
          focus: focusPool[focusIndex % focusPool.length],
        });
        focusIndex += 1;
      }
    }

    cursorWeekStart = addDays(cursorWeekStart, 7);
  }

  return sessions.sort((a, b) => {
    const byDate = a.date.localeCompare(b.date);
    if (byDate !== 0) return byDate;
    return SLOT_ORDER.indexOf(a.slot) - SLOT_ORDER.indexOf(b.slot);
  });
}

function sortPlans(plans: StudySchedulePlan[]): StudySchedulePlan[] {
  return [...plans].sort((a, b) => {
    if (a.is_pinned !== b.is_pinned) {
      return a.is_pinned ? -1 : 1;
    }
    return (b.updated_at ?? '').localeCompare(a.updated_at ?? '');
  });
}

function mergeById<T extends { id: string }>(remote: T[], local: T[]): T[] {
  const map = new Map<string, T>();
  for (const item of remote) {
    map.set(item.id, item);
  }
  for (const item of local) {
    map.set(item.id, item);
  }
  return [...map.values()];
}

function normalizePlanFromDb(value: unknown): StudySchedulePlan | null {
  if (!value || typeof value !== 'object') return null;
  const raw = value as Partial<StudySchedulePlan>;
  if (!raw.id || !raw.user_id || !raw.title || !raw.created_at || !raw.updated_at) {
    return null;
  }

  const preferences = raw.preferences;
  const summary = raw.summary;
  const sessions = raw.sessions;

  if (!preferences || typeof preferences !== 'object') return null;
  if (!summary || typeof summary !== 'object') return null;
  if (!Array.isArray(sessions)) return null;

  return {
    id: raw.id,
    user_id: raw.user_id,
    title: raw.title,
    goal: raw.goal ?? '',
    preferences: preferences as StudySchedulePreferences,
    summary: summary as StudySchedulePlan['summary'],
    sessions: sessions as StudyScheduleSession[],
    is_pinned: Boolean(raw.is_pinned),
    created_at: raw.created_at,
    updated_at: raw.updated_at,
  };
}

async function trySyncSilently(userId?: string): Promise<void> {
  if (!userId) return;

  const autoSyncEnabled = await shouldAutoSync();
  if (!autoSyncEnabled) return;

  try {
    await syncPendingOperations(userId);
  } catch {
    // Keep local-first behavior.
  }
}

export function getDefaultStudySchedulePreferences(today = new Date()): StudySchedulePreferences {
  const startDate = toIsoDate(today);
  const periodPreset: StudyPeriodPreset = 'trimester';
  return {
    title: 'Mon emploi du temps',
    goal: '',
    periodPreset,
    startDate,
    endDate: resolveStudyPeriodEndDate(startDate, periodPreset, null),
    customWeeks: null,
    sessionsPerWeek: 5,
    sessionMinutes: 50,
    includeWeekend: false,
    selectedDays: ['mon', 'tue', 'wed', 'thu', 'fri'],
    preferredSlot: 'evening',
  };
}

export async function getCachedStudySchedulePlans(userId: string): Promise<StudySchedulePlan[]> {
  return sortPlans(await getLocalSchedules(userId));
}

export async function getStudySchedulePlans(userId: string): Promise<StudySchedulePlan[]> {
  const localPlans = await getLocalSchedules(userId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('study_schedules')
    .select('id, user_id, title, goal, preferences, summary, sessions, is_pinned, created_at, updated_at')
    .eq('user_id', userId)
    .order('is_pinned', { ascending: false })
    .order('updated_at', { ascending: false });

  if (error) {
    if (isLikelyNetworkError(error)) {
      return sortPlans(localPlans);
    }
    if (localPlans.length > 0) {
      return sortPlans(localPlans);
    }
    throw error;
  }

  const remotePlans = (data ?? []).map(normalizePlanFromDb).filter(Boolean) as StudySchedulePlan[];
  const pendingCount = await getOutboxSize(userId);

  const next = pendingCount > 0 ? sortPlans(mergeById(remotePlans, localPlans)) : sortPlans(remotePlans);
  await setLocalSchedules(userId, next);
  return next;
}

export async function getLatestStudySchedulePlan(userId: string): Promise<StudySchedulePlan | null> {
  const plans = await getCachedStudySchedulePlans(userId);
  if (plans.length > 0) return plans[0];

  const remote = await getStudySchedulePlans(userId);
  return remote[0] ?? null;
}

export async function getStudySchedulePlanById(userId: string, scheduleId: string): Promise<StudySchedulePlan | null> {
  const local = await getLocalScheduleById(userId, scheduleId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('study_schedules')
    .select('id, user_id, title, goal, preferences, summary, sessions, is_pinned, created_at, updated_at')
    .eq('id', scheduleId)
    .eq('user_id', userId)
    .maybeSingle();

  if (error) {
    if (local) return local;
    if (isLikelyNetworkError(error)) return null;
    throw error;
  }

  const normalized = normalizePlanFromDb(data);
  if (normalized) {
    await upsertLocalSchedule(userId, normalized);
    return normalized;
  }

  return local;
}

type GenerateInput = {
  userId: string;
  preferences: StudySchedulePreferences;
  tasks?: Task[];
  resources?: Resource[];
  existingPlanId?: string;
};

export async function generateAndSaveStudySchedule(input: GenerateInput): Promise<StudySchedulePlan> {
  const normalizedPreferences = normalizePreferences(input.preferences);
  const focusPool = buildFocusPool(normalizedPreferences.goal, input.tasks ?? [], input.resources ?? []);
  const sessions = buildSessions(normalizedPreferences, focusPool);

  const totalDays = daysDiffInclusive(normalizedPreferences.startDate, normalizedPreferences.endDate);
  const totalWeeks = Math.max(1, Math.ceil(totalDays / 7));
  const totalHours = Math.round((sessions.length * normalizedPreferences.sessionMinutes) / 60);

  const existing = input.existingPlanId
    ? await getLocalScheduleById(input.userId, input.existingPlanId)
    : null;

  const now = nowIso();
  const plan: StudySchedulePlan = {
    id: existing?.id ?? createEntityId(),
    user_id: input.userId,
    title: normalizedPreferences.title.trim() || 'Mon emploi du temps',
    goal: normalizedPreferences.goal.trim(),
    preferences: normalizedPreferences,
    summary: {
      totalSessions: sessions.length,
      totalHours,
      totalWeeks,
      startDate: normalizedPreferences.startDate,
      endDate: normalizedPreferences.endDate,
    },
    sessions,
    is_pinned: existing?.is_pinned ?? false,
    created_at: existing?.created_at ?? now,
    updated_at: now,
  };

  await upsertLocalSchedule(input.userId, plan);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'schedule',
    action: 'upsert',
    userId: input.userId,
    record: plan,
    createdAt: now,
  });

  void trySyncSilently(input.userId);
  return plan;
}

export async function togglePinStudySchedulePlan(scheduleId: string, userId: string, pinned?: boolean): Promise<void> {
  const current = await getLocalScheduleById(userId, scheduleId);
  if (!current) return;

  const next: StudySchedulePlan = {
    ...current,
    is_pinned: pinned !== undefined ? pinned : !current.is_pinned,
    updated_at: nowIso(),
  };

  await upsertLocalSchedule(userId, next);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'schedule',
    action: 'upsert',
    userId,
    record: next,
    createdAt: next.updated_at,
  });

  void trySyncSilently(userId);
}

export async function deleteStudySchedulePlan(scheduleId: string, userId: string): Promise<void> {
  const now = nowIso();
  await removeLocalSchedule(userId, scheduleId);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'schedule',
    action: 'delete',
    userId,
    recordId: scheduleId,
    createdAt: now,
  });

  void trySyncSilently(userId);
}
