import {
  applyDecorators,
  type CanActivate,
  type ExecutionContext,
  ForbiddenException,
  Injectable,
  SetMetadata,
  UseGuards,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { type AuthenticatedRequest, SessionGuard } from './session.guard.js';

const PERMISSION_KEY = 'required-permission';

@Injectable()
export class PermissionGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const required = this.reflector.getAllAndOverride<string | undefined>(PERMISSION_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
    const req = context.switchToHttp().getRequest<AuthenticatedRequest>();

    // Sem permissão declarada ou sem sessão: nega por padrão
    if (!required || !req.auth?.user.permissions.includes(required)) {
      throw new ForbiddenException('Você não tem permissão para esta ação');
    }
    return true;
  }
}

// Exige sessão válida E a permissão informada
export function RequirePermission(key: string) {
  return applyDecorators(SetMetadata(PERMISSION_KEY, key), UseGuards(SessionGuard, PermissionGuard));
}
