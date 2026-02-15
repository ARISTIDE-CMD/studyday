import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import * as DocumentPicker from 'expo-document-picker';
import * as Print from 'expo-print';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  Share,
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
  getCachedResourceById,
  updateResource,
} from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';

const types = ['note', 'link', 'file'] as const;
type ResourceType = (typeof types)[number];

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function buildPrintableHtml(title: string, text: string) {
  return `<!doctype html>
  <html>
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <style>
        body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; padding: 28px; color: #111827; }
        h1 { font-size: 24px; margin-bottom: 14px; }
        pre { white-space: pre-wrap; word-break: break-word; line-height: 1.55; font-size: 14px; }
      </style>
    </head>
    <body>
      <h1>${escapeHtml(title || 'Resource')}</h1>
      <pre>${escapeHtml(text)}</pre>
    </body>
  </html>`;
}

export default function ResourceEditorScreen() {
  const { user } = useAuth();
  const { addActivityNotification } = useInAppNotification();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
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
  const [toastMessage, setToastMessage] = useState('');
  const [undoStack, setUndoStack] = useState<string[]>([]);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    return () => {
      if (toastTimer.current) clearTimeout(toastTimer.current);
    };
  }, []);

  const pushToast = (message: string, duration = 1100) => {
    if (toastTimer.current) clearTimeout(toastTimer.current);
    setToastMessage(message);
    toastTimer.current = setTimeout(() => setToastMessage(''), duration);
  };

  const updateContentWithHistory = (nextValue: string) => {
    if (nextValue === content) return;
    setUndoStack((prev) => [...prev.slice(-24), content]);
    setContent(nextValue);
  };

  useEffect(() => {
    const run = async () => {
      if (!resourceId || !user?.id) return;

      const applyResource = (data: {
        title: string;
        type: ResourceType | null;
        content: string | null;
        file_url: string | null;
        tags: string[] | null;
      }) => {
        setTitle(data.title);
        if (data.type === 'note' || data.type === 'link' || data.type === 'file') {
          setType(data.type);
        }
        setContent(data.content ?? '');
        setUndoStack([]);
        setFileUrl(data.file_url ?? '');
        setTags((data.tags ?? []).join(', '));
      };

      try {
        setScreenLoading(true);
        const cached = await getCachedResourceById(user.id, resourceId);
        if (cached) {
          applyResource(cached);
          setScreenLoading(false);
        }

        const data = await fetchResourceById(user.id, resourceId);
        if (!data) return;

        applyResource(data);
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
        const createdResource = await createResource({
          userId: user.id,
          title: title.trim(),
          type,
          content,
          fileUrl,
          tags: parsedTags,
        });
        try {
          await addActivityNotification({
            entityType: 'resource',
            entityId: createdResource.id,
            title: t('activityNotifications.resourceCreatedTitle'),
            message: t('activityNotifications.resourceCreatedMessage', { title: createdResource.title }),
          });
        } catch {
          // Keep local-first resource creation behavior even if notification persistence fails.
        }
      }

      pushToast(t('resourceEditor.saveSuccess'), 900);
      setTimeout(() => {
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

  const onUndoContent = () => {
    setUndoStack((prev) => {
      if (prev.length === 0) return prev;
      const last = prev[prev.length - 1];
      setContent(last);
      return prev.slice(0, -1);
    });
  };

  const onInsertBullet = () => {
    const next = content.trim().length === 0
      ? '• '
      : `${content}${content.endsWith('\n') ? '' : '\n'}• `;
    updateContentWithHistory(next);
  };

  const onInsertNumbered = () => {
    const lines = content
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    const nextIndex = Math.max(1, lines.filter((line) => /^\d+\.\s/.test(line)).length + 1);
    const next = content.trim().length === 0
      ? `${nextIndex}. `
      : `${content}${content.endsWith('\n') ? '' : '\n'}${nextIndex}. `;
    updateContentWithHistory(next);
  };

  const onInsertQuote = () => {
    const next = content.trim().length === 0
      ? '> '
      : `${content}${content.endsWith('\n') ? '' : '\n'}> `;
    updateContentWithHistory(next);
  };

  const onInsertDate = () => {
    const stamp = new Intl.DateTimeFormat(locale, {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date());
    const next = content.trim().length === 0
      ? stamp
      : `${content}${content.endsWith('\n') ? '' : '\n'}${stamp}`;
    updateContentWithHistory(next);
  };

  const onClearContent = () => {
    if (!content.trim()) return;
    updateContentWithHistory('');
    pushToast(t('resourceEditor.clearSuccess'));
  };

  const onCopyAll = async () => {
    const text = content.trim();
    if (!text) {
      setError(t('resourceEditor.emptyText'));
      return;
    }

    if (typeof Clipboard.setStringAsync !== 'function') {
      setError(t('resourceEditor.copyUnavailable'));
      return;
    }

    try {
      setError('');
      await Clipboard.setStringAsync(content);
      pushToast(t('resourceEditor.copySuccess'));
    } catch {
      setError(t('resourceEditor.copyUnavailable'));
    }
  };

  const onPrintText = async () => {
    const text = content.trim();
    if (!text) {
      setError(t('resourceEditor.emptyText'));
      return;
    }

    const printableTitle = title.trim() || t('resourceEditor.createTitle');

    try {
      setError('');
      if (typeof Print.printAsync === 'function') {
        await Print.printAsync({ html: buildPrintableHtml(printableTitle, content) });
        pushToast(t('resourceEditor.printSuccess'));
        return;
      }

      await Share.share({
        title: printableTitle,
        message: `${printableTitle}\n\n${content}`,
      });
      pushToast(t('resourceEditor.printFallback'));
    } catch {
      Alert.alert(t('common.genericError'), t('resourceEditor.printFallback'));
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
              <View style={styles.editorCard}>
                <View style={styles.editorToolsHead}>
                  <Text style={styles.editorToolsLabel}>{t('resourceEditor.toolsLabel')}</Text>
                  <Text style={styles.editorStats}>
                    {t('resourceEditor.characters', { count: content.length })}
                    {' · '}
                    {t('resourceEditor.words', { count: content.trim() ? content.trim().split(/\s+/).length : 0 })}
                  </Text>
                </View>

                <View style={styles.editorToolsRow}>
                  <TouchableOpacity style={styles.editorToolBtn} onPress={() => void onCopyAll()}>
                    <Ionicons name="copy-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.copyAllButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={() => void onPrintText()}>
                    <Ionicons name="print-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.printButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={onUndoContent} disabled={undoStack.length === 0}>
                    <Ionicons name="arrow-undo-outline" size={14} color={undoStack.length ? colors.text : colors.textMuted} />
                    <Text style={[styles.editorToolText, !undoStack.length && styles.editorToolTextDisabled]}>
                      {t('resourceEditor.undoButton')}
                    </Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.editorToolsRow}>
                  <TouchableOpacity style={styles.editorToolBtn} onPress={onInsertBullet}>
                    <Ionicons name="list-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.bulletButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={onInsertNumbered}>
                    <Ionicons name="reorder-three-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.numberedButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={onInsertQuote}>
                    <Ionicons name="chatbox-ellipses-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.quoteButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={onInsertDate}>
                    <Ionicons name="time-outline" size={14} color={colors.text} />
                    <Text style={styles.editorToolText}>{t('resourceEditor.dateButton')}</Text>
                  </TouchableOpacity>

                  <TouchableOpacity style={styles.editorToolBtn} onPress={onClearContent}>
                    <Ionicons name="trash-outline" size={14} color={colors.danger} />
                    <Text style={[styles.editorToolText, { color: colors.danger }]}>{t('resourceEditor.clearButton')}</Text>
                  </TouchableOpacity>
                </View>

                <TextInput
                  style={[styles.input, styles.textArea, styles.editorInput]}
                  value={content}
                  onChangeText={updateContentWithHistory}
                  placeholder={type === 'link' ? t('resourceEditor.linkPlaceholder') : t('resourceEditor.notePlaceholder')}
                  placeholderTextColor="#94A3B8"
                  multiline
                  textAlignVertical="top"
                />
              </View>
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

      {toastMessage ? <Toast message={toastMessage} /> : null}
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
    minHeight: 220,
    paddingTop: 12,
  },
  editorCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 10,
  },
  editorToolsHead: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  editorToolsLabel: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
  },
  editorStats: {
    color: colors.textMuted,
    fontSize: 11,
  },
  editorToolsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 8,
  },
  editorToolBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.background,
    paddingHorizontal: 10,
    paddingVertical: 7,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  editorToolText: {
    color: colors.text,
    fontWeight: '600',
    fontSize: 12,
  },
  editorToolTextDisabled: {
    color: colors.textMuted,
  },
  editorInput: {
    marginTop: 2,
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
