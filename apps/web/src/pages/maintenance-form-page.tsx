import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate, useParams } from 'react-router'
import { CheckCircle2, LoaderCircle, Plus, Trash2 } from 'lucide-react'
import {
  MAINTENANCE_KIND_LABELS,
  MAINTENANCE_KINDS,
  MAINTENANCE_STATUS_LABELS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  maintenanceSchema,
  parseDecimal,
  type MaintenanceKind,
  type MaintenanceStatus,
  type PaymentMethod,
} from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface MachineOption {
  id: string
  code: string
  hourMeter: number | null
  type: { name: string }
}

interface Line {
  description: string
  quantity: string
  unitPrice: string
}

interface MaintenanceDetail {
  id: string
  machineId: string
  kind: MaintenanceKind
  status: MaintenanceStatus
  date: string
  hourMeter: number | null
  description: string
  blocksMachine: boolean
  supplier: string | null
  paymentMethod: PaymentMethod | null
  dueDate: string | null
  paid: boolean
  sendToFinance: boolean
  items: { description: string; quantity: string; unitPrice: string }[]
}

const money = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' })
const today = () => new Date().toISOString().slice(0, 10)
const toInput = (value: string) => Number(value).toLocaleString('pt-BR', { maximumFractionDigits: 2 })
const num = (value: string) => {
  const n = parseDecimal(value)
  return typeof n === 'number' && !Number.isNaN(n) ? n : 0
}
const emptyLine = (): Line => ({ description: '', quantity: '1', unitPrice: '' })

export function MaintenanceFormPage() {
  const { id } = useParams()
  const isEdit = Boolean(id)
  const navigate = useNavigate()
  const { user } = useAuth()
  const canEdit = user?.permissions.includes('manutencao:editar') ?? false

  const [machines, setMachines] = useState<MachineOption[]>([])
  const [machineId, setMachineId] = useState('')
  const [date, setDate] = useState(today())
  const [hourMeter, setHourMeter] = useState('')
  const [kind, setKind] = useState<MaintenanceKind>('CORRECTIVE')
  const [description, setDescription] = useState('')
  const [blocksMachine, setBlocksMachine] = useState(true)
  const [lines, setLines] = useState<Line[]>([emptyLine()])
  const [supplier, setSupplier] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('BOLETO')
  const [dueDate, setDueDate] = useState('')
  const [paid, setPaid] = useState(false)
  const [sendToFinance, setSendToFinance] = useState(true)
  const [status, setStatus] = useState<MaintenanceStatus>('OPEN')
  const [message, setMessage] = useState<{ kind: 'error' | 'success'; text: string } | null>(null)
  const [loading, setLoading] = useState(isEdit)
  const [busy, setBusy] = useState(false)

  const editable = canEdit && status === 'OPEN'

  useEffect(() => {
    document.title = `${isEdit ? 'Manutenção' : 'Registrar manutenção'} · ${brand.name}`
    apiFetch<{ items: MachineOption[] }>('/machines')
      .then((r) => setMachines(r.items))
      .catch(() => setMachines([]))
  }, [isEdit])

  useEffect(() => {
    if (!id) return
    apiFetch<MaintenanceDetail>(`/maintenances/${encodeURIComponent(id)}`)
      .then((m) => {
        setMachineId(m.machineId)
        setDate(m.date.slice(0, 10))
        setHourMeter(m.hourMeter?.toString() ?? '')
        setKind(m.kind)
        setDescription(m.description)
        setBlocksMachine(m.blocksMachine)
        setLines(
          m.items.length
            ? m.items.map((i) => ({ description: i.description, quantity: toInput(i.quantity), unitPrice: toInput(i.unitPrice) }))
            : [emptyLine()],
        )
        setSupplier(m.supplier ?? '')
        setPaymentMethod(m.paymentMethod ?? '')
        setDueDate(m.dueDate?.slice(0, 10) ?? '')
        setPaid(m.paid)
        setSendToFinance(m.sendToFinance)
        setStatus(m.status)
      })
      .catch((err: unknown) => setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Manutenção não encontrada.' }))
      .finally(() => setLoading(false))
  }, [id])

  const filledLines = lines.filter((l) => l.description.trim())
  const total = filledLines.reduce((sum, l) => sum + num(l.quantity) * num(l.unitPrice), 0)
  const machine = machines.find((m) => m.id === machineId)

  function updateLine(index: number, field: keyof Line, value: string) {
    setLines((all) => all.map((line, i) => (i === index ? { ...line, [field]: value } : line)))
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy || !editable) return

    const result = maintenanceSchema.safeParse({
      machineId,
      kind,
      date,
      hourMeter,
      description,
      blocksMachine,
      items: filledLines,
      supplier,
      paymentMethod,
      dueDate,
      paid,
      sendToFinance,
    })
    if (!result.success) {
      setMessage({ kind: 'error', text: result.error.issues[0]?.message ?? 'Confira os dados.' })
      return
    }

    setBusy(true)
    setMessage(null)
    try {
      await apiFetch(isEdit && id ? `/maintenances/${encodeURIComponent(id)}` : '/maintenances', {
        method: isEdit ? 'PATCH' : 'POST',
        body: JSON.stringify(result.data),
      })
      navigate('/manutencao', { replace: true })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível salvar.' })
      setBusy(false)
    }
  }

  async function handleFinish() {
    if (!id || !window.confirm('Concluir a manutenção? A máquina volta a ficar disponível para contratos.')) return
    setBusy(true)
    try {
      await apiFetch(`/maintenances/${encodeURIComponent(id)}/finish`, { method: 'POST' })
      setStatus('DONE')
      setMessage({ kind: 'success', text: 'Manutenção concluída. A máquina foi liberada.' })
    } catch (err) {
      setMessage({ kind: 'error', text: err instanceof ApiError ? err.message : 'Não foi possível concluir.' })
    } finally {
      setBusy(false)
    }
  }

  if (loading) {
    return (
      <div role="status" className="flex items-center gap-2 text-sm text-muted-foreground">
        <LoaderCircle aria-hidden="true" className="size-4 animate-spin" /> Carregando…
      </div>
    )
  }

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={busy} className="flex flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link to="/manutencao" className="underline-offset-4 hover:underline">
            Manutenção
          </Link>{' '}
          › {isEdit ? 'Detalhes' : 'Registrar'}
        </p>
        <h1 className="mt-1 flex items-center gap-3 text-2xl font-bold">
          {isEdit ? `Manutenção ${machine?.code ?? ''}` : 'Registrar manutenção'}
          {isEdit && <span className="rounded-full bg-muted px-3 py-1 text-xs font-semibold">{MAINTENANCE_STATUS_LABELS[status]}</span>}
        </h1>
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
        <fieldset disabled={!editable || busy} className="flex min-w-0 grow basis-140 flex-col gap-4">
          <section className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
            <div className="grid gap-3 sm:grid-cols-[2fr_1fr_1fr]">
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Máquina
                <select
                  value={machineId}
                  onChange={(e) => setMachineId(e.target.value)}
                  className="h-11 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
                >
                  <option value="">Escolha a máquina…</option>
                  {machines.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.code} · {m.type.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Data
                <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} className="h-11 font-normal" />
              </label>
              <label className="flex flex-col gap-1.5 text-sm font-semibold">
                Horímetro (h)
                <Input
                  inputMode="numeric"
                  value={hourMeter}
                  placeholder={machine?.hourMeter?.toString() ?? ''}
                  onChange={(e) => setHourMeter(e.target.value)}
                  className="h-11 font-normal"
                />
              </label>
            </div>

            <div role="radiogroup" aria-label="Tipo de manutenção" className="flex flex-wrap gap-3">
              {MAINTENANCE_KINDS.map((option) => (
                <label
                  key={option}
                  className={`flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                    kind === option ? 'border-2 border-primary bg-primary/10' : 'border-input'
                  }`}
                >
                  <input
                    type="radio"
                    name="kind"
                    checked={kind === option}
                    onChange={() => setKind(option)}
                    className="size-4 accent-primary"
                  />
                  {MAINTENANCE_KIND_LABELS[option]} {option === 'PREVENTIVE' ? '(revisão programada)' : '(algo quebrou)'}
                </label>
              ))}
            </div>

            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              O que aconteceu e como foi resolvido
              <textarea
                rows={3}
                maxLength={2000}
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                className="rounded-lg border border-input bg-transparent px-3 py-2 text-base font-normal"
              />
            </label>

            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={blocksMachine} onChange={(e) => setBlocksMachine(e.target.checked)} className="size-4 accent-primary" />
              Bloquear a máquina na agenda até terminar
            </label>
          </section>

          <section className="flex flex-col gap-3 rounded-xl border border-border bg-card p-5">
            <div className="flex items-center">
              <h2 className="text-base font-semibold">Peças e serviços</h2>
              {editable && (
                <Button type="button" variant="outline" className="ml-auto h-10" onClick={() => setLines((all) => [...all, emptyLine()])}>
                  <Plus aria-hidden="true" className="size-4" />
                  Adicionar linha
                </Button>
              )}
            </div>
            <div className="overflow-x-auto">
              <div className="grid min-w-140 grid-cols-[3fr_1fr_1.4fr_1.4fr_2.75rem] items-center gap-2 text-sm">
                <span className="font-semibold text-muted-foreground">Peça ou serviço</span>
                <span className="font-semibold text-muted-foreground">Qtd</span>
                <span className="font-semibold text-muted-foreground">Valor unitário</span>
                <span className="text-right font-semibold text-muted-foreground">Subtotal</span>
                <span />
                {lines.map((line, index) => (
                  <div key={index} className="contents">
                    <Input aria-label={`Peça ${index + 1}`} value={line.description} maxLength={200} onChange={(e) => updateLine(index, 'description', e.target.value)} className="h-10" />
                    <Input aria-label={`Quantidade ${index + 1}`} inputMode="decimal" value={line.quantity} onChange={(e) => updateLine(index, 'quantity', e.target.value)} className="h-10" />
                    <Input aria-label={`Valor unitário ${index + 1}`} inputMode="decimal" placeholder="R$" value={line.unitPrice} onChange={(e) => updateLine(index, 'unitPrice', e.target.value)} className="h-10" />
                    <strong className="text-right">{money.format(num(line.quantity) * num(line.unitPrice))}</strong>
                    <button
                      type="button"
                      onClick={() => setLines((all) => (all.length > 1 ? all.filter((_, i) => i !== index) : [emptyLine()]))}
                      aria-label={`Remover linha ${index + 1}`}
                      className="grid size-10 place-items-center rounded-md border border-input hover:bg-accent"
                    >
                      <Trash2 aria-hidden="true" className="size-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </section>
        </fieldset>

        <aside aria-label="Pagamento" className="flex grow basis-72 flex-col gap-4 lg:max-w-90">
          <section className="flex flex-col gap-1 rounded-xl bg-sidebar p-5 text-white">
            <span className="text-sm text-zinc-400">Total da manutenção</span>
            <strong className="text-3xl">{money.format(total)}</strong>
            <span className="text-sm text-zinc-400">
              {filledLines.length} {filledLines.length === 1 ? 'item' : 'itens'}
            </span>
          </section>

          <fieldset disabled={!editable || busy} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
            <h2 className="text-base font-semibold">Pagamento</h2>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Oficina ou fornecedor
              <Input value={supplier} maxLength={200} onChange={(e) => setSupplier(e.target.value)} className="h-11 font-normal" />
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Forma de pagamento
              <select
                value={paymentMethod}
                onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
              >
                <option value="">Não informada</option>
                {PAYMENT_METHODS.map((p) => (
                  <option key={p} value={p}>
                    {PAYMENT_LABELS[p]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Vencimento
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className="h-11 font-normal" />
            </label>
            <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
              <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-4 accent-primary" />
              Já foi pago
            </label>
            <label className="flex cursor-pointer items-start gap-3 rounded-lg bg-info/10 p-3 text-sm">
              <input type="checkbox" checked={sendToFinance} onChange={(e) => setSendToFinance(e.target.checked)} className="mt-0.5 size-4 accent-primary" />
              <span>
                <strong>Lançar no financeiro</strong>
                <br />
                <span className="text-muted-foreground">Entra como despesa da máquina e aparece na rentabilidade dela.</span>
              </span>
            </label>
          </fieldset>

          {canEdit && status === 'OPEN' && (
            <div className="flex flex-col gap-2">
              <Button type="submit" size="lg" disabled={busy} className="h-12 text-base font-bold">
                {busy && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
                Salvar manutenção
              </Button>
              {isEdit && (
                <Button type="button" variant="outline" disabled={busy} className="h-11" onClick={() => void handleFinish()}>
                  <CheckCircle2 aria-hidden="true" className="size-4" />
                  Concluir manutenção
                </Button>
              )}
            </div>
          )}
          <p className="text-xs text-muted-foreground">O anexo da nota fiscal entra numa próxima etapa.</p>
        </aside>
      </div>
    </form>
  )
}