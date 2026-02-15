import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { recordFocusSession } from '@/lib/focus-stats';
import { fetchTasks, getCachedTasks } from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';
import type { Task } from '@/types/supabase';

const FOCUS_SECONDS = 25 * 60;
const BREAK_SECONDS = 5 * 60;

function formatClock(value: number): string {
  const safe = Math.max(0, value);
  const minutes = String(Math.floor(safe / 60)).padStart(2, '0');
  const seconds = String(safe % 60).padStart(2, '0');
  return `${minutes}:${seconds}`;
}

export default function FocusScreen() {
  const { colors, cardShadow } = useAppTheme();
  const { t } = useI18n();
  const { user } = useAuth();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();
  const { showNotification, addActivityNotification } = useInAppNotification();
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  const [loading, setLoading] = useState(true);
  const [tasks, setTasks] = useState<Task[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(taskId ?? null);
  const [phase, setPhase] = useState<'focus' | 'break'>('focus');
  const [secondsLeft, setSecondsLeft] = useState(FOCUS_SECONDS);
  const [isRunning, setIsRunning] = useState(false);
  const [completedFocusSessions, setCompletedFocusSessions] = useState(0);

  useEffect(() => {
    let active = true;
    const run = async () => {
      if (!user?.id) {
        if (active) setLoading(false);
        return;
      }

      try {
        setLoading(true);
        const cached = await getCachedTasks(user.id);
        const cachedOpen = cached.filter((task) => task.status !== 'done').slice(0, 12);
        if (active) {
          setTasks(cachedOpen);
          if (cachedOpen.length > 0) {
            setSelectedTaskId((prev) => prev ?? cachedOpen[0].id);
          }
          setLoading(false);
        }

        const remote = await fetchTasks(user.id);
        const remoteOpen = remote.filter((task) => task.status !== 'done').slice(0, 12);
        if (active) {
          setTasks(remoteOpen);
          if (remoteOpen.length > 0) {
            setSelectedTaskId((prev) => prev ?? remoteOpen[0].id);
          }
        }
      } finally {
        if (active) setLoading(false);
      }
    };

    void run();
    return () => {
      active = false;
    };
  }, [user?.id]);

  const selectedTask = useMemo(
    () => tasks.find((task) => task.id === selectedTaskId) ?? null,
    [selectedTaskId, tasks]
  );

  const progress = useMemo(() => {
    const total = phase === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;
    return 1 - secondsLeft / total;
  }, [phase, secondsLeft]);

  const phaseTitle = phase === 'focus' ? t('focus.phaseFocus') : t('focus.phaseBreak');

  const handlePhaseComplete = useCallback(async () => {
    if (!user?.id) return;

    if (phase === 'focus') {
      await recordFocusSession(user.id, 25);
      setCompletedFocusSessions((prev) => prev + 1);

      showNotification({
        title: t('focus.focusDoneTitle'),
        message: t('focus.focusDoneMessage'),
        variant: 'success',
      });

      if (selectedTask) {
        await addActivityNotification({
          entityType: 'task',
          entityId: selectedTask.id,
          title: t('focus.focusLoggedTitle'),
          message: t('focus.focusLoggedMessage', { title: selectedTask.title }),
        });
      }

      setPhase('break');
      setSecondsLeft(BREAK_SECONDS);
      setIsRunning(false);
      return;
    }

    showNotification({
      title: t('focus.breakDoneTitle'),
      message: t('focus.breakDoneMessage'),
      variant: 'info',
    });
    setPhase('focus');
    setSecondsLeft(FOCUS_SECONDS);
    setIsRunning(false);
  }, [addActivityNotification, phase, selectedTask, showNotification, t, user?.id]);

  useEffect(() => {
    if (!isRunning) return;

    if (secondsLeft <= 0) {
      void handlePhaseComplete();
      return;
    }

    const timer = setTimeout(() => {
      setSecondsLeft((prev) => prev - 1);
    }, 1000);

    return () => clearTimeout(timer);
  }, [handlePhaseComplete, isRunning, secondsLeft]);

  const onReset = () => {
    setIsRunning(false);
    setSecondsLeft(phase === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS);
  };

  const onSkip = () => {
    setIsRunning(false);
    if (phase === 'focus') {
      setPhase('break');
      setSecondsLeft(BREAK_SECONDS);
      return;
    }
    setPhase('focus');
    setSecondsLeft(FOCUS_SECONDS);
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('focus.title')}</Text>
        <Text style={styles.subtitle}>{t('focus.subtitle')}</Text>

        <View style={styles.timerCard}>
          <Text style={styles.phaseLabel}>{phaseTitle}</Text>
          <Text style={styles.clock}>{formatClock(secondsLeft)}</Text>
          <View style={styles.progressTrack}>
            <View style={[styles.progressFill, { width: `${Math.round(progress * 100)}%` }]} />
          </View>

          <View style={styles.actionsRow}>
            <TouchableOpacity style={styles.actionBtn} onPress={() => setIsRunning((prev) => !prev)}>
              <Text style={styles.actionBtnText}>{isRunning ? t('focus.pause') : t('focus.start')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onReset}>
              <Text style={styles.secondaryBtnText}>{t('focus.reset')}</Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.secondaryBtn} onPress={onSkip}>
              <Text style={styles.secondaryBtnText}>{t('focus.skip')}</Text>
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.counterRow}>
          <Ionicons name="flash-outline" size={16} color={colors.warning} />
          <Text style={styles.counterText}>
            {t('focus.completedCount', { count: completedFocusSessions })}
          </Text>
        </View>

        <Text style={styles.sectionTitle}>{t('focus.selectTask')}</Text>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <View style={styles.taskWrap}>
            <TouchableOpacity
              style={[styles.taskChip, !selectedTaskId && styles.taskChipActive]}
              onPress={() => setSelectedTaskId(null)}>
              <Text style={[styles.taskChipText, !selectedTaskId && styles.taskChipTextActive]}>
                {t('focus.withoutTask')}
              </Text>
            </TouchableOpacity>

            {tasks.map((task) => {
              const active = selectedTaskId === task.id;
              return (
                <TouchableOpacity
                  key={task.id}
                  style={[styles.taskChip, active && styles.taskChipActive]}
                  onPress={() => setSelectedTaskId(task.id)}>
                  <Text style={[styles.taskChipText, active && styles.taskChipTextActive]} numberOfLines={1}>
                    {task.title}
                  </Text>
                </TouchableOpacity>
              );
            })}
          </View>
        )}
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
      marginBottom: 16,
    },
    backLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    title: {
      color: colors.text,
      fontSize: 28,
      fontWeight: '800',
      marginBottom: 4,
    },
    subtitle: {
      color: colors.textMuted,
      marginBottom: 12,
    },
    timerCard: {
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 16,
      ...cardShadow,
    },
    phaseLabel: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 12,
      textTransform: 'uppercase',
      letterSpacing: 0.4,
      marginBottom: 6,
    },
    clock: {
      color: colors.text,
      fontSize: 48,
      fontWeight: '900',
      marginBottom: 14,
    },
    progressTrack: {
      width: '100%',
      height: 10,
      borderRadius: 999,
      backgroundColor: colors.border,
      overflow: 'hidden',
      marginBottom: 14,
    },
    progressFill: {
      height: '100%',
      backgroundColor: colors.primary,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
      flexWrap: 'wrap',
    },
    actionBtn: {
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    actionBtnText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 13,
    },
    secondaryBtn: {
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    secondaryBtnText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    counterRow: {
      marginTop: 12,
      marginBottom: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    counterText: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    sectionTitle: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 16,
      marginTop: 10,
      marginBottom: 10,
    },
    loadingWrap: {
      paddingVertical: 18,
    },
    taskWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    taskChip: {
      maxWidth: '100%',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    taskChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    taskChipText: {
      color: colors.textMuted,
      fontWeight: '700',
      maxWidth: 230,
    },
    taskChipTextActive: {
      color: colors.primary,
    },
  });
