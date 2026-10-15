import { z } from 'zod';

export const MACHINE_CATEGORIES = ['SCISSOR', 'ARTICULATED', 'TELESCOPIC', 'MAST', 'OTHER'] as const;
export const POWER_SOURCES = ['ELECTRIC', 'DIESEL', 'HYBRID', 'GAS'] as const;
export type MachineCategory = (typeof MACHINE_CATEGORIES)[number];
export type PowerSource = (typeof POWER_SOURCES)[number];

export const CATEGORY_LABELS: Record<MachineCategory, string> = {
  SCISSOR: 'Tesoura',
  ARTICULATED: 'Articulada',
  TELESCOPIC: 'Telescópica',
  MAST: 'Mastro',
  OTHER: 'Outra',
};

export const POWER_LABELS: Record<PowerSource, string> = {
  ELECTRIC: 'Elétrica',
  DIESEL: 'Diesel',
  HYBRID: 'Híbrida',
  GAS: 'Gás',
};

// Aceita 350, "350", "350,50" e "1.250,50". Vazio vira undefined
export function parseDecimal(value: unknown): number | undefined {
  if (value === undefined || value === null) return undefined;
  if (typeof value === 'number') return value;
  if (typeof value !== 'string') return Number.NaN;
  let text = value.replace(/R\$|\s/g, '');
  if (!text) return undefined;
  if (text.includes(',')) text = text.replace(/\./g, '').replace(',', '.');
  return Number(text);
}

function decimal(min: number, max: number, label: string) {
  return z
    .unknown()
    .transform(parseDecimal)
    .pipe(
      z
        .number({ error: `${label}: informe um número` })
        .min(min, { error: `${label}: mínimo ${min}` })
        .max(max, { error: `${label}: máximo ${max}` })
        .transform((n) => Math.round(n * 100) / 100),
    );
}

function optionalDecimal(min: number, max: number, label: string) {
  return z.preprocess(
    parseDecimal,
    z
      .number({ error: `${label}: informe um número` })
      .min(min, { error: `${label}: mínimo ${min}` })
      .max(max, { error: `${label}: máximo ${max}` })
      .transform((n) => Math.round(n * 100) / 100)
      .optional(),
  );
}

function optionalInt(min: number, max: number, label: string) {
  return z.preprocess(
    parseDecimal,
    z
      .number({ error: `${label}: informe um número` })
      .int({ error: `${label}: use número inteiro` })
      .min(min, { error: `${label}: mínimo ${min}` })
      .max(max, { error: `${label}: máximo ${max}` })
      .optional(),
  );
}

function optionalText(max: number) {
  return z
    .string()
    .trim()
    .max(max, { error: `Máximo de ${max} caracteres` })
    .transform((value) => value || undefined)
    .optional();
}

export const machineTypeSchema = z.object({
  name: z.string().trim().min(2, { error: 'Informe o nome do tipo' }).max(100, { error: 'Máximo de 100 caracteres' }),
  category: z.enum(MACHINE_CATEGORIES, { error: 'Escolha a categoria' }),
  powerSource: z.enum(POWER_SOURCES, { error: 'Escolha a energia' }),
  workingHeightM: decimal(1, 100, 'Altura de trabalho'),
  capacityKg: decimal(1, 5000, 'Capacidade').pipe(z.number().int({ error: 'Capacidade: use número inteiro' })),
  usage: optionalText(200),
  dailyPrice: decimal(0.01, 1_000_000, 'Diária'),
  weeklyPrice: optionalDecimal(0.01, 1_000_000, 'Semanal'),
  monthlyPrice: optionalDecimal(0.01, 1_000_000, 'Mensal'),
});

export type MachineTypeInput = z.input<typeof machineTypeSchema>;
export type MachineTypeData = z.output<typeof machineTypeSchema>;

const maxYear = new Date().getFullYear() + 1;

export const machineSchema = z
  .object({
    code: z
      .string()
      .trim()
      .toUpperCase()
      .regex(/^[A-Z0-9-]{2,20}$/, { error: 'Use de 2 a 20 letras, números ou hífen (ex.: PLT-001)' }),
    typeId: z.uuid({ error: 'Escolha o tipo de máquina' }),
    manufacturer: optionalText(100),
    model: optionalText(100),
    year: optionalInt(1980, maxYear, 'Ano'),
    serialNumber: optionalText(100),
    assetTag: optionalText(50),
    hourMeter: optionalInt(0, 1_000_000, 'Horímetro'),
    blocked: z.boolean().default(false),
    blockedReason: optionalText(300),
    showOnWebsite: z.boolean().default(false),
  })
  .refine((data) => !data.blocked || Boolean(data.blockedReason), {
    error: 'Informe o motivo do bloqueio',
    path: ['blockedReason'],
  });

export type MachineInput = z.input<typeof machineSchema>;
export type MachineData = z.output<typeof machineSchema>;