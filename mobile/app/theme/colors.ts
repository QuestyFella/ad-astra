// Minimalist big-touch palette tuned for night astronomy use.
// High contrast, generous spacing, very few elements per screen.

export const colors = {
  // Night palette (default — astronomy use)
  nightBg: '#000005',
  nightCard: '#0E0E1A',
  nightCardBorder: '#1C1C2E',
  nightText: '#F2EDE0',
  nightTextMuted: '#6B6578',
  nightAccent: '#E85D3A',
  nightAccentDim: '#5C2418',
  nightSuccess: '#3AE87A',
  nightSuccessDim: '#0E3A1C',
  nightWarning: '#E8C83A',
  nightDanger: '#E83A3A',
  nightStar: '#3AE87A',

  // Day mode (for daytime dev/testing)
  dayBg: '#FAFAF5',
  dayCard: '#FFFFFF',
  dayCardBorder: '#D8D8D0',
  dayText: '#1A1A1A',
  dayTextMuted: '#888880',
  dayAccent: '#D04A2A',
  dayAccentDim: '#F5D8CC',
  daySuccess: '#1E9E48',
  daySuccessDim: '#D0F0D0',
  dayWarning: '#C49410',
  dayDanger: '#C41818',
} as const;

export type ThemeMode = 'night' | 'day';

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
}

export function getTheme(mode: ThemeMode): Theme {
  if (mode === 'night') {
    return {
      bg: colors.nightBg,
      card: colors.nightCard,
      cardBorder: colors.nightCardBorder,
      text: colors.nightText,
      textMuted: colors.nightTextMuted,
      accent: colors.nightAccent,
      accentDim: colors.nightAccentDim,
      success: colors.nightSuccess,
      successDim: colors.nightSuccessDim,
      warning: colors.nightWarning,
      danger: colors.nightDanger,
      star: colors.nightStar,
      statusBar: 'light',
    };
  }
  return {
    bg: colors.dayBg,
    card: colors.dayCard,
    cardBorder: colors.dayCardBorder,
    text: colors.dayText,
    textMuted: colors.dayTextMuted,
    accent: colors.dayAccent,
    accentDim: colors.dayAccentDim,
    success: colors.daySuccess,
    successDim: colors.daySuccessDim,
    warning: colors.dayWarning,
    danger: colors.dayDanger,
    star: '#3AE87A',
    statusBar: 'dark',
  };
}
