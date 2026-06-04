// Orca mobile design tokens — palettes match the desktop graphite themes
// defined in src/renderer/src/assets/main.css (light/dark token blocks).
// Screen files must resolve colors via useTheme()/useThemedStyles() from
// theme-context.tsx instead of importing a static palette, so the app can
// follow the system appearance and the in-app theme toggle.

export const darkColors = {
  bgBase: '#111111',
  bgPanel: '#1a1a1a',
  bgRaised: '#242424',
  borderSubtle: '#2a2a2a',
  editorSurface: '#1e1e1e',

  textPrimary: '#e0e0e0',
  textSecondary: '#888888',
  textMuted: '#555555',

  accentBlue: '#3b82f6',

  statusGreen: '#22c55e',
  statusAmber: '#f59e0b',
  statusRed: '#ef4444',
  gitDecorationAdded: '#81b88b',
  gitDecorationDeleted: '#c74e39',
  diffAddedBg: 'rgba(129, 184, 139, 0.1)',
  diffDeletedBg: 'rgba(199, 78, 57, 0.11)',

  syntaxComment: '#6a9955',
  syntaxKeyword: '#569cd6',
  syntaxString: '#ce9178',
  syntaxNumber: '#b5cea8',
  syntaxType: '#4ec9b0',
  syntaxFunction: '#dcdcaa',
  syntaxVariable: '#9cdcfe',
  syntaxMeta: '#c586c0',

  // Terminal WebView background (Tokyonight) — separate from app chrome
  terminalBg: '#1a1b26'
} as const

// Light palette mirrors the desktop light-mode tokens; syntax colors follow
// VS Code's default light theme to match the dark palette's VS Code origins.
export const lightColors = {
  bgBase: '#ffffff',
  bgPanel: '#fafafa',
  bgRaised: '#f0f0f0',
  borderSubtle: '#e5e5e5',
  editorSurface: '#ffffff',

  textPrimary: '#171717',
  textSecondary: '#737373',
  textMuted: '#a1a1a1',

  accentBlue: '#2563eb',

  statusGreen: '#15803d',
  statusAmber: '#b45309',
  statusRed: '#dc2626',
  gitDecorationAdded: '#587c0c',
  gitDecorationDeleted: '#ad0707',
  diffAddedBg: 'rgba(88, 124, 12, 0.1)',
  diffDeletedBg: 'rgba(173, 7, 7, 0.08)',

  syntaxComment: '#008000',
  syntaxKeyword: '#0000ff',
  syntaxString: '#a31515',
  syntaxNumber: '#098658',
  syntaxType: '#267f99',
  syntaxFunction: '#795e26',
  syntaxVariable: '#001080',
  syntaxMeta: '#af00db',

  // Terminal keeps its own dark Tokyonight surface in both app themes; the
  // terminal palette is user-configured separately in terminal settings.
  terminalBg: '#1a1b26'
} as const

export type ThemeColors = {
  readonly [K in keyof typeof darkColors]: string
}

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24
} as const

export const radii = {
  row: 6,
  card: 14,
  button: 6,
  input: 6,
  camera: 8
} as const

export const typography = {
  titleSize: 18,
  bodySize: 14,
  metaSize: 12,
  monoFamily: 'monospace' as const
} as const
