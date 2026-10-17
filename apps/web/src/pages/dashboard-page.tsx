import { useEffect, useMemo, useState, type ReactNode } from 'react'
import { Link } from 'react-router'
import { Plus } from 'lucide-react'
import { useAuth } from '@/auth/auth-context'
import { brand } from '@/config/brand'
import { apiFetch } from '@/lib/api'

type FleetStatus = 'AVAILABLE' | 'RENTED' | 'RESERVED' | 'MAINTENANCE' | 'BLOCKED'

interface Fleet {
  total: number
  counts: Record<FleetStatus, number>
}

interface Rentals {
  month: string
  daysInMonth: number
  activeContracts: number
  startingSoon: number
  ranking: { machineId: string; code: string; days: number; occupancy: number }[]
}

interface EntryRow {
  id: string
  who: string
  description: string
  dueDate: string
  amount: number
}

interface ClientRow {
  clientId: string
  name: string
  amount: number
}

interface Financial {
  today: string
  totals: { receivable: number; received: number; overdue: number; overdueCount: number }
  receivables: EntryRow[]
  payables: EntryRow[]
  revenue: { types: { id: string; name: string }[]; months: { month: string; values: number[] }[] }
  topClients: { month: ClientRow[]; sixMonths: ClientRow[] }
}

interface Movement {
  id: string
  startDate: string
  endDate: string
  machine: { code: string }
  contract: { id: string }
  client: { name: string; tradeName: string | null }
}

interface Movements {
  items: Movement[]
  overdue: Movement[]
}

// Paleta categórica validada (ordem fixa: a cor segue o tipo, nunca a posição)
const SERIES = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#6250d6']
const OTHER_COLOR = '#8a8f98'
const BAR_COLOR = SERIES[0]

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const compact = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL', notation: 'compact', maximumFractionDigits: 1 })
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())
const brDate = (iso: string) => iso.split('-').reverse().slice(0, 2).join('/')
const addDays = (iso: string, days: number) => {
  const d = new Date(`${iso}T00:00:00Z`)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const shortMonth = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'short', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`)).replace('.', '')
const longMonth = (month: string) =>
  new Intl.DateTimeFormat('pt-BR', { month: 'long', timeZone: 'UTC' }).format(new Date(`${month}-01T00:00:00Z`))
const weekdayShort = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'short', day: 'numeric', timeZone: 'UTC' }).format(new Date(`${iso}T00:00:00Z`)).replace('.', '')

function greeting() {
  const hour = Number(new Intl.DateTimeFormat('en-US', { hour: 'numeric', hourCycle: 'h23', timeZone: 'America/Sao_Paulo' }).format(new Date()))
  return hour < 12 ? 'Bom dia' : hour < 18 ? 'Boa tarde' : 'Boa noite'
}

function useLoad<T>(path: string | null) {
  const [data, setData] = useState<T | null>(null)
  useEffect(() => {
    if (!path) return
    const controller = new AbortController()
    apiFetch<T>(path, { signal: controller.signal })
      .then((r) => !controller.signal.aborted && setData(r))
      .catch(() => !controller.signal.aborted && setData(null))
    return () => controller.abort()
  }, [path])
  return data
}

function Card({ title, link, children, className = '' }: { title: string; link?: { to: string; label: string }; children: ReactNode; className?: string }) {
  return (
    <section className={`flex min-w-0 flex-col gap-4 rounded-xl border border-border bg-card p-5 ${className}`}>
      <div className="flex flex-wrap items-baseline gap-2">
        <h2 className="text-base font-bold">{title}</h2>
        {link && (
          <Link to={link.to} className="ml-auto text-sm text-ring underline-offset-4 hover:underline">
            {link.label}
          </Link>
        )}
      </div>
      {children}
    </section>
  )
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted-foreground">{children}</p>
}

// Barras horizontais de uma série só: o título já diz o que é, sem legenda
function HorizontalBars({ rows }: { rows: { key: string; label: string; value: number; display: string; href?: string }[] }) {
  const max = Math.max(...rows.map((r) => r.value), 1)
  return (
    <ul className="flex flex-col gap-2.5 text-sm">
      {rows.map((row) => (
        <li key={row.key} className="grid grid-cols-[minmax(4.5rem,9rem)_1fr_auto] items-center gap-3" title={`${row.label}: ${row.display}`}>
          {row.href ? (
            <Link to={row.href} className="truncate font-semibold underline-offset-4 hover:underline">
              {row.label}
            </Link>
          ) : (
            <span className="truncate font-semibold">{row.label}</span>
          )}
          <span className="h-3 overflow-hidden rounded-r bg-muted">
            <span className="block h-full rounded-r" style={{ width: `${(row.value / max) * 100}%`, background: BAR_COLOR }} />
          </span>
          <span className="text-right text-muted-foreground tabular-nums">{row.display}</span>
        </li>
      ))}
    </ul>
  )
}

function RevenueChart({ revenue }: { revenue: Financial['revenue'] }) {
  const [hover, setHover] = useState<number | null>(null)

  // Até 7 tipos com cor própria; o resto vira "Outros"
  const series = useMemo(() => {
    const named = revenue.types.slice(0, SERIES.length)
    const rest = revenue.types.length > SERIES.length
    return {
      names: [...named.map((t) => t.name), ...(rest ? ['Outros'] : [])],
      colors: [...named.map((_, i) => SERIES[i] ?? OTHER_COLOR), ...(rest ? [OTHER_COLOR] : [])],
      months: revenue.months.map((m) => ({
        month: m.month,
        values: rest ? [...m.values.slice(0, SERIES.length), m.values.slice(SERIES.length).reduce((a, b) => a + b, 0)] : m.values,
      })),
    }
  }, [revenue])

  const totals = series.months.map((m) => m.values.reduce((a, b) => a + b, 0))
  const max = Math.max(...totals, 1)

  if (series.names.length === 0) return <Empty>Ainda não há contratos ativos ou encerrados nos últimos 6 meses.</Empty>

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
        {series.names.map((name, i) => (
          <span key={name} className="flex items-center gap-1.5">
            <span aria-hidden="true" className="size-2.5 rounded-sm" style={{ background: series.colors[i] }} />
            {name}
          </span>
        ))}
      </div>

      <div className="relative">
        <div aria-hidden="true" className="grid h-52 grid-cols-6 items-end gap-3 border-b border-border sm:gap-5">
          {series.months.map((m, mi) => (
            <div
              key={m.month}
              onMouseEnter={() => setHover(mi)}
              onMouseLeave={() => setHover(null)}
              className={`flex h-full flex-col justify-end rounded-t-md px-1 ${hover === mi ? 'bg-muted/60' : ''}`}
            >
              <span className="mb-1 text-center text-[11px] text-muted-foreground tabular-nums">{totals[mi] ? compact.format(totals[mi]) : ''}</span>
              <div className="mx-auto flex w-full max-w-11 flex-col-reverse gap-0.5" style={{ height: `${(totals[mi] / max) * 85}%` }}>
                {m.values.map((v, vi) =>
                  v > 0 ? (
                    <span
                      key={vi}
                      className="w-full last:rounded-t"
                      style={{ height: `${(v / (totals[mi] || 1)) * 100}%`, background: series.colors[vi] }}
                    />
                  ) : null,
                )}
              </div>
            </div>
          ))}
        </div>
        {hover !== null && totals[hover] > 0 && (
          <div
            role="tooltip"
            className="pointer-events-none absolute top-2 z-10 min-w-44 rounded-lg border border-border bg-popover p-3 text-xs text-popover-foreground shadow-md"
            style={hover < 3 ? { left: `${((hover + 1) / 6) * 100}%` } : { right: `${((6 - hover) / 6) * 100}%` }}
          >
            <p className="mb-1.5 font-semibold capitalize">{longMonth(series.months[hover].month)}</p>
            {series.months[hover].values.map((v, vi) =>
              v > 0 ? (
                <p key={vi} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2 rounded-sm" style={{ background: series.colors[vi] }} />
                  {series.names[vi]}
                  <span className="ml-auto pl-3 tabular-nums">{money.format(v)}</span>
                </p>
              ) : null,
            )}
            <p className="mt-1.5 flex border-t border-border pt-1.5 font-semibold">
              Total<span className="ml-auto tabular-nums">{money.format(totals[hover])}</span>
            </p>
          </div>
        )}
        <div aria-hidden="true" className="grid grid-cols-6 gap-3 pt-2 text-center text-xs text-muted-foreground capitalize sm:gap-5">
          {series.months.map((m) => (
            <span key={m.month}>{shortMonth(m.month)}</span>
          ))}
        </div>
      </div>

      <details className="text-sm">
        <summary className="cursor-pointer text-muted-foreground">Ver em tabela</summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-xs">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th scope="col" className="py-1 pr-3">Tipo</th>
                {series.months.map((m) => (
                  <th key={m.month} scope="col" className="py-1 pr-3 text-right capitalize">
                    {shortMonth(m.month)}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {series.names.map((name, i) => (
                <tr key={name} className="border-t border-border">
                  <th scope="row" className="py-1 pr-3 text-left font-medium">{name}</th>
                  {series.months.map((m) => (
                    <td key={m.month} className="py-1 pr-3 text-right tabular-nums">{money.format(m.values[i] ?? 0)}</td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </div>
  )
}

const FLEET: { key: FleetStatus; label: string; style: string }[] = [
  { key: 'AVAILABLE', label: 'Disponíveis', style: 'bg-success/15 text-success' },
  { key: 'RENTED', label: 'Alugadas', style: 'bg-info/15 text-info' },
  { key: 'RESERVED', label: 'Reservadas', style: 'bg-reserved/15 text-reserved' },
  { key: 'MAINTENANCE', label: 'Manutenção', style: 'bg-warning/15 text-warning' },
  { key: 'BLOCKED', label: 'Bloqueadas', style: 'bg-muted text-muted-foreground' },
]

export function DashboardPage() {
  const { user } = useAuth()
  const can = (key: string) => user?.permissions.includes(key) ?? false
  const [clientRange, setClientRange] = useState<'month' | 'sixMonths'>('month')
  const today = localToday()

  const fleet = useLoad<Fleet>(can('maquinas:ler') ? '/dashboard/fleet' : null)
  const rentals = useLoad<Rentals>(can('contratos:ler') ? '/dashboard/rentals' : null)
  const financial = useLoad<Financial>(can('financeiro:ler') ? '/dashboard/financial' : null)
  const movements = useLoad<Movements>(can('contratos:ler') ? `/agenda?from=${today}&to=${addDays(today, 8)}` : null)

  useEffect(() => {
    document.title = `Dashboard · ${brand.name}`
  }, [])

  const week = useMemo(() => {
    const limit = addDays(today, 7)
    const list = [
      ...(movements?.overdue ?? []).map((m) => ({ key: `late-${m.id}`, date: m.endDate, late: true, text: `Recolher ${m.machine.code}`, m })),
      ...(movements?.items ?? []).flatMap((m) => [
        ...(m.startDate >= today && m.startDate <= limit ? [{ key: `out-${m.id}`, date: m.startDate, late: false, text: `Entregar ${m.machine.code}`, m }] : []),
        ...(m.endDate >= today && m.endDate <= limit ? [{ key: `back-${m.id}`, date: m.endDate, late: false, text: `Recolher ${m.machine.code}`, m }] : []),
      ]),
    ]
    return list.sort((a, b) => Number(b.late) - Number(a.late) || a.date.localeCompare(b.date)).slice(0, 7)
  }, [movements, today])

  const rented = (fleet?.counts.RENTED ?? 0)
  const occupancy = fleet?.total ? Math.round((rented / fleet.total) * 100) : 0
  const firstName = user?.name.split(' ')[0] ?? ''
  const clients = financial?.topClients[clientRange] ?? []

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">
            {greeting()}, {firstName}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground first-letter:uppercase">
            {new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'America/Sao_Paulo' }).format(new Date())}
          </p>
        </div>
        <div className="ml-auto flex flex-wrap gap-2">
          {can('clientes:editar') && (
            <Link to="/clientes/novo" className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-semibold hover:bg-accent">
              <Plus aria-hidden="true" className="size-4" /> Cliente
            </Link>
          )}
          {can('contratos:editar') && (
            <Link to="/contratos/novo" className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground">
              <Plus aria-hidden="true" className="size-4" /> Novo contrato
            </Link>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        {fleet && (
          <Link to="/maquinas" className="rounded-xl border border-border bg-card px-4 py-3.5 hover:shadow-sm">
            <p className="text-sm text-muted-foreground">Frota alugada</p>
            <p className="mt-1 text-2xl font-bold">
              {rented} de {fleet.total}
            </p>
            <span className="mt-2 block h-2 overflow-hidden rounded-full bg-muted">
              <span className="block h-full rounded-full" style={{ width: `${occupancy}%`, background: BAR_COLOR }} />
            </span>
            <p className="mt-1.5 text-xs text-muted-foreground">{occupancy}% da frota agora</p>
          </Link>
        )}
        {financial && (
          <Link to="/financeiro" className="rounded-xl border border-border bg-card px-4 py-3.5 hover:shadow-sm">
            <p className="text-sm text-muted-foreground">A receber no mês</p>
            <p className="mt-1 text-2xl font-bold">{money.format(financial.totals.receivable)}</p>
            <p className="mt-2 text-xs text-success">{money.format(financial.totals.received)} já recebido</p>
          </Link>
        )}
        {financial && (
          <Link
            to="/financeiro"
            className={`rounded-xl border px-4 py-3.5 hover:shadow-sm ${financial.totals.overdue > 0 ? 'border-destructive/40 bg-destructive/10' : 'border-border bg-card'}`}
          >
            <p className="text-sm text-muted-foreground">Pagamentos vencidos</p>
            <p className={`mt-1 text-2xl font-bold ${financial.totals.overdue > 0 ? 'text-destructive' : ''}`}>{money.format(financial.totals.overdue)}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {financial.totals.overdueCount === 0 ? 'Nada em atraso' : `${financial.totals.overdueCount} ${financial.totals.overdueCount === 1 ? 'parcela' : 'parcelas'} em atraso`}
            </p>
          </Link>
        )}
        {rentals && (
          <Link to="/contratos" className="rounded-xl border border-border bg-card px-4 py-3.5 hover:shadow-sm">
            <p className="text-sm text-muted-foreground">Contratos ativos</p>
            <p className="mt-1 text-2xl font-bold">{rentals.activeContracts}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {rentals.startingSoon} {rentals.startingSoon === 1 ? 'começa' : 'começam'} nos próximos 7 dias
            </p>
          </Link>
        )}
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        {financial && (
          <Card title="Faturamento por tipo de máquina" link={{ to: '/financeiro', label: 'Abrir financeiro' }}>
            <RevenueChart revenue={financial.revenue} />
          </Card>
        )}
        {rentals && (
          <Card title={`Máquinas mais alugadas em ${longMonth(rentals.month)}`} link={{ to: '/agenda', label: 'Abrir agenda' }}>
            {rentals.ranking.every((r) => r.days === 0) ? (
              <Empty>Nenhuma máquina alugada neste mês ainda.</Empty>
            ) : (
              <HorizontalBars
                rows={rentals.ranking.map((r) => ({
                  key: r.machineId,
                  label: r.code,
                  value: r.days,
                  display: `${r.days} ${r.days === 1 ? 'dia' : 'dias'} · ${r.occupancy}%`,
                  href: `/maquinas/${r.machineId}`,
                }))}
              />
            )}
          </Card>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {financial && (
          <Card title="Clientes que mais gastaram">
            <div role="group" aria-label="Período" className="flex w-fit overflow-hidden rounded-lg border border-input text-sm">
              {(['month', 'sixMonths'] as const).map((range) => (
                <button
                  key={range}
                  type="button"
                  aria-pressed={clientRange === range}
                  onClick={() => setClientRange(range)}
                  className={`min-h-9 px-3 ${clientRange === range ? 'bg-foreground text-background' : 'bg-card'}`}
                >
                  {range === 'month' ? 'Este mês' : 'Últimos 6 meses'}
                </button>
              ))}
            </div>
            {clients.length === 0 ? (
              <Empty>Sem locações no período.</Empty>
            ) : (
              <HorizontalBars
                rows={clients.map((c) => ({
                  key: c.clientId,
                  label: c.name,
                  value: c.amount,
                  display: money.format(c.amount),
                  href: `/clientes/${c.clientId}`,
                }))}
              />
            )}
          </Card>
        )}

        {movements && (
          <Card title="Movimentos da semana" link={{ to: '/agenda', label: 'Abrir agenda' }}>
            {week.length === 0 ? (
              <Empty>Nenhuma entrega ou recolha nos próximos 7 dias.</Empty>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {week.map((w) => (
                  <li key={w.key} className="flex gap-3">
                    <span className={`w-16 shrink-0 text-xs ${w.late ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                      {w.late ? 'Atrasada' : weekdayShort(w.date)}
                    </span>
                    <Link to={`/contratos/${w.m.contract.id}`} className="min-w-0 truncate underline-offset-4 hover:underline">
                      <strong>{w.text}</strong> · {w.m.client.tradeName ?? w.m.client.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {fleet && (
          <Card title="Frota agora" link={{ to: '/maquinas', label: 'Abrir máquinas' }}>
            <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
              {FLEET.filter((f) => f.key !== 'BLOCKED' || fleet.counts.BLOCKED > 0).map((f) => (
                <div key={f.key} className={`rounded-lg px-3 py-2.5 text-sm ${f.style}`}>
                  <strong className="block text-2xl">{fleet.counts[f.key]}</strong>
                  {f.label}
                </div>
              ))}
            </div>
          </Card>
        )}

        {financial && (
          <Card title="Próximos recebimentos" link={{ to: '/financeiro', label: 'Ver todos' }}>
            {financial.receivables.length === 0 ? (
              <Empty>Nada a receber em aberto.</Empty>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {financial.receivables.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className={`w-12 shrink-0 text-xs ${e.dueDate < financial.today ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                      {brDate(e.dueDate)}
                    </span>
                    <span className="min-w-0 truncate">{e.who}</span>
                    <strong className={`ml-auto whitespace-nowrap ${e.dueDate < financial.today ? 'text-destructive' : ''}`}>{money.format(e.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}

        {financial && (
          <Card title="Contas a pagar" link={{ to: '/financeiro', label: 'Ver todas' }}>
            {financial.payables.length === 0 ? (
              <Empty>Nenhuma conta em aberto.</Empty>
            ) : (
              <ul className="flex flex-col gap-2.5 text-sm">
                {financial.payables.map((e) => (
                  <li key={e.id} className="flex gap-3">
                    <span className={`w-12 shrink-0 text-xs ${e.dueDate < financial.today ? 'font-bold text-destructive' : 'text-muted-foreground'}`}>
                      {brDate(e.dueDate)}
                    </span>
                    <span className="min-w-0 truncate">{e.who}</span>
                    <strong className="ml-auto whitespace-nowrap">{money.format(e.amount)}</strong>
                  </li>
                ))}
              </ul>
            )}
          </Card>
        )}
      </div>
    </section>
  )
}