import { getErrorMessage } from '@/lib/errors';
import {
  createEntityId,
  createLocalId,
  enqueueOutboxOperation,
  getCachedAnnouncements,
  getLocalResourceById,
  getLocalResources,
  getLocalTaskById,
  getLocalTasks,
  getOutboxSize,
  removeLocalResource,
  removeLocalTask,
  setCachedAnnouncements,
  setLocalResources,
  setLocalTasks,
  upsertCachedAnnouncement,
  upsertLocalResource,
  upsertLocalTask,
} from '@/lib/offline-store';
import { isLikelyNetworkError, syncPendingOperations } from '@/lib/sync-engine';
import { supabase } from '@/lib/supabase';
import type { Announcement, Resource, Task } from '@/types/supabase';

const todayIso = () => new Date().toISOString().slice(0, 10);
const ARCHIVE_RETENTION_MS = 24 * 60 * 60 * 1000;
const taskSelectFields =
  'id, user_id, title, description, status, priority, due_date, completed_at, is_persistent, created_at';
const legacyTaskSelectFields = 'id, user_id, title, description, status, priority, due_date, created_at';

function isMissingTaskArchiveColumnError(error: unknown): boolean {
  if (!error || typeof error !== 'object') return false;
  const typed = error as { code?: unknown; message?: unknown };
  if (typed.code !== '42703') return false;
  const message = typeof typed.message === 'string' ? typed.message.toLowerCase() : '';
  return (
    message.includes('tasks.is_persistent')
    || message.includes('tasks.completed_at')
    || message.includes('column is_persistent')
    || message.includes('column completed_at')
    || message.includes('is_persistent does not exist')
    || message.includes('completed_at does not exist')
  );
}

function withTaskArchiveDefaults(task: Omit<Task, 'completed_at' | 'is_persistent'>): Task {
  return {
    ...task,
    completed_at: null,
    is_persistent: false,
  };
}

function normalizeTask(task: Task): Task {
  return {
    ...task,
    completed_at: task.completed_at ?? null,
    is_persistent: Boolean(task.is_persistent),
  };
}

async function getNormalizedLocalTasks(userId: string): Promise<Task[]> {
  const tasks = (await getLocalTasks(userId)).map(normalizeTask);
  return purgeExpiredLocalArchivedTasks(userId, tasks);
}

export async function getCachedTasks(userId: string): Promise<Task[]> {
  return sortTasks(await getNormalizedLocalTasks(userId));
}

export async function getCachedTaskById(userId: string, taskId: string): Promise<Task | null> {
  const task = await getLocalTaskById(userId, taskId);
  if (!task) return null;
  return normalizeTask(task);
}

export async function getCachedTaskStats(userId: string): Promise<{ total: number; done: number }> {
  const tasks = await getCachedTasks(userId);
  return {
    total: tasks.length,
    done: tasks.filter((task) => task.status === 'done').length,
  };
}

export async function getCachedResources(userId: string): Promise<Resource[]> {
  return sortResources(await getLocalResources(userId));
}

export async function getCachedResourceById(userId: string, resourceId: string): Promise<Resource | null> {
  return getLocalResourceById(userId, resourceId);
}

function shouldPurgeArchivedTask(task: Task, now = Date.now()) {
  if (task.status !== 'done') return false;
  if (task.is_persistent) return false;
  if (!task.completed_at) return false;
  const completedAt = Date.parse(task.completed_at);
  if (Number.isNaN(completedAt)) return false;
  return now - completedAt >= ARCHIVE_RETENTION_MS;
}

async function purgeExpiredLocalArchivedTasks(userId: string, tasks: Task[]): Promise<Task[]> {
  const expired = tasks.filter((task) => shouldPurgeArchivedTask(task));
  if (expired.length === 0) {
    return tasks;
  }

  const expiredIds = new Set(expired.map((task) => task.id));
  const remaining = tasks.filter((task) => !expiredIds.has(task.id));
  await setLocalTasks(userId, remaining);

  const now = new Date().toISOString();
  for (const task of expired) {
    await enqueueOutboxOperation({
      id: createLocalId('op'),
      entity: 'task',
      action: 'delete',
      userId,
      recordId: task.id,
      createdAt: now,
    });
  }

  return remaining;
}

