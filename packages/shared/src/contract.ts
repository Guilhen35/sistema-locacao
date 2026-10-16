import { z } from 'zod';
import { UFS } from './client.js';
import { onlyDigits } from './document.js';
import { parseDecimal } from './machine.js';

export const CONTRACT_STATUSES = ['DRAFT', 'ACTIVE', 'FINISHED', 'CANCELLED'] as const;
export const PAYMENT_METHODS = ['PIX', 'BOLETO', 'CARD', 'CASH', 'TRANSFER'] as const;
export type ContractStatus = (typeof CONTRACT_STATUSES)[number];
export type PaymentMethod = (typeof PAYMENT_METHODS)[number];

export const CONTRACT_STATUS_LABELS: Record<ContractStatus, string> = {
  DRAFT: 'Rascunho',
  ACTIVE: 'Ativo',
  FINISHED: 'Encerrado',
  CANCELLED: 'Cancelado',
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  PIX: 'Pix',
  BOLETO: 'Boleto',
  CARD: 'Cartão',
  CASH: 'Dinheiro',
  TRANSFER: 'Transferência',
};

const MAX_RENTAL_DAYS = 730;
const DAY_MS = 86_400_000;

// Datas sempre como "AAAA-MM-DD", sem horário: evita erro de fuso
const isoDate = z
  .string({ error: 'Informe a data' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida' })
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, { error: 'Data inválida' });

// Diárias entre duas datas. O dia da devolução não conta (devolve de manhã)
export function rentalDays(startDate: string, endDate: string): number {
  return Math.round((Date.parse(`${endDate}T00:00:00Z`) - Date.parse(`${startDate}T00:00:00Z`)) / DAY_MS);
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres` })
    .transform((value) => value || undefined)
    .optional();
}

const contractItemSchema = z.object({
  machineId: z.uuid({ error: 'Escolha a máquina' }),
  // Vazio: a API usa a diária do tipo da máquina
  dailyRate: z.preprocess(
    parseDecimal,
    z
      .number({ error: 'Diária: informe um número' })
      .min(0.01, { error: 'Diária: mínimo R$ 0,01' })
      .max(1_000_000, { error: 'Diária muito alta' })
      .transform((n) => Math.round(n * 100) / 100)
      .optional(),
  ),
});

export const contractSchema = z
  .object({
    clientId: z.uuid({ error: 'Escolha o cliente' }),
    startDate: isoDate,
    endDate: isoDate,
    items: z
      .array(contractItemSchema, { error: 'Escolha pelo menos uma máquina' })
      .min(1, { error: 'Escolha pelo menos uma máquina' })
      .max(20, { error: 'Máximo de 20 máquinas por contrato' }),
    siteName: optionalText(200),
    siteZipCode: z
      .string()
      .transform((value) => onlyDigits(value) || undefined)
      .pipe(z.string().regex(/^\d{8}$/, { error: 'CEP com 8 números' }).optional())
      .optional(),
    siteStreet: optionalText(200),
    siteNumber: optionalText(20),
    siteDistrict: optionalText(100),
    siteCity: optionalText(100),
    siteState: z
      .string()
      .transform((value) => value.trim().toUpperCase() || undefined)
      .pipe(z.enum(UFS, { error: 'UF inválida' }).optional())
      .optional(),
    paymentMethod: z.enum(PAYMENT_METHODS, { error: 'Escolha a forma de pagamento' }),
    installments: z.coerce
      .number({ error: 'Parcelas: informe um número' })
      .int({ error: 'Parcelas: use número inteiro' })
      .min(1, { error: 'Mínimo de 1 parcela' })
      .max(12, { error: 'Máximo de 12 parcelas' }),
    notes: optionalText(2000),
  })
  .superRefine((data, ctx) => {
    const days = rentalDays(data.startDate, data.endDate);
    if (days < 1) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'A devolução precisa ser depois da retirada' });
    if (days > MAX_RENTAL_DAYS) ctx.addIssue({ code: 'custom', path: ['endDate'], message: 'Período máximo de 2 anos' });

    const ids = data.items.map((item) => item.machineId);
    if (new Set(ids).size !== ids.length) {
      ctx.addIssue({ code: 'custom', path: ['items'], message: 'A mesma máquina foi escolhida duas vezes' });
    }
  });

export type ContractInput = z.input<typeof contractSchema>;
export type ContractData = z.output<typeof contractSchema>;
