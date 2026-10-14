import { type CanActivate, type ExecutionContext, Injectable, UnauthorizedException } from '@nestjs/common';
import type { Request } from 'express';
import { AuthService } from './auth.service.js';

// __Host- obriga o navegador a só aceitar o cookie com Secure, Path=/ e sem Domain
export const SESSION_COOKIE = '__Host-sid';
const TOKEN_FORMAT = /^[\w-]{43}$/;

export type AuthenticatedSession = NonNullable<Awaited<ReturnType<AuthService['validateSession']>>>;

export interface AuthenticatedRequest extends Request {
  auth?: AuthenticatedSession;
}

export function readSessionCookie(req: Request): string | undefined {
  const header = req.headers.cookie;
  if (!header) return undefined;
  for (const part of header.split(';')) {
    const [name, ...rest] = part.trim().split('=');
    if (name === SESSION_COOKIE) return rest.join('=');
  }
  return undefined;
}

@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private readonly auth: AuthService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();
    const token = readSessionCookie(req);

    // Token com formato errado é recusado antes de consultar o banco
    if (!token || !TOKEN_FORMAT.test(token)) throw new UnauthorizedException('Sessão inválida ou expirada');

    const session = await this.auth.validateSession(token);
    if (!session) throw new UnauthorizedException('Sessão inválida ou expirada');

    req.auth = session;
    return true;
  }
}
