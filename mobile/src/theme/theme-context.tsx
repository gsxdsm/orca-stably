import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode
} from 'react'
import { useColorScheme } from 'react-native'
import { darkColors, lightColors, type ThemeColors } from './mobile-theme'
import {
  loadThemePreference,
  saveThemePreference,
  type ThemePreference
} from '../storage/preferences'

export type ResolvedScheme = 'light' | 'dark'

type ThemeContextValue = {
  colors: ThemeColors
  scheme: ResolvedScheme
  preference: ThemePreference
  setPreference: (preference: ThemePreference) => void
}

// Why: dark is the pre-theming default — sessions render dark until the
// stored preference loads, avoiding a white flash for existing (dark) users.
const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  scheme: 'dark',
  preference: 'system',
  setPreference: () => {}
})

export function ThemeProvider({ children }: { children: ReactNode }) {
  const systemScheme = useColorScheme()
  const [preference, setPreferenceState] = useState<ThemePreference>('system')
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    let cancelled = false
    void loadThemePreference().then((stored) => {
      if (!cancelled) {
        setPreferenceState(stored)
        setLoaded(true)
      }
    })
    return () => {
      cancelled = true
    }
  }, [])

  const setPreference = useCallback((next: ThemePreference) => {
    setPreferenceState(next)
    void saveThemePreference(next)
  }, [])

  // Why: until the stored preference loads, stay dark rather than following
  // the system — flashing light-then-dark is worse than a brief dark frame.
  const scheme: ResolvedScheme =
    preference === 'system' ? (loaded && systemScheme === 'light' ? 'light' : 'dark') : preference

  const value = useMemo<ThemeContextValue>(
    () => ({
      colors: scheme === 'light' ? lightColors : darkColors,
      scheme,
      preference,
      setPreference
    }),
    [scheme, preference, setPreference]
  )

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext)
}

// Styles depending on theme colors: pass a module-level factory so the
// memoized StyleSheet only rebuilds when the palette flips.
export function useThemedStyles<T>(create: (colors: ThemeColors) => T): T {
  const { colors } = useTheme()
  return useMemo(() => create(colors), [create, colors])
}
