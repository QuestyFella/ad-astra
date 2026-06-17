export const colors = {
  // Night-safe palette
  nightBg: '#0A0A0F',
  nightCard: '#14141F',
  nightCardBorder: '#1E1E2E',
  nightText: '#E8E0D0',
  nightTextMuted: '#7A7060',
  nightAccent: '#E85D3A',
  nightAccentDim: '#8B3620',
  nightSuccess: '#3AE87A',
  nightSuccessDim: '#1A5E30',
  nightWarning: '#E8C83A',
  nightDanger: '#E83A3A',

  // Day mode
  dayBg: '#F5F5F0',
  dayCard: '#FFFFFF',
  dayCardBorder: '#E0E0D8',
  dayText: '#1A1A1A',
  dayTextMuted: '#7A7A7A',
  dayAccent: '#E85D3A',
  dayAccentDim: '#F0D0C0',
  daySuccess: '#22A855',
  dayWarning: '#D4A017',
  dayDanger: '#D42222',
} as const;

export type ThemeMode = 'night' | 'day';

export function getTheme(mode: ThemeMode) {
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
      statusBar: 'light' as const,
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
    successDim: '#D0F0D0',
    warning: colors.dayWarning,
    danger: colors.dayDanger,
    statusBar: 'dark' as const,
  };
}
