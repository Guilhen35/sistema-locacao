import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { FileText, Plus, Search } from 'lucide-react'
import { CONTRACT_STATUSES, CONTRACT_STATUS_LABELS, type ContractStatus } from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface ContractRow {
  id: string
  number: number
  status: ContractStatus
  startDate: string
  endDate: string
  totalAmount: string
  client: { name: string; tradeName: string | null }
  items: { machine: { code: string } }[]
}

interface ContractList {
  total: number
  items: ContractRow[]
}

export const STATUS_STYLES: Record<ContractStatus, string> = {
  DRAFT: 'bg-muted text-foreground',
  ACTIVE: 'bg-success text-white',
  FINISHED: 'bg-info text-white',
  CANCELLED: 'bg-destructive/15 text-destructive',
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

export function ContractsPage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('contratos:editar') ?? false
  const [status, setStatus] = useState<ContractStatus | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<ContractList | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Contratos · ${brand.name}`
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), 300)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (status) params.set('status', status)
    setError(null)
    apiFetch<ContractList>(`/contracts?${params.toString()}`, { signal: controller.signal })
      .then((r) => !controller.signal.aborted && setData(r))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os contratos.')
      })
    return () => controller.abort()
  }, [query, status])

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Contratos</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {data ? `${data.total} ${data.total === 1 ? 'contrato' : 'contratos'}` : 'Carregando…'}
          </p>
        </div>
        {canEdit && (
          <Link
            to="/contratos/novo"
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Plus aria-hidden="true" className="size-4" />
            Novo contrato
          </Link>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por status">
        {[null, ...CONTRACT_STATUSES].map((option) => (
          <button
            key={option ?? 'all'}
            type="button"
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
            className={`min-h-10 rounded-full border px-4 text-sm ${
              status === option ? 'border-foreground bg-foreground text-background' : 'border-input bg-card'
            }`}
          >
            {option ? CONTRACT_STATUS_LABELS[option] : 'Todos'}
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-md">
        <label htmlFor="contract-search" className="sr-only">
          Buscar contrato
        </label>
        <Search aria-hidden="true" className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          id="contract-search"
          type="search"
          autoComplete="off"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Número, cliente ou máquina"
          className="h-11 bg-card pl-9 text-base"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
          <FileText aria-hidden="true" className="size-8" />
          Nenhum contrato encontrado.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-200 text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Nº</th>
                <th scope="col" className="px-4 py-3">Cliente</th>
                <th scope="col" className="px-4 py-3">Máquinas</th>
                <th scope="col" className="px-4 py-3">Período</th>
                <th scope="col" className="px-4 py-3 text-right">Total</th>
                <th scope="col" className="px-4 py-3">Status</th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((contract) => (
                <tr key={contract.id} className="border-t border-border hover:bg-accent/50">
                  <td className="px-4 py-3 font-semibold">
                    <Link to={`/contratos/${contract.id}`} className="underline-offset-4 hover:underline">
                      #{String(contract.number).padStart(6, '0')}
                    </Link>
                  </td>
                  <td className="px-4 py-3">{contract.client.tradeName ?? contract.client.name}</td>
                  <td className="px-4 py-3">{contract.items.map((i) => i.machine.code).join(', ')}</td>
                  <td className="px-4 py-3">
                    {brDate(contract.startDate)} a {brDate(contract.endDate)}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money.format(Number(contract.totalAmount))}</td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${STATUS_STYLES[contract.status]}`}>
                      {CONTRACT_STATUS_LABELS[contract.status]}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}