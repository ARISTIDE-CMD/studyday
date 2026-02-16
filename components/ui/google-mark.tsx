import React from 'react';
import Svg, { Path } from 'react-native-svg';

type GoogleMarkProps = {
  size?: number;
};

export function GoogleMark({ size = 18 }: GoogleMarkProps) {
  return (
    <Svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      accessibilityElementsHidden
      importantForAccessibility="no-hide-descendants">
      <Path
        fill="#FFC107"
        d="M43.611 20.083H42V20H24v8h11.303C33.665 32.657 29.24 36 24 36c-6.627 0-12-5.373-12-12s5.373-12 12-12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.046 6.053 29.268 4 24 4 12.955 4 4 12.955 4 24s8.955 20 20 20 20-8.955 20-20c0-1.341-.138-2.65-.389-3.917Z"
      />
      <Path
        fill="#FF3D00"
        d="m6.306 14.691 6.571 4.819C14.655 15.108 18.961 12 24 12c3.059 0 5.842 1.154 7.955 3.045l5.657-5.657C34.046 6.053 29.268 4 24 4 16.318 4 9.656 8.337 6.306 14.691Z"
      />
      <Path
        fill="#4CAF50"
        d="M24 44c5.166 0 9.86-1.977 13.409-5.192l-6.19-5.238C29.169 35.091 26.715 36 24 36c-5.219 0-9.631-3.317-11.283-7.946l-6.522 5.025C9.505 39.556 16.227 44 24 44Z"
      />
      <Path
        fill="#1976D2"
        d="M43.611 20.083H42V20H24v8h11.303c-1.161 3.247-3.4 5.843-6.084 7.57l6.19 5.238C35.001 41.18 44 35 44 24c0-1.341-.138-2.65-.389-3.917Z"
      />
    </Svg>
  );
}
