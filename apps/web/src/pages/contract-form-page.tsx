import { useEffect, useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { Check, CircleAlert, LoaderCircle, Trash2 } from 'lucide-react'
import {
  CONTRACT_STATUS_LABELS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  UFS,
  contractSchema,
  formatDocument,
  maskDocument,
  parseDecimal,
  rentalDays,
  type ContractStatus,
  type PaymentMethod,
} from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface ClientOption {
  id: string
  name: string
  tradeName: string | null
  document: string
  type?: 'INDIVIDUAL' | 'COMPANY'
  contactName?: string | null
}

interface MachineOption {
  id: string
  code: string
  blocked: boolean
  type: { name: string; dailyPrice?: string }
}

interface Item {
  machineId: string
  dailyRate: string
}

interface Conflict {
  machineCode: string
  contractNumber: number
  startDate: string
  endDate: string
}

interface ContractDetail {
  id: string
  number: number
  status: ContractStatus
  startDate: string
  endDate: string
  siteName: string | null
  siteZipCode: string | null
  siteStreet: string | null
  siteNumber: string | null
  siteDistrict: string | null
  siteCity: string | null
  siteState: string | null
  paymentMethod: PaymentMethod
  installments: number
  notes: string | null
  totalAmount: string
  client: ClientOption
  items: { machineId: string; dailyRate: string; machine: { code: string; type: { name: string } } }[]
}

const SITE_FIELDS = ['siteName', 'siteZipCode', 'siteStreet', 'siteNumber', 'siteDistrict', 'siteCity', 'siteState'] as const
type SiteField = (typeof SITE_FIELDS)[number]

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const brDate = (iso: string) => (iso ? iso.split('-').reverse().join('/') : '')
const toRate = (value: string | undefined) => (value ? Number(value).toLocaleString('pt-BR', { minimumFractionDigits: 2 }) : '')

// Destaca no documento o que ainda falta preencher
function Slot({ value, empty }: { value: ReactNode; empty: string }) {
  return value ? (
    <strong className="font-semibold">{value}</strong>
  ) : (
    <mark className="rounded bg-warning/20 px-1 text-foreground">[{empty}]</mark>
  )
}

function Step({ n, title, children }: { n: number; title: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <h2 className="text-xs font-bold tracking-wide text-muted-foreground">
        {n} · {title.toUpperCase()}
      </h2>
      {children}
    </section>
  )
}

export function ContractFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('contratos:editar') ?? false

  const [number, setNumber] = useState<number | null>(null)
  const [status, setStatus] = useState<ContractStatus>('DRAFT')
  const [client, setClient] = useState<ClientOption | null>(null)
  const [clientSearch, setClientSearch] = useState('')
  const [clientResults, setClientResults] = useState<ClientOption[]>([])
  const [machines, setMachines] = useState<MachineOption[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [startDate, setStartDate] = useState('')
  const [endDate, setEndDate] = useState('')
  const [site, setSite] = useState<Record<SiteField, string>>(
    Object.fromEntries(SITE_FIELDS.map((f) => [f, ''])) as Record<SiteField, string>,
  )
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('PIX')
  const [installments, setInstallments] = useState('1')
  const [notes, setNotes] = useState('')
  const [conflicts, setConflicts] = useState<Conflict[] | null>(null)
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [busy, setBusy] = useState(false)

  const editable = canEdit && status === 'DRAFT'

  useEffect(() => {
    document.title = `${isEdit ? 'Contrato' : 'Novo contrato'} · ${brand.name}`
    apiFetch<{ items: MachineOption[] }>('/machines')
      .then((r) => setMachines(r.items))
      .catch(() => setMachines([]))
  }, [isEdit])

  // Carrega o contrato existente
  useEffect(() => {
    if (!id) return
    apiFetch<ContractDetail>(`/contracts/${encodeURIComponent(id)}`)
      .then((c) => {
        setNumber(c.number)
        setStatus(c.status)
        setClient(c.client)
        setStartDate(c.startDate.slice(0, 10))
        setEndDate(c.endDate.slice(0, 10))
        setItems(c.items.map((i) => ({ machineId: i.machineId, dailyRate: toRate(i.dailyRate) })))
        setSite(Object.fromEntries(SITE_FIELDS.map((f) => [f, c[f] ?? ''])) as Record<SiteField, string>)
        setPaymentMethod(c.paymentMethod)
        setInstallments(String(c.installments))
        setNotes(c.notes ?? '')
      })
      .catch((err: unknown) => setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Contrato não encontrado.' }))
      .finally(() => setLoading(false))
  }, [id])

  // Busca de clientes enquanto digita
  useEffect(() => {
    const q = clientSearch.trim()
    if (q.length < 2) {
      setClientResults([])
      return
    }
    const controller = new AbortController()
    const timer = setTimeout(() => {
      apiFetch<{ items: ClientOption[] }>(`/clients?q=${encodeURIComponent(q)}`, { signal: controller.signal })
        .then((r) => !controller.signal.aborted && setClientResults(r.items.slice(0, 6)))
        .catch(() => undefined)
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [clientSearch])

  // Confere a agenda das máquinas sempre que período ou máquinas mudam
  const machineIds = items.map((i) => i.machineId).filter(Boolean).join(',')
  useEffect(() => {
    if (!machineIds || !startDate || !endDate || endDate <= startDate || status !== 'DRAFT') {
      setConflicts(null)
      return
    }
    const controller = new AbortController()
    const params = new URLSearchParams({ machineIds, startDate, endDate })
    if (id) params.set('excludeContractId', id)
    const timer = setTimeout(() => {
      apiFetch<{ conflicts: Conflict[] }>(`/contracts/availability?${params.toString()}`, { signal: controller.signal })
        .then((r) => !controller.signal.aborted && setConflicts(r.conflicts))
        .catch(() => undefined)
    }, 300)
    return () => {
      clearTimeout(timer)
      controller.abort()
    }
  }, [machineIds, startDate, endDate, id, status])

  async function pickClient(option: ClientOption) {
    setClientSearch('')
    setClientResults([])
    // A ficha completa traz o documento inteiro e o responsável, usados no texto do contrato
    const full = await apiFetch<ClientOption>(`/clients/${encodeURIComponent(option.id)}`).catch(() => option)
    setClient(full)
  }

  const days = startDate && endDate ? rentalDays(startDate, endDate) : 0

  const lines = useMemo(
    () =>
      items.map((item) => {
        const machine = machines.find((m) => m.id === item.machineId)
        const typed = parseDecimal(item.dailyRate)
        const rate = typeof typed === 'number' && !Number.isNaN(typed) ? typed : Number(machine?.type.dailyPrice ?? 0)
        return { ...item, machine, rate, amount: days > 0 ? rate * days : 0 }
      }),
    [items, machines, days],
  )
  const total = lines.reduce((sum, line) => sum + line.amount, 0)

  const pending: string[] = []
  if (!client) pending.push('escolher o cliente')
  if (client?.type === 'COMPANY' && !client.contactName) pending.push('responsável no cadastro do cliente')
  if (items.length === 0) pending.push('escolher a máquina')
  if (!startDate || !endDate || days < 1) pending.push('definir o período')
  if (!site.siteCity) pending.push('informar a obra')
  if (conflicts && conflicts.length > 0) pending.push('resolver o conflito de agenda')

  function payload() {
    return {
      clientId: client?.id ?? '',
      startDate,
      endDate,
      items: items.map((i) => ({ machineId: i.machineId, dailyRate: i.dailyRate })),
      ...site,
      paymentMethod,
      installments,
      notes,
    }
  }

  async function save(): Promise<string | null> {
    const result = contractSchema.safeParse(payload())
    if (!result.success) {
      const issue = result.error.issues[0]
      setMessage({ kind: 'error', text: issue?.message ?? 'Confira os dados do contrato.' })
      return null
    }
    const saved = await apiFetch<{ id: string }>(isEdit && id ? `/contracts/${encodeURIComponent(id)}` : '/contracts', {
      method: isEdit ? 'PATCH' : 'POST',
      body: JSON.stringify(result.data),
    })
    return saved.id
  }

  async function run(action: () => Promise<void>) {
    if (busy) return
    setBusy(true)
    setMessage(null)
    try {
      await action()
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível concluir.' })
    } finally {
      setBusy(false)
    }
  }

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void run(async () => {
      const savedId = await save()
      if (!savedId) return
      if (isEdit) setMessage({ kind: 'success', text: 'Rascunho salvo.' })
      else navigate(`/contratos/${savedId}`, { replace: true })
    })
  }

  function handleActivate() {
    if (!window.confirm('Ativar o contrato? As máquinas ficam reservadas e o contrato não poderá mais ser editado.')) return
    void run(async () => {
      const savedId = await save()
      if (!savedId) return
      await apiFetch(`/contracts/${encodeURIComponent(savedId)}/activate`, { method: 'POST' })
      if (isEdit) {
        setStatus('ACTIVE')
        setMessage({ kind: 'success', text: 'Contrato ativado. Máquinas reservadas.' })
      } else {
        navigate(`/contratos/${savedId}`, { replace: true })
      }
    })
  }

  function handleTransition(action: 'finish' | 'cancel', question: string, next: ContractStatus) {
    if (!id || !window.confirm(question)) return
    void run(async () => {
      await apiFetch(`/contracts/${encodeURIComponent(id)}/${action}`, { method: 'POST' })
      setStatus(next)
      setMessage({ kind: 'success', text: `Contrato ${CONTRACT_STATUS_LABELS[next].toLowerCase()}.` })
    })
  }

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Carregando contrato…
      </div>
    )
  }

  const available = machines.filter((m) => !m.blocked && !items.some((i) => i.machineId === m.id))
  const numberLabel = number ? `#${String(number).padStart(6, '0')}` : 'novo'

  return (
    <form noValidate onSubmit={handleSave} aria-busy={busy} className="flex flex-col gap-5">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <p className="text-sm text-muted-foreground">
            <Link to="/contratos" className="underline-offset-4 hover:underline">
              Contratos
            </Link>{' '}
            › Contrato {numberLabel}
          </p>
          <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold">
            Contrato {numberLabel}
            <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{CONTRACT_STATUS_LABELS[status]}</span>
          </h1>
        </div>
      </div>

      {message && (
        <p
          role={message.kind === 'error' ? 'alert' : 'status'}
          className={`rounded-lg border px-4 py-3 text-sm ${
            message.kind === 'error' ? 'border-destructive/40 bg-destructive/10 text-destructive' : 'border-success/40 bg-success/10 text-success'
          }`}
        >
          {message.text}
        </p>
      )}

      <div className="flex flex-wrap items-start gap-5">
        <fieldset disabled={!editable || busy} className="flex min-w-0 grow basis-96 flex-col gap-4 lg:max-w-md">
          <Step n={1} title="Cliente">
            {client ? (
              <div className="flex items-center gap-3">
                <div className="min-w-0 grow">
                  <p className="truncate font-semibold">{client.tradeName ?? client.name}</p>
                  <p className="text-sm text-muted-foreground">{maskDocument(client.document)}</p>
                </div>
                {editable && (
                  <Button type="button" variant="outline" className="h-10" onClick={() => setClient(null)}>
                    Trocar
                  </Button>
                )}
              </div>
            ) : (
              <div className="relative">
                <label htmlFor="client-search" className="sr-only">
                  Buscar cliente
                </label>
                <Input
                  id="client-search"
                  value={clientSearch}
                  onChange={(e) => setClientSearch(e.target.value)}
                  placeholder="Digite o nome do cliente"
                  autoComplete="off"
                  className="h-11 text-base"
                />
                {clientResults.length > 0 && (
                  <ul className="absolute z-10 mt-1 w-full overflow-hidden rounded-lg border border-border bg-card shadow-lg">
                    {clientResults.map((option) => (
                      <li key={option.id}>
                        <button
                          type="button"
                          onClick={() => void pickClient(option)}
                          className="flex min-h-11 w-full flex-col items-start px-3 py-2 text-left text-sm hover:bg-accent"
                        >
                          <span className="font-semibold">{option.tradeName ?? option.name}</span>
                          <span className="text-xs text-muted-foreground">{option.document}</span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}
          </Step>

          <Step n={2} title="Obra">
            <Input aria-label="Nome da obra" placeholder="Nome da obra (opcional)" value={site.siteName} onChange={(e) => setSite((s) => ({ ...s, siteName: e.target.value }))} className="h-11" />
            <div className="grid grid-cols-3 gap-2">
              <Input aria-label="Rua" placeholder="Rua" value={site.siteStreet} onChange={(e) => setSite((s) => ({ ...s, siteStreet: e.target.value }))} className="col-span-2 h-11" />
              <Input aria-label="Número" placeholder="Nº" value={site.siteNumber} onChange={(e) => setSite((s) => ({ ...s, siteNumber: e.target.value }))} className="h-11" />
              <Input aria-label="Bairro" placeholder="Bairro" value={site.siteDistrict} onChange={(e) => setSite((s) => ({ ...s, siteDistrict: e.target.value }))} className="h-11" />
              <Input aria-label="Cidade" placeholder="Cidade" value={site.siteCity} onChange={(e) => setSite((s) => ({ ...s, siteCity: e.target.value }))} className="h-11" />
              <select aria-label="UF" value={site.siteState} onChange={(e) => setSite((s) => ({ ...s, siteState: e.target.value }))} className="h-11 rounded-lg border border-input bg-transparent px-2">
                <option value="">UF</option>
                {UFS.map((uf) => (
                  <option key={uf} value={uf}>
                    {uf}
                  </option>
                ))}
              </select>
            </div>
          </Step>

          <Step n={3} title="Máquinas e período">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Retirada
                <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} className="h-11" />
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Devolução
                <Input type="date" value={endDate} min={startDate || undefined} onChange={(e) => setEndDate(e.target.value)} className="h-11" />
              </label>
            </div>

            {lines.map((line, index) => (
              <div key={line.machineId} className="flex items-center gap-2 rounded-lg border border-border p-2">
                <div className="min-w-0 grow">
                  <p className="text-sm font-semibold">{line.machine?.code ?? 'Máquina'}</p>
                  <p className="truncate text-xs text-muted-foreground">{line.machine?.type.name}</p>
                </div>
                <label className="sr-only" htmlFor={`rate-${index}`}>
                  Diária de {line.machine?.code}
                </label>
                <Input
                  id={`rate-${index}`}
                  inputMode="decimal"
                  placeholder={toRate(line.machine?.type.dailyPrice) || 'Diária'}
                  value={line.dailyRate}
                  onChange={(e) => setItems((all) => all.map((it, i) => (i === index ? { ...it, dailyRate: e.target.value } : it)))}
                  className="h-10 w-28"
                />
                {editable && (
                  <button
                    type="button"
                    onClick={() => setItems((all) => all.filter((_, i) => i !== index))}
                    aria-label={`Remover ${line.machine?.code ?? 'máquina'}`}
                    className="grid size-10 place-items-center rounded-md text-destructive hover:bg-destructive/10"
                  >
                    <Trash2 aria-hidden="true" className="size-4" />
                  </button>
                )}
              </div>
            ))}

            {editable && available.length > 0 && (
              <div className="flex gap-2">
                <label htmlFor="add-machine" className="sr-only">
                  Adicionar máquina
                </label>
                <select
                  id="add-machine"
                  value=""
                  onChange={(e) => e.target.value && setItems((all) => [...all, { machineId: e.target.value, dailyRate: '' }])}
                  className="h-11 grow rounded-lg border border-input bg-transparent px-2"
                >
                  <option value="">+ Adicionar máquina…</option>
                  {available.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.type.name}
                    </option>
                  ))}
                </select>
              </div>
            )}

            {conflicts && conflicts.length === 0 && days > 0 && (
              <p className="flex items-center gap-2 text-sm text-success">
                <Check aria-hidden="true" className="size-4" /> Livre em todo o período · {days} {days === 1 ? 'diária' : 'diárias'}
              </p>
            )}
            {conflicts && conflicts.length > 0 && (
              <div role="alert" className="flex flex-col gap-1 rounded-lg bg-destructive/10 p-3 text-sm text-destructive">
                {conflicts.map((c) => (
                  <p key={`${c.machineCode}-${c.contractNumber}`} className="flex items-center gap-2">
                    <CircleAlert aria-hidden="true" className="size-4 shrink-0" />
                    {c.machineCode} já está no contrato nº {c.contractNumber} ({brDate(c.startDate)} a {brDate(c.endDate)})
                  </p>
                ))}
              </div>
            )}
          </Step>

          <Step n={4} title="Valores">
            <div className="grid grid-cols-2 gap-2">
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Pagamento
                <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className="h-11 rounded-lg border border-input bg-transparent px-2 font-normal">
                  {PAYMENT_METHODS.map((p) => (
                    <option key={p} value={p}>
                      {PAYMENT_LABELS[p]}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1 text-sm font-semibold">
                Parcelas
                <Input inputMode="numeric" value={installments} onChange={(e) => setInstallments(e.target.value)} className="h-11 font-normal" />
              </label>
            </div>
            <textarea
              aria-label="Observações"
              placeholder="Observações (opcional)"
              rows={2}
              maxLength={2000}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="rounded-lg border border-input bg-transparent px-3 py-2 text-sm"
            />
            <p className="flex items-baseline justify-between border-t border-border pt-3">
              <span className="text-sm text-muted-foreground">Total</span>
              <strong className="text-2xl">{money.format(total)}</strong>
            </p>
            <p className="text-xs text-muted-foreground">O valor final é recalculado pelo sistema ao salvar.</p>
          </Step>
        </fieldset>

        <div className="flex min-w-0 grow basis-120 flex-col gap-4">
          <article className="rounded-xl border border-border bg-card p-8 text-sm leading-relaxed shadow-sm" aria-label="Pré-visualização do contrato">
            <p className="text-xs font-bold tracking-widest text-muted-foreground">
              {brand.name.toUpperCase()} {brand.tagline.toUpperCase()}
            </p>
            <h2 className="mt-2 mb-5 text-lg font-bold">Contrato de Locação de Equipamento nº {number ? String(number).padStart(6, '0') : '[a definir]'}</h2>
            <p className="mb-3">
              <strong>LOCATÁRIA:</strong> <Slot value={client?.name} empty="cliente não escolhido" />, inscrita no{' '}
              {client?.type === 'INDIVIDUAL' ? 'CPF' : 'CNPJ'} sob o nº{' '}
              <Slot value={client && formatDocument(client.document)} empty="documento" />
              {client?.type !== 'INDIVIDUAL' && (
                <>
                  , neste ato representada por <Slot value={client?.contactName} empty="responsável pendente" />
                </>
              )}
              .
            </p>
            <p className="mb-3">
              <strong>Cláusula 1ª – Do objeto.</strong> Locação{' '}
              {lines.length > 1 ? 'dos equipamentos' : 'do equipamento'}{' '}
              <Slot value={lines.map((l) => `${l.machine?.type.name ?? ''}, código ${l.machine?.code ?? ''}`).join('; ')} empty="máquina não escolhida" />, a ser utilizado na obra situada em{' '}
              <Slot
                value={site.siteCity && [site.siteStreet, site.siteNumber, site.siteDistrict, `${site.siteCity}${site.siteState ? ` - ${site.siteState}` : ''}`].filter(Boolean).join(', ')}
                empty="obra não informada"
              />
              .
            </p>
            <p className="mb-3">
              <strong>Cláusula 2ª – Do prazo.</strong> De <Slot value={brDate(startDate)} empty="retirada" /> a{' '}
              <Slot value={brDate(endDate)} empty="devolução" />, totalizando <Slot value={days > 0 ? `${days} ${days === 1 ? 'diária' : 'diárias'}` : ''} empty="diárias" />.
            </p>
            <p className="mb-3">
              <strong>Cláusula 3ª – Do valor.</strong> Valor total de <Slot value={total > 0 ? money.format(total) : ''} empty="total" />, pago via{' '}
              <strong>{PAYMENT_LABELS[paymentMethod]}</strong> em <strong>{installments || 1}</strong> {Number(installments) > 1 ? 'parcelas' : 'parcela'}.
            </p>
            <p className="text-muted-foreground">
              <strong>Cláusula 4ª – Das obrigações da locatária…</strong> (o texto completo do modelo da empresa entra na próxima fase)
            </p>
          </article>

          {status === 'DRAFT' && pending.length > 0 && (
            <p className="rounded-lg border border-warning/40 bg-warning/10 px-4 py-3 text-sm">
              <strong>
                {pending.length} {pending.length === 1 ? 'pendência' : 'pendências'} antes de ativar:
              </strong>{' '}
              {pending.join(' · ')}
            </p>
          )}

          {canEdit && (
            <div className="flex flex-wrap justify-end gap-2">
              {status === 'DRAFT' && (
                <>
                  <Button type="submit" variant="outline" disabled={busy} className="h-11">
                    Salvar rascunho
                  </Button>
                  <Button type="button" disabled={busy || pending.length > 0} onClick={handleActivate} className="h-11 font-bold">
                    {busy && <LoaderCircle aria-hidden="true" className="size-4 animate-spin" />}
                    Ativar contrato
                  </Button>
                </>
              )}
              {status === 'ACTIVE' && (
                <Button type="button" variant="outline" disabled={busy} className="h-11" onClick={() => handleTransition('finish', 'Encerrar o contrato? As máquinas voltam a ficar livres.', 'FINISHED')}>
                  Encerrar contrato
                </Button>
              )}
              {(status === 'DRAFT' || status === 'ACTIVE') && isEdit && (
                <Button type="button" variant="outline" disabled={busy} className="h-11 text-destructive" onClick={() => handleTransition('cancel', 'Cancelar o contrato? As máquinas voltam a ficar livres.', 'CANCELLED')}>
                  Cancelar contrato
                </Button>
              )}
            </div>
          )}
        </div>
      </div>
    </form>
  )
}