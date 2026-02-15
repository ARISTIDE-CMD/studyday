import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { fetchTaskById, getCachedTaskById } from '@/lib/student-api';
import { formatDateLabel } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';
import type { Task } from '@/types/supabase';

export default function TaskDetailScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const { user } = useAuth();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [task, setTask] = useState<Task | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const run = async () => {
      if (!id || !user?.id) {
        setError(t('taskDetail.notFound'));
        setLoading(false);
        return;
      }

      let cachedTask: Task | null = null;

      try {
        setLoading(true);
        setError('');

        cachedTask = await getCachedTaskById(user.id, id);
        if (cachedTask) {
          setTask(cachedTask);
          setLoading(false);
        }

        const remoteTask = await fetchTaskById(user.id, id);
        setTask(remoteTask ?? cachedTask);
      } catch (err) {
        if (!cachedTask) {
          setError(getErrorMessage(err, t('taskDetail.errorLoad')));
        }
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id, t, user?.id]);

  const statusLabel = useMemo(() => {
    if (!task) return '';
    if (task.status === 'done') return t('taskDetail.statusDone');
    if (task.status === 'in_progress') return t('taskDetail.statusInProgress');
    return t('taskDetail.statusTodo');
  }, [t, task]);

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

        {!loading && !error && !task ? (
          <StateBlock
            variant="empty"
            title={t('taskDetail.emptyTitle')}
            description={t('taskDetail.emptyDescription')}
            actionLabel={t('common.back')}
            onActionPress={() => router.back()}
          />
        ) : null}

        {!loading && !error && task ? (
          <>
            <Text style={styles.title}>{task.title}</Text>

            <View style={styles.metaCard}>
              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('taskDetail.dueDate')}</Text>
                <Text style={styles.metaValue}>{formatDateLabel(task.due_date, locale, t('common.noDate'))}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('taskDetail.priority')}</Text>
                <Text style={styles.metaValue}>{t(`priority.${task.priority}`)}</Text>
              </View>

              <View style={styles.metaRow}>
                <Text style={styles.metaLabel}>{t('taskDetail.status')}</Text>
                <Text style={styles.metaValue}>{statusLabel}</Text>
              </View>
            </View>

            <Text style={styles.sectionTitle}>{t('taskDetail.description')}</Text>
            <Text style={styles.body}>{task.description?.trim() || t('taskDetail.noDescription')}</Text>

            <TouchableOpacity style={styles.editButton} onPress={() => router.push(`/task-editor?taskId=${task.id}`)}>
              <Text style={styles.editButtonText}>{t('taskDetail.edit')}</Text>
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
    metaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 12,
    },
    metaLabel: {
      color: colors.textMuted,
      fontWeight: '600',
    },
    metaValue: {
      color: colors.text,
      fontWeight: '700',
      textTransform: 'capitalize',
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
      marginBottom: 22,
    },
    editButton: {
      alignSelf: 'flex-start',
      borderRadius: 10,
      backgroundColor: colors.primary,
      paddingHorizontal: 14,
      paddingVertical: 10,
    },
    editButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
  });
