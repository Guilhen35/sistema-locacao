import { createContext, useContext } from 'react'
import type { LoginInput } from '@locacao/shared'

export interface AuthUser {
  id: string
  name: string
  email: string
  role: string
  permissions: string[]
  mustChangePassword: boolean
}

export type AuthStatus = 'loading' | 'authenticated' | 'anonymous'

export interface AuthContextValue {
  status: AuthStatus
  user: AuthUser | null
  login: (input: LoginInput) => Promise<AuthUser>
  logout: () => Promise<void>
}

export const AuthContext = createContext<AuthContextValue | null>(null)

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth precisa estar dentro de <AuthProvider>')
  return context
}
