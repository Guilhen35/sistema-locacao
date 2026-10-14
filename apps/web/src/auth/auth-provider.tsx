import { useCallback, useEffect, useMemo, useState, type ReactNode } from 'react'
import type { LoginInput } from '@locacao/shared'
import { apiFetch } from '@/lib/api'
import { AuthContext, type AuthStatus, type AuthUser } from './auth-context'

type UserResponse = { user: AuthUser }

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null)
  const [status, setStatus] = useState<AuthStatus>('loading')

  // Ao abrir o sistema, pergunta à API se já existe uma sessão válida
  useEffect(() => {
    let active = true
    apiFetch<UserResponse>('/auth/me')
      .then((data) => {
        if (!active) return
        setUser(data.user)
        setStatus('authenticated')
      })
      .catch(() => {
        if (!active) return
        setUser(null)
        setStatus('anonymous')
      })
    return () => {
      active = false
    }
  }, [])

  const login = useCallback(async (input: LoginInput) => {
    await apiFetch('/auth/login', { method: 'POST', body: JSON.stringify(input) })
    // Confirma pelo /me que o cookie foi aceito e pega os dados completos
    const data = await apiFetch<UserResponse>('/auth/me')
    setUser(data.user)
    setStatus('authenticated')
    return data.user
  }, [])

  const logout = useCallback(async () => {
    try {
      await apiFetch('/auth/logout', { method: 'POST' })
    } catch {
      // Sessão já inválida ou sem rede: limpa a tela mesmo assim
    } finally {
      setUser(null)
      setStatus('anonymous')
    }
  }, [])

  const value = useMemo(() => ({ status, user, login, logout }), [status, user, login, logout])

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}
