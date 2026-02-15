import { DarkTheme, DefaultTheme, ThemeProvider } from '@react-navigation/native';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo } from 'react';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import 'react-native-reanimated';

import { useAppTheme } from '@/hooks/use-app-theme';
import { AuthProvider } from '@/providers/auth-provider';
import { NotificationProvider } from '@/providers/notification-provider';
import { OfflineSyncProvider } from '@/providers/offline-sync-provider';
import { SettingsProvider } from '@/providers/settings-provider';

function RootNavigator() {
  const { colors, isDark } = useAppTheme();
  const baseTheme = isDark ? DarkTheme : DefaultTheme;
  const navigationTheme = useMemo(
    () => ({
      ...baseTheme,
      colors: {
        ...baseTheme.colors,
        primary: colors.primary,
        background: colors.background,
        card: colors.surface,
        text: colors.text,
        border: colors.border,
        notification: colors.danger,
      },
    }),
    [baseTheme, colors]
  );

  return (
    <ThemeProvider value={navigationTheme}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="(auth)" />
        <Stack.Screen name="(mobile)" />
        <Stack.Screen name="post-login" />
        <Stack.Screen name="task-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="resource-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="profile-editor" options={{ presentation: 'modal' }} />
        <Stack.Screen name="task/[id]" />
        <Stack.Screen name="resource/[id]" />
        <Stack.Screen name="announcement/[id]" />
      </Stack>
      <StatusBar style={isDark ? 'light' : 'dark'} />
    </ThemeProvider>
  );
}

export default function RootLayout() {
  return (
    <GestureHandlerRootView style={{ flex: 1 }}>
      <AuthProvider>
        <SettingsProvider>
          <OfflineSyncProvider>
            <NotificationProvider>
              <RootNavigator />
            </NotificationProvider>
          </OfflineSyncProvider>
        </SettingsProvider>
      </AuthProvider>
    </GestureHandlerRootView>
  );
}
