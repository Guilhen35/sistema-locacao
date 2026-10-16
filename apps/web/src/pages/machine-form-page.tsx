import { useCallback, useEffect, useRef, useState, type ChangeEvent, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, ArrowLeft, ArrowRight, ImagePlus, LoaderCircle, Trash2 } from 'lucide-react'
import { CATEGORY_LABELS, POWER_LABELS, machineSchema, type MachineCategory, type PowerSource } from '@locacao/shared'
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
}

interface Photo {
  id: string
  position: number
}

interface MachineDetail {
  id: string
  code: string
  typeId: string
  manufacturer: string | null
  model: string | null
  year: number | null
  serialNumber: string | null
  assetTag: string | null
  hourMeter: number | null
  blocked: boolean
  blockedReason: string | null
  showOnWebsite: boolean
  photos: Photo[]
}

const TEXT_FIELDS = ['code', 'typeId', 'manufacturer', 'model', 'year', 'serialNumber', 'assetTag', 'hourMeter', 'blockedReason'] as const
type TextField = (typeof TEXT_FIELDS)[number]
type Values = Record<TextField, string>
type Errors = Partial<Record<TextField, string>>

const EMPTY: Values = Object.fromEntries(TEXT_FIELDS.map((f) => [f, ''])) as Values
const MAX_PHOTO_BYTES = 5 * 1024 * 1024
const PHOTO_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })

function isField(value: unknown): value is TextField {
  return typeof value === 'string' && (TEXT_FIELDS as readonly string[]).includes(value)
}

function Section({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <div className="flex items-center gap-3">
        <h2 className="text-base font-semibold">{title}</h2>
        {action && <div className="ml-auto">{action}</div>}
      </div>
      {children}
    </section>
  )
}

function TextInput(props: {
  field: TextField
  label: string
  values: Values
  errors: Errors
  onChange: (field: TextField, value: string) => void
  required?: boolean
  inputMode?: 'numeric' | 'text'
  maxLength?: number
  hint?: string
}) {
  const { field, label, values, errors, onChange, required, hint, ...input } = props
  const describedBy = errors[field] ? `${field}-error` : hint ? `${field}-hint` : undefined
  return (
    <div className="flex flex-col gap-1.5">
      <label htmlFor={field} className="text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
      </label>
      <Input
        id={field}
        value={values[field]}
        onChange={(e) => onChange(field, e.target.value)}
        aria-invalid={errors[field] ? true : undefined}
        aria-describedby={describedBy}
        className="h-11 text-base"
        {...input}
      />
      {errors[field] ? (
        <p id={`${field}-error`} className="text-sm text-destructive">
          {errors[field]}
        </p>
      ) : (
        hint && (
          <p id={`${field}-hint`} className="text-sm text-muted-foreground">
            {hint}
          </p>
        )
      )}
    </div>
  )
}

