/**
 * Ad Astra design system tokens.
 *
 * Mirrors the Apple product-page language in `design.md`: near-black ink,
 * Action Blue CTAs, alternating white/parchment/dark tiles, SF Pro Display
 * headlines with tight tracking, SF Pro Text body, pill-shaped primary actions.
 */

export const tokens = {
  color: {
    primary: '#0066cc',
    primaryFocus: '#0071e3',
    primaryOnDark: '#2997ff',
    ink: '#1d1d1f',
    body: '#1d1d1f',
    bodyOnDark: '#ffffff',
    bodyMuted: '#cccccc',
    inkMuted80: '#333333',
    inkMuted48: '#7a7a7a',
    dividerSoft: '#f0f0f0',
    hairline: '#e0e0e0',
    canvas: '#ffffff',
    canvasParchment: '#f5f5f7',
    surfacePearl: '#fafafc',
    surfaceTile1: '#272729',
    surfaceTile2: '#2a2a2c',
    surfaceTile3: '#252527',
    surfaceBlack: '#000000',
    surfaceChipTranslucent: '#d2d2d7',
    onPrimary: '#ffffff',
    onDark: '#ffffff',
  },
  font: {
    display: "'SF Pro Display', -apple-system, system-ui, sans-serif",
    text: "'SF Pro Text', -apple-system, system-ui, sans-serif",
    mono: "'SF Mono', 'JetBrains Mono', 'Fira Code', monospace",
  },
  radius: {
    none: 0,
    xs: 5,
    sm: 8,
    md: 11,
    lg: 18,
    pill: 9999,
    full: 9999,
  },
  space: {
    xxs: 4,
    xs: 8,
    sm: 12,
    md: 17,
    lg: 24,
    xl: 32,
    xxl: 48,
    section: 80,
  },
  type: {
    heroDisplay: { fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif", fontSize: 56, fontWeight: '600', lineHeight: 60, letterSpacing: -0.28 },
    displayLg:  { fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif", fontSize: 40, fontWeight: '600', lineHeight: 44, letterSpacing: 0 },
    displayMd:  { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 34, fontWeight: '600', lineHeight: 50, letterSpacing: -0.374 },
    lead:       { fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif", fontSize: 28, fontWeight: '400', lineHeight: 32, letterSpacing: 0.196 },
    leadAiry:   { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 24, fontWeight: '300', lineHeight: 36, letterSpacing: 0 },
    tagline:    { fontFamily: "'SF Pro Display', -apple-system, system-ui, sans-serif", fontSize: 21, fontWeight: '600', lineHeight: 25, letterSpacing: 0.231 },
    bodyStrong: { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 17, fontWeight: '600', lineHeight: 21, letterSpacing: -0.374 },
    body:       { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 17, fontWeight: '400', lineHeight: 25, letterSpacing: -0.374 },
    denseLink:  { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 17, fontWeight: '400', lineHeight: 41, letterSpacing: 0 },
    caption:    { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 14, fontWeight: '400', lineHeight: 20, letterSpacing: -0.224 },
    captionStrong:{ fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 14, fontWeight: '600', lineHeight: 18, letterSpacing: -0.224 },
    buttonLarge:{ fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 18, fontWeight: '300', lineHeight: 18, letterSpacing: 0 },
    buttonUtility:{ fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 14, fontWeight: '400', lineHeight: 18, letterSpacing: -0.224 },
    finePrint:  { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 12, fontWeight: '400', lineHeight: 12, letterSpacing: -0.12 },
    microLegal: { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 10, fontWeight: '400', lineHeight: 13, letterSpacing: -0.08 },
    navLink:    { fontFamily: "'SF Pro Text', -apple-system, system-ui, sans-serif", fontSize: 12, fontWeight: '400', lineHeight: 12, letterSpacing: -0.12 },
  },
  shadow: {
    product: {
      shadowColor: '#000000',
      shadowOpacity: 0.22,
      shadowRadius: 30,
      shadowOffset: { width: 3, height: 5 },
      elevation: 8,
    },
  },
} as const;

export type Tokens = typeof tokens;
