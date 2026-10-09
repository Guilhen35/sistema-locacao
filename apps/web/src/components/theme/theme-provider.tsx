import { useEffect, useState, type ReactNode } from 'react'
import { ThemeContext, THEMES, type Theme } from './theme-context'

const STORAGE_KEY = 'ui-theme'

function readStoredTheme(): Theme {
  try {
    const value = localStorage.getItem(STORAGE_KEY)
    // Valor salvo no navegador pode ter sido alterado: aceita só os conhecidos
    return THEMES.includes(value as Theme) ? (value as Theme) : 'system'
  } catch {
    return 'system'
  }
}

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(readStoredTheme)

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')

    const apply = () => {
      const isDark = theme === 'dark' || (theme === 'system' && media.matches)
      document.documentElement.classList.toggle('dark', isDark)
    }

    apply()

    if (theme !== 'system') return
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])

  const setTheme = (next: Theme) => {
    setThemeState(next)
    try {
      localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Navegador sem armazenamento: o tema vale só até fechar a aba
    }
  }

  return <ThemeContext value={{ theme, setTheme }}>{children}</ThemeContext>
}
