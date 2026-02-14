import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { supabase } from '@/lib/supabase';

const REDIRECT_TO = 'studyday://reset-password';

export default function ForgotPasswordScreen() {
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [info, setInfo] = useState('');
  const styles = useMemo(() => createStyles(colors), [colors]);

  const onSend = async () => {
    if (!email.trim()) {
      setError(t('auth.errEmailRequired'));
      return;
    }

    setError('');
    setInfo('');
    setLoading(true);

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: REDIRECT_TO,
    });

    setLoading(false);

    if (resetError) {
      setError(resetError.message);
      return;
    }

    setInfo(t('auth.infoMailSent'));
  };

  return (
    <View style={styles.container}>
      <Text style={styles.title}>{t('auth.forgotTitle')}</Text>
      <Text style={styles.subtitle}>{t('auth.forgotSubtitle')}</Text>

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

      {error ? <Text style={styles.errorText}>{error}</Text> : null}
      {info ? <Text style={styles.infoText}>{info}</Text> : null}

      <TouchableOpacity style={styles.submit} onPress={() => void onSend()} disabled={loading}>
        {loading ? <ActivityIndicator size="small" color="#FFFFFF" /> : <Text style={styles.submitText}>{t('auth.forgotSend')}</Text>}
      </TouchableOpacity>

      <TouchableOpacity style={styles.linkRow} onPress={() => router.back()}>
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
    marginBottom: 10,
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
    lineHeight: 20,
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
