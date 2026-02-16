import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { Image } from 'expo-image';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Linking,
  Share,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { ResourceFileIcon } from '@/components/ui/resource-file-icon';
import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import { resolveResourceIconKind } from '@/lib/resource-icon';
import { getResourceExternalUrl } from '@/lib/resource-open';
import { duplicateResource, fetchResourceById, getCachedResourceById } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';
import type { Resource } from '@/types/supabase';

function getResourceTypeLabel(t: ReturnType<typeof useI18n>['t'], type: Resource['type']) {
  if (type === 'note') return t('resources.filterNote');
  if (type === 'link') return t('resources.filterLink');
  if (type === 'file') return t('resources.filterFile');
  return t('resources.filterAll');
}

export default function ResourceDetailScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { showNotification, addActivityNotification } = useInAppNotification();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resource, setResource] = useState<Resource | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [openingExternal, setOpeningExternal] = useState(false);
  const [copyingLink, setCopyingLink] = useState(false);
  const [duplicating, setDuplicating] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const run = async () => {
      if (!id || !user?.id) {
        setError(t('resourceDetail.notFound'));
        setLoading(false);
        return;
      }

      let cachedResource: Resource | null = null;

      try {
        setLoading(true);
        setError('');

        cachedResource = await getCachedResourceById(user.id, id);
        if (cachedResource) {
          setResource(cachedResource);
          setLoading(false);
        }

        const remoteResource = await fetchResourceById(user.id, id);
        setResource(remoteResource ?? cachedResource);
      } catch (err) {
        if (!cachedResource) {
          setError(getErrorMessage(err, t('resourceDetail.errorLoad')));
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id, t, user?.id]);

  const resourceKind = useMemo(() => (resource ? resolveResourceIconKind(resource) : 'file'), [resource]);
  const externalUrl = useMemo(() => (resource ? getResourceExternalUrl(resource) : null), [resource]);
  const contentValue = resource?.content?.trim() || '';
  const isImage = resourceKind === 'image';

  useEffect(() => {
    setPreviewLoading(Boolean(isImage && externalUrl));
  }, [externalUrl, isImage]);

  const openLabel = useMemo(() => {
    if (resourceKind === 'link') return t('resourceDetail.openLink');
    if (resourceKind === 'image') return t('resourceDetail.openImage');
    return t('resourceDetail.openFile');
  }, [resourceKind, t]);

  const onOpenExternal = async () => {
    if (!externalUrl) {
      Alert.alert(t('common.genericError'), t('resourceDetail.noUrl'));
      return;
    }

    setOpeningExternal(true);
    try {
      await Linking.openURL(externalUrl);
    } catch {
      Alert.alert(t('common.genericError'), t('resourceDetail.openError'));
    } finally {
      setOpeningExternal(false);
    }
  };

  const onShare = async () => {
    if (!resource || !externalUrl) {
      Alert.alert(t('common.genericError'), t('resourceDetail.noUrl'));
      return;
    }

    try {
      await Share.share({
        message: `${resource.title}\n${externalUrl}`,
      });
    } catch {
      Alert.alert(t('common.genericError'), t('resourceDetail.shareError'));
    }
  };

  const onCopyLink = async () => {
    if (!externalUrl || copyingLink) {
      Alert.alert(t('common.genericError'), t('resourceDetail.noUrl'));
      return;
    }

    setCopyingLink(true);
    try {
      await Clipboard.setStringAsync(externalUrl);
      showNotification({
        title: t('resourceDetail.copyLink'),
        message: t('resourceDetail.copyLinkSuccess'),
        variant: 'success',
      });
    } catch {
      showNotification({
        title: t('common.genericError'),
        message: t('resourceDetail.copyLinkError'),
        variant: 'warning',
      });
    } finally {
      setCopyingLink(false);
    }
  };

  const onDuplicate = async () => {
    if (!resource || !user?.id || duplicating) return;

    setDuplicating(true);
    try {
      const createdResource = await duplicateResource({
        userId: user.id,
        source: resource,
        title: t('resourceDetail.duplicateTitle', { title: resource.title }),
      });

      try {
        await addActivityNotification({
          entityType: 'resource',
          entityId: createdResource.id,
          title: t('activityNotifications.resourceCreatedTitle'),
          message: t('activityNotifications.resourceCreatedMessage', { title: createdResource.title }),
        });
      } catch {
        // Keep duplication flow even if notification persistence fails.
      }

      showNotification({
        title: t('activityNotifications.resourceCreatedTitle'),
        message: t('resourceDetail.duplicateSuccess'),
        variant: 'success',
      });
      router.replace(`/resource/${createdResource.id}`);
    } catch {
      showNotification({
        title: t('common.genericError'),
        message: t('resourceDetail.duplicateError'),
        variant: 'warning',
      });
    } finally {
      setDuplicating(false);
    }
  };

  const openAiFeature = (featureId: 'quiz_generator' | 'simplify_document') => {
    if (!resource) return;
    const seed = [resource.title?.trim(), resource.content?.trim(), resource.file_url?.trim()]
      .filter(Boolean)
      .join('\n')
      .slice(0, 900);
    const encodedSeed = encodeURIComponent(seed);
    router.push(`/ai-toolbox?feature=${featureId}&autorun=1&seed=${encodedSeed}`);
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>

        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {!loading && error ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error}
            actionLabel={t('common.back')}
            onActionPress={() => router.back()}
          />
        ) : null}

        {!loading && !error && !resource ? (
          <StateBlock
            variant="empty"
            title={t('resourceDetail.emptyTitle')}
            description={t('resourceDetail.emptyDescription')}
            actionLabel={t('common.back')}
            onActionPress={() => router.back()}
          />
        ) : null}

        {!loading && !error && resource ? (
          <>
            <Text style={styles.title}>{resource.title}</Text>

            <View style={styles.metaCard}>
              <View style={styles.metaHeader}>
                <ResourceFileIcon resource={resource} size={42} />
                <View style={styles.metaHeaderMain}>
                  <Text style={styles.metaMainType}>{getResourceTypeLabel(t, resource.type)}</Text>
                  <Text style={styles.metaSecondaryType}>{resourceKind.toUpperCase()}</Text>
                </View>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('resourceDetail.createdAt')}</Text>
                <Text style={styles.metaValue}>{formatDateLabel(resource.created_at, locale, t('common.noDate'))}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('resourceDetail.tags')}</Text>
                <Text style={styles.metaValue}>
                  {resource.tags?.length ? resource.tags.map((tag) => `#${tag}`).join(' ') : t('resourceDetail.noTags')}
                </Text>
              </View>
            </View>

            {isImage && externalUrl ? (
              <TouchableOpacity style={styles.previewWrap} onPress={() => void onOpenExternal()}>
                <Image
                  source={externalUrl}
                  style={styles.previewImage}
                  contentFit="cover"
                  cachePolicy="none"
                  transition={120}
                  onLoadStart={() => setPreviewLoading(true)}
                  onLoad={() => setPreviewLoading(false)}
                  onError={() => setPreviewLoading(false)}
                />
                {previewLoading ? (
                  <View style={styles.previewLoaderOverlay}>
                    <ActivityIndicator color="#FFFFFF" />
                  </View>
                ) : null}
              </TouchableOpacity>
            ) : null}

            <Text style={styles.sectionTitle}>{t('resourceDetail.content')}</Text>
            <Text style={styles.body}>{contentValue || t('resourceDetail.noContent')}</Text>
            {resource.type === 'link' && externalUrl ? (
              <TouchableOpacity style={styles.linkTextWrap} onPress={() => void onOpenExternal()}>
                <Text style={styles.linkText}>{externalUrl}</Text>
              </TouchableOpacity>
            ) : null}

            {externalUrl ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={[styles.openButton, openingExternal && styles.actionDisabled]}
                  onPress={() => void onOpenExternal()}
                  disabled={openingExternal}>
                  {openingExternal ? (
                    <ActivityIndicator size="small" color="#FFFFFF" />
                  ) : (
                    <>
                      <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                      <Text style={styles.openButtonText}>{openLabel}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shareButton, (openingExternal || duplicating || copyingLink) && styles.actionDisabled]}
                  onPress={() => void onShare()}
                  disabled={openingExternal || duplicating || copyingLink}>
                  <Ionicons name="share-social-outline" size={16} color={colors.text} />
                  <Text style={styles.shareButtonText}>{t('resourceDetail.share')}</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shareButton, (!externalUrl || copyingLink || openingExternal || duplicating) && styles.actionDisabled]}
                  onPress={() => void onCopyLink()}
                  disabled={!externalUrl || copyingLink || openingExternal || duplicating}>
                  {copyingLink ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="copy-outline" size={16} color={colors.text} />
                      <Text style={styles.shareButtonText}>{t('resourceDetail.copyLink')}</Text>
                    </>
                  )}
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.shareButton, (duplicating || openingExternal || copyingLink) && styles.actionDisabled]}
                  onPress={() => void onDuplicate()}
                  disabled={duplicating || openingExternal || copyingLink}>
                  {duplicating ? (
                    <ActivityIndicator size="small" color={colors.text} />
                  ) : (
                    <>
                      <Ionicons name="duplicate-outline" size={16} color={colors.text} />
                      <Text style={styles.shareButtonText}>{t('resourceDetail.duplicate')}</Text>
                    </>
                  )}
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.noUrlText}>{t('resourceDetail.noUrl')}</Text>
            )}

            <TouchableOpacity
              style={styles.editButton}
              onPress={() =>
                router.push(`/resource-editor?resourceId=${resource.id}&returnTo=${encodeURIComponent(`/resource/${resource.id}`)}`)
              }>
              <Text style={styles.editButtonText}>{t('resourceDetail.edit')}</Text>
            </TouchableOpacity>

            <View style={styles.aiRow}>
              <TouchableOpacity style={styles.shareButton} onPress={() => openAiFeature('quiz_generator')}>
                <Ionicons name="help-circle-outline" size={16} color={colors.text} />
                <Text style={styles.shareButtonText}>{t('resourceDetail.aiQuiz')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={styles.shareButton} onPress={() => openAiFeature('simplify_document')}>
                <Ionicons name="sparkles-outline" size={16} color={colors.text} />
                <Text style={styles.shareButtonText}>{t('resourceDetail.aiSimplify')}</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
    page: {
      flex: 1,
      backgroundColor: colors.background,
    },
    content: {
      paddingTop: 56,
      paddingHorizontal: 16,
      paddingBottom: 40,
    },
    backButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.surface,
      marginBottom: 18,
    },
    backLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    loadingWrap: {
      paddingVertical: 20,
    },
    title: {
      fontSize: 28,
      lineHeight: 34,
      color: colors.text,
      fontWeight: '800',
      marginBottom: 14,
    },
    metaCard: {
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 14,
      marginBottom: 16,
      gap: 10,
    },
    metaHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      marginBottom: 6,
    },
    metaHeaderMain: {
      flex: 1,
    },
    metaMainType: {
      color: colors.text,
      fontWeight: '700',
      textTransform: 'capitalize',
    },
    metaSecondaryType: {
      color: colors.textMuted,
      fontWeight: '600',
      marginTop: 2,
      fontSize: 12,
    },
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      gap: 12,
    },
    metaLabel: {
      color: colors.textMuted,
      fontWeight: '600',
    },
    metaValue: {
      flex: 1,
      textAlign: 'right',
      color: colors.text,
      fontWeight: '700',
    },
    previewWrap: {
      borderRadius: 14,
      overflow: 'hidden',
      borderWidth: 1,
      borderColor: colors.border,
      marginBottom: 16,
      backgroundColor: colors.surface,
    },
    previewImage: {
      width: '100%',
      height: 220,
    },
    previewLoaderOverlay: {
      position: 'absolute',
      top: 0,
      right: 0,
      bottom: 0,
      left: 0,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: 'rgba(17, 24, 39, 0.26)',
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 8,
      fontSize: 16,
    },
    body: {
      color: colors.text,
      lineHeight: 22,
      marginBottom: 6,
    },
    linkTextWrap: {
      alignSelf: 'flex-start',
      marginBottom: 10,
    },
    linkText: {
      color: colors.primary,
      textDecorationLine: 'underline',
      fontWeight: '600',
    },
    openButton: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    openButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    actionRow: {
      flexDirection: 'row',
      gap: 8,
      alignItems: 'center',
      marginBottom: 10,
      flexWrap: 'wrap',
    },
    actionDisabled: {
      opacity: 0.7,
    },
    shareButton: {
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    shareButtonText: {
      color: colors.text,
      fontWeight: '700',
    },
    noUrlText: {
      color: colors.textMuted,
      marginBottom: 12,
    },
    editButton: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    editButtonText: {
      color: colors.text,
      fontWeight: '700',
    },
    aiRow: {
      marginTop: 10,
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
  });
