import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React from 'react';
import { ActivityIndicator, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';
import { useI18n } from '@/hooks/use-i18n';
import { useAuth } from '@/providers/auth-provider';
import type { StudentPalette } from '@/constants/student-ui';

function TabIcon({
  focused,
  size,
  outline,
  filled,
  colors,
}: {
  focused: boolean;
  size: number;
  outline: React.ComponentProps<typeof Ionicons>['name'];
  filled: React.ComponentProps<typeof Ionicons>['name'];
  colors: StudentPalette;
}) {
  return (
    <View
      style={{
        width: 56,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        marginTop: -1,
      }}>
      {focused ? (
        <View
          style={{
            position: 'absolute',
            width: 46,
            height: 30,
            borderRadius: 14,
            backgroundColor: colors.primarySoft,
            borderWidth: 1,
            borderColor: colors.border,
          }}
        />
      ) : null}
      <Ionicons
        name={focused ? filled : outline}
        color={focused ? colors.primary : colors.textMuted}
        size={size}
      />
    </View>
  );
}

export default function MobileTabsLayout() {
  const { session, loading } = useAuth();
  const { colors } = useAppTheme();
  const { t } = useI18n();

  if (loading) {
    return (
      <View style={{ flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: colors.background }}>
        <ActivityIndicator color={colors.primary} />
      </View>
    );
  }

  if (!session) {
    return <Redirect href="/onboarding" />;
  }

  return (
    <Tabs
      detachInactiveScreens={false}
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarShowLabel: true,
        tabBarLabelStyle: {
          fontSize: 11,
          fontWeight: '700',
          marginTop: -1,
        },
        tabBarItemStyle: {
          borderRadius: 16,
          marginHorizontal: 2,
          marginVertical: 4,
        },
        tabBarStyle: {
          height: 70,
          paddingBottom: 10,
          paddingTop: 8,
          borderTopColor: colors.border,
          backgroundColor: colors.surface,
        },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: t('nav.home'),
          tabBarIcon: ({ focused, size }) => (
            <TabIcon focused={focused} size={size} outline="home-outline" filled="home" colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="tasks"
        options={{
          title: t('nav.tasks'),
          tabBarIcon: ({ focused, size }) => (
            <TabIcon
              focused={focused}
              size={size}
              outline="checkmark-circle-outline"
              filled="checkmark-circle"
              colors={colors}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="resources"
        options={{
          title: t('nav.resources'),
          tabBarIcon: ({ focused, size }) => (
            <TabIcon focused={focused} size={size} outline="folder-open-outline" filled="folder-open" colors={colors} />
          ),
        }}
      />
      <Tabs.Screen
        name="announcements"
        options={{
          title: t('nav.announcements'),
          tabBarIcon: ({ focused, size }) => (
            <TabIcon
              focused={focused}
              size={size}
              outline="notifications-outline"
              filled="notifications"
              colors={colors}
            />
          ),
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: t('nav.profile'),
          tabBarIcon: ({ focused, size }) => (
            <TabIcon focused={focused} size={size} outline="person-outline" filled="person" colors={colors} />
          ),
        }}
      />
      <Tabs.Screen name="home" options={{ href: null }} />
      <Tabs.Screen name="taks" options={{ href: null }} />
      <Tabs.Screen name="ressources" options={{ href: null }} />
      <Tabs.Screen name="addStack" options={{ href: null }} />
      <Tabs.Screen name="otherRessource" options={{ href: null }} />
      <Tabs.Screen name="login" options={{ href: null }} />
      <Tabs.Screen name="onbording" options={{ href: null }} />
    </Tabs>
  );
}
