import { Fragment, useCallback, useEffect, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Plus, Wallet } from 'lucide-react'
import {
  ENTRY_FILTER_LABELS,
  ENTRY_FILTERS,
  ENTRY_KIND_LABELS,
  ENTRY_KINDS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  type EntryFilter,
  type EntryKind,
  type PaymentMethod,
} from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface Entry {
  id: string
  kind: EntryKind
  description: string
  supplier: string | null
  dueDate: string
  amount: string
  paymentMethod: PaymentMethod | null
  paidAt: string | null
  installmentNumber: number | null
  installmentCount: number | null
  manual: boolean
  contract: { id: string; number: number; client: { id: string; name: string; tradeName: string | null } } | null
  maintenance: { id: string; machine: { code: string } } | null
}

interface EntryList {
  today: string
  totals: { receivable: number; received: number; overdue: number; payable: number }
  counts: Record<EntryKind, number>
  items: Entry[]
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const DAY_MS = 86_400_000
const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / DAY_MS)

function shiftMonth(month: string, delta: number) {
  const d = new Date(`${month}-01T00:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + delta)
  return d.toISOString().slice(0, 7)
}

const monthTitle = (month: string) => {
  const text = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}

function situation(entry: Entry, today: string): { text: string; style: string } {
  if (entry.paidAt) return { text: `Pago ${brDate(entry.paidAt)}`, style: 'bg-success/15 text-success' }
  const days = daysBetween(today, entry.dueDate)
  if (days < 0) return { text: `Vencido há ${-days} ${days === -1 ? 'dia' : 'dias'}`, style: 'bg-destructive/15 text-destructive' }
  if (days === 0) return { text: 'Vence hoje', style: 'bg-warning/15 text-warning' }
  if (days <= 7) return { text: `Vence em ${days} ${days === 1 ? 'dia' : 'dias'}`, style: 'bg-warning/15 text-warning' }
  return { text: 'Em aberto', style: 'bg-muted text-foreground' }
}

function who(entry: Entry) {
  if (entry.contract) return entry.contract.client.tradeName ?? entry.contract.client.name
  return entry.supplier ?? '—'
}

function origin(entry: Entry) {
  if (entry.contract) return { label: `Contrato nº ${entry.contract.number}`, href: `/contratos/${entry.contract.id}` }
  if (entry.maintenance) return { label: `Manutenção ${entry.maintenance.machine.code}`, href: `/manutencao/${entry.maintenance.id}` }
  return null
}

export function FinancePage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('financeiro:editar') ?? false
  const [kind, setKind] = useState<EntryKind>('RECEIVABLE')
  const [filter, setFilter] = useState<EntryFilter>('all')
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const [data, setData] = useState<EntryList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [paying, setPaying] = useState<{ id: string; paidAt: string; method: PaymentMethod } | null>(null)
  const [busy, setBusy] = useState(false)
  const [reload, setReload] = useState(0)

  useEffect(() => {
    document.title = `Financeiro · ${brand.name}`
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams({ kind, filter, month })
    setLoading(true)
    setError(null)
    apiFetch<EntryList>(`/finance/entries?${params.toString()}`, { signal: controller.signal })
      .then((r) => !controller.signal.aborted && setData(r))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar o financeiro.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [kind, filter, month, reload])

  const today = data?.today ?? localToday()

  const run = useCallback(async (path: string, body?: object) => {
    setBusy(true)
    setError(null)
    try {
      await apiFetch(path, { method: 'POST', ...(body ? { body: JSON.stringify(body) } : {}) })
      setPaying(null)
      setReload((n) => n + 1)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }, [])

  const listTotal = (data?.items ?? []).reduce((sum, e) => sum + Number(e.amount), 0)

  const cards = [
    { label: 'A receber no mês', value: data?.totals.receivable ?? 0, style: '' },
    { label: 'Recebido', value: data?.totals.received ?? 0, style: 'text-success' },
    { label: 'Vencido', value: data?.totals.overdue ?? 0, style: 'text-destructive', alert: (data?.totals.overdue ?? 0) > 0 },
    { label: 'A pagar no mês', value: data?.totals.payable ?? 0, style: 'text-warning' },
  ]

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Financeiro</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {monthTitle(month)}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            aria-label="Mês anterior"
            onClick={() => setMonth(shiftMonth(month, -1))}
            className="grid size-11 place-items-center rounded-lg border border-input bg-card hover:bg-accent"
          >
            <ChevronLeft aria-hidden="true" className="size-5" />
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="grid size-11 place-items-center rounded-lg border border-input bg-card hover:bg-accent"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          {canEdit && (
            <Link
              to="/financeiro/novo"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="size-4" />
              Novo lançamento
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {cards.map((card) => (
          <div
            key={card.label}
            className={`rounded-xl border px-4 py-3.5 ${card.alert ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-card'}`}
          >
            <p className="text-sm text-muted-foreground">{card.label}</p>
            <p className={`mt-1 text-xl font-bold sm:text-2xl ${card.style}`}>{money.format(card.value)}</p>
          </div>
        ))}
      </div>

      <div role="tablist" aria-label="Tipo de lançamento" className="flex gap-1 border-b border-border">
        {ENTRY_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="tab"
            aria-selected={kind === option}
            onClick={() => {
              setKind(option)
              setPaying(null)
            }}
            className={`-mb-px min-h-11 border-b-[3px] px-4 text-sm ${
              kind === option ? 'border-primary font-bold' : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {ENTRY_KIND_LABELS[option]} <span className="font-normal text-muted-foreground">{data?.counts[option] ?? ''}</span>
          </button>
        ))}
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por situação">
        {ENTRY_FILTERS.map((option) => (
          <button
            key={option}
            type="button"
            aria-pressed={filter === option}
            onClick={() => setFilter(option)}
            className={`min-h-10 rounded-full border px-4 text-sm ${
              filter === option ? 'border-foreground bg-foreground text-background' : 'border-input bg-card'
            }`}
          >
            {ENTRY_FILTER_LABELS[option]}
          </button>
        ))}
        {filter === 'overdue' && <span className="self-center text-xs text-muted-foreground">Inclui meses anteriores</span>}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {data && data.items.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
          <Wallet aria-hidden="true" className="size-8" />
          Nenhum lançamento {kind === 'RECEIVABLE' ? 'a receber' : 'a pagar'} com esse filtro.
        </div>
      ) : (
        <div
          aria-busy={loading}
          className={`overflow-x-auto rounded-xl border border-border bg-card transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <table className="w-full min-w-200 text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Vencimento</th>
                <th scope="col" className="px-4 py-3">{kind === 'RECEIVABLE' ? 'Cliente' : 'Fornecedor'}</th>
                <th scope="col" className="px-4 py-3">Descrição</th>
                <th scope="col" className="px-4 py-3">Forma</th>
                <th scope="col" className="px-4 py-3">Situação</th>
                <th scope="col" className="px-4 py-3 text-right">Valor</th>
                <th scope="col" className="px-4 py-3">
                  <span className="sr-only">Ações</span>
                </th>
              </tr>
            </thead>
            <tbody>
              {data?.items.map((entry) => {
                const status = situation(entry, today)
                const source = origin(entry)
                const isPaying = paying?.id === entry.id
                return (
                  <Fragment key={entry.id}>
                    <tr className="border-t border-border">
                      <td className="px-4 py-3 whitespace-nowrap">{brDate(entry.dueDate)}</td>
                      <td className="px-4 py-3 font-semibold">{who(entry)}</td>
                      <td className="max-w-80 px-4 py-3">
                        <span className="line-clamp-1">{entry.description}</span>
                        {source && (
                          <Link to={source.href} className="text-xs text-muted-foreground underline-offset-4 hover:underline">
                            {source.label}
                          </Link>
                        )}
                      </td>
                      <td className="px-4 py-3">{entry.paymentMethod ? PAYMENT_LABELS[entry.paymentMethod] : '—'}</td>
                      <td className="px-4 py-3">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-semibold whitespace-nowrap ${status.style}`}>{status.text}</span>
                      </td>
                      <td className="px-4 py-3 text-right font-semibold whitespace-nowrap">{money.format(Number(entry.amount))}</td>
                      <td className="px-4 py-3 text-right whitespace-nowrap">
                        {canEdit && !entry.paidAt && !isPaying && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => setPaying({ id: entry.id, paidAt: today, method: entry.paymentMethod ?? 'PIX' })}
                            className="min-h-9 rounded-lg border border-input bg-card px-3 text-sm hover:bg-accent"
                          >
                            Dar baixa
                          </button>
                        )}
                        {canEdit && entry.paidAt && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => window.confirm('Desfazer este pagamento?') && void run(`/finance/entries/${entry.id}/unpay`)}
                            className="min-h-9 rounded-lg px-3 text-sm text-muted-foreground underline-offset-4 hover:underline"
                          >
                            Desfazer
                          </button>
                        )}
                        {canEdit && entry.manual && !entry.paidAt && !isPaying && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => window.confirm('Cancelar este lançamento?') && void run(`/finance/entries/${entry.id}/cancel`)}
                            className="ml-1 min-h-9 rounded-lg px-3 text-sm text-destructive underline-offset-4 hover:underline"
                          >
                            Cancelar
                          </button>
                        )}
                      </td>
                    </tr>
                    {isPaying && paying && (
                      <tr className="bg-muted/40">
                        <td colSpan={7} className="px-4 py-3">
                          <form
                            onSubmit={(e) => {
                              e.preventDefault()
                              void run(`/finance/entries/${entry.id}/pay`, { paidAt: paying.paidAt, paymentMethod: paying.method })
                            }}
                            className="flex flex-wrap items-end gap-3"
                          >
                            <label className="flex flex-col gap-1 text-xs font-semibold">
                              Data do pagamento
                              <Input
                                type="date"
                                max={today}
                                required
                                value={paying.paidAt}
                                onChange={(e) => setPaying({ ...paying, paidAt: e.target.value })}
                                className="h-10 font-normal"
                              />
                            </label>
                            <label className="flex flex-col gap-1 text-xs font-semibold">
                              Forma
                              <select
                                value={paying.method}
                                onChange={(e) => setPaying({ ...paying, method: e.target.value as PaymentMethod })}
                                className="h-10 rounded-lg border border-input bg-card px-2 text-sm font-normal"
                              >
                                {PAYMENT_METHODS.map((m) => (
                                  <option key={m} value={m}>
                                    {PAYMENT_LABELS[m]}
                                  </option>
                                ))}
                              </select>
                            </label>
                            <button
                              type="submit"
                              disabled={busy}
                              className="min-h-10 rounded-lg bg-foreground px-4 text-sm font-semibold text-background"
                            >
                              Confirmar baixa de {money.format(Number(entry.amount))}
                            </button>
                            <button type="button" onClick={() => setPaying(null)} className="min-h-10 px-3 text-sm underline-offset-4 hover:underline">
                              Voltar
                            </button>
                          </form>
                        </td>
                      </tr>
                    )}
                  </Fragment>
                )
              })}
            </tbody>
            {data && data.items.length > 0 && (
              <tfoot>
                <tr className="border-t-2 border-border font-bold">
                  <td colSpan={5} className="px-4 py-3">
                    Total da lista
                  </td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">{money.format(listTotal)}</td>
                  <td />
                </tr>
              </tfoot>
            )}
          </table>
        </div>
      )}
    </section>
  )
}