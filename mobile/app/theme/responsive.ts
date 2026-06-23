import { Dimensions } from 'react-native';
import { tokens } from './tokens';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

/** Hero headline scales down on narrow viewports (design.md breakpoints). */
export function heroDisplayType(width = SCREEN_WIDTH) {
  if (width <= 419) {
    return {
      ...tokens.type.displayMd,
      fontSize: 28,
      lineHeight: 30,
      letterSpacing: -0.14,
    };
  }
  if (width <= 640) {
    return {
      ...tokens.type.displayMd,
      fontSize: 34,
      lineHeight: 37,
      letterSpacing: -0.17,
    };
  }
  if (width <= 1068) {
    return tokens.type.displayLg;
  }
  return tokens.type.heroDisplay;
}

/** Tile vertical padding tightens on phone (80 → 48). */
export function tileSectionPadding(width = SCREEN_WIDTH) {
  return width <= 640 ? tokens.space.xxl : tokens.space.section;
}

export { SCREEN_WIDTH };
