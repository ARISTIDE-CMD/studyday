import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { Toast } from '@/components/ui/toast';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { createTask, fetchTaskById, getCachedTaskById, updateTask } from '@/lib/student-api';
import { formatDateLabel, toIsoDate } from '@/lib/format';
import { useAuth } from '@/providers/auth-provider';

const priorities = ['low', 'medium', 'high'] as const;
type Priority = (typeof priorities)[number];

type CalendarCell = {
  iso: string | null;
  day: number | null;
  key: string;
};

function parseIsoDate(value: string | null | undefined): Date | null {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [year, month, day] = value.split('-').map((item) => Number(item));
  const date = new Date(year, month - 1, day);
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function moveMonth(date: Date, delta: number): Date {
  return new Date(date.getFullYear(), date.getMonth() + delta, 1);
}

function buildCalendarCells(monthDate: Date): CalendarCell[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const leading = (firstOfMonth.getDay() + 6) % 7;
  const totalCells = Math.ceil((leading + daysInMonth) / 7) * 7;
  const cells: CalendarCell[] = [];

  for (let index = 0; index < totalCells; index += 1) {
    const dayNumber = index - leading + 1;
    if (dayNumber < 1 || dayNumber > daysInMonth) {
      cells.push({ key: `empty-${index}`, day: null, iso: null });
      continue;
    }

    const date = new Date(year, month, dayNumber);
    cells.push({
      key: toIsoDate(date),
      day: dayNumber,
      iso: toIsoDate(date),
    });
  }

  return cells;
}

export default function TaskEditorScreen() {
  const { user } = useAuth();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const { taskId } = useLocalSearchParams<{ taskId?: string }>();

  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [dueDate, setDueDate] = useState(toIsoDate());
  const [calendarVisible, setCalendarVisible] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState<Date>(() => {
    const selected = parseIsoDate(toIsoDate());
    return new Date(selected?.getFullYear() ?? new Date().getFullYear(), selected?.getMonth() ?? new Date().getMonth(), 1);
  });
  const [priority, setPriority] = useState<Priority>('medium');
  const [isPersistent, setIsPersistent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [screenLoading, setScreenLoading] = useState(false);
  const [error, setError] = useState('');
  const [showToast, setShowToast] = useState(false);
  const styles = useMemo(() => createStyles(colors), [colors]);
  const selectedDate = useMemo(() => parseIsoDate(dueDate), [dueDate]);
  const monthLabel = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        month: 'long',
        year: 'numeric',
      }).format(calendarMonth),
    [calendarMonth, locale]
  );
  const weekdayLabels = useMemo(
    () => (locale.toLowerCase().startsWith('fr') ? ['L', 'M', 'M', 'J', 'V', 'S', 'D'] : ['M', 'T', 'W', 'T', 'F', 'S', 'S']),
    [locale]
  );
  const calendarCells = useMemo(() => buildCalendarCells(calendarMonth), [calendarMonth]);

  useEffect(() => {
    const run = async () => {
      if (!taskId || !user?.id) return;

      const applyTask = (data: {
        title: string;
        description: string | null;
        due_date: string | null;
        priority: Priority;
        is_persistent: boolean;
      }) => {
        setTitle(data.title);
        setDescription(data.description ?? '');
        setDueDate(data.due_date ?? toIsoDate());
        const selected = parseIsoDate(data.due_date ?? toIsoDate()) ?? new Date();
        setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
        setPriority(data.priority);
        setIsPersistent(Boolean(data.is_persistent));
      };

      try {
        setScreenLoading(true);
        const cached = await getCachedTaskById(user.id, taskId);
        if (cached) {
          applyTask(cached);
          setScreenLoading(false);
        }

        const data = await fetchTaskById(user.id, taskId);
        if (!data) return;

        applyTask(data);
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
          is_persistent: isPersistent,
        });
      } else {
        await createTask({
          userId: user.id,
          title: title.trim(),
          description,
          dueDate,
          priority,
          isPersistent,
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

  const openCalendar = () => {
    const selected = selectedDate ?? new Date();
    setCalendarMonth(new Date(selected.getFullYear(), selected.getMonth(), 1));
    setCalendarVisible(true);
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
            <TouchableOpacity style={styles.datePickerBtn} onPress={openCalendar}>
              <Ionicons name="calendar-outline" size={18} color={colors.primary} />
              <Text style={styles.datePickerText}>
                {formatDateLabel(dueDate, locale, t('common.noDate'))}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.textMuted} />
            </TouchableOpacity>

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

            <View style={styles.persistentRow}>
              <View style={styles.persistentTextWrap}>
                <Text style={styles.persistentLabel}>{t('taskEditor.fieldPersistent')}</Text>
                <Text style={styles.persistentHelp}>{t('taskEditor.persistentHelp')}</Text>
              </View>
              <Switch
                value={isPersistent}
                onValueChange={setIsPersistent}
                trackColor={{ false: colors.border, true: colors.primarySoft }}
                thumbColor={isPersistent ? colors.primary : '#FFFFFF'}
              />
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

      <Modal visible={calendarVisible} transparent animationType="fade" onRequestClose={() => setCalendarVisible(false)}>
        <Pressable style={styles.calendarOverlay} onPress={() => setCalendarVisible(false)}>
          <Pressable style={styles.calendarCard} onPress={(event) => event.stopPropagation()}>
            <View style={styles.calendarHeader}>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={() => setCalendarMonth((prev) => moveMonth(prev, -1))}>
                <Ionicons name="chevron-back" size={18} color={colors.text} />
              </TouchableOpacity>
              <Text style={styles.calendarMonthLabel}>{monthLabel}</Text>
              <TouchableOpacity style={styles.calendarNavBtn} onPress={() => setCalendarMonth((prev) => moveMonth(prev, 1))}>
                <Ionicons name="chevron-forward" size={18} color={colors.text} />
              </TouchableOpacity>
            </View>

            <View style={styles.calendarWeekRow}>
              {weekdayLabels.map((label) => (
                <Text key={label} style={styles.calendarWeekday}>
                  {label}
                </Text>
              ))}
            </View>

            <View style={styles.calendarGrid}>
              {calendarCells.map((cell) => {
                if (!cell.iso || !cell.day) {
                  return <View key={cell.key} style={styles.calendarCell} />;
                }

                const selected = dueDate === cell.iso;
                return (
                  <TouchableOpacity
                    key={cell.key}
                    style={[styles.calendarCell, styles.calendarDayBtn, selected && styles.calendarDayBtnActive]}
                    onPress={() => {
                      setDueDate(cell.iso as string);
                      setCalendarVisible(false);
                    }}>
                    <Text style={[styles.calendarDayText, selected && styles.calendarDayTextActive]}>{cell.day}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>

            <TouchableOpacity style={styles.calendarCloseBtn} onPress={() => setCalendarVisible(false)}>
              <Text style={styles.calendarCloseText}>{t('common.cancel')}</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

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
  datePickerBtn: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    minHeight: 50,
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  datePickerText: {
    flex: 1,
    color: colors.text,
    fontWeight: '600',
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
  persistentRow: {
    marginTop: 14,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  persistentTextWrap: {
    flex: 1,
  },
  persistentLabel: {
    color: colors.text,
    fontWeight: '700',
    marginBottom: 2,
  },
  persistentHelp: {
    color: colors.textMuted,
    fontSize: 12,
    lineHeight: 16,
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
  calendarOverlay: {
    flex: 1,
    backgroundColor: 'rgba(2,6,23,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 16,
  },
  calendarCard: {
    width: '100%',
    maxWidth: 420,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    padding: 14,
  },
  calendarHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 10,
  },
  calendarNavBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  calendarMonthLabel: {
    color: colors.text,
    fontWeight: '700',
    textTransform: 'capitalize',
  },
  calendarWeekRow: {
    flexDirection: 'row',
    marginBottom: 6,
  },
  calendarWeekday: {
    flex: 1,
    textAlign: 'center',
    color: colors.textMuted,
    fontWeight: '600',
    fontSize: 12,
  },
  calendarGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    rowGap: 6,
  },
  calendarCell: {
    width: '14.2857%',
    height: 38,
    alignItems: 'center',
    justifyContent: 'center',
  },
  calendarDayBtn: {
    borderRadius: 9,
  },
  calendarDayBtnActive: {
    backgroundColor: colors.primary,
  },
  calendarDayText: {
    color: colors.text,
    fontWeight: '600',
  },
  calendarDayTextActive: {
    color: '#FFFFFF',
    fontWeight: '700',
  },
  calendarCloseBtn: {
    marginTop: 12,
    alignSelf: 'flex-end',
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.background,
  },
  calendarCloseText: {
    color: colors.text,
    fontWeight: '700',
  },
  saveBtnText: {
    color: '#FFFFFF',
    fontWeight: '700',
    fontSize: 16,
  },
});
