import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { fetchAnnouncements, fetchResources, fetchTasks, getCachedResources, getCachedTasks } from '@/lib/student-api';
import { formatDateLabel } from '@/lib/format';
import { clearRecentSearches, getUserPreferences, saveRecentSearch } from '@/lib/user-preferences';
import { useAuth } from '@/providers/auth-provider';
import type { Announcement, Resource, Task } from '@/types/supabase';

export default function GlobalSearchScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [resources, setResources] = useState<Resource[]>([]);
  const [announcements, setAnnouncements] = useState<Announcement[]>([]);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!user?.id) {
        if (active) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');

        const [cachedTasks, cachedResources, cachedAnnouncements, preferences] = await Promise.all([
          getCachedTasks(user.id),
          getCachedResources(user.id),
          fetchAnnouncements(),
          getUserPreferences(user.id),
        ]);
        if (active) {
          setTasks(cachedTasks);
          setResources(cachedResources);
          setAnnouncements(cachedAnnouncements);
          setRecentSearches(preferences.recentSearches);
          setLoading(false);
        }

        const [remoteTasks, remoteResources, remoteAnnouncements] = await Promise.all([
          fetchTasks(user.id),
          fetchResources(user.id),
          fetchAnnouncements(),
        ]);
        if (active) {
          setTasks(remoteTasks);
          setResources(remoteResources);
          setAnnouncements(remoteAnnouncements);
        }
      } catch (err) {
        if (active) {
          setError(getErrorMessage(err, t('common.genericError')));
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [t, user?.id]);

  const persistQuery = async (value: string) => {
    if (!user?.id) return;
    const queryValue = value.trim();
    if (queryValue.length < 2) return;
    const updated = await saveRecentSearch(user.id, queryValue);
    setRecentSearches(updated.recentSearches);
  };

  const onClearRecent = async () => {
    if (!user?.id) return;
    const updated = await clearRecentSearches(user.id);
    setRecentSearches(updated.recentSearches);
  };

  const normalizedQuery = query.trim().toLowerCase();

  const filteredTasks = useMemo(() => {
    if (!normalizedQuery) return tasks.slice(0, 5);
    return tasks.filter((task) => {
      const hay = `${task.title} ${task.description ?? ''}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [normalizedQuery, tasks]);

  const filteredResources = useMemo(() => {
    if (!normalizedQuery) return resources.slice(0, 5);
    return resources.filter((resource) => {
      const hay = `${resource.title} ${resource.content ?? ''} ${resource.file_url ?? ''}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [normalizedQuery, resources]);

  const filteredAnnouncements = useMemo(() => {
    if (!normalizedQuery) return announcements.slice(0, 5);
    return announcements.filter((announcement) => {
      const hay = `${announcement.title} ${announcement.content}`.toLowerCase();
      return hay.includes(normalizedQuery);
    });
  }, [announcements, normalizedQuery]);

  const hasResult =
    filteredTasks.length > 0 || filteredResources.length > 0 || filteredAnnouncements.length > 0;

  return (
    <View style={styles.page}>
      <View style={styles.header}>
        <TouchableOpacity style={styles.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backText}>{t('common.back')}</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{t('globalSearch.title')}</Text>
        <Text style={styles.subtitle}>{t('globalSearch.subtitle')}</Text>
      </View>

      <View style={styles.searchRow}>
        <Ionicons name="search-outline" size={18} color={colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          onSubmitEditing={() => void persistQuery(query)}
          placeholder={t('globalSearch.placeholder')}
          placeholderTextColor={colors.textMuted}
        />
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {!loading && !error && !query.trim() && recentSearches.length > 0 ? (
          <View style={styles.recentBlock}>
            <View style={styles.recentHead}>
              <Text style={styles.recentTitle}>{t('globalSearch.recentTitle')}</Text>
              <TouchableOpacity style={styles.recentClearBtn} onPress={() => void onClearRecent()}>
                <Text style={styles.recentClearText}>{t('globalSearch.clearRecent')}</Text>
              </TouchableOpacity>
            </View>
            <View style={styles.recentRow}>
              {recentSearches.map((item) => (
                <TouchableOpacity key={item} style={styles.recentChip} onPress={() => setQuery(item)}>
                  <Ionicons name="time-outline" size={12} color={colors.textMuted} />
                  <Text style={styles.recentChipText}>{item}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>
        ) : null}

        {loading ? (
          <View style={styles.loaderWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {!loading && error ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error}
          />
        ) : null}

        {!loading && !error && !hasResult ? (
          <StateBlock
            variant="empty"
            title={t('globalSearch.noResult')}
            description={t('globalSearch.subtitle')}
          />
        ) : null}

        {!loading && !error && hasResult ? (
          <>
            <Text style={styles.sectionTitle}>{`${t('globalSearch.sectionTasks')} (${filteredTasks.length})`}</Text>
            {filteredTasks.map((task) => (
              <TouchableOpacity
                key={task.id}
                style={styles.card}
                onPress={() => {
                  void persistQuery(query);
                  router.push(`/task/${task.id}`);
                }}>
                <Text style={styles.cardTitle}>{task.title}</Text>
                <Text style={styles.cardMeta}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.sectionTitle}>{`${t('globalSearch.sectionResources')} (${filteredResources.length})`}</Text>
            {filteredResources.map((resource) => (
              <TouchableOpacity
                key={resource.id}
                style={styles.card}
                onPress={() => {
                  void persistQuery(query);
                  router.push(`/resource/${resource.id}`);
                }}>
                <Text style={styles.cardTitle}>{resource.title}</Text>
                <Text style={styles.cardMeta}>{formatDateLabel(resource.created_at, locale, t('common.noDate'))}</Text>
              </TouchableOpacity>
            ))}

            <Text style={styles.sectionTitle}>{`${t('globalSearch.sectionAnnouncements')} (${filteredAnnouncements.length})`}</Text>
            {filteredAnnouncements.map((announcement) => (
              <TouchableOpacity
                key={announcement.id}
                style={styles.card}
                onPress={() => {
                  void persistQuery(query);
                  router.push(`/announcement/${announcement.id}`);
                }}>
                <Text style={styles.cardTitle}>{announcement.title}</Text>
                <Text style={styles.cardMeta}>{formatDateLabel(announcement.created_at, locale, t('common.noDate'))}</Text>
              </TouchableOpacity>
            ))}
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
    header: {
      paddingHorizontal: 16,
      paddingTop: 56,
      paddingBottom: 12,
    },
    backBtn: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 7,
      backgroundColor: colors.surface,
      marginBottom: 14,
    },
    backText: {
      color: colors.text,
      fontWeight: '600',
    },
    title: {
      color: colors.text,
      fontSize: 24,
      fontWeight: '800',
      marginBottom: 4,
    },
    subtitle: {
      color: colors.textMuted,
    },
    searchRow: {
      marginHorizontal: 16,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      minHeight: 46,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    searchInput: {
      flex: 1,
      color: colors.text,
    },
    content: {
      paddingHorizontal: 16,
      paddingTop: 14,
      paddingBottom: 24,
      gap: 8,
    },
    recentBlock: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 10,
    },
    recentHead: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    recentTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    recentClearBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      paddingHorizontal: 10,
      paddingVertical: 5,
      backgroundColor: colors.background,
    },
    recentClearText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    recentRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    recentChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 10,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
      maxWidth: '100%',
    },
    recentChipText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '600',
      maxWidth: 230,
    },
    loaderWrap: {
      paddingVertical: 16,
      alignItems: 'center',
    },
    sectionTitle: {
      marginTop: 8,
      color: colors.text,
      fontSize: 16,
      fontWeight: '800',
    },
    card: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    cardTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 2,
    },
    cardMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
  });
