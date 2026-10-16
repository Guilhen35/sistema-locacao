import type { Request } from 'express';
import type { AuthenticatedSession } from '../auth/session.guard.js';
import type { PrismaService } from '../prisma/prisma.service.js';

export interface Actor {
  userId: string;
  ipAddress?: string;
}

type JsonRecord = Record<string, string | number | boolean | null>;

export function actorOf(session: AuthenticatedSession, req: Request): Actor {
  return { userId: session.user.id, ipAddress: req.ip };
}

// Converte datas e decimais em texto para gravar no JSON da auditoria
function toJson(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

export async function writeAudit(
  prisma: PrismaService,
  entry: { action: string; entity: string; entityId: string; actor: Actor; before?: unknown; after?: unknown },
) {
  await prisma.auditLog.create({
    data: {
      userId: entry.actor.userId,
      action: entry.action,
      entity: entry.entity,
      entityId: entry.entityId,
      ipAddress: entry.actor.ipAddress,
      ...(entry.before ? { before: toJson(entry.before) } : {}),
      ...(entry.after ? { after: toJson(entry.after) } : {}),
    },
  });
}

// Código P2002 do Prisma: violou um campo @unique
export function isUniqueViolation(error: unknown): boolean {
  return typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002';
}