import React, { useMemo } from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { useAppTheme } from '@/hooks/use-app-theme';

type Variant = 'empty' | 'error' | 'loading';

type Props = {
  title: string;
  description: string;
  variant: Variant;
  actionLabel?: string;
  onActionPress?: () => void;
};

export function StateBlock({ title, description, variant, actionLabel, onActionPress }: Props) {
  const { colors } = useAppTheme();
  const styles = useMemo(() => createStyles(colors), [colors]);

  return (
    <View style={styles.container}>
      {variant === 'loading' ? <ActivityIndicator size="small" color={colors.primary} /> : null}
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.description}>{description}</Text>
      {actionLabel && onActionPress ? (
        <TouchableOpacity onPress={onActionPress} style={styles.button}>
          <Text style={styles.buttonText}>{actionLabel}</Text>
        </TouchableOpacity>
      ) : null}
    </View>
  );
}

const createStyles = (colors: ReturnType<typeof useAppTheme>['colors']) =>
  StyleSheet.create({
  container: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.border,
    padding: 20,
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 16,
    fontWeight: '700',
    color: colors.text,
  },
  description: {
    textAlign: 'center',
    color: colors.textMuted,
    lineHeight: 20,
  },
  button: {
    marginTop: 8,
    paddingHorizontal: 14,
    paddingVertical: 10,
    borderRadius: 10,
    backgroundColor: colors.primary,
  },
  buttonText: {
    color: '#FFF',
    fontWeight: '600',
  },
});
