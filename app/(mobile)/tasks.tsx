import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Alert, RefreshControl, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { StateBlock } from '@/components/ui/state-block';
import { TabSwipeShell } from '@/components/ui/tab-swipe-shell';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel, formatDateTimeLabel, toIsoDate } from '@/lib/format';
import { deleteTask, fetchTasks, getCachedTasks, updateTask } from '@/lib/student-api';
import { getUserPreferences, toggleFavoriteTask } from '@/lib/user-preferences';
import { useAuth } from '@/providers/auth-provider';
import type { Task } from '@/types/supabase';

type Filter = 'toutes' | 'a-faire' | 'archivees';
type WindowFilter = 'toutes-dates' | 'aujourdhui' | 'semaine';
type SortMode = 'due' | 'priority' | 'recent' | 'favorites';

function SwipeAction({ label, color }: { label: string; color: string }) {
  return (
    <View style={[styles.swipeAction, { backgroundColor: color }]}>
      <Text style={styles.swipeActionText}>{label}</Text>
    </View>
  );
}

function isInThisWeek(dueDate: string | null) {
  if (!dueDate) return false;
  const date = new Date(dueDate);
  if (Number.isNaN(date.getTime())) return false;

  const now = new Date();
  const in7Days = new Date();
  in7Days.setDate(now.getDate() + 7);

  return date >= new Date(toIsoDate(now)) && date <= in7Days;
}

