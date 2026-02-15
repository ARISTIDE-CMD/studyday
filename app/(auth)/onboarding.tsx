import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { AuthIllustration } from '@/components/ui/auth-illustration';
import { BrandLogo } from '@/components/ui/brand-logo';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';

export default function OnboardingScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      <View style={styles.headerBrand}>
        <BrandLogo size={38} caption={t('launch.brandCaption')} />
      </View>

      <AuthIllustration variant="onboarding" height={260} />

      <Text style={styles.title}>{t('auth.onboardingTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth.onboardingSubtitle')}</Text>

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
      marginBottom: 30,
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
