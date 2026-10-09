import { NavLink } from 'react-router'
import {
  CalendarDays,
  ChartColumn,
  FileText,
  LayoutDashboard,
  Settings,
  Truck,
  Users,
  Wallet,
  Wrench,
  type LucideIcon,
} from 'lucide-react'
import { brand } from '@/config/brand'
import { cn } from '@/lib/utils'

type NavItem = {
  label: string
  to: string
  icon: LucideIcon
}

const mainItems: NavItem[] = [
  { label: 'Dashboard', to: '/', icon: LayoutDashboard },
  { label: 'Clientes', to: '/clientes', icon: Users },
  { label: 'Máquinas', to: '/maquinas', icon: Truck },
  { label: 'Contratos', to: '/contratos', icon: FileText },
  { label: 'Agenda', to: '/agenda', icon: CalendarDays },
  { label: 'Financeiro', to: '/financeiro', icon: Wallet },
  { label: 'Manutenção', to: '/manutencao', icon: Wrench },
  { label: 'Relatórios', to: '/relatorios', icon: ChartColumn },
]

const systemItems: NavItem[] = [
  { label: 'Configurações', to: '/configuracoes', icon: Settings },
]

function SidebarLink({ item }: { item: NavItem }) {
  const Icon = item.icon

  return (
    <NavLink
      to={item.to}
      end={item.to === '/'}
      className={({ isActive }) =>
        cn(
          'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors',
          'hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
          'focus-visible:outline-2 focus-visible:outline-sidebar-ring',
          isActive && 'bg-sidebar-accent font-semibold text-sidebar-primary',
        )
      }
    >
      <Icon className="size-4 shrink-0" aria-hidden="true" />
      {item.label}
    </NavLink>
  )
}

export function AppSidebar() {
  return (
    <aside className="hidden w-64 shrink-0 flex-col gap-7 border-r border-sidebar-border bg-sidebar px-4 py-6 text-sidebar-foreground md:sticky md:top-0 md:flex md:h-svh">
      <div className="flex items-center gap-3 px-2">
        <div
          aria-hidden="true"
          className="flex size-9 items-center justify-center rounded-lg bg-sidebar-primary text-lg font-bold text-sidebar-primary-foreground"
        >
          {brand.name.charAt(0)}
        </div>
        <div className="leading-tight">
          <p className="font-bold text-sidebar-accent-foreground">{brand.name}</p>
          <p className="text-xs">{brand.tagline}</p>
        </div>
      </div>

      <nav aria-label="Menu principal" className="flex flex-col gap-1">
        {mainItems.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>

      <nav aria-label="Sistema" className="mt-auto flex flex-col gap-1 border-t border-sidebar-border pt-4">
        {systemItems.map((item) => (
          <SidebarLink key={item.to} item={item} />
        ))}
      </nav>
    </aside>
  )
}