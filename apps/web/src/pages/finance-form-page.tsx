import { useEffect, useState, type FormEvent } from 'react'
import { Link, useNavigate } from 'react-router'
import {
  ENTRY_KIND_LABELS,
  ENTRY_KINDS,
  PAYMENT_LABELS,
  PAYMENT_METHODS,
  entrySchema,
  type EntryKind,
  type PaymentMethod,
} from '@locacao/shared'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

const localToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date())

export function FinanceFormPage() {
  const navigate = useNavigate()
  const [kind, setKind] = useState<EntryKind>('PAYABLE')
  const [description, setDescription] = useState('')
  const [supplier, setSupplier] = useState('')
  const [dueDate, setDueDate] = useState(localToday)
  const [amount, setAmount] = useState('')
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod | ''>('PIX')
  const [paid, setPaid] = useState(false)
  const [notes, setNotes] = useState('')
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [message, setMessage] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    document.title = `Novo lançamento · ${brand.name}`
  }, [])

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (busy) return

    const result = entrySchema.safeParse({ kind, description, supplier, dueDate, amount, paymentMethod, paid, notes })
    if (!result.success) {
      const next: Record<string, string> = {}
      for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message
      setErrors(next)
      setMessage('Confira os campos destacados.')
      return
    }

    setErrors({})
    setMessage(null)
    setBusy(true)
    try {
      await apiFetch('/finance/entries', { method: 'POST', body: JSON.stringify(result.data) })
      navigate('/financeiro', { replace: true })
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])))
      }
      setMessage(err instanceof ApiError ? err.message : 'Não foi possível salvar.')
      setBusy(false)
    }
  }

  const fieldError = (name: string) =>
    errors[name] ? (
      <span id={`${name}-error`} className="text-xs font-normal text-destructive">
        {errors[name]}
      </span>
    ) : null

  return (
    <form noValidate onSubmit={handleSubmit} aria-busy={busy} className="flex max-w-2xl flex-col gap-5">
      <div>
        <p className="text-sm text-muted-foreground">
          <Link to="/financeiro" className="underline-offset-4 hover:underline">
            Financeiro
          </Link>{' '}
          › Novo lançamento
        </p>
        <h1 className="mt-1 text-2xl font-bold">Novo lançamento</h1>
        <p className="mt-1 text-sm text-muted-foreground">
          Despesas e recebimentos avulsos. Parcelas de contrato e manutenções entram sozinhas.
        </p>
      </div>

      {message && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {message}
        </p>
      )}

      <fieldset disabled={busy} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
        <div role="radiogroup" aria-label="Tipo" className="flex flex-wrap gap-3">
          {ENTRY_KINDS.map((option) => (
            <label
              key={option}
              className={`flex min-h-11 flex-1 cursor-pointer items-center gap-3 rounded-lg border px-4 py-3 text-sm ${
                kind === option ? 'border-2 border-primary bg-primary/10' : 'border-input'
              }`}
            >
              <input type="radio" name="kind" checked={kind === option} onChange={() => setKind(option)} className="size-4" />
              <span className="font-semibold">{option === 'PAYABLE' ? 'Despesa (a pagar)' : 'Recebimento (a receber)'}</span>
            </label>
          ))}
        </div>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Descrição
          <Input
            value={description}
            maxLength={200}
            placeholder={kind === 'PAYABLE' ? 'Ex.: Conta de luz do galpão' : 'Ex.: Frete cobrado à parte'}
            aria-invalid={Boolean(errors.description)}
            aria-describedby={errors.description ? 'description-error' : undefined}
            onChange={(e) => setDescription(e.target.value)}
            className="h-11 font-normal"
          />
          {fieldError('description')}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          {kind === 'PAYABLE' ? 'Fornecedor' : 'Quem paga'} <span className="font-normal text-muted-foreground">(opcional)</span>
          <Input value={supplier} maxLength={200} onChange={(e) => setSupplier(e.target.value)} className="h-11 font-normal" />
          {fieldError('supplier')}
        </label>

        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Vencimento
            <Input
              type="date"
              value={dueDate}
              aria-invalid={Boolean(errors.dueDate)}
              onChange={(e) => setDueDate(e.target.value)}
              className="h-11 font-normal"
            />
            {fieldError('dueDate')}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Valor (R$)
            <Input
              inputMode="decimal"
              value={amount}
              placeholder="0,00"
              aria-invalid={Boolean(errors.amount)}
              aria-describedby={errors.amount ? 'amount-error' : undefined}
              onChange={(e) => setAmount(e.target.value)}
              className="h-11 font-normal"
            />
            {fieldError('amount')}
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Forma de pagamento
            <select
              value={paymentMethod}
              onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod | '')}
              className="h-11 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
            >
              <option value="">Não definida</option>
              {PAYMENT_METHODS.map((m) => (
                <option key={m} value={m}>
                  {PAYMENT_LABELS[m]}
                </option>
              ))}
            </select>
            {fieldError('paymentMethod')}
          </label>
        </div>

        <label className="flex min-h-11 items-center gap-3 text-sm">
          <input type="checkbox" checked={paid} onChange={(e) => setPaid(e.target.checked)} className="size-5" />
          Já foi {kind === 'PAYABLE' ? 'pago' : 'recebido'}
        </label>

        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Observações <span className="font-normal text-muted-foreground">(opcional)</span>
          <textarea
            value={notes}
            maxLength={1000}
            rows={3}
            onChange={(e) => setNotes(e.target.value)}
            className="rounded-lg border border-input bg-transparent px-3 py-2 text-base font-normal"
          />
        </label>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={busy} className="min-h-11 px-6 text-base font-bold">
          {busy ? 'Salvando…' : `Salvar ${ENTRY_KIND_LABELS[kind].toLowerCase()}`}
        </Button>
        <Link to="/financeiro" className="inline-flex min-h-11 items-center px-4 text-sm underline-offset-4 hover:underline">
          Cancelar
        </Link>
      </div>
    </form>
  )
}