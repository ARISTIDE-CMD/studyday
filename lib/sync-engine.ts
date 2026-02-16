import { getErrorMessage } from '@/lib/errors';
import {
  getOutboxOperations,
  setLocalProfile,
  upsertLocalSchedule,
  updateOutboxOperation,
  upsertLocalResource,
  removeOutboxOperation,
  type OutboxOperation,
} from '@/lib/offline-store';
import { loadAppSettings } from '@/lib/settings-storage';
import { supabase } from '@/lib/supabase';
import { uploadLocalAssetToBucket } from '@/lib/supabase-storage-api';

const networkErrorHints = [
  'network',
  'fetch failed',
  'failed to fetch',
  'network request failed',
  'offline',
  'timed out',
  'socket',
];

export function isLikelyNetworkError(error: unknown): boolean {
  const message = getErrorMessage(error, '').toLowerCase();
  return networkErrorHints.some((hint) => message.includes(hint));
}

function isLocalAssetUri(value: string | null | undefined): boolean {
  if (!value) return false;
  const normalized = value.trim();
  if (!normalized) return false;
  return /^(file|content|ph|assets-library):\/\//i.test(normalized);
}

function extractFileNameFromUri(uri: string, fallback: string): string {
  const raw = uri.split('?')[0].split('#')[0];
  const lastSegment = raw.split('/').pop() || '';
  const sanitized = lastSegment.trim();
  if (!sanitized) return fallback;
  return sanitized;
}

export async function shouldAutoSync(): Promise<boolean> {
  const settings = await loadAppSettings();
  return settings.syncMode === 'auto';
}

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

async function syncOperation(operation: OutboxOperation): Promise<void> {
  if (operation.entity === 'task' || operation.entity === 'resource' || operation.entity === 'schedule') {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: operation.userId }, { onConflict: 'id' });
    if (profileError) throw profileError;
  }

  if (operation.entity === 'profile') {
    let record = operation.record;
    const avatar = record.avatar_url?.trim() || null;
    if (avatar && isLocalAssetUri(avatar)) {
      const uploadedAvatar = await uploadLocalAssetToBucket({
        bucket: 'images',
        fileUri: avatar,
        userId: operation.userId,
        folder: 'avatars',
        fileName: extractFileNameFromUri(avatar, 'avatar.jpg'),
      });
      record = { ...record, avatar_url: uploadedAvatar };
      await setLocalProfile(operation.userId, record);
      await updateOutboxOperation(operation.id, { ...operation, record });
    }

    const { error } = await supabase.from('profiles').upsert(record, { onConflict: 'id' });
    if (error) throw error;
    return;
  }

  if (operation.entity === 'task') {
    if (operation.action === 'upsert') {
      const { error } = await supabase.from('tasks').upsert(operation.record, { onConflict: 'id' });
      if (error) {
        if (!isMissingTaskArchiveColumnError(error)) {
          throw error;
        }

        const legacyRecord = {
          id: operation.record.id,
          user_id: operation.record.user_id,
          title: operation.record.title,
          description: operation.record.description,
          status: operation.record.status,
          priority: operation.record.priority,
          due_date: operation.record.due_date,
          created_at: operation.record.created_at,
        };
        const legacyUpsert = await supabase.from('tasks').upsert(legacyRecord, { onConflict: 'id' });
        if (legacyUpsert.error) throw legacyUpsert.error;
      }
      return;
    }

    const { error } = await supabase
      .from('tasks')
      .delete()
      .eq('id', operation.recordId)
      .eq('user_id', operation.userId);
    if (error) throw error;
    return;
  }

  if (operation.entity === 'schedule') {
    if (operation.action === 'upsert') {
      const { error } = await supabase.from('study_schedules').upsert(operation.record, { onConflict: 'id' });
      if (error) throw error;
      await upsertLocalSchedule(operation.userId, operation.record);
      return;
    }

    const { error } = await supabase
      .from('study_schedules')
      .delete()
      .eq('id', operation.recordId)
      .eq('user_id', operation.userId);
    if (error) throw error;
    return;
  }

  if (operation.action === 'upsert') {
    let record = operation.record;
    const localFileUri = record.file_url?.trim() || null;
    if (localFileUri && isLocalAssetUri(localFileUri)) {
      const uploadedFile = await uploadLocalAssetToBucket({
        bucket: 'files',
        fileUri: localFileUri,
        userId: operation.userId,
        folder: 'resources',
        fileName: extractFileNameFromUri(localFileUri, 'resource.bin'),
      });
      record = { ...record, file_url: uploadedFile };
      await upsertLocalResource(operation.userId, record);
      await updateOutboxOperation(operation.id, { ...operation, record });
    }

    const { error } = await supabase.from('resources').upsert(record, { onConflict: 'id' });
    if (error) throw error;
    return;
  }

  const { error } = await supabase
    .from('resources')
    .delete()
    .eq('id', operation.recordId)
    .eq('user_id', operation.userId);
  if (error) throw error;
}

export async function syncPendingOperations(userId?: string): Promise<{
  syncedCount: number;
  pendingCount: number;
}> {
  const operations = await getOutboxOperations(userId);
  let syncedCount = 0;

  for (const operation of operations) {
    try {
      await syncOperation(operation);
      await removeOutboxOperation(operation.id);
      syncedCount += 1;
    } catch (error) {
      if (isLikelyNetworkError(error)) {
        break;
      }
      throw new Error(getErrorMessage(error, 'Echec de synchronisation des donnees locales.'));
    }
  }

  const remaining = await getOutboxOperations(userId);
  return {
    syncedCount,
    pendingCount: remaining.length,
  };
}
