import { router } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Animated, Easing, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';

import { AuthIllustration } from '@/components/ui/auth-illustration';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);
  const aiHints = useMemo(
    () => [t('launch.aiHintTasks'), t('launch.aiHintPlanning'), t('launch.aiHintResources')],
    [t]
  );
  const aiHintAnim = useRef(new Animated.Value(1)).current;
  const [aiHintIndex, setAiHintIndex] = useState(0);

  useEffect(() => {
    if (aiHints.length <= 1) return;

    const interval = setInterval(() => {
      Animated.timing(aiHintAnim, {
        toValue: 0,
        duration: 150,
        easing: Easing.out(Easing.quad),
        useNativeDriver: true,
      }).start(() => {
        setAiHintIndex((prev) => (prev + 1) % aiHints.length);
        Animated.timing(aiHintAnim, {
          toValue: 1,
          duration: 220,
          easing: Easing.out(Easing.quad),
          useNativeDriver: true,
        }).start();
      });
    }, 2300);

    return () => clearInterval(interval);
  }, [aiHintAnim, aiHints.length]);

  const aiHintTranslateY = aiHintAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [5, 0],
  });

  return (
    <View style={styles.container}>
      <View style={styles.headerBrand}>
        <BrandLogo size={50} caption={t('launch.brandCaption')} />
      </View>

      <AuthIllustration variant="onboarding" height={260} />

      <Text style={styles.title}>{t('auth.onboardingTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth.onboardingSubtitle')}</Text>

      <View style={styles.aiCard}>
        <View style={styles.aiCardHeader}>
          <View style={styles.aiDot} />
          <Ionicons name="sparkles-outline" size={14} color={colors.primary} />
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

      <TouchableOpacity style={styles.primaryButton} onPress={() => router.push('/signup')}>
        <Text style={styles.primaryButtonText}>{t('auth.onboardingCreateAccount')}</Text>
      </TouchableOpacity>

      <TouchableOpacity style={styles.secondaryButton} onPress={() => router.push('/login')}>
        <Text style={styles.secondaryButtonText}>{t('auth.onboardingSignIn')}</Text>
      </TouchableOpacity>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      paddingTop: 64,
      paddingBottom: 28,
    },
    headerBrand: {
      marginBottom: 30,
    },
    title: {
      fontSize: 31,
      lineHeight: 38,
      fontWeight: '800',
      color: colors.text,
      marginTop: 20,
      marginBottom: 12,
    },
    subtitle: {
      color: colors.textMuted,
      lineHeight: 21,
      marginBottom: 14,
    },
    aiCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      gap: 6,
      marginBottom: 16,
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
      minHeight: 34,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      marginBottom: 12,
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '700',
    },
    secondaryButton: {
      borderRadius: 14,
      paddingVertical: 16,
      alignItems: 'center',
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
    },
    secondaryButtonText: {
      color: colors.text,
      fontSize: 16,
      fontWeight: '600',
    },
  });
