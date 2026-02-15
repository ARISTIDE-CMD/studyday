import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Linking, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { ResourceFileIcon } from '@/components/ui/resource-file-icon';
import { StateBlock } from '@/components/ui/state-block';
import { TabSwipeShell } from '@/components/ui/tab-swipe-shell';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import { getResourceExternalUrl } from '@/lib/resource-open';
import { deleteResource, fetchResources, getCachedResources } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import type { Resource } from '@/types/supabase';

type ResourceFilter = 'tout' | 'note' | 'link' | 'file';

function SwipeAction({ label, color }: { label: string; color: string }) {
  return (
    <View style={[swipeStyles.action, { backgroundColor: color }]}>
      <Text style={swipeStyles.actionText}>{label}</Text>
    </View>
  );
}

export default function ResourcesScreen() {
  const { user } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ResourceFilter>('tout');
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);
  const [selectedResourceIds, setSelectedResourceIds] = useState<string[]>([]);

  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const loadResources = useCallback(async () => {
    if (!user?.id) return;

    let hasCachedData = false;

    try {
      setLoading(true);
      setError('');

      const cached = await getCachedResources(user.id);
      hasCachedData = cached.length > 0;
      if (hasCachedData) {
        setResources(cached);
        setLoading(false);
      }

      const data = await fetchResources(user.id);
      setResources(data);
    } catch (err) {
      if (!hasCachedData) {
        const message = getErrorMessage(err, t('resources.loadError'));
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadResources();
    }, [loadResources])
  );

  useEffect(() => {
    setSelectedResourceIds((prev) => prev.filter((resourceId) => resources.some((resource) => resource.id === resourceId)));
  }, [resources]);

  const filtered = useMemo(() => {
    let data = [...resources];

    if (filter !== 'tout') {
      data = data.filter((resource) => resource.type === filter);
    }

    if (query.trim()) {
      const normalized = query.toLowerCase();
      data = data.filter((resource) => resource.title.toLowerCase().includes(normalized));
    }

    return data;
  }, [filter, query, resources]);

  const effectiveState = loading ? 'loading' : error ? 'error' : resources.length === 0 ? 'empty' : 'auto';
  const isSelectionMode = selectedResourceIds.length > 0;

  const startSelection = (resourceId: string) => {
    setSelectedResourceIds((prev) => (prev.includes(resourceId) ? prev : [...prev, resourceId]));
  };

  const toggleSelection = (resourceId: string) => {
    setSelectedResourceIds((prev) =>
      prev.includes(resourceId) ? prev.filter((id) => id !== resourceId) : [...prev, resourceId]
    );
  };

  const clearSelection = () => {
    setSelectedResourceIds([]);
  };

  const removeResources = async (resourceIds: string[]) => {
    if (!user?.id) return;
    if (resourceIds.length === 0) return;

    const previous = resources;
    setResources((prev) => prev.filter((resource) => !resourceIds.includes(resource.id)));
    setSelectedResourceIds((prev) => prev.filter((id) => !resourceIds.includes(id)));

    try {
      await Promise.all(resourceIds.map((resourceId) => deleteResource(resourceId, user.id)));
    } catch {
      setResources(previous);
      Alert.alert(t('common.networkErrorTitle'), t('resources.deleteError'));
    }
  };

  const openExternalLink = async (url: string) => {
    try {
      await Linking.openURL(url);
    } catch {
      Alert.alert(t('common.genericError'), t('resourceDetail.openError'));
    }
  };

  const openSelectedResourceEditor = () => {
    if (selectedResourceIds.length !== 1) return;
    const [resourceId] = selectedResourceIds;
    clearSelection();
    router.push(`/resource-editor?resourceId=${resourceId}`);
  };

  const filterLabels: { key: ResourceFilter; label: string }[] = [
    { key: 'tout', label: t('resources.filterAll') },
    { key: 'note', label: t('resources.filterNote') },
    { key: 'link', label: t('resources.filterLink') },
    { key: 'file', label: t('resources.filterFile') },
  ];

  return (
    <TabSwipeShell tab="resources">
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <Text style={styles.title}>{t('resources.title')}</Text>
          <TouchableOpacity style={styles.addBtn} onPress={() => router.push('/resource-editor')}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchRow}>
          <Ionicons name="search-outline" size={18} color={colors.textMuted} />
          <TextInput
            style={styles.searchInput}
            placeholder={t('common.searchResource')}
            placeholderTextColor={colors.textMuted}
            value={query}
            onChangeText={setQuery}
          />
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filtersRow}>
          {filterLabels.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[styles.filterChip, filter === item.key && styles.filterChipActive]}
              onPress={() => setFilter(item.key)}>
              <Text style={[styles.filterText, filter === item.key && styles.filterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        {isSelectionMode ? (
          <View style={styles.selectionBar}>
            <Text style={styles.selectionLabel}>
              {t('common.selectedCount', { count: selectedResourceIds.length })}
            </Text>
            <View style={styles.selectionActions}>
              <TouchableOpacity
                style={[
                  styles.selectionBtn,
                  selectedResourceIds.length !== 1 && styles.selectionBtnDisabled,
                ]}
                disabled={selectedResourceIds.length !== 1}
                onPress={openSelectedResourceEditor}>
                <Text style={styles.selectionBtnText}>{t('resources.edit')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[styles.selectionBtn, styles.selectionBtnDanger]}
                onPress={() => void removeResources(selectedResourceIds)}>
                <Text style={styles.selectionBtnText}>{t('resources.delete')}</Text>
              </TouchableOpacity>

              <TouchableOpacity style={[styles.selectionBtn, styles.selectionBtnGhost]} onPress={clearSelection}>
                <Text style={styles.selectionGhostBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {effectiveState === 'loading' ? (
          <View style={styles.stackGap}>
            {[1, 2, 3].map((placeholder) => (
              <View key={placeholder} style={styles.skeletonCard} />
            ))}
          </View>
        ) : null}

        {effectiveState === 'empty' ? (
          <StateBlock
            variant="empty"
            title={t('resources.emptyTitle')}
            description={t('resources.emptyDescription')}
            actionLabel={t('common.add')}
            onActionPress={() => router.push('/resource-editor')}
          />
        ) : null}

        {effectiveState === 'error' ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error || t('resources.loadError')}
            actionLabel={t('common.retry')}
            onActionPress={() => void loadResources()}
          />
        ) : null}

        {effectiveState === 'auto' ? (
          <View style={styles.stackGap}>
            {filtered.length === 0 ? (
              <StateBlock
                variant="empty"
                title={t('resources.emptySearchTitle')}
                description={t('resources.emptySearchDescription')}
              />
            ) : (
              filtered.map((resource) => {
                const selected = selectedResourceIds.includes(resource.id);
                const linkUrl = resource.type === 'link' ? getResourceExternalUrl(resource) : null;

                const card = (
                  <TouchableOpacity
                    key={resource.id}
                    style={[styles.card, selected && styles.cardSelected]}
                    activeOpacity={0.85}
                    delayLongPress={250}
                    onLongPress={() => startSelection(resource.id)}
                    onPress={() => {
                      if (isSelectionMode) {
                        toggleSelection(resource.id);
                        return;
                      }
                      router.push(`/resource/${resource.id}`);
                    }}>
                    {isSelectionMode ? (
                      <TouchableOpacity
                        style={[styles.selectionDot, selected && styles.selectionDotActive]}
                        onPress={() => toggleSelection(resource.id)}>
                        {selected ? <Ionicons name="checkmark" size={12} color="#FFFFFF" /> : null}
                      </TouchableOpacity>
                    ) : null}

                    <ResourceFileIcon resource={resource} size={36} style={styles.iconWrap} />

                    <View style={styles.cardMain}>
                      <Text style={styles.resourceTitle}>{resource.title}</Text>
                      <Text style={styles.resourceMeta}>
                        {t('resources.addedOn', {
                          date: formatDateLabel(resource.created_at, locale, t('common.noDate')),
                        })}
                      </Text>
                      {linkUrl ? (
                        <TouchableOpacity
                          style={styles.linkPreviewWrap}
                          onPress={() => {
                            if (isSelectionMode) {
                              toggleSelection(resource.id);
                              return;
                            }
                            void openExternalLink(linkUrl);
                          }}>
                          <Text style={styles.linkPreviewText} numberOfLines={1}>
                            {linkUrl}
                          </Text>
                        </TouchableOpacity>
                      ) : null}
                      <View style={styles.tagsRow}>
                        {(resource.tags ?? []).map((tag) => (
                          <View key={tag} style={styles.tag}>
                            <Text style={styles.tagText}>#{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>
                  </TouchableOpacity>
                );

                if (isSelectionMode) return card;

                return (
                  <Swipeable
                    key={resource.id}
                    renderLeftActions={() => <SwipeAction label={t('resources.edit')} color={colors.success} />}
                    onSwipeableLeftOpen={() => router.push(`/resource-editor?resourceId=${resource.id}`)}
                    renderRightActions={() => <SwipeAction label={t('resources.delete')} color={colors.danger} />}
                    onSwipeableRightOpen={() => void removeResources([resource.id])}>
                    {card}
                  </Swipeable>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
    </TabSwipeShell>
  );
}

const swipeStyles = StyleSheet.create({
  action: {
    width: 92,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  actionText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 12,
  },
});

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
      paddingTop: 56,
      paddingHorizontal: 16,
      paddingBottom: 110,
    },
    header: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 14,
    },
    title: {
      fontSize: 28,
      fontWeight: '800',
      color: colors.text,
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    searchRow: {
      height: 48,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      flexDirection: 'row',
      alignItems: 'center',
      marginBottom: 10,
      gap: 8,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
    },
    filtersRow: {
      gap: 8,
      marginBottom: 14,
    },
    selectionBar: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      backgroundColor: colors.surface,
      padding: 10,
      marginBottom: 12,
      gap: 10,
    },
    selectionLabel: {
      color: colors.text,
      fontWeight: '700',
    },
    selectionActions: {
      flexDirection: 'row',
      gap: 8,
    },
    selectionBtn: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    selectionBtnDanger: {
      backgroundColor: colors.danger,
    },
    selectionBtnGhost: {
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    selectionBtnDisabled: {
      opacity: 0.45,
    },
    selectionBtnText: {
      color: '#FFFFFF',
      fontWeight: '700',
      fontSize: 12,
    },
    selectionGhostBtnText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    filterChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      color: colors.textMuted,
      fontWeight: '600',
      textTransform: 'capitalize',
    },
    filterTextActive: {
      color: '#FFFFFF',
    },
    stackGap: {
      gap: 10,
    },
    skeletonCard: {
      height: 90,
      borderRadius: 14,
      backgroundColor: colors.border,
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 12,
      flexDirection: 'row',
      alignItems: 'flex-start',
      gap: 10,
      ...cardShadow,
    },
    cardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    selectionDot: {
      width: 22,
      height: 22,
      borderRadius: 11,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 6,
    },
    selectionDotActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    iconWrap: {
      width: 36,
      height: 36,
      borderRadius: 10,
      alignItems: 'center',
      justifyContent: 'center',
      marginTop: 2,
    },
    cardMain: {
      flex: 1,
    },
    resourceTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 4,
    },
    resourceMeta: {
      color: colors.textMuted,
      fontSize: 12,
      marginBottom: 6,
    },
    linkPreviewWrap: {
      alignSelf: 'flex-start',
      marginBottom: 8,
      paddingVertical: 2,
    },
    linkPreviewText: {
      color: colors.primary,
      textDecorationLine: 'underline',
      fontSize: 12,
      fontWeight: '600',
      maxWidth: '96%',
    },
    tagsRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 6,
    },
    tag: {
      borderRadius: 999,
      paddingHorizontal: 8,
      paddingVertical: 3,
      backgroundColor: colors.primarySoft,
    },
    tagText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '600',
    },
  });
