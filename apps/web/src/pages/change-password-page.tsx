import { useEffect, useState, type FormEvent } from 'react'
import { Check, LoaderCircle, X } from 'lucide-react'
import { changePasswordSchema, PASSWORD_MIN_LENGTH } from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'
import logo from '@/assets/brand/logo.png'
import background from '@/assets/brand/login-fundo.jpg'

type Field = 'currentPassword' | 'newPassword' | 'confirmPassword'
type Errors = Partial<Record<Field, string>>
const FIELDS: Field[] = ['currentPassword', 'newPassword', 'confirmPassword']

const LABELS: Record<Field, { label: string; autoComplete: string }> = {
  currentPassword: { label: 'Senha atual (a temporária)', autoComplete: 'current-password' },
  newPassword: { label: 'Senha nova', autoComplete: 'new-password' },
  confirmPassword: { label: 'Confirme a senha nova', autoComplete: 'new-password' },
}

function isField(value: unknown): value is Field {
  return typeof value === 'string' && (FIELDS as string[]).includes(value)
}

function Rule({ ok, children }: { ok: boolean; children: string }) {
  return (
    <li className={`flex items-center gap-2 ${ok ? 'text-success' : 'text-muted-foreground'}`}>
      {ok ? <Check aria-hidden="true" className="size-4" /> : <X aria-hidden="true" className="size-4" />}
      <span>
        {children}
        <span className="sr-only">{ok ? ': atendido' : ': pendente'}</span>
      </span>
    </li>
  )
}

export function ChangePasswordPage() {
  const { user, logout } = useAuth()
  const [values, setValues] = useState<Record<Field, string>>({
    currentPassword: '',
    newPassword: '',
    confirmPassword: '',
  })
  const [errors, setErrors] = useState<Errors>({})
  const [formError, setFormError] = useState<string | null>(null)
  const [showPasswords, setShowPasswords] = useState(false)
  const [submitting, setSubmitting] = useState(false)

  useEffect(() => {
    document.title = `Trocar senha · ${brand.name}`
  }, [])

  const { newPassword, confirmPassword } = values

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (submitting) return

    const result = changePasswordSchema.safeParse(values)
    if (!result.success) {
      const next: Errors = {}
      for (const issue of result.error.issues) {
        const key = issue.path[0]
        if (isField(key) && !next[key]) next[key] = issue.message
      }
      setErrors(next)
      return
    }

    setErrors({})
    setFormError(null)
    setSubmitting(true)

    try {
      await apiFetch('/auth/change-password', { method: 'POST', body: JSON.stringify(result.data) })
      // Recarrega para buscar o usuário atualizado na API
      window.location.replace('/')
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 401) {
          window.location.replace('/login')
          return
        }
        const next: Errors = {}
        for (const field of FIELDS) {
          const message = error.fieldErrors[field]?.[0]
          if (message) next[field] = message
        }
        setErrors(next)
        if (Object.keys(next).length === 0) setFormError(error.message)
      } else {
        setFormError('Não foi possível trocar a senha. Tente novamente.')
      }
      setSubmitting(false)
    }
  }

  return (
    <div className="relative grid min-h-svh place-items-center overflow-hidden bg-sidebar px-6 py-10">
      <img
        src={background}
        alt=""
        className="absolute inset-0 size-full object-cover object-[20%_center] opacity-95"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-black/55" />

      <main className="relative flex w-full max-w-110 flex-col items-center gap-8">
        <img src={logo} alt={`${brand.name} ${brand.tagline}`} className="h-auto w-40" />

        <form
          noValidate
          onSubmit={handleSubmit}
          aria-busy={submitting}
          className="flex w-full flex-col gap-5 rounded-2xl bg-card p-8 text-card-foreground shadow-2xl"
        >
          <div>
            <h1 className="text-2xl font-bold">Crie sua senha</h1>
            <p className="mt-2 text-muted-foreground">
              Olá{user ? `, ${user.name.split(' ')[0]}` : ''}! Antes de continuar, troque a senha temporária por
              uma só sua.
            </p>
          </div>

          {formError && (
            <p
              role="alert"
              className="rounded-lg border border-destructive/40 bg-destructive/10 px-3 py-2.5 text-sm text-destructive"
            >
              {formError}
            </p>
          )}

          {FIELDS.map((field) => (
            <div key={field} className="flex flex-col gap-1.5">
              <label htmlFor={field} className="text-sm font-semibold">
                {LABELS[field].label}
              </label>
              <Input
                id={field}
                name={field}
                type={showPasswords ? 'text' : 'password'}
                autoComplete={LABELS[field].autoComplete}
                value={values[field]}
                onChange={(e) => setValues((v) => ({ ...v, [field]: e.target.value }))}
                aria-invalid={errors[field] ? true : undefined}
                aria-describedby={
                  errors[field] ? `${field}-error` : field === 'newPassword' ? 'password-rules' : undefined
                }
                className="h-11 text-base"
              />
              {errors[field] && (
                <p id={`${field}-error`} className="text-sm text-destructive">
                  {errors[field]}
                </p>
              )}
              {field === 'newPassword' && (
                <ul id="password-rules" className="mt-1 flex flex-col gap-1 text-sm">
                  <Rule ok={newPassword.length >= PASSWORD_MIN_LENGTH}>
                    {`Pelo menos ${PASSWORD_MIN_LENGTH} caracteres`}
                  </Rule>
                  <Rule ok={new Set(newPassword).size >= 5}>Caracteres variados</Rule>
                  <Rule ok={/[A-Z]/.test(newPassword)}>Uma letra maiúscula</Rule>
                  <Rule ok={/[^A-Za-z0-9]/.test(newPassword)}>Um caractere especial</Rule>
                </ul>
              )}
              {field === 'confirmPassword' && confirmPassword.length > 0 && (
                <ul className="mt-1 text-sm">
                  <Rule ok={confirmPassword === newPassword}>As duas senhas são iguais</Rule>
                </ul>
              )}
            </div>
          ))}

          <label className="flex min-h-11 cursor-pointer items-center gap-3 text-sm">
            <input
              type="checkbox"
              checked={showPasswords}
              onChange={(e) => setShowPasswords(e.target.checked)}
              className="size-4 accent-primary"
            />
            Mostrar senhas
          </label>

          <Button type="submit" size="lg" disabled={submitting} className="h-12 text-base font-bold">
            {submitting && <LoaderCircle aria-hidden="true" className="size-5 animate-spin" />}
            {submitting ? 'Salvando…' : 'Salvar e continuar'}
          </Button>

          <button
            type="button"
            onClick={() => void logout()}
            className="min-h-11 text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            Sair e fazer isso depois
          </button>
        </form>
      </main>
    </div>
  )
}