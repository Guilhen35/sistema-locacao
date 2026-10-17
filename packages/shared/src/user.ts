import { z } from 'zod';

export const ROLE_LABELS: Record<string, string> = {
  admin: 'Administrador',
  equipe: 'Equipe',
};

export const roleLabel = (name: string) => ROLE_LABELS[name] ?? name;

const name = z
  .string({ error: 'Informe o nome' })
  .trim()
  .min(2, { error: 'Nome muito curto' })
  .max(100, { error: 'Máximo de 100 caracteres' });

const roleId = z.uuid({ error: 'Escolha o perfil' });

export const userCreateSchema = z.object({
  name,
  email: z
    .string({ error: 'Informe o e-mail' })
    .trim()
    .toLowerCase()
    .max(200, { error: 'E-mail muito longo' })
    .pipe(z.email({ error: 'E-mail inválido' })),
  roleId,
});

export const userUpdateSchema = z.object({ name, roleId });

export type UserCreateInput = z.input<typeof userCreateSchema>;
export type UserCreateData = z.output<typeof userCreateSchema>;
export type UserUpdateData = z.output<typeof userUpdateSchema>;