import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';
import { Circle, Defs, LinearGradient, Path, Rect, Stop, Svg } from 'react-native-svg';

import { useAppTheme } from '@/hooks/use-app-theme';

type AuthIllustrationVariant = 'onboarding' | 'login' | 'signup';

type AuthIllustrationProps = {
  variant: AuthIllustrationVariant;
  height?: number;
};

function VariantGlyph({
  variant,
  colors,
}: {
  variant: AuthIllustrationVariant;
  colors: ReturnType<typeof useAppTheme>['colors'];
}) {
  if (variant === 'login') {
    return (
      <>
        <Rect x={168} y={52} width={64} height={64} rx={18} fill={colors.primarySoft} />
        <Path
          d="M190 73h20a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8h-20a8 8 0 0 1-8-8V81a8 8 0 0 1 8-8Z"
          fill={colors.primary}
        />
        <Circle cx={200} cy={88} r={4} fill="#FFFFFF" />
        <Rect x={198} y={92} width={4} height={8} rx={2} fill="#FFFFFF" />
      </>
    );
  }

  if (variant === 'signup') {
    return (
      <>
        <Circle cx={200} cy={74} r={30} fill={colors.primarySoft} />
        <Circle cx={200} cy={70} r={10} fill={colors.primary} />
        <Rect x={183} y={83} width={34} height={16} rx={8} fill={colors.primary} />
        <Path
          d="M230 58l5 5 8-10"
          stroke={colors.success}
          strokeWidth={4}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </>
    );
  }

  return (
    <>
      <Rect x={163} y={44} width={74} height={86} rx={18} fill={colors.primarySoft} />
      <Rect x={176} y={58} width={48} height={8} rx={4} fill={colors.primary} fillOpacity={0.8} />
      <Rect x={176} y={73} width={48} height={8} rx={4} fill={colors.primary} fillOpacity={0.5} />
      <Rect x={176} y={88} width={30} height={8} rx={4} fill={colors.primary} fillOpacity={0.35} />
      <Circle cx={226} cy={110} r={8} fill={colors.success} />
    </>
  );
}

export function AuthIllustration({ variant, height = 220 }: AuthIllustrationProps) {
  const { colors, cardShadow } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, cardShadow, height), [cardShadow, colors, height]);

  return (
    <View style={styles.wrap}>
      <Svg width="100%" height="100%" viewBox="0 0 400 220">
        <Defs>
          <LinearGradient id="authGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <Stop offset="0%" stopColor={colors.primarySoft} />
            <Stop offset="100%" stopColor="#FFFFFF" stopOpacity={0.2} />
          </LinearGradient>
        </Defs>

        <Rect x={0} y={0} width={400} height={220} rx={26} fill="url(#authGradient)" />
        <Path
          d="M25 170C80 130 120 126 176 145C219 159 268 159 320 131C343 119 360 118 375 124"
          stroke={colors.primary}
          strokeOpacity={0.45}
          strokeWidth={8}
          fill="none"
          strokeLinecap="round"
        />

        <Rect x={44} y={38} width={104} height={130} rx={18} fill="#FFFFFF" fillOpacity={0.88} stroke={colors.border} />
        <Rect x={61} y={58} width={70} height={10} rx={5} fill={colors.text} fillOpacity={0.22} />
        <Rect x={61} y={76} width={78} height={10} rx={5} fill={colors.text} fillOpacity={0.14} />
        <Rect x={61} y={94} width={62} height={10} rx={5} fill={colors.text} fillOpacity={0.12} />
        <Rect x={61} y={116} width={58} height={36} rx={11} fill={colors.primary} fillOpacity={0.9} />

        <VariantGlyph variant={variant} colors={colors} />

        <Circle cx={325} cy={62} r={18} fill={colors.success} fillOpacity={0.2} />
        <Circle cx={325} cy={62} r={10} fill={colors.success} />
        <Path
          d="M320 62l4 4 8-10"
          stroke="#FFFFFF"
          strokeWidth={3}
          fill="none"
          strokeLinecap="round"
          strokeLinejoin="round"
        />
      </Svg>
    </View>
  );
}

const createStyles = (
  colors: ReturnType<typeof useAppTheme>['colors'],
  cardShadow: ReturnType<typeof useAppTheme>['cardShadow'],
  height: number
) =>
  StyleSheet.create({
    wrap: {
      height,
      borderRadius: 24,
      borderWidth: 1,
      borderColor: colors.border,
      overflow: 'hidden',
      backgroundColor: colors.primarySoft,
      ...cardShadow,
    },
    image: {
      width: '100%',
      height: '100%',
    },
  });
