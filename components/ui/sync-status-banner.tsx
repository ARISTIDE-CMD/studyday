import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { useOfflineSyncStatus } from '@/providers/offline-sync-provider';

type SyncStatusBannerProps = {
  compact?: boolean;
};

export function SyncStatusBanner({ compact = false }: SyncStatusBannerProps) {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const { pendingOperations, isSyncing, lastSyncAt, lastSyncStatus, lastSyncedCount } = useOfflineSyncStatus();
  const styles = useMemo(() => createStyles(compact), [compact]);

  const showSuccess =
    !isSyncing
    && pendingOperations <= 0
    && lastSyncStatus === 'success'
    && typeof lastSyncAt === 'string'
    && Date.now() - Date.parse(lastSyncAt) <= 20_000;

  const showError =
    !isSyncing
    && lastSyncStatus === 'error'
    && typeof lastSyncAt === 'string'
    && Date.now() - Date.parse(lastSyncAt) <= 20_000;

  if (pendingOperations <= 0 && !isSyncing && !showSuccess && !showError) return null;

  const tone =
    isSyncing || pendingOperations > 0
      ? {
          border: colors.warningSoft,
          bg: colors.warningSoft,
          text: colors.warning,
          icon: colors.warning,
        }
      : showError
        ? {
            border: colors.dangerSoft,
            bg: colors.dangerSoft,
            text: colors.danger,
            icon: colors.danger,
          }
        : {
            border: colors.successSoft,
            bg: colors.successSoft,
            text: colors.success,
            icon: colors.success,
          };

  const message = isSyncing
    ? t('sync.syncing', { count: pendingOperations })
    : pendingOperations > 0
      ? t('sync.pending', { count: pendingOperations })
      : showError
        ? t('sync.error')
        : t('sync.success', { count: lastSyncedCount });

  return (
    <View style={[styles.wrap, { borderColor: tone.border, backgroundColor: tone.bg }]}>
      <Ionicons
        name={isSyncing ? 'sync-outline' : showError ? 'alert-circle-outline' : 'checkmark-circle-outline'}
        size={14}
        color={tone.icon}
      />
      <Text style={[styles.text, { color: tone.text }]}>{message}</Text>
    </View>
  );
}

const createStyles = (compact: boolean) =>
  StyleSheet.create({
    wrap: {
      borderRadius: 10,
      borderWidth: 1,
      paddingHorizontal: compact ? 10 : 12,
      paddingVertical: compact ? 6 : 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      fontSize: compact ? 11 : 12,
      fontWeight: '700',
    },
  });
