import { Body, Controller, Get, HttpCode, HttpStatus, Param, ParseUUIDPipe, Patch, Post, Req } from '@nestjs/common';
import type { Request } from 'express';
import { userCreateSchema, userUpdateSchema, type UserCreateData, type UserUpdateData } from '@locacao/shared';
import { CurrentSession } from '../auth/current-session.decorator.js';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import { actorOf } from '../common/audit.js';
import { ZodValidationPipe } from '../common/pipes/zod-validation.pipe.js';
import { UsersService } from './users.service.js';

@Controller('users')
export class UsersController {
  constructor(private readonly users: UsersService) {}

  @Get()
  @RequirePermission('usuarios:gerenciar')
  list() {
    return this.users.list();
  }

  @Get('roles')
  @RequirePermission('usuarios:gerenciar')
  roles() {
    return this.users.roles();
  }

  @Post()
  @RequirePermission('usuarios:gerenciar')
  create(@Body(new ZodValidationPipe(userCreateSchema)) body: UserCreateData, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.users.create(body, actorOf(session, req));
  }

  @Patch(':id')
  @RequirePermission('usuarios:gerenciar')
  update(
    @Param('id', new ParseUUIDPipe()) id: string,
    @Body(new ZodValidationPipe(userUpdateSchema)) body: UserUpdateData,
    @CurrentSession() session: AuthenticatedSession,
    @Req() req: Request,
  ) {
    return this.users.update(id, body, actorOf(session, req));
  }

  @Post(':id/reset-password')
  @HttpCode(HttpStatus.OK)
  @RequirePermission('usuarios:gerenciar')
  resetPassword(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    return this.users.resetPassword(id, actorOf(session, req));
  }

  @Post(':id/block')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('usuarios:gerenciar')
  async block(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    await this.users.block(id, actorOf(session, req));
  }

  @Post(':id/unblock')
  @HttpCode(HttpStatus.NO_CONTENT)
  @RequirePermission('usuarios:gerenciar')
  async unblock(@Param('id', new ParseUUIDPipe()) id: string, @CurrentSession() session: AuthenticatedSession, @Req() req: Request) {
    await this.users.unblock(id, actorOf(session, req));
  }
}
