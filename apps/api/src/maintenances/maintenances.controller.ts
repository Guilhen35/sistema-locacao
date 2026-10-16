import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Query, Req } from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { MAINTENANCE_STATUSES, maintenanceSchema, type MaintenanceData } from '@locacao/shared';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { MaintenancesService } from './maintenances.service.js';

const listQuerySchema = z.object({
  machineId: z.uuid().optional(),
  status: z.enum(MAINTENANCE_STATUSES).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

@Controller('maintenances')
export class MaintenancesController {
  constructor(private readonly maintenances: MaintenancesService) {}

  @Get()
  @RequirePermission('manutencao:ler')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: z.output<typeof listQuerySchema>) {
    return this.maintenances.list(query);
  }

  @Get(':id')
  @RequirePermission('manutencao:ler')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.maintenances.get(id);
  }

  @Post()
  @RequirePermission('manutencao:editar')
  create(@Body(new ZodValidationPipe(maintenanceSchema)) body: MaintenanceData, @CurrentSession() s: AuthenticatedSession, @Req() req: Request) {
    return this.maintenances.create(body, actorOf(s, req));
  }

  @Patch(':id')
  @RequirePermission('manutencao:editar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(maintenanceSchema)) body: MaintenanceData,
    @CurrentSession() s: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.maintenances.update(id, body, actorOf(s, req));
  }

  @Post(':id/finish')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('manutencao:editar')
  finish(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() s: AuthenticatedSession, @Req() req: Request) {
    return this.maintenances.finish(id, actorOf(s, req));
  }
}
