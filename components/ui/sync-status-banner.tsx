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
  const { pendingOperations, isSyncing } = useOfflineSyncStatus();
  const styles = useMemo(() => createStyles(colors, compact), [colors, compact]);

  if (pendingOperations <= 0 && !isSyncing) return null;

  return (
    <View style={styles.wrap}>
      <Ionicons name={isSyncing ? 'sync-outline' : 'cloud-offline-outline'} size={14} color={colors.warning} />
      <Text style={styles.text}>
        {isSyncing
          ? t('sync.syncing', { count: pendingOperations })
          : t('sync.pending', { count: pendingOperations })}
      </Text>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors'], compact: boolean) =>
  StyleSheet.create({
    wrap: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.warningSoft,
      backgroundColor: colors.warningSoft,
      paddingHorizontal: compact ? 10 : 12,
      paddingVertical: compact ? 6 : 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    text: {
      flex: 1,
      color: colors.warning,
      fontSize: compact ? 11 : 12,
      fontWeight: '700',
    },
  });

