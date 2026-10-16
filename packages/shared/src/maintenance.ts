import { z } from 'zod';
import { PAYMENT_METHODS } from './contract.js';
import { parseDecimal } from './machine.js';

export const MAINTENANCE_KINDS = ['PREVENTIVE', 'CORRECTIVE'] as const;
export const MAINTENANCE_STATUSES = ['OPEN', 'DONE'] as const;
export type MaintenanceKind = (typeof MAINTENANCE_KINDS)[number];
export type MaintenanceStatus = (typeof MAINTENANCE_STATUSES)[number];

export const MAINTENANCE_KIND_LABELS: Record<MaintenanceKind, string> = {
  PREVENTIVE: 'Preventiva',
  CORRECTIVE: 'Corretiva',
};

export const MAINTENANCE_STATUS_LABELS: Record<MaintenanceStatus, string> = {
  OPEN: 'Em andamento',
  DONE: 'Concluída',
};

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, { error: 'Data inválida' });
const emptyToUndefined = (value: unknown) => (value === '' || value === null ? undefined : value);

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres` })
    .transform((value) => value || undefined)
    .optional();
}

function decimal(min: number, max: number, label: string) {
  return z.preprocess(
    parseDecimal,
    z
      .number({ error: `${label}: informe um número` })
      .min(min, { error: `${label}: mínimo ${min}` })
      .max(max, { error: `${label}: máximo ${max}` })
      .transform((n) => Math.round(n * 100) / 100),
  );
}

export const maintenanceItemSchema = z.object({
  description: z.string().trim().min(2, { error: 'Descreva a peça ou serviço' }).max(200, { error: 'Máximo de 200 caracteres' }),
  quantity: decimal(0.01, 100_000, 'Quantidade'),
  unitPrice: decimal(0, 1_000_000, 'Valor unitário'),
});

export const maintenanceSchema = z.object({
  machineId: z.uuid({ error: 'Escolha a máquina' }),
  kind: z.enum(MAINTENANCE_KINDS, { error: 'Escolha o tipo' }),
  date: isoDate,
  hourMeter: z.preprocess(parseDecimal, z.number().int({ error: 'Horímetro: número inteiro' }).min(0).max(1_000_000).optional()),
  description: z.string().trim().min(3, { error: 'Descreva o que aconteceu' }).max(2000, { error: 'Máximo de 2000 caracteres' }),
  blocksMachine: z.boolean().default(true),
  items: z.array(maintenanceItemSchema).max(50, { error: 'Máximo de 50 itens' }).default([]),
  supplier: optionalText(200),
  paymentMethod: z.preprocess(emptyToUndefined, z.enum(PAYMENT_METHODS, { error: 'Forma de pagamento inválida' }).optional()),
  dueDate: z.preprocess(emptyToUndefined, isoDate.optional()),
  paid: z.boolean().default(false),
  sendToFinance: z.boolean().default(true),
});

export type MaintenanceInput = z.input<typeof maintenanceSchema>;
export type MaintenanceData = z.output<typeof maintenanceSchema>;
