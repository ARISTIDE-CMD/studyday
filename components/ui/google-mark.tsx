import React, { useMemo } from 'react';
import { StyleSheet, View } from 'react-native';

type GoogleMarkProps = {
  size?: number;
};

export function GoogleMark({ size = 18 }: GoogleMarkProps) {
  const styles = useMemo(() => createStyles(size), [size]);

  return (
    <View style={styles.mark} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
      <View style={[styles.quadrant, styles.topLeft]} />
      <View style={[styles.quadrant, styles.topRight]} />
      <View style={[styles.quadrant, styles.bottomLeft]} />
      <View style={[styles.quadrant, styles.bottomRight]} />
      <View style={styles.innerCutout} />
      <View style={styles.crossBar} />
    </View>
  );
}

const createStyles = (size: number) => {
  const half = size / 2;
  const cutout = Math.round(size * 0.56);
  const crossBarHeight = Math.max(3, Math.round(size * 0.2));
  const crossBarWidth = Math.round(size * 0.44);

  return StyleSheet.create({
    mark: {
      width: size,
      height: size,
      borderRadius: size / 2,
      overflow: 'hidden',
      position: 'relative',
      backgroundColor: '#FFFFFF',
    },
    quadrant: {
      position: 'absolute',
      width: half,
      height: half,
    },
    topLeft: {
      left: 0,
      top: 0,
      backgroundColor: '#EA4335',
    },
    topRight: {
      right: 0,
      top: 0,
      backgroundColor: '#4285F4',
    },
    bottomLeft: {
      left: 0,
      bottom: 0,
      backgroundColor: '#FBBC05',
    },
    bottomRight: {
      right: 0,
      bottom: 0,
      backgroundColor: '#34A853',
    },
    innerCutout: {
      position: 'absolute',
      width: cutout,
      height: cutout,
      borderRadius: cutout / 2,
      backgroundColor: '#FFFFFF',
      top: (size - cutout) / 2,
      left: (size - cutout) / 2,
    },
    crossBar: {
      position: 'absolute',
      width: crossBarWidth,
      height: crossBarHeight,
      borderTopLeftRadius: crossBarHeight / 2,
      borderBottomLeftRadius: crossBarHeight / 2,
      backgroundColor: '#4285F4',
      right: 0,
      top: (size - crossBarHeight) / 2,
    },
  });
};
