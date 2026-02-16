import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useConnectivity } from '@/hooks/use-connectivity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { formatDateLabel, toIsoDate } from '@/lib/format';
import { fetchResources, fetchTasks, getCachedResources, getCachedTasks } from '@/lib/student-api';
import {
  deleteStudySchedulePlan,
  generateAndSaveStudySchedule,
  getCachedStudySchedulePlans,
  getDefaultStudySchedulePreferences,
  getLatestStudySchedulePlan,
  getStudySchedulePlans,
  resolveStudyPeriodEndDate,
  togglePinStudySchedulePlan,
} from '@/lib/study-schedule';
import { useAuth } from '@/providers/auth-provider';
import type {
  StudyDayKey,
  StudyPeriodPreset,
  StudySchedulePlan,
  StudySchedulePreferences,
  StudyScheduleSession,
  StudySlot,
} from '@/types/study-schedule';

type LoadPreset = 'light' | 'balanced' | 'intensive';

const PERIODS: StudyPeriodPreset[] = ['year', 'semester', 'trimester', 'custom'];
const DAY_ORDER: StudyDayKey[] = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const SLOT_ORDER: StudySlot[] = ['morning', 'afternoon', 'evening'];

const DAY_INDEX: Record<StudyDayKey, number> = {
  mon: 1,
  tue: 2,
  wed: 3,
  thu: 4,
  fri: 5,
  sat: 6,
  sun: 7,
};

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}

