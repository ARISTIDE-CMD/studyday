import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as Haptics from 'expo-haptics';
import { Animated, Pressable, StyleSheet, Text, View } from 'react-native';
import { Vibration } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useAppTheme } from '@/hooks/use-app-theme';
import {
  addActivityNotification as persistActivityNotification,
  getActivityNotifications,
  markActivityNotificationAsRead,
  markAllActivityNotificationsAsRead,
  removeActivityNotification as persistRemoveActivityNotification,
  type ActivityNotificationEntity,
  type ActivityNotificationItem,
} from '@/lib/activity-notifications';
import { useAuth } from '@/providers/auth-provider';
import { useSettings } from '@/providers/settings-provider';

type NotificationVariant = 'info' | 'success' | 'warning';

type NotificationInput = {
  title: string;
  message: string;
  durationMs?: number;
  variant?: NotificationVariant;
};

type NotificationState = NotificationInput & {
  id: number;
};

type NotificationContextValue = {
  showNotification: (input: NotificationInput) => void;
  dismissNotification: () => void;
  activityNotifications: ActivityNotificationItem[];
  unreadActivityCount: number;
  addActivityNotification: (input: {
    entityType: ActivityNotificationEntity;
    entityId: string;
    title: string;
    message: string;
  }) => Promise<void>;
  markActivityAsRead: (notificationId: string) => Promise<void>;
  removeActivity: (notificationId: string) => Promise<void>;
  markAllActivityAsRead: () => Promise<void>;
};

const NotificationContext = createContext<NotificationContextValue | undefined>(undefined);

