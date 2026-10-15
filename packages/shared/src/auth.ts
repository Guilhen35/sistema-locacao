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

export const PASSWORD_MIN_LENGTH = 8;
const OBVIOUS_PARTS = ['senha', 'password', '123456', 'qwerty', 'abcdef', 'luma', 'admin'];

export const newPasswordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, { error: `Use pelo menos ${PASSWORD_MIN_LENGTH} caracteres` })
  .regex(/[A-Z]/, { error: 'Use pelo menos uma letra maiúscula' })
  .regex(/[^A-Za-z0-9]/, { error: 'Use pelo menos um caractere especial (ex.: ! @ # -)' })
  .max(200, { error: 'Senha muito longa' })
  .refine((value) => !OBVIOUS_PARTS.some((part) => value.toLowerCase().includes(part)), {
    error: 'Evite partes óbvias como "senha", "123456" ou o nome da empresa',
  })
  .refine((value) => new Set(value).size >= 5, { error: 'Use caracteres mais variados' });

export const changePasswordSchema = z
  .object({
    currentPassword: z
      .string()
      .min(1, { error: 'Informe a senha atual' })
      .max(200, { error: 'Senha muito longa' }),
    newPassword: newPasswordSchema,
    confirmPassword: z.string().max(200, { error: 'Senha muito longa' }),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    error: 'As senhas não conferem',
    path: ['confirmPassword'],
  })
  .refine((data) => data.newPassword !== data.currentPassword, {
    error: 'A senha nova precisa ser diferente da atual',
    path: ['newPassword'],
  });

export type ChangePasswordInput = z.infer<typeof changePasswordSchema>;
