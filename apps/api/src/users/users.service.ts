import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { UserCreateData, UserUpdateData } from '@locacao/shared';
import { hashPassword } from '../auth/password.js';
import { type Actor, isUniqueViolation, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

const ADMIN_ROLE = 'admin';

// Nunca seleciona hash de senha nem segredo do MFA
const publicUser = {
  id: true,
  name: true,
  email: true,
  isActive: true,
  mustChangePassword: true,
  mfaEnabled: true,
  lastLoginAt: true,
  lockedUntil: true,
  createdAt: true,
  role: { select: { id: true, name: true } },
} as const;

// 16 caracteres aleatórios (96 bits); só vale até a pessoa criar a própria senha
const tempPassword = () => randomBytes(12).toString('base64url');

@Injectable()
export class UsersService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.user.findMany({ where: { archivedAt: null }, select: publicUser, orderBy: { name: 'asc' } });
  }

  roles() {
    return this.prisma.role.findMany({ select: { id: true, name: true, description: true }, orderBy: { name: 'asc' } });
  }

  async create(data: UserCreateData, actor: Actor) {
    await this.ensureRole(data.roleId);
    const password = tempPassword();
    try {
      const user = await this.prisma.user.create({
        data: { name: data.name, email: data.email, roleId: data.roleId, passwordHash: await hashPassword(password), mustChangePassword: true },
        select: publicUser,
      });
      await writeAudit(this.prisma, { action: 'usuario.criado', entity: 'user', entityId: user.id, actor, after: { name: user.name, email: user.email, role: user.role.name } });
      return { user, tempPassword: password };
    } catch (error) {
      if (isUniqueViolation(error)) {
        throw new ConflictException({ message: 'Já existe um usuário com esse e-mail', errors: { email: ['E-mail já cadastrado'] } });
      }
      throw error;
    }
  }

  async update(id: string, data: UserUpdateData, actor: Actor) {
    const before = await this.find(id);
    const role = await this.ensureRole(data.roleId);
    if (role.id !== before.role.id) {
      if (id === actor.userId) throw new ConflictException('Você não pode mudar o seu próprio perfil');
      if (before.role.name === ADMIN_ROLE) await this.ensureAnotherAdmin(id);
    }
    const after = await this.prisma.user.update({ where: { id }, data: { name: data.name, roleId: data.roleId }, select: publicUser });
    // Perfil mudou: derruba as sessões para valer as novas permissões na hora
    if (role.id !== before.role.id) await this.revokeSessions(id);
    await writeAudit(this.prisma, {
      action: 'usuario.alterado',
      entity: 'user',
      entityId: id,
      actor,
      before: { name: before.name, role: before.role.name },
      after: { name: after.name, role: after.role.name },
    });
    return after;
  }

  async resetPassword(id: string, actor: Actor) {
    if (id === actor.userId) throw new BadRequestException('Para trocar a sua senha, use "Meu perfil"');
    await this.find(id);
    const password = tempPassword();
    await this.prisma.$transaction([
      this.prisma.user.update({
        where: { id },
        data: { passwordHash: await hashPassword(password), mustChangePassword: true, failedLoginCount: 0, lockedUntil: null },
      }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await writeAudit(this.prisma, { action: 'usuario.senha_redefinida', entity: 'user', entityId: id, actor });
    return { tempPassword: password };
  }

  async block(id: string, actor: Actor) {
    if (id === actor.userId) throw new ConflictException('Você não pode bloquear o seu próprio acesso');
    const user = await this.find(id);
    if (user.role.name === ADMIN_ROLE) await this.ensureAnotherAdmin(id);
    await this.prisma.$transaction([
      this.prisma.user.update({ where: { id }, data: { isActive: false } }),
      this.prisma.session.updateMany({ where: { userId: id, revokedAt: null }, data: { revokedAt: new Date() } }),
    ]);
    await writeAudit(this.prisma, { action: 'usuario.bloqueado', entity: 'user', entityId: id, actor });
  }

  async unblock(id: string, actor: Actor) {
    await this.find(id);
    await this.prisma.user.update({ where: { id }, data: { isActive: true, failedLoginCount: 0, lockedUntil: null } });
    await writeAudit(this.prisma, { action: 'usuario.desbloqueado', entity: 'user', entityId: id, actor });
  }

  private async find(id: string) {
    const user = await this.prisma.user.findFirst({ where: { id, archivedAt: null }, select: publicUser });
    if (!user) throw new NotFoundException('Usuário não encontrado');
    return user;
  }

  private async ensureRole(roleId: string) {
    const role = await this.prisma.role.findUnique({ where: { id: roleId }, select: { id: true, name: true } });
    if (!role) throw new BadRequestException({ message: 'Dados inválidos', errors: { roleId: ['Perfil não encontrado'] } });
    return role;
  }

  // Impede ficar sem nenhum administrador ativo (ninguém mais conseguiria gerenciar usuários)
  private async ensureAnotherAdmin(exceptId: string) {
    const others = await this.prisma.user.count({
      where: { id: { not: exceptId }, isActive: true, archivedAt: null, role: { name: ADMIN_ROLE } },
    });
    if (others === 0) throw new ConflictException('É preciso ter pelo menos um administrador ativo');
  }

  private revokeSessions(userId: string) {
    return this.prisma.session.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
  }
}