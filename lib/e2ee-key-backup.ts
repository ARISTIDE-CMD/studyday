import { exportEncryptionKeyBackup, importEncryptionKeyBackup } from '@/lib/offline-crypto';
import { supabase } from '@/lib/supabase';

type E2eeKeyBackupRow = {
  user_id: string;
  payload: string;
  updated_at: string;
};

export const NO_REMOTE_KEY_BACKUP_ERROR = 'NO_REMOTE_KEY_BACKUP';

export async function hasRemoteE2eeKeyBackup(userId: string): Promise<boolean> {
  const { data, error } = await supabase
    .from('e2ee_key_backups')
    .select('user_id')
    .eq('user_id', userId)
    .maybeSingle<{ user_id: string }>();

  if (error) throw error;
  return Boolean(data?.user_id);
}

export async function upsertRemoteE2eeKeyBackup(userId: string, payload: string): Promise<void> {
  const row: E2eeKeyBackupRow = {
    user_id: userId,
    payload,
    updated_at: new Date().toISOString(),
  };

  const { error } = await supabase
    .from('e2ee_key_backups')
    .upsert(row, { onConflict: 'user_id' });

  if (error) throw error;
}

export async function createRemoteE2eeKeyBackup(userId: string, passphrase: string): Promise<string> {
  const payload = await exportEncryptionKeyBackup(passphrase);
  await upsertRemoteE2eeKeyBackup(userId, payload);
  return payload;
}

export async function restoreRemoteE2eeKeyBackup(userId: string, passphrase: string): Promise<void> {
  const { data, error } = await supabase
    .from('e2ee_key_backups')
    .select('payload')
    .eq('user_id', userId)
    .maybeSingle<{ payload: string }>();

  if (error) throw error;
  if (!data?.payload) {
    throw new Error(NO_REMOTE_KEY_BACKUP_ERROR);
  }

  await importEncryptionKeyBackup(data.payload, passphrase);
}
