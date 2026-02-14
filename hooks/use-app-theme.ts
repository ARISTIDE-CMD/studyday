import { useMemo } from 'react';

import { useColorScheme } from '@/hooks/use-color-scheme';
import {
  darkCardShadow,
  darkStudentColors,
  lightCardShadow,
  lightStudentColors,
  type StudentPalette,
  type StudentShadow,
} from '@/constants/student-ui';
import { useSettings } from '@/providers/settings-provider';

export type ResolvedTheme = 'light' | 'dark';

export function useAppTheme(): {
  colors: StudentPalette;
  cardShadow: StudentShadow;
  resolvedTheme: ResolvedTheme;
  isDark: boolean;
} {
  const { themeMode } = useSettings();
  const deviceColorScheme = useColorScheme() ?? 'light';
  const resolvedTheme: ResolvedTheme = themeMode === 'system' ? deviceColorScheme : themeMode;
  const isDark = resolvedTheme === 'dark';

  return useMemo(
    () => ({
      colors: isDark ? darkStudentColors : lightStudentColors,
      cardShadow: isDark ? darkCardShadow : lightCardShadow,
      resolvedTheme,
      isDark,
    }),
    [isDark, resolvedTheme]
  );
}
