import { useNavigate } from 'react-router'
import { Bell, CircleUser, LogOut, Search, Settings } from 'lucide-react'
import { Input } from '@/components/ui/input'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { THEMES, useTheme, type Theme } from '@/components/theme/theme-context'

const themeLabels: Record<Theme, string> = {
  light: 'Claro',
  dark: 'Escuro',
  system: 'Automático',
}

const iconButton =
  'relative inline-flex size-11 items-center justify-center rounded-lg border border-input bg-card text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

export function AppHeader() {
  const navigate = useNavigate()
  const { theme, setTheme } = useTheme()
  const unreadCount = 0

  const handleThemeChange = (value: unknown) => {
    if (THEMES.includes(value as Theme)) {
      setTheme(value as Theme)
    }
  }

  return (
    <header className="sticky top-0 z-10 flex flex-wrap items-center gap-4 border-b border-border bg-card px-4 py-3 md:px-8">
      <div className="relative w-full max-w-md flex-1">
        <label htmlFor="global-search" className="sr-only">
          Pesquisar
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="global-search"
          type="search"
          autoComplete="off"
          placeholder="Cliente, CPF/CNPJ, máquina ou contrato"
          className="h-10 pl-9"
        />
      </div>

      <div className="ml-auto flex items-center gap-3">
        <button
          type="button"
          className={iconButton}
          aria-label={unreadCount > 0 ? `Notificações: ${unreadCount} novas` : 'Notificações'}
        >
          <Bell className="size-4" aria-hidden="true" />
          {unreadCount > 0 && (
            <span className="absolute -top-1.5 -right-1.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[11px] font-bold text-primary-foreground">
              {unreadCount}
            </span>
          )}
        </button>

        <DropdownMenu>
          <DropdownMenuTrigger className={iconButton} aria-label="Configurações e preferências">
            <Settings className="size-4" aria-hidden="true" />
          </DropdownMenuTrigger>

          <DropdownMenuContent align="end" className="w-64">
            <DropdownMenuGroup>
              <DropdownMenuLabel>Aparência</DropdownMenuLabel>
              <DropdownMenuRadioGroup value={theme} onValueChange={handleThemeChange}>
                {THEMES.map((option) => (
                  <DropdownMenuRadioItem key={option} value={option}>
                    {themeLabels[option]}
                  </DropdownMenuRadioItem>
                ))}
              </DropdownMenuRadioGroup>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Minha conta</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void navigate('/perfil')}>Meu perfil</DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuGroup>
              <DropdownMenuLabel>Sistema</DropdownMenuLabel>
              <DropdownMenuItem onClick={() => void navigate('/configuracoes')}>
                Configurações
              </DropdownMenuItem>
            </DropdownMenuGroup>

            <DropdownMenuSeparator />

            <DropdownMenuItem disabled>
              <LogOut aria-hidden="true" />
              Sair
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <div className="hidden items-center gap-2 text-sm sm:flex">
          <CircleUser className="size-8 text-muted-foreground" aria-hidden="true" />
          <span>Usuário</span>
        </div>
      </div>
    </header>
  )
}