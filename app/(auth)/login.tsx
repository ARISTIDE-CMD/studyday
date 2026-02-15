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

export default function LoginScreen() {
  const { showNotification } = useInAppNotification();
  const { queuePostLoginIntro } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [loadingGoogle, setLoadingGoogle] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError(t('auth.errEmailPasswordRequired'));
      return;
    }

    setError('');
    setLoading(true);

    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });

    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    queuePostLoginIntro();

    showNotification({
      variant: 'success',
      title: t('auth.welcomeTitle'),
      message: t('auth.welcomeLoginMessage'),
      durationMs: 6000,
    });

    router.replace('/post-login');
  };

  const handleGoogleSignIn = async () => {
    setError('');
    setLoadingGoogle(true);

    try {
      await signInWithGoogle('/login');

      queuePostLoginIntro();

      showNotification({
        variant: 'success',
        title: t('auth.welcomeTitle'),
        message: t('auth.welcomeLoginMessage'),
        durationMs: 6000,
      });

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
        <Text style={styles.title}>{t('auth.loginTitle')}</Text>
        <Text style={styles.subtitle}>{t('auth.loginSubtitle')}</Text>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.email')}</Text>
          <TextInput
            value={email}
            onChangeText={setEmail}
            keyboardType="email-address"
            autoCapitalize="none"
            style={styles.input}
            placeholder="etudiant@email.com"
            placeholderTextColor={colors.textMuted}
          />
        </View>

        <View style={styles.field}>
          <Text style={styles.label}>{t('auth.password')}</Text>
          <View style={styles.passwordWrapper}>
            <TextInput
              value={password}
              onChangeText={setPassword}
              secureTextEntry={!showPassword}
              autoCapitalize="none"
              style={styles.passwordInput}
              placeholder="********"
              placeholderTextColor={colors.textMuted}
            />
            <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
              <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
            </TouchableOpacity>
          </View>
        </View>

        <TouchableOpacity onPress={() => router.push('/forgot-password')}>
          <Text style={styles.forgot}>{t('auth.forgotPassword')}</Text>
        </TouchableOpacity>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

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

        <TouchableOpacity style={styles.linkRow} onPress={() => router.push('/signup')}>
          <Text style={styles.linkMuted}>{t('auth.noAccount')} </Text>
          <Text style={styles.linkStrong}>{t('auth.signUp')}</Text>
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
    field: {
      marginBottom: 14,
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
    },
    passwordInput: {
      flex: 1,
      color: colors.text,
    },
    forgot: {
      marginTop: 4,
      marginBottom: 14,
      color: colors.primary,
      fontWeight: '600',
      textAlign: 'right',
    },
    errorText: {
      color: colors.danger,
      marginBottom: 10,
      fontWeight: '600',
    },
    submit: {
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