function parseIsoDate(value: string): Date | null {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  if (Number.isNaN(date.getTime())) return null;
  return date;
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toSlotIndex(slot: StudySlot): number {
  return SLOT_ORDER.indexOf(slot);
}

function getWeekIndex(startIso: string, targetIso: string): number {
  const start = parseIsoDate(startIso);
  const target = parseIsoDate(targetIso);
  if (!start || !target) return 0;
  const diffDays = Math.floor((target.getTime() - start.getTime()) / (24 * 60 * 60 * 1000));
  return Math.max(0, Math.floor(diffDays / 7));
}

function getWeekRange(startIso: string, endIso: string, weekIndex: number): { start: string; end: string } | null {
  const start = parseIsoDate(startIso);
  const end = parseIsoDate(endIso);
  if (!start || !end) return null;

  const rangeStart = addDays(start, weekIndex * 7);
  let rangeEnd = addDays(rangeStart, 6);
  if (rangeEnd.getTime() > end.getTime()) {
    rangeEnd = end;
  }

  return {
    start: rangeStart.toISOString().slice(0, 10),
    end: rangeEnd.toISOString().slice(0, 10),
  };
}

export default function SchedulePlannerScreen() {
  const { user } = useAuth();
  const isOnline = useConnectivity();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof getCachedTasks>>>([]);
  const [resources, setResources] = useState<Awaited<ReturnType<typeof getCachedResources>>>([]);
  const [preferences, setPreferences] = useState<StudySchedulePreferences>(() => getDefaultStudySchedulePreferences());
  const [plan, setPlan] = useState<StudySchedulePlan | null>(null);
  const [history, setHistory] = useState<StudySchedulePlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedWeekIndex, setSelectedWeekIndex] = useState(0);

  const isEditing = Boolean(plan?.id);

  const periodLabel = (preset: StudyPeriodPreset) => t(`schedulePlanner.period.${preset}`);
  const dayLabel = (day: StudyDayKey) => t(`schedulePlanner.day.${day}`);
  const slotLabel = (slot: StudySlot) => t(`schedulePlanner.slot.${slot}`);

  const loadAll = async () => {
    if (!user?.id) return;

    setLoading(true);
    setError('');

    try {
      const [cachedSchedules, latestPlan, cachedTasks, cachedResources] = await Promise.all([
        getCachedStudySchedulePlans(user.id),
        getLatestStudySchedulePlan(user.id),
        getCachedTasks(user.id),
        getCachedResources(user.id),
      ]);

      setHistory(cachedSchedules);
      setTasks(cachedTasks);
      setResources(cachedResources);

      if (latestPlan) {
        setPlan(latestPlan);
        setPreferences(latestPlan.preferences);
      }

      const remoteSchedules = await getStudySchedulePlans(user.id);
      setHistory(remoteSchedules);
      if (!latestPlan && remoteSchedules[0]) {
        setPlan(remoteSchedules[0]);
        setPreferences(remoteSchedules[0].preferences);
      }

      if (isOnline) {
        const [remoteTasks, remoteResources] = await Promise.all([fetchTasks(user.id), fetchResources(user.id)]);
        setTasks(remoteTasks);
        setResources(remoteResources);
      }
    } catch (err) {
      setError(getErrorMessage(err, t('schedulePlanner.loadError')));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  useEffect(() => {
    setSelectedWeekIndex(0);
  }, [plan?.id]);

  const updatePreferences = (next: Partial<StudySchedulePreferences>) => {
    setPreferences((previous) => {
      const merged = { ...previous, ...next };
      if (merged.periodPreset !== 'custom') {
        return { ...merged, customWeeks: null };
      }
      return { ...merged, customWeeks: clamp(merged.customWeeks ?? 6, 1, 104) };
    });
  };

  const applyPeriodPreset = (preset: StudyPeriodPreset) => {
    const customWeeks = preset === 'custom' ? clamp(preferences.customWeeks ?? 6, 1, 104) : null;
    const computedEnd = resolveStudyPeriodEndDate(preferences.startDate, preset, customWeeks);
    updatePreferences({
      periodPreset: preset,
      customWeeks,
      endDate: preferences.endDate || computedEnd,
    });
  };

  const toggleDay = (day: StudyDayKey) => {
    setPreferences((previous) => {
      const selected = previous.selectedDays.includes(day)
        ? previous.selectedDays.filter((item) => item !== day)
        : [...previous.selectedDays, day];

      const filtered = previous.includeWeekend ? selected : selected.filter((item) => item !== 'sat' && item !== 'sun');
      return {
        ...previous,
        selectedDays: filtered.length > 0 ? filtered : previous.selectedDays,
      };
    });
  };

  const applyLoadPreset = (preset: LoadPreset) => {
    if (preset === 'light') {
      updatePreferences({ sessionsPerWeek: 3, sessionMinutes: 40 });
      return;
    }
    if (preset === 'balanced') {
      updatePreferences({ sessionsPerWeek: 5, sessionMinutes: 50 });
      return;
    }
    updatePreferences({ sessionsPerWeek: 7, sessionMinutes: 60 });
  };

  const resetToNewPlan = () => {
    setPlan(null);
    setPreferences(getDefaultStudySchedulePreferences());
    setError('');
    setSelectedWeekIndex(0);
  };

  const handleSave = async () => {
    if (!user?.id) return;
    if (!preferences.title.trim()) {
      setError(t('schedulePlanner.requiredTitle'));
      return;
    }

    setSaving(true);
    setError('');

    try {
      const nextPlan = await generateAndSaveStudySchedule({
        userId: user.id,
        preferences,
        tasks,
        resources,
        existingPlanId: plan?.id,
      });
      setPlan(nextPlan);
      setPreferences(nextPlan.preferences);
      setHistory(await getStudySchedulePlans(user.id));
    } catch (err) {
      setError(getErrorMessage(err, t('schedulePlanner.generateError')));
    } finally {
      setSaving(false);
    }
  };

  const handleTogglePin = async () => {
    if (!user?.id || !plan) return;
    const nextPinned = !plan.is_pinned;

    const optimistic: StudySchedulePlan = { ...plan, is_pinned: nextPinned };
    setPlan(optimistic);
    setHistory((previous) => {
      const next = previous.map((item) => (item.id === optimistic.id ? optimistic : item));
      return next.sort((a, b) => (a.is_pinned === b.is_pinned ? b.updated_at.localeCompare(a.updated_at) : a.is_pinned ? -1 : 1));
    });

    try {
      await togglePinStudySchedulePlan(plan.id, user.id, nextPinned);
      setHistory(await getStudySchedulePlans(user.id));
    } catch (err) {
      setError(getErrorMessage(err, t('schedulePlanner.pinError')));
      setPlan(plan);
      setHistory((previous) => previous.map((item) => (item.id === plan.id ? plan : item)));
    }
  };

  const handleDelete = async () => {
    if (!user?.id || !plan) return;

    Alert.alert(t('schedulePlanner.deleteConfirmTitle'), t('schedulePlanner.deleteConfirmMessage'), [
      { text: t('common.cancel'), style: 'cancel' },
      {
        text: t('schedulePlanner.deleteAction'),
        style: 'destructive',
        onPress: () => {
          void (async () => {
            const deletedId = plan.id;
            const backup = plan;
            setPlan(null);
            setHistory((previous) => previous.filter((item) => item.id !== deletedId));
            try {
              await deleteStudySchedulePlan(deletedId, user.id);
              const refreshed = await getStudySchedulePlans(user.id);
              setHistory(refreshed);
              if (refreshed[0]) {
                setPlan(refreshed[0]);
                setPreferences(refreshed[0].preferences);
              } else {
                setPreferences(getDefaultStudySchedulePreferences());
              }
            } catch (err) {
              setError(getErrorMessage(err, t('schedulePlanner.deleteError')));
              setPlan(backup);
              setHistory((previous) => [backup, ...previous]);
            }
          })();
        },
      },
    ]);
  };

  const copyPlan = async () => {
    if (!plan) return;
    const rows = [
      `${t('schedulePlanner.summaryTitle')}: ${plan.title}`,
      `${t('schedulePlanner.summaryRange')}: ${plan.summary.startDate} -> ${plan.summary.endDate}`,
      `${t('schedulePlanner.summarySessions')}: ${plan.summary.totalSessions}`,
      `${t('schedulePlanner.summaryHours')}: ${plan.summary.totalHours}`,
      `${t('schedulePlanner.summaryWeeks')}: ${plan.summary.totalWeeks}`,
      '',
      ...plan.sessions.slice(0, 120).map((session) => {
        return `- ${session.date} | ${dayLabel(session.day)} | ${slotLabel(session.slot)} | ${session.durationMinutes} min | ${session.focus}`;
      }),
    ];

    try {
      await Clipboard.setStringAsync(rows.join('\n'));
      Alert.alert(t('schedulePlanner.copyTitle'), t('schedulePlanner.copySuccess'));
    } catch {
      Alert.alert(t('common.genericError'), t('resourceEditor.copyUnavailable'));
    }
  };

  const openInAi = () => {
    const seed = [
      `Objectif: ${preferences.goal || preferences.title}`,
      `Periode: ${periodLabel(preferences.periodPreset)}`,
      `Debut: ${preferences.startDate}`,
      `Fin: ${preferences.endDate}`,
      `Sessions/semaine: ${preferences.sessionsPerWeek}`,
      `Minutes/session: ${preferences.sessionMinutes}`,
      `Jours: ${preferences.selectedDays.map(dayLabel).join(', ')}`,
    ].join('\n');
    router.push(`/ai-toolbox?feature=weekly_planning&seed=${encodeURIComponent(seed)}&autorun=1`);
  };

  const displayedDays = useMemo(() => {
    const source = plan?.preferences.selectedDays ?? preferences.selectedDays;
    const unique: StudyDayKey[] = [];
    for (const day of source) {
      if (!DAY_ORDER.includes(day) || unique.includes(day)) continue;
      unique.push(day);
    }
    if (!unique.length) {
      return ['mon', 'tue', 'wed', 'thu', 'fri'] as StudyDayKey[];
    }
    return unique.sort((a, b) => DAY_INDEX[a] - DAY_INDEX[b]);
  }, [plan?.preferences.selectedDays, preferences.selectedDays]);

  const weeklySessions = useMemo(() => {
    if (!plan) return [] as StudyScheduleSession[][];
    const totalWeeks = Math.max(1, plan.summary.totalWeeks);
    const buckets = Array.from({ length: totalWeeks }, () => [] as StudyScheduleSession[]);

    for (const session of plan.sessions) {
      const index = getWeekIndex(plan.summary.startDate, session.date);
      if (index < 0 || index >= buckets.length) continue;
      buckets[index].push(session);
    }

    for (const bucket of buckets) {
      bucket.sort((a, b) => {
        const byDate = a.date.localeCompare(b.date);
        if (byDate !== 0) return byDate;
        return toSlotIndex(a.slot) - toSlotIndex(b.slot);
      });
    }

    return buckets;
  }, [plan]);

  const weekCount = Math.max(1, weeklySessions.length);

  useEffect(() => {
    if (selectedWeekIndex <= weekCount - 1) return;
    setSelectedWeekIndex(Math.max(0, weekCount - 1));
  }, [selectedWeekIndex, weekCount]);

  const currentWeekSessions = useMemo(
    () => weeklySessions[selectedWeekIndex] ?? [],
    [selectedWeekIndex, weeklySessions]
  );

  const currentWeekRange = useMemo(() => {
    if (!plan) return null;
    return getWeekRange(plan.summary.startDate, plan.summary.endDate, selectedWeekIndex);
  }, [plan, selectedWeekIndex]);

  const sessionCellMap = useMemo(() => {
    const map = new Map<string, StudyScheduleSession[]>();
    for (const session of currentWeekSessions) {
      const key = `${session.day}:${session.slot}`;
      const current = map.get(key) ?? [];
      current.push(session);
      map.set(key, current);
    }
    return map;
  }, [currentWeekSessions]);

  const tableMinWidth = 84 + displayedDays.length * 132;

  const openSessionDetails = (day: StudyDayKey, slot: StudySlot) => {
    const sessions = sessionCellMap.get(`${day}:${slot}`) ?? [];
    if (!sessions.length) return;

    const details = sessions
      .map((session, index) => {
        const formattedDate = formatDateLabel(session.date, locale, session.date);
        return `${index + 1}. ${formattedDate}\n${session.focus}\n${session.durationMinutes} min`;
      })
      .join('\n\n');

    Alert.alert(t('schedulePlanner.sessionDetailTitle', { day: dayLabel(day), slot: slotLabel(slot) }), details);
  };

  return (
    <View style={styles.page}>
      <View style={styles.stickyHeader}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('schedulePlanner.title')}</Text>
        <Text style={styles.subtitle}>{t('schedulePlanner.subtitle')}</Text>

        <View style={styles.headerMetaRow}>
          <View style={[styles.statusPill, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusPillText}>{isOnline ? t('aiToolbox.networkOnline') : t('aiToolbox.networkOffline')}</Text>
          </View>
          <Text style={styles.contextText}>{t('schedulePlanner.contextCount', { tasks: tasks.length, resources: resources.length })}</Text>
        </View>
      </View>

      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {loading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : (
          <>
            <View style={[styles.card, styles.setupCard]}>
              <View style={styles.setupHeaderRow}>
                <Text style={styles.sectionTitle}>{t('schedulePlanner.setupTitle')}</Text>
                <TouchableOpacity style={styles.smallActionBtn} onPress={resetToNewPlan}>
                  <Ionicons name="add-circle-outline" size={16} color={colors.text} />
                  <Text style={styles.smallActionText}>{t('schedulePlanner.newPlanAction')}</Text>
                </TouchableOpacity>
              </View>

              <Text style={styles.label}>{t('schedulePlanner.fieldTitle')}</Text>
              <TextInput
                style={styles.input}
                value={preferences.title}
                onChangeText={(text) => updatePreferences({ title: text })}
                placeholder={t('schedulePlanner.titlePlaceholder')}
                placeholderTextColor={colors.textMuted}
              />

              <Text style={styles.label}>{t('schedulePlanner.fieldGoal')}</Text>
              <TextInput
                style={[styles.input, styles.textArea]}
                value={preferences.goal}
                onChangeText={(text) => updatePreferences({ goal: text })}
                placeholder={t('schedulePlanner.goalPlaceholder')}
                placeholderTextColor={colors.textMuted}
                multiline
                textAlignVertical="top"
              />

              <Text style={styles.label}>{t('schedulePlanner.fieldPeriod')}</Text>
              <View style={styles.chipWrap}>
                {PERIODS.map((preset) => {
                  const active = preferences.periodPreset === preset;
                  return (
                    <TouchableOpacity
                      key={preset}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => applyPeriodPreset(preset)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{periodLabel(preset)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <View style={styles.inlineMetaRow}>
                <View style={styles.inlineMetaCard}>
                  <Text style={styles.inlineMetaLabel}>{t('schedulePlanner.fieldStartDate')}</Text>
                  <TextInput
                    style={styles.compactInput}
                    value={preferences.startDate}
                    onChangeText={(text) => updatePreferences({ startDate: text.trim() || toIsoDate() })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
                <View style={styles.inlineMetaCard}>
                  <Text style={styles.inlineMetaLabel}>{t('schedulePlanner.fieldEndDate')}</Text>
                  <TextInput
                    style={styles.compactInput}
                    value={preferences.endDate}
                    onChangeText={(text) => updatePreferences({ endDate: text.trim() || toIsoDate() })}
                    placeholder="YYYY-MM-DD"
                    placeholderTextColor={colors.textMuted}
                    autoCapitalize="none"
                    autoCorrect={false}
                  />
                </View>
              </View>

              {preferences.periodPreset === 'custom' ? (
                <>
                  <Text style={styles.label}>{t('schedulePlanner.fieldCustomWeeks')}</Text>
                  <TextInput
                    style={styles.input}
                    value={String(preferences.customWeeks ?? 6)}
                    onChangeText={(text) => {
                      const parsed = Number(text.replace(/[^0-9]/g, ''));
                      updatePreferences({ customWeeks: Number.isFinite(parsed) ? parsed : 6 });
                    }}
                    keyboardType="number-pad"
                    placeholder="6"
                    placeholderTextColor={colors.textMuted}
                  />
                </>
              ) : null}

              <View style={styles.inlineMetaRow}>
                <View style={styles.inlineMetaCard}>
                  <Text style={styles.inlineMetaLabel}>{t('schedulePlanner.fieldSessionMinutes')}</Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updatePreferences({ sessionMinutes: clamp(preferences.sessionMinutes - 5, 15, 240) })}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{preferences.sessionMinutes}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updatePreferences({ sessionMinutes: clamp(preferences.sessionMinutes + 5, 15, 240) })}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
                <View style={styles.inlineMetaCard}>
                  <Text style={styles.inlineMetaLabel}>{t('schedulePlanner.fieldSessionsPerWeek')}</Text>
                  <View style={styles.stepperRow}>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updatePreferences({ sessionsPerWeek: clamp(preferences.sessionsPerWeek - 1, 1, 21) })}>
                      <Ionicons name="remove" size={16} color={colors.text} />
                    </TouchableOpacity>
                    <Text style={styles.stepperValue}>{preferences.sessionsPerWeek}</Text>
                    <TouchableOpacity
                      style={styles.stepperBtn}
                      onPress={() => updatePreferences({ sessionsPerWeek: clamp(preferences.sessionsPerWeek + 1, 1, 21) })}>
                      <Ionicons name="add" size={16} color={colors.text} />
                    </TouchableOpacity>
                  </View>
                </View>
              </View>

              <Text style={styles.label}>{t('schedulePlanner.intensityLabel')}</Text>
              <View style={styles.chipWrap}>
                {(['light', 'balanced', 'intensive'] as const).map((preset) => (
                  <TouchableOpacity key={preset} style={styles.chip} onPress={() => applyLoadPreset(preset)}>
                    <Text style={styles.chipText}>{t(`schedulePlanner.intensity.${preset}`)}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <View style={styles.switchRow}>
                <View style={styles.switchTextWrap}>
                  <Text style={styles.switchTitle}>{t('schedulePlanner.includeWeekend')}</Text>
                  <Text style={styles.switchHint}>{t('schedulePlanner.includeWeekendHint')}</Text>
                </View>
                <Switch
                  value={preferences.includeWeekend}
                  onValueChange={(value) => {
                    const nextDays = value
                      ? preferences.selectedDays
                      : preferences.selectedDays.filter((day) => day !== 'sat' && day !== 'sun');
                    updatePreferences({
                      includeWeekend: value,
                      selectedDays: nextDays.length > 0 ? nextDays : ['mon', 'tue', 'wed', 'thu', 'fri'],
                    });
                  }}
                  trackColor={{ false: colors.border, true: colors.primarySoft }}
                  thumbColor={preferences.includeWeekend ? colors.primary : '#FFFFFF'}
                />
              </View>

              <Text style={styles.label}>{t('schedulePlanner.fieldDays')}</Text>
              <View style={styles.chipWrap}>
                {DAY_ORDER.map((day) => {
                  if (!preferences.includeWeekend && (day === 'sat' || day === 'sun')) return null;
                  const active = preferences.selectedDays.includes(day);
                  return (
                    <TouchableOpacity key={day} style={[styles.chip, active && styles.chipActive]} onPress={() => toggleDay(day)}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{dayLabel(day)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              <Text style={styles.label}>{t('schedulePlanner.fieldSlot')}</Text>
              <View style={styles.chipWrap}>
                {SLOT_ORDER.map((slot) => {
                  const active = preferences.preferredSlot === slot;
                  return (
                    <TouchableOpacity
                      key={slot}
                      style={[styles.chip, active && styles.chipActive]}
                      onPress={() => updatePreferences({ preferredSlot: slot })}>
                      <Text style={[styles.chipText, active && styles.chipTextActive]}>{slotLabel(slot)}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>

              {error ? <Text style={styles.errorText}>{error}</Text> : null}

              <TouchableOpacity style={[styles.generateButton, saving && styles.disabled]} onPress={() => void handleSave()} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#FFFFFF" />
                ) : (
                  <Text style={styles.generateButtonText}>{isEditing ? t('schedulePlanner.updateAction') : t('schedulePlanner.generate')}</Text>
                )}
              </TouchableOpacity>
            </View>

            {plan ? (
              <View style={styles.card}>
                <View style={styles.summaryHeaderRow}>
                  <Text style={styles.sectionTitle}>{t('schedulePlanner.summaryTitle')}</Text>
                  {plan.is_pinned ? (
                    <View style={styles.pinnedBadge}>
                      <Ionicons name="pin" size={12} color={colors.primary} />
                      <Text style={styles.pinnedBadgeText}>{t('schedulePlanner.pinned')}</Text>
                    </View>
                  ) : null}
                </View>

                <View style={styles.summaryGrid}>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>{t('schedulePlanner.summarySessions')}</Text>
                    <Text style={styles.summaryValue}>{plan.summary.totalSessions}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>{t('schedulePlanner.summaryHours')}</Text>
                    <Text style={styles.summaryValue}>{plan.summary.totalHours}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>{t('schedulePlanner.summaryWeeks')}</Text>
                    <Text style={styles.summaryValue}>{plan.summary.totalWeeks}</Text>
                  </View>
                  <View style={styles.summaryCell}>
                    <Text style={styles.summaryLabel}>{t('schedulePlanner.summaryRange')}</Text>
                    <Text style={styles.summaryValueSmall}>
                      {formatDateLabel(plan.summary.startDate, locale, plan.summary.startDate)}
                      {' -> '}
                      {formatDateLabel(plan.summary.endDate, locale, plan.summary.endDate)}
                    </Text>
                  </View>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void copyPlan()}>
                    <Ionicons name="copy-outline" size={16} color={colors.text} />
                    <Text style={styles.secondaryButtonText}>{t('schedulePlanner.copy')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={openInAi}>
                    <Ionicons name="sparkles-outline" size={16} color={colors.text} />
                    <Text style={styles.secondaryButtonText}>{t('schedulePlanner.openInAi')}</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.actionsRow}>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleTogglePin()}>
                    <Ionicons name={plan.is_pinned ? 'pin-outline' : 'pin'} size={16} color={colors.text} />
                    <Text style={styles.secondaryButtonText}>{plan.is_pinned ? t('schedulePlanner.unpinAction') : t('schedulePlanner.pinAction')}</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.secondaryButton} onPress={() => void handleDelete()}>
                    <Ionicons name="trash-outline" size={16} color={colors.danger} />
                    <Text style={[styles.secondaryButtonText, { color: colors.danger }]}>{t('schedulePlanner.deleteAction')}</Text>
                  </TouchableOpacity>
                </View>

                <Text style={styles.tableTitle}>{t('schedulePlanner.tableTitle')}</Text>

                <View style={styles.weekNavRow}>
                  <TouchableOpacity
                    style={[styles.weekNavButton, selectedWeekIndex <= 0 && styles.disabled]}
                    onPress={() => setSelectedWeekIndex((previous) => Math.max(0, previous - 1))}
                    disabled={selectedWeekIndex <= 0}>
                    <Ionicons name="chevron-back" size={16} color={colors.text} />
                    <Text style={styles.weekNavText}>{t('schedulePlanner.weekPrev')}</Text>
                  </TouchableOpacity>

                  <View style={styles.weekCenter}>
                    <Text style={styles.weekLabel}>{t('schedulePlanner.weekLabel', { count: selectedWeekIndex + 1 })}</Text>
                    {currentWeekRange ? (
                      <Text style={styles.weekRange}>
                        {formatDateLabel(currentWeekRange.start, locale, currentWeekRange.start)}
                        {' -> '}
                        {formatDateLabel(currentWeekRange.end, locale, currentWeekRange.end)}
                      </Text>
                    ) : null}
                  </View>

                  <TouchableOpacity
                    style={[styles.weekNavButton, selectedWeekIndex >= weekCount - 1 && styles.disabled]}
                    onPress={() => setSelectedWeekIndex((previous) => Math.min(weekCount - 1, previous + 1))}
                    disabled={selectedWeekIndex >= weekCount - 1}>
                    <Text style={styles.weekNavText}>{t('schedulePlanner.weekNext')}</Text>
                    <Ionicons name="chevron-forward" size={16} color={colors.text} />
                  </TouchableOpacity>
                </View>

                <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                  <View style={[styles.tableWrap, { minWidth: tableMinWidth }]}>
                    <View style={styles.tableHeaderRow}>
                      <View style={styles.slotHeaderCell}>
                        <Text style={styles.slotHeaderText}>{t('schedulePlanner.tableSlotHeader')}</Text>
                      </View>
                      {displayedDays.map((day) => (
                        <View key={`header-${day}`} style={styles.dayHeaderCell}>
                          <Text style={styles.dayHeaderText}>{dayLabel(day)}</Text>
                        </View>
                      ))}
                    </View>

                    {SLOT_ORDER.map((slot) => (
                      <View key={`row-${slot}`} style={styles.tableRow}>
                        <View style={styles.slotCell}>
                          <Text style={styles.slotCellText}>{slotLabel(slot)}</Text>
                        </View>

                        {displayedDays.map((day) => {
                          const cellSessions = sessionCellMap.get(`${day}:${slot}`) ?? [];
                          const first = cellSessions[0];
                          const empty = !first;

                          return (
                            <TouchableOpacity
                              key={`cell-${slot}-${day}`}
                              style={[styles.sessionCell, empty && styles.sessionCellEmpty]}
                              onPress={() => openSessionDetails(day, slot)}
                              disabled={empty}>
                              {first ? (
                                <>
                                  <Text style={styles.sessionFocus} numberOfLines={2}>
                                    {first.focus}
                                  </Text>
                                  <Text style={styles.sessionTime}>{first.durationMinutes} min</Text>
                                  {cellSessions.length > 1 ? <Text style={styles.sessionMore}>+{cellSessions.length - 1}</Text> : null}
                                </>
                              ) : (
                                <Text style={styles.emptySlotText}>{t('schedulePlanner.tableEmptySlot')}</Text>
                              )}
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    ))}
                  </View>
                </ScrollView>
              </View>
            ) : null}

            {history.length > 0 ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>{t('schedulePlanner.historyTitle')}</Text>
                {history.slice(0, 6).map((item) => (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.historyRow}
                    onPress={() => {
                      setPlan(item);
                      setPreferences(item.preferences);
                    }}>
                    <View style={styles.historyMain}>
                      <Text style={styles.historyTitle}>{item.title}</Text>
                      <Text style={styles.historyMeta}>
                        {formatDateLabel(item.summary.startDate, locale, item.summary.startDate)}
                        {' -> '}
                        {formatDateLabel(item.summary.endDate, locale, item.summary.endDate)}
                      </Text>
                    </View>
                    <View style={styles.historyTail}>
                      {item.is_pinned ? <Ionicons name="pin" size={13} color={colors.primary} /> : null}
                      <Text style={styles.historyBadge}>{item.summary.totalSessions}</Text>
                    </View>
                  </TouchableOpacity>
                ))}
              </View>
            ) : null}
          </>
        )}
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
    stickyHeader: {
      backgroundColor: colors.background,
      paddingTop: 56,
      paddingHorizontal: 16,
      paddingBottom: 10,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: colors.border,
    },
    content: {
      paddingTop: 12,
      paddingHorizontal: 16,
      paddingBottom: 120,
      gap: 12,
    },
    backButton: {
      alignSelf: 'flex-start',
      flexDirection: 'row',
      alignItems: 'center',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 10,
      paddingVertical: 7,
    },
    backLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    title: {
      color: colors.text,
      fontSize: 28,
      lineHeight: 34,
      fontWeight: '800',
      marginTop: 6,
    },
    subtitle: {
      color: colors.textMuted,
      marginTop: 2,
      marginBottom: 4,
    },
    headerMetaRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
      marginBottom: 2,
    },
    statusPill: {
      borderRadius: 999,
      paddingHorizontal: 10,
      paddingVertical: 5,
    },
    statusOnline: {
      backgroundColor: colors.success,
    },
    statusOffline: {
      backgroundColor: colors.warning,
    },
    statusPillText: {
      color: '#FFFFFF',
      fontSize: 11,
      fontWeight: '700',
    },
    contextText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    loadingWrap: {
      paddingTop: 30,
      alignItems: 'center',
    },
    card: {
      backgroundColor: colors.surface,
      borderRadius: 16,
      borderWidth: 1,
      borderColor: colors.border,
      padding: 14,
      gap: 10,
    },
    setupCard: {
      borderWidth: 0,
      paddingHorizontal: 0,
      paddingVertical: 0,
      backgroundColor: 'transparent',
    },
    setupHeaderRow: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      gap: 8,
    },
    sectionTitle: {
      color: colors.text,
      fontSize: 18,
      fontWeight: '800',
    },
    smallActionBtn: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 9,
      paddingVertical: 6,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    smallActionText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    label: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
      marginBottom: -2,
    },
    input: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    compactInput: {
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: 10,
      paddingVertical: 8,
      fontSize: 13,
    },
    textArea: {
      minHeight: 86,
    },
    chipWrap: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    chip: {
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      borderRadius: 999,
      paddingHorizontal: 11,
      paddingVertical: 7,
    },
    chipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    chipText: {
      color: colors.text,
      fontWeight: '600',
      fontSize: 12,
    },
    chipTextActive: {
      color: colors.primary,
      fontWeight: '700',
    },
    inlineMetaRow: {
      flexDirection: 'row',
      gap: 8,
    },
    inlineMetaCard: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 12,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 8,
    },
    inlineMetaLabel: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    stepperRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 10,
      alignSelf: 'flex-start',
    },
    stepperBtn: {
      width: 30,
      height: 30,
      borderRadius: 8,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    stepperValue: {
      color: colors.text,
      minWidth: 40,
      textAlign: 'center',
      fontWeight: '800',
      fontSize: 15,
    },
    switchRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
    },
    switchTextWrap: {
      flex: 1,
    },
    switchTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 13,
    },
    switchHint: {
      color: colors.textMuted,
      marginTop: 2,
      fontSize: 12,
    },
    errorText: {
      color: colors.danger,
      fontWeight: '600',
    },
    generateButton: {
      borderRadius: 12,
      backgroundColor: colors.primary,
      paddingVertical: 11,
      alignItems: 'center',
      justifyContent: 'center',
    },
    generateButtonText: {
      color: '#FFFFFF',
      fontWeight: '800',
      fontSize: 14,
    },
    disabled: {
      opacity: 0.6,
    },
    summaryHeaderRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    pinnedBadge: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      backgroundColor: colors.primarySoft,
      paddingHorizontal: 8,
      paddingVertical: 4,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 4,
    },
    pinnedBadgeText: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '700',
    },
    summaryGrid: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      gap: 8,
    },
    summaryCell: {
      width: '48%',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 10,
      gap: 5,
    },
    summaryLabel: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
      textTransform: 'uppercase',
      letterSpacing: 0.3,
    },
    summaryValue: {
      color: colors.text,
      fontSize: 20,
      fontWeight: '800',
    },
    summaryValueSmall: {
      color: colors.text,
      fontWeight: '700',
      lineHeight: 18,
    },
    actionsRow: {
      flexDirection: 'row',
      gap: 8,
    },
    secondaryButton: {
      flex: 1,
      borderWidth: 1,
      borderColor: colors.border,
      borderRadius: 10,
      backgroundColor: colors.background,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 6,
      paddingVertical: 10,
    },
    secondaryButtonText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    tableTitle: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 14,
      marginTop: 4,
    },
    weekNavRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 8,
    },
    weekNavButton: {
      minWidth: 86,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      paddingHorizontal: 8,
      paddingVertical: 7,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
    },
    weekNavText: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
    },
    weekCenter: {
      flex: 1,
      alignItems: 'center',
    },
    weekLabel: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 13,
    },
    weekRange: {
      color: colors.textMuted,
      fontSize: 11,
      marginTop: 2,
    },
    tableWrap: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.background,
    },
    tableHeaderRow: {
      flexDirection: 'row',
      backgroundColor: colors.surface,
    },
    slotHeaderCell: {
      width: 84,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    slotHeaderText: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '700',
    },
    dayHeaderCell: {
      width: 132,
      paddingVertical: 10,
      paddingHorizontal: 8,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
    },
    dayHeaderText: {
      color: colors.text,
      fontWeight: '700',
      fontSize: 12,
    },
    tableRow: {
      flexDirection: 'row',
      borderTopWidth: 1,
      borderTopColor: colors.border,
      minHeight: 94,
    },
    slotCell: {
      width: 84,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: 6,
      backgroundColor: colors.surface,
    },
    slotCellText: {
      color: colors.textMuted,
      fontWeight: '700',
      fontSize: 12,
      textAlign: 'center',
    },
    sessionCell: {
      width: 132,
      borderRightWidth: 1,
      borderRightColor: colors.border,
      padding: 8,
      gap: 5,
      justifyContent: 'center',
      backgroundColor: colors.primarySoft,
    },
    sessionCellEmpty: {
      backgroundColor: colors.background,
      justifyContent: 'center',
      alignItems: 'center',
    },
    sessionFocus: {
      color: colors.text,
      fontSize: 12,
      fontWeight: '700',
      lineHeight: 16,
    },
    sessionTime: {
      color: colors.textMuted,
      fontSize: 11,
      fontWeight: '600',
    },
    sessionMore: {
      color: colors.primary,
      fontSize: 11,
      fontWeight: '800',
    },
    emptySlotText: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    historyRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.background,
      padding: 10,
      gap: 8,
    },
    historyMain: {
      flex: 1,
      gap: 2,
    },
    historyTitle: {
      color: colors.text,
      fontWeight: '700',
    },
    historyMeta: {
      color: colors.textMuted,
      fontSize: 12,
    },
    historyTail: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 6,
    },
    historyBadge: {
      minWidth: 32,
      textAlign: 'center',
      color: colors.primary,
      fontWeight: '800',
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.primarySoft,
      backgroundColor: colors.primarySoft,
      paddingVertical: 3,
      paddingHorizontal: 8,
    },
  });
