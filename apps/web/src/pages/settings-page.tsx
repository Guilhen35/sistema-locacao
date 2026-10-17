import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Check, Copy, Plus, ShieldCheck } from 'lucide-react'
import { roleLabel, userCreateSchema } from '@locacao/shared'
import { useAuth } from '@/auth/auth-context'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { brand } from '@/config/brand'
import { ApiError, apiFetch } from '@/lib/api'

interface Role {
  id: string
  name: string
  description: string | null
}

interface UserRow {
  id: string
  name: string
  email: string
  isActive: boolean
  mustChangePassword: boolean
  mfaEnabled: boolean
  lastLoginAt: string | null
  lockedUntil: string | null
  role: { id: string; name: string }
}

const SECTIONS = [
  { id: 'empresa', label: 'Dados da empresa', ready: false },
  { id: 'usuarios', label: 'Usuários', ready: true },
  { id: 'perfis', label: 'Perfis e permissões', ready: false },
  { id: 'historico', label: 'Histórico (auditoria)', ready: false },
  { id: 'contrato', label: 'Modelo de contrato', ready: false },
] as const

const dateTime = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' })

function status(user: UserRow): { text: string; style: string } {
  if (!user.isActive) return { text: 'Bloqueado', style: 'text-muted-foreground' }
  if (user.lockedUntil && new Date(user.lockedUntil) > new Date()) return { text: 'Travado por senha errada', style: 'text-destructive' }
  if (user.mustChangePassword) return { text: 'Precisa trocar a senha', style: 'text-warning' }
  return { text: 'Ativo', style: 'text-success' }
}

// Mostra a senha temporária uma única vez; some ao fechar
function TempPassword({ who, password, onClose }: { who: string; password: string; onClose: () => void }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    try {
      await navigator.clipboard.writeText(password)
      setCopied(true)
    } catch {
      setCopied(false)
    }
  }
  return (
    <div role="status" className="flex flex-col gap-2 rounded-xl border border-success/40 bg-success/10 p-4 text-sm">
      <strong className="text-success">Senha temporária de {who}</strong>
      <div className="flex flex-wrap items-center gap-2">
        <code className="min-w-0 flex-1 rounded-lg bg-card px-3 py-2 text-base tracking-wide select-all">{password}</code>
        <button type="button" onClick={copy} className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-success px-3 font-semibold text-success">
          {copied ? <Check aria-hidden="true" className="size-4" /> : <Copy aria-hidden="true" className="size-4" />}
          {copied ? 'Copiada' : 'Copiar'}
        </button>
        <button type="button" onClick={onClose} className="min-h-10 px-3 underline-offset-4 hover:underline">
          Fechar
        </button>
      </div>
      <p className="text-success">
        Aparece só agora. Entregue pessoalmente (não mande por e-mail ou grupo). No primeiro acesso a pessoa cria a própria senha.
      </p>
    </div>
  )
}