export default function TasksScreen() {
  const { user } = useAuth();
  const { colors, cardShadow } = useAppTheme();
  const { t, locale } = useI18n();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>('toutes');
  const [windowFilter, setWindowFilter] = useState<WindowFilter>('toutes-dates');
  const [sortMode, setSortMode] = useState<SortMode>('due');
  const [tasks, setTasks] = useState<Task[]>([]);
  const [favoriteTaskIds, setFavoriteTaskIds] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedTaskIds, setSelectedTaskIds] = useState<string[]>([]);
  const [pendingSwipeDelete, setPendingSwipeDelete] = useState<{
    task: Task;
    timeoutId: ReturnType<typeof setTimeout>;
  } | null>(null);
  const swipeRefs = useRef<Record<string, Swipeable | null>>({});
  const hasHydratedRef = useRef(false);
  const closeAllSwipeables = useCallback((exceptTaskId?: string) => {
    const entries = Object.entries(swipeRefs.current);
    for (const [taskId, instance] of entries) {
      if (!instance) continue;
      if (exceptTaskId && taskId === exceptTaskId) continue;
      try {
        instance.close();
      } catch {
        // Ignore stale refs.
      }
    }
  }, []);

  const themedStyles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);
  const priorityStyle = useMemo(
    () => ({
      high: { bg: colors.dangerSoft, color: colors.danger, label: t('priority.high') },
      medium: { bg: colors.warningSoft, color: colors.warning, label: t('priority.medium') },
      low: { bg: colors.successSoft, color: colors.success, label: t('priority.low') },
    }),
    [colors.danger, colors.dangerSoft, colors.success, colors.successSoft, colors.warning, colors.warningSoft, t]
  );

  const loadTasks = useCallback(async () => {
    if (!user?.id) return;

    const shouldShowBlockingLoader = !hasHydratedRef.current;
    let hasCachedData = false;

    try {
      if (shouldShowBlockingLoader) {
        setLoading(true);
      }
      setError('');

      const cached = await getCachedTasks(user.id);
      hasCachedData = cached.length > 0;
      if (hasCachedData) {
        setTasks(cached);
        if (shouldShowBlockingLoader) {
          setLoading(false);
        }
      }

      const data = await fetchTasks(user.id);
      setTasks(data);
    } catch (err) {
      if (!hasCachedData) {
        const message = getErrorMessage(err, t('tasks.loadError'));
        setError(message);
      }
    } finally {
      if (shouldShowBlockingLoader) {
        setLoading(false);
      }
      hasHydratedRef.current = true;
    }
  }, [t, user?.id]);

  const loadPreferences = useCallback(async () => {
    if (!user?.id) return;
    const preferences = await getUserPreferences(user.id);
    setFavoriteTaskIds(preferences.favoriteTaskIds);
  }, [user?.id]);

  useFocusEffect(
    useCallback(() => {
      closeAllSwipeables();
      void loadTasks();
      void loadPreferences();
      return () => closeAllSwipeables();
    }, [closeAllSwipeables, loadPreferences, loadTasks])
  );

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await Promise.all([loadTasks(), loadPreferences()]);
    } finally {
      setRefreshing(false);
    }
  }, [loadPreferences, loadTasks]);

  useEffect(() => {
    setSelectedTaskIds((prev) => prev.filter((taskId) => tasks.some((task) => task.id === taskId)));
  }, [tasks]);

  const filteredTasks = useMemo(() => {
    let data = [...tasks];

    if (filter === 'a-faire') data = data.filter((task) => task.status !== 'done');
    if (filter === 'archivees') data = data.filter((task) => task.status === 'done');

    if (windowFilter === 'aujourdhui') {
      data = data.filter((task) => task.due_date === toIsoDate());
    }

    if (windowFilter === 'semaine') {
      data = data.filter((task) => isInThisWeek(task.due_date));
    }

    if (sortMode === 'priority') {
      const rank: Record<Task['priority'], number> = { high: 0, medium: 1, low: 2 };
      data.sort((a, b) => rank[a.priority] - rank[b.priority]);
      return data;
    }

    if (sortMode === 'recent') {
      data.sort((a, b) => (b.created_at ?? '').localeCompare(a.created_at ?? ''));
      return data;
    }

    if (sortMode === 'favorites') {
      data = data.filter((task) => favoriteTaskIds.includes(task.id));
      data.sort((a, b) => {
        const aDate = a.due_date ?? '9999-12-31';
        const bDate = b.due_date ?? '9999-12-31';
        return aDate.localeCompare(bDate);
      });
      return data;
    }

    data.sort((a, b) => {
      if (!a.due_date && !b.due_date) return (b.created_at ?? '').localeCompare(a.created_at ?? '');
      if (!a.due_date) return 1;
      if (!b.due_date) return -1;
      return a.due_date.localeCompare(b.due_date);
    });
    return data;
  }, [favoriteTaskIds, filter, sortMode, tasks, windowFilter]);

  const effectiveState = loading ? 'loading' : error ? 'error' : tasks.length === 0 ? 'empty' : 'auto';
  const isSelectionMode = selectedTaskIds.length > 0;

  const startSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev : [...prev, taskId]));
  };

  const toggleSelection = (taskId: string) => {
    setSelectedTaskIds((prev) => (prev.includes(taskId) ? prev.filter((id) => id !== taskId) : [...prev, taskId]));
  };

  const clearSelection = () => {
    setSelectedTaskIds([]);
  };

  const toggleTask = async (task: Task) => {
    if (!user?.id) return;

    const nextStatus = task.status === 'done' ? 'todo' : 'done';
    const completedAt = nextStatus === 'done' ? new Date().toISOString() : null;
    setTasks((prev) =>
      prev.map((row) => (row.id === task.id ? { ...row, status: nextStatus, completed_at: completedAt } : row))
    );

    try {
      await updateTask(task.id, user.id, { status: nextStatus, completed_at: completedAt });
    } catch {
      setTasks((prev) => prev.map((row) => (row.id === task.id ? task : row)));
      Alert.alert(t('common.networkErrorTitle'), t('tasks.updateError'));
    }
  };

  const removeTasks = async (taskIds: string[]) => {
    if (!user?.id) return;
    if (taskIds.length === 0) return;

    const previous = tasks;
    setTasks((prev) => prev.filter((task) => !taskIds.includes(task.id)));
    setSelectedTaskIds((prev) => prev.filter((id) => !taskIds.includes(id)));

    try {
      await Promise.all(taskIds.map((taskId) => deleteTask(taskId, user.id)));
    } catch {
      setTasks(previous);
      Alert.alert(t('common.networkErrorTitle'), t('tasks.deleteError'));
    }
  };

  useEffect(() => {
    return () => {
      if (pendingSwipeDelete) {
        clearTimeout(pendingSwipeDelete.timeoutId);
      }
    };
  }, [pendingSwipeDelete]);

  const commitTaskDelete = useCallback(
    async (taskId: string) => {
      if (!user?.id) return;
      try {
        await deleteTask(taskId, user.id);
      } catch {
        void loadTasks();
        Alert.alert(t('common.networkErrorTitle'), t('tasks.deleteError'));
      }
    },
    [loadTasks, t, user?.id]
  );

  const scheduleSwipeDeleteTask = useCallback(
    (task: Task) => {
      if (!user?.id) return;

      if (pendingSwipeDelete) {
        clearTimeout(pendingSwipeDelete.timeoutId);
        void commitTaskDelete(pendingSwipeDelete.task.id);
      }

      setTasks((prev) => prev.filter((row) => row.id !== task.id));
      setSelectedTaskIds((prev) => prev.filter((id) => id !== task.id));

      const timeoutId = setTimeout(() => {
        void commitTaskDelete(task.id);
        setPendingSwipeDelete((current) => (current?.task.id === task.id ? null : current));
      }, 3600);

      setPendingSwipeDelete({ task, timeoutId });
    },
    [commitTaskDelete, pendingSwipeDelete, user?.id]
  );

  const undoSwipeDelete = () => {
    if (!pendingSwipeDelete) return;
    clearTimeout(pendingSwipeDelete.timeoutId);
    setTasks((prev) => {
      if (prev.some((task) => task.id === pendingSwipeDelete.task.id)) return prev;
      return [pendingSwipeDelete.task, ...prev];
    });
    setPendingSwipeDelete(null);
  };

  const openSelectedTaskEditor = () => {
    if (selectedTaskIds.length !== 1) return;
    const [taskId] = selectedTaskIds;
    closeAllSwipeables();
    clearSelection();
    router.push(`/task-editor?taskId=${taskId}&returnTo=${encodeURIComponent('/tasks')}`);
  };

  const openTaskEditorFromSwipe = useCallback(
    (taskId: string) => {
      closeAllSwipeables();
      setTimeout(() => {
        router.push(`/task-editor?taskId=${taskId}&returnTo=${encodeURIComponent('/tasks')}`);
      }, 120);
    },
    [closeAllSwipeables]
  );

  const onToggleFavoriteTask = async (taskId: string) => {
    if (!user?.id) return;
    const previous = favoriteTaskIds;
    const next = previous.includes(taskId)
      ? previous.filter((id) => id !== taskId)
      : [taskId, ...previous];
    setFavoriteTaskIds(next);
    try {
      const updated = await toggleFavoriteTask(user.id, taskId);
      setFavoriteTaskIds(updated.favoriteTaskIds);
    } catch {
      setFavoriteTaskIds(previous);
    }
  };

  const filterLabels: { key: Filter; label: string }[] = [
    { key: 'toutes', label: t('tasks.filterAll') },
    { key: 'a-faire', label: t('tasks.filterTodo') },
    { key: 'archivees', label: t('tasks.filterArchived') },
  ];

  const windowLabels: { key: WindowFilter; label: string }[] = [
    { key: 'toutes-dates', label: t('tasks.windowAll') },
    { key: 'aujourdhui', label: t('common.today') },
    { key: 'semaine', label: t('common.week') },
  ];
  const sortLabels: { key: SortMode; label: string }[] = [
    { key: 'due', label: t('tasks.sortDue') },
    { key: 'priority', label: t('tasks.sortPriority') },
    { key: 'recent', label: t('tasks.sortRecent') },
    { key: 'favorites', label: t('tasks.sortFavorites') },
  ];

  return (
    <TabSwipeShell tab="tasks">
    <View style={themedStyles.page}>
      <ScrollView
        contentContainerStyle={themedStyles.content}
        showsVerticalScrollIndicator={false}
        onScrollBeginDrag={() => closeAllSwipeables()}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} tintColor={colors.primary} />}>
        <View style={themedStyles.header}>
          <View>
            <Text style={themedStyles.title}>{t('tasks.title')}</Text>
            <Text style={themedStyles.subtitle}>{t('tasks.subtitle')}</Text>
          </View>
          <TouchableOpacity style={themedStyles.addBtn} onPress={() => router.push('/task-editor')}>
            <Ionicons name="add" size={22} color="#FFFFFF" />
          </TouchableOpacity>
        </View>

        <View style={themedStyles.filterRow}>
          {filterLabels.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[themedStyles.filterChip, filter === item.key && themedStyles.filterChipActive]}
              onPress={() => setFilter(item.key)}>
              <Text style={[themedStyles.filterText, filter === item.key && themedStyles.filterTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={themedStyles.windowRow}>
          {windowLabels.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[themedStyles.windowChip, windowFilter === item.key && themedStyles.windowChipActive]}
              onPress={() => setWindowFilter(item.key)}>
              <Text style={[themedStyles.windowText, windowFilter === item.key && themedStyles.windowTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={themedStyles.windowRow}>
          {sortLabels.map((item) => (
            <TouchableOpacity
              key={item.key}
              style={[themedStyles.windowChip, sortMode === item.key && themedStyles.windowChipActive]}
              onPress={() => setSortMode(item.key)}>
              <Text style={[themedStyles.windowText, sortMode === item.key && themedStyles.windowTextActive]}>{item.label}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <View style={themedStyles.noticeBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={themedStyles.noticeText}>{t('tasks.archiveNotice')}</Text>
        </View>

        {isSelectionMode ? (
          <View style={themedStyles.selectionBar}>
            <Text style={themedStyles.selectionLabel}>
              {t('common.selectedCount', { count: selectedTaskIds.length })}
            </Text>
            <View style={themedStyles.selectionActions}>
              <TouchableOpacity
                style={[
                  themedStyles.selectionBtn,
                  selectedTaskIds.length !== 1 && themedStyles.selectionBtnDisabled,
                ]}
                disabled={selectedTaskIds.length !== 1}
                onPress={openSelectedTaskEditor}>
                <Text style={themedStyles.selectionBtnText}>{t('tasks.swipeEdit')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[themedStyles.selectionBtn, themedStyles.selectionBtnDanger]}
                onPress={() => void removeTasks(selectedTaskIds)}>
                <Text style={themedStyles.selectionBtnText}>{t('tasks.swipeDelete')}</Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={[themedStyles.selectionBtn, themedStyles.selectionBtnGhost]}
                onPress={clearSelection}>
                <Text style={themedStyles.selectionGhostBtnText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            </View>
          </View>
        ) : null}

        {effectiveState === 'loading' ? (
          <View style={themedStyles.stackGap}>
            {[1, 2, 3].map((placeholder) => (
              <View key={placeholder} style={themedStyles.skeletonCard} />
            ))}
          </View>
        ) : null}

        {effectiveState === 'empty' ? (
          <StateBlock
            variant="empty"
            title={t('tasks.emptyTitle')}
            description={t('tasks.emptyDescription')}
            actionLabel={t('tasks.emptyAdd')}
            onActionPress={() => router.push('/task-editor')}
          />
        ) : null}

        {effectiveState === 'error' ? (
          <StateBlock
            variant="error"
            title={t('common.networkErrorTitle')}
            description={error || t('tasks.loadError')}
            actionLabel={t('common.retry')}
            onActionPress={() => void loadTasks()}
          />
        ) : null}

        {effectiveState === 'auto' ? (
          <View style={themedStyles.stackGap}>
            {filteredTasks.length === 0 ? (
              <StateBlock
                variant="empty"
                title={t('tasks.emptyFilteredTitle')}
                description={t('tasks.emptyFilteredDescription')}
              />
            ) : (
              filteredTasks.map((task) => {
                const tone = priorityStyle[task.priority];
                const done = task.status === 'done';
                const selected = selectedTaskIds.includes(task.id);
                const isMarked = isSelectionMode ? selected : done;
                const favorite = favoriteTaskIds.includes(task.id);

                const card = (
                  <TouchableOpacity
                    key={task.id}
                    style={[themedStyles.card, selected && themedStyles.cardSelected]}
                    activeOpacity={0.85}
                    delayLongPress={250}
                    onLongPress={() => startSelection(task.id)}
                    onPress={() => {
                      if (isSelectionMode) toggleSelection(task.id);
                    }}>
                    <TouchableOpacity
                      style={[
                        themedStyles.checkbox,
                        isSelectionMode ? selected && themedStyles.checkboxSelected : done && themedStyles.checkboxDone,
                      ]}
                      onPress={() => {
                        if (isSelectionMode) {
                          toggleSelection(task.id);
                          return;
                        }
                        void toggleTask(task);
                      }}>
                      {isMarked ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                    </TouchableOpacity>

                    <View style={themedStyles.cardMain}>
                      <Text style={[themedStyles.taskTitle, done && themedStyles.taskTitleDone]}>{task.title}</Text>
                      <Text style={themedStyles.meta}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
                      <Text style={themedStyles.metaSecondary}>
                        {t('tasks.createdAt', {
                          date: formatDateTimeLabel(task.created_at, locale, t('common.noDate')),
                        })}
                      </Text>
                    </View>

                    {!isSelectionMode ? (
                      <TouchableOpacity
                        style={themedStyles.favoriteBtn}
                        onPress={() => void onToggleFavoriteTask(task.id)}>
                        <Ionicons
                          name={favorite ? 'star' : 'star-outline'}
                          size={16}
                          color={favorite ? colors.warning : colors.textMuted}
                        />
                      </TouchableOpacity>
                    ) : null}

                    <View style={[themedStyles.priorityBadge, { backgroundColor: tone.bg }]}>
                      <Text style={[themedStyles.priorityText, { color: tone.color }]}>{tone.label}</Text>
                    </View>
                  </TouchableOpacity>
                );

                if (isSelectionMode) return card;

                return (
                  <Swipeable
                    key={task.id}
                    ref={(instance) => {
                      swipeRefs.current[task.id] = instance;
                    }}
                    onSwipeableWillOpen={() => closeAllSwipeables(task.id)}
                    renderLeftActions={() => <SwipeAction label={t('tasks.swipeEdit')} color={colors.success} />}
                    onSwipeableLeftOpen={() => openTaskEditorFromSwipe(task.id)}
                    renderRightActions={() => <SwipeAction label={t('tasks.swipeDelete')} color={colors.danger} />}
                    onSwipeableRightOpen={() => scheduleSwipeDeleteTask(task)}>
                    {card}
                  </Swipeable>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>

      {pendingSwipeDelete ? (
        <View style={themedStyles.undoBar}>
          <Text style={themedStyles.undoText}>{t('tasks.undoDeleteMessage')}</Text>
          <TouchableOpacity style={themedStyles.undoBtn} onPress={undoSwipeDelete}>
            <Text style={themedStyles.undoBtnText}>{t('common.undo')}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
    </TabSwipeShell>
  );
}

const styles = StyleSheet.create({
  swipeAction: {
    width: 92,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  swipeActionText: {
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
    subtitle: {
      marginTop: 4,
      color: colors.textMuted,
    },
    addBtn: {
      width: 42,
      height: 42,
      borderRadius: 14,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    filterRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    filterChip: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    filterChipActive: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    filterText: {
      color: colors.textMuted,
      fontWeight: '600',
    },
    filterTextActive: {
      color: '#FFFFFF',
    },
    windowRow: {
      flexDirection: 'row',
      gap: 8,
      marginBottom: 10,
    },
    windowChip: {
      borderRadius: 10,
      paddingHorizontal: 12,
      paddingVertical: 8,
      backgroundColor: colors.surface,
      borderWidth: 1,
      borderColor: colors.border,
    },
    windowChipActive: {
      backgroundColor: colors.primarySoft,
      borderColor: colors.primary,
    },
    windowText: {
      color: colors.textMuted,
      textTransform: 'capitalize',
      fontWeight: '600',
    },
    windowTextActive: {
      color: colors.primary,
    },
    noticeBox: {
      marginBottom: 14,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      borderRadius: 12,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 9,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 8,
    },
    noticeText: {
      flex: 1,
      color: colors.textMuted,
      fontSize: 12,
      lineHeight: 17,
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
    stackGap: {
      gap: 10,
    },
    skeletonCard: {
      height: 86,
      borderRadius: 14,
      backgroundColor: colors.border,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 14,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 12,
      ...cardShadow,
    },
    cardSelected: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    checkbox: {
      width: 24,
      height: 24,
      borderRadius: 12,
      borderWidth: 2,
      borderColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 10,
    },
    checkboxDone: {
      backgroundColor: colors.success,
      borderColor: colors.success,
    },
    checkboxSelected: {
      backgroundColor: colors.primary,
      borderColor: colors.primary,
    },
    cardMain: {
      flex: 1,
      marginRight: 10,
    },
    favoriteBtn: {
      width: 28,
      height: 28,
      borderRadius: 8,
      alignItems: 'center',
      justifyContent: 'center',
      marginRight: 6,
    },
    taskTitle: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 4,
    },
    taskTitleDone: {
      textDecorationLine: 'line-through',
      color: colors.textMuted,
    },
    meta: {
      fontSize: 12,
      color: colors.textMuted,
    },
    metaSecondary: {
      fontSize: 11,
      color: colors.textMuted,
      marginTop: 2,
    },
    priorityBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    priorityText: {
      fontSize: 11,
      fontWeight: '700',
    },
    undoBar: {
      position: 'absolute',
      left: 14,
      right: 14,
      bottom: 94,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 10,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      ...cardShadow,
    },
    undoText: {
      flex: 1,
      color: colors.text,
      fontWeight: '600',
      fontSize: 13,
    },
    undoBtn: {
      borderRadius: 999,
      paddingHorizontal: 12,
      paddingVertical: 7,
      backgroundColor: colors.primarySoft,
      borderWidth: 1,
      borderColor: colors.primary,
    },
    undoBtnText: {
      color: colors.primary,
      fontWeight: '800',
      fontSize: 12,
    },
  });
