import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { TabSwipeShell } from '@/components/ui/tab-swipe-shell';
import { useConnectivity } from '@/hooks/use-connectivity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { getFocusStats } from '@/lib/focus-stats';
import { formatDateLabel } from '@/lib/format';
import type { ThemeMode } from '@/lib/settings-storage';
import { fetchTaskStats, fetchTasks, getCachedTaskStats, getCachedTasks } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import { useOfflineSyncStatus } from '@/providers/offline-sync-provider';
import { useSettings } from '@/providers/settings-provider';

function ActivityRing({
  size,
  progress,
  colors,
  centerValue,
  centerLabel,
}: {
  size: number;
  progress: number;
  colors: ReturnType<typeof useAppTheme>['colors'];
  centerValue: string;
  centerLabel: string;
}) {
  const segments = 72;
  const safeProgress = Math.max(0, Math.min(1, progress));
  const activeCount = Math.round(segments * safeProgress);
  const dotSize = 6;
  const ringPadding = 12;
  const radius = size / 2 - ringPadding;
  const center = size / 2;

  return (
    <View style={{ width: size, height: size }}>
      {Array.from({ length: segments }).map((_value, index) => {
        const angle = (index / segments) * Math.PI * 2 - Math.PI / 2;
        const x = center + radius * Math.cos(angle) - dotSize / 2;
        const y = center + radius * Math.sin(angle) - dotSize / 2;
        const active = index < activeCount;

        return (
          <View
            key={`dot-${index}`}
            style={{
              position: 'absolute',
              left: x,
              top: y,
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: active ? colors.primary : colors.border,
              opacity: active ? 1 : 0.7,
            }}
          />
        );
      })}

      <View
        style={{
          position: 'absolute',
          left: '50%',
          top: '50%',
          width: size * 0.56,
          height: size * 0.56,
          marginLeft: -(size * 0.56) / 2,
          marginTop: -(size * 0.56) / 2,
          borderRadius: (size * 0.56) / 2,
          borderWidth: 1,
          borderColor: colors.border,
          backgroundColor: colors.surface,
          alignItems: 'center',
          justifyContent: 'center',
        }}>
        <Text style={{ color: colors.primary, fontWeight: '800', fontSize: 28 }}>{centerValue}</Text>
        <Text style={{ color: colors.textMuted, fontSize: 11, marginTop: 2 }}>{centerLabel}</Text>
      </View>
    </View>
  );
}

function toIsoDateOnly(value: Date): string {
  return value.toISOString().slice(0, 10);
}

function computeStreakDays(doneDateIsoSet: Set<string>): number {
  let streak = 0;
  const cursor = new Date();

  while (true) {
    const dayKey = toIsoDateOnly(cursor);
    if (!doneDateIsoSet.has(dayKey)) break;
    streak += 1;
    cursor.setDate(cursor.getDate() - 1);
  }

  return streak;
}

