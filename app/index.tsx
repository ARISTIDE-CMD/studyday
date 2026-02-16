import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Animated, Easing, StyleSheet, Text, View } from 'react-native';

import { BrandLogo } from '@/components/ui/brand-logo';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/providers/auth-provider';

const MIN_LAUNCH_DURATION_MS = 1400;
const AI_HINT_ROTATION_MS = 2300;

export default function Index() {
  const { session, loading, shouldShowPostLoginIntro } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();
  const [minDelayDone, setMinDelayDone] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;
  const floatAnim = useRef(new Animated.Value(0)).current;
  const pulseAnim = useRef(new Animated.Value(0)).current;
  const aiHintAnim = useRef(new Animated.Value(1)).current;
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);
  const aiHints = useMemo(
    () => [t('launch.aiHintTasks'), t('launch.aiHintPlanning'), t('launch.aiHintResources')],
    [t]
  );
  const [aiHintIndex, setAiHintIndex] = useState(0);

  useEffect(() => {
    const timer = setTimeout(() => setMinDelayDone(true), MIN_LAUNCH_DURATION_MS);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    const curve = Easing.bezier(0.22, 1, 0.36, 1);
    const pulseCurve = Easing.inOut(Easing.quad);

    const entryAnim = Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 620,
        easing: curve,
        useNativeDriver: true,
      }),
      Animated.timing(floatAnim, {
        toValue: 1,
        duration: 900,
        easing: curve,
        useNativeDriver: true,
      }),
    ]);

    const pulseLoop = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          easing: pulseCurve,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 0,
          duration: 1200,
          easing: pulseCurve,
          useNativeDriver: true,
        }),
      ])
    );

    entryAnim.start();
    pulseLoop.start();

    return () => {
      pulseLoop.stop();
    };
  }, [fadeAnim, floatAnim, pulseAnim]);

  useEffect(() => {
    if (aiHints.length <= 1) return;

    const rotate = () => {
      Animated.timing(aiHintAnim, {
        toValue: 0,
        duration: 170,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setAiHintIndex((prev) => (prev + 1) % aiHints.length);
        Animated.timing(aiHintAnim, {
          toValue: 1,
          duration: 240,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    };

    const interval = setInterval(rotate, AI_HINT_ROTATION_MS);
    return () => clearInterval(interval);
  }, [aiHintAnim, aiHints.length]);

  if (!loading && minDelayDone) {
    if (session) {
      if (shouldShowPostLoginIntro) {
        return <Redirect href="/post-login" />;
      }
      return <Redirect href="/(mobile)" />;
    }
    return <Redirect href="/onboarding" />;
  }

  const cardTranslateY = floatAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [16, 0],
  });
  const glowScale = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const glowOpacity = pulseAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [0.32, 0.6],
  });
  const aiHintTranslateY = aiHintAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [6, 0],
  });

  return (
    <View style={styles.page}>
      <Animated.View
        style={[
          styles.backgroundGlow,
          {
            opacity: glowOpacity,
            transform: [{ scale: glowScale }],
          },
        ]}
      />

      <Animated.View
        style={[
          styles.card,
          {
            opacity: fadeAnim,
            transform: [{ translateY: cardTranslateY }],
          },
        ]}>
        <BrandLogo size={66} align="center" caption={t('launch.brandCaption')} />
        <Text style={styles.title}>{t('launch.title')}</Text>
        <Text style={styles.subtitle}>{t('launch.subtitle')}</Text>

        <View style={styles.aiCard}>
          <View style={styles.aiCardHeader}>
            <View style={styles.aiDot} />
            <Ionicons name="sparkles-outline" size={13} color={colors.primary} />
            <Text style={styles.aiKicker}>{t('launch.aiKicker')}</Text>
          </View>
          <Animated.Text
            style={[
              styles.aiHintText,
              {
                opacity: aiHintAnim,
                transform: [{ translateY: aiHintTranslateY }],
              },
            ]}>
            {aiHints[aiHintIndex]}
          </Animated.Text>
        </View>

        <View style={styles.statusRow}>
          <ActivityIndicator color={colors.primary} size="small" />
          <Text style={styles.statusLabel}>{t('launch.status')}</Text>
        </View>
      </Animated.View>
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
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      overflow: 'hidden',
    },
    backgroundGlow: {
      position: 'absolute',
      width: 340,
      height: 340,
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
      top: '18%',
    },
    card: {
      width: '100%',
      maxWidth: 360,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingVertical: 30,
      paddingHorizontal: 20,
      alignItems: 'center',
      gap: 8,
      ...cardShadow,
    },
    title: {
      marginTop: 10,
      color: colors.text,
      textAlign: 'center',
      fontSize: 24,
      lineHeight: 30,
      fontWeight: '800',
    },
    subtitle: {
      color: colors.textMuted,
      textAlign: 'center',
      lineHeight: 20,
      marginTop: 2,
      marginBottom: 2,
    },
    aiCard: {
      width: '100%',
      marginTop: 6,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
    },
    aiCardHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    aiDot: {
      width: 7,
      height: 7,
      borderRadius: 999,
      backgroundColor: colors.success,
    },
    aiKicker: {
      color: colors.primary,
      fontWeight: '700',
      fontSize: 12,
    },
    aiHintText: {
      color: colors.text,
      fontWeight: '600',
      lineHeight: 18,
      minHeight: 36,
    },
    statusRow: {
      marginTop: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    statusLabel: {
      color: colors.text,
      fontSize: 13,
      fontWeight: '600',
    },
  });
