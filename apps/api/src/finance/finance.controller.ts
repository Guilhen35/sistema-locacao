import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { ENTRY_FILTERS, ENTRY_KINDS, entrySchema, payEntrySchema, type EntryData, type PayEntryData } from '@locacao/shared';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { FinanceService } from './finance.service.js';

const listQuerySchema = z.object({
  kind: z.enum(ENTRY_KINDS).default('RECEIVABLE'),
  filter: z.enum(ENTRY_FILTERS).default('all'),
  month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, { error: 'Mês inválido' }),
});

@Controller('finance/entries')
export class FinanceController {
  constructor(private readonly finance: FinanceService) {}

  @Get()
  @RequirePermission('financeiro:ler')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    return this.finance.list(query);
  }

  @Post()
  @RequirePermission('financeiro:editar')
  create(
    @Body(new ZodValidationPipe(entrySchema)) body: EntryData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.finance.create(body, actorOf(session, req));
  }

  @Post(':id/pay')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('financeiro:editar')
  pay(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(payEntrySchema)) body: PayEntryData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.finance.pay(id, body, actorOf(session, req));
  }

  @Post(':id/unpay')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('financeiro:editar')
  unpay(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.finance.unpay(id, actorOf(session, req));
  }

  @Post(':id/cancel')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('financeiro:editar')
  async cancel(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    await this.finance.cancel(id, actorOf(session, req));
  }
}