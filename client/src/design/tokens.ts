/** Design token names for programmatic use (charts, inline styles, etc.). */
export const colors = {
  background: 'var(--ds-color-background)',
  foreground: 'var(--ds-color-foreground)',
  card: 'var(--ds-color-card)',
  primary: 'var(--ds-color-primary)',
  secondary: 'var(--ds-color-secondary)',
  accent: 'var(--ds-color-accent)',
  muted: 'var(--ds-color-muted)',
  mutedForeground: 'var(--ds-color-muted-foreground)',
  destructive: 'var(--ds-color-destructive)',
  success: 'var(--ds-color-success)',
  warning: 'var(--ds-color-warning)',
  info: 'var(--ds-color-info)',
  border: 'var(--ds-color-border)',
  borderStrong: 'var(--ds-color-border-strong)',
  inputFill: 'var(--ds-color-input-fill)',
  ring: 'var(--ds-color-ring)',
  disabled: 'var(--ds-color-disabled)',
  players: [
    'var(--ds-color-player-1)',
    'var(--ds-color-player-2)',
    'var(--ds-color-player-3)',
    'var(--ds-color-player-4)',
    'var(--ds-color-player-5)',
    'var(--ds-color-player-6)',
  ] as const,
} as const;

export const typography = {
  fontHeader: 'var(--ds-font-header)',
  fontSketch: 'var(--ds-font-sketch)',
  fontBody: 'var(--ds-font-body)',
  size: {
    xs: 'var(--ds-text-xs)',
    sm: 'var(--ds-text-sm)',
    base: 'var(--ds-text-base)',
    lg: 'var(--ds-text-lg)',
    xl: 'var(--ds-text-xl)',
    '2xl': 'var(--ds-text-2xl)',
    '3xl': 'var(--ds-text-3xl)',
    '4xl': 'var(--ds-text-4xl)',
    '5xl': 'var(--ds-text-5xl)',
    '6xl': 'var(--ds-text-6xl)',
    '7xl': 'var(--ds-text-7xl)',
  },
  weight: {
    normal: 'var(--ds-font-weight-normal)',
    medium: 'var(--ds-font-weight-medium)',
    bold: 'var(--ds-font-weight-bold)',
  },
} as const;

export const spacing = {
  0: 'var(--ds-space-0)',
  1: 'var(--ds-space-1)',
  2: 'var(--ds-space-2)',
  3: 'var(--ds-space-3)',
  4: 'var(--ds-space-4)',
  5: 'var(--ds-space-5)',
  6: 'var(--ds-space-6)',
  8: 'var(--ds-space-8)',
  10: 'var(--ds-space-10)',
  12: 'var(--ds-space-12)',
  16: 'var(--ds-space-16)',
  20: 'var(--ds-space-20)',
} as const;

export const radius = {
  sm: 'var(--ds-radius-sm)',
  md: 'var(--ds-radius-md)',
  lg: 'var(--ds-radius-lg)',
  xl: 'var(--ds-radius-xl)',
  '2xl': 'var(--ds-radius-2xl)',
  '3xl': 'var(--ds-radius-3xl)',
  full: 'var(--ds-radius-full)',
} as const;

export const shadow = {
  chunkySm: 'var(--ds-shadow-chunky-sm)',
  chunky: 'var(--ds-shadow-chunky)',
  chunkyLg: 'var(--ds-shadow-chunky-lg)',
  chunkyXl: 'var(--ds-shadow-chunky-xl)',
  drop: 'var(--ds-shadow-drop)',
} as const;
