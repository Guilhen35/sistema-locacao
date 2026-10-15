import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Archive, Check, CircleAlert, Circle, LoaderCircle } from 'lucide-react'
import { clientSchema, UFS, type ClientType } from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

const FIELDS = [
  'document', 'name', 'tradeName', 'contactName', 'contactDocument', 'phone', 'whatsapp', 'email',
  'zipCode', 'street', 'number', 'district', 'city', 'state', 'notes',
] as const

type Field = (typeof FIELDS)[number]
type Values = Record<Field, string>
type Errors = Partial<Record<Field, string>>

const EMPTY: Values = Object.fromEntries(FIELDS.map((field) => [field, ''])) as Values

function isField(value: unknown): value is Field {
  return typeof value === 'string' && (FIELDS as readonly string[]).includes(value)
}

// Coloca pontuação nas posições indicadas, enquanto o usuário digita
function applyPattern(raw: string, separators: Record<number, string>, max: number): string {
  let out = ''
  for (let i = 0; i < Math.min(raw.length, max); i++) out += (separators[i] ?? '') + raw[i]
  return out
}

const onlyDigits = (value: string) => value.replace(/\D/g, '')
const maskCpf = (v: string) => applyPattern(onlyDigits(v), { 3: '.', 6: '.', 9: '-' }, 11)
const maskCnpj = (v: string) => applyPattern(v.toUpperCase().replace(/[^0-9A-Z]/g, ''), { 2: '.', 5: '.', 8: '/', 12: '-' }, 14)
const maskCep = (v: string) => applyPattern(onlyDigits(v), { 5: '-' }, 8)

function maskPhone(value: string): string {
  const d = onlyDigits(value).slice(0, 11)
  if (d.length <= 2) return d.length ? `(${d}` : ''
  const rest = d.slice(2)
  const cut = rest.length > 8 ? 5 : 4
  return `(${d.slice(0, 2)}) ${rest.length > cut ? `${rest.slice(0, cut)}-${rest.slice(cut)}` : rest}`
}

const MASKS: Partial<Record<Field, (value: string, type: ClientType) => string>> = {
  document: (v, type) => (type === 'COMPANY' ? maskCnpj(v) : maskCpf(v)),
  contactDocument: maskCpf,
  phone: maskPhone,
  whatsapp: maskPhone,
  zipCode: maskCep,
}

type ApiClient = Record<Field, string | null> & { id: string; type: ClientType }

function fromApi(client: ApiClient): Values {
  const values = { ...EMPTY }
  for (const field of FIELDS) {
    const raw = client[field] ?? ''
    values[field] = MASKS[field]?.(raw, client.type) ?? raw
  }
  return values
}

