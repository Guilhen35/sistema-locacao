import { z } from 'zod';

export const loginSchema = z.object({
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(254, { error: 'E-mail muito longo' })
    .pipe(z.email({ error: 'Informe um e-mail válido' })),
  // No login não exigimos regras de força: isso fica no cadastro e na troca de senha
  password: z
    .string()
    .min(1, { error: 'Informe a senha' })
    .max(200, { error: 'Senha muito longa' }),
});

export type LoginInput = z.infer<typeof loginSchema>;
