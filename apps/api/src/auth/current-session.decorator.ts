import { createParamDecorator, type ExecutionContext } from '@nestjs/common';
import type { AuthenticatedRequest, AuthenticatedSession } from './session.guard.js';

export const CurrentSession = createParamDecorator((_data: unknown, ctx: ExecutionContext): AuthenticatedSession => {
  const req = ctx.switchToHttp().getRequest<AuthenticatedRequest>();
  // Falha alto se alguém esquecer o SessionGuard na rota
  if (!req.auth) throw new Error('CurrentSession usado sem SessionGuard');
  return req.auth;
});
