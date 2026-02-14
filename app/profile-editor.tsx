import { Ionicons } from '@expo/vector-icons';
import { Image } from 'expo-image';
import { router } from 'expo-router';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Toast } from '@/components/ui/toast';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { supabase } from '@/lib/supabase';
import { isSupabaseBucketPublicUrl, uploadRemoteAssetToBucket } from '@/lib/supabase-storage-api';
import { useAuth } from '@/providers/auth-provider';

function normalize(value: string): string {
  return value.trim();
}

function extractFirstName(email: string | null | undefined, fallback: string): string {
  return email?.split('@')[0]?.trim() || fallback;
}

export default function ProfileEditorScreen() {
  const { user, profile, refreshProfile } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();

  const initialName = useMemo(() => {
    const nameFromProfile = profile?.full_name?.trim();
    if (nameFromProfile) return nameFromProfile;

    const nameFromMetadata =
      typeof user?.user_metadata?.full_name === 'string' ? user.user_metadata.full_name.trim() : '';
    if (nameFromMetadata) return nameFromMetadata;

    return extractFirstName(user?.email, t('profileEditor.fallbackName'));
  }, [profile?.full_name, t, user?.email, user?.user_metadata?.full_name]);

  const initialAvatar = useMemo(() => {
    return profile?.avatar_url?.trim()
      || (typeof user?.user_metadata?.avatar_url === 'string' ? user.user_metadata.avatar_url.trim() : '');
  }, [profile?.avatar_url, user?.user_metadata?.avatar_url]);

  const [fullName, setFullName] = useState(initialName);
  const [avatarUrl, setAvatarUrl] = useState(initialAvatar);
  const [imageError, setImageError] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);
  const [showToast, setShowToast] = useState(false);
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const hasAvatar = !!normalize(avatarUrl) && !imageError;

  const onUploadAvatar = async () => {
    if (!user?.id) return;

    const source = normalize(avatarUrl);
    if (!source) {
      setError(t('profileEditor.emptyAvatarUrl'));
      return;
    }

    setError('');
    setAvatarUploading(true);

    try {
      const uploadedUrl = isSupabaseBucketPublicUrl(source, 'images')
        ? source
        : await uploadRemoteAssetToBucket({
            bucket: 'images',
            sourceUrl: source,
            userId: user.id,
            folder: 'avatars',
          });

      setAvatarUrl(uploadedUrl);
      setImageError(false);

      const { error: authError } = await supabase.auth.updateUser({
        data: {
          avatar_url: uploadedUrl,
        },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, avatar_url: uploadedUrl }, { onConflict: 'id' });
      if (profileError) throw profileError;

      await refreshProfile();
    } catch (err) {
      setError(getErrorMessage(err, t('profileEditor.uploadError')));
    } finally {
      setAvatarUploading(false);
    }
  };

  const onSave = async () => {
    if (!user?.id) return;

    const nextName = normalize(fullName) || extractFirstName(user.email, t('profileEditor.fallbackName'));
    const nextAvatarUrl = normalize(avatarUrl);

    if (nextAvatarUrl && !/^https?:\/\//i.test(nextAvatarUrl)) {
      setError(t('profileEditor.invalidAvatarUrl'));
      return;
    }

    setLoading(true);
    setError('');

    try {
      const { error: authError } = await supabase.auth.updateUser({
        data: {
          full_name: nextName,
          avatar_url: nextAvatarUrl || null,
        },
      });
      if (authError) throw authError;

      const { error: profileError } = await supabase
        .from('profiles')
        .upsert({ id: user.id, full_name: nextName, avatar_url: nextAvatarUrl || null }, { onConflict: 'id' });
      if (profileError) throw profileError;

      await refreshProfile();
      setShowToast(true);

      setTimeout(() => {
        setShowToast(false);
        router.back();
      }, 900);
    } catch (err) {
      setError(getErrorMessage(err, t('profileEditor.saveError')));
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{t('profileEditor.title')}</Text>
          <View style={styles.iconBtn} />
        </View>

        <View style={styles.previewCard}>
          <View style={styles.avatarWrap}>
            {hasAvatar ? (
            <Image
              source={normalize(avatarUrl)}
              style={styles.avatarImage}
              contentFit="cover"
              onError={() => setImageError(true)}
            />
          ) : (
              <Ionicons name="person" size={28} color={colors.primary} />
          )}
          </View>
          <Text style={styles.previewName}>{normalize(fullName) || t('profileEditor.fallbackName')}</Text>
        </View>

        <Text style={styles.label}>{t('profileEditor.fieldFullName')}</Text>
        <TextInput
          style={styles.input}
          value={fullName}
          onChangeText={setFullName}
          placeholder={t('profileEditor.fullNamePlaceholder')}
          placeholderTextColor="#94A3B8"
        />

        <Text style={styles.label}>{t('profileEditor.fieldAvatarUrl')}</Text>
        <TextInput
          style={styles.input}
          value={avatarUrl}
          onChangeText={(value) => {
            setAvatarUrl(value);
            setImageError(false);
          }}
          placeholder={t('profileEditor.avatarPlaceholder')}
          autoCapitalize="none"
          placeholderTextColor="#94A3B8"
        />
        <TouchableOpacity
          style={[styles.uploadBtn, avatarUploading && styles.saveBtnDisabled]}
          onPress={() => void onUploadAvatar()}
          disabled={avatarUploading}>
          {avatarUploading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.uploadBtnText}>{t('profileEditor.uploadAvatarButton')}</Text>
          )}
        </TouchableOpacity>
        <Text style={styles.helper}>{t('profileEditor.avatarHelp')}</Text>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <TouchableOpacity style={[styles.saveBtn, loading && styles.saveBtnDisabled]} onPress={() => void onSave()} disabled={loading}>
          {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>{t('common.save')}</Text>}
        </TouchableOpacity>
      </ScrollView>

      {showToast ? <Toast message={t('profileEditor.saveSuccess')} /> : null}
    </KeyboardAvoidingView>
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
  },
  content: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 120,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 18,
  },
  iconBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: 20,
    fontWeight: '800',
    color: colors.text,
  },
  previewCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    alignItems: 'center',
    paddingVertical: 18,
    marginBottom: 14,
    ...cardShadow,
  },
  avatarWrap: {
    width: 78,
    height: 78,
    borderRadius: 39,
    backgroundColor: colors.primarySoft,
    justifyContent: 'center',
    alignItems: 'center',
    overflow: 'hidden',
  },
  avatarImage: {
    width: '100%',
    height: '100%',
  },
  previewName: {
    marginTop: 10,
    fontSize: 17,
    fontWeight: '700',
    color: colors.text,
  },
  label: {
    fontWeight: '700',
    color: colors.text,
    marginBottom: 8,
    marginTop: 10,
  },
  input: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 50,
    paddingHorizontal: 14,
    color: colors.text,
  },
  helper: {
    marginTop: 6,
    color: colors.textMuted,
    fontSize: 12,
  },
  errorText: {
    color: colors.danger,
    marginTop: 12,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 26,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.55,
  },
  uploadBtn: {
    marginTop: 10,
    height: 44,
    borderRadius: 10,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  uploadBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
