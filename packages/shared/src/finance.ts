import { z } from 'zod';
import { PAYMENT_METHODS } from './contract.js';
import { parseDecimal } from './machine.js';

export const ENTRY_KINDS = ['RECEIVABLE', 'PAYABLE'] as const;
export type EntryKind = (typeof ENTRY_KINDS)[number];

export const ENTRY_KIND_LABELS: Record<EntryKind, string> = {
  RECEIVABLE: 'A receber',
  PAYABLE: 'A pagar',
};

export const ENTRY_FILTERS = ['all', 'open', 'overdue', 'paid'] as const;
export type EntryFilter = (typeof ENTRY_FILTERS)[number];

export const ENTRY_FILTER_LABELS: Record<EntryFilter, string> = {
  all: 'Todos',
  open: 'Em aberto',
  overdue: 'Vencidos',
  paid: 'Pagos',
};

const entryDate = z
  .string({ error: 'Informe a data' })
  .regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida' })
  .refine((value) => {
    const date = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(date.getTime()) && date.toISOString().startsWith(value);
  }, { error: 'Data inválida' });

const optionalText = (max: number) =>
  z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres` })
    .transform((value) => value || undefined)
    .optional();

const optionalPayment = z.preprocess(
  (value) => (value === '' || value === null ? undefined : value),
  z.enum(PAYMENT_METHODS, { error: 'Forma de pagamento inválida' }).optional(),
);

// Lançamento manual (despesa ou recebimento avulso)
export const entrySchema = z
  .object({
    kind: z.enum(ENTRY_KINDS, { error: 'Escolha receber ou pagar' }),
    description: z
      .string({ error: 'Informe a descrição' })
      .trim()
      .min(3, { error: 'Descrição muito curta' })
      .max(200, { error: 'Máximo de 200 caracteres' }),
    supplier: optionalText(200),
    dueDate: entryDate,
    amount: z
      .unknown()
      .transform(parseDecimal)
      .pipe(
        z
          .number({ error: 'Valor: informe um número' })
          .min(0.01, { error: 'Valor: mínimo R$ 0,01' })
          .max(10_000_000, { error: 'Valor muito alto' })
          .transform((n) => Math.round(n * 100) / 100),
      ),
    paymentMethod: optionalPayment,
    paid: z.boolean().default(false),
    notes: optionalText(1000),
  })
  .superRefine((data, ctx) => {
    if (data.paid && !data.paymentMethod) {
      ctx.addIssue({ code: 'custom', path: ['paymentMethod'], message: 'Informe como foi pago' });
    }
  });

export const payEntrySchema = z.object({
  paidAt: entryDate,
  paymentMethod: z.enum(PAYMENT_METHODS, { error: 'Escolha a forma de pagamento' }),
});

export type EntryInput = z.input<typeof entrySchema>;
export type EntryData = z.output<typeof entrySchema>;
export type PayEntryData = z.output<typeof payEntrySchema>;