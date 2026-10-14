import { Navigate, Outlet, useLocation } from 'react-router'
import { useAuth } from './auth-context'

export function RequireAuth() {
  const { status, user } = useAuth()
  const location = useLocation()

  if (status === 'loading') {
    return (
      <div role="status" aria-live="polite" className="grid min-h-svh place-items-center text-sm text-muted-foreground">
        Carregando…
      </div>
    )
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />

  // Senha temporária: nenhuma outra tela abre antes da troca
  if (user.mustChangePassword && location.pathname !== '/trocar-senha') {
    return <Navigate to="/trocar-senha" replace />
  }

  return <Outlet />
}
