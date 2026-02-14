import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
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
import { createTask, fetchTaskById, updateTask } from '@/lib/student-api';
import { toIsoDate } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

const priorities = ['low', 'medium', 'high'] as const;
type Priority = (typeof priorities)[number];

export default function TaskEditorScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useI18n();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(toIsoDate());
  const [priority, setPriority] = useState<Priority>('medium');
  const [loading, setLoading] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const run = async () => {
      if (!taskId || !user?.id) return;

      try {
        setScreenLoading(true);
        const data = await fetchTaskById(user.id, taskId);
        if (!data) return;

        setTitle(data.title);
        setDescription(data.description ?? '');
        setDueDate(data.due_date ?? toIsoDate());
        setPriority(data.priority);
      } finally {
        setScreenLoading(false);
      }
    };

    void run();
  }, [taskId, user?.id]);

  const onSave = async () => {
    if (!user?.id) return;
    if (!title.trim()) {
      setError(t('taskEditor.requiredTitle'));
      return;
    }

    if (dueDate && !/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setError(t('taskEditor.invalidDate'));
      return;
    }

    setError('');
    setLoading(true);

    try {
      if (taskId) {
        await updateTask(taskId, user.id, {
          title: title.trim(),
          description: description.trim() || null,
          due_date: dueDate || null,
          priority,
        });
      } else {
        await createTask({
          userId: user.id,
          title: title.trim(),
          description,
          dueDate,
          priority,
        });
      }

      setShowToast(true);
      setTimeout(() => {
        setShowToast(false);
        router.back();
      }, 900);
    } catch (err) {
      const message = getErrorMessage(err, t('taskEditor.saveError'));
      setError(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <KeyboardAvoidingView style={styles.page} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <View style={styles.header}>
          <TouchableOpacity style={styles.iconBtn} onPress={() => router.back()}>
            <Ionicons name="chevron-back" size={20} color={colors.text} />
          </TouchableOpacity>
          <Text style={styles.title}>{taskId ? t('taskEditor.editTitle') : t('taskEditor.createTitle')}</Text>
          <View style={styles.iconBtn} />
        </View>

        {screenLoading ? (
          <View style={styles.screenLoadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <Text style={styles.label}>{t('taskEditor.fieldTitle')}</Text>
            <TextInput
              style={styles.input}
              value={title}
              onChangeText={setTitle}
              placeholder={t('taskEditor.titlePlaceholder')}
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>{t('taskEditor.fieldDescription')}</Text>
            <TextInput
              style={[styles.input, styles.textArea]}
              value={description}
              onChangeText={setDescription}
              placeholder={t('taskEditor.descriptionPlaceholder')}
              placeholderTextColor="#94A3B8"
              multiline
              textAlignVertical="top"
            />

            <Text style={styles.label}>{t('taskEditor.fieldDueDate')}</Text>
            <TextInput
              style={styles.input}
              value={dueDate}
              onChangeText={setDueDate}
              placeholder="2026-02-14"
              placeholderTextColor="#94A3B8"
            />

            <Text style={styles.label}>{t('taskEditor.fieldPriority')}</Text>
            <View style={styles.priorityRow}>
              {priorities.map((item) => (
                <TouchableOpacity
                  key={item}
                  style={[styles.priorityChip, priority === item && styles.priorityChipActive]}
                  onPress={() => setPriority(item)}>
                  <Text style={[styles.priorityText, priority === item && styles.priorityTextActive]}>
                    {t(`priority.${item}`)}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            {error ? <Text style={styles.errorText}>{error}</Text> : null}

            <TouchableOpacity
              style={[styles.saveBtn, (!title.trim() || loading) && styles.saveBtnDisabled]}
              onPress={() => void onSave()}
              disabled={!title.trim() || loading}>
              {loading ? <ActivityIndicator color="#FFFFFF" /> : <Text style={styles.saveBtnText}>{t('common.save')}</Text>}
            </TouchableOpacity>
          </>
        )}
      </ScrollView>

      {showToast ? <Toast message={t('taskEditor.saveSuccess')} /> : null}
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
    minHeight: 110,
    paddingTop: 12,
  },
  priorityRow: {
    flexDirection: 'row',
    gap: 8,
  },
  priorityChip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  priorityChipActive: {
    borderColor: colors.primary,
    backgroundColor: colors.primarySoft,
  },
  priorityText: {
    color: colors.textMuted,
    fontWeight: '600',
    textTransform: 'capitalize',
  },
  priorityTextActive: {
    color: colors.primary,
  },
  errorText: {
    color: colors.danger,
    marginTop: 12,
    fontWeight: '600',
  },
  saveBtn: {
    marginTop: 26,
    height: 52,
    borderRadius: 12,
    backgroundColor: colors.primary,
    justifyContent: 'center',
    alignItems: 'center',
  },
  saveBtnDisabled: {
    opacity: 0.45,
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
