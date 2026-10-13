import { BadRequestException } from '@nestjs/common';
import { loginSchema } from '@locacao/shared';
import { describe, expect, it } from 'vitest';
import { ZodValidationPipe } from './zod-validation.pipe.js';

const pipe = new ZodValidationPipe(loginSchema);

function captureError(value: unknown): BadRequestException {
  try {
    pipe.transform(value);
  } catch (error) {
    if (error instanceof BadRequestException) return error;
    throw error;
  }
  throw new Error('Era esperado que o pipe rejeitasse o valor');
}

describe('ZodValidationPipe com loginSchema', () => {
  it('aceita dados válidos e normaliza o e-mail', () => {
    const result = pipe.transform({ email: '  Henrique@Exemplo.COM ', password: 'qualquer' });
    expect(result).toEqual({ email: 'henrique@exemplo.com', password: 'qualquer' });
  });

  it('rejeita e-mail inválido', () => {
    const error = captureError({ email: 'nao-e-email', password: 'x' });
    expect(error.getStatus()).toBe(400);
  });

  it('rejeita senha vazia', () => {
    expect(() => pipe.transform({ email: 'a@exemplo.com', password: '' })).toThrow(BadRequestException);
  });

  it('rejeita senha gigante (proteção contra DoS no hash)', () => {
    const password = 'a'.repeat(201);
    expect(() => pipe.transform({ email: 'a@exemplo.com', password })).toThrow(BadRequestException);
  });

  it('rejeita tipos errados (ex.: tentativa de NoSQL injection)', () => {
    expect(() => pipe.transform({ email: { $ne: '' }, password: { $ne: '' } })).toThrow(BadRequestException);
  });

  it('rejeita body vazio ou não-objeto', () => {
    expect(() => pipe.transform(undefined)).toThrow(BadRequestException);
    expect(() => pipe.transform('texto')).toThrow(BadRequestException);
  });

  it('remove campos extras (proteção contra mass assignment)', () => {
    const result = pipe.transform({ email: 'a@exemplo.com', password: 'x', role: 'admin', isActive: true });
    expect(result).not.toHaveProperty('role');
    expect(result).not.toHaveProperty('isActive');
  });

  it('não devolve a senha enviada na resposta de erro', () => {
    const secret = 'SenhaFicticia#123';
    const error = captureError({ email: 'invalido', password: secret });
    expect(JSON.stringify(error.getResponse())).not.toContain(secret);
  });
});