export function MachineFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('maquinas:editar') ?? false
  const fileInput = useRef<HTMLInputElement>(null)

  const [types, setTypes] = useState<MachineType[]>([])
  const [values, setValues] = useState<Values>(EMPTY)
  const [blocked, setBlocked] = useState(false)
  const [showOnWebsite, setShowOnWebsite] = useState(false)
  const [photos, setPhotos] = useState<Photo[]>([])
  const [errors, setErrors] = useState<Errors>({})
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [uploading, setUploading] = useState(false)

  const loadMachine = useCallback(async (machineId: string) => {
    const machine = await apiFetch<MachineDetail>(`/machines/${encodeURIComponent(machineId)}`)
    setValues({
      code: machine.code,
      typeId: machine.typeId,
      manufacturer: machine.manufacturer ?? '',
      model: machine.model ?? '',
      year: machine.year?.toString() ?? '',
      serialNumber: machine.serialNumber ?? '',
      assetTag: machine.assetTag ?? '',
      hourMeter: machine.hourMeter?.toString() ?? '',
      blockedReason: machine.blockedReason ?? '',
    })
    setBlocked(machine.blocked)
    setShowOnWebsite(machine.showOnWebsite)
    setPhotos(machine.photos)
  }, [])

  useEffect(() => {
    document.title = `${isEdit ? 'Máquina' : 'Nova máquina'} · ${brand.name}`
    let active = true
    const tasks: Promise<unknown>[] = [apiFetch<MachineType[]>('/machine-types').then((t) => active && setTypes(t))]
    if (id) tasks.push(loadMachine(id))
    else if (canEdit) {
      tasks.push(
        apiFetch<{ code: string }>('/machines/next-code').then((r) => active && setValues((v) => ({ ...v, code: r.code }))),
      )
    }
    Promise.all(tasks)
      .catch((err: unknown) => {
        if (active) setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível carregar.' })
      })
      .finally(() => {
        if (active) setLoading(false)
      })
    return () => {
      active = false
    }
  }, [id, isEdit, canEdit, loadMachine])

  const selectedType = types.find((t) => t.id === values.typeId)

  function handleChange(field: TextField, value: string) {
    setValues((v) => ({ ...v, [field]: value }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !canEdit) return

    const result = machineSchema.safeParse({ ...values, blocked, showOnWebsite })
    if (!result.success) {
      const next: Errors = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (isField(key) && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      setMessage({ kind: 'error', text: 'Confira os campos destacados.' })
      return
    }

    setSaving(true)
    setMessage(null)
    try {
      if (isEdit && id) {
        await apiFetch(`/machines/${encodeURIComponent(id)}`, { method: 'PATCH', body: JSON.stringify(result.data) })
        setMessage({ kind: 'success', text: 'Máquina salva.' })
      } else {
        const created = await apiFetch<{ id: string }>('/machines', { method: 'POST', body: JSON.stringify(result.data) })
        // Vai para a ficha da máquina nova, onde as fotos podem ser enviadas
        navigate(`/maquinas/${created.id}`, { replace: true })
      }
    } catch (err) {
      if (err instanceof ApiError) {
        const next: Errors = {}
        for (const [key, msgs] of Object.entries(err.fieldErrors)) {
          if (isField(key) && msgs[0]) next[key] = msgs[0]
        }
        setErrors(next)
        setMessage({ kind: 'error', text: Object.keys(next).length ? 'Confira os campos destacados.' : err.message })
      } else {
        setMessage({ kind: 'error', text: 'Não foi possível salvar.' })
      }
    } finally {
      setSaving(false)
    }
  }

  async function handleFiles(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? [])
    event.target.value = ''
    if (!id || files.length === 0) return

    setUploading(true)
    setMessage(null)
    const problems: string[] = []
    for (const file of files) {
      // Conferência rápida na tela; a API confere de novo com o conteúdo real
      if (!PHOTO_TYPES.includes(file.type) || file.size > MAX_PHOTO_BYTES) {
        problems.push(`${file.name}: use JPG, PNG ou WebP de até 5 MB`)
        continue
      }
      const body = new FormData()
      body.append('file', file)
      try {
        await apiFetch(`/machines/${encodeURIComponent(id)}/photos`, { method: 'POST', body })
      } catch (err) {
        problems.push(`${file.name}: ${err instanceof ApiError ? err.message : 'falha no envio'}`)
      }
    }
    await loadMachine(id).catch(() => undefined)
    setUploading(false)
    if (problems.length) setMessage({ kind: 'error', text: problems.join(' · ') })
  }

  async function movePhoto(index: number, direction: -1 | 1) {
    if (!id) return
    const next = [...photos]
    const target = index + direction
    const current = next[index]
    const other = next[target]
    if (!current || !other) return
    next[index] = other
    next[target] = current
    setPhotos(next)
    try {
      await apiFetch(`/machines/${encodeURIComponent(id)}/photos/order`, {
        method: 'PUT',
        body: JSON.stringify({ ids: next.map((p) => p.id) }),
      })
    } catch {
      setMessage({ kind: 'error', text: 'Não foi possível reordenar as fotos.' })
      await loadMachine(id).catch(() => undefined)
    }
  }

  async function removePhoto(photoId: string) {
    if (!id || !window.confirm('Remover esta foto?')) return
    try {
      await apiFetch(`/machines/${encodeURIComponent(id)}/photos/${encodeURIComponent(photoId)}`, { method: 'DELETE' })
      await loadMachine(id)
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível remover a foto.' })
    }
  }

  async function handleArchive() {
    if (!id || !window.confirm('Arquivar esta máquina? Ela sai da frota, mas o histórico é mantido.')) return
    try {
      await apiFetch(`/machines/${encodeURIComponent(id)}`, { method: 'DELETE' })
      navigate('/maquinas', { replace: true })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível arquivar.' })
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Carregando…
      </div>
    )
  }

  const fieldProps = { values, errors, onChange: handleChange }

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={saving} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/maquinas" className="underline-offset-4 hover:underline">
              Frota
            </Link>{' '}
            › {isEdit ? values.code : 'Nova máquina'}
          </p>
          <h1 className="mt-1 text-2xl font-bold">{isEdit ? `Máquina ${values.code}` : 'Nova máquina'}</h1>
        </div>
        {canEdit && (
          <div className="ml-auto flex gap-2">
            <Link
              to="/maquinas"
              className="inline-flex min-h-11 items-center rounded-lg border border-input bg-card px-4 text-sm font-semibold hover:bg-accent"
            >
              Cancelar
            </Link>
            <Button type="submit" size="lg" disabled={saving} className="h-11 font-bold">
              {saving && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
              Salvar máquina
            </Button>
          </div>
        )}
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
        <div className="flex min-w-0 grow basis-140 flex-col gap-5">
          <Section
            title="Fotos"
            action={
              isEdit &&
              canEdit && (
                <Button type="button" variant="outline" className="h-11" disabled={uploading || photos.length >= 10} onClick={() => fileInput.current?.click()}>
                  {uploading ? <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> : <ImagePlus aria-hidden="true" className="size-4" />}
                  {uploading ? 'Enviando…' : 'Adicionar fotos'}
                </Button>
              )
            }
          >
            <p className="text-sm text-muted-foreground">
              {isEdit
                ? 'A primeira foto é a capa. Use as setas para reordenar. JPG, PNG ou WebP, até 5 MB, no máximo 10 fotos.'
                : 'Salve a máquina primeiro. Depois as fotos podem ser adicionadas aqui.'}
            </p>
            <input
              ref={fileInput}
              type="file"
              accept={PHOTO_TYPES.join(',')}
              multiple
              onChange={(e) => void handleFiles(e)}
              className="sr-only"
              tabIndex={-1}
              aria-hidden="true"
            />
            {photos.length > 0 && (
              <ul className="grid grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] gap-3">
                {photos.map((photo, index) => (
                  <li key={photo.id} className="relative overflow-hidden rounded-lg border border-border">
                    <img
                      src={`/api/machine-photos/${photo.id}`}
                      alt={`Foto ${index + 1} da máquina ${values.code}`}
                      className="aspect-[4/3] w-full object-cover"
                    />
                    {index === 0 && (
                      <span className="absolute top-2 left-2 rounded-full bg-primary px-2 py-0.5 text-xs font-bold text-primary-foreground">
                        Capa
                      </span>
                    )}
                    {canEdit && (
                      <div className="flex justify-between bg-card p-1">
                        <button type="button" disabled={index === 0} onClick={() => void movePhoto(index, -1)} aria-label={`Mover foto ${index + 1} para a esquerda`} className="grid size-9 place-items-center rounded-md hover:bg-accent disabled:opacity-30">
                          <ArrowLeft aria-hidden="true" className="size-4" />
                        </button>
                        <button type="button" onClick={() => void removePhoto(photo.id)} aria-label={`Remover foto ${index + 1}`} className="grid size-9 place-items-center rounded-md text-destructive hover:bg-destructive/10">
                          <Trash2 aria-hidden="true" className="size-4" />
                        </button>
                        <button type="button" disabled={index === photos.length - 1} onClick={() => void movePhoto(index, 1)} aria-label={`Mover foto ${index + 1} para a direita`} className="grid size-9 place-items-center rounded-md hover:bg-accent disabled:opacity-30">
                          <ArrowRight aria-hidden="true" className="size-4" />
                        </button>
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </Section>

          <fieldset disabled={!canEdit || saving} className="flex flex-col gap-5">
            <Section title="Identificação">
              <div className="grid gap-4 sm:grid-cols-2">
                <TextInput field="code" label="Código" required maxLength={20} hint={isEdit ? undefined : 'Sugerido automaticamente'} {...fieldProps} />
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="typeId" className="text-sm font-semibold">
                    Tipo de máquina<span aria-hidden="true" className="text-destructive"> *</span>
                  </label>
                  <select
                    id="typeId"
                    value={values.typeId}
                    onChange={(e) => handleChange('typeId', e.target.value)}
                    aria-invalid={errors.typeId ? true : undefined}
                    aria-describedby={errors.typeId ? 'typeId-error' : undefined}
                    className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
                  >
                    <option value="">Escolha o tipo…</option>
                    {types.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name}
                      </option>
                    ))}
                  </select>
                  {errors.typeId && (
                    <p id="typeId-error" className="text-sm text-destructive">
                      {errors.typeId}
                    </p>
                  )}
                </div>
                <TextInput field="manufacturer" label="Fabricante" maxLength={100} {...fieldProps} />
                <TextInput field="model" label="Modelo" maxLength={100} {...fieldProps} />
                <TextInput field="year" label="Ano" inputMode="numeric" maxLength={4} {...fieldProps} />
                <TextInput field="serialNumber" label="Número de série" maxLength={100} {...fieldProps} />
                <TextInput field="assetTag" label="Patrimônio" maxLength={50} {...fieldProps} />
                <TextInput field="hourMeter" label="Horímetro atual (h)" inputMode="numeric" {...fieldProps} />
              </div>
            </Section>

            <Section title="Disponibilidade">
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" checked={blocked} onChange={(e) => setBlocked(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <strong>Bloquear para locação</strong>
                  <br />
                  <span className="text-muted-foreground">
                    Use quando a máquina estiver indisponível por outro motivo além de manutenção (ex.: aguardando documentação).
                  </span>
                </span>
              </label>
              {blocked && <TextInput field="blockedReason" label="Motivo do bloqueio" required maxLength={300} {...fieldProps} />}
              <label className="flex min-h-11 cursor-pointer items-start gap-3 text-sm">
                <input type="checkbox" checked={showOnWebsite} onChange={(e) => setShowOnWebsite(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
                <span>
                  <strong>Mostrar no site da empresa</strong>
                  <br />
                  <span className="text-muted-foreground">Vai valer quando a integração com o site estiver pronta.</span>
                </span>
              </label>
            </Section>
          </fieldset>
        </div>

        <aside className="sticky top-24 flex grow basis-64 flex-col gap-3 rounded-xl border border-border bg-card p-5 lg:max-w-80">
          <div className="flex items-center">
            <h2 className="text-sm font-semibold">Características do tipo</h2>
            <Link to="/maquinas/tipos" className="ml-auto text-sm text-ring underline-offset-4 hover:underline">
              Editar tipos
            </Link>
          </div>
          {selectedType ? (
            <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm">
              <dt className="text-muted-foreground">Categoria</dt>
              <dd>{CATEGORY_LABELS[selectedType.category]}</dd>
              <dt className="text-muted-foreground">Altura de trabalho</dt>
              <dd>{Number(selectedType.workingHeightM).toLocaleString('pt-BR')} m</dd>
              <dt className="text-muted-foreground">Capacidade</dt>
              <dd>{selectedType.capacityKg} kg</dd>
              <dt className="text-muted-foreground">Energia</dt>
              <dd>{POWER_LABELS[selectedType.powerSource]}</dd>
              {selectedType.usage && (
                <>
                  <dt className="text-muted-foreground">Uso</dt>
                  <dd>{selectedType.usage}</dd>
                </>
              )}
              <dt className="text-muted-foreground">Diária</dt>
              <dd className="font-semibold">{money.format(Number(selectedType.dailyPrice))}</dd>
              {selectedType.weeklyPrice && (
                <>
                  <dt className="text-muted-foreground">Semanal</dt>
                  <dd>{money.format(Number(selectedType.weeklyPrice))}</dd>
                </>
              )}
              {selectedType.monthlyPrice && (
                <>
                  <dt className="text-muted-foreground">Mensal</dt>
                  <dd>{money.format(Number(selectedType.monthlyPrice))}</dd>
                </>
              )}
            </dl>
          ) : (
            <p className="text-sm text-muted-foreground">Escolha o tipo para ver as características e os preços.</p>
          )}
          {isEdit && canEdit && (
            <Button type="button" variant="outline" className="mt-2 h-11" onClick={() => void handleArchive()}>
              <Archive aria-hidden="true" className="size-4" />
              Arquivar máquina
            </Button>
          )}
        </aside>
      </div>
    </form>
  )
}