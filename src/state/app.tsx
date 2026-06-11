import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react'

/* Minimal app router + theme. Top-level screens only; in-cooking sheets (capture review, log
 * detail, new stage) are local to the cooking screen. A small history stack powers Back. */

export type Route =
  | { name: 'library' }
  | { name: 'newdish' }
  | { name: 'dish'; dishId: string }
  | { name: 'cooking'; sessionId: string }
  | { name: 'timeline'; sessionId: string }

export type Theme = 'light' | 'dark'

interface AppState {
  route: Route
  nav: (route: Route) => void
  back: () => void
  canBack: boolean
  theme: Theme
  toggleTheme: () => void
}

const AppCtx = createContext<AppState | null>(null)

function initialTheme(): Theme {
  const saved = localStorage.getItem('amma_theme')
  if (saved === 'light' || saved === 'dark') return saved
  return window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

export function AppProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<Route[]>([{ name: 'library' }])
  const [theme, setTheme] = useState<Theme>(initialTheme)

  const route = stack[stack.length - 1]

  const nav = useCallback((next: Route) => {
    setStack((s) => [...s, next])
  }, [])

  const back = useCallback(() => {
    setStack((s) => (s.length > 1 ? s.slice(0, -1) : s))
  }, [])

  useEffect(() => {
    document.documentElement.dataset.theme = theme
    localStorage.setItem('amma_theme', theme)
  }, [theme])

  const toggleTheme = useCallback(() => setTheme((t) => (t === 'light' ? 'dark' : 'light')), [])

  const value = useMemo<AppState>(
    () => ({ route, nav, back, canBack: stack.length > 1, theme, toggleTheme }),
    [route, nav, back, stack.length, theme, toggleTheme],
  )

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export function useApp(): AppState {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp outside AppProvider')
  return ctx
}
