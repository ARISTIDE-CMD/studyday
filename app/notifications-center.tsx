import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { formatDateLabel } from '@/lib/format';
import { useInAppNotification } from '@/providers/notification-provider';

export default function NotificationsCenterScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const { activityNotifications, markAllActivityAsRead, removeActivity } = useInAppNotification();
  const [filter, setFilter] = useState<'all' | 'unread'>('all');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const unreadCount = useMemo(
    () => activityNotifications.filter((item) => !item.readAt).length,
    [activityNotifications]
  );

  const visibleNotifications = useMemo(
    () =>
      filter === 'unread'
        ? activityNotifications.filter((item) => !item.readAt)
        : activityNotifications,
    [activityNotifications, filter]
  );

  const onView = async (notificationId: string, entityType: 'task' | 'resource', entityId: string) => {
    await removeActivity(notificationId);
    if (entityType === 'task') {
      router.push(`/task/${entityId}`);
      return;
    }
    router.push(`/resource/${entityId}`);
  };

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('activityNotifications.title')}</Text>
        <Text style={styles.subtitle}>{t('activityNotifications.subtitle')}</Text>

        <View style={styles.actionsRow}>
          <View style={styles.filterRow}>
            <TouchableOpacity
              style={[styles.filterChip, filter === 'all' && styles.filterChipActive]}
              onPress={() => setFilter('all')}>
              <Text style={[styles.filterText, filter === 'all' && styles.filterTextActive]}>
                {t('activityNotifications.filterAll')}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[styles.filterChip, filter === 'unread' && styles.filterChipActive]}
              onPress={() => setFilter('unread')}>
              <Text style={[styles.filterText, filter === 'unread' && styles.filterTextActive]}>
                {`${t('activityNotifications.filterUnread')} (${unreadCount})`}
              </Text>
            </TouchableOpacity>
          </View>

          <TouchableOpacity
            style={[styles.markAllBtn, unreadCount === 0 && styles.markAllBtnDisabled]}
            disabled={unreadCount === 0}
            onPress={() => void markAllActivityAsRead()}>
            <Text style={styles.markAllText}>{t('activityNotifications.markAllRead')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {visibleNotifications.length === 0 ? (
          <StateBlock
            variant="empty"
            title={t('activityNotifications.emptyTitle')}
            description={t('activityNotifications.emptyDescription')}
          />
        ) : (
          visibleNotifications.map((item) => (
            <View key={item.id} style={styles.card}>
              <View style={styles.cardHead}>
                <View
                  style={[
                    styles.typeChip,
                    item.entityType === 'task' ? styles.typeChipTask : styles.typeChipResource,
                  ]}>
                  <Text style={styles.typeChipText}>
                    {item.entityType === 'task'
                      ? t('activityNotifications.taskLabel')
                      : t('activityNotifications.resourceLabel')}
                  </Text>
                    </View>
                <Text style={styles.dateText}>
                  {formatDateLabel(item.createdAt, locale, t('common.noDate'))}
                </Text>
              </View>

              {!item.readAt ? <View style={styles.unreadDot} /> : null}

              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.cardMessage}>{item.message}</Text>

              <TouchableOpacity
                style={styles.viewBtn}
                onPress={() => void onView(item.id, item.entityType, item.entityId)}>
                <Text style={styles.viewBtnText}>{t('activityNotifications.view')}</Text>
                <Ionicons name="open-outline" size={14} color={colors.primary} />
              </TouchableOpacity>
            </View>
          ))
        )}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.background,
    },
    header: {
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 12,
    },
    backBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.surface,
      marginBottom: 14,
    },
    backText: {
      color: colors.text,
      fontWeight: '600',
    },
    title: {
      fontSize: 24,
      color: colors.text,
      fontWeight: '800',
      marginBottom: 4,
    },
    subtitle: {
      color: colors.textMuted,
    },
    actionsRow: {
      marginTop: 12,
      gap: 10,
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 6,
    },
    filterChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    filterText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    filterTextActive: {
      color: colors.primary,
    },
    markAllBtn: {
      alignSelf: 'flex-start',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    markAllBtnDisabled: {
      opacity: 0.45,
    },
    markAllText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 6,
      paddingBottom: 34,
      gap: 10,
    },
    card: {
      position: 'relative',
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      gap: 6,
    },
    cardHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginBottom: 2,
    },
    typeChip: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 4,
    },
    typeChipTask: {
      backgroundColor: colors.primarySoft,
    },
    typeChipResource: {
      backgroundColor: colors.successSoft,
    },
    typeChipText: {
      color: colors.text,
      fontSize: 11,
      fontWeight: '700',
    },
    dateText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    unreadDot: {
      position: 'absolute',
      right: 11,
      top: 11,
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: colors.danger,
    },
    cardTitle: {
      color: colors.text,
      fontSize: 15,
      fontWeight: '700',
    },
    cardMessage: {
      color: colors.textMuted,
      lineHeight: 19,
    },
    viewBtn: {
      alignSelf: 'flex-start',
      marginTop: 4,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 11,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    viewBtnText: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 12,
    },
  });
