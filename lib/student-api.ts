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
  const localTasks = await getLocalTasks(userId);

  await trySyncSilently(userId);

  const { data, error } = await supabase
    .from('tasks')
    .select('id, user_id, title, description, status, priority, due_date, created_at')
    .eq('user_id', userId)
    .order('due_date', { ascending: true, nullsFirst: false })
    .returns<Task[]>();

  if (error) {
    if (isLikelyNetworkError(error)) {
      return sortTasks(localTasks);
    }
    if (localTasks.length > 0) {
      return sortTasks(localTasks);
    }
    throw error;
  }

  const next = sortTasks(data ?? []);
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
    .select('id, user_id, title, description, status, priority, due_date, created_at')
    .eq('id', taskId)
    .eq('user_id', userId)
    .maybeSingle<Task>();

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
  const announcements = await fetchAnnouncements();

  const todoTasks = tasks.filter((task) => task.status !== 'done');
  const overdue = todoTasks.filter((task) => (task.due_date ? task.due_date < todayIso() : false));

  return {
    tasks,
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
