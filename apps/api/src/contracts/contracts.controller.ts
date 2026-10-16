import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { CONTRACT_STATUSES, contractSchema, type ContractData } from '@locacao/shared';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { ContractsService } from './contracts.service.js';

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  status: z.enum(CONTRACT_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

const availabilityQuerySchema = z
  .object({
    machineIds: z
      .string()
      .transform((value) => value.split(',').filter(Boolean))
      .pipe(z.array(z.uuid()).min(1).max(20)),
    startDate: isoDate,
    endDate: isoDate,
    excludeContractId: z.uuid().optional(),
  })
  .refine((q) => q.endDate > q.startDate, { error: 'Período inválido', path: ['endDate'] });

@Controller('contracts')
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  @Get()
  @RequirePermission('contratos:ler')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    return this.contracts.list(query);
  }

  // Antes de ':id' para não ser confundida com um id
  @Get('availability')
  @RequirePermission('contratos:ler')
  async availability(@Query(new ZodValidationPipe(availabilityQuerySchema)) query: z.output<typeof availabilityQuerySchema>) {
    const conflicts = await this.contracts.conflicts(query.machineIds, query.startDate, query.endDate, query.excludeContractId);
    return { available: conflicts.length === 0, conflicts };
  }

  @Get(':id')
  @RequirePermission('contratos:ler')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.contracts.get(id);
  }

  @Post()
  @RequirePermission('contratos:editar')
  create(
    @Body(new ZodValidationPipe(contractSchema)) body: ContractData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.contracts.create(body, actorOf(session, req));
  }

  @Patch(':id')
  @RequirePermission('contratos:editar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(contractSchema)) body: ContractData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.contracts.update(id, body, actorOf(session, req));
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('contratos:editar')
  activate(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.contracts.activate(id, actorOf(session, req));
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('contratos:editar')
  finish(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.contracts.finish(id, actorOf(session, req));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('contratos:editar')
  cancel(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.contracts.cancel(id, actorOf(session, req));
  }
}