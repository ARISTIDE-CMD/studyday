import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import { router } from 'expo-router';
import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import Swipeable from 'react-native-gesture-handler/Swipeable';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel, toIsoDate } from '@/lib/format';
import { deleteTask, fetchTasks, getCachedTasks, updateTask } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import type { Task } from '@/types/supabase';

type Filter = 'toutes' | 'a-faire' | 'archivees';
type WindowFilter = 'toutes-dates' | 'aujourdhui' | 'semaine';

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
  const [tasks, setTasks] = useState<Task[]>([]);

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

    let hasCachedData = false;

    try {
      setLoading(true);
      setError('');

      const cached = await getCachedTasks(user.id);
      hasCachedData = cached.length > 0;
      if (hasCachedData) {
        setTasks(cached);
        setLoading(false);
      }

      const data = await fetchTasks(user.id);
      setTasks(data);
    } catch (err) {
      if (!hasCachedData) {
        const message = getErrorMessage(err, t('tasks.loadError'));
        setError(message);
      }
    } finally {
      setLoading(false);
    }
  }, [t, user?.id]);

  useFocusEffect(
    useCallback(() => {
      void loadTasks();
    }, [loadTasks])
  );

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

    return data;
  }, [filter, tasks, windowFilter]);

  const effectiveState = loading ? 'loading' : error ? 'error' : tasks.length === 0 ? 'empty' : 'auto';

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

  const removeTask = async (taskId: string) => {
    if (!user?.id) return;

    const previous = tasks;
    setTasks((prev) => prev.filter((task) => task.id !== taskId));

    try {
      await deleteTask(taskId, user.id);
    } catch {
      setTasks(previous);
      Alert.alert(t('common.networkErrorTitle'), t('tasks.deleteError'));
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

  return (
    <View style={themedStyles.page}>
      <ScrollView contentContainerStyle={themedStyles.content} showsVerticalScrollIndicator={false}>
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

        <View style={themedStyles.noticeBox}>
          <Ionicons name="information-circle-outline" size={16} color={colors.primary} />
          <Text style={themedStyles.noticeText}>{t('tasks.archiveNotice')}</Text>
        </View>

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

                return (
                  <Swipeable
                    key={task.id}
                    renderLeftActions={() => <SwipeAction label={t('tasks.swipeEdit')} color={colors.success} />}
                    onSwipeableLeftOpen={() => router.push(`/task-editor?taskId=${task.id}`)}
                    renderRightActions={() => <SwipeAction label={t('tasks.swipeDelete')} color={colors.danger} />}
                    onSwipeableRightOpen={() => void removeTask(task.id)}>
                    <View style={themedStyles.card}>
                      <TouchableOpacity
                        style={[themedStyles.checkbox, done && themedStyles.checkboxDone]}
                        onPress={() => void toggleTask(task)}>
                        {done ? <Ionicons name="checkmark" size={14} color="#FFFFFF" /> : null}
                      </TouchableOpacity>

                      <View style={themedStyles.cardMain}>
                        <Text style={[themedStyles.taskTitle, done && themedStyles.taskTitleDone]}>{task.title}</Text>
                        <Text style={themedStyles.meta}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
                      </View>

                      <View style={[themedStyles.priorityBadge, { backgroundColor: tone.bg }]}>
                        <Text style={[themedStyles.priorityText, { color: tone.color }]}>{tone.label}</Text>
                      </View>
                    </View>
                  </Swipeable>
                );
              })
            )}
          </View>
        ) : null}
      </ScrollView>
    </View>
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
    cardMain: {
      flex: 1,
      marginRight: 10,
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
    priorityBadge: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    priorityText: {
      fontSize: 11,
      fontWeight: '700',
    },
  });
