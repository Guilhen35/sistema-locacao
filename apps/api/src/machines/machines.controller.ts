import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  ParseUUIDPipe,
  Patch,
  Post,
  Query,
  Req,
} from '@nestjs/common';
import type { Request } from 'express';
import { z } from 'zod';
import { machineSchema, machineTypeSchema, type MachineData, type MachineTypeData } from '@locacao/shared';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { MachineTypesService } from './machine-types.service.js';
import { MachinesService } from './machines.service.js';

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  typeId: z.uuid().optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

type ListQuery = z.output<typeof listQuerySchema>;

@Controller('machine-types')
export class MachineTypesController {
  constructor(private readonly types: MachineTypesService) {}

  @Get()
  @RequirePermission('maquinas:ler')
  list() {
    return this.types.list();
  }

  @Post()
  @RequirePermission('maquinas:editar')
  create(
    @Body(new ZodValidationPipe(machineTypeSchema)) body: MachineTypeData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.types.create(body, actorOf(session, req));
  }

  @Patch(':id')
  @RequirePermission('maquinas:editar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(machineTypeSchema)) body: MachineTypeData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.types.update(id, body, actorOf(session, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('maquinas:editar')
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.types.archive(id, actorOf(session, req));
  }
}

@Controller('machines')
export class MachinesController {
  constructor(private readonly machines: MachinesService) {}

  @Get()
  @RequirePermission('maquinas:ler')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.machines.list(query);
  }

  // Precisa vir antes de ':id' para não ser confundida com um id
  @Get('next-code')
  @RequirePermission('maquinas:editar')
  nextCode() {
    return this.machines.nextCode();
  }

  @Get(':id')
  @RequirePermission('maquinas:ler')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.machines.get(id);
  }

  @Post()
  @RequirePermission('maquinas:editar')
  create(
    @Body(new ZodValidationPipe(machineSchema)) body: MachineData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.machines.create(body, actorOf(session, req));
  }

  @Patch(':id')
  @RequirePermission('maquinas:editar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(machineSchema)) body: MachineData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.machines.update(id, body, actorOf(session, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('maquinas:editar')
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.machines.archive(id, actorOf(session, req));
  }
}