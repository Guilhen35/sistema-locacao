import { useEffect, useMemo, useState } from 'react'
import { Link } from 'react-router'
import { ImageOff, Plus, Search, Tags } from 'lucide-react'
import { CATEGORY_LABELS, POWER_LABELS, type MachineCategory, type PowerSource } from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface TypeSummary {
  id: string
  name: string
  category: MachineCategory
  powerSource: PowerSource
  workingHeightM: string
}

interface MachineItem {
  id: string
  code: string
  manufacturer: string | null
  model: string | null
  year: number | null
  blocked: boolean
  blockedReason: string | null
  showOnWebsite: boolean
  coverPhotoId: string | null
  type: TypeSummary
}

interface MachineList {
  total: number
  items: MachineItem[]
}

interface MachineTypeItem extends TypeSummary {
  _count: { machines: number }
}

const SEARCH_DELAY_MS = 300

export function typeLabel(type: TypeSummary): string {
  const height = Number(type.workingHeightM).toLocaleString('pt-BR')
  return `${CATEGORY_LABELS[type.category]} ${height} m · ${POWER_LABELS[type.powerSource]}`
}

function MachineCard({ machine }: { machine: MachineItem }) {
  const details = [machine.manufacturer, machine.model, machine.year].filter(Boolean).join(' · ')

  return (
    <Link
      to={`/maquinas/${machine.id}`}
      className="group flex flex-col overflow-hidden rounded-xl border border-border bg-card text-card-foreground transition-shadow hover:shadow-md focus-visible:outline-2 focus-visible:outline-ring"
    >
      <div className="relative grid h-40 place-items-center bg-muted">
        {machine.coverPhotoId ? (
          <img
            src={`/api/machine-photos/${machine.coverPhotoId}`}
            alt={`Foto da máquina ${machine.code}`}
            loading="lazy"
            className="size-full object-cover"
          />
        ) : (
          <ImageOff aria-hidden="true" className="size-8 text-muted-foreground" />
        )}
        <span
          className={`absolute top-2.5 left-2.5 rounded-full px-2.5 py-1 text-xs font-semibold text-white ${
            machine.blocked ? 'bg-warning' : 'bg-success'
          }`}
        >
          {machine.blocked ? 'Bloqueada' : 'Disponível'}
        </span>
      </div>
      <div className="flex flex-col gap-1.5 p-4">
        <div className="flex flex-wrap items-baseline gap-2">
          <h2 className="text-lg font-bold">{machine.code}</h2>
          <span className="text-sm text-muted-foreground">{typeLabel(machine.type)}</span>
        </div>
        <p className="text-sm">{details || 'Sem fabricante informado'}</p>
        {machine.blocked && machine.blockedReason && (
          <p className="text-sm text-muted-foreground">Motivo: {machine.blockedReason}</p>
        )}
        {machine.showOnWebsite && (
          <span className="mt-1 w-fit rounded-full bg-primary/15 px-2.5 py-0.5 text-xs font-semibold text-ring">
            Aparece no site
          </span>
        )}
      </div>
    </Link>
  )
}

export function MachinesPage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('maquinas:editar') ?? false
  const [types, setTypes] = useState<MachineTypeItem[]>([])
  const [typeId, setTypeId] = useState<string | null>(null)
  const [search, setSearch] = useState('')
  const [query, setQuery] = useState('')
  const [data, setData] = useState<MachineList | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    document.title = `Frota · ${brand.name}`
    apiFetch<MachineTypeItem[]>('/machine-types')
      .then(setTypes)
      .catch(() => setTypes([]))
  }, [])

  useEffect(() => {
    const timer = setTimeout(() => setQuery(search.trim()), SEARCH_DELAY_MS)
    return () => clearTimeout(timer)
  }, [search])

  useEffect(() => {
    const controller = new AbortController()
    const params = new URLSearchParams()
    if (query) params.set('q', query)
    if (typeId) params.set('typeId', typeId)

    setLoading(true)
    setError(null)
    apiFetch<MachineList>(`/machines?${params.toString()}`, { signal: controller.signal })
      .then((response) => {
        if (!controller.signal.aborted) setData(response)
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar a frota.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [query, typeId])

  const counts = useMemo(() => {
    const items = data?.items ?? []
    return { available: items.filter((m) => !m.blocked).length, blocked: items.filter((m) => m.blocked).length }
  }, [data])

  const totalMachines = types.reduce((sum, t) => sum + t._count.machines, 0)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Frota</h1>
          <p className="mt-1 text-sm text-muted-foreground" aria-live="polite">
            {totalMachines} {totalMachines === 1 ? 'máquina' : 'máquinas'}
          </p>
        </div>
        {canEdit && (
          <div className="ml-auto flex flex-wrap gap-2">
            <Link
              to="/maquinas/tipos"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-input bg-card px-4 text-sm font-semibold hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Tags aria-hidden="true" className="size-4" />
              Tipos e preços
            </Link>
            <Link
              to="/maquinas/nova"
              className="inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
            >
              <Plus aria-hidden="true" className="size-4" />
              Nova máquina
            </Link>
          </div>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Disponíveis', value: counts.available, dot: 'bg-success' },
          { label: 'Bloqueadas', value: counts.blocked, dot: 'bg-warning' },
        ].map((card) => (
          <div key={card.label} className="rounded-xl border border-border bg-card px-4 py-3.5">
            <span className="flex items-center gap-2 text-sm text-muted-foreground">
              <span aria-hidden="true" className={`size-2.5 rounded-full ${card.dot}`} />
              {card.label}
            </span>
            <span className="mt-1 block text-2xl font-bold">{card.value}</span>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Filtrar por tipo de máquina">
        <button
          type="button"
          aria-pressed={typeId === null}
          onClick={() => setTypeId(null)}
          className={`min-h-10 rounded-full border px-4 text-sm ${
            typeId === null ? 'border-foreground bg-foreground text-background' : 'border-input bg-card'
          }`}
        >
          Todas <span className="opacity-70">{totalMachines}</span>
        </button>
        {types.map((type) => (
          <button
            key={type.id}
            type="button"
            aria-pressed={typeId === type.id}
            onClick={() => setTypeId(type.id)}
            className={`min-h-10 rounded-full border px-4 text-sm ${
              typeId === type.id ? 'border-foreground bg-foreground text-background' : 'border-input bg-card'
            }`}
          >
            {type.name} <span className="opacity-70">{type._count.machines}</span>
          </button>
        ))}
      </div>

      <div className="relative w-full max-w-md">
        <label htmlFor="machine-search" className="sr-only">
          Buscar máquina
        </label>
        <Search
          aria-hidden="true"
          className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted-foreground"
        />
        <Input
          id="machine-search"
          type="search"
          autoComplete="off"
          maxLength={100}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por código, fabricante ou modelo"
          className="h-11 bg-card pl-9 text-base"
        />
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {loading && !data ? (
        <div className="grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} aria-hidden="true" className="h-64 animate-pulse rounded-xl border border-border bg-card" />
          ))}
        </div>
      ) : data && data.items.length === 0 ? (
        <div className="rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
          {query || typeId ? 'Nenhuma máquina encontrada com esse filtro.' : 'Nenhuma máquina cadastrada ainda.'}
        </div>
      ) : (
        <div
          aria-busy={loading}
          className={`grid grid-cols-[repeat(auto-fill,minmax(16rem,1fr))] gap-4 transition-opacity ${loading ? 'opacity-60' : ''}`}
        >
          {data?.items.map((machine) => (
            <MachineCard key={machine.id} machine={machine} />
          ))}
        </div>
      )}
    </section>
  )
}