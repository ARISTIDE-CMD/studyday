import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Modal, Pressable, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { ResourceFileIcon } from '@/components/ui/resource-file-icon';
import { StateBlock } from '@/components/ui/state-block';
import { TabSwipeShell } from '@/components/ui/tab-swipe-shell';
import { SyncStatusBanner } from '@/components/ui/sync-status-banner';
import { useConnectivity } from '@/hooks/use-connectivity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { loadAppFlags, saveAppFlags } from '@/lib/app-flags';
import { getErrorMessage } from '@/lib/errors';
import { fetchDashboardSummary, getCachedDashboardSummary } from '@/lib/student-api';
import { formatDateLabel, humanNow } from '@/lib/format';
import { getUserPreferences, toggleFavoriteResource, toggleFavoriteTask } from '@/lib/user-preferences';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';
import type { Announcement, Resource, Task } from '@/types/supabase';

export default function HomeDashboardScreen() {
  const { user, profile } = useAuth();
  const { unreadActivityCount } = useInAppNotification();
  const isOnline = useConnectivity();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [todoCount, setTodoCount] = useState(0);
  const [overdueCount, setOverdueCount] = useState(0);
  const [tasksCount, setTasksCount] = useState(0);
  const [resourcesCount, setResourcesCount] = useState(0);
  const [nextTasks, setNextTasks] = useState<Task[]>([]);
  const [latestResources, setLatestResources] = useState<Resource[]>([]);
  const [latestAnnouncement, setLatestAnnouncement] = useState<Announcement | null>(null);
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<string[]>([]);
  const [favoriteResourceIds, setFavoriteResourceIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [tourVisible, setTourVisible] = useState(false);
  const [avatarImageError, setAvatarImageError] = useState(false);
  const [fabMenuOpen, setFabMenuOpen] = useState(false);
  const [fabMenuVisible, setFabMenuVisible] = useState(false);
  const avatarPulse = useRef(new Animated.Value(0)).current;
  const dayCardBreath = useRef(new Animated.Value(0)).current;
  const fabFloat = useRef(new Animated.Value(0)).current;
  const fabMenuProgress = useRef(new Animated.Value(0)).current;
  const fabPressBump = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    const avatarLoop = Animated.loop(
      Animated.timing(avatarPulse, {
        toValue: 1,
        duration: 2200,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      })
    );
    avatarLoop.start();

    return () => {
      avatarLoop.stop();
      avatarPulse.stopAnimation();
    };
  }, [avatarPulse]);

  useEffect(() => {
    const cardLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(dayCardBreath, {
          toValue: 1,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(dayCardBreath, {
          toValue: 0,
          duration: 3200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    cardLoop.start();

    return () => {
      cardLoop.stop();
      dayCardBreath.stopAnimation();
    };
  }, [dayCardBreath]);

  useEffect(() => {
    const fabLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(fabFloat, {
          toValue: 1,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
        Animated.timing(fabFloat, {
          toValue: 0,
          duration: 2200,
          easing: Easing.inOut(Easing.sin),
          useNativeDriver: true,
        }),
      ])
    );
    fabLoop.start();

    return () => {
      fabLoop.stop();
      fabFloat.stopAnimation();
    };
  }, [fabFloat]);

  useEffect(() => {
    if (fabMenuOpen) {
      setFabMenuVisible(true);
      Animated.spring(fabMenuProgress, {
        toValue: 1,
        damping: 14,
        stiffness: 180,
        mass: 0.9,
        useNativeDriver: true,
      }).start();
      return;
    }

    Animated.timing(fabMenuProgress, {
      toValue: 0,
      duration: 190,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) setFabMenuVisible(false);
    });
  }, [fabMenuOpen, fabMenuProgress]);

  const applySummary = useCallback((summary: Awaited<ReturnType<typeof fetchDashboardSummary>>) => {
    setTodoCount(summary.todoCount);
    setOverdueCount(summary.overdueCount);
    setTasksCount(summary.totalTasks);
    setResourcesCount(summary.totalResources);
    setNextTasks(summary.tasks.filter((task) => task.status !== 'done').slice(0, 3));
    setLatestResources(summary.latestResources);
    setLatestAnnouncement(summary.latestAnnouncement);
  }, []);

  const loadData = useCallback(async () => {
    if (!user?.id) return;

    let hasCachedData = false;

    try {
      setLoading(true);
      setError('');

      const cached = await getCachedDashboardSummary(user.id);
      hasCachedData = cached.tasks.length > 0 || cached.latestResources.length > 0 || cached.latestAnnouncement !== null;
      if (hasCachedData) {
        applySummary(cached);
        setLoading(false);
      }

      const summary = await fetchDashboardSummary(user.id);
      applySummary(summary);
    } catch (err) {
      if (!hasCachedData) {
        const message = getErrorMessage(err, t('home.dashboardLoadError'));
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [applySummary, t, user?.id]);

  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    const preferences = await getUserPreferences(user.id);
    setFavoriteTaskIds(preferences.favoriteTaskIds);
    setFavoriteResourceIds(preferences.favoriteResourceIds);
  }, [user?.id]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadData(), loadPreferences()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadData, loadPreferences]);

  useFocusEffect(
    useCallback(() => {
      void loadData();
      void loadPreferences();
    }, [loadData, loadPreferences])
  );

  useEffect(() => {
    let active = true;

    const run = async () => {
      const flags = await loadAppFlags();
      if (active && !flags.homeTourSeen) {
        setTourVisible(true);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, []);

  const closeTour = async () => {
    setTourVisible(false);
    await saveAppFlags({ homeTourSeen: true });
  };

  const avatarPulseStyle = useMemo(
    () => ({
      opacity: avatarPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.35, 0],
      }),
      transform: [
        {
          scale: avatarPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.23],
          }),
        },
      ],
    }),
    [avatarPulse]
  );

  const dayCardAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: dayCardBreath.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -2],
          }),
        },
        {
          scale: dayCardBreath.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.008],
          }),
        },
      ],
    }),
    [dayCardBreath]
  );

  const fabAnimatedStyle = useMemo(
    () => ({
      transform: [
        {
          translateY: fabFloat.interpolate({
            inputRange: [0, 1],
            outputRange: [0, -3],
          }),
        },
      ],
    }),
    [fabFloat]
  );

  const fabToggleStyle = useMemo(
    () => ({
      transform: [
        {
          scale: fabPressBump.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 0.92],
          }),
        },
      ],
    }),
    [fabPressBump]
  );

  const fabIconStyle = useMemo(
    () => ({
      transform: [
        {
          rotate: fabMenuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: ['0deg', '45deg'],
          }),
        },
      ],
    }),
    [fabMenuProgress]
  );

  const fabBackdropStyle = useMemo(
    () => ({
      opacity: fabMenuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 0.2],
      }),
    }),
    [fabMenuProgress]
  );

  const fabMenuContainerStyle = useMemo(
    () => ({
      opacity: fabMenuProgress.interpolate({
        inputRange: [0, 1],
        outputRange: [0, 1],
      }),
      transform: [
        {
          translateY: fabMenuProgress.interpolate({
            inputRange: [0, 1],
            outputRange: [14, 0],
          }),
        },
      ],
    }),
    [fabMenuProgress]
  );

  const firstMenuItemStyle = useMemo(
    () => ({
      opacity: fabMenuProgress.interpolate({
        inputRange: [0, 0.55, 1],
        outputRange: [0, 0, 1],
      }),
      transform: [
        {
          translateY: fabMenuProgress.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [12, 8, 0],
          }),
        },
        {
          scale: fabMenuProgress.interpolate({
            inputRange: [0, 0.55, 1],
            outputRange: [0.96, 0.96, 1],
          }),
        },
      ],
    }),
    [fabMenuProgress]
  );

  const secondMenuItemStyle = useMemo(
    () => ({
      opacity: fabMenuProgress.interpolate({
        inputRange: [0, 0.35, 0.88, 1],
        outputRange: [0, 0, 0.82, 1],
      }),
      transform: [
        {
          translateY: fabMenuProgress.interpolate({
            inputRange: [0, 0.35, 1],
            outputRange: [18, 10, 0],
          }),
        },
        {
          scale: fabMenuProgress.interpolate({
            inputRange: [0, 0.35, 1],
            outputRange: [0.94, 0.96, 1],
          }),
        },
      ],
    }),
    [fabMenuProgress]
  );

  const toggleFabMenu = () => {
    Animated.sequence([
      Animated.timing(fabPressBump, {
        toValue: 1,
        duration: 90,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
      Animated.timing(fabPressBump, {
        toValue: 0,
        duration: 110,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }),
    ]).start();
    setFabMenuOpen((prev) => !prev);
  };

  const onToggleFavoriteTask = async (taskId: string) => {
    if (!user?.id) return;
    const previous = favoriteTaskIds;
    const next = previous.includes(taskId) ? previous.filter((id) => id !== taskId) : [taskId, ...previous];
    setFavoriteTaskIds(next);
    try {
      const updated = await toggleFavoriteTask(user.id, taskId);
      setFavoriteTaskIds(updated.favoriteTaskIds);
    } catch {
      setFavoriteTaskIds(previous);
    }
  };

  const onToggleFavoriteResource = async (resourceId: string) => {
    if (!user?.id) return;
    const previous = favoriteResourceIds;
    const next = previous.includes(resourceId)
      ? previous.filter((id) => id !== resourceId)
      : [resourceId, ...previous];
    setFavoriteResourceIds(next);
    try {
      const updated = await toggleFavoriteResource(user.id, resourceId);
      setFavoriteResourceIds(updated.favoriteResourceIds);
    } catch {
      setFavoriteResourceIds(previous);
    }
  };

  const prioritizedTasks = useMemo(() => {
    if (nextTasks.length <= 1) return nextTasks;
    return [...nextTasks].sort((a, b) => {
      const aFav = favoriteTaskIds.includes(a.id) ? 0 : 1;
      const bFav = favoriteTaskIds.includes(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return (a.due_date ?? '9999-12-31').localeCompare(b.due_date ?? '9999-12-31');
    });
  }, [favoriteTaskIds, nextTasks]);

  const prioritizedResources = useMemo(() => {
    if (latestResources.length <= 1) return latestResources;
    return [...latestResources].sort((a, b) => {
      const aFav = favoriteResourceIds.includes(a.id) ? 0 : 1;
      const bFav = favoriteResourceIds.includes(b.id) ? 0 : 1;
      if (aFav !== bFav) return aFav - bFav;
      return (b.created_at ?? '').localeCompare(a.created_at ?? '');
    });
  }, [favoriteResourceIds, latestResources]);

  return (
    <TabSwipeShell tab="home">
    <View style={styles.page}>
      <View style={styles.stickyHeader}>
        <View style={styles.headerRow}>
          <View style={styles.greetingWrap}>
            <Text style={styles.greeting} numberOfLines={1} ellipsizeMode="tail">
              {t('home.greeting', { name: displayName })}
            </Text>
            <Text style={styles.subtitle} numberOfLines={1} ellipsizeMode="tail">
              {t('home.subtitle')}
            </Text>
          </View>

          <View style={styles.headerActions}>
            <TouchableOpacity style={styles.avatarButton} onPress={() => router.push('/profile')}>
              <Animated.View
                pointerEvents="none"
                style={[
                  styles.avatarPulseRing,
                  avatarPulseStyle,
                  { borderColor: isOnline ? colors.success : colors.danger },
                ]}
              />
              <View
                style={[
                  styles.avatarOuter,
                  { borderColor: isOnline ? colors.success : colors.danger },
                ]}>
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
              <View
                style={[
                  styles.avatarStatusDot,
                  {
                    backgroundColor: isOnline ? colors.success : colors.danger,
                    borderColor: colors.surface,
                  },
                ]}
              />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => router.push('/search')}>
              <Ionicons name="search-outline" size={20} color={colors.text} />
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.notificationButton}
              onPress={() => router.push('/notifications-center')}>
              <Ionicons name="notifications-outline" size={22} color={colors.text} />
              {unreadActivityCount > 0 ? <View style={styles.notificationDot} /> : null}
            </TouchableOpacity>
          </View>
        </View>
      </View>

      <ScrollView
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}>
        <SyncStatusBanner />

        <Animated.View style={[styles.dayCard, dayCardAnimatedStyle]}>
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
        </Animated.View>

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
          <View style={styles.feedStack}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>{t('home.nextTasks')}</Text>
              <View style={styles.sectionLinksRow}>
                <TouchableOpacity onPress={() => router.push('/tasks')}>
                  <Text style={styles.sectionLink}>{`${t('home.seeAll')} (${tasksCount})`}</Text>
                </TouchableOpacity>
              </View>
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
              prioritizedTasks.map((task) => {
                const tone = priorityStyle[task.priority];
                const favorite = favoriteTaskIds.includes(task.id);
                return (
                  <TouchableOpacity key={task.id} style={styles.taskCard} onPress={() => router.push(`/task/${task.id}`)}>
                    <View style={styles.taskMain}>
                      <Text style={styles.taskTitle}>{task.title}</Text>
                      <Text style={styles.taskMeta}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
                    </View>
                    <View style={styles.taskTail}>
                      <TouchableOpacity
                        style={styles.favoriteIconBtn}
                        onPress={(event) => {
                          event.stopPropagation();
                          void onToggleFavoriteTask(task.id);
                        }}>
                        <Ionicons
                          name={favorite ? 'star' : 'star-outline'}
                          size={16}
                          color={favorite ? colors.warning : colors.textMuted}
                        />
                      </TouchableOpacity>
                      <View style={[styles.priorityBadge, { backgroundColor: tone.bg }]}>
                        <Text style={[styles.priorityText, { color: tone.color }]}>{tone.label}</Text>
                      </View>
                      <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                    </View>
                  </TouchableOpacity>
                );
              })
            )}

            <View style={[styles.sectionHeader, styles.resourcesHeader]}>
              <Text style={[styles.sectionTitle, styles.resourcesTitle]}>{t('home.latestResources')}</Text>
              <TouchableOpacity onPress={() => router.push('/resources')}>
                <Text style={styles.sectionLink}>{`${t('home.seeResources')} (${resourcesCount})`}</Text>
              </TouchableOpacity>
            </View>
            {latestResources.length === 0 ? (
              <StateBlock
                variant="empty"
                title={t('home.noResourceTitle')}
                description={t('home.noResourceDescription')}
                actionLabel={t('home.seeResources')}
                onActionPress={() => router.push('/resources')}
              />
            ) : (
              prioritizedResources.map((resource) => {
                const favorite = favoriteResourceIds.includes(resource.id);
                return (
                  <TouchableOpacity
                    key={resource.id}
                    style={styles.resourceCard}
                    onPress={() => router.push(`/resource/${resource.id}`)}>
                    <ResourceFileIcon resource={resource} size={34} style={styles.resourceIconWrap} />
                    <View style={styles.resourceMain}>
                      <Text style={styles.resourceTitle}>{resource.title}</Text>
                      <Text style={styles.resourceMeta}>{formatDateLabel(resource.created_at, locale, t('common.noDate'))}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.favoriteIconBtn}
                      onPress={(event) => {
                        event.stopPropagation();
                        void onToggleFavoriteResource(resource.id);
                      }}>
                      <Ionicons
                        name={favorite ? 'star' : 'star-outline'}
                        size={16}
                        color={favorite ? colors.warning : colors.textMuted}
                      />
                    </TouchableOpacity>
                    <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
                  </TouchableOpacity>
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
          </View>
        ) : null}
      </ScrollView>

      {fabMenuVisible ? (
        <Animated.View style={[styles.fabBackdrop, fabBackdropStyle]} pointerEvents={fabMenuOpen ? 'auto' : 'none'}>
          <Pressable style={styles.backdropTap} onPress={() => setFabMenuOpen(false)} />
        </Animated.View>
      ) : null}

      {fabMenuVisible ? (
        <Animated.View
          style={[styles.fabMenu, fabMenuContainerStyle]}
          pointerEvents={fabMenuOpen ? 'auto' : 'none'}>
          <Animated.View style={firstMenuItemStyle}>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setFabMenuOpen(false);
                router.push('/task-editor');
              }}>
              <Ionicons name="checkmark-circle-outline" size={16} color={colors.text} />
              <Text style={styles.fabMenuText}>{t('home.quickAddTask')}</Text>
            </TouchableOpacity>
          </Animated.View>

          <Animated.View style={secondMenuItemStyle}>
            <TouchableOpacity
              style={styles.fabMenuItem}
              onPress={() => {
                setFabMenuOpen(false);
                router.push('/resource-editor');
              }}>
              <Ionicons name="folder-open-outline" size={16} color={colors.text} />
              <Text style={styles.fabMenuText}>{t('home.quickAddResource')}</Text>
            </TouchableOpacity>
          </Animated.View>
        </Animated.View>
      ) : null}

      <Animated.View style={[styles.fab, fabAnimatedStyle, fabToggleStyle]}>
        <TouchableOpacity style={styles.fabTap} onPress={toggleFabMenu}>
          <Animated.View style={fabIconStyle}>
            <Ionicons name="add" size={24} color="#FFFFFF" />
          </Animated.View>
        </TouchableOpacity>
      </Animated.View>

      <Modal visible={tourVisible} transparent animationType="fade" onRequestClose={() => void closeTour()}>
        <Pressable style={styles.tourOverlay} onPress={() => void closeTour()}>
          <Pressable style={styles.tourCard} onPress={(event) => event.stopPropagation()}>
            <Text style={styles.tourTitle}>{t('home.tourTitle')}</Text>
            <View style={styles.tourList}>
              <View style={styles.tourItemRow}>
                <Ionicons name="add-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.tourText}>{t('home.tourItemOne')}</Text>
              </View>
              <View style={styles.tourItemRow}>
                <Ionicons name="swap-horizontal-outline" size={16} color={colors.primary} />
                <Text style={styles.tourText}>{t('home.tourItemTwo')}</Text>
              </View>
              <View style={styles.tourItemRow}>
                <Ionicons name="notifications-outline" size={16} color={colors.primary} />
                <Text style={styles.tourText}>{t('home.tourItemThree')}</Text>
              </View>
            </View>
            <TouchableOpacity style={styles.tourBtn} onPress={() => void closeTour()}>
              <Text style={styles.tourBtnText}>{t('home.tourButton')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
  stickyHeader: {
    paddingHorizontal: 16,
    paddingTop: 56,
    paddingBottom: 10,
    backgroundColor: colors.background,
    zIndex: 10,
  },
  content: {
    paddingHorizontal: 16,
    paddingTop: 6,
    paddingBottom: 120,
    gap: 10,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  greetingWrap: {
    flex: 1,
    minWidth: 0,
    marginRight: 10,
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
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  avatarPulseRing: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderRadius: 23,
    borderWidth: 2,
    borderColor: colors.primary,
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
  avatarStatusDot: {
    position: 'absolute',
    right: -1,
    bottom: -1,
    width: 12,
    height: 12,
    borderRadius: 6,
    borderWidth: 2,
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
  feedStack: {
    gap: 10,
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
  sectionLinksRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
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
  taskTail: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  favoriteIconBtn: {
    width: 28,
    height: 28,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
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
  resourcesTitle: {
    marginTop: 0,
    marginBottom: 0,
  },
  resourcesHeader: {
    marginTop: 8,
    marginBottom: 2,
  },
  resourceCard: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  resourceIconWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resourceMain: {
    flex: 1,
  },
  resourceTitle: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 3,
  },
  resourceMeta: {
    color: colors.textMuted,
    fontSize: 12,
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
    bottom: 104,
    width: 56,
    height: 56,
    borderRadius: 16,
    backgroundColor: colors.primary,
    overflow: 'hidden',
    ...cardShadow,
  },
  fabTap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fabBackdrop: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#0F172A',
  },
  backdropTap: {
    ...StyleSheet.absoluteFillObject,
  },
  fabMenu: {
    position: 'absolute',
    right: 18,
    bottom: 168,
    gap: 8,
    alignItems: 'flex-end',
  },
  fabMenuItem: {
    minHeight: 40,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    ...cardShadow,
  },
  fabMenuText: {
    color: colors.text,
    fontWeight: '700',
  },
  tourOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  tourCard: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  tourTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '800',
    marginBottom: 10,
  },
  tourList: {
    gap: 10,
    marginBottom: 14,
  },
  tourItemRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  tourText: {
    flex: 1,
    color: colors.textMuted,
    lineHeight: 18,
  },
  tourBtn: {
    borderRadius: 12,
    backgroundColor: colors.primary,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tourBtnText: {
    color: '#FFFFFF',
    fontWeight: '800',
  },
});
