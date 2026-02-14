import { Image } from 'expo-image';
import { Redirect, router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, Pressable, StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/providers/auth-provider';

const INTRO_DURATION_MS = 3600;

export default function PostLoginScreen() {
  const { loading, session, user, profile, shouldShowPostLoginIntro, consumePostLoginIntro } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();

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

  useEffect(() => {
    if (!session || !shouldShowPostLoginIntro) {
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

    const timer = setTimeout(() => {
      finishIntro();
    }, INTRO_DURATION_MS + 250);

    return () => {
      clearTimeout(timer);
      leftLoop.stop();
      rightLoop.stop();
    };
  }, [cardAnim, finishIntro, orbLeftAnim, orbRightAnim, progressAnim, session, shouldShowPostLoginIntro, titleAnim]);

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

  if (!shouldShowPostLoginIntro) {
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
          <View style={styles.heroImageWrap}>
            <Image source={require('../assets/images/react-logo.png')} style={styles.heroImage} contentFit="contain" />
          </View>
          <View style={styles.sideImageWrap}>
            <Image
              source={require('../assets/images/partial-react-logo.png')}
              style={styles.sideImage}
              contentFit="contain"
            />
          </View>
        </View>

        <View style={styles.progressTrack}>
          <Animated.View style={[styles.progressFill, { width: progressWidth }]} />
        </View>

        <Text style={styles.progressLabel}>{t('postLogin.loadingDashboard')}</Text>
      </Animated.View>

      <Pressable onPress={finishIntro}>
        <Text style={styles.skip}>{t('postLogin.skip')}</Text>
      </Pressable>
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
    alignItems: 'center',
    gap: 12,
    marginBottom: 18,
  },
  heroImageWrap: {
    flex: 1,
    backgroundColor: colors.primarySoft,
    borderRadius: 16,
    height: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  heroImage: {
    width: 110,
    height: 110,
  },
  sideImageWrap: {
    width: 92,
    height: 120,
    borderRadius: 16,
    backgroundColor: colors.successSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sideImage: {
    width: 66,
    height: 66,
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
  skip: {
    color: colors.textMuted,
    fontWeight: '600',
  },
});
