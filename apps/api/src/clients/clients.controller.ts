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
import { clientSchema, type ClientData } from '@locacao/shared';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { ClientsService, type Actor } from './clients.service.js';

const listQuerySchema = z.object({
  q: z.string().trim().max(100).optional(),
  page: z.coerce.number().int().min(1).max(1000).default(1),
});

type ListQuery = z.output<typeof listQuerySchema>;

function actorOf(session: AuthenticatedSession, req: Request): Actor {
  return { userId: session.user.id, ipAddress: req.ip };
}

@Controller('clients')
export class ClientsController {
  constructor(private readonly clients: ClientsService) {}

  @Get()
  @RequirePermission('clientes:ler')
  list(@Query(new ZodValidationPipe(listQuerySchema)) query: ListQuery) {
    return this.clients.list(query);
  }

  @Get(':id')
  @RequirePermission('clientes:ler')
  get(@Param('id', new ParseUUIDPipe()) id: string) {
    return this.clients.get(id);
  }

  @Post()
  @RequirePermission('clientes:editar')
  create(
    @Body(new ZodValidationPipe(clientSchema)) body: ClientData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.clients.create(body, actorOf(session, req));
  }

  @Patch(':id')
  @RequirePermission('clientes:editar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(clientSchema)) body: ClientData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.clients.update(id, body, actorOf(session, req));
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('clientes:editar')
  archive(
    @Param('id', new ParseUUIDPipe()) id: string,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.clients.archive(id, actorOf(session, req));
  }
}