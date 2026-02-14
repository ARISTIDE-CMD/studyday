import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { fetchDashboardSummary } from '@/lib/student-api';
import { formatDateLabel, humanNow } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import type { Announcement, Task } from '@/types/supabase';

export default function HomeDashboardScreen() {
  const { user, profile } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todoCount, setTodoCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [nextTasks, setNextTasks] = useState<Task[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [avatarImageError, setAvatarImageError] = useState(false);

  const displayName = useMemo(() => {
    const fromProfile = profile?.full_name?.trim();
    if (fromProfile) return fromProfile;

    const metadataName =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    if (metadataName) return metadataName;

    const emailName = user?.email?.split('@')[0]?.trim();
    if (emailName) {
      return emailName
        .split(/[._-]+/)
        .filter(Boolean)
        .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
        .join(' ');
    }

    return t('home.fallbackName');
  }, [profile?.full_name, t, user?.email, user?.user_metadata?.full_name]);

  const avatarUrl = useMemo(() => {
    return (
      profile?.avatar_url?.trim()
      || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '')
    );
  }, [profile?.avatar_url, user?.user_metadata?.avatar_url]);

  const initials = useMemo(() => {
    const value = displayName
      .split(' ')
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join('');
    return value || 'E';
  }, [displayName]);
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);
  const priorityStyle = useMemo(
    () => ({
      high: { bg: colors.dangerSoft, color: colors.danger, label: t('priority.high') },
      medium: { bg: colors.warningSoft, color: colors.warning, label: t('priority.medium') },
      low: { bg: colors.successSoft, color: colors.success, label: t('priority.low') },
    }),
    [colors.danger, colors.dangerSoft, colors.success, colors.successSoft, colors.warning, colors.warningSoft, t]
  );

  useEffect(() => {
    setAvatarImageError(false);
  }, [avatarUrl]);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError('');

      const summary = await fetchDashboardSummary(user.id);
      setTodoCount(summary.todoCount);
      setOverdueCount(summary.overdueCount);
      setNextTasks(summary.tasks.filter((task) => task.status !== 'done').slice(0, 3));
      setLatestAnnouncement(summary.latestAnnouncement);
    } catch (err) {
      const message = getErrorMessage(err, t('home.dashboardLoadError'));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.greeting}>{t('home.greeting', { name: displayName })}</Text>
            <Text style={styles.subtitle}>{t('home.subtitle')}</Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/profile')}>
              <View style={styles.avatarOuter}>
                <View style={styles.avatarInner}>
                  {avatarUrl && !avatarImageError ? (
                    <Image
                      source={avatarUrl}
                      style={styles.avatarImage}
                      contentFit="cover"
                      onError={() => setAvatarImageError(true)}
                    />
                  ) : (
                    <Text style={styles.avatarFallback}>{initials}</Text>
                  )}
                </View>
              </View>
            </TouchableOpacity>

            <TouchableOpacity style={styles.notificationButton}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {latestAnnouncement?.is_important ? <View style={styles.notificationDot} /> : null}
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.dayCard}>
          <Text style={styles.dayLabel}>{t('home.daySummary')}</Text>
          <Text style={styles.dayDate}>{humanNow(locale)}</Text>
          <View style={styles.statsRow}>
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{todoCount}</Text>
              <Text style={styles.statText}>{t('home.todo')}</Text>
            </View>
            <View style={styles.statDivider} />
            <View style={styles.statCell}>
              <Text style={styles.statValue}>{overdueCount}</Text>
              <Text style={styles.statText}>{t('home.overdue')}</Text>
            </View>
          </View>
        </View>

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {error ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error}
            actionLabel={t('common.retry')}
            onActionPress={() => void loadData()}
          />
        ) : null}

        {!loading && !error ? (
          <>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.nextTasks')}</Text>
              <TouchableOpacity onPress={() => router.push('/tasks')}>
                <Text style={styles.sectionLink}>{t('home.seeAll')}</Text>
              </TouchableOpacity>
            </View>

            {nextTasks.length === 0 ? (
              <StateBlock
                variant="empty"
                title={t('home.noTaskTitle')}
                description={t('home.noTaskDescription')}
                actionLabel={t('common.add')}
                onActionPress={() => router.push('/task-editor')}
              />
            ) : (
              nextTasks.map((task) => {
                const tone = priorityStyle[task.priority];
                return (
                  <View key={task.id} style={styles.taskCard}>
                    <View style={styles.taskMain}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskMeta}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
                    </View>
                    <View style={[styles.priorityBadge, { backgroundColor: tone.bg }]}>
                      <Text style={[styles.priorityText, { color: tone.color }]}>{tone.label}</Text>
                    </View>
                  </View>
                );
              })
            )}

            <Text style={[styles.sectionTitle, styles.announcementTitle]}>{t('home.latestAnnouncement')}</Text>

            {latestAnnouncement ? (
              <View style={styles.announcementCard}>
                <View style={styles.announcementRow}>
                  <Text style={styles.announcementCardTitle}>{latestAnnouncement.title}</Text>
                  {latestAnnouncement.is_important ? (
                    <View style={styles.importantBadge}>
                      <Text style={styles.importantText}>{t('common.important')}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.announcementExcerpt} numberOfLines={3}>{latestAnnouncement.content}</Text>
                <TouchableOpacity
                  style={styles.readButton}
                  onPress={() => router.push(`/announcement/${latestAnnouncement.id}`)}>
                  <Text style={styles.readButtonText}>{t('home.readAnnouncement')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <StateBlock
                variant="empty"
                title={t('home.noAnnouncementTitle')}
                description={t('home.noAnnouncementDescription')}
              />
            )}
          </>
        ) : null}
      </ScrollView>

      <TouchableOpacity style={styles.fab} onPress={() => router.push('/task-editor')}>
        <Ionicons name="add" size={24} color="#FFFFFF" />
      </TouchableOpacity>
    </View>
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
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 120,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: '800',
    color: colors.text,
  },
  subtitle: {
    marginTop: 4,
    color: colors.textMuted,
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  avatarButton: {
    width: 46,
    height: 46,
    borderRadius: 23,
  },
  avatarOuter: {
    width: '100%',
    height: '100%',
    borderRadius: 23,
    backgroundColor: colors.primarySoft,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 2,
    shadowColor: '#1E293B',
    shadowOffset: { width: 0, height: 7 },
    shadowOpacity: 0.15,
    shadowRadius: 10,
    elevation: 4,
  },
  avatarInner: {
    flex: 1,
    borderRadius: 20,
    overflow: 'hidden',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  avatarFallback: {
    color: colors.primary,
    fontSize: 14,
    fontWeight: '800',
  },
  notificationButton: {
    width: 44,
    height: 44,
    borderRadius: 14,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
  },
  notificationDot: {
    position: 'absolute',
    right: 10,
    top: 10,
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.danger,
  },
  dayCard: {
    backgroundColor: colors.primary,
    borderRadius: 18,
    padding: 18,
    marginBottom: 4,
    ...cardShadow,
  },
  dayLabel: {
    color: '#DCE3FF',
    marginBottom: 4,
  },
  dayDate: {
    color: '#FFFFFF',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 16,
    textTransform: 'capitalize',
  },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statCell: {
    flex: 1,
  },
  statValue: {
    color: '#FFFFFF',
    fontSize: 22,
    fontWeight: '800',
  },
  statText: {
    color: '#DCE3FF',
    marginTop: 2,
  },
  statDivider: {
    width: 1,
    backgroundColor: 'rgba(255,255,255,0.35)',
    height: 38,
    marginHorizontal: 12,
  },
  loaderWrap: {
    paddingVertical: 8,
    alignItems: 'center',
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
    marginBottom: 2,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: colors.text,
  },
  sectionLink: {
    color: colors.primary,
    fontWeight: '600',
  },
  taskCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  taskMain: {
    flex: 1,
    marginRight: 10,
  },
  taskTitle: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: 4,
  },
  taskMeta: {
    color: colors.textMuted,
    fontSize: 12,
  },
  priorityBadge: {
    borderRadius: 999,
    paddingHorizontal: 10,
    paddingVertical: 5,
  },
  priorityText: {
    fontSize: 11,
    fontWeight: '700',
  },
  announcementTitle: {
    marginTop: 8,
    marginBottom: 2,
  },
  announcementCard: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 16,
    ...cardShadow,
  },
  announcementRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
    gap: 8,
  },
  announcementCardTitle: {
    flex: 1,
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  importantBadge: {
    backgroundColor: colors.warningSoft,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 4,
  },
  importantText: {
    color: colors.warning,
    fontSize: 11,
    fontWeight: '700',
  },
  announcementExcerpt: {
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: 14,
  },
  readButton: {
    alignSelf: 'flex-start',
    backgroundColor: colors.primary,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
  },
  readButtonText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  fab: {
    position: 'absolute',
    right: 18,
    bottom: 88,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
    ...cardShadow,
  },
});
