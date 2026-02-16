import { Ionicons } from '@expo/vector-icons';
import * as Clipboard from 'expo-clipboard';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';

import { useConnectivity } from '@/hooks/use-connectivity';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { runAiToolbox, type AiFeatureId } from '@/lib/ai-toolbox';
import { getErrorMessage } from '@/lib/errors';
import {
  fetchResources,
  fetchTasks,
  getCachedResources,
  getCachedTasks,
} from '@/lib/student-api';
import { useAuth } from '@/providers/auth-provider';

type FeatureOption = {
  id: AiFeatureId;
  labelKey: string;
};

const FEATURE_OPTIONS: FeatureOption[] = [
  { id: 'task_breakdown', labelKey: 'aiToolbox.featureTaskBreakdown' },
  { id: 'auto_prioritization', labelKey: 'aiToolbox.featureAutoPrioritization' },
  { id: 'weekly_planning', labelKey: 'aiToolbox.featureWeeklyPlanning' },
  { id: 'notes_rewrite', labelKey: 'aiToolbox.featureNotesRewrite' },
  { id: 'quiz_generator', labelKey: 'aiToolbox.featureQuizGenerator' },
  { id: 'duplicate_detection', labelKey: 'aiToolbox.featureDuplicateDetection' },
  { id: 'focus_coach', labelKey: 'aiToolbox.featureFocusCoach' },
  { id: 'smart_reminders', labelKey: 'aiToolbox.featureSmartReminders' },
  { id: 'semantic_search', labelKey: 'aiToolbox.featureSemanticSearch' },
  { id: 'progress_feedback', labelKey: 'aiToolbox.featureProgressFeedback' },
  { id: 'title_tag_suggestion', labelKey: 'aiToolbox.featureTitleTagSuggestion' },
  { id: 'exam_mode', labelKey: 'aiToolbox.featureExamMode' },
  { id: 'simplify_document', labelKey: 'aiToolbox.featureSimplifyDocument' },
  { id: 'translate_rephrase', labelKey: 'aiToolbox.featureTranslateRephrase' },
  { id: 'anti_procrastination', labelKey: 'aiToolbox.featureAntiProcrastination' },
];

function isAiFeatureId(value: string): value is AiFeatureId {
  return FEATURE_OPTIONS.some((option) => option.id === value);
}

export default function AiToolboxScreen() {
  const { user } = useAuth();
  const params = useLocalSearchParams<{ feature?: string; seed?: string; autorun?: string }>();
  const isOnline = useConnectivity();
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const styles = useMemo(() => createStyles(colors), [colors]);

  const [selected, setSelected] = useState<AiFeatureId>('task_breakdown');
  const [input, setInput] = useState('');
  const [output, setOutput] = useState('');
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(true);
  const [statusMode, setStatusMode] = useState<'online' | 'offline' | null>(null);
  const [statusText, setStatusText] = useState('');
  const [tasks, setTasks] = useState<Awaited<ReturnType<typeof getCachedTasks>>>([]);
  const [resources, setResources] = useState<Awaited<ReturnType<typeof getCachedResources>>>([]);
  const [autoRan, setAutoRan] = useState(false);

  useEffect(() => {
    const feature = params.feature?.trim();
    if (feature && isAiFeatureId(feature)) {
      setSelected(feature);
    }
    if (typeof params.seed === 'string' && params.seed.trim()) {
      setInput(params.seed.trim());
    }
    setAutoRan(false);
  }, [params.autorun, params.feature, params.seed]);

  useEffect(() => {
    const run = async () => {
      if (!user?.id) {
        setContextLoading(false);
        return;
      }

      try {
        setContextLoading(true);
        const [cachedTasks, cachedResources] = await Promise.all([
          getCachedTasks(user.id),
          getCachedResources(user.id),
        ]);
        setTasks(cachedTasks);
        setResources(cachedResources);
      } finally {
        setContextLoading(false);
      }

      if (!isOnline) return;

      try {
        const [remoteTasks, remoteResources] = await Promise.all([
          fetchTasks(user.id),
          fetchResources(user.id),
        ]);
        setTasks(remoteTasks);
        setResources(remoteResources);
      } catch {
        // Keep offline-first context from cache.
      }
    };

    void run();
  }, [isOnline, user?.id]);

  const runFeature = useCallback(async () => {
    if (!user?.id) return;
    setLoading(true);
    setStatusText('');

    try {
      const result = await runAiToolbox({
        featureId: selected,
        input,
        locale,
        tasks,
        resources,
        preferOnline: isOnline,
      });
      setOutput(result.text);
      setStatusMode(result.mode);
      if (result.mode === 'offline') {
        setStatusText(t('aiToolbox.offlineFallback'));
      } else {
        setStatusText(t('aiToolbox.onlineReady'));
      }
    } catch (error) {
      setStatusMode('offline');
      setStatusText(getErrorMessage(error, t('aiToolbox.runError')));
    } finally {
      setLoading(false);
    }
  }, [input, isOnline, locale, resources, selected, t, tasks, user?.id]);

  useEffect(() => {
    if (!user?.id || contextLoading || loading || autoRan) return;
    if (params.autorun !== '1') return;
    setAutoRan(true);
    void runFeature();
  }, [autoRan, contextLoading, loading, params.autorun, runFeature, user?.id]);

  const copyOutput = async () => {
    if (!output.trim()) return;
    try {
      await Clipboard.setStringAsync(output);
      Alert.alert(t('aiToolbox.copyTitle'), t('aiToolbox.copySuccess'));
    } catch {
      Alert.alert(t('common.genericError'), t('resourceEditor.copyUnavailable'));
    }
  };

  return (
    <View style={styles.page}>
      <ScrollView contentContainerStyle={styles.content}>
        <TouchableOpacity style={styles.backButton} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={18} color={colors.text} />
          <Text style={styles.backLabel}>{t('common.back')}</Text>
        </TouchableOpacity>

        <Text style={styles.title}>{t('aiToolbox.title')}</Text>
        <Text style={styles.subtitle}>{t('aiToolbox.subtitle')}</Text>

        <View style={styles.infoRow}>
          <View style={[styles.statusPill, isOnline ? styles.statusOnline : styles.statusOffline]}>
            <Text style={styles.statusPillText}>{isOnline ? t('aiToolbox.networkOnline') : t('aiToolbox.networkOffline')}</Text>
          </View>
          <Text style={styles.contextCount}>
            {t('aiToolbox.contextCount', { tasks: tasks.length, resources: resources.length })}
          </Text>
        </View>

        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.featuresRow}>
          {FEATURE_OPTIONS.map((option) => {
            const active = selected === option.id;
            return (
              <TouchableOpacity
                key={option.id}
                style={[styles.featureChip, active && styles.featureChipActive]}
                onPress={() => setSelected(option.id)}>
                <Text style={[styles.featureChipText, active && styles.featureChipTextActive]}>{t(option.labelKey)}</Text>
              </TouchableOpacity>
            );
          })}
        </ScrollView>

        <Text style={styles.label}>{t('aiToolbox.inputLabel')}</Text>
        <TextInput
          style={styles.input}
          value={input}
          onChangeText={setInput}
          multiline
          textAlignVertical="top"
          placeholder={t('aiToolbox.inputPlaceholder')}
          placeholderTextColor={colors.textMuted}
        />

        <TouchableOpacity
          style={[styles.runButton, (loading || contextLoading) && styles.disabled]}
          onPress={() => void runFeature()}
          disabled={loading || contextLoading}>
          {loading ? (
            <ActivityIndicator color="#FFFFFF" />
          ) : (
            <Text style={styles.runButtonText}>{t('aiToolbox.run')}</Text>
          )}
        </TouchableOpacity>

        {contextLoading ? (
          <View style={styles.contextLoadingWrap}>
            <ActivityIndicator color={colors.primary} />
          </View>
        ) : null}

        {statusText ? (
          <View style={styles.statusWrap}>
            <Text style={styles.statusLabel}>{statusText}</Text>
            {statusMode ? (
              <Text style={styles.statusModeText}>
                {statusMode === 'online' ? t('aiToolbox.modeOnline') : t('aiToolbox.modeOffline')}
              </Text>
            ) : null}
          </View>
        ) : null}

        <Text style={styles.label}>{t('aiToolbox.outputLabel')}</Text>
        <View style={styles.outputCard}>
          <Text style={styles.outputText}>{output || t('aiToolbox.outputEmpty')}</Text>
        </View>

        <TouchableOpacity
          style={[styles.copyButton, !output.trim() && styles.disabled]}
          disabled={!output.trim()}
          onPress={() => void copyOutput()}>
          <Ionicons name="copy-outline" size={16} color={colors.text} />
          <Text style={styles.copyButtonText}>{t('aiToolbox.copy')}</Text>
        </TouchableOpacity>
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
      paddingBottom: 120,
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
      marginBottom: 14,
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
    },
    subtitle: {
      color: colors.textMuted,
      marginTop: 4,
      marginBottom: 10,
    },
    infoRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: 10,
      marginBottom: 10,
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
      fontWeight: '700',
      fontSize: 11,
    },
    contextCount: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
    featuresRow: {
      paddingVertical: 2,
      gap: 8,
      marginBottom: 12,
    },
    featureChip: {
      borderRadius: 999,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
    },
    featureChipActive: {
      borderColor: colors.primary,
      backgroundColor: colors.primarySoft,
    },
    featureChipText: {
      color: colors.textMuted,
      fontWeight: '600',
      fontSize: 12,
    },
    featureChipTextActive: {
      color: colors.primary,
    },
    label: {
      color: colors.text,
      fontWeight: '700',
      marginBottom: 8,
      marginTop: 8,
    },
    input: {
      minHeight: 132,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      color: colors.text,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    runButton: {
      marginTop: 12,
      height: 48,
      borderRadius: 12,
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
    },
    runButtonText: {
      color: '#FFFFFF',
      fontWeight: '700',
    },
    disabled: {
      opacity: 0.5,
    },
    contextLoadingWrap: {
      paddingVertical: 12,
    },
    statusWrap: {
      marginTop: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      padding: 10,
      gap: 4,
    },
    statusLabel: {
      color: colors.text,
      fontWeight: '600',
    },
    statusModeText: {
      color: colors.textMuted,
      fontSize: 12,
    },
    outputCard: {
      borderRadius: 12,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      minHeight: 170,
      paddingHorizontal: 12,
      paddingVertical: 10,
    },
    outputText: {
      color: colors.text,
      lineHeight: 21,
    },
    copyButton: {
      marginTop: 10,
      alignSelf: 'flex-start',
      borderRadius: 10,
      borderWidth: 1,
      borderColor: colors.border,
      backgroundColor: colors.surface,
      paddingHorizontal: 12,
      paddingVertical: 8,
      flexDirection: 'row',
      alignItems: 'center',
      gap: 7,
    },
    copyButtonText: {
      color: colors.text,
      fontWeight: '700',
    },
  });