export function NotificationProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { notificationSoundMode } = useSettings();
  const insets = useSafeAreaInsets();
  const { colors, cardShadow, isDark } = useAppTheme();
  const translateY = useRef(new Animated.Value(-180)).current;
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const idRef = useRef(0);
  const lastCueAtRef = useRef(0);

  const [activeNotification, setActiveNotification] = useState<NotificationState | null>(null);
  const [activityNotifications, setActivityNotifications] = useState<ActivityNotificationItem[]>([]);

  const playNotificationCue = useCallback(async () => {
    if (notificationSoundMode === 'off') return;

    const now = Date.now();
    if (now - lastCueAtRef.current < 1200) return;
    lastCueAtRef.current = now;

    try {
      if (notificationSoundMode === 'enhanced') {
        await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
        Vibration.vibrate([0, 70, 40, 90]);
        return;
      }
      await Haptics.selectionAsync();
      Vibration.vibrate(40);
    } catch {
      // Keep notifications functional on devices without haptics/vibration support.
    }
  }, [notificationSoundMode]);

  useEffect(() => {
    let active = true;

    const run = async () => {
      if (!user?.id) {
        if (active) setActivityNotifications([]);
        return;
      }
      const data = await getActivityNotifications(user.id);
      if (active) {
        setActivityNotifications(data);
      }
    };

    void run();

    return () => {
      active = false;
    };
  }, [user?.id]);

  const dismissNotification = useCallback(() => {
    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    Animated.timing(translateY, {
      toValue: -180,
      duration: 180,
      useNativeDriver: true,
    }).start(() => setActiveNotification(null));
  }, [translateY]);

  const showNotification = useCallback(
    (input: NotificationInput) => {
      idRef.current += 1;
      setActiveNotification({ id: idRef.current, ...input });
    },
    []
  );

  const addActivityNotification = useCallback(
    async (input: {
      entityType: ActivityNotificationEntity;
      entityId: string;
      title: string;
      message: string;
    }) => {
      if (!user?.id) return;
      const item = await persistActivityNotification({
        userId: user.id,
        entityType: input.entityType,
        entityId: input.entityId,
        title: input.title,
        message: input.message,
      });
      setActivityNotifications((prev) => [item, ...prev].slice(0, 120));
      await playNotificationCue();
    },
    [playNotificationCue, user?.id]
  );

  const markAllActivityAsRead = useCallback(async () => {
    if (!user?.id) return;
    const updated = await markAllActivityNotificationsAsRead(user.id);
    setActivityNotifications(updated);
  }, [user?.id]);

  const markActivityAsRead = useCallback(
    async (notificationId: string) => {
      if (!user?.id) return;
      const updated = await markActivityNotificationAsRead(user.id, notificationId);
      setActivityNotifications(updated);
    },
    [user?.id]
  );

  const removeActivity = useCallback(
    async (notificationId: string) => {
      if (!user?.id) return;
      const updated = await persistRemoveActivityNotification(user.id, notificationId);
      setActivityNotifications(updated);
    },
    [user?.id]
  );

  const unreadActivityCount = useMemo(
    () => activityNotifications.filter((item) => !item.readAt).length,
    [activityNotifications]
  );

  useEffect(() => {
    if (!activeNotification) {
      return;
    }

    if (hideTimerRef.current) {
      clearTimeout(hideTimerRef.current);
      hideTimerRef.current = null;
    }

    translateY.setValue(-180);

    Animated.timing(translateY, {
      toValue: 0,
      duration: 220,
      useNativeDriver: true,
    }).start();

    hideTimerRef.current = setTimeout(() => {
      dismissNotification();
    }, activeNotification.durationMs ?? 5000);

    return () => {
      if (hideTimerRef.current) {
        clearTimeout(hideTimerRef.current);
        hideTimerRef.current = null;
      }
    };
  }, [activeNotification, dismissNotification, translateY]);

  const value = useMemo<NotificationContextValue>(
    () => ({
      showNotification,
      dismissNotification,
      activityNotifications,
      unreadActivityCount,
      addActivityNotification,
      markActivityAsRead,
      removeActivity,
      markAllActivityAsRead,
    }),
    [
      activityNotifications,
      addActivityNotification,
      dismissNotification,
      markActivityAsRead,
      removeActivity,
      markAllActivityAsRead,
      showNotification,
      unreadActivityCount,
    ]
  );

  const variantPalette: Record<NotificationVariant, { bg: string; border: string }> = useMemo(
    () => ({
      info: {
        bg: isDark ? '#1C2542' : '#EEF2FF',
        border: isDark ? '#2E3C67' : '#C7D2FE',
      },
      success: {
        bg: isDark ? '#143526' : '#ECFDF3',
        border: isDark ? '#24583D' : '#BBF7D0',
      },
      warning: {
        bg: isDark ? '#3B2C17' : '#FFF7ED',
        border: isDark ? '#5A3E1F' : '#FED7AA',
      },
    }),
    [isDark]
  );

  const palette = activeNotification ? variantPalette[activeNotification.variant ?? 'info'] : null;
  const styles = useMemo(() => createStyles(colors, cardShadow), [cardShadow, colors]);

  return (
    <NotificationContext.Provider value={value}>
      {children}
      {activeNotification && palette ? (
        <Animated.View
          pointerEvents="box-none"
          style={[
            styles.container,
            {
              top: insets.top + 8,
              transform: [{ translateY }],
            },
          ]}>
          <Pressable onPress={dismissNotification} style={[styles.banner, { backgroundColor: palette.bg, borderColor: palette.border }]}>
            <View style={styles.row}>
              <Text style={styles.title}>{activeNotification.title}</Text>
              <Text style={styles.close}>x</Text>
            </View>
            <Text style={styles.message}>{activeNotification.message}</Text>
          </Pressable>
        </Animated.View>
      ) : null}
    </NotificationContext.Provider>
  );
}

export function useInAppNotification() {
  const ctx = useContext(NotificationContext);

  if (!ctx) {
    throw new Error('useInAppNotification doit etre utilise dans NotificationProvider');
  }

  return ctx;
}

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  cardShadow: ReturnType<typeof useAppTheme>['cardShadow']
) =>
  StyleSheet.create({
    container: {
      position: 'absolute',
      left: 12,
      right: 12,
      zIndex: 200,
    },
    banner: {
      borderRadius: 12,
      borderWidth: 1,
      paddingHorizontal: 12,
      paddingVertical: 10,
      ...cardShadow,
    },
    row: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'center',
      marginBottom: 4,
    },
    title: {
      color: colors.text,
      fontWeight: '800',
      fontSize: 14,
    },
    close: {
      color: colors.textMuted,
      fontWeight: '700',
    },
    message: {
      color: colors.text,
      lineHeight: 19,
      fontSize: 13,
    },
  });
