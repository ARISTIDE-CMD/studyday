import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { signInWithGoogle } from '@/lib/google-auth';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';

type PasswordStrength = {
  bars: 1 | 2 | 3;
  labelKey: string;
  tone: 'weak' | 'medium' | 'strong';
};

function evaluatePasswordStrength(password: string): PasswordStrength {
  let score = 0;

  if (password.length >= 8) score += 1;
  if (password.length >= 12) score += 1;
  if (/[a-z]/.test(password) && /[A-Z]/.test(password)) score += 1;
  if (/\d/.test(password)) score += 1;
  if (/[^A-Za-z0-9]/.test(password)) score += 1;

  if (score >= 4) {
    return {
      bars: 3,
      labelKey: 'auth.passwordStrengthStrong',
      tone: 'strong',
    };
  }

  if (score >= 2) {
    return {
      bars: 2,
      labelKey: 'auth.passwordStrengthMedium',
      tone: 'medium',
    };
  }

  return {
    bars: 1,
    labelKey: 'auth.passwordStrengthWeak',
    tone: 'weak',
  };
}

export default function SignupScreen() {
  const { showNotification } = useInAppNotification();
  const { queuePostLoginIntro } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const passwordStrength = useMemo(() => evaluatePasswordStrength(password), [password]);
  const strengthColor =
    passwordStrength.tone === 'strong'
      ? colors.success
      : passwordStrength.tone === 'medium'
        ? colors.warning
        : colors.danger;

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim() || !confirmPassword.trim()) {
      setError(t('auth.errRequiredFields'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.errPasswordMismatch'));
      return;
    }

    setError('');
    setInfo('');
    setLoading(true);

    const { data, error: signupError } = await supabase.auth.signUp({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signupError) {
      setError(signupError.message);
      return;
    }

    if (!data.session) {
      setInfo(t('auth.infoSignupVerifyMail'));
      router.replace('/login');
      return;
    }

    showNotification({
      variant: 'success',
      title: t('auth.welcomeTitle'),
      message: t('auth.welcomeSignupMessage'),
      durationMs: 6000,
    });

    queuePostLoginIntro();
    router.replace('/post-login');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setInfo('');
    setLoadingGoogle(true);

    try {
      await signInWithGoogle('/login');

      showNotification({
        variant: 'success',
        title: t('auth.welcomeTitle'),
        message: t('auth.welcomeSignupMessage'),
        durationMs: 6000,
      });

      queuePostLoginIntro();
      router.replace('/post-login');
    } catch (googleError) {
      const message = getErrorMessage(googleError, t('auth.googleSignInError'));
      if (message.toLowerCase().includes('cancel')) {
        return;
      }
      setError(message);
    } finally {
      setLoadingGoogle(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View>
        <Text style={styles.title}>{t('auth.signupTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.signupSubtitle')}</Text>

        <Text style={styles.label}>{t('auth.email')}</Text>
        <TextInput
          value={email}
          onChangeText={setEmail}
          style={styles.input}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="etudiant@email.com"
          placeholderTextColor={colors.textMuted}
        />

        <Text style={styles.label}>{t('auth.password')}</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={password}
            onChangeText={setPassword}
            style={styles.passwordInput}
            secureTextEntry={!showPassword}
            autoCapitalize="none"
            placeholder="********"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {password.length > 0 ? (
          <View style={styles.strengthSection}>
            <Text style={styles.strengthText}>
              {t('auth.passwordStrengthLabel')}:{' '}
              <Text style={[styles.strengthValue, { color: strengthColor }]}>{t(passwordStrength.labelKey)}</Text>
            </Text>
            <View style={styles.strengthBars}>
              {[0, 1, 2].map((index) => {
                const isFilled = index < passwordStrength.bars;
                return (
                  <View
                    key={index}
                    style={[
                      styles.strengthBar,
                      isFilled
                        ? {
                            backgroundColor: strengthColor,
                            borderColor: strengthColor,
                          }
                        : styles.strengthBarMuted,
                    ]}
                  />
                );
              })}
            </View>
            <Text style={styles.strengthHint}>{t('auth.passwordStrengthHint')}</Text>
          </View>
        ) : null}

        <Text style={styles.label}>{t('auth.passwordConfirm')}</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.passwordInput}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            placeholder="********"
            placeholderTextColor={colors.textMuted}
          />
          <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)}>
            <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <TouchableOpacity style={styles.submit} onPress={handleSubmit} disabled={loading || loadingGoogle}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>{t('auth.continue')}</Text>}
        </TouchableOpacity>

        <TouchableOpacity style={styles.googleButton} onPress={handleGoogleSignIn} disabled={loading || loadingGoogle}>
          {loadingGoogle ? (
            <ActivityIndicator size="small" color={colors.text} />
          ) : (
            <>
              <Ionicons name="logo-google" size={18} color={colors.text} />
              <Text style={styles.googleButtonText}>{t('auth.googleSignIn')}</Text>
            </>
          )}
        </TouchableOpacity>

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/login')}>
          <Text style={styles.linkMuted}>{t('auth.hasAccount')} </Text>
          <Text style={styles.linkStrong}>{t('auth.signIn')}</Text>
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: colors.background,
      paddingHorizontal: 24,
      justifyContent: 'center',
    },
    title: {
      fontSize: 30,
      fontWeight: '800',
      color: colors.text,
    },
    subtitle: {
      marginTop: 8,
      color: colors.textMuted,
      marginBottom: 24,
    },
    label: {
      marginBottom: 8,
      color: colors.text,
      fontWeight: '600',
    },
    input: {
      height: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      color: colors.text,
      marginBottom: 14,
    },
    passwordWrapper: {
      height: 50,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
    },
    passwordInput: {
      flex: 1,
      color: colors.text,
    },
    strengthSection: {
      marginBottom: 14,
    },
    strengthText: {
      color: colors.text,
      fontWeight: '600',
      marginBottom: 8,
    },
    strengthValue: {
      fontWeight: '800',
    },
    strengthBars: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 8,
    },
    strengthBar: {
      flex: 1,
      height: 8,
      borderRadius: 99,
      borderWidth: 1,
    },
    strengthBarMuted: {
      backgroundColor: colors.surface,
      borderColor: colors.border,
    },
    strengthHint: {
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 16,
    },
    errorText: {
      color: colors.danger,
      marginBottom: 10,
      fontWeight: '600',
    },
    infoText: {
      color: colors.success,
      marginBottom: 10,
      fontWeight: '600',
    },
    submit: {
      marginTop: 2,
      height: 52,
      borderRadius: 14,
      backgroundColor: colors.primary,
      justifyContent: 'center',
      alignItems: 'center',
    },
    submitText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 16,
    },
    googleButton: {
      marginTop: 10,
      height: 50,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
    },
    googleButtonText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 15,
    },
    linkRow: {
      marginTop: 16,
      flexDirection: 'row',
      justifyContent: 'center',
    },
    linkMuted: {
      color: colors.textMuted,
    },
    linkStrong: {
      color: colors.primary,
      fontWeight: '700',
    },
  });