function SettingChip({
  label,
  active,
  onPress,
  colors,
}: {
  label: string;
  active: boolean;
  onPress: () => void;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  return (
    <TouchableOpacity
      style={[
        styles.settingChip,
        {
          borderColor: active ? colors.primary : colors.border,
          backgroundColor: active ? colors.primarySoft : colors.surface,
        },
      ]}
      onPress={onPress}>
      <Text style={[styles.settingChipText, { color: active ? colors.primary : colors.textMuted }]}>{label}</Text>
    </TouchableOpacity>
  );
}

export default function ProfileScreen() {
  const { user, profile, refreshProfile, signOut } = useAuth();
  const isOnline = useConnectivity();
  const { language, themeMode, syncMode, setLanguage, setThemeMode, setSyncMode, settingsLoading } = useSettings();
  const { isSyncing, triggerSync } = useOfflineSyncStatus();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [totalTasks, setTotalTasks] = useState(0);
  const [doneTasks, setDoneTasks] = useState(0);
  const [weekDoneTasks, setWeekDoneTasks] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [focusWeekSessions, setFocusWeekSessions] = useState(0);
  const [focusTotalSessions, setFocusTotalSessions] = useState(0);
  const [focusStreakDays, setFocusStreakDays] = useState(0);
  const [statsError, setStatsError] = useState('');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const avatarPulse = React.useRef(new Animated.Value(0)).current;
  const registrationDate = profile?.created_at ?? user?.created_at ?? null;
  const avatarUrl = profile?.avatar_url?.trim()
    || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '');
  const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;
  const pendingTasks = Math.max(totalTasks - doneTasks, 0);
  const weeklyGoal = 5;
  const badges = useMemo(
    () =>
      [
        { key: 'first_task', unlocked: doneTasks >= 1, label: t('profile.badgeFirstTask') },
        { key: 'weekly_goal', unlocked: weekDoneTasks >= weeklyGoal, label: t('profile.badgeWeeklyGoal') },
        { key: 'streak7', unlocked: streakDays >= 7, label: t('profile.badgeStreak7') },
        { key: 'focus5', unlocked: focusTotalSessions >= 5, label: t('profile.badgeFocus5') },
        { key: 'focus_streak', unlocked: focusStreakDays >= 3, label: t('profile.badgeFocusStreak') },
      ] as { key: string; unlocked: boolean; label: string }[],
    [doneTasks, focusStreakDays, focusTotalSessions, streakDays, t, weekDoneTasks]
  );

  const themedStyles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  useEffect(() => {
    const loop = Animated.loop(
      Animated.timing(avatarPulse, {
        toValue: 1,
        duration: 2100,
        easing: Easing.inOut(Easing.sin),
        useNativeDriver: true,
      })
    );
    loop.start();
    return () => {
      loop.stop();
      avatarPulse.stopAnimation();
    };
  }, [avatarPulse]);

  const avatarPulseStyle = useMemo(
    () => ({
      opacity: avatarPulse.interpolate({
        inputRange: [0, 1],
        outputRange: [0.4, 0],
      }),
      transform: [
        {
          scale: avatarPulse.interpolate({
            inputRange: [0, 1],
            outputRange: [1, 1.2],
          }),
        },
      ],
    }),
    [avatarPulse]
  );

  const loadStats = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setStatsError('');

      const [cachedStats, cachedTasks] = await Promise.all([
        getCachedTaskStats(user.id),
        getCachedTasks(user.id),
      ]);
      const cachedFocusStats = await getFocusStats(user.id);
      setTotalTasks(cachedStats.total);
      setDoneTasks(cachedStats.done);
      setFocusWeekSessions(cachedFocusStats.weekSessions);
      setFocusTotalSessions(cachedFocusStats.totalSessions);
      setFocusStreakDays(cachedFocusStats.streakDays);

      const weekStart = new Date();
      weekStart.setHours(0, 0, 0, 0);
      weekStart.setDate(weekStart.getDate() - 6);
      const weekStartMs = weekStart.getTime();

      const cachedDoneDates = new Set(
        cachedTasks
          .filter((task) => task.status === 'done' && task.completed_at)
          .map((task) => (task.completed_at as string).slice(0, 10))
      );
      const cachedWeekDone = cachedTasks.filter((task) => {
        if (!task.completed_at) return false;
        const completedAtMs = Date.parse(task.completed_at);
        if (Number.isNaN(completedAtMs)) return false;
        return completedAtMs >= weekStartMs;
      }).length;

      setWeekDoneTasks(cachedWeekDone);
      setStreakDays(computeStreakDays(cachedDoneDates));
      setLoading(false);

      const [stats, remoteTasks] = await Promise.all([
        fetchTaskStats(user.id),
        fetchTasks(user.id),
      ]);
      const remoteFocusStats = await getFocusStats(user.id);
      setTotalTasks(stats.total);
      setDoneTasks(stats.done);
      setFocusWeekSessions(remoteFocusStats.weekSessions);
      setFocusTotalSessions(remoteFocusStats.totalSessions);
      setFocusStreakDays(remoteFocusStats.streakDays);

      const remoteDoneDates = new Set(
        remoteTasks
          .filter((task) => task.status === 'done' && task.completed_at)
          .map((task) => (task.completed_at as string).slice(0, 10))
      );
      const remoteWeekDone = remoteTasks.filter((task) => {
        if (!task.completed_at) return false;
        const completedAtMs = Date.parse(task.completed_at);
        if (Number.isNaN(completedAtMs)) return false;
        return completedAtMs >= weekStartMs;
      }).length;

      setWeekDoneTasks(remoteWeekDone);
      setStreakDays(computeStreakDays(remoteDoneDates));
    } catch (error) {
      setStatsError(getErrorMessage(error, t('profile.statsError')));
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void refreshProfile();
      void loadStats();
    }, [loadStats, refreshProfile])
  );

  const onSignOut = async () => {
    await signOut();
    router.replace('/onboarding');
  };

  const togglePreferences = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setPreferencesOpen((prev) => !prev);
  };

  const toggleSecurity = () => {
    LayoutAnimation.configureNext(LayoutAnimation.Presets.easeInEaseOut);
    setSecurityOpen((prev) => !prev);
  };

  return (
    <TabSwipeShell tab="profile">
    <View style={themedStyles.page}>
      <ScrollView contentContainerStyle={themedStyles.content} showsVerticalScrollIndicator={false}>
        <Text style={themedStyles.title}>{t('profile.title')}</Text>

        <View style={themedStyles.profileCard}>
          <View style={themedStyles.avatarWrap}>
            <Animated.View
              pointerEvents="none"
              style={[
                themedStyles.avatarPulseRing,
                avatarPulseStyle,
                { borderColor: isOnline ? colors.success : colors.danger },
              ]}
            />
            <View
              style={[
                themedStyles.avatar,
                { borderColor: isOnline ? colors.success : colors.danger },
              ]}>
            {avatarUrl ? (
              <Image source={avatarUrl} style={themedStyles.avatarImage} contentFit="cover" cachePolicy="none" />
            ) : (
              <Ionicons name="person" size={26} color={colors.primary} />
            )}
            </View>
            <View
              style={[
                themedStyles.avatarStatusDot,
                { backgroundColor: isOnline ? colors.success : colors.danger, borderColor: colors.surface },
              ]}
            />
          </View>
          <Text style={themedStyles.name}>{profile?.full_name ?? t('profile.fallbackName')}</Text>
          <Text style={themedStyles.email}>{user?.email ?? t('profile.unknownEmail')}</Text>
        </View>

        {loading ? (
          <View style={themedStyles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={themedStyles.activityCard}>
              <Text style={themedStyles.activityTitle}>{t('profile.activityTitle')}</Text>
              <Text style={themedStyles.activitySubtitle}>{t('profile.activitySubtitle')}</Text>

              <View style={themedStyles.activityRingWrap}>
                <ActivityRing
                  size={188}
                  progress={completionRate}
                  colors={colors}
                  centerValue={`${Math.round(completionRate * 100)}%`}
                  centerLabel={t('profile.completionRate')}
                />
              </View>

              <View style={themedStyles.activityLegendRow}>
                <View style={themedStyles.activityLegendItem}>
                  <Text style={themedStyles.activityLegendValue}>{doneTasks}</Text>
                  <Text style={themedStyles.activityLegendLabel}>{t('profile.tasksDone')}</Text>
                </View>
                <View style={themedStyles.activityLegendItem}>
                  <Text style={themedStyles.activityLegendValue}>{pendingTasks}</Text>
                  <Text style={themedStyles.activityLegendLabel}>{t('profile.tasksPending')}</Text>
                </View>
                <View style={themedStyles.activityLegendItem}>
                  <Text style={themedStyles.activityLegendValue}>{totalTasks}</Text>
                  <Text style={themedStyles.activityLegendLabel}>{t('profile.totalTasksLabel')}</Text>
                </View>
              </View>

              <View style={themedStyles.kpiRow}>
                <View style={themedStyles.kpiCard}>
                  <Text style={themedStyles.kpiTitle}>{t('profile.streakTitle')}</Text>
                  <Text style={themedStyles.kpiValue}>{t('profile.streakValue', { count: streakDays })}</Text>
                </View>

                <View style={themedStyles.kpiCard}>
                  <Text style={themedStyles.kpiTitle}>{t('profile.weekGoalTitle')}</Text>
                  <Text style={themedStyles.kpiValue}>{t('profile.weekGoalValue', { done: weekDoneTasks, goal: weeklyGoal })}</Text>
                </View>
              </View>

              <View style={themedStyles.kpiRow}>
                <View style={themedStyles.kpiCard}>
                  <Text style={themedStyles.kpiTitle}>{t('profile.focusWeekTitle')}</Text>
                  <Text style={themedStyles.kpiValue}>{t('profile.focusWeekValue', { count: focusWeekSessions })}</Text>
                </View>

                <View style={themedStyles.kpiCard}>
                  <Text style={themedStyles.kpiTitle}>{t('profile.focusStreakTitle')}</Text>
                  <Text style={themedStyles.kpiValue}>{t('profile.focusStreakValue', { count: focusStreakDays })}</Text>
                </View>
              </View>

              <Text style={themedStyles.badgeSectionTitle}>{t('profile.badgesTitle')}</Text>
              <View style={themedStyles.badgesWrap}>
                {badges.map((badge) => (
                  <View
                    key={badge.key}
                    style={[themedStyles.badgeChip, !badge.unlocked && themedStyles.badgeChipLocked]}>
                    <Ionicons
                      name={badge.unlocked ? 'ribbon' : 'lock-closed-outline'}
                      size={12}
                      color={badge.unlocked ? colors.warning : colors.textMuted}
                    />
                    <Text
                      style={[
                        themedStyles.badgeChipText,
                        !badge.unlocked && themedStyles.badgeChipTextLocked,
                      ]}>
                      {badge.label}
                    </Text>
                  </View>
                ))}
              </View>

              <View style={themedStyles.metaRow}>
                <Text style={themedStyles.metaTitle}>{t('profile.registrationDate')}</Text>
                <Text style={themedStyles.metaValue}>{formatDateLabel(registrationDate, locale, t('common.noDate'))}</Text>
              </View>
            </View>
            {statsError ? <Text style={themedStyles.statsError}>{statsError}</Text> : null}
          </>
        )}

        <TouchableOpacity style={themedStyles.primaryAction} onPress={() => router.push('/profile-editor')}>
          <Text style={themedStyles.primaryActionText}>{t('profile.editProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={themedStyles.secondaryAction} onPress={() => router.push('/focus')}>
          <Text style={themedStyles.secondaryActionText}>{t('profile.focusMode')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={themedStyles.secondaryAction} onPress={() => router.push('/ai-toolbox')}>
          <Text style={themedStyles.secondaryActionText}>{t('profile.aiToolbox')}</Text>
        </TouchableOpacity>

        <View style={themedStyles.accordionCard}>
          <TouchableOpacity style={themedStyles.accordionHeader} onPress={togglePreferences}>
            <View style={themedStyles.accordionHeadMain}>
              <Text style={themedStyles.accordionTitle}>{t('profile.preferences')}</Text>
              <Text style={themedStyles.accordionHint}>{t('profile.preferencesHint')}</Text>
            </View>
            <Ionicons name={preferencesOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {preferencesOpen ? (
            <View style={themedStyles.accordionBody}>
              <Text style={themedStyles.settingsLabel}>{t('profile.language')}</Text>
              <View style={themedStyles.settingRow}>
                <SettingChip label={t('profile.french')} active={language === 'fr'} onPress={() => setLanguage('fr')} colors={colors} />
                <SettingChip label={t('profile.english')} active={language === 'en'} onPress={() => setLanguage('en')} colors={colors} />
              </View>

              <Text style={themedStyles.settingsLabel}>{t('profile.theme')}</Text>
              {settingsLoading ? (
                <ActivityIndicator size="small" color={colors.primary} />
              ) : (
                <View style={themedStyles.settingRow}>
                  {(
                    [
                      { key: 'system', label: t('profile.system') },
                      { key: 'light', label: t('profile.light') },
                      { key: 'dark', label: t('profile.dark') },
                    ] as { key: ThemeMode; label: string }[]
                  ).map((option) => (
                    <SettingChip
                      key={option.key}
                      label={option.label}
                      active={themeMode === option.key}
                      onPress={() => setThemeMode(option.key)}
                      colors={colors}
                    />
                  ))}
                </View>
              )}

              <Text style={themedStyles.settingsLabel}>{t('profile.syncTitle')}</Text>
              <View style={themedStyles.syncRow}>
                <View style={themedStyles.syncTextWrap}>
                  <Text style={themedStyles.syncLabel}>{t('profile.syncAutoLabel')}</Text>
                  <Text style={themedStyles.syncHint}>
                    {syncMode === 'auto' ? t('profile.syncAutoEnabled') : t('profile.syncAutoDisabled')}
                  </Text>
                </View>
                <Switch
                  value={syncMode === 'auto'}
                  onValueChange={(value) => setSyncMode(value ? 'auto' : 'manual')}
                  trackColor={{ false: colors.border, true: colors.primarySoft }}
                  thumbColor={syncMode === 'auto' ? colors.primary : '#FFFFFF'}
                />
              </View>

              {syncMode === 'manual' ? (
                <TouchableOpacity
                  style={[themedStyles.syncNowBtn, isSyncing && themedStyles.syncNowBtnDisabled]}
                  disabled={isSyncing}
                  onPress={() => void triggerSync()}>
                  {isSyncing ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <Text style={themedStyles.syncNowBtnText}>{t('profile.syncNow')}</Text>
                  )}
                </TouchableOpacity>
              ) : null}
            </View>
          ) : null}
        </View>

        <View style={themedStyles.accordionCard}>
          <TouchableOpacity style={themedStyles.accordionHeader} onPress={toggleSecurity}>
            <View style={themedStyles.accordionHeadMain}>
              <Text style={themedStyles.accordionTitle}>{t('profile.security')}</Text>
              <Text style={themedStyles.accordionHint}>{t('profile.securityHint')}</Text>
            </View>
            <Ionicons name={securityOpen ? 'chevron-up' : 'chevron-down'} size={18} color={colors.textMuted} />
          </TouchableOpacity>

          {securityOpen ? (
            <View style={themedStyles.accordionBody}>
              <TouchableOpacity style={themedStyles.dangerAction} onPress={() => void onSignOut()}>
                <Text style={themedStyles.dangerActionText}>{t('profile.signOut')}</Text>
              </TouchableOpacity>

              <View style={themedStyles.privacyCard}>
                <View style={themedStyles.privacyHeader}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                  <Text style={themedStyles.privacyTitle}>{t('profile.privacyTitle')}</Text>
                </View>
                <Text style={themedStyles.privacyText}>{t('profile.privacyDescription')}</Text>
              </View>
            </View>
          ) : null}
        </View>

        <View style={themedStyles.privacyCardCompact}>
          <View style={themedStyles.privacyHeader}>
            <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
            <Text style={themedStyles.privacyTitle}>{t('profile.privacyTitle')}</Text>
          </View>
          <Text style={themedStyles.privacyText}>{t('profile.privacyDescription')}</Text>
        </View>
      </ScrollView>
    </View>
    </TabSwipeShell>
  );
}

const styles = StyleSheet.create({
  settingChip: {
    borderRadius: 999,
    borderWidth: 1,
    paddingHorizontal: 12,
    paddingVertical: 7,
  },
  settingChipText: {
    fontWeight: '600',
    fontSize: 12,
  },
});

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
      paddingBottom: 120,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
      marginBottom: 16,
    },
    profileCard: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 16,
      alignItems: 'center',
      marginBottom: 12,
      ...cardShadow,
    },
    avatar: {
      width: 62,
      height: 62,
      borderRadius: 31,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      justifyContent: 'center',
      alignItems: 'center',
      overflow: 'hidden',
    },
    avatarWrap: {
      width: 62,
      height: 62,
      borderRadius: 31,
      marginBottom: 10,
      alignItems: 'center',
      justifyContent: 'center',
      position: 'relative',
    },
    avatarPulseRing: {
      position: 'absolute',
      width: 62,
      height: 62,
      borderRadius: 31,
      borderWidth: 2,
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
    avatarImage: {
      width: '100%',
      height: '100%',
    },
    name: {
      fontSize: 18,
      fontWeight: '700',
      color: colors.text,
    },
    email: {
      marginTop: 4,
      color: colors.textMuted,
    },
    loadingWrap: {
      paddingVertical: 20,
    },
    activityCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 14,
      ...cardShadow,
    },
    activityTitle: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 17,
      marginBottom: 4,
    },
    activitySubtitle: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: 12,
    },
    activityRingWrap: {
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 10,
    },
    activityLegendRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    activityLegendItem: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingVertical: 8,
      paddingHorizontal: 6,
      alignItems: 'center',
    },
    activityLegendValue: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: 16,
    },
    activityLegendLabel: {
      marginTop: 3,
      color: colors.textMuted,
      fontSize: 11,
      textAlign: 'center',
    },
    kpiRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 12,
    },
    kpiCard: {
      flex: 1,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 9,
      gap: 4,
    },
    kpiTitle: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    kpiValue: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '800',
    },
    metaRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    metaTitle: {
      color: colors.textMuted,
    },
    metaValue: {
      color: colors.text,
      fontWeight: '700',
    },
    statsError: {
      marginBottom: 10,
      color: colors.danger,
      fontSize: 12,
      fontWeight: '600',
    },
    accordionCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      ...cardShadow,
    },
    accordionHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 14,
      paddingVertical: 12,
    },
    accordionHeadMain: {
      flex: 1,
      marginRight: 8,
    },
    accordionTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 16,
    },
    accordionHint: {
      color: colors.textMuted,
      marginTop: 2,
      fontSize: 12,
    },
    accordionBody: {
      borderTopWidth: 1,
      borderTopColor: colors.border,
      padding: 14,
    },
    settingsLabel: {
      color: colors.textMuted,
      marginBottom: 8,
      marginTop: 6,
    },
    settingRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 2,
    },
    primaryAction: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      height: 48,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
    },
    primaryActionText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    secondaryAction: {
      borderRadius: 12,
      height: 46,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 12,
    },
    secondaryActionText: {
      color: colors.text,
      fontWeight: '700',
    },
    dangerAction: {
      borderRadius: 12,
      height: 48,
      borderWidth: 1,
      borderColor: colors.dangerSoft,
      backgroundColor: colors.dangerSoft,
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
    },
    dangerActionText: {
      color: colors.danger,
      fontWeight: '700',
    },
    privacyCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
    },
    privacyCardCompact: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      marginTop: -4,
    },
    privacyHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      marginBottom: 6,
    },
    privacyTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    privacyText: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 18,
    },
    syncRow: {
      marginTop: 4,
      marginBottom: 8,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    syncTextWrap: {
      flex: 1,
      gap: 2,
    },
    syncLabel: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    syncHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
    },
    syncNowBtn: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      minHeight: 42,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    syncNowBtnDisabled: {
      opacity: 0.6,
    },
    syncNowBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    badgeSectionTitle: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 14,
      marginBottom: 8,
    },
    badgesWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 12,
    },
    badgeChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.warningSoft,
      backgroundColor: colors.warningSoft,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    badgeChipLocked: {
      borderColor: colors.border,
      backgroundColor: colors.background,
    },
    badgeChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    badgeChipTextLocked: {
      color: colors.textMuted,
    },
  });
