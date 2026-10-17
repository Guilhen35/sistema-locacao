import { createBrowserRouter, Link } from 'react-router'
import { RequireAuth } from '@/auth/require-auth'
import { AppLayout } from '@/components/layout/app-layout'
import { PagePlaceholder } from '@/components/layout/page-placeholder'
import { LoginPage } from '@/pages/login-page'
import { ClientsPage } from '@/pages/clients-page'
import { ClientFormPage } from '@/pages/client-form-page'
import { MachinesPage } from '@/pages/machines-page'
import { MachineTypesPage } from '@/pages/machine-types-page'
import { MachineFormPage } from '@/pages/machine-form-page'
import { ContractsPage } from '@/pages/contracts-page'
import { ContractFormPage } from '@/pages/contract-form-page'
import { MaintenancesPage } from '@/pages/maintenances-page'
import { MaintenanceFormPage } from '@/pages/maintenance-form-page'
import { ChangePasswordPage } from '@/pages/change-password-page'

function NotFound() {
  return (
    <section className="flex flex-col items-start gap-4">
      <h1 className="text-2xl font-bold">Página não encontrada</h1>
      <p className="text-sm text-muted-foreground">O endereço acessado não existe ou foi removido.</p>
      <Link
        to="/"
        className="rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
      >
        Voltar ao Dashboard
      </Link>
    </section>
  )
}

export const router = createBrowserRouter([
  { path: '/login', element: <LoginPage /> },
  {
    // Tudo aqui dentro exige sessão válida
    element: <RequireAuth />,
    children: [
      {
        path: '/trocar-senha',
        element: <ChangePasswordPage />,
      },
      {
        path: '/',
        element: <AppLayout />,
        children: [
          {
            index: true,
            element: (
              <PagePlaceholder title="Dashboard" description="Visão geral da frota, das locações e do financeiro." />
            ),
          },
          {
            path: 'clientes',
            element: <ClientsPage />,
          },
          { path: 'clientes/novo', element: <ClientFormPage /> },
          { path: 'clientes/:id', element: <ClientFormPage /> },
          {
            path: 'maquinas',
            element: <MachinesPage />,
          },
          { path: 'maquinas/tipos', element: <MachineTypesPage /> },
          { path: 'maquinas/nova', element: <MachineFormPage /> },
          { path: 'maquinas/:id', element: <MachineFormPage /> },
          {
            path: 'contratos',
            element: <ContractsPage />,
          },
          { path: 'contratos/novo', element: <ContractFormPage /> },
          { path: 'contratos/:id', element: <ContractFormPage /> },
          {
            path: 'agenda',
            element: <PagePlaceholder title="Agenda" description="Calendário e linha do tempo da frota." />,
          },
          {
            path: 'financeiro',
            element: <PagePlaceholder title="Financeiro" description="Pagamentos, contas a receber e atrasos." />,
          },
          {
            path: 'manutencao',
            element: <MaintenancesPage />,
          },
          { path: 'manutencao/nova', element: <MaintenanceFormPage /> },
          { path: 'manutencao/:id', element: <MaintenanceFormPage /> },
          {
            path: 'relatorios',
            element: <PagePlaceholder title="Relatórios" description="Relatórios gerenciais e exportações." />,
          },
          {
            path: 'configuracoes',
            element: <PagePlaceholder title="Configurações" description="Dados da empresa, usuários e permissões." />,
          },
          {
            path: 'perfil',
            element: (
              <PagePlaceholder title="Meu perfil" description="Seus dados, senha e verificação em duas etapas." />
            ),
          },
          { path: '*', element: <NotFound /> },
        ],
      },
    ],
  },
])
