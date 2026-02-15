import { Ionicons } from '@expo/vector-icons';
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
import { fetchResourceById, getCachedResourceById } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
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
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [resource, setResource] = useState<Resource | null>(null);
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

    try {
      await Linking.openURL(externalUrl);
    } catch {
      Alert.alert(t('common.genericError'), t('resourceDetail.openError'));
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
                <Image source={externalUrl} style={styles.previewImage} contentFit="cover" />
              </TouchableOpacity>
            ) : null}

            <Text style={styles.sectionTitle}>{t('resourceDetail.content')}</Text>
            <Text style={styles.body}>{contentValue || t('resourceDetail.noContent')}</Text>

            {externalUrl ? (
              <View style={styles.actionRow}>
                <TouchableOpacity style={styles.openButton} onPress={() => void onOpenExternal()}>
                  <Ionicons name="open-outline" size={16} color="#FFFFFF" />
                  <Text style={styles.openButtonText}>{openLabel}</Text>
                </TouchableOpacity>

                <TouchableOpacity style={styles.shareButton} onPress={() => void onShare()}>
                  <Ionicons name="share-social-outline" size={16} color={colors.text} />
                  <Text style={styles.shareButtonText}>{t('resourceDetail.share')}</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <Text style={styles.noUrlText}>{t('resourceDetail.noUrl')}</Text>
            )}

            <TouchableOpacity
              style={styles.editButton}
              onPress={() => router.push(`/resource-editor?resourceId=${resource.id}`)}>
              <Text style={styles.editButtonText}>{t('resourceDetail.edit')}</Text>
            </TouchableOpacity>
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
    sectionTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 8,
      fontSize: 16,
    },
    body: {
      color: colors.text,
      lineHeight: 22,
      marginBottom: 14,
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
  });
