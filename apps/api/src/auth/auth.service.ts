import { Injectable, UnauthorizedException } from '@nestjs/common';
import type { LoginInput } from '@locacao/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
export const SESSION_TTL_HOURS = 12;

export interface RequestContext {
  ipAddress?: string;
  userAgent?: string;
}

@Injectable()
export class AuthService {
  // Hash de uma senha qualquer, usado para gastar o mesmo tempo quando o usuário não existe
  private readonly dummyHash = hashPassword('senha-ficticia-para-tempo-constante');

  constructor(private readonly prisma: PrismaService) {}

  async login(input: LoginInput, ctx: RequestContext) {
    const ipAddress = ctx.ipAddress;
    const userAgent = ctx.userAgent?.slice(0, 500);
    const user = await this.prisma.user.findUnique({ where: { email: input.email } });

    if (!user || !user.isActive || user.archivedAt) {
      await verifyPassword(await this.dummyHash, input.password);
      await this.audit('auth.login_falhou', null, ipAddress, { email: input.email, motivo: 'usuario_invalido' });
      throw this.invalidCredentials();
    }

    if (user.lockedUntil && user.lockedUntil > new Date()) {
      await verifyPassword(await this.dummyHash, input.password);
      await this.audit('auth.login_bloqueado', user.id, ipAddress);
      throw this.invalidCredentials();
    }

    const valid = await verifyPassword(user.passwordHash, input.password);

    if (!valid) {
      // Incremento atômico: duas tentativas ao mesmo tempo não "perdem" a contagem
      const { failedLoginCount } = await this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: { increment: 1 } },
        select: { failedLoginCount: true },
      });

      if (failedLoginCount >= MAX_FAILED_ATTEMPTS) {
        await this.prisma.user.update({
          where: { id: user.id },
          data: { failedLoginCount: 0, lockedUntil: new Date(Date.now() + LOCK_MINUTES * 60_000) },
        });
        await this.audit('auth.conta_bloqueada', user.id, ipAddress);
      } else {
        await this.audit('auth.login_falhou', user.id, ipAddress, { motivo: 'senha_incorreta' });
      }
      throw this.invalidCredentials();
    }

    const token = generateSessionToken();
    const expiresAt = new Date(Date.now() + SESSION_TTL_HOURS * 3_600_000);

    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: user.id },
        data: { failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() },
      }),
      this.prisma.session.create({
        data: { userId: user.id, tokenHash: hashSessionToken(token), ipAddress, userAgent, expiresAt },
      }),
      this.prisma.auditLog.create({
        data: { userId: user.id, action: 'auth.login', entity: 'user', entityId: user.id, ipAddress },
      }),
    ]);

    return {
      token,
      expiresAt,
      user: { id: user.id, name: user.name, email: user.email, mustChangePassword: user.mustChangePassword },
    };
  }

  private invalidCredentials() {
    return new UnauthorizedException(
      'Não foi possível entrar. Confira o e-mail e a senha ou tente novamente em alguns minutos.',
    );
  }

  private async audit(action: string, userId: string | null, ipAddress?: string, after?: Record<string, string>) {
    await this.prisma.auditLog.create({
      data: { userId, action, entity: 'user', entityId: userId, ipAddress, after },
    });
  }
}