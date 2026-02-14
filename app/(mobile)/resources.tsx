import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel } from '@/lib/format';
import { deleteResource, fetchResources } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import type { Resource } from '@/types/supabase';

type ViewState = 'auto' | 'loading' | 'empty' | 'error';
type ResourceFilter = 'tout' | 'note' | 'link' | 'file';

const typeMeta = {
  note: { icon: 'document-text-outline' as const },
  link: { icon: 'link-outline' as const },
  file: { icon: 'document-outline' as const },
};

export default function ResourcesScreen() {
  const { user } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [stateOverride, setStateOverride] = useState<ViewState>('auto');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<ResourceFilter>('tout');
  const [query, setQuery] = useState('');
  const [resources, setResources] = useState<Resource[]>([]);

  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const loadResources = useCallback(async () => {
    if (!user?.id) return;

    try {
      setLoading(true);
      setError('');
      const data = await fetchResources(user.id);
      setResources(data);
    } catch (err) {
      const message = getErrorMessage(err, t('resources.loadError'));
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadResources();
    }, [loadResources])
  );

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

  const effectiveState = (() => {
    if (stateOverride !== 'auto') return stateOverride;
    if (loading) return 'loading';
    if (error) return 'error';
    if (!resources.length) return 'empty';
    return 'auto';
  })();

  const removeResource = async (resourceId: string) => {
    if (!user?.id) return;

    const previous = resources;
    setResources((prev) => prev.filter((resource) => resource.id !== resourceId));

    try {
      await deleteResource(resourceId, user.id);
    } catch {
      setResources(previous);
      Alert.alert(t('common.networkErrorTitle'), t('resources.deleteError'));
    }
  };

  const openMenu = (resource: Resource) => {
    Alert.alert(t('resources.actionTitle'), resource.title, [
      {
        text: t('resources.edit'),
        onPress: () => router.push(`/resource-editor?resourceId=${resource.id}`),
      },
      {
        text: t('resources.delete'),
        style: 'destructive',
        onPress: () => void removeResource(resource.id),
      },
      {
        text: t('common.cancel'),
        style: 'cancel',
      },
    ]);
  };

  const filterLabels: { key: ResourceFilter; label: string }[] = [
    { key: 'tout', label: t('resources.filterAll') },
    { key: 'note', label: t('resources.filterNote') },
    { key: 'link', label: t('resources.filterLink') },
    { key: 'file', label: t('resources.filterFile') },
  ];

  return (
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

        <View style={styles.stateRow}>
          {(['auto', 'loading', 'empty', 'error'] as ViewState[]).map((state) => (
            <TouchableOpacity
              key={state}
              style={[styles.stateChip, stateOverride === state && styles.stateChipActive]}
              onPress={() => setStateOverride(state)}>
              <Text style={[styles.stateChipText, stateOverride === state && styles.stateChipTextActive]}>{t(`states.${state}`)}</Text>
            </TouchableOpacity>
          ))}
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
            onActionPress={() => {
              setStateOverride('auto');
              void loadResources();
            }}
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
                const tone = typeMeta[resource.type ?? 'note'];
                const iconBg = resource.type === 'file' ? colors.warningSoft : resource.type === 'link' ? colors.successSoft : colors.primarySoft;
                const iconColor = resource.type === 'file' ? colors.warning : resource.type === 'link' ? colors.success : colors.primary;

                return (
                  <TouchableOpacity
                    key={resource.id}
                    style={styles.card}
                    onPress={() => router.push(`/resource-editor?resourceId=${resource.id}`)}>
                    <View style={[styles.iconWrap, { backgroundColor: iconBg }]}>
                      <Ionicons name={tone.icon} size={18} color={iconColor} />
                    </View>

                    <View style={styles.cardMain}>
                      <Text style={styles.resourceTitle}>{resource.title}</Text>
                      <Text style={styles.resourceMeta}>
                        {t('resources.addedOn', {
                          date: formatDateLabel(resource.created_at, locale, t('common.noDate')),
                        })}
                      </Text>
                      <View style={styles.tagsRow}>
                        {(resource.tags ?? []).map((tag) => (
                          <View key={tag} style={styles.tag}>
                            <Text style={styles.tagText}>#{tag}</Text>
                          </View>
                        ))}
                      </View>
                    </View>

                    <TouchableOpacity onPress={() => openMenu(resource)}>
                      <Ionicons name="ellipsis-vertical" size={16} color={colors.textMuted} />
                    </TouchableOpacity>
                  </TouchableOpacity>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
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
    stateRow: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
      marginBottom: 10,
    },
    stateChip: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.surface,
    },
    stateChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    stateChipText: {
      color: colors.textMuted,
      fontSize: 12,
      textTransform: 'capitalize',
    },
    stateChipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    filtersRow: {
      gap: 8,
      marginBottom: 14,
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
