import { Outlet } from 'react-router'
import { AppHeader } from './app-header'
import { AppSidebar } from './app-sidebar'

export function AppLayout() {
  return (
    <div className="flex min-h-svh bg-background">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-lg focus:bg-primary focus:px-4 focus:py-2 focus:font-semibold focus:text-primary-foreground"
      >
        Pular para o conteúdo
      </a>

      <AppSidebar />

      <div className="flex min-w-0 flex-1 flex-col">
        <AppHeader />
        <main id="conteudo" tabIndex={-1} className="flex-1 px-4 py-6 focus:outline-none md:px-8 md:py-8">
          <Outlet />
        </main>
      </div>
    </div>
  )
}