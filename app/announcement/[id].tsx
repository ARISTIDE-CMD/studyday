import { Ionicons } from '@expo/vector-icons';
import { router, useLocalSearchParams } from 'expo-router';
import React, { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { StateBlock } from '@/components/ui/state-block';
import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { getErrorMessage } from '@/lib/errors';
import { fetchAnnouncementById } from '@/lib/student-api';
import { formatDateLabel } from '@/lib/format';
import type { Announcement } from '@/types/supabase';

export default function AnnouncementDetailScreen() {
  const { colors } = useAppTheme();
  const { t, locale } = useI18n();
  const { id } = useLocalSearchParams<{ id: string }>();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [announcement, setAnnouncement] = useState<Announcement | null>(null);
  const styles = useMemo(() => createStyles(colors), [colors]);

  useEffect(() => {
    const run = async () => {
      if (!id) {
        setError(t('announcementDetail.notFound'));
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError('');
        const data = await fetchAnnouncementById(id);
        setAnnouncement(data ?? null);
      } catch (err) {
        const message = getErrorMessage(err, t('announcementDetail.errorLoad'));
        setError(message);
      } finally {
        setLoading(false);
      }
    };

    void run();
  }, [id, t]);

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

        {!loading && !error && !announcement ? (
          <StateBlock
            variant="empty"
            title={t('announcementDetail.emptyTitle')}
            description={t('announcementDetail.emptyDescription')}
            actionLabel={t('common.back')}
            onActionPress={() => router.back()}
          />
        ) : null}

        {!loading && !error && announcement ? (
          <>
            <Text style={styles.title}>{announcement.title}</Text>
            <Text style={styles.date}>
              {t('announcementDetail.publishedOn', {
                date: formatDateLabel(announcement.created_at, locale, t('common.noDate')),
              })}
            </Text>
            <Text style={styles.body}>{announcement.content}</Text>
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
    marginBottom: 8,
  },
  date: {
    color: colors.textMuted,
    marginBottom: 16,
  },
  body: {
    color: colors.text,
    lineHeight: 23,
    fontSize: 16,
  },
});
