import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ChevronLeft, ChevronRight, Phone, Plus } from 'lucide-react'
import { useAuth } from '@/auth/auth-context'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface Movement {
  id: string
  startDate: string
  endDate: string
  machine: { id: string; code: string }
  contract: { id: string; number: number }
  client: { id: string; name: string; tradeName: string | null; contactName: string | null; phone: string | null }
  site: { name: string | null; street: string | null; number: string | null; district: string | null; city: string | null }
}

interface MovementsResponse {
  today: string
  items: Movement[]
  overdue: Movement[]
}

interface MaintenanceEvent {
  id: string
  date: string
  status: 'OPEN' | 'DONE'
  description: string
  blocksMachine: boolean
  machine: { id: string; code: string }
}

type EventKind = 'out' | 'back' | 'maint'

interface DayEvent {
  key: string
  kind: EventKind
  date: string
  title: string
  detail: string
  href: string
  phone: string | null
}

const KIND: Record<EventKind, { label: string; chip: string; dot: string }> = {
  out: { label: 'Sai', chip: 'bg-info/15 text-info', dot: 'bg-info' },
  back: { label: 'Volta', chip: 'bg-success/15 text-success', dot: 'bg-success' },
  maint: { label: 'Manut.', chip: 'bg-warning/15 text-warning', dot: 'bg-warning' },
}

const WEEKDAYS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb']
const MAX_CHIPS = 3
const UPCOMING_DAYS = 7

// Datas sempre como 'YYYY-MM-DD' em UTC para não sofrer com fuso horário
const parse = (iso: string) => new Date(`${iso}T00:00:00Z`)
const addDays = (iso: string, days: number) => {
  const d = parse(iso)
  d.setUTCDate(d.getUTCDate() + days)
  return d.toISOString().slice(0, 10)
}
const weekday = (iso: string) => parse(iso).getUTCDay()
const daysBetween = (from: string, to: string) => Math.round((parse(to).getTime() - parse(from).getTime()) / 86_400_000)
const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

const monthTitle = (month: string) => {
  const text = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric', timeZone: 'UTC' }).format(parse(`${month}-01`))
  return text.charAt(0).toUpperCase() + text.slice(1)
}
const dayTitle = (iso: string) =>
  new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: 'numeric', month: 'long', timeZone: 'UTC' }).format(parse(iso))
const shortDay = (iso: string) => `${WEEKDAYS[weekday(iso)]} ${Number(iso.slice(8))}`

function shiftMonth(month: string, delta: number) {
  const d = parse(`${month}-01`)
  d.setUTCMonth(d.getUTCMonth() + delta)
  return d.toISOString().slice(0, 7)
}

// Semanas completas (domingo a sábado) que cobrem o mês
function gridRange(month: string) {
  const first = `${month}-01`
  const last = addDays(`${shiftMonth(month, 1)}-01`, -1)
  return { from: addDays(first, -weekday(first)), to: addDays(last, 7 - weekday(last)) }
}

const clientName = (m: Movement) => m.client.tradeName ?? m.client.name
const address = (m: Movement) =>
  [m.site.street && [m.site.street, m.site.number].filter(Boolean).join(', '), m.site.district, m.site.city].filter(Boolean).join(' · ')

function formatPhone(digits: string) {
  return digits.length === 11
    ? `(${digits.slice(0, 2)}) ${digits.slice(2, 7)}-${digits.slice(7)}`
    : `(${digits.slice(0, 2)}) ${digits.slice(2, 6)}-${digits.slice(6)}`
}

function toEvents(movements: Movement[], maintenances: MaintenanceEvent[]): DayEvent[] {
  const events: DayEvent[] = []
  for (const m of movements) {
    const base = { href: `/contratos/${m.contract.id}`, phone: m.client.phone }
    const where = address(m) || m.site.name || 'Endereço não informado'
    events.push({ ...base, key: `out-${m.id}`, kind: 'out', date: m.startDate, title: `Entregar ${m.machine.code}`, detail: `${clientName(m)} · ${where}` })
    events.push({ ...base, key: `back-${m.id}`, kind: 'back', date: m.endDate, title: `Recolher ${m.machine.code}`, detail: `${clientName(m)} · ${where}` })
  }
  for (const item of maintenances) {
    events.push({
      key: `maint-${item.id}`,
      kind: 'maint',
      date: item.date,
      title: `Manutenção ${item.machine.code}`,
      detail: item.description,
      href: `/manutencao/${item.id}`,
      phone: null,
    })
  }
  return events
}

