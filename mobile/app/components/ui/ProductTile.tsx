import React, { useContext } from 'react';
import { View, StyleSheet, type StyleProp, type ViewStyle } from 'react-native';
import { tokens } from '../../theme/tokens';
import { tileSectionPadding } from '../../theme/responsive';
import { ThemeContext } from '../../navigation/AppNavigator';

export type ProductTileVariant =
  | 'light'
  | 'parchment'
  | 'dark'
  | 'dark2'
  | 'dark3';

const TILE_BG_LIGHT: Record<ProductTileVariant, string> = {
  light: tokens.color.canvas,
  parchment: tokens.color.canvasParchment,
  dark: tokens.color.surfaceTile1,
  dark2: tokens.color.surfaceTile2,
  dark3: tokens.color.surfaceTile3,
};

const TILE_BG_DARK: Record<ProductTileVariant, string> = {
  light: tokens.color.surfaceTile1,
  parchment: tokens.color.surfaceTile2,
  dark: tokens.color.surfaceTile3,
  dark2: tokens.color.surfaceBlack,
  dark3: tokens.color.surfaceBlack,
};

interface ProductTileProps {
  variant?: ProductTileVariant;
  children: React.ReactNode;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}

/** Full-bleed product tile — color change is the section divider. */
export function ProductTile({
  variant = 'light',
  children,
  style,
  compact,
}: ProductTileProps) {
  const { theme: mode } = useContext(ThemeContext);
  const padV = compact ? tokens.space.xxl : tileSectionPadding();
  const palette = mode === 'dark' ? TILE_BG_DARK : TILE_BG_LIGHT;

  return (
    <View
      style={[
        styles.tile,
        { backgroundColor: palette[variant], paddingVertical: padV },
        style,
      ]}
    >
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    paddingHorizontal: tokens.space.lg,
    alignItems: 'center',
    width: '100%',
  },
});
