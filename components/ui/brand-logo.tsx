import React, { useMemo } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import Svg, { Circle, Defs, LinearGradient, Path, Rect, Stop } from 'react-native-svg';

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

  return (
    <View style={[styles.root, align === 'center' && styles.rootCenter]}>
      <View style={styles.markWrap}>
        <View style={styles.markGlow} />
        <Svg width={size} height={size} viewBox="0 0 180 180" style={styles.mark}>
          <Defs>
            <LinearGradient id="studydayBody" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#F8FDFF" />
              <Stop offset="100%" stopColor="#AEC8FF" />
            </LinearGradient>
            <LinearGradient id="studydayCap" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#5E8AF5" />
              <Stop offset="100%" stopColor="#2E3F9E" />
            </LinearGradient>
            <LinearGradient id="studydayCheck" x1="0%" y1="0%" x2="100%" y2="100%">
              <Stop offset="0%" stopColor="#49D8A5" />
              <Stop offset="100%" stopColor="#1DB4CF" />
            </LinearGradient>
          </Defs>

          <Path d="M22 86l-8-30 30-9 7 29-29 10Z" fill="#F4BD3A" opacity={0.88} />
          <Path d="M158 86l8-30-30-9-7 29 29 10Z" fill="#EE5E86" opacity={0.88} />
          <Path d="M32 95l-5-32 26-4 5 30-26 6Z" fill="#40CFA5" opacity={0.84} />
          <Path d="M148 95l5-32-26-4-5 30 26 6Z" fill="#8A5AE6" opacity={0.8} />

          <Rect x={10} y={56} width={160} height={120} rx={40} fill="url(#studydayBody)" stroke="#6F8FFF" strokeWidth={4} />

          <Path d="M34 60 88 40c4-2 8-2 12 0l56 20c4 2 4 8 0 10l-56 20c-4 2-8 2-12 0L34 70c-4-2-4-8 0-10Z" fill="url(#studydayCap)" />
          <Rect x={60} y={70} width={64} height={18} rx={9} fill="#3E56BE" />
          <Rect x={143} y={71} width={5} height={27} rx={2.5} fill="#3A4EAE" />
          <Circle cx={145.5} cy={102} r={6.8} fill="#3A4EAE" />

          <Circle cx={67} cy={108} r={8} fill="#303B8E" />
          <Circle cx={113} cy={108} r={8} fill="#303B8E" />
          <Circle cx={64.7} cy={105.8} r={2.2} fill="#FFFFFF" opacity={0.8} />
          <Circle cx={110.7} cy={105.8} r={2.2} fill="#FFFFFF" opacity={0.8} />
          <Path d="M72 129c5 7 11 10 18 10s13-3 18-10" stroke="#303B8E" strokeWidth={6} strokeLinecap="round" fill="none" />
          <Path d="m72 143 15 15 32-32" stroke="url(#studydayCheck)" strokeWidth={10} strokeLinecap="round" strokeLinejoin="round" fill="none" />
        </Svg>
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
      opacity: 0.55,
    },
    mark: {
      width: size,
      height: size,
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
