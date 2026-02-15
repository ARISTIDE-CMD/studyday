import { useRouter } from 'expo-router';
import React, { useMemo, useRef } from 'react';
import { PanResponder, StyleProp, StyleSheet, View, ViewStyle } from 'react-native';

type AppTab = 'home' | 'tasks' | 'resources' | 'announcements' | 'profile';

const TAB_ORDER: AppTab[] = ['home', 'tasks', 'resources', 'announcements', 'profile'];

const TAB_ROUTE: Record<AppTab, string> = {
  home: '/(mobile)',
  tasks: '/tasks',
  resources: '/resources',
  announcements: '/announcements',
  profile: '/profile',
};

type TabSwipeShellProps = {
  tab: AppTab;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
};

export function TabSwipeShell({ tab, children, style }: TabSwipeShellProps) {
  const router = useRouter();
  const navigateLock = useRef(false);

  const panResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_evt, gestureState) => {
          const dx = Math.abs(gestureState.dx);
          const dy = Math.abs(gestureState.dy);
          return dx > 68 && dx > dy * 1.4;
        },
        onPanResponderRelease: (_evt, gestureState) => {
          if (navigateLock.current) return;

          const tabIndex = TAB_ORDER.indexOf(tab);
          if (tabIndex < 0) return;

          const swipeLeft =
            gestureState.dx < -78 || (gestureState.dx < -24 && gestureState.vx < -0.32);
          const swipeRight =
            gestureState.dx > 78 || (gestureState.dx > 24 && gestureState.vx > 0.32);

          if (!swipeLeft && !swipeRight) return;

          const nextIndex = swipeLeft
            ? Math.min(TAB_ORDER.length - 1, tabIndex + 1)
            : Math.max(0, tabIndex - 1);

          if (nextIndex === tabIndex) return;

          navigateLock.current = true;
          router.replace(TAB_ROUTE[TAB_ORDER[nextIndex]]);
          setTimeout(() => {
            navigateLock.current = false;
          }, 260);
        },
      }),
    [router, tab]
  );

  return (
    <View style={[styles.container, style]} {...panResponder.panHandlers}>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
});

