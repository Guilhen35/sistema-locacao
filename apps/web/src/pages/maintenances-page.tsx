import { useEffect, useState } from 'react'
import { Link } from 'react-router'
import { Plus, Wrench } from 'lucide-react'
import {
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_STATUSES,
  MAINTENANCE_STATUS_LABELS,
  type MaintenanceKind,
  type MaintenanceStatus,
} from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface MaintenanceRow {
  id: string
  kind: MaintenanceKind
  status: MaintenanceStatus
  date: string
  description: string
  totalAmount: string
  paid: boolean
  dueDate: string | null
  machine: { id: string; code: string }
  _count: { items: number }
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (iso: string) => iso.slice(0, 10).split('-').reverse().join('/')

const KIND_STYLES: Record<MaintenanceKind, string> = {
  PREVENTIVE: 'bg-success/15 text-success',
  CORRECTIVE: 'bg-warning/15 text-warning',
}

export function MaintenancesPage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('manutencao:editar') ?? false
  const [status, setStatus] = useState<MaintenanceStatus | null>(null)
  const [rows, setRows] = useState<MaintenanceRow[] | null>(null)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    document.title = `Manutenção · ${brand.name}`
  }, [])

  useEffect(() => {
    const controller = new AbortController()
    setError(null)
    apiFetch<{ items: MaintenanceRow[] }>(`/maintenances${status ? `?status=${status}` : ''}`, { signal: controller.signal })
      .then((r) => !controller.signal.aborted && setRows(r.items))
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err instanceof ApiError ? err.message : 'Não foi possível carregar as manutenções.')
      })
    return () => controller.abort()
  }, [status])

  const total = (rows ?? []).reduce((sum, r) => sum + Number(r.totalAmount), 0)
  const toPay = (rows ?? []).filter((r) => !r.paid).reduce((sum, r) => sum + Number(r.totalAmount), 0)

  return (
    <section className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h1 className="text-2xl font-bold">Manutenções da frota</h1>
          <p className="mt-1 text-sm text-muted-foreground">Peças, serviços e custos de cada máquina.</p>
        </div>
        {canEdit && (
          <Link
            to="/manutencao/nova"
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground focus-visible:outline-2 focus-visible:outline-ring"
          >
            <Plus aria-hidden="true" className="size-4" />
            Registrar manutenção
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 overflow-hidden rounded-xl border border-border bg-card sm:grid-cols-3">
        <div className="border-r border-border px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Gasto na lista</p>
          <p className="text-xl font-bold">{money.format(total)}</p>
        </div>
        <div className="border-r border-border px-4 py-3.5">
          <p className="text-xs text-muted-foreground">A pagar</p>
          <p className="text-xl font-bold text-warning">{money.format(toPay)}</p>
        </div>
        <div className="px-4 py-3.5">
          <p className="text-xs text-muted-foreground">Em andamento</p>
          <p className="text-xl font-bold">{(rows ?? []).filter((r) => r.status === 'OPEN').length}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-2" role="group" aria-label="Filtrar por status">
        {[null, ...MAINTENANCE_STATUSES].map((option) => (
          <button
            key={option ?? 'all'}
            type="button"
            aria-pressed={status === option}
            onClick={() => setStatus(option)}
            className={`min-h-10 rounded-full border px-4 text-sm ${
              status === option ? 'border-foreground bg-foreground text-background' : 'border-input bg-card'
            }`}
          >
            {option ? MAINTENANCE_STATUS_LABELS[option] : 'Todas'}
          </button>
        ))}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {rows && rows.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-dashed border-border bg-card px-6 py-14 text-center text-sm text-muted-foreground">
          <Wrench aria-hidden="true" className="size-8" />
          Nenhuma manutenção registrada.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-border bg-card">
          <table className="w-full min-w-200 text-sm">
            <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
              <tr>
                <th scope="col" className="px-4 py-3">Data</th>
                <th scope="col" className="px-4 py-3">Máquina</th>
                <th scope="col" className="px-4 py-3">Serviço</th>
                <th scope="col" className="px-4 py-3">Tipo</th>
                <th scope="col" className="px-4 py-3">Pagamento</th>
                <th scope="col" className="px-4 py-3 text-right">Valor</th>
              </tr>
            </thead>
            <tbody>
              {rows?.map((row) => (
                <tr key={row.id} className="border-t border-border hover:bg-accent/50">
                  <td className="px-4 py-3">{brDate(row.date)}</td>
                  <td className="px-4 py-3 font-semibold">{row.machine.code}</td>
                  <td className="max-w-80 px-4 py-3">
                    <Link to={`/manutencao/${row.id}`} className="line-clamp-1 underline-offset-4 hover:underline">
                      {row.description}
                    </Link>
                    <span className="text-xs text-muted-foreground">
                      {row._count.items} {row._count.items === 1 ? 'item' : 'itens'} · {MAINTENANCE_STATUS_LABELS[row.status]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`rounded-full px-2.5 py-1 text-xs font-semibold ${KIND_STYLES[row.kind]}`}>
                      {MAINTENANCE_KIND_LABELS[row.kind]}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {row.paid ? 'Pago' : row.dueDate ? `Vence ${brDate(row.dueDate)}` : 'A pagar'}
                  </td>
                  <td className="px-4 py-3 text-right font-semibold">{money.format(Number(row.totalAmount))}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}