import { Ionicons } from '@expo/vector-icons';
import React from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import { StyleSheet, Text, View } from 'react-native';

import { getResourceIconMeta } from '@/lib/resource-icon';
import type { Resource } from '@/types/supabase';

type ResourceLike = Pick<Resource, 'type' | 'title' | 'file_url' | 'content'>;

type ResourceFileIconProps = {
  resource: ResourceLike;
  size?: number;
  style?: StyleProp<ViewStyle>;
};

const iconByKind = {
  note: 'document-text-outline',
  link: 'link-outline',
  pdf: 'document-attach-outline',
  image: 'image-outline',
  doc: 'document-outline',
  sheet: 'grid-outline',
  slides: 'easel-outline',
  archive: 'archive-outline',
  text: 'reader-outline',
  file: 'document-outline',
} as const;

export function ResourceFileIcon({ resource, size = 36, style }: ResourceFileIconProps) {
  const iconMeta = getResourceIconMeta(resource);
  const iconSize = Math.max(13, Math.round(size * 0.42));
  const labelSize = Math.max(7, Math.round(size * 0.2));

  return (
    <View
      style={[
        styles.wrap,
        {
          width: size,
          height: size,
          backgroundColor: iconMeta.palette.bg,
          borderColor: `${iconMeta.palette.fg}22`,
        },
        style,
      ]}>
      <Ionicons name={iconByKind[iconMeta.kind]} size={iconSize} color={iconMeta.palette.fg} />
      <Text style={[styles.label, { color: iconMeta.palette.fg, fontSize: labelSize }]} numberOfLines={1}>
        {iconMeta.label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    borderWidth: 1,
    gap: 1,
  },
  label: {
    fontWeight: '800',
    letterSpacing: 0.2,
  },
});
