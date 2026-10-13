import { useEffect, useState, type FormEvent } from 'react';
import { Eye, EyeOff } from 'lucide-react';
import { loginSchema } from '@locacao/shared';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { brand } from '@/config/brand';
import logo from '@/assets/brand/logo.png';
import background from '@/assets/brand/login-fundo.jpg';

type Field = 'email' | 'password';
type FieldErrors = Partial<Record<Field, string>>;

export function LoginPage() {
  const [showPassword, setShowPassword] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});

  useEffect(() => {
    document.title = `Entrar · ${brand.name}`;
  }, []);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const result = loginSchema.safeParse({
      email: String(form.get('email') ?? ''),
      password: String(form.get('password') ?? ''),
    });

    if (!result.success) {
      const next: FieldErrors = {};
      for (const issue of result.error.issues) {
        const key = issue.path[0];
        if ((key === 'email' || key === 'password') && !next[key]) next[key] = issue.message;
      }
      setErrors(next);
      return;
    }

    setErrors({});
    // Próximo passo: enviar result.data para a API
  }

  return (
    <div className="relative min-h-svh overflow-hidden bg-sidebar">
      <img
        src={background}
        alt=""
        className="absolute inset-0 size-full object-cover object-[20%_center] opacity-95"
      />
      <div aria-hidden="true" className="absolute inset-0 bg-linear-to-r from-black/25 via-black/40 to-black/65" />

      <div className="relative flex min-h-svh flex-wrap">
        <section className="flex grow basis-120 flex-col justify-between gap-12 px-8 py-10 text-white lg:px-16 lg:py-14">
          <img src={logo} alt={`${brand.name} ${brand.tagline}`} className="h-auto w-44" />
          <div className="flex max-w-md flex-col gap-4">
            <p className="text-4xl leading-tight font-bold">
              Mais altura.
              <br />
              Mais segurança.
              <br />
              <span className="text-primary">Mais resultados.</span>
            </p>
            <p className="text-base text-zinc-300">Frota, contratos, agenda e financeiro em um só lugar.</p>
          </div>
          <p className="text-sm text-zinc-400">Acesso restrito à equipe autorizada.</p>
        </section>

        <main className="flex grow basis-120 items-center justify-center px-6 py-10 lg:px-8 lg:py-14">
          <form
            noValidate
            onSubmit={handleSubmit}
            className="flex w-full max-w-100 flex-col gap-5 rounded-2xl bg-card p-8 text-card-foreground shadow-2xl"
          >
            <div>
              <h1 className="text-2xl font-bold">Entrar no sistema</h1>
              <p className="mt-2 text-muted-foreground">Use o e-mail e a senha da sua conta.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="email" className="text-sm font-semibold">
                E-mail
              </label>
              <Input
                id="email"
                name="email"
                type="email"
                autoComplete="username"
                placeholder="nome@empresa.com.br"
                aria-invalid={errors.email ? true : undefined}
                aria-describedby={errors.email ? 'email-error' : undefined}
                className="h-11 text-base"
              />
              {errors.email && (
                <p id="email-error" className="text-sm text-destructive">
                  {errors.email}
                </p>
              )}
            </div>

            <div className="flex flex-col gap-1.5">
              <label htmlFor="password" className="text-sm font-semibold">
                Senha
              </label>
              <div className="relative">
                <Input
                  id="password"
                  name="password"
                  type={showPassword ? 'text' : 'password'}
                  autoComplete="current-password"
                  aria-invalid={errors.password ? true : undefined}
                  aria-describedby={errors.password ? 'password-error' : undefined}
                  className="h-11 pr-12 text-base"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((v) => !v)}
                  aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  aria-pressed={showPassword}
                  className="absolute top-1/2 right-0.5 grid size-11 -translate-y-1/2 place-items-center rounded-md text-muted-foreground hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none"
                >
                  {showPassword ? <EyeOff className="size-5" /> : <Eye className="size-5" />}
                </button>
              </div>
              {errors.password && (
                <p id="password-error" className="text-sm text-destructive">
                  {errors.password}
                </p>
              )}
            </div>

            <Button type="submit" size="lg" className="h-12 text-base font-bold">
              Entrar
            </Button>

            <p className="text-center text-sm text-muted-foreground">
              Sem acesso ou esqueceu a senha? Fale com um administrador.
            </p>
          </form>
        </main>
      </div>
    </div>
  );
}