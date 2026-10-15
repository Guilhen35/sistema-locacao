import { BadRequestException, Injectable, UnauthorizedException } from '@nestjs/common';
import type { ChangePasswordInput, LoginInput } from '@locacao/shared';
import { PrismaService } from '../prisma/prisma.service.js';
import { hashPassword, verifyPassword } from './password.js';
import { generateSessionToken, hashSessionToken } from './session-token.js';

const MAX_FAILED_ATTEMPTS = 5;
const LOCK_MINUTES = 15;
export const SESSION_TTL_HOURS = 12;
const IDLE_TIMEOUT_MS = 2 * 3_600_000;
const LAST_SEEN_UPDATE_MS = 5 * 60_000;

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
      await this.registerFailure(user.id, ipAddress, 'auth.login_falhou');
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

  async validateSession(token: string) {
    const session = await this.prisma.session.findUnique({
      where: { tokenHash: hashSessionToken(token) },
      include: {
        user: {
          select: {
            id: true,
            name: true,
            email: true,
            isActive: true,
            archivedAt: true,
            mustChangePassword: true,
            role: { select: { name: true } },
          },
        },
      },
    });

    const now = Date.now();
    if (
      !session ||
      session.revokedAt ||
      session.expiresAt.getTime() <= now ||
      now - session.lastSeenAt.getTime() > IDLE_TIMEOUT_MS ||
      !session.user.isActive ||
      session.user.archivedAt
    ) {
      return null;
    }

    // Grava o "visto por último" no máximo a cada 5 min, para não escrever no banco em toda requisição
    if (now - session.lastSeenAt.getTime() > LAST_SEEN_UPDATE_MS) {
      await this.prisma.session.update({ where: { id: session.id }, data: { lastSeenAt: new Date(now) } });
    }

    const { user } = session;
    return {
      sessionId: session.id,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        role: user.role.name,
        mustChangePassword: user.mustChangePassword,
      },
    };
  }

  async changePassword(userId: string, sessionId: string, input: ChangePasswordInput, ipAddress?: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { passwordHash: true, email: true },
    });

    if (!user || !(await verifyPassword(user.passwordHash, input.currentPassword))) {
      await this.registerFailure(userId, ipAddress, 'auth.troca_senha_falhou');
      throw this.fieldError('currentPassword', 'Senha atual incorreta');
    }

    const emailName = user.email.split('@')[0] ?? '';
    if (emailName.length >= 3 && input.newPassword.toLowerCase().includes(emailName)) {
      throw this.fieldError('newPassword', 'Não use o seu e-mail na senha');
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { passwordHash: await hashPassword(input.newPassword), mustChangePassword: false, failedLoginCount: 0 },
      }),
      // Derruba as outras sessões: quem tinha a senha antiga perde o acesso
      this.prisma.session.updateMany({
        where: { userId, id: { not: sessionId }, revokedAt: null },
        data: { revokedAt: now },
      }),
      this.prisma.auditLog.create({
        data: { userId, action: 'auth.senha_trocada', entity: 'user', entityId: userId, ipAddress },
      }),
    ]);
  }

  async logout(sessionId: string, userId: string, ipAddress?: string) {
    await this.prisma.session.updateMany({
      where: { id: sessionId, revokedAt: null },
      data: { revokedAt: new Date() },
    });
    await this.audit('auth.logout', userId, ipAddress);
  }

  // Conta erros de senha. Na 5ª, bloqueia a conta e derruba todas as sessões
  private async registerFailure(userId: string, ipAddress: string | undefined, action: string) {
    const { failedLoginCount } = await this.prisma.user.update({
      where: { id: userId },
      data: { failedLoginCount: { increment: 1 } },
      select: { failedLoginCount: true },
    });

    if (failedLoginCount < MAX_FAILED_ATTEMPTS) {
      await this.audit(action, userId, ipAddress);
      return;
    }

    const now = new Date();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id: userId },
        data: { failedLoginCount: 0, lockedUntil: new Date(now.getTime() + LOCK_MINUTES * 60_000) },
      }),
      this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: now } }),
    ]);
    await this.audit('auth.conta_bloqueada', userId, ipAddress);
  }

  private fieldError(field: string, message: string) {
    return new BadRequestException({ message: 'Dados inválidos', errors: { [field]: [message] } });
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
