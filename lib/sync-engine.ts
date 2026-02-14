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
      if (error) throw error;
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
