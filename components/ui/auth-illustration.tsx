import { Image } from 'expo-image';
import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

type AuthIllustrationVariant = 'onboarding' | 'login' | 'signup';

type AuthIllustrationProps = {
  variant: AuthIllustrationVariant;
  height?: number;
};

function buildSvg(variant: AuthIllustrationVariant, colors: ReturnType<typeof useAppTheme>['colors']): string {
  const base = colors.primary;
  const soft = colors.primarySoft;
  const success = colors.success;
  const text = colors.text;
  const border = colors.border;

  const centerGlyph =
    variant === 'login'
      ? `<rect x="168" y="52" width="64" height="64" rx="18" fill="${soft}" />
         <path d="M190 73h20a8 8 0 0 1 8 8v17a8 8 0 0 1-8 8h-20a8 8 0 0 1-8-8V81a8 8 0 0 1 8-8Z" fill="${base}" />
         <circle cx="200" cy="88" r="4" fill="#ffffff"/>
         <rect x="198" y="92" width="4" height="8" rx="2" fill="#ffffff"/>`
      : variant === 'signup'
        ? `<circle cx="200" cy="74" r="30" fill="${soft}" />
           <circle cx="200" cy="70" r="10" fill="${base}" />
           <rect x="183" y="83" width="34" height="16" rx="8" fill="${base}" />
           <path d="M230 58l5 5 8-10" stroke="${success}" stroke-width="4" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
        : `<rect x="163" y="44" width="74" height="86" rx="18" fill="${soft}" />
           <rect x="176" y="58" width="48" height="8" rx="4" fill="${base}" opacity="0.8"/>
           <rect x="176" y="73" width="48" height="8" rx="4" fill="${base}" opacity="0.5"/>
           <rect x="176" y="88" width="30" height="8" rx="4" fill="${base}" opacity="0.35"/>
           <circle cx="226" cy="110" r="8" fill="${success}" />`;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="400" height="220" viewBox="0 0 400 220">
    <defs>
      <linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${soft}" />
        <stop offset="100%" stop-color="#ffffff" stop-opacity="0.2"/>
      </linearGradient>
    </defs>
    <rect x="0" y="0" width="400" height="220" rx="26" fill="url(#g)" />
    <path d="M25 170C80 130 120 126 176 145C219 159 268 159 320 131C343 119 360 118 375 124" stroke="${base}" stroke-opacity="0.45" stroke-width="8" fill="none" stroke-linecap="round"/>
    <rect x="44" y="38" width="104" height="130" rx="18" fill="#ffffff" opacity="0.88" stroke="${border}" />
    <rect x="61" y="58" width="70" height="10" rx="5" fill="${text}" opacity="0.22"/>
    <rect x="61" y="76" width="78" height="10" rx="5" fill="${text}" opacity="0.14"/>
    <rect x="61" y="94" width="62" height="10" rx="5" fill="${text}" opacity="0.12"/>
    <rect x="61" y="116" width="58" height="36" rx="11" fill="${base}" opacity="0.9"/>
    ${centerGlyph}
    <circle cx="325" cy="62" r="18" fill="${success}" opacity="0.2"/>
    <circle cx="325" cy="62" r="10" fill="${success}" />
    <path d="M320 62l4 4 8-10" stroke="#ffffff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>
  </svg>`;
}

export function AuthIllustration({ variant, height = 220 }: AuthIllustrationProps) {
  const { colors, cardShadow } = useAppTheme();
  const styles = useMemo(() => createStyles(colors, cardShadow, height), [cardShadow, colors, height]);

  const source = useMemo(() => {
    const svg = buildSvg(variant, colors);
    return {
      uri: `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`,
    };
  }, [colors, variant]);

  return (
    <View style={styles.wrap}>
      <Image source={source} style={styles.image} contentFit="cover" transition={120} />
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
