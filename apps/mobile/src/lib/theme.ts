export type AppTheme = 'light' | 'dark'

export const lightPalette = {
  background: '#ffffff',
  authBackground: '#f5f5f7',
  surface: '#ffffff',
  surfaceMuted: '#e9ecef',
  surfaceElevated: '#f8f9fa',
  surfaceOverlay: 'rgba(255, 255, 255, 0.95)',
  hero: 'rgba(40, 205, 65, 0.05)',
  border: 'rgba(10, 10, 10, 0.08)',
  text: '#0a0a0a',
  textMuted: '#6c757d',
  primary: '#28CD41',
  primaryPressed: '#1fa035',
  secondary: '#f1f3f5',
  secondaryPressed: '#e4e8eb',
  accent: '#00E87C',
  brandAccent: '#1FA035',
  brandPrimaryTint: 'rgba(40, 205, 65, 0.10)',
  brandPrimaryBorder: 'rgba(40, 205, 65, 0.20)',
  brandPurpleTint: 'rgba(82, 224, 104, 0.10)',
  brandPurpleBorder: 'rgba(82, 224, 104, 0.20)',
  brandAccentTint: 'rgba(31, 160, 53, 0.10)',
  accentSoft: 'rgba(0, 232, 124, 0.14)',
  purple: '#52E068',
  chip: 'rgba(40, 205, 65, 0.12)',
  chipText: '#1f7a2e',
  danger: '#ff006e',
  dangerSoft: 'rgba(255, 0, 110, 0.12)',
  success: '#00E87C',
  successSoft: 'rgba(0, 232, 124, 0.14)',
  warning: '#ffd60a',
  warningSoft: 'rgba(255, 214, 10, 0.16)',
  shadow: 'rgba(0, 0, 0, 0.06)',
  shadowStrong: 'rgba(0, 0, 0, 0.12)',
  switchBackground: '#dee2e6',
  white: '#ffffff',
  black: '#0a0a0a',
}

export const darkPalette = {
  background: '#0a0a0a',
  authBackground: '#0a0a0a',
  surface: '#1a1a1a',
  surfaceMuted: '#2d2d2d',
  surfaceElevated: '#222222',
  surfaceOverlay: 'rgba(26, 26, 26, 0.95)',
  hero: 'rgba(40, 205, 65, 0.08)',
  border: 'rgba(255, 255, 255, 0.10)',
  text: '#f8f9fa',
  textMuted: '#adb5bd',
  primary: '#28CD41',
  primaryPressed: '#1fa035',
  secondary: '#2d2d2d',
  secondaryPressed: '#3a3a3a',
  accent: '#00E87C',
  brandAccent: '#1FA035',
  brandPrimaryTint: 'rgba(40, 205, 65, 0.14)',
  brandPrimaryBorder: 'rgba(40, 205, 65, 0.24)',
  brandPurpleTint: 'rgba(82, 224, 104, 0.14)',
  brandPurpleBorder: 'rgba(82, 224, 104, 0.24)',
  brandAccentTint: 'rgba(31, 160, 53, 0.14)',
  accentSoft: 'rgba(0, 232, 124, 0.18)',
  purple: '#52E068',
  chip: 'rgba(40, 205, 65, 0.18)',
  chipText: '#b7f5c2',
  danger: '#ff006e',
  dangerSoft: 'rgba(255, 0, 110, 0.16)',
  success: '#00E87C',
  successSoft: 'rgba(0, 232, 124, 0.18)',
  warning: '#ffd60a',
  warningSoft: 'rgba(255, 214, 10, 0.18)',
  shadow: 'rgba(0, 0, 0, 0.40)',
  shadowStrong: 'rgba(0, 0, 0, 0.60)',
  switchBackground: '#495057',
  white: '#ffffff',
  black: '#0a0a0a',
} as const

export type ThemePalette = typeof lightPalette

export const getPalette = (theme: AppTheme): ThemePalette =>
  theme === 'dark' ? darkPalette : lightPalette

export const palette: ThemePalette = { ...lightPalette }

export const applyThemePalette = (theme: AppTheme) => {
  Object.assign(palette, getPalette(theme))
}

export const spacing = {
  xs: 6,
  sm: 10,
  md: 16,
  lg: 20,
  xl: 28,
  xxl: 36,
}

export const radius = {
  sm: 12,
  md: 16,
  lg: 22,
  xl: 28,
  pill: 999,
}
