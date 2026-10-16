import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Link } from 'react-router'
import { Archive, LoaderCircle, Pencil } from 'lucide-react'
import {
  CATEGORY_LABELS,
  MACHINE_CATEGORIES,
  POWER_LABELS,
  POWER_SOURCES,
  machineTypeSchema,
  type MachineCategory,
  type PowerSource,
} from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface MachineType {
  id: string
  name: string
  category: MachineCategory
  powerSource: PowerSource
  workingHeightM: string
  capacityKg: number
  usage: string | null
  dailyPrice: string
  weeklyPrice: string | null
  monthlyPrice: string | null
  _count: { machines: number }
}

const FIELDS = [
  'name', 'category', 'powerSource', 'workingHeightM', 'capacityKg', 'usage', 'dailyPrice', 'weeklyPrice', 'monthlyPrice',
] as const
type Field = (typeof FIELDS)[number]
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const EMPTY: Values = {
  name: '',
  category: 'SCISSOR',
  powerSource: 'ELECTRIC',
  workingHeightM: '',
  capacityKg: '',
  usage: '',
  dailyPrice: '',
  weeklyPrice: '',
  monthlyPrice: '',
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function toInput(value: string | number | null): string {
  if (value === null || value === '') return ''
  return Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
}

function fromType(type: MachineType): Values {
  return {
    name: type.name,
    category: type.category,
    powerSource: type.powerSource,
    workingHeightM: toInput(type.workingHeightM),
    capacityKg: String(type.capacityKg),
    usage: type.usage ?? '',
    dailyPrice: toInput(type.dailyPrice),
    weeklyPrice: toInput(type.weeklyPrice),
    monthlyPrice: toInput(type.monthlyPrice),
  }
}

function isField(value: unknown): value is Field {
  return typeof value === 'string' && (FIELDS as readonly string[]).includes(value)
}

function Field(props: {
  field: Field
  label: string
  values: Values
  errors: Errors
  onChange: (field: Field, value: string) => void
  inputMode?: 'decimal' | 'numeric' | 'text'
  maxLength?: number
  required?: boolean
}) {
  const { field, label, values, errors, onChange, required, ...input } = props
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={`type-${field}`} className="text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
      </label>
      <Input
        id={`type-${field}`}
        value={values[field]}
        onChange={(e) => onChange(field, e.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={errors[field] ? `type-${field}-error` : undefined}
        className="h-11 text-base"
        {...input}
      />
      {errors[field] && (
        <p id={`type-${field}-error`} className="text-sm text-destructive">
          {errors[field]}
        </p>
      )}
    </div>
  )
}

export function MachineTypesPage() {
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('maquinas:editar') ?? false
  const [types, setTypes] = useState<MachineType[]>([])
  const [editingId, setEditingId] = useState<string | null>(null)
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [saving, setSaving] = useState(false)

  const load = useCallback(() => {
    apiFetch<MachineType[]>('/machine-types')
      .then(setTypes)
      .catch((err: unknown) =>
        setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível carregar os tipos.' }),
      )
  }, [])

  useEffect(() => {
    document.title = `Tipos e preços · ${brand.name}`
    load()
  }, [load])

  function handleChange(field: Field, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function startEdit(type: MachineType) {
    setEditingId(type.id)
    setValues(fromType(type))
    setErrors({})
    setMessage(null)
  }

  function resetForm() {
    setEditingId(null)
    setValues(EMPTY)
    setErrors({})
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving) return

    const result = machineTypeSchema.safeParse(values)
    if (!result.success) {
      const next: Errors = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (isField(key) && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      await apiFetch(editingId ? `/machine-types/${encodeURIComponent(editingId)}` : '/machine-types', {
        method: editingId ? 'PATCH' : 'POST',
        body: JSON.stringify(result.data),
      })
      setMessage({ kind: 'success', text: editingId ? 'Tipo atualizado.' : 'Tipo criado.' })
      resetForm()
      load()
    } catch (err) {
      if (err instanceof ApiError) {
        const next: Errors = {}
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          if (isField(key) && messages[0]) next[key] = messages[0]
        }
        setErrors(next)
        if (Object.keys(next).length === 0) setMessage({ kind: 'error', text: err.message })
      } else {
        setMessage({ kind: 'error', text: 'Não foi possível salvar.' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleArchive(type: MachineType) {
    if (!window.confirm(`Arquivar o tipo "${type.name}"?`)) return
    try {
      await apiFetch(`/machine-types/${encodeURIComponent(type.id)}`, { method: 'DELETE' })
      if (editingId === type.id) resetForm()
      load()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível arquivar.' })
    }
  }

  const fieldProps = { values, errors, onChange: handleChange }

  return (
    <section className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link to="/maquinas" className="underline-offset-4 hover:underline">
            Frota
          </Link>{' '}
          › Tipos e preços
        </p>
        <h1 className="mt-1 text-2xl font-bold">Tipos e preços</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          As características e os preços ficam no tipo. Mudou aqui, vale para todas as máquinas dele.
        </p>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'error'
              ? 'border-destructive/40 bg-destructive/10 text-destructive'
              : 'border-success/40 bg-success/10 text-success'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <ul className="flex min-w-0 grow basis-120 flex-col gap-3">
          {types.length === 0 && (
            <li className="rounded-xl border border-dashed border-border bg-card px-6 py-10 text-center text-sm text-muted-foreground">
              Nenhum tipo cadastrado ainda.
            </li>
          )}
          {types.map((type) => (
            <li key={type.id} className="flex flex-wrap items-center gap-4 rounded-xl border border-border bg-card p-4">
              <div className="min-w-0 grow">
                <h2 className="font-semibold">{type.name}</h2>
                <p className="text-sm text-muted-foreground">
                  {CATEGORY_LABELS[type.category]} · {POWER_LABELS[type.powerSource]} · {toInput(type.workingHeightM)} m ·{' '}
                  {type.capacityKg} kg · {type._count.machines} {type._count.machines === 1 ? 'máquina' : 'máquinas'}
                </p>
                <p className="mt-1 text-sm">
                  Diária <strong>{money.format(Number(type.dailyPrice))}</strong>
                  {type.weeklyPrice && <> · Semana <strong>{money.format(Number(type.weeklyPrice))}</strong></>}
                  {type.monthlyPrice && <> · Mês <strong>{money.format(Number(type.monthlyPrice))}</strong></>}
                </p>
              </div>
              {canEdit && (
                <div className="flex gap-2">
                  <Button type="button" variant="outline" className="h-11" onClick={() => startEdit(type)}>
                    <Pencil aria-hidden="true" className="size-4" />
                    Editar
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-11"
                    aria-label={`Arquivar ${type.name}`}
                    onClick={() => void handleArchive(type)}
                  >
                    <Archive aria-hidden="true" className="size-4" />
                  </Button>
                </div>
              )}
            </li>
          ))}
        </ul>

        {canEdit && (
          <form
            noValidate
            onSubmit={handleSubmit}
            aria-busy={saving}
            className="sticky top-24 flex grow basis-80 flex-col gap-4 rounded-xl border border-border bg-card p-5 lg:max-w-md"
          >
            <h2 className="font-semibold">{editingId ? 'Editar tipo' : 'Novo tipo'}</h2>
            <Field field="name" label="Nome" required maxLength={100} {...fieldProps} />
            <div className="grid grid-cols-2 gap-3">
              <div className="flex flex-col gap-1.5">
                <label htmlFor="type-category" className="text-sm font-semibold">
                  Categoria
                </label>
                <select
                  id="type-category"
                  value={values.category}
                  onChange={(e) => handleChange('category', e.target.value)}
                  className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
                >
                  {MACHINE_CATEGORIES.map((c) => (
                    <option key={c} value={c}>
                      {CATEGORY_LABELS[c]}
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor="type-powerSource" className="text-sm font-semibold">
                  Energia
                </label>
                <select
                  id="type-powerSource"
                  value={values.powerSource}
                  onChange={(e) => handleChange('powerSource', e.target.value)}
                  className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
                >
                  {POWER_SOURCES.map((p) => (
                    <option key={p} value={p}>
                      {POWER_LABELS[p]}
                    </option>
                  ))}
                </select>
              </div>
              <Field field="workingHeightM" label="Altura de trabalho (m)" required inputMode="decimal" {...fieldProps} />
              <Field field="capacityKg" label="Capacidade (kg)" required inputMode="numeric" {...fieldProps} />
            </div>
            <Field field="usage" label="Uso indicado" maxLength={200} {...fieldProps} />
            <div className="grid grid-cols-3 gap-3">
              <Field field="dailyPrice" label="Diária (R$)" required inputMode="decimal" {...fieldProps} />
              <Field field="weeklyPrice" label="Semanal (R$)" inputMode="decimal" {...fieldProps} />
              <Field field="monthlyPrice" label="Mensal (R$)" inputMode="decimal" {...fieldProps} />
            </div>
            <Button type="submit" size="lg" disabled={saving} className="h-12 text-base font-bold">
              {saving && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
              {editingId ? 'Salvar alterações' : 'Criar tipo'}
            </Button>
            {editingId && (
              <button type="button" onClick={resetForm} className="min-h-11 text-sm text-muted-foreground hover:underline">
                Cancelar edição
              </button>
            )}
          </form>
        )}
      </div>
    </section>
  )
}