async function purgeExpiredRemoteArchivedTasks(userId: string): Promise<void> {
  const cutoff = new Date(Date.now() - ARCHIVE_RETENTION_MS).toISOString();

  const { error } = await supabase
    .from('tasks')
    .delete()
    .eq('user_id', userId)
    .eq('status', 'done')
    .eq('is_persistent', false)
    .lte('completed_at', cutoff);

  if (error && !isLikelyNetworkError(error) && !isMissingTaskArchiveColumnError(error)) {
    throw error;
  }
}

function sortTasks(tasks: Task[]): Task[] {
  return [...tasks].sort((a, b) => {
    const aDate = a.due_date ?? '9999-12-31';
    const bDate = b.due_date ?? '9999-12-31';
    return aDate.localeCompare(bDate);
  });
}

function sortResources(resources: Resource[]): Resource[] {
  return [...resources].sort((a, b) => {
    const aDate = a.created_at ?? '';
    const bDate = b.created_at ?? '';
    return bDate.localeCompare(aDate);
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

async function trySyncSilently(userId?: string) {
  if (!userId) {
    return;
  }

  try {
    await syncPendingOperations(userId);
  } catch {
    // Keep local-first behavior if sync fails.
  }
}

export async function fetchTasks(userId: string) {
  const localTasks = await getNormalizedLocalTasks(userId);

  await trySyncSilently(userId);
  await purgeExpiredRemoteArchivedTasks(userId);

  const { data, error } = await supabase
    .from('tasks')
    .select(taskSelectFields)
    .eq('user_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .returns<Task[]>();

  if (error && isMissingTaskArchiveColumnError(error)) {
    const legacy = await supabase
      .from('tasks')
      .select(legacyTaskSelectFields)
      .eq('user_id', userId)
      .order('due_date', { ascending: true, nullsFirst: false })
      .returns<Omit<Task, 'completed_at' | 'is_persistent'>[]>();

    if (legacy.error) {
      if (isLikelyNetworkError(legacy.error)) {
        return sortTasks(localTasks);
      }
      if (localTasks.length > 0) {
        return sortTasks(localTasks);
      }
      throw legacy.error;
    }

    const legacyWithDefaults = (legacy.data ?? []).map(withTaskArchiveDefaults);
    const next = await purgeExpiredLocalArchivedTasks(userId, sortTasks(legacyWithDefaults));
    const pendingCount = await getOutboxSize(userId);
    if (pendingCount > 0) {
      const merged = sortTasks(mergeById(next, localTasks));
      await setLocalTasks(userId, merged);
      return merged;
    }

    await setLocalTasks(userId, next);
    return next;
  }

  if (error) {
    if (isLikelyNetworkError(error)) {
      return sortTasks(localTasks);
    }
    if (localTasks.length > 0) {
      return sortTasks(localTasks);
    }
    throw error;
  }

  const next = await purgeExpiredLocalArchivedTasks(userId, sortTasks(data ?? []));
  const pendingCount = await getOutboxSize(userId);
  if (pendingCount > 0) {
    const merged = sortTasks(mergeById(next, localTasks));
    await setLocalTasks(userId, merged);
    return merged;
  }

  await setLocalTasks(userId, next);
  return next;
}

export async function fetchTaskById(userId: string, taskId: string) {
  const localTask = await getLocalTaskById(userId, taskId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('tasks')
    .select(taskSelectFields)
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle<Task>();

  if (error && isMissingTaskArchiveColumnError(error)) {
    const legacy = await supabase
      .from('tasks')
      .select(legacyTaskSelectFields)
      .eq('id', taskId)
      .eq('user_id', userId)
      .maybeSingle<Omit<Task, 'completed_at' | 'is_persistent'>>();

    if (legacy.error) {
      if (localTask) return localTask;
      if (isLikelyNetworkError(legacy.error)) return null;
      throw legacy.error;
    }

    const normalized = legacy.data ? withTaskArchiveDefaults(legacy.data) : null;
    if (normalized) {
      await upsertLocalTask(userId, normalized);
    }
    return normalized;
  }

  if (error) {
    if (localTask) return localTask;
    if (isLikelyNetworkError(error)) return null;
    throw error;
  }

  if (data) {
    await upsertLocalTask(userId, data);
  }

  return data;
}

export async function createTask(input: {
  userId: string;
  title: string;
  description?: string;
  dueDate?: string;
  priority: 'low' | 'medium' | 'high';
  isPersistent?: boolean;
}) {
  const now = new Date().toISOString();
  const task: Task = {
    id: createEntityId(),
    user_id: input.userId,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    status: 'todo',
    priority: input.priority,
    due_date: input.dueDate || null,
    completed_at: null,
    is_persistent: Boolean(input.isPersistent),
    created_at: now,
  };

  await upsertLocalTask(input.userId, task);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'task',
    action: 'upsert',
    userId: input.userId,
    record: task,
    createdAt: now,
  });

  void trySyncSilently(input.userId);
  return task;
}

export async function updateTask(taskId: string, userId: string, patch: Partial<Task>) {
  const localCurrent = await getLocalTaskById(userId, taskId);
  const now = new Date().toISOString();

  const next: Task = {
    id: localCurrent?.id ?? taskId,
    user_id: localCurrent?.user_id ?? userId,
    title: patch.title ?? localCurrent?.title ?? 'Tache',
    description: patch.description !== undefined ? patch.description : (localCurrent?.description ?? null),
    status: patch.status ?? localCurrent?.status ?? 'todo',
    priority: patch.priority ?? localCurrent?.priority ?? 'medium',
    due_date: patch.due_date !== undefined ? patch.due_date : (localCurrent?.due_date ?? null),
    completed_at: patch.completed_at !== undefined ? patch.completed_at : (localCurrent?.completed_at ?? null),
    is_persistent: patch.is_persistent ?? localCurrent?.is_persistent ?? false,
    created_at: localCurrent?.created_at ?? now,
  };

  await upsertLocalTask(userId, next);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'task',
    action: 'upsert',
    userId,
    record: next,
    createdAt: now,
  });

  void trySyncSilently(userId);
}

export async function deleteTask(taskId: string, userId: string) {
  const now = new Date().toISOString();
  await removeLocalTask(userId, taskId);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'task',
    action: 'delete',
    userId,
    recordId: taskId,
    createdAt: now,
  });

  void trySyncSilently(userId);
}

export async function fetchResources(userId: string) {
  const localResources = await getLocalResources(userId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('resources')
    .select('id, user_id, title, type, content, file_url, tags, created_at')
    .eq('user_id', userId)
    .order('created_at', { ascending: false })
    .returns<Resource[]>();

  if (error) {
    if (isLikelyNetworkError(error)) {
      return sortResources(localResources);
    }
    if (localResources.length > 0) {
      return sortResources(localResources);
    }
    throw error;
  }

  const next = sortResources(data ?? []);
  const pendingCount = await getOutboxSize(userId);
  if (pendingCount > 0) {
    const merged = sortResources(mergeById(next, localResources));
    await setLocalResources(userId, merged);
    return merged;
  }

  await setLocalResources(userId, next);
  return next;
}

export async function fetchResourceById(userId: string, resourceId: string) {
  const localResource = await getLocalResourceById(userId, resourceId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('resources')
    .select('id, user_id, title, type, content, file_url, tags, created_at')
    .eq('id', resourceId)
    .eq('user_id', userId)
    .maybeSingle<Resource>();

  if (error) {
    if (localResource) return localResource;
    if (isLikelyNetworkError(error)) return null;
    throw error;
  }

  if (data) {
    await upsertLocalResource(userId, data);
  }

  return data;
}

export async function createResource(input: {
  userId: string;
  title: string;
  type: 'note' | 'link' | 'file';
  content?: string;
  fileUrl?: string;
  tags: string[];
}) {
  const now = new Date().toISOString();
  const resource: Resource = {
    id: createEntityId(),
    user_id: input.userId,
    title: input.title.trim(),
    type: input.type,
    content: input.content?.trim() || null,
    file_url: input.fileUrl?.trim() || null,
    tags: input.tags,
    created_at: now,
  };

  await upsertLocalResource(input.userId, resource);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'resource',
    action: 'upsert',
    userId: input.userId,
    record: resource,
    createdAt: now,
  });

  void trySyncSilently(input.userId);
  return resource;
}

export async function updateResource(resourceId: string, userId: string, patch: Partial<Resource>) {
  const localCurrent = await getLocalResourceById(userId, resourceId);
  const now = new Date().toISOString();

  const next: Resource = {
    id: localCurrent?.id ?? resourceId,
    user_id: localCurrent?.user_id ?? userId,
    title: patch.title ?? localCurrent?.title ?? 'Ressource',
    type: patch.type ?? localCurrent?.type ?? 'note',
    content: patch.content !== undefined ? patch.content : (localCurrent?.content ?? null),
    file_url: patch.file_url !== undefined ? patch.file_url : (localCurrent?.file_url ?? null),
    tags: patch.tags !== undefined ? patch.tags : (localCurrent?.tags ?? []),
    created_at: localCurrent?.created_at ?? now,
  };

  await upsertLocalResource(userId, next);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'resource',
    action: 'upsert',
    userId,
    record: next,
    createdAt: now,
  });

  void trySyncSilently(userId);
}

export async function deleteResource(resourceId: string, userId: string) {
  const now = new Date().toISOString();
  await removeLocalResource(userId, resourceId);
  await enqueueOutboxOperation({
    id: createLocalId('op'),
    entity: 'resource',
    action: 'delete',
    userId,
    recordId: resourceId,
    createdAt: now,
  });

  void trySyncSilently(userId);
}

export async function fetchAnnouncements() {
  const localAnnouncements = await getCachedAnnouncements();

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, is_active, is_important, created_by, created_at, expires_at')
    .eq('is_active', true)
    .or(`expires_at.is.null,expires_at.gte.${new Date().toISOString()}`)
    .order('created_at', { ascending: false })
    .returns<Announcement[]>();

  if (error) {
    if (isLikelyNetworkError(error)) {
      return localAnnouncements;
    }
    if (localAnnouncements.length > 0) {
      return localAnnouncements;
    }
    throw error;
  }

  const next = data ?? [];
  await setCachedAnnouncements(next);
  return next;
}

export async function fetchAnnouncementById(id: string) {
  const cached = await getCachedAnnouncements();
  const localMatch = cached.find((announcement) => announcement.id === id) ?? null;

  const { data, error } = await supabase
    .from('announcements')
    .select('id, title, content, is_active, is_important, created_by, created_at, expires_at')
    .eq('id', id)
    .maybeSingle<Announcement>();

  if (error) {
    if (localMatch) return localMatch;
    if (isLikelyNetworkError(error)) return null;
    throw error;
  }

  if (data) {
    await upsertCachedAnnouncement(data);
  }
  return data;
}

export async function fetchDashboardSummary(userId: string) {
  const tasks = await fetchTasks(userId);
  const resources = await fetchResources(userId);
  const announcements = await fetchAnnouncements();

  const todoTasks = tasks.filter((task) => task.status !== 'done');
  const overdue = todoTasks.filter((task) => (task.due_date ? task.due_date < todayIso() : false));

  return {
    tasks,
    totalTasks: tasks.length,
    totalResources: resources.length,
    latestResources: resources.slice(0, 3),
    todoCount: todoTasks.length,
    overdueCount: overdue.length,
    latestAnnouncement: announcements[0] ?? null,
  };
}

export async function getCachedDashboardSummary(userId: string) {
  const tasks = await getCachedTasks(userId);
  const resources = await getCachedResources(userId);
  const announcements = await getCachedAnnouncements();

  const todoTasks = tasks.filter((task) => task.status !== 'done');
  const overdue = todoTasks.filter((task) => (task.due_date ? task.due_date < todayIso() : false));

  return {
    tasks,
    totalTasks: tasks.length,
    totalResources: resources.length,
    latestResources: resources.slice(0, 3),
    todoCount: todoTasks.length,
    overdueCount: overdue.length,
    latestAnnouncement: announcements[0] ?? null,
  };
}

export async function fetchTaskStats(userId: string) {
  try {
    const tasks = await fetchTasks(userId);
    return {
      total: tasks.length,
      done: tasks.filter((task) => task.status === 'done').length,
    };
  } catch (error) {
    throw new Error(getErrorMessage(error, 'Impossible de lire les statistiques.'));
  }
}
