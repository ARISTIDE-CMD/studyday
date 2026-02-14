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
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';

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
  const styles = useMemo(() => createStyles(colors), [colors]);

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
          placeholderTextColor="#94A3B8"
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
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity onPress={() => setShowPassword((prev) => !prev)}>
            <Ionicons name={showPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        <Text style={styles.label}>{t('auth.passwordConfirm')}</Text>
        <View style={styles.passwordWrapper}>
          <TextInput
            value={confirmPassword}
            onChangeText={setConfirmPassword}
            style={styles.passwordInput}
            secureTextEntry={!showConfirmPassword}
            autoCapitalize="none"
            placeholder="********"
            placeholderTextColor="#94A3B8"
          />
          <TouchableOpacity onPress={() => setShowConfirmPassword((prev) => !prev)}>
            <Ionicons name={showConfirmPassword ? 'eye-off-outline' : 'eye-outline'} size={20} color={colors.textMuted} />
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
        {info ? <Text style={styles.infoText}>{info}</Text> : null}

        <TouchableOpacity style={styles.submit} onPress={handleSubmit} disabled={loading}>
          {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>{t('auth.continue')}</Text>}
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
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    color: colors.text,
    marginBottom: 14,
  },
  passwordWrapper: {
    height: 50,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  passwordInput: {
    flex: 1,
    color: colors.text,
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
