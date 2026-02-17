import { Ionicons } from '@expo/vector-icons';
import { Redirect, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/providers/auth-provider';

const INTRO_DURATION_MS = 3600;

export default function PostLoginScreen() {
  const {
    loading,
    session,
    user,
    profile,
    shouldShowPostLoginIntro,
    e2eeRecoveryRequired,
    e2eeRecoveryLoading,
    restoreE2eeFromCloud,
    consumePostLoginIntro,
  } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();
  const [passphrase, setPassphrase] = useState('');
  const [restoreError, setRestoreError] = useState('');
  const shouldShowIntroScreen = shouldShowPostLoginIntro || e2eeRecoveryRequired;

  const titleAnim = useRef(new Animated.Value(0)).current;
  const cardAnim = useRef(new Animated.Value(0)).current;
  const progressAnim = useRef(new Animated.Value(0)).current;
  const orbLeftAnim = useRef(new Animated.Value(0)).current;
  const orbRightAnim = useRef(new Animated.Value(0)).current;

  const displayName = useMemo(() => {
    const fromProfile = profile?.full_name?.trim();
    if (fromProfile) return fromProfile;

    const metadataName =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    if (metadataName) return metadataName;

    const emailName = user?.email?.split('@')[0]?.trim();
    return emailName || t('postLogin.fallbackName');
  }, [profile?.full_name, t, user?.email, user?.user_metadata?.full_name]);
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const finishIntro = useCallback(() => {
    consumePostLoginIntro();
    router.replace('/(mobile)');
  }, [consumePostLoginIntro]);

  const onRestoreE2ee = useCallback(async () => {
    if (passphrase.trim().length < 8) {
      setRestoreError(t('postLogin.e2eePassphraseRequired'));
      return;
    }

    setRestoreError('');
    try {
      await restoreE2eeFromCloud(passphrase.trim());
      finishIntro();
    } catch {
      setRestoreError(t('postLogin.e2eeRestoreError'));
    }
  }, [finishIntro, passphrase, restoreE2eeFromCloud, t]);

  useEffect(() => {
    if (!session || !shouldShowIntroScreen) {
      return;
    }

    const curve = Easing.bezier(0.22, 1, 0.36, 1);
    const accentCurve = Easing.bezier(0.25, 0.1, 0.25, 1);

    const leftLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbLeftAnim, {
          toValue: 1,
          duration: 1800,
          easing: accentCurve,
          useNativeDriver: true,
        }),
        Animated.timing(orbLeftAnim, {
          toValue: 0,
          duration: 1800,
          easing: accentCurve,
          useNativeDriver: true,
        }),
      ])
    );

    const rightLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(orbRightAnim, {
          toValue: 1,
          duration: 2100,
          easing: accentCurve,
          useNativeDriver: true,
        }),
        Animated.timing(orbRightAnim, {
          toValue: 0,
          duration: 2100,
          easing: accentCurve,
          useNativeDriver: true,
        }),
      ])
    );

    leftLoop.start();
    rightLoop.start();

    Animated.parallel([
      Animated.timing(titleAnim, {
        toValue: 1,
        duration: 850,
        easing: curve,
        useNativeDriver: true,
      }),
      Animated.timing(cardAnim, {
        toValue: 1,
        duration: 1200,
        easing: curve,
        useNativeDriver: true,
      }),
      Animated.timing(progressAnim, {
        toValue: 1,
        duration: INTRO_DURATION_MS,
        easing: curve,
        useNativeDriver: false,
      }),
    ]).start();

    const timer = e2eeRecoveryRequired
      ? null
      : setTimeout(() => {
        finishIntro();
      }, INTRO_DURATION_MS + 250);

    return () => {
      if (timer) clearTimeout(timer);
      leftLoop.stop();
      rightLoop.stop();
    };
  }, [
    cardAnim,
    e2eeRecoveryRequired,
    finishIntro,
    orbLeftAnim,
    orbRightAnim,
    progressAnim,
    session,
    shouldShowIntroScreen,
    titleAnim,
  ]);

  if (loading) {
    return (
      <View style={styles.loadingWrap}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/onboarding" />;
  }

  if (!shouldShowIntroScreen) {
    return <Redirect href="/(mobile)" />;
  }

  const titleOpacity = titleAnim;
  const titleTranslate = titleAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [24, 0],
  });
  const cardOpacity = cardAnim;
  const cardTranslate = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [26, 0],
  });
  const cardScale = cardAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.92, 1],
  });
  const progressWidth = progressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: ['0%', '100%'],
  });
  const orbLeftTranslateY = orbLeftAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [-16, 16],
  });
  const orbRightTranslateY = orbRightAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [14, -14],
  });

  return (
    <View style={styles.page}>
      <Animated.View style={[styles.orb, styles.leftOrb, { transform: [{ translateY: orbLeftTranslateY }] }]} />
      <Animated.View style={[styles.orb, styles.rightOrb, { transform: [{ translateY: orbRightTranslateY }] }]} />

      <Animated.View style={[styles.titleWrap, { opacity: titleOpacity, transform: [{ translateY: titleTranslate }] }]}>
        <Text style={styles.kicker}>{t('postLogin.kicker')}</Text>
        <Text style={styles.title}>{t('postLogin.title', { name: displayName })}</Text>
        <Text style={styles.subtitle}>{t('postLogin.subtitle')}</Text>
      </Animated.View>

      <Animated.View
        style={[
          styles.card,
          { opacity: cardOpacity, transform: [{ translateY: cardTranslate }, { scale: cardScale }] },
        ]}>
        <View style={styles.mediaRow}>
          <View style={styles.heroIllustration}>
            <View style={styles.heroHeader}>
              <View style={styles.heroDot} />
              <Text style={styles.heroHeaderText}>{t('postLogin.loadingDashboard')}</Text>
            </View>
            <View style={styles.heroGrid}>
              <View style={[styles.heroPill, styles.heroPillPrimary]}>
                <Ionicons name="checkmark-circle-outline" size={16} color={colors.primary} />
                <Text style={styles.heroPillText}>{t('nav.tasks')}</Text>
              </View>
              <View style={[styles.heroPill, styles.heroPillSuccess]}>
                <Ionicons name="document-text-outline" size={16} color={colors.success} />
                <Text style={styles.heroPillText}>{t('nav.resources')}</Text>
              </View>
              <View style={[styles.heroPill, styles.heroPillWarning]}>
                <Ionicons name="megaphone-outline" size={16} color={colors.warning} />
                <Text style={styles.heroPillText}>{t('nav.announcements')}</Text>
              </View>
            </View>
          </View>

          <View style={styles.sideColumn}>
            <View style={styles.sideInfoCard}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.sideInfoText}>{t('common.today')}</Text>
            </View>
            <View style={styles.sideInfoCard}>
              <Ionicons name="flash-outline" size={18} color={colors.success} />
              <Text style={styles.sideInfoText}>Focus</Text>
            </View>
          </View>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        {e2eeRecoveryRequired ? (
          <View style={styles.e2eeCard}>
            <Text style={styles.e2eeTitle}>{t('postLogin.e2eeTitle')}</Text>
            <Text style={styles.e2eeDescription}>{t('postLogin.e2eeDescription')}</Text>
            <TextInput
              style={styles.e2eeInput}
              placeholder={t('postLogin.e2eePassphrasePlaceholder')}
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              value={passphrase}
              onChangeText={(value) => {
                setPassphrase(value);
                if (restoreError) setRestoreError('');
              }}
            />
            <TouchableOpacity
              style={[styles.e2eeBtn, e2eeRecoveryLoading && styles.e2eeBtnDisabled]}
              onPress={() => void onRestoreE2ee()}
              disabled={e2eeRecoveryLoading}>
              {e2eeRecoveryLoading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <Text style={styles.e2eeBtnText}>{t('postLogin.e2eeRestore')}</Text>
              )}
            </TouchableOpacity>
            {restoreError ? <Text style={styles.e2eeError}>{restoreError}</Text> : null}
          </View>
        ) : (
          <Text style={styles.progressLabel}>{t('postLogin.loadingDashboard')}</Text>
        )}
      </Animated.View>

      {!e2eeRecoveryRequired ? (
        <Pressable onPress={finishIntro}>
          <Text style={styles.skip}>{t('postLogin.skip')}</Text>
        </Pressable>
      ) : null}
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
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
    overflow: 'hidden',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  orb: {
    position: 'absolute',
    borderRadius: 999,
  },
  leftOrb: {
    width: 220,
    height: 220,
    left: -60,
    top: 80,
    backgroundColor: 'rgba(91,108,255,0.22)',
  },
  rightOrb: {
    width: 260,
    height: 260,
    right: -90,
    bottom: 160,
    backgroundColor: 'rgba(22,163,74,0.16)',
  },
  titleWrap: {
    alignItems: 'center',
    marginBottom: 26,
  },
  kicker: {
    color: colors.primary,
    fontWeight: '700',
    marginBottom: 8,
    letterSpacing: 0.6,
    textTransform: 'uppercase',
    fontSize: 12,
  },
  title: {
    fontSize: 29,
    lineHeight: 34,
    fontWeight: '800',
    color: colors.text,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 20,
    maxWidth: 320,
  },
  card: {
    width: '100%',
    maxWidth: 360,
    borderRadius: 24,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 18,
    ...cardShadow,
  },
  mediaRow: {
    flexDirection: 'row',
    alignItems: 'stretch',
    gap: 12,
    marginBottom: 18,
  },
  heroIllustration: {
    flex: 1,
    backgroundColor: colors.background,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    minHeight: 124,
    padding: 10,
    gap: 10,
  },
  heroHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  heroDot: {
    width: 8,
    height: 8,
    borderRadius: 99,
    backgroundColor: colors.primary,
  },
  heroHeaderText: {
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 11,
  },
  heroGrid: {
    gap: 8,
  },
  heroPill: {
    borderRadius: 10,
    paddingHorizontal: 10,
    paddingVertical: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    borderWidth: 1,
  },
  heroPillPrimary: {
    backgroundColor: colors.primarySoft,
    borderColor: colors.primarySoft,
  },
  heroPillSuccess: {
    backgroundColor: colors.successSoft,
    borderColor: colors.successSoft,
  },
  heroPillWarning: {
    backgroundColor: colors.warningSoft,
    borderColor: colors.warningSoft,
  },
  heroPillText: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 12,
  },
  sideColumn: {
    width: 92,
    justifyContent: 'space-between',
    gap: 10,
  },
  sideInfoCard: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 5,
    paddingHorizontal: 6,
  },
  sideInfoText: {
    color: colors.text,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  progressTrack: {
    height: 8,
    borderRadius: 999,
    backgroundColor: colors.border,
    overflow: 'hidden',
  },
  progressFill: {
    height: '100%',
    backgroundColor: colors.primary,
    borderRadius: 999,
  },
  progressLabel: {
    marginTop: 10,
    color: colors.textMuted,
    fontSize: 12,
  },
  e2eeCard: {
    marginTop: 12,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    padding: 12,
    gap: 8,
  },
  e2eeTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 13,
  },
  e2eeDescription: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 17,
  },
  e2eeInput: {
    minHeight: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  e2eeBtn: {
    minHeight: 40,
    borderRadius: 10,
    backgroundColor: colors.primary,
    alignItems: 'center',
    justifyContent: 'center',
  },
  e2eeBtnDisabled: {
    opacity: 0.7,
  },
  e2eeBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
  e2eeError: {
    color: colors.danger,
    fontSize: 12,
    fontWeight: '600',
  },
  skip: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
