import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Linking,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { supabase } from '@/lib/supabase';

type RecoveryTokens = {
  accessToken: string | null;
  refreshToken: string | null;
  type: string | null;
};

function parseRecoveryTokens(url: string): RecoveryTokens {
  const [base, hash = ''] = url.split('#');
  const queryParams = new URL(base).searchParams;
  const hashParams = new URLSearchParams(hash);

  return {
    accessToken: hashParams.get('access_token') ?? queryParams.get('access_token'),
    refreshToken: hashParams.get('refresh_token') ?? queryParams.get('refresh_token'),
    type: hashParams.get('type') ?? queryParams.get('type'),
  };
}

export default function ResetPasswordScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [bootLoading, setBootLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const [ready, setReady] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let mounted = true;

    const applyRecoverySessionFromUrl = async (url: string | null) => {
      if (!url) return false;

      try {
        const parsed = parseRecoveryTokens(url);

        if (parsed.type !== 'recovery' || !parsed.accessToken || !parsed.refreshToken) {
          return false;
        }

        const { error: sessionError } = await supabase.auth.setSession({
          access_token: parsed.accessToken,
          refresh_token: parsed.refreshToken,
        });

        if (sessionError) {
          if (mounted) setError(sessionError.message);
          return false;
        }

        return true;
      } catch {
        return false;
      }
    };

    const bootstrap = async () => {
      const initialUrl = await Linking.getInitialURL();
      const fromLink = await applyRecoverySessionFromUrl(initialUrl);

      if (!fromLink) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          if (mounted) setReady(true);
        }
      } else if (mounted) {
        setReady(true);
      }

      if (mounted) setBootLoading(false);
    };

    void bootstrap();

    const subscription = Linking.addEventListener('url', ({ url }) => {
      void (async () => {
        const ok = await applyRecoverySessionFromUrl(url);
        if (ok && mounted) {
          setReady(true);
          setError('');
        }
      })();
    });

    return () => {
      mounted = false;
      subscription.remove();
    };
  }, []);

  const canSubmit = useMemo(() => ready && !saving, [ready, saving]);

  const onReset = async () => {
    if (!ready) {
      setError(t('auth.resetReadyError'));
      return;
    }

    if (password.length < 6) {
      setError(t('auth.errPasswordShort'));
      return;
    }

    if (password !== confirmPassword) {
      setError(t('auth.errPasswordMismatch'));
      return;
    }

    setError('');
    setInfo('');
    setSaving(true);

    const { error: updateError } = await supabase.auth.updateUser({ password });

    if (updateError) {
      setSaving(false);
      setError(updateError.message);
      return;
    }

    setInfo(t('auth.infoPasswordUpdated'));
    await supabase.auth.signOut();
    setSaving(false);

    setTimeout(() => {
      router.replace('/login');
    }, 1000);
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.resetTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth.resetSubtitle')}</Text>

      {bootLoading ? (
        <View style={styles.loadingWrap}>
          <ActivityIndicator color={colors.primary} />
        </View>
      ) : null}

      {!bootLoading && !ready ? (
        <Text style={styles.errorText}>{t('auth.resetOpenFromMail')}</Text>
      ) : null}

      <Text style={styles.label}>{t('auth.password')}</Text>
      <TextInput
        value={password}
        onChangeText={setPassword}
        style={styles.input}
        secureTextEntry
        placeholder="********"
        placeholderTextColor="#94A3B8"
      />

      <Text style={styles.label}>{t('auth.passwordConfirm')}</Text>
      <TextInput
        value={confirmPassword}
        onChangeText={setConfirmPassword}
        style={styles.input}
        secureTextEntry
        placeholder="********"
        placeholderTextColor="#94A3B8"
      />

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {info ? <Text style={styles.infoText}>{info}</Text> : null}

      <TouchableOpacity style={[styles.submit, !canSubmit && styles.submitDisabled]} onPress={() => void onReset()} disabled={!canSubmit}>
        {saving ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>{t('auth.resetUpdate')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.replace('/login')}>
        <Text style={styles.linkStrong}>{t('auth.forgotBackToLogin')}</Text>
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
    paddingTop: 80,
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
    lineHeight: 21,
  },
  loadingWrap: {
    marginBottom: 12,
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
  errorText: {
    color: colors.danger,
    marginBottom: 10,
    fontWeight: '600',
    lineHeight: 20,
  },
  infoText: {
    color: colors.success,
    marginBottom: 10,
    fontWeight: '600',
    lineHeight: 20,
  },
  submit: {
    height: 52,
    borderRadius: 14,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  submitDisabled: {
    opacity: 0.45,
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
  linkStrong: {
    color: colors.primary,
    fontWeight: '700',
  },
});
