import { getErrorMessage } from '@/lib/errors';
import {
  getOutboxOperations,
  removeOutboxOperation,
  type OutboxOperation,
} from '@/lib/offline-store';
import { supabase } from '@/lib/supabase';

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
  if (operation.entity === 'task' || operation.entity === 'resource') {
    const { error: profileError } = await supabase
      .from('profiles')
      .upsert({ id: operation.userId }, { onConflict: 'id' });
    if (profileError) throw profileError;
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

  if (operation.action === 'upsert') {
    const { error } = await supabase.from('resources').upsert(operation.record, { onConflict: 'id' });
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
