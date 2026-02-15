import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { BrandLogo } from '@/components/ui/brand-logo';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';

export default function OnboardingScreen() {
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  return (
    <View style={styles.container}>
      <View style={styles.headerBrand}>
        <BrandLogo size={38} caption={t('launch.brandCaption')} />
      </View>

      <View style={styles.illustrationCard}>
        <View style={styles.phoneShape} />
        <View style={styles.badgeTop}>
          <Ionicons name="checkmark" size={14} color={colors.success} />
        </View>
        <View style={styles.badgeBottom}>
          <Ionicons name="list-outline" size={14} color={colors.primary} />
          <Text style={styles.badgeBottomText}>{t('home.daySummary')}</Text>
        </View>
      </View>

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

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  cardShadow: ReturnType<typeof useAppTheme>['cardShadow']
) =>
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
  illustrationCard: {
    height: 260,
    borderRadius: 24,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 34,
    ...cardShadow,
  },
  phoneShape: {
    width: 130,
    height: 200,
    borderRadius: 24,
    backgroundColor: colors.surface,
    borderWidth: 2,
    borderColor: colors.border,
  },
  badgeTop: {
    position: 'absolute',
    right: 24,
    top: 24,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
    ...cardShadow,
  },
  badgeBottom: {
    position: 'absolute',
    left: 18,
    bottom: 18,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.surface,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    ...cardShadow,
  },
  badgeBottomText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  title: {
    fontSize: 31,
    lineHeight: 38,
    fontWeight: '800',
    color: colors.text,
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
