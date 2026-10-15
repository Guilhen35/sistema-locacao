import { z } from 'zod';
import { isValidCnpj, isValidCpf, normalizeDocument, onlyDigits } from './document.js';

export const CLIENT_TYPES = ['INDIVIDUAL', 'COMPANY'] as const;
export type ClientType = (typeof CLIENT_TYPES)[number];

export const UFS = [
  'AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA',
  'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO',
] as const;

// Texto opcional: vazio vira undefined
function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres` })
    .transform((value) => value || undefined)
    .optional();
}

// Número opcional: guarda só os dígitos e confere o formato
function optionalDigits(pattern: RegExp, message: string) {
  return z
    .string()
    .transform((value) => onlyDigits(value) || undefined)
    .pipe(z.string().regex(pattern, { error: message }).optional())
    .optional();
}

export const clientSchema = z
  .object({
    type: z.enum(CLIENT_TYPES, { error: 'Escolha o tipo de cliente' }),
    document: z.string().max(20, { error: 'Documento inválido' }).transform(normalizeDocument),
    name: z.string().trim().min(2, { error: 'Informe o nome' }).max(200, { error: 'Máximo de 200 caracteres' }),
    tradeName: optionalText(200),
    contactName: optionalText(200),
    contactDocument: optionalDigits(/^\d{11}$/, 'CPF incompleto'),
    phone: optionalDigits(/^\d{10,11}$/, 'Telefone com DDD: 10 ou 11 números'),
    whatsapp: z
      .string()
      .transform(onlyDigits)
      .pipe(z.string().regex(/^\d{10,11}$/, { error: 'WhatsApp com DDD: 10 ou 11 números' })),
    email: optionalText(254).pipe(z.email({ error: 'E-mail inválido' }).optional()),
    zipCode: optionalDigits(/^\d{8}$/, 'CEP com 8 números'),
    street: optionalText(200),
    number: optionalText(20),
    district: optionalText(100),
    city: optionalText(100),
    state: z
      .string()
      .transform((value) => value.trim().toUpperCase() || undefined)
      .pipe(z.enum(UFS, { error: 'UF inválida' }).optional())
      .optional(),
    notes: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    if (data.type === 'INDIVIDUAL' && !isValidCpf(data.document)) {
      ctx.addIssue({ code: 'custom', path: ['document'], message: 'CPF inválido' });
    }
    if (data.type === 'COMPANY') {
      if (!isValidCnpj(data.document)) ctx.addIssue({ code: 'custom', path: ['document'], message: 'CNPJ inválido' });
      if (!data.contactName) ctx.addIssue({ code: 'custom', path: ['contactName'], message: 'Informe o responsável' });
    }
    if (typeof data.contactDocument === 'string' && data.contactDocument && !isValidCpf(data.contactDocument)) {
      ctx.addIssue({ code: 'custom', path: ['contactDocument'], message: 'CPF do responsável inválido' });
    }
  }, {
    // Roda mesmo com erro em outros campos, para mostrar todos os problemas de uma vez
    // Só roda se tipo e documento forem texto: dado malformado nunca derruba a validação
    when: ({ value }) => {
      const v = value as Record<string, unknown> | null;
      return typeof v?.['type'] === 'string' && typeof v['document'] === 'string';
    },
  });

export type ClientInput = z.input<typeof clientSchema>;
export type ClientData = z.output<typeof clientSchema>;