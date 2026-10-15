import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, MessageCircle, Plus, Search, Users } from 'lucide-react'
import { useAuth } from '@/auth/auth-context'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface ClientListItem {
  id: string
  type: 'INDIVIDUAL' | 'COMPANY'
  name: string
  tradeName: string | null
  document: string
  whatsapp: string
  city: string | null
  state: string | null
}

interface ClientListResponse {
  total: number
  page: number
  pageSize: number
  items: ClientListItem[]
}

const SEARCH_DELAY_MS = 300

function initials(name: string): string {
  const words = name.split(/\s+/).filter((word) => word.length > 2)
  return (words.slice(0, 2).map((word) => word[0]).join('') || name.slice(0, 2)).toUpperCase()
}

function location(client: ClientListItem): string {
  if (client.city && client.state) return `${client.city} - ${client.state}`
  return client.city ?? client.state ?? 'Cidade não informada'
}

const outlineButton =
  'inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg border border-input bg-card text-sm font-semibold transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring'

function ClientCard({ client }: { client: ClientListItem }) {
  const isCompany = client.type === 'COMPANY'
  const whatsappUrl = `https://wa.me/55${encodeURIComponent(client.whatsapp)}`

  return (
    <article className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5 text-card-foreground">
      <div className="flex items-center gap-3">
        <div
          aria-hidden="true"
          className={`grid size-11 shrink-0 place-items-center rounded-lg font-bold ${
            isCompany ? 'bg-primary/15 text-ring' : 'bg-muted text-foreground'
          }`}
        >
          {initials(client.tradeName ?? client.name)}
        </div>
        <div className="min-w-0">
          <h2 className="truncate text-base font-semibold" title={client.name}>
            {client.tradeName ?? client.name}
          </h2>
          <p className="truncate text-sm text-muted-foreground">
            {isCompany ? 'Empresa' : 'Pessoa física'} · {location(client)}
          </p>
        </div>
      </div>

      <p className="text-sm text-muted-foreground">
        <span className="sr-only">{isCompany ? 'CNPJ' : 'CPF'}: </span>
        {client.document}
      </p>

      <div className="flex gap-2 border-t border-border pt-3">
        <Link to={`/clientes/${client.id}`} className={outlineButton}>
          Ver ficha
        </Link>
        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className={`${outlineButton} text-success`}
          aria-label={`Abrir WhatsApp de ${client.tradeName ?? client.name} (abre em nova aba)`}
        >
          <MessageCircle aria-hidden="true" className="size-4" />
          WhatsApp
        </a>
      </div>
    </article>
  )
}

function CardSkeleton() {
  return <div aria-hidden="true" className="h-44 animate-pulse rounded-xl border border-border bg-card" />
}

export function ClientsPage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('clientes:editar') ?? false
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(1)
  const [data, setData] = useState<ClientListResponse | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = `Clientes · ${brand.name}`
  }, [])

  // Espera o usuário parar de digitar antes de buscar
  useEffect(() => {
    const timer = setTimeout(() => {
      setQuery(search.trim())
      setPage(1)
    }, SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ page: String(page) })
    if (query) params.set('q', query)

    setLoading(true)
    setError(null)
    apiFetch<ClientListResponse>(`/clients?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setData(response)
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return
        setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os clientes.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })

    // Cancela a busca anterior se o usuário digitar de novo
    return () => controller.abort()
  }, [query, page])

  const totalPages = data ? Math.max(1, Math.ceil(data.total / data.pageSize)) : 1

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Clientes</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? 'cliente encontrado' : 'clientes encontrados'}` : 'Carregando…'}
          </p>
        </div>
        {canEdit && (
          <Link
            to="/clientes/novo"
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Plus aria-hidden="true" className="size-4" />
            Novo cliente
          </Link>
        )}
      </div>

      <div className="relative w-full max-w-md">
        <label htmlFor="client-search" className="sr-only">
          Buscar cliente
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="client-search"
          type="search"
          autoComplete="off"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, cidade ou CPF/CNPJ"
          className="h-11 bg-card pl-9 text-base"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center">
          <Users aria-hidden="true" className="size-8 text-muted-foreground" />
          <p className="text-sm text-muted-foreground">
            {query ? `Nenhum cliente encontrado para "${query}".` : 'Nenhum cliente cadastrado ainda.'}
          </p>
        </div>
      ) : (
        <div
          aria-busy={loading}
          className={`grid grid-cols-[repeat(auto-fill,minmax(18rem,1fr))] gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {data?.items.map((client) => (
            <ClientCard key={client.id} client={client} />
          ))}
        </div>
      )}

      {data && totalPages > 1 && (
        <nav aria-label="Paginação" className="flex items-center justify-center gap-3">
          <button
            type="button"
            disabled={page <= 1 || loading}
            onClick={() => setPage((p) => p - 1)}
            className="inline-flex size-11 items-center justify-center rounded-lg border border-input bg-card disabled:opacity-40"
            aria-label="Página anterior"
          >
            <ChevronLeft aria-hidden="true" className="size-4" />
          </button>
          <span className="text-sm text-muted-foreground">
            Página {page} de {totalPages}
          </span>
          <button
            type="button"
            disabled={page >= totalPages || loading}
            onClick={() => setPage((p) => p + 1)}
            className="inline-flex size-11 items-center justify-center rounded-lg border border-input bg-card disabled:opacity-40"
            aria-label="Próxima página"
          >
            <ChevronRight aria-hidden="true" className="size-4" />
          </button>
        </nav>
      )}
    </section>
  )
}