import { Ionicons } from '@expo/vector-icons';
import { Redirect, Tabs } from 'expo-router';
import React, { useEffect, useRef } from 'react';
import { ActivityIndicator, Animated, Easing, View } from 'react-native';

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
  const progress = useRef(new Animated.Value(focused ? 1 : 0)).current;

  useEffect(() => {
    Animated.timing(progress, {
      toValue: focused ? 1 : 0,
      duration: focused ? 210 : 180,
      easing: focused ? Easing.out(Easing.cubic) : Easing.out(Easing.quad),
      useNativeDriver: true,
    }).start();
  }, [focused, progress]);

  const containerTranslateY = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [-2, -8],
  });
  const containerScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 1.08],
  });
  const fillOpacity = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0, 1],
  });
  const fillScale = progress.interpolate({
    inputRange: [0, 1],
    outputRange: [0.86, 1],
  });

  return (
    <Animated.View
      style={{
        width: 56,
        height: 40,
        alignItems: 'center',
        justifyContent: 'center',
        transform: [{ translateY: containerTranslateY }, { scale: containerScale }],
      }}>
      <Animated.View
        style={{
          position: 'absolute',
          bottom: 1,
          width: 52,
          height: 31,
          borderRadius: 16,
          backgroundColor: colors.primarySoft,
          borderWidth: 1,
          borderColor: colors.border,
          opacity: fillOpacity,
          transform: [{ scale: fillScale }],
        }}
      />
      <Animated.View
        style={{
          position: 'absolute',
          top: -2,
          width: 30,
          height: 12,
          borderTopLeftRadius: 16,
          borderTopRightRadius: 16,
          backgroundColor: colors.primarySoft,
          opacity: fillOpacity,
          transform: [{ scale: fillScale }],
        }}
      />
      <Ionicons
        name={focused ? filled : outline}
        color={focused ? colors.primary : colors.textMuted}
        size={focused ? size + 1 : size}
      />
    </Animated.View>
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
          height: 74,
          paddingBottom: 10,
          paddingTop: 10,
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
