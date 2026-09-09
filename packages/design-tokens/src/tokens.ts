/**
 * Design tokens — the single source of truth for both React Native and web.
 *
 * These mirror Figma Variables. When the Figma library changes, update this
 * file (or regenerate it) and every surface follows. Never hardcode a colour
 * or spacing value in a component.
 */

export const palette = {
  neutral0: '#FFFFFF',
  neutral50: '#F7F8FA',
  neutral100: '#EDEFF3',
  neutral200: '#DDE1E8',
  neutral300: '#C2C8D4',
  neutral400: '#9AA3B4',
  neutral500: '#6E7788',
  neutral600: '#4C5464',
  neutral700: '#343B48',
  neutral800: '#20252F',
  neutral900: '#12161D',
  neutral950: '#0A0D12',

  brand100: '#E4E9FF',
  brand300: '#A9B7FF',
  brand500: '#5C6FF5',
  brand600: '#4453D6',
  brand700: '#333FAB',

  accent500: '#F5A524',
  success500: '#22A06B',
  warning500: '#D98324',
  danger500: '#E5484D',
} as const;

export type PaletteToken = keyof typeof palette;

/**
 * Semantic colours. Components reference these, never `palette` directly.
 *
 * `ThemeColors` is declared explicitly (rather than inferred from
 * `lightTheme`) so both themes widen to `string` and stay interchangeable.
 */
export interface ThemeColors {
  background: string;
  surface: string;
  surfaceRaised: string;
  surfaceSunken: string;
  border: string;
  borderStrong: string;

  textPrimary: string;
  textSecondary: string;
  textMuted: string;
  textInverted: string;

  accent: string;
  accentHover: string;
  accentSubtle: string;
  onAccent: string;

  success: string;
  warning: string;
  danger: string;
  highlight: string;
}

export const lightTheme: ThemeColors = {
  background: palette.neutral50,
  surface: palette.neutral0,
  surfaceRaised: palette.neutral0,
  surfaceSunken: palette.neutral100,
  border: palette.neutral200,
  borderStrong: palette.neutral300,

  textPrimary: palette.neutral900,
  textSecondary: palette.neutral600,
  textMuted: palette.neutral500,
  textInverted: palette.neutral0,

  accent: palette.brand500,
  accentHover: palette.brand600,
  accentSubtle: palette.brand100,
  onAccent: palette.neutral0,

  success: palette.success500,
  warning: palette.warning500,
  danger: palette.danger500,
  highlight: palette.accent500,
};

export const darkTheme: ThemeColors = {
  background: palette.neutral950,
  surface: palette.neutral900,
  surfaceRaised: palette.neutral800,
  surfaceSunken: palette.neutral950,
  border: palette.neutral800,
  borderStrong: palette.neutral700,

  textPrimary: palette.neutral50,
  textSecondary: palette.neutral300,
  textMuted: palette.neutral400,
  textInverted: palette.neutral950,

  accent: palette.brand500,
  accentHover: palette.brand300,
  accentSubtle: palette.neutral800,
  onAccent: palette.neutral0,

  success: palette.success500,
  warning: palette.warning500,
  danger: palette.danger500,
  highlight: palette.accent500,
};

export type ColorToken = keyof ThemeColors;

/** 4pt spacing scale. */
export const spacing = {
  none: 0,
  xxs: 2,
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
  huge: 64,
} as const;

export type SpacingToken = keyof typeof spacing;

export const radius = {
  none: 0,
  sm: 6,
  md: 10,
  lg: 14,
  xl: 20,
  pill: 999,
} as const;

export type RadiusToken = keyof typeof radius;

export const fontSize = {
  xs: 12,
  sm: 14,
  md: 16,
  lg: 18,
  xl: 22,
  xxl: 28,
  display: 36,
} as const;

export const fontWeight = {
  regular: '400',
  medium: '500',
  semibold: '600',
  bold: '700',
} as const;

export const lineHeight = {
  tight: 1.2,
  normal: 1.5,
  relaxed: 1.7,
} as const;

/** Named text roles so headings stay consistent across screens. */
export const typography = {
  display: { fontSize: fontSize.display, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight },
  title: { fontSize: fontSize.xxl, fontWeight: fontWeight.bold, lineHeight: lineHeight.tight },
  heading: { fontSize: fontSize.xl, fontWeight: fontWeight.semibold, lineHeight: lineHeight.tight },
  subheading: { fontSize: fontSize.lg, fontWeight: fontWeight.semibold, lineHeight: lineHeight.normal },
  body: { fontSize: fontSize.md, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal },
  bodyStrong: { fontSize: fontSize.md, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal },
  caption: { fontSize: fontSize.sm, fontWeight: fontWeight.regular, lineHeight: lineHeight.normal },
  label: { fontSize: fontSize.xs, fontWeight: fontWeight.medium, lineHeight: lineHeight.normal },
} as const;

export type TypographyToken = keyof typeof typography;

export const duration = {
  instant: 100,
  fast: 160,
  normal: 240,
  slow: 400,
} as const;

export const zIndex = {
  base: 0,
  dropdown: 10,
  sticky: 20,
  overlay: 30,
  modal: 40,
  toast: 50,
} as const;