function UsersSection() {
  const { user: me } = useAuth()
  const [users, setUsers] = useState<UserRow[] | null>(null)
  const [roles, setRoles] = useState<Role[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [adding, setAdding] = useState(false)
  const [form, setForm] = useState({ name: '', email: '', roleId: '' })
  const [formErrors, setFormErrors] = useState<Record<string, string>>({})
  const [secret, setSecret] = useState<{ who: string; password: string } | null>(null)

  const load = useCallback(() => {
    apiFetch<UserRow[]>('/users')
      .then(setUsers)
      .catch((err: unknown) => setError(err instanceof ApiError ? err.message : 'Não foi possível carregar os usuários.'))
  }, [])

  useEffect(() => {
    load()
    apiFetch<Role[]>('/users/roles')
      .then((r) => {
        setRoles(r)
        setForm((f) => ({ ...f, roleId: f.roleId || (r.find((x) => x.name === 'equipe') ?? r[0])?.id || '' }))
      })
      .catch(() => setRoles([]))
  }, [load])

  async function act(fn: () => Promise<void>) {
    setBusy(true)
    setError(null)
    try {
      await fn()
      load()
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Não foi possível concluir a operação.')
    } finally {
      setBusy(false)
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const result = userCreateSchema.safeParse(form)
    if (!result.success) {
      const next: Record<string, string> = {}
      for (const issue of result.error.issues) next[String(issue.path[0])] ??= issue.message
      setFormErrors(next)
      return
    }
    setFormErrors({})
    await act(async () => {
      try {
        const r = await apiFetch<{ user: UserRow; tempPassword: string }>('/users', { method: 'POST', body: JSON.stringify(result.data) })
        setSecret({ who: r.user.name, password: r.tempPassword })
        setForm((f) => ({ ...f, name: '', email: '' }))
        setAdding(false)
      } catch (err) {
        if (err instanceof ApiError && err.fieldErrors) {
          setFormErrors(Object.fromEntries(Object.entries(err.fieldErrors).map(([k, v]) => [k, v[0] ?? ''])))
        }
        throw err
      }
    })
  }

  const changeRole = (u: UserRow, roleId: string) => {
    const role = roles.find((r) => r.id === roleId)
    if (!role || !window.confirm(`Mudar ${u.name} para ${roleLabel(role.name)}? A pessoa será desconectada para valer na hora.`)) return
    void act(async () => {
      await apiFetch(`/users/${u.id}`, { method: 'PATCH', body: JSON.stringify({ name: u.name, roleId }) })
    })
  }

  const resetPassword = (u: UserRow) => {
    if (!window.confirm(`Gerar uma nova senha temporária para ${u.name}? A senha atual deixa de funcionar e a pessoa é desconectada.`)) return
    void act(async () => {
      const r = await apiFetch<{ tempPassword: string }>(`/users/${u.id}/reset-password`, { method: 'POST' })
      setSecret({ who: u.name, password: r.tempPassword })
    })
  }

  const toggleBlock = (u: UserRow) => {
    const action = u.isActive ? 'block' : 'unblock'
    if (u.isActive && !window.confirm(`Bloquear ${u.name}? A pessoa é desconectada na hora e não consegue mais entrar.`)) return
    void act(async () => {
      await apiFetch(`/users/${u.id}/${action}`, { method: 'POST' })
    })
  }

  const field = (name: keyof typeof form) =>
    formErrors[name] ? (
      <span id={`${name}-error`} className="text-xs font-normal text-destructive">
        {formErrors[name]}
      </span>
    ) : null

  return (
    <section className="flex min-w-0 flex-1 flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div>
          <h2 className="text-xl font-bold">Usuários</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {users ? `${users.length} ${users.length === 1 ? 'pessoa' : 'pessoas'} com acesso` : 'Carregando…'}
          </p>
        </div>
        {!adding && (
          <button
            type="button"
            onClick={() => setAdding(true)}
            className="ml-auto inline-flex min-h-11 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-primary-foreground"
          >
            <Plus aria-hidden="true" className="size-4" /> Adicionar usuário
          </button>
        )}
      </div>

      {error && (
        <p role="alert" className="rounded-lg border border-destructive/40 bg-destructive/10 px-4 py-3 text-sm text-destructive">
          {error}
        </p>
      )}

      {secret && <TempPassword who={secret.who} password={secret.password} onClose={() => setSecret(null)} />}

      {adding && (
        <form noValidate onSubmit={handleCreate} className="flex flex-col gap-4 rounded-xl border border-border bg-card p-5">
          <h3 className="font-bold">Novo usuário</h3>
          <fieldset disabled={busy} className="grid gap-3 sm:grid-cols-[1fr_1fr_12rem]">
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Nome
              <Input
                value={form.name}
                maxLength={100}
                autoComplete="off"
                aria-invalid={Boolean(formErrors.name)}
                aria-describedby={formErrors.name ? 'name-error' : undefined}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className="h-11 font-normal"
              />
              {field('name')}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              E-mail
              <Input
                type="email"
                value={form.email}
                maxLength={200}
                autoComplete="off"
                aria-invalid={Boolean(formErrors.email)}
                aria-describedby={formErrors.email ? 'email-error' : undefined}
                onChange={(e) => setForm({ ...form, email: e.target.value })}
                className="h-11 font-normal"
              />
              {field('email')}
            </label>
            <label className="flex flex-col gap-1.5 text-sm font-semibold">
              Perfil
              <select
                value={form.roleId}
                onChange={(e) => setForm({ ...form, roleId: e.target.value })}
                className="h-11 rounded-lg border border-input bg-transparent px-2 text-base font-normal"
              >
                {roles.map((r) => (
                  <option key={r.id} value={r.id}>
                    {roleLabel(r.name)}
                  </option>
                ))}
              </select>
              {field('roleId')}
            </label>
          </fieldset>
          <p className="text-xs text-muted-foreground">
            Equipe: acesso a tudo, menos usuários e histórico. O sistema gera uma senha temporária para o primeiro acesso.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={busy} className="min-h-11 px-5 font-bold">
              {busy ? 'Criando…' : 'Criar usuário'}
            </Button>
            <button type="button" onClick={() => setAdding(false)} className="min-h-11 px-4 text-sm underline-offset-4 hover:underline">
              Cancelar
            </button>
          </div>
        </form>
      )}

      <div className="overflow-x-auto rounded-xl border border-border bg-card">
        <table className="w-full min-w-190 text-sm">
          <thead className="bg-muted/50 text-left text-xs text-muted-foreground">
            <tr>
              <th scope="col" className="px-4 py-3">Nome</th>
              <th scope="col" className="px-4 py-3">Perfil</th>
              <th scope="col" className="px-4 py-3">Situação</th>
              <th scope="col" className="px-4 py-3">Último acesso</th>
              <th scope="col" className="px-4 py-3">
                <span className="sr-only">Ações</span>
              </th>
            </tr>
          </thead>
          <tbody>
            {users?.map((u) => {
              const isMe = u.id === me?.id
              const st = status(u)
              return (
                <tr key={u.id} className="border-t border-border">
                  <td className="px-4 py-3">
                    <strong className="block">{u.name}</strong>
                    <span className="text-xs text-muted-foreground">
                      {u.email}
                      {isMe && ' · você'}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {isMe ? (
                      <span className="rounded-full bg-foreground px-2.5 py-1 text-xs font-semibold text-background">{roleLabel(u.role.name)}</span>
                    ) : (
                      <select
                        aria-label={`Perfil de ${u.name}`}
                        value={u.role.id}
                        disabled={busy}
                        onChange={(e) => changeRole(u, e.target.value)}
                        className="h-9 rounded-lg border border-input bg-card px-2 text-sm"
                      >
                        {roles.map((r) => (
                          <option key={r.id} value={r.id}>
                            {roleLabel(r.name)}
                          </option>
                        ))}
                      </select>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <span className={`font-semibold ${st.style}`}>{st.text}</span>
                    {u.mfaEnabled && (
                      <span className="ml-2 inline-flex items-center gap-1 text-xs text-muted-foreground">
                        <ShieldCheck aria-hidden="true" className="size-3.5" /> 2 etapas
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3 whitespace-nowrap">{u.lastLoginAt ? dateTime.format(new Date(u.lastLoginAt)) : 'Nunca entrou'}</td>
                  <td className="px-4 py-3 text-right whitespace-nowrap">
                    {!isMe && (
                      <>
                        {u.isActive && (
                          <button
                            type="button"
                            disabled={busy}
                            onClick={() => resetPassword(u)}
                            className="min-h-9 rounded-lg border border-input bg-card px-3 text-sm hover:bg-accent"
                          >
                            Redefinir senha
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => toggleBlock(u)}
                          className={`ml-1 min-h-9 rounded-lg px-3 text-sm underline-offset-4 hover:underline ${u.isActive ? 'text-destructive' : 'font-semibold'}`}
                        >
                          {u.isActive ? 'Bloquear' : 'Desbloquear'}
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
      <p className="rounded-lg bg-info/10 px-4 py-3 text-sm text-info">
        Ao bloquear, redefinir a senha ou mudar o perfil, a pessoa é desconectada na hora em todos os aparelhos.
      </p>
    </section>
  )
}

export function SettingsPage() {
  const { user } = useAuth()
  const canManage = user?.permissions.includes('usuarios:gerenciar') ?? false

  useEffect(() => {
    document.title = `Configurações · ${brand.name}`
  }, [])

  return (
    <section className="flex flex-col gap-5">
      <h1 className="text-2xl font-bold">Configurações</h1>
      <div className="flex flex-wrap items-start gap-5">
        <nav aria-label="Seções das configurações" className="flex w-full flex-col gap-1 text-sm sm:w-52">
          {SECTIONS.map((s) =>
            s.ready ? (
              <span key={s.id} aria-current="page" className="rounded-lg border border-border bg-card px-3.5 py-2.5 font-bold">
                {s.label}
              </span>
            ) : (
              <span key={s.id} className="flex items-center justify-between px-3.5 py-2.5 text-muted-foreground">
                {s.label}
                <span className="text-[11px]">em breve</span>
              </span>
            ),
          )}
        </nav>
        {canManage ? (
          <UsersSection />
        ) : (
          <p className="flex-1 rounded-xl border border-border bg-card px-5 py-6 text-sm text-muted-foreground">
            Só o administrador gerencia usuários. Para trocar a sua senha, use “Meu perfil”.
          </p>
        )}
      </div>
    </section>
  )
}