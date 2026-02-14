import type { ViewStyle } from 'react-native';

export type StudentPalette = {
  background: string;
  surface: string;
  primary: string;
  primarySoft: string;
  text: string;
  textMuted: string;
  border: string;
  success: string;
  successSoft: string;
  warning: string;
  warningSoft: string;
  danger: string;
  dangerSoft: string;
};

export type StudentShadow = Pick<
  ViewStyle,
  'shadowColor' | 'shadowOffset' | 'shadowOpacity' | 'shadowRadius' | 'elevation'
>;

export const lightStudentColors: StudentPalette = {
  background: '#F5F7FB',
  surface: '#FFFFFF',
  primary: '#5B6CFF',
  primarySoft: '#E7EBFF',
  text: '#131827',
  textMuted: '#6B7280',
  border: '#E6EAF2',
  success: '#16A34A',
  successSoft: '#DCFCE7',
  warning: '#EA580C',
  warningSoft: '#FFEDD5',
  danger: '#DC2626',
  dangerSoft: '#FEE2E2',
};

export const darkStudentColors: StudentPalette = {
  background: '#0B1220',
  surface: '#111A2B',
  primary: '#7A89FF',
  primarySoft: '#1C2542',
  text: '#E8EDF7',
  textMuted: '#98A3B8',
  border: '#23304A',
  success: '#22C55E',
  successSoft: '#143526',
  warning: '#F59E0B',
  warningSoft: '#3B2C17',
  danger: '#EF4444',
  dangerSoft: '#3C1D23',
};

export const StudentSpacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
};

export const lightCardShadow: StudentShadow = {
  shadowColor: '#111827',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.07,
  shadowRadius: 16,
  elevation: 2,
};

export const darkCardShadow: StudentShadow = {
  shadowColor: '#000000',
  shadowOffset: { width: 0, height: 8 },
  shadowOpacity: 0.28,
  shadowRadius: 18,
  elevation: 3,
};

// Backward-compatible aliases while the project migrates fully to useAppTheme.
export const StudentColors = lightStudentColors;
export const CardShadow = lightCardShadow;
