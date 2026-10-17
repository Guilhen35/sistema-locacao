import { Controller, Get, Query } from '@nestjs/common';
import { z } from 'zod';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { AgendaService } from './agenda.service.js';

const MAX_RANGE_DAYS = 62;
const DAY_MS = 86_400_000;
const isoDate = z.iso.date();

const rangeSchema = z
  .object({ from: isoDate, to: isoDate })
  .refine((q) => q.to > q.from, { error: 'Período inválido', path: ['to'] })
  .refine((q) => (Date.parse(q.to) - Date.parse(q.from)) / DAY_MS <= MAX_RANGE_DAYS, {
    error: `Período de no máximo ${MAX_RANGE_DAYS} dias`,
    path: ['to'],
  });

type Range = z.output<typeof rangeSchema>;

@Controller('agenda')
export class AgendaController {
  constructor(private readonly agenda: AgendaService) {}

  @Get()
  @RequirePermission('contratos:ler')
  movements(@Query(new ZodValidationPipe(rangeSchema)) query: Range) {
    return this.agenda.movements(query.from, query.to);
  }

  // Separado para respeitar a permissão de manutenção
  @Get('maintenances')
  @RequirePermission('manutencao:ler')
  maintenances(@Query(new ZodValidationPipe(rangeSchema)) query: Range) {
    return this.agenda.maintenances(query.from, query.to);
  }
}