function EventCard({ event, showDate }: { event: DayEvent; showDate?: boolean }) {
  return (
    <li className="flex gap-3 text-sm">
      <span aria-hidden="true" className={`mt-1.5 size-2.5 shrink-0 rounded-full ${KIND[event.kind].dot}`} />
      <div className="min-w-0">
        {showDate && <span className="text-xs text-muted-foreground">{shortDay(event.date)} · </span>}
        <Link to={event.href} className="font-semibold underline-offset-4 hover:underline">
          {event.title}
        </Link>
        <p className="line-clamp-2 text-muted-foreground">{event.detail}</p>
        {event.phone && (
          <a href={`tel:${event.phone}`} className="mt-1 inline-flex min-h-8 items-center gap-1.5 text-ring underline-offset-4 hover:underline">
            <Phone aria-hidden="true" className="size-3.5" />
            {formatPhone(event.phone)}
          </a>
        )}
      </div>
    </li>
  )
}

export function AgendaPage() {
  const { user } = useAuth()
  const canSeeMaintenance = user?.permissions.includes('manutencao:ler') ?? false
  const canCreateContract = user?.permissions.includes('contratos:editar') ?? false

  const [today, setToday] = useState(localToday)
  const [month, setMonth] = useState(() => localToday().slice(0, 7))
  const [selected, setSelected] = useState(localToday)
  const [data, setData] = useState<MovementsResponse | null>(null)
  const [maintenances, setMaintenances] = useState<MaintenanceEvent[]>([])
  const [upcoming, setUpcoming] = useState<Movement[]>([])
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  const range = useMemo(() => gridRange(month), [month])

  useEffect(() => {
    document.title = `Agenda · ${brand.name}`
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    const query = `from=${range.from}&to=${range.to}`
    setLoading(true)
    setError(null)
    Promise.all([
      apiFetch<MovementsResponse>(`/agenda?${query}`, { signal: controller.signal }),
      canSeeMaintenance
        ? apiFetch<MaintenanceEvent[]>(`/agenda/maintenances?${query}`, { signal: controller.signal })
        : Promise.resolve([]),
    ])
      .then(([movements, maint]) => {
        if (controller.signal.aborted) return
        setData(movements)
        setMaintenances(maint)
        setToday(movements.today)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a agenda.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [range, canSeeMaintenance])

  // Próximos dias podem cair no mês seguinte, então vêm numa busca à parte
  useEffect(() => {
    const controller = new AbortController()
    apiFetch<MovementsResponse>(`/agenda?from=${addDays(today, 1)}&to=${addDays(today, UPCOMING_DAYS + 1)}`, { signal: controller.signal })
      .then((r) => !controller.signal.aborted && setUpcoming(r.items))
      .catch(() => !controller.signal.aborted && setUpcoming([]))
    return () => controller.abort()
  }, [today])

  const byDay = useMemo(() => {
    const map = new Map<string, DayEvent[]>()
    for (const event of toEvents(data?.items ?? [], maintenances)) {
      if (event.date < range.from || event.date >= range.to) continue
      map.set(event.date, [...(map.get(event.date) ?? []), event])
    }
    return map
  }, [data, maintenances, range])

  const upcomingEvents = useMemo(
    () =>
      toEvents(upcoming, [])
        .filter((e) => e.date > today && e.date <= addDays(today, UPCOMING_DAYS))
        .sort((a, b) => a.date.localeCompare(b.date)),
    [upcoming, today],
  )

  const openMaintenances = maintenances.filter((m) => m.status === 'OPEN' && m.blocksMachine)
  const days = Array.from({ length: daysBetween(range.from, range.to) }, (_, i) => addDays(range.from, i))
  const selectedEvents = byDay.get(selected) ?? []

  const goTo = (target: string) => {
    setMonth(target.slice(0, 7))
    setSelected(target)
  }

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold" aria-live="polite">
            {monthTitle(month)}
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">Saídas e devoluções de máquinas</p>
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
            onClick={() => goTo(today)}
            className="min-h-11 rounded-lg border border-input bg-card px-4 text-sm font-semibold hover:bg-accent"
          >
            Hoje
          </button>
          <button
            type="button"
            aria-label="Próximo mês"
            onClick={() => setMonth(shiftMonth(month, 1))}
            className="grid size-11 place-items-center rounded-lg border border-input bg-card hover:bg-accent"
          >
            <ChevronRight aria-hidden="true" className="size-5" />
          </button>
          {canCreateContract && (
            <Link
              to="/contratos/novo"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="size-4" />
              Reservar máquina
            </Link>
          )}
        </div>
      </div>

      <div className="flex flex-wrap gap-4 text-sm text-muted-foreground">
        {(Object.keys(KIND) as EventKind[])
          .filter((k) => k !== 'maint' || canSeeMaintenance)
          .map((k) => (
            <span key={k} className="flex items-center gap-1.5">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${KIND[k].dot}`} />
              {k === 'out' ? 'Sai (entrega)' : k === 'back' ? 'Volta (recolher)' : 'Manutenção'}
            </span>
          ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <div
          aria-busy={loading}
          className={`min-w-0 flex-[3_1_40rem] overflow-hidden rounded-xl border border-border bg-card transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          <div className="grid grid-cols-7 border-b border-border text-xs font-semibold text-muted-foreground">
            {WEEKDAYS.map((d) => (
              <div key={d} className="px-2 py-2.5 sm:px-3">
                {d}
              </div>
            ))}
          </div>
          <div className="grid grid-cols-7">
            {days.map((day) => {
              const events = byDay.get(day) ?? []
              const outside = day.slice(0, 7) !== month
              const isToday = day === today
              const isSelected = day === selected
              return (
                <div
                  key={day}
                  className={`flex min-h-28 min-w-0 flex-col gap-1 border-r border-b border-border p-1.5 text-xs [&:nth-child(7n)]:border-r-0 ${
                    outside ? 'bg-muted/40 text-muted-foreground' : ''
                  } ${isToday ? 'bg-primary/10' : ''} ${isSelected ? 'ring-2 ring-ring ring-inset' : ''}`}
                >
                  <button
                    type="button"
                    onClick={() => setSelected(day)}
                    aria-pressed={isSelected}
                    aria-label={`${dayTitle(day)}${events.length ? `, ${events.length} ${events.length === 1 ? 'movimento' : 'movimentos'}` : ''}`}
                    className={`min-h-7 w-fit rounded-md px-1.5 text-left font-semibold hover:bg-accent ${isToday ? 'text-ring' : ''}`}
                  >
                    {Number(day.slice(8))}
                    {isToday && <span className="ml-1 font-normal">· Hoje</span>}
                  </button>
                  {events.slice(0, MAX_CHIPS).map((event) => (
                    <Link
                      key={event.key}
                      to={event.href}
                      title={`${event.title} · ${event.detail}`}
                      className={`truncate rounded-md px-1.5 py-1 font-medium hover:brightness-95 ${KIND[event.kind].chip}`}
                    >
                      {KIND[event.kind].label} {event.title.split(' ').pop()}
                    </Link>
                  ))}
                  {events.length > MAX_CHIPS && (
                    <button
                      type="button"
                      onClick={() => setSelected(day)}
                      className="w-fit rounded-md px-1.5 py-0.5 text-muted-foreground hover:bg-accent"
                    >
                      +{events.length - MAX_CHIPS} mais
                    </button>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        <aside className="flex min-w-0 flex-[1_1_18rem] flex-col gap-4">
          {(data?.overdue.length ?? 0) > 0 && (
            <section role="alert" className="rounded-xl border border-destructive/40 bg-destructive/10 p-4">
              <h2 className="text-base font-bold text-destructive">Devoluções atrasadas</h2>
              <ul className="mt-3 flex flex-col gap-3">
                {data?.overdue.map((m) => (
                  <li key={m.id} className="text-sm">
                    <Link to={`/contratos/${m.contract.id}`} className="font-semibold text-destructive underline-offset-4 hover:underline">
                      {m.machine.code} não voltou
                    </Link>
                    <p className="text-destructive">
                      {clientName(m)} · {daysBetween(m.endDate, today)} {daysBetween(m.endDate, today) === 1 ? 'dia' : 'dias'} de atraso
                    </p>
                    {m.client.phone && (
                      <a href={`tel:${m.client.phone}`} className="mt-1 inline-flex min-h-8 items-center gap-1.5 font-semibold text-destructive underline-offset-4 hover:underline">
                        <Phone aria-hidden="true" className="size-3.5" />
                        Ligar {formatPhone(m.client.phone)}
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-bold first-letter:uppercase">
              {selected === today ? `Hoje · ${dayTitle(selected)}` : dayTitle(selected)}
            </h2>
            {selectedEvents.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nenhuma saída ou devolução neste dia.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {selectedEvents.map((event) => (
                  <EventCard key={event.key} event={event} />
                ))}
              </ul>
            )}
          </section>

          {canSeeMaintenance && openMaintenances.length > 0 && (
            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="text-base font-bold">Paradas em manutenção</h2>
              <ul className="mt-3 flex flex-col gap-2 text-sm">
                {openMaintenances.map((m) => (
                  <li key={m.id}>
                    <Link to={`/manutencao/${m.id}`} className="font-semibold underline-offset-4 hover:underline">
                      {m.machine.code}
                    </Link>
                    <span className="text-muted-foreground"> · {m.description}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section className="rounded-xl border border-border bg-card p-4">
            <h2 className="text-base font-bold">Próximos {UPCOMING_DAYS} dias</h2>
            {upcomingEvents.length === 0 ? (
              <p className="mt-2 text-sm text-muted-foreground">Nada programado.</p>
            ) : (
              <ul className="mt-3 flex flex-col gap-3">
                {upcomingEvents.map((event) => (
                  <EventCard key={event.key} event={event} showDate />
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>
    </section>
  )
}