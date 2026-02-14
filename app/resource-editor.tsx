import { Ionicons } from '@expo/vector-icons';
import * as DocumentPicker from 'expo-document-picker';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
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
import {
  isSupabaseBucketPublicUrl,
  uploadLocalAssetToBucket,
  uploadRemoteAssetToBucket,
} from '@/lib/supabase-storage-api';
import {
  createResource,
  fetchResourceById,
  updateResource,
} from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';

const types = ['note', 'link', 'file'] as const;
type ResourceType = (typeof types)[number];

export default function ResourceEditorScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const { resourceId } = useLocalSearchParams<{ resourceId?: string }>();

  const [title, setTitle] = useState('');
  const [type, setType] = useState<ResourceType>('note');
  const [content, setContent] = useState('');
  const [fileUrl, setFileUrl] = useState('');
  const [tags, setTags] = useState('revision, examen');
  const [screenLoading, setScreenLoading] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fileUploading, setFileUploading] = useState(false);
  const [filePicking, setFilePicking] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const run = async () => {
      if (!resourceId || !user?.id) return;

      try {
        setScreenLoading(true);
        const data = await fetchResourceById(user.id, resourceId);
        if (!data) return;

        setTitle(data.title);
        if (data.type === 'note' || data.type === 'link' || data.type === 'file') {
          setType(data.type);
        }
        setContent(data.content ?? '');
        setFileUrl(data.file_url ?? '');
        setTags((data.tags ?? []).join(', '));
      } finally {
        setScreenLoading(false);
      }
    };

    void run();
  }, [resourceId, user?.id]);

  const parsedTags = tags
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);

  const onSave = async () => {
    if (!user?.id) return;
    if (!title.trim()) {
      setError(t('resourceEditor.requiredTitle'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (resourceId) {
        await updateResource(resourceId, user.id, {
          title: title.trim(),
          type,
          content: content.trim() || null,
          file_url: fileUrl.trim() || null,
          tags: parsedTags,
        });
      } else {
        await createResource({
          userId: user.id,
          title: title.trim(),
          type,
          content,
          fileUrl,
          tags: parsedTags,
        });
      }

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        router.back();
      }, 900);
    } catch (err) {
      const message = getErrorMessage(err, t('resourceEditor.saveError'));
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  const onUploadFile = async () => {
    if (!user?.id) return;
    const source = fileUrl.trim();

    if (!source) {
      setError(t('resourceEditor.emptyFileUrl'));
      return;
    }

    setError('');
    setFileUploading(true);

    try {
      const uploadedUrl = isSupabaseBucketPublicUrl(source, 'files')
        ? source
        : await uploadRemoteAssetToBucket({
            bucket: 'files',
            sourceUrl: source,
            userId: user.id,
            folder: 'resources',
          });
      setFileUrl(uploadedUrl);
    } catch (err) {
      setError(getErrorMessage(err, t('resourceEditor.uploadError')));
    } finally {
      setFileUploading(false);
    }
  };

  const onPickFileFromPhone = async () => {
    if (!user?.id) return;

    setError('');
    setFilePicking(true);

    try {
      const result = await DocumentPicker.getDocumentAsync({
        multiple: false,
        copyToCacheDirectory: true,
        type: '*/*',
      });
      if (result.canceled || !result.assets.length) return;

      const asset = result.assets[0];
      const uploadedUrl = await uploadLocalAssetToBucket({
        bucket: 'files',
        fileUri: asset.uri,
        userId: user.id,
        folder: 'resources',
        fileName: asset.name,
        contentType: asset.mimeType ?? null,
      });

      setFileUrl(uploadedUrl);
      if (!title.trim()) {
        setTitle(asset.name.replace(/\.[^./\\]+$/, ''));
      }
    } catch (err) {
      setError(getErrorMessage(err, t('resourceEditor.uploadError')));
    } finally {
      setFilePicking(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{resourceId ? t('resourceEditor.editTitle') : t('resourceEditor.createTitle')}</Text>
          <View style={styles.iconBtn} />
        </View>

        {screenLoading ? (
          <View style={styles.screenLoadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <Text style={styles.label}>{t('resourceEditor.fieldTitle')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('resourceEditor.titlePlaceholder')}
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>{t('resourceEditor.fieldType')}</Text>
            <View style={styles.typeRow}>
              {types.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.typeChip, type === item && styles.typeChipActive]}
                  onPress={() => setType(item)}>
                  <Text style={[styles.typeText, type === item && styles.typeTextActive]}>
                    {t(`resources.filter${item.charAt(0).toUpperCase()}${item.slice(1)}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.label}>{type === 'file' ? t('resourceEditor.fileUrlLabel') : t('resourceEditor.contentLabel')}</Text>
            {type === 'file' ? (
              <>
                <TouchableOpacity
                  style={[styles.pickBtn, (filePicking || fileUploading) && styles.saveBtnDisabled]}
                  onPress={() => void onPickFileFromPhone()}
                  disabled={filePicking || fileUploading}>
                  {filePicking ? (
                    <ActivityIndicator color={colors.primary} />
                  ) : (
                    <Text style={styles.pickBtnText}>{t('resourceEditor.pickFileButton')}</Text>
                  )}
                </TouchableOpacity>
                <TextInput
                  style={styles.input}
                  value={fileUrl}
                  onChangeText={setFileUrl}
                  placeholder={t('resourceEditor.fileUrlPlaceholder')}
                  placeholderTextColor="#94A3B8"
                />
                <TouchableOpacity
                  style={[styles.uploadBtn, (fileUploading || filePicking) && styles.saveBtnDisabled]}
                  onPress={() => void onUploadFile()}
                  disabled={fileUploading || filePicking}>
                  {fileUploading ? (
                    <ActivityIndicator color="#FFFFFF" />
                  ) : (
                    <Text style={styles.uploadBtnText}>{t('resourceEditor.uploadFileButton')}</Text>
                  )}
                </TouchableOpacity>
              </>
            ) : (
              <TextInput
                style={[styles.input, styles.textArea]}
                value={content}
                onChangeText={setContent}
                placeholder={type === 'link' ? t('resourceEditor.linkPlaceholder') : t('resourceEditor.notePlaceholder')}
                placeholderTextColor="#94A3B8"
                multiline
                textAlignVertical="top"
              />
            )}

            <Text style={styles.label}>{t('resourceEditor.fieldTags')}</Text>
            <TextInput
              style={styles.input}
              value={tags}
              onChangeText={setTags}
              placeholder={t('resourceEditor.tagsPlaceholder')}
              placeholderTextColor="#94A3B8"
            />

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, (!title.trim() || loading) && styles.saveBtnDisabled]}
              onPress={() => void onSave()}
              disabled={!title.trim() || loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>{t('common.add')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {showToast ? <Toast message={t('resourceEditor.saveSuccess')} /> : null}
    </KeyboardAvoidingView>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
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
  screenLoadingWrap: {
    paddingVertical: 20,
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
    justifyContent: 'center',
  },
  textArea: {
    minHeight: 110,
    paddingTop: 12,
  },
  typeRow: {
    flexDirection: 'row',
    gap: 8,
  },
  typeChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  typeChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  typeText: {
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  typeTextActive: {
    color: colors.primary,
  },
  errorText: {
    color: colors.danger,
    marginTop: 12,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 24,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.45,
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
  pickBtn: {
    marginBottom: 10,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    justifyContent: 'center',
    alignItems: 'center',
  },
  pickBtnText: {
    color: colors.text,
    fontWeight: '700',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
