import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  LayoutAnimation,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  UIManager,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import type { ThemeMode } from '@/lib/settings-storage';
import { fetchTaskStats, getCachedTaskStats } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
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
  const { language, themeMode, setLanguage, setThemeMode, settingsLoading } = useSettings();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [totalTasks, setTotalTasks] = useState(0);
  const [doneTasks, setDoneTasks] = useState(0);
  const [statsError, setStatsError] = useState('');
  const [preferencesOpen, setPreferencesOpen] = useState(false);
  const [securityOpen, setSecurityOpen] = useState(false);
  const registrationDate = profile?.created_at ?? user?.created_at ?? null;
  const avatarUrl = profile?.avatar_url?.trim()
    || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '');
  const completionRate = totalTasks > 0 ? doneTasks / totalTasks : 0;
  const pendingTasks = Math.max(totalTasks - doneTasks, 0);

  const themedStyles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  useEffect(() => {
    if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
      UIManager.setLayoutAnimationEnabledExperimental(true);
    }
  }, []);

  const loadStats = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setStatsError('');

      const cached = await getCachedTaskStats(user.id);
      setTotalTasks(cached.total);
      setDoneTasks(cached.done);
      setLoading(false);

      const stats = await fetchTaskStats(user.id);
      setTotalTasks(stats.total);
      setDoneTasks(stats.done);
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
    <View style={themedStyles.page}>
      <ScrollView contentContainerStyle={themedStyles.content} showsVerticalScrollIndicator={false}>
        <Text style={themedStyles.title}>{t('profile.title')}</Text>

        <View style={themedStyles.profileCard}>
          <View style={themedStyles.avatar}>
            {avatarUrl ? (
              <Image source={avatarUrl} style={themedStyles.avatarImage} contentFit="cover" />
            ) : (
              <Ionicons name="person" size={26} color={colors.primary} />
            )}
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
      justifyContent: 'center',
      alignItems: 'center',
      marginBottom: 10,
      overflow: 'hidden',
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
  });
