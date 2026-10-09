import { createBrowserRouter, Link } from 'react-router'
import { AppLayout } from '@/components/layout/app-layout'
import { PagePlaceholder } from '@/components/layout/page-placeholder'

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
        element: <PagePlaceholder title="Clientes" description="Cadastro de clientes e histórico de locações." />,
      },
      {
        path: 'maquinas',
        element: <PagePlaceholder title="Máquinas" description="Frota, categorias, fotos e características." />,
      },
      {
        path: 'contratos',
        element: <PagePlaceholder title="Contratos" description="Locações, renovações e documentos." />,
      },
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
        element: <PagePlaceholder title="Manutenção" description="Manutenções preventivas, corretivas e custos." />,
      },
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
        element: <PagePlaceholder title="Meu perfil" description="Seus dados, senha e verificação em duas etapas." />,
      },
      { path: '*', element: <NotFound /> },
    ],
  },
])