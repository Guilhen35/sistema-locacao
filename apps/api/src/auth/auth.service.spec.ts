import { UnauthorizedException } from '@nestjs/common';
import { beforeAll, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service.js';
import { AuthService } from './auth.service.js';
import { hashPassword } from './password.js';
import { hashSessionToken } from './session-token.js';

const PASSWORD = 'SenhaFicticia#Correta1';
const EMAIL = 'admin@exemplo.com';
const ctx = { ipAddress: '203.0.113.10', userAgent: 'vitest' };
let passwordHash = '';

beforeAll(async () => {
  passwordHash = await hashPassword(PASSWORD);
});

function makeUser(overrides: Record<string, unknown> = {}) {
  return {
    id: 'user-1',
    name: 'Admin Exemplo',
    email: EMAIL,
    passwordHash,
    isActive: true,
    archivedAt: null,
    lockedUntil: null,
    failedLoginCount: 0,
    mustChangePassword: true,
    ...overrides,
  };
}

// Banco falso: os testes não dependem do Postgres e rodam em milissegundos
function setup(user: ReturnType<typeof makeUser> | null, failedLoginCount = 1) {
  const prisma = {
    user: {
      findUnique: vi.fn().mockResolvedValue(user),
      update: vi.fn().mockResolvedValue({ failedLoginCount }),
    },
    session: { create: vi.fn().mockResolvedValue({}), updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
    auditLog: { create: vi.fn().mockResolvedValue({}) },
    $transaction: vi.fn().mockResolvedValue([]),
  };
  return { prisma, service: new AuthService(prisma as unknown as PrismaService) };
}

async function loginError(service: AuthService, password: string) {
  try {
    await service.login({ email: EMAIL, password }, ctx);
  } catch (error) {
    if (error instanceof UnauthorizedException) return error;
    throw error;
  }
  throw new Error('Era esperado que o login falhasse');
}

function expectAudit(prisma: ReturnType<typeof setup>['prisma'], action: string) {
  expect(prisma.auditLog.create).toHaveBeenCalledWith(
    expect.objectContaining({ data: expect.objectContaining({ action }) }),
  );
}

describe('AuthService.login', () => {
  it('entra com a senha correta e guarda só o hash do token', async () => {
    const { prisma, service } = setup(makeUser());
    const result = await service.login({ email: EMAIL, password: PASSWORD }, ctx);

    expect(result.token).toMatch(/^[\w-]{43}$/);
    expect(result.user).not.toHaveProperty('passwordHash');
    const data = prisma.session.create.mock.calls[0]?.[0].data;
    expect(data.tokenHash).toBe(hashSessionToken(result.token));
    expect(JSON.stringify(data)).not.toContain(result.token);
    expect(prisma.$transaction).toHaveBeenCalledOnce();
  });

  it('usa a mesma mensagem para e-mail inexistente e senha errada (anti-enumeração)', async () => {
    const unknown = await loginError(setup(null).service, PASSWORD);
    const wrong = await loginError(setup(makeUser()).service, 'senha-errada');
    expect(unknown.message).toBe(wrong.message);
  });

  it('não cria sessão com senha errada e registra na auditoria', async () => {
    const { prisma, service } = setup(makeUser());
    await loginError(service, 'senha-errada');
    expect(prisma.session.create).not.toHaveBeenCalled();
    expectAudit(prisma, 'auth.login_falhou');
  });

  it('bloqueia a conta por 15 minutos na 5ª tentativa errada (anti-força bruta)', async () => {
    const { prisma, service } = setup(makeUser({ failedLoginCount: 4 }), 5);
    await loginError(service, 'senha-errada');

    const lockCall = prisma.user.update.mock.calls.find(([arg]) => arg.data.lockedUntil instanceof Date);
    const lockedUntil: Date = lockCall?.[0].data.lockedUntil;
    const minutes = (lockedUntil.getTime() - Date.now()) / 60_000;
    expect(minutes).toBeGreaterThan(14);
    expect(minutes).toBeLessThanOrEqual(15);
    expectAudit(prisma, 'auth.conta_bloqueada');
    expect(prisma.session.updateMany).toHaveBeenCalled();
  });

  it('recusa conta bloqueada mesmo com a senha correta', async () => {
    const { prisma, service } = setup(makeUser({ lockedUntil: new Date(Date.now() + 60_000) }));
    await loginError(service, PASSWORD);
    expect(prisma.session.create).not.toHaveBeenCalled();
    expectAudit(prisma, 'auth.login_bloqueado');
  });

  it('libera a conta quando o bloqueio já expirou', async () => {
    const { service } = setup(makeUser({ lockedUntil: new Date(Date.now() - 60_000) }));
    await expect(service.login({ email: EMAIL, password: PASSWORD }, ctx)).resolves.toHaveProperty('token');
  });

  it('recusa usuário arquivado', async () => {
    const { prisma, service } = setup(makeUser({ archivedAt: new Date() }));
    await loginError(service, PASSWORD);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });

  it('recusa usuário desativado', async () => {
    const { prisma, service } = setup(makeUser({ isActive: false }));
    await loginError(service, PASSWORD);
    expect(prisma.session.create).not.toHaveBeenCalled();
  });
});