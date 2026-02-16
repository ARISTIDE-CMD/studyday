import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { TabSwipeShell } from '@/components/ui/tab-swipe-shell';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import { fetchAnnouncements } from '@/lib/student-api';
import type { Announcement } from '@/types/supabase';

export default function AnnouncementsScreen() {
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [refreshing, setRefreshing] = useState(false);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const hasHydratedRef = useRef(false);

  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const loadAnnouncements = useCallback(async () => {
    const shouldShowBlockingLoader = !hasHydratedRef.current;
    try {
      if (shouldShowBlockingLoader) {
        setLoading(true);
      }
      setError('');
      const data = await fetchAnnouncements();
      setAnnouncements(data);
    } catch (err) {
      const message = getErrorMessage(err, t('announcements.loadError'));
      setError(message);
    } finally {
      if (shouldShowBlockingLoader) {
        setLoading(false);
      }
      hasHydratedRef.current = true;
    }
  }, [t]);

  useFocusEffect(
    useCallback(() => {
      void loadAnnouncements();
    }, [loadAnnouncements])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await loadAnnouncements();
    } finally {
      setRefreshing(false);
    }
  }, [loadAnnouncements]);

  const effectiveState = loading ? 'loading' : error ? 'error' : announcements.length === 0 ? 'empty' : 'auto';

  return (
    <TabSwipeShell tab="announcements">
    <View style={styles.page}>
      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('announcements.title')}</Text>
          <Ionicons name="notifications-outline" size={22} color={colors.text} />
        </View>

        {effectiveState === 'loading' ? (
          <View style={styles.stackGap}>
            {[1, 2, 3].map((placeholder) => (
              <View key={placeholder} style={styles.skeletonCard} />
            ))}
          </View>
        ) : null}

        {effectiveState === 'empty' ? (
          <StateBlock
            variant="empty"
            title={t('announcements.emptyTitle')}
            description={t('announcements.emptyDescription')}
          />
        ) : null}

        {effectiveState === 'error' ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error || t('announcements.loadError')}
            actionLabel={t('common.retry')}
            onActionPress={() => void loadAnnouncements()}
          />
        ) : null}

        {effectiveState === 'auto' ? (
          <View style={styles.stackGap}>
            {announcements.map((announcement) => (
              <TouchableOpacity
                key={announcement.id}
                style={styles.card}
                onPress={() => router.push(`/announcement/${announcement.id}`)}>
                <View style={styles.cardHeader}>
                  <Text style={styles.cardTitle}>{announcement.title}</Text>
                  {announcement.is_important ? (
                    <View style={styles.importantBadge}>
                      <Text style={styles.importantText}>{t('common.important')}</Text>
                    </View>
                  ) : null}
                </View>

                <Text style={styles.date}>{formatDateLabel(announcement.created_at, locale, t('common.noDate'))}</Text>
                <Text style={styles.excerpt} numberOfLines={3}>{announcement.content}</Text>
                <View style={styles.readRow}>
                  <Text style={styles.readText}>{t('common.details')}</Text>
                  <Ionicons name="chevron-forward" size={16} color={colors.primary} />
                </View>
              </TouchableOpacity>
            ))}
          </View>
        ) : null}
      </ScrollView>
    </View>
    </TabSwipeShell>
  );
}

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  cardShadow: ReturnType<typeof useAppTheme>['cardShadow']
) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: 56,
      paddingHorizontal: 16,
      paddingBottom: 110,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
    },
    stackGap: {
      gap: 10,
    },
    skeletonCard: {
      height: 128,
      borderRadius: 14,
      backgroundColor: colors.border,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      ...cardShadow,
    },
    cardHeader: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      justifyContent: 'space-between',
      gap: 8,
      marginBottom: 8,
    },
    cardTitle: {
      flex: 1,
      color: colors.text,
      fontWeight: '800',
      fontSize: 16,
    },
    importantBadge: {
      backgroundColor: colors.warningSoft,
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 4,
    },
    importantText: {
      color: colors.warning,
      fontWeight: '700',
      fontSize: 11,
    },
    date: {
      color: colors.textMuted,
      marginBottom: 8,
    },
    excerpt: {
      color: colors.textMuted,
      lineHeight: 20,
      marginBottom: 10,
    },
    readRow: {
      flexDirection: 'row',
      alignItems: 'center',
      alignSelf: 'flex-start',
      gap: 4,
    },
    readText: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
