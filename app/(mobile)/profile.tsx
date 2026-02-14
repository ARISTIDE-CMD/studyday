import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import type { ThemeMode } from '@/lib/settings-storage';
import { fetchTaskStats, getCachedTaskStats } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import { useSettings } from '@/providers/settings-provider';

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
  const registrationDate = profile?.created_at ?? user?.created_at ?? null;
  const avatarUrl = profile?.avatar_url?.trim()
    || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '');

  const themedStyles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

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

  return (
    <View style={themedStyles.page}>
      <View style={themedStyles.content}>
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
            <View style={themedStyles.statsGrid}>
              <View style={themedStyles.statCard}>
                <Text style={themedStyles.statNumber}>{totalTasks}</Text>
                <Text style={themedStyles.statLabel}>{t('profile.tasksCreated')}</Text>
              </View>
              <View style={themedStyles.statCard}>
                <Text style={themedStyles.statNumber}>{doneTasks}</Text>
                <Text style={themedStyles.statLabel}>{t('profile.tasksDone')}</Text>
              </View>
            </View>

            <View style={themedStyles.metaCard}>
              <Text style={themedStyles.metaTitle}>{t('profile.registrationDate')}</Text>
              <Text style={themedStyles.metaValue}>{formatDateLabel(registrationDate, locale, t('common.noDate'))}</Text>
            </View>
            {statsError ? <Text style={themedStyles.statsError}>{statsError}</Text> : null}
          </>
        )}

        <View style={themedStyles.settingsCard}>
          <Text style={themedStyles.settingsTitle}>{t('profile.preferences')}</Text>

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

        <TouchableOpacity style={themedStyles.primaryAction} onPress={() => router.push('/profile-editor')}>
          <Text style={themedStyles.primaryActionText}>{t('profile.editProfile')}</Text>
        </TouchableOpacity>

        <TouchableOpacity style={themedStyles.dangerAction} onPress={() => void onSignOut()}>
          <Text style={themedStyles.dangerActionText}>{t('profile.signOut')}</Text>
        </TouchableOpacity>
      </View>
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
    statsGrid: {
      flexDirection: 'row',
      gap: 10,
      marginBottom: 10,
    },
    statCard: {
      flex: 1,
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      ...cardShadow,
    },
    statNumber: {
      fontSize: 22,
      color: colors.primary,
      fontWeight: '800',
    },
    statLabel: {
      marginTop: 6,
      color: colors.textMuted,
    },
    metaCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 16,
      ...cardShadow,
    },
    metaTitle: {
      color: colors.textMuted,
      marginBottom: 4,
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
    settingsCard: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      marginBottom: 16,
      ...cardShadow,
    },
    settingsTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 10,
      fontSize: 16,
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
    },
    dangerActionText: {
      color: colors.danger,
      fontWeight: '700',
    },
  });
