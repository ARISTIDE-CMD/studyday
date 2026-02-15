import { Ionicons } from '@expo/vector-icons';
import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

type BrandLogoProps = {
  size?: number;
  showWordmark?: boolean;
  caption?: string;
  align?: 'left' | 'center';
};

export function BrandLogo({
  size = 42,
  showWordmark = true,
  caption,
  align = 'left',
}: BrandLogoProps) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, size), [colors, size]);
  const iconSize = Math.max(16, Math.round(size * 0.44));
  const badgeIconSize = Math.max(9, Math.round(size * 0.22));

  return (
    <View style={[styles.root, align === 'center' && styles.rootCenter]}>
      <View style={styles.markWrap}>
        <View style={styles.markGlow} />
        <View style={styles.mark}>
          <Ionicons name="school-outline" size={iconSize} color="#FFFFFF" />
          <View style={styles.badge}>
            <Ionicons name="checkmark" size={badgeIconSize} color="#FFFFFF" />
          </View>
        </View>
      </View>

      {showWordmark ? (
        <View style={styles.wordWrap}>
          <Text style={styles.wordmark}>StudyDay</Text>
          {caption ? <Text style={styles.caption}>{caption}</Text> : null}
        </View>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors'], size: number) => {
  const badgeSize = Math.max(14, Math.round(size * 0.36));

  return StyleSheet.create({
    root: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: 12,
    },
    rootCenter: {
      justifyContent: 'center',
    },
    markWrap: {
      width: size + 6,
      height: size + 6,
      alignItems: 'center',
      justifyContent: 'center',
    },
    markGlow: {
      position: 'absolute',
      width: size + 14,
      height: size + 14,
      borderRadius: 999,
      backgroundColor: colors.primarySoft,
    },
    mark: {
      width: size,
      height: size,
      borderRadius: Math.max(10, Math.round(size * 0.3)),
      backgroundColor: colors.primary,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.primarySoft,
    },
    badge: {
      position: 'absolute',
      right: -4,
      bottom: -4,
      width: badgeSize,
      height: badgeSize,
      borderRadius: 999,
      backgroundColor: colors.success,
      borderWidth: 2,
      borderColor: colors.surface,
      alignItems: 'center',
      justifyContent: 'center',
    },
    wordWrap: {
      gap: 1,
    },
    wordmark: {
      color: colors.text,
      fontWeight: '800',
      letterSpacing: 0.2,
      fontSize: 20,
    },
    caption: {
      color: colors.textMuted,
      fontSize: 12,
      fontWeight: '600',
    },
  });
};
