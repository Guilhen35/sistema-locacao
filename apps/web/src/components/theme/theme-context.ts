import { createContext, useContext } from 'react'

export type Theme = 'light' | 'dark' | 'system'

export const THEMES: readonly Theme[] = ['light', 'dark', 'system']

type ThemeContextValue = {
  theme: Theme
  setTheme: (theme: Theme) => void
}

export const ThemeContext = createContext<ThemeContextValue | null>(null)

export function useTheme() {
  const context = useContext(ThemeContext)
  if (!context) {
    throw new Error('useTheme deve ser usado dentro de ThemeProvider')
  }
  return context
}