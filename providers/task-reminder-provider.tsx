import React, { useEffect, useRef } from 'react';
import { AppState, Vibration } from 'react-native';
import * as Haptics from 'expo-haptics';

import { useI18n } from '@/hooks/use-i18n';
import { getCachedTasks } from '@/lib/student-api';
import { collectDueTaskReminders } from '@/lib/task-reminders';
import { useAuth } from '@/providers/auth-provider';
import { useInAppNotification } from '@/providers/notification-provider';

const CHECK_INTERVAL_MS = 12 * 60 * 1000;

async function playReminderCue() {
  try {
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning);
  } catch {
    // Ignore haptics errors on unsupported devices.
  }
  Vibration.vibrate([0, 75, 50, 75]);
}

export function TaskReminderProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { t } = useI18n();
  const { addActivityNotification, showNotification } = useInAppNotification();
  const runningRef = useRef(false);

  useEffect(() => {
    if (!user?.id) return;

    let active = true;

    const runCheck = async () => {
      if (!active || runningRef.current) return;
      runningRef.current = true;

      try {
        const tasks = await getCachedTasks(user.id);
        const reminders = await collectDueTaskReminders(user.id, tasks, t);
        if (reminders.length === 0) return;

        for (const reminder of reminders) {
          await addActivityNotification({
            entityType: 'task',
            entityId: reminder.taskId,
            title: reminder.title,
            message: reminder.message,
          });
        }

        showNotification({
          title: t('reminders.bannerTitle'),
          message: t('reminders.bannerMessage', { count: reminders.length }),
          variant: 'info',
        });

        await playReminderCue();
      } catch {
        // Keep reminder engine silent on errors.
      } finally {
        runningRef.current = false;
      }
    };

    void runCheck();
    const interval = setInterval(() => {
      void runCheck();
    }, CHECK_INTERVAL_MS);

    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void runCheck();
      }
    });

    return () => {
      active = false;
      clearInterval(interval);
      subscription.remove();
    };
  }, [addActivityNotification, showNotification, t, user?.id]);

  return <>{children}</>;
}