function TextField(props: {
  field: Field
  label: string
  values: Values
  errors: Errors
  onChange: (field: Field, value: string) => void
  required?: boolean
  type?: string
  autoComplete?: string
  inputMode?: 'numeric' | 'tel' | 'email' | 'text'
  maxLength?: number
  className?: string
}) {
  const { field, label, values, errors, onChange, required, className, ...input } = props
  const error = errors[field]
  return (
    <div className={`flex flex-col gap-1.5 ${className ?? ''}`}>
      <label htmlFor={field} className="text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true" className="text-destructive"> *</span>}
      </label>
      <Input
        id={field}
        name={field}
        value={values[field]}
        onChange={(e) => onChange(field, e.target.value)}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${field}-error` : undefined}
        className="h-11 text-base"
        {...input}
      />
      {error && (
        <p id={`${field}-error`} className="text-sm text-destructive">
          {error}
        </p>
      )}
    </div>
  )
}

function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section aria-labelledby={id} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-6">
      <h2 id={id} className="text-base font-semibold">
        {title}
      </h2>
      {children}
    </section>
  )
}

export function ClientFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('clientes:editar') ?? false

  const [type, setType] = useState<ClientType>('COMPANY')
  const [values, setValues] = useState<Values>(EMPTY)
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    document.title = `${isEdit ? 'Ficha do cliente' : 'Novo cliente'} · ${brand.name}`
  }, [isEdit])

  useEffect(() => {
    if (!id) return
    const controller = new AbortController()
    apiFetch<ApiClient>(`/clients/${encodeURIComponent(id)}`, { signal: controller.signal })
      .then((client) => {
        if (controller.signal.aborted) return
        setType(client.type)
        setValues(fromApi(client))
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setFormError(err instanceof ApiError ? err.message : 'Cliente não encontrado.')
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [id])

  // Preenche o endereço pelo CEP (ViaCEP). Só aceita texto na resposta
  const cep = onlyDigits(values.zipCode)
  useEffect(() => {
    if (cep.length !== 8) return
    const controller = new AbortController()
    fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: controller.signal, credentials: 'omit' })
      .then((r) => (r.ok ? r.json() : null))
      .then((data: unknown) => {
        if (!data || typeof data !== 'object' || 'erro' in data) return
        const pick = (key: string) => {
          const value = (data as Record<string, unknown>)[key]
          return typeof value === 'string' ? value.slice(0, 100) : ''
        }
        setValues((v) => ({
          ...v,
          street: pick('logradouro') || v.street,
          district: pick('bairro') || v.district,
          city: pick('localidade') || v.city,
          state: pick('uf') || v.state,
        }))
      })
      .catch(() => {
        // Sem internet ou CEP fora do ar: o usuário digita o endereço
      })
    return () => controller.abort()
  }, [cep])

  function handleChange(field: Field, value: string) {
    const masked = MASKS[field]?.(value, type) ?? value
    setValues((v) => ({ ...v, [field]: masked }))
    if (errors[field]) setErrors((e) => ({ ...e, [field]: undefined }))
  }

  function handleTypeChange(next: ClientType) {
    setType(next)
    setValues((v) => ({ ...v, document: '' }))
    setErrors({})
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (saving || !canEdit) return

    const result = clientSchema.safeParse({ type, ...values })
    if (!result.success) {
      const next: Errors = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (isField(key) && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      setFormError('Confira os campos destacados.')
      return
    }

    setErrors({})
    setFormError(null)
    setSaving(true)
    try {
      await apiFetch(isEdit && id ? `/clients/${encodeURIComponent(id)}` : '/clients', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(result.data),
      })
      navigate('/clientes', { replace: true })
    } catch (err) {
      if (err instanceof ApiError) {
        const next: Errors = {}
        for (const [key, messages] of Object.entries(err.fieldErrors)) {
          if (isField(key) && messages[0]) next[key] = messages[0]
        }
        setErrors(next)
        setFormError(Object.keys(next).length ? 'Confira os campos destacados.' : err.message)
      } else {
        setFormError('Não foi possível salvar. Tente novamente.')
      }
      setSaving(false)
    }
  }

  async function handleArchive() {
    if (!id || !window.confirm('Arquivar este cliente? Ele some da lista, mas o histórico é mantido.')) return
    try {
      await apiFetch(`/clients/${encodeURIComponent(id)}`, { method: 'DELETE' })
      navigate('/clientes', { replace: true })
    } catch (err) {
      setFormError(err instanceof ApiError ? err.message : 'Não foi possível arquivar.')
    }
  }

  const isCompany = type === 'COMPANY'
  const fieldProps = { values, errors, onChange: handleChange }

  const steps: { label: string; fields: Field[]; done: boolean }[] = [
    { label: 'Tipo de cliente', fields: [], done: true },
    {
      label: isCompany ? 'Dados da empresa' : 'Dados pessoais',
      fields: ['document', 'name', 'tradeName', 'contactName', 'contactDocument'],
      done: Boolean(values.document && values.name && (!isCompany || values.contactName)),
    },
    { label: 'Contato', fields: ['phone', 'whatsapp', 'email'], done: Boolean(values.whatsapp) },
    { label: 'Endereço', fields: ['zipCode', 'street', 'number', 'district', 'city', 'state'], done: Boolean(values.city) },
  ]

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Carregando cliente…
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={saving} className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link to="/clientes" className="underline-offset-4 hover:underline">
            Clientes
          </Link>{' '}
          › {isEdit ? 'Ficha do cliente' : 'Novo cliente'}
        </p>
        <h1 className="mt-1 text-2xl font-bold">{isEdit ? values.name || 'Ficha do cliente' : 'Novo cliente'}</h1>
      </div>

      {formError && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {formError}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <fieldset disabled={!canEdit || saving} className="flex min-w-0 grow basis-140 flex-col gap-5">
          <Section id="sec-type" title="Tipo de cliente">
            <div role="radiogroup" aria-label="Tipo de cliente" className="flex flex-wrap gap-3">
              {(['COMPANY', 'INDIVIDUAL'] as const).map((option) => (
                <label
                  key={option}
                  className={`flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    type === option ? 'border-2 border-primary bg-primary/10' : 'border-input'
                  }`}
                >
                  <input
                    type="radio"
                    name="type"
                    value={option}
                    checked={type === option}
                    onChange={() => handleTypeChange(option)}
                    className="size-4 accent-primary"
                  />
                  {option === 'COMPANY' ? 'Empresa (CNPJ)' : 'Pessoa física (CPF)'}
                </label>
              ))}
            </div>
          </Section>

          <Section id="sec-data" title={isCompany ? 'Dados da empresa' : 'Dados pessoais'}>
            <div className="grid gap-4 sm:grid-cols-2">
              <TextField field="document" label={isCompany ? 'CNPJ' : 'CPF'} required inputMode={isCompany ? 'text' : 'numeric'} autoComplete="off" {...fieldProps} />
              <TextField field="name" label={isCompany ? 'Razão social' : 'Nome completo'} required maxLength={200} autoComplete={isCompany ? 'organization' : 'name'} {...fieldProps} />
              {isCompany && (
                <>
                  <TextField field="tradeName" label="Nome fantasia" maxLength={200} {...fieldProps} />
                  <TextField field="contactName" label="Responsável" required maxLength={200} autoComplete="name" {...fieldProps} />
                  <TextField field="contactDocument" label="CPF do responsável" inputMode="numeric" autoComplete="off" {...fieldProps} />
                </>
              )}
            </div>
          </Section>

          <Section id="sec-contact" title="Contato">
            <div className="grid gap-4 sm:grid-cols-3">
              <TextField field="phone" label="Telefone" type="tel" inputMode="tel" autoComplete="tel" {...fieldProps} />
              <TextField field="whatsapp" label="WhatsApp" required type="tel" inputMode="tel" autoComplete="tel" {...fieldProps} />
              <TextField field="email" label="E-mail" type="email" inputMode="email" autoComplete="email" maxLength={254} {...fieldProps} />
            </div>
          </Section>

          <Section id="sec-address" title="Endereço">
            <div className="grid gap-4 sm:grid-cols-6">
              <TextField field="zipCode" label="CEP" inputMode="numeric" autoComplete="postal-code" className="sm:col-span-2" {...fieldProps} />
              <p className="self-end pb-3 text-sm text-muted-foreground sm:col-span-4">O endereço é preenchido pelo CEP.</p>
              <TextField field="street" label="Rua" maxLength={200} autoComplete="address-line1" className="sm:col-span-4" {...fieldProps} />
              <TextField field="number" label="Número" maxLength={20} className="sm:col-span-2" {...fieldProps} />
              <TextField field="district" label="Bairro" maxLength={100} className="sm:col-span-2" {...fieldProps} />
              <TextField field="city" label="Cidade" maxLength={100} autoComplete="address-level2" className="sm:col-span-3" {...fieldProps} />
              <div className="flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor="state" className="text-sm font-semibold">
                  UF
                </label>
                <select
                  id="state"
                  value={values.state}
                  onChange={(e) => handleChange('state', e.target.value)}
                  aria-invalid={errors.state ? true : undefined}
                  className="h-11 rounded-lg border border-input bg-transparent px-2 text-base"
                >
                  <option value="">--</option>
                  {UFS.map((uf) => (
                    <option key={uf} value={uf}>
                      {uf}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </Section>

          <Section id="sec-notes" title="Observações">
            <label htmlFor="notes" className="sr-only">
              Observações
            </label>
            <textarea
              id="notes"
              rows={4}
              maxLength={2000}
              value={values.notes}
              onChange={(e) => handleChange('notes', e.target.value)}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-base"
            />
          </Section>
        </fieldset>

        <aside className="sticky top-24 flex grow basis-64 flex-col gap-4 rounded-xl border border-border bg-card p-5 lg:max-w-80">
          <h2 className="text-sm font-semibold">Progresso</h2>
          <ol className="flex flex-col gap-2 text-sm">
            {steps.map((step) => {
              const hasError = step.fields.some((field) => errors[field])
              const Icon = hasError ? CircleAlert : step.done ? Check : Circle
              return (
                <li key={step.label} className={`flex items-center gap-2 ${hasError ? 'text-destructive' : step.done ? 'text-success' : 'text-muted-foreground'}`}>
                  <Icon aria-hidden="true" className="size-4" />
                  {step.label}
                  <span className="sr-only">{hasError ? ': com erro' : step.done ? ': completo' : ': pendente'}</span>
                </li>
              )
            })}
          </ol>

          {canEdit ? (
            <>
              <Button type="submit" size="lg" disabled={saving} className="h-12 text-base font-bold">
                {saving && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
                {saving ? 'Salvando…' : 'Salvar cliente'}
              </Button>
              {isEdit && (
                <Button type="button" variant="outline" onClick={() => void handleArchive()} className="h-11">
                  <Archive aria-hidden="true" className="size-4" />
                  Arquivar cliente
                </Button>
              )}
            </>
          ) : (
            <p className="text-sm text-muted-foreground">Você pode ver, mas não editar este cliente.</p>
          )}
          <Link to="/clientes" className="text-center text-sm text-muted-foreground underline-offset-4 hover:underline">
            Cancelar
          </Link>
          <p className="text-xs text-muted-foreground">
            Os dados são usados apenas para contratos, cobranças e contato sobre as locações (LGPD).
          </p>
        </aside>
      </div>
    </form>
  )
}