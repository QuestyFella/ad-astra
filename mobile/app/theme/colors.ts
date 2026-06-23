/**
 * Ad Astra theme.
 *
 * Mapped onto the Apple product-page tokens in `./tokens.ts`. The light theme
 * uses white/parchment surfaces with near-black ink and Action Blue CTAs. The
 * dark theme flips to the dark tile surfaces documented for product-tile-dark.
 *
 * The exported `Theme` shape is preserved so existing screens can keep reading
 * fields like `t.bg`, `t.text`, `t.accent`, etc.
 */

import { tokens } from './tokens';

export const colors = {
  primary: tokens.color.primary,
  primaryFocus: tokens.color.primaryFocus,
  primaryOnDark: tokens.color.primaryOnDark,
  ink: tokens.color.ink,
  body: tokens.color.body,
  bodyOnDark: tokens.color.bodyOnDark,
  bodyMuted: tokens.color.bodyMuted,
  inkMuted80: tokens.color.inkMuted80,
  inkMuted48: tokens.color.inkMuted48,
  dividerSoft: tokens.color.dividerSoft,
  hairline: tokens.color.hairline,
  canvas: tokens.color.canvas,
  canvasParchment: tokens.color.canvasParchment,
  surfacePearl: tokens.color.surfacePearl,
  surfaceTile1: tokens.color.surfaceTile1,
  surfaceTile2: tokens.color.surfaceTile2,
  surfaceTile3: tokens.color.surfaceTile3,
  surfaceBlack: tokens.color.surfaceBlack,
  surfaceChipTranslucent: tokens.color.surfaceChipTranslucent,
  onPrimary: tokens.color.onPrimary,
  onDark: tokens.color.onDark,
  success: '#22c55e',
  warning: '#f59e0b',
  error: '#ef4444',
} as const;

export type ThemeMode = 'light' | 'dark';

export interface Theme {
  bg: string;
  card: string;
  cardBorder: string;
  text: string;
  textMuted: string;
  accent: string;
  accentDim: string;
  success: string;
  successDim: string;
  warning: string;
  danger: string;
  star: string;
  statusBar: 'light' | 'dark';
  hairline: string;
  hairlineSoft: string;
  hairlineStrong: string;
  surfaceStrong: string;
  surfaceDark: string;
  surfaceDarkElevated: string;
  onPrimary: string;
  onDark: string;
  onDarkSoft: string;
  textLink: string;
  textLinkSecondary: string;
  primary: string;
  primaryActive: string;
  ink: string;
  body: string;
  bodyStrong: string;
  muted: string;
  mutedSoft: string;
  canvasSoft: string;
  skyLight: string;
  skyMid: string;
  preview: string;
  linkBright: string;
  warningColor: string;
  errorColor: string;
  successColor: string;
  error: string;
}

const lightTheme: Theme = {
  bg: colors.canvas,
  card: colors.canvas,
  cardBorder: colors.hairline,
  text: colors.ink,
  textMuted: colors.inkMuted48,
  accent: colors.primary,
  accentDim: colors.canvasParchment,
  success: colors.success,
  successDim: colors.surfacePearl,
  warning: colors.warning,
  danger: colors.error,
  star: colors.primary,
  statusBar: 'dark',
  hairline: colors.hairline,
  hairlineSoft: colors.dividerSoft,
  hairlineStrong: colors.hairline,
  surfaceStrong: colors.canvasParchment,
  surfaceDark: colors.surfaceTile1,
  surfaceDarkElevated: colors.surfaceTile2,
  onPrimary: colors.onPrimary,
  onDark: colors.onDark,
  onDarkSoft: colors.bodyMuted,
  textLink: colors.primary,
  textLinkSecondary: colors.primaryFocus,
  primary: colors.primary,
  primaryActive: colors.primaryFocus,
  ink: colors.ink,
  body: colors.body,
  bodyStrong: colors.ink,
  muted: colors.inkMuted48,
  mutedSoft: colors.dividerSoft,
  canvasSoft: colors.canvasParchment,
  skyLight: colors.canvasParchment,
  skyMid: colors.surfacePearl,
  preview: colors.primaryOnDark,
  linkBright: colors.primaryOnDark,
  warningColor: colors.warning,
  errorColor: colors.error,
  successColor: colors.success,
  error: colors.error,
};

const darkTheme: Theme = {
  bg: colors.surfaceTile1,
  card: colors.surfaceTile2,
  cardBorder: colors.surfaceTile3,
  text: colors.bodyOnDark,
  textMuted: colors.bodyMuted,
  accent: colors.primaryOnDark,
  accentDim: colors.surfaceTile3,
  success: '#30d158',
  successDim: colors.surfaceTile3,
  warning: '#ff9f0a',
  danger: '#ff453a',
  star: colors.primaryOnDark,
  statusBar: 'light',
  hairline: colors.surfaceTile3,
  hairlineSoft: colors.surfaceTile2,
  hairlineStrong: colors.surfaceTile3,
  surfaceStrong: colors.surfaceTile2,
  surfaceDark: colors.surfaceBlack,
  surfaceDarkElevated: colors.surfaceTile1,
  onPrimary: colors.onPrimary,
  onDark: colors.onDark,
  onDarkSoft: colors.bodyMuted,
  textLink: colors.primaryOnDark,
  textLinkSecondary: colors.primaryFocus,
  primary: colors.primaryOnDark,
  primaryActive: colors.primaryFocus,
  ink: colors.bodyOnDark,
  body: colors.bodyOnDark,
  bodyStrong: colors.bodyOnDark,
  muted: colors.bodyMuted,
  mutedSoft: colors.inkMuted80,
  canvasSoft: colors.surfaceTile2,
  skyLight: colors.surfaceTile2,
  skyMid: colors.surfaceTile3,
  preview: colors.primaryOnDark,
  linkBright: colors.primaryOnDark,
  warningColor: '#ff9f0a',
  errorColor: '#ff453a',
  successColor: '#30d158',
  error: '#ff453a',
};

export function getTheme(mode: ThemeMode = 'light'): Theme {
  return mode === 'dark' ? darkTheme : lightTheme;
}
