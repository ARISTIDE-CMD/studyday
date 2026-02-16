import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Animated,
  Easing,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TouchableOpacity,
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
  const { isSyncing, pendingOperations, triggerSync } = useOfflineSyncStatus();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [totalTasks, setTotalTasks] = useState(0);
  const [doneTasks, setDoneTasks] = useState(0);
  const [streakDays, setStreakDays] = useState(0);
  const [focusWeekSessions, setFocusWeekSessions] = useState(0);
  const [statsError, setStatsError] = useState('');
  const [settingsModalVisible, setSettingsModalVisible] = useState(false);
  const [signOutModalVisible, setSignOutModalVisible] = useState(false);
  const [signOutAction, setSignOutAction] = useState<'continue' | 'sync' | null>(null);
  const avatarPulse = React.useRef(new Animated.Value(0)).current;
  const hasHydratedRef = React.useRef(false);
  const registrationDate = profile?.created_at ?? user?.created_at ?? null;
  const avatarUrl = profile?.avatar_url?.trim()
    || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '');
  const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;
  const pendingTasks = Math.max(totalTasks - doneTasks, 0);
  const themedStyles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

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

    const shouldShowBlockingLoader = !hasHydratedRef.current;
    try {
      if (shouldShowBlockingLoader) {
        setLoading(true);
      }
      setStatsError('');

      const [cachedStats, cachedTasks] = await Promise.all([
        getCachedTaskStats(user.id),
        getCachedTasks(user.id),
      ]);
      const cachedFocusStats = await getFocusStats(user.id);
      setTotalTasks(cachedStats.total);
      setDoneTasks(cachedStats.done);
      setFocusWeekSessions(cachedFocusStats.weekSessions);

      const cachedDoneDates = new Set(
        cachedTasks
          .filter((task) => task.status === 'done' && task.completed_at)
          .map((task) => (task.completed_at as string).slice(0, 10))
      );
      setStreakDays(computeStreakDays(cachedDoneDates));
      if (shouldShowBlockingLoader) {
        setLoading(false);
      }

      const [stats, remoteTasks] = await Promise.all([
        fetchTaskStats(user.id),
        fetchTasks(user.id),
      ]);
      const remoteFocusStats = await getFocusStats(user.id);
      setTotalTasks(stats.total);
      setDoneTasks(stats.done);
      setFocusWeekSessions(remoteFocusStats.weekSessions);

      const remoteDoneDates = new Set(
        remoteTasks
          .filter((task) => task.status === 'done' && task.completed_at)
          .map((task) => (task.completed_at as string).slice(0, 10))
      );
      setStreakDays(computeStreakDays(remoteDoneDates));
    } catch (error) {
      setStatsError(getErrorMessage(error, t('profile.statsError')));
    } finally {
      if (shouldShowBlockingLoader) {
        setLoading(false);
      }
      hasHydratedRef.current = true;
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

  const onRequestSignOut = () => {
    if (pendingOperations > 0) {
      setSettingsModalVisible(false);
      setSignOutModalVisible(true);
      return;
    }
    void onSignOut();
  };

  const onSignOutWithoutSync = async () => {
    setSignOutAction('continue');
    try {
      await onSignOut();
    } finally {
      setSignOutAction(null);
      setSignOutModalVisible(false);
    }
  };

  const onSyncThenSignOut = async () => {
    setSignOutAction('sync');
    try {
      await triggerSync();
      await onSignOut();
    } catch {
      setStatsError(t('profile.syncBeforeSignOutError'));
      setSignOutAction(null);
    }
  };

  return (
    <TabSwipeShell tab="profile">
    <View style={themedStyles.page}>
      <View style={themedStyles.headerBar}>
        <Text style={themedStyles.title}>{t('profile.title')}</Text>
        <TouchableOpacity style={themedStyles.settingsIconBtn} onPress={() => setSettingsModalVisible(true)}>
          <Ionicons name="settings-outline" size={20} color={colors.text} />
        </TouchableOpacity>
      </View>

      <View style={themedStyles.contentCompact}>
        <View style={themedStyles.profileCard}>
          <TouchableOpacity
            style={themedStyles.avatarWrap}
            activeOpacity={0.85}
            onPress={() => router.push(`/profile-editor?returnTo=${encodeURIComponent('/profile')}`)}>
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
            <View style={themedStyles.avatarCameraBadge}>
              <Ionicons name="camera-outline" size={12} color="#FFFFFF" />
            </View>
          </TouchableOpacity>

          <Text style={themedStyles.name}>{profile?.full_name ?? t('profile.fallbackName')}</Text>
          <Text style={themedStyles.email}>{user?.email ?? t('profile.unknownEmail')}</Text>
          <Text style={themedStyles.avatarHint}>{t('profile.tapToChangePhoto')}</Text>
        </View>

        {loading ? (
          <View style={themedStyles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={themedStyles.compactStatsCard}>
            <View style={themedStyles.compactStatsTop}>
              <ActivityRing
                size={130}
                progress={completionRate}
                colors={colors}
                centerValue={`${Math.round(completionRate * 100)}%`}
                centerLabel={t('profile.completionRate')}
              />
              <View style={themedStyles.compactStatsGrid}>
                <View style={themedStyles.compactStatItem}>
                  <Text style={themedStyles.compactStatValue}>{doneTasks}</Text>
                  <Text style={themedStyles.compactStatLabel}>{t('profile.tasksDone')}</Text>
                </View>
                <View style={themedStyles.compactStatItem}>
                  <Text style={themedStyles.compactStatValue}>{pendingTasks}</Text>
                  <Text style={themedStyles.compactStatLabel}>{t('profile.tasksPending')}</Text>
                </View>
                <View style={themedStyles.compactStatItem}>
                  <Text style={themedStyles.compactStatValue}>{focusWeekSessions}</Text>
                  <Text style={themedStyles.compactStatLabel}>{t('profile.focusWeekTitle')}</Text>
                </View>
                <View style={themedStyles.compactStatItem}>
                  <Text style={themedStyles.compactStatValue}>{streakDays}</Text>
                  <Text style={themedStyles.compactStatLabel}>{t('profile.streakTitle')}</Text>
                </View>
              </View>
            </View>
            <View style={themedStyles.metaRow}>
              <Text style={themedStyles.metaTitle}>{t('profile.registrationDate')}</Text>
              <Text style={themedStyles.metaValue}>{formatDateLabel(registrationDate, locale, t('common.noDate'))}</Text>
            </View>
          </View>
        )}

        {statsError ? <Text style={themedStyles.statsError}>{statsError}</Text> : null}

        <View style={themedStyles.quickActionsRow}>
          <TouchableOpacity style={themedStyles.secondaryAction} onPress={() => router.push('/focus')}>
            <Text style={themedStyles.secondaryActionText}>{t('profile.focusMode')}</Text>
          </TouchableOpacity>

          <TouchableOpacity style={themedStyles.secondaryAction} onPress={() => router.push('/ai-toolbox')}>
            <Text style={themedStyles.secondaryActionText}>{t('profile.aiToolbox')}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <Modal
        visible={settingsModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setSettingsModalVisible(false)}>
        <Pressable style={themedStyles.settingsModalOverlay} onPress={() => setSettingsModalVisible(false)}>
          <Pressable style={themedStyles.settingsModalCard} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity style={themedStyles.settingsModalClose} onPress={() => setSettingsModalVisible(false)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>
            <Text style={themedStyles.settingsModalTitle}>{t('profile.preferences')}</Text>

            <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={themedStyles.settingsModalBody}>
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

              <Text style={themedStyles.settingsLabel}>{t('profile.security')}</Text>
              <TouchableOpacity style={themedStyles.dangerAction} onPress={onRequestSignOut}>
                <Text style={themedStyles.dangerActionText}>{t('profile.signOut')}</Text>
              </TouchableOpacity>

              <View style={themedStyles.privacyCard}>
                <View style={themedStyles.privacyHeader}>
                  <Ionicons name="shield-checkmark-outline" size={16} color={colors.success} />
                  <Text style={themedStyles.privacyTitle}>{t('profile.privacyTitle')}</Text>
                </View>
                <Text style={themedStyles.privacyText}>{t('profile.privacyDescription')}</Text>
              </View>
            </ScrollView>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={signOutModalVisible}
        transparent
        animationType="fade"
        onRequestClose={() => {
          if (!signOutAction) setSignOutModalVisible(false);
        }}>
        <Pressable
          style={themedStyles.signOutModalOverlay}
          onPress={() => {
            if (!signOutAction) setSignOutModalVisible(false);
          }}>
          <Pressable style={themedStyles.signOutModalCard} onPress={(event) => event.stopPropagation()}>
            <TouchableOpacity
              style={themedStyles.signOutModalClose}
              onPress={() => setSignOutModalVisible(false)}
              disabled={Boolean(signOutAction)}>
              <Ionicons name="close" size={18} color={colors.textMuted} />
            </TouchableOpacity>

            <Text style={themedStyles.signOutModalTitle}>{t('profile.syncBeforeSignOutTitle')}</Text>
            <Text style={themedStyles.signOutModalBody}>
              {t('profile.syncBeforeSignOutDescription', { count: pendingOperations })}
            </Text>

            <TouchableOpacity
              style={[themedStyles.signOutContinueBtn, Boolean(signOutAction) && themedStyles.signOutModalBtnDisabled]}
              onPress={() => void onSignOutWithoutSync()}
              disabled={Boolean(signOutAction)}>
              {signOutAction === 'continue' ? (
                <ActivityIndicator size="small" color={colors.text} />
              ) : (
                <Text style={themedStyles.signOutContinueText}>{t('profile.signOutContinue')}</Text>
              )}
            </TouchableOpacity>

            <TouchableOpacity
              style={[themedStyles.signOutSyncBtn, Boolean(signOutAction) && themedStyles.signOutModalBtnDisabled]}
              onPress={() => void onSyncThenSignOut()}
              disabled={Boolean(signOutAction)}>
              {signOutAction === 'sync' ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={themedStyles.signOutSyncText}>{t('profile.signOutSyncFirst')}</Text>
              )}
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>
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
    },
    headerBar: {
      paddingTop: 56,
      paddingHorizontal: 16,
      marginBottom: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    settingsIconBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    contentCompact: {
      flex: 1,
      paddingHorizontal: 16,
      paddingBottom: 18,
      justifyContent: 'space-between',
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
    avatarCameraBadge: {
      position: 'absolute',
      right: -2,
      top: -2,
      width: 20,
      height: 20,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.surface,
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
    avatarHint: {
      marginTop: 6,
      color: colors.textMuted,
      fontSize: 12,
    },
    loadingWrap: {
      paddingVertical: 20,
    },
    compactStatsCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      ...cardShadow,
    },
    compactStatsTop: {
      flexDirection: 'row',
      gap: 12,
      alignItems: 'center',
      marginBottom: 10,
    },
    compactStatsGrid: {
      flex: 1,
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    compactStatItem: {
      width: '47%',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingVertical: 8,
      paddingHorizontal: 8,
      alignItems: 'center',
    },
    compactStatValue: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: 15,
    },
    compactStatLabel: {
      color: colors.textMuted,
      fontSize: 11,
      textAlign: 'center',
      marginTop: 2,
    },
    quickActionsRow: {
      gap: 10,
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
    signOutModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(2, 6, 23, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 18,
    },
    signOutModalCard: {
      width: '100%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      ...cardShadow,
    },
    signOutModalClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
      marginBottom: 6,
    },
    signOutModalTitle: {
      color: colors.text,
      fontSize: 17,
      fontWeight: '800',
      marginBottom: 8,
    },
    signOutModalBody: {
      color: colors.textMuted,
      fontSize: 13,
      lineHeight: 19,
      marginBottom: 16,
    },
    signOutContinueBtn: {
      minHeight: 44,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 8,
    },
    signOutContinueText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    signOutSyncBtn: {
      minHeight: 46,
      borderRadius: 10,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    signOutSyncText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 13,
    },
    signOutModalBtnDisabled: {
      opacity: 0.7,
    },
    settingsModalOverlay: {
      flex: 1,
      backgroundColor: 'rgba(2, 6, 23, 0.45)',
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 16,
    },
    settingsModalCard: {
      width: '100%',
      maxHeight: '84%',
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      ...cardShadow,
    },
    settingsModalClose: {
      width: 28,
      height: 28,
      borderRadius: 14,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'flex-end',
    },
    settingsModalTitle: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 17,
      marginBottom: 8,
    },
    settingsModalBody: {
      paddingBottom: 8,
    },
  });
