import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { maskDocument, normalizeDocument, type ClientData } from '@locacao/shared';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 24;

type ClientWhere = NonNullable<NonNullable<Parameters<PrismaService['client']['findMany']>[0]>['where']>;
type JsonRecord = Record<string, string | number | boolean | null>;

export interface Actor {
  userId: string;
  ipAddress?: string;
}

// Campos opcionais vazios viram null: assim dá para apagar um dado na edição
function toDb(data: ClientData) {
  return {
    type: data.type,
    document: data.document,
    name: data.name,
    tradeName: data.tradeName ?? null,
    contactName: data.contactName ?? null,
    contactDocument: data.contactDocument ?? null,
    phone: data.phone ?? null,
    whatsapp: data.whatsapp,
    email: data.email ?? null,
    zipCode: data.zipCode ?? null,
    street: data.street ?? null,
    number: data.number ?? null,
    district: data.district ?? null,
    city: data.city ?? null,
    state: data.state ?? null,
    notes: data.notes ?? null,
  };
}

function toJson(value: unknown): JsonRecord {
  return JSON.parse(JSON.stringify(value)) as JsonRecord;
}

@Injectable()
export class ClientsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string | undefined; page: number }) {
    const q = params.q?.trim();
    const where: ClientWhere = { archivedAt: null };

    if (q) {
      const or: ClientWhere[] = [
        { name: { contains: q, mode: 'insensitive' } },
        { tradeName: { contains: q, mode: 'insensitive' } },
        { city: { contains: q, mode: 'insensitive' } },
      ];
      const document = normalizeDocument(q);
      if (/\d/.test(q) && document.length >= 3) or.push({ document: { startsWith: document } });
      where.OR = or;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.client.count({ where }),
      this.prisma.client.findMany({
        where,
        select: { id: true, type: true, name: true, tradeName: true, document: true, whatsapp: true, city: true, state: true },
        orderBy: { name: 'asc' },
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
      }),
    ]);

    // LGPD: a lista mostra o CPF mascarado; o documento completo só aparece na ficha
    return {
      total,
      page: params.page,
      pageSize: PAGE_SIZE,
      items: rows.map((row) => ({ ...row, document: maskDocument(row.document) })),
    };
  }

  async get(id: string) {
    const client = await this.prisma.client.findFirst({ where: { id, archivedAt: null } });
    if (!client) throw new NotFoundException('Cliente não encontrado');
    return client;
  }

  async create(data: ClientData, actor: Actor) {
    try {
      const client = await this.prisma.client.create({ data: toDb(data) });
      await this.audit('cliente.criado', actor, client.id, null, client);
      return client;
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  async update(id: string, data: ClientData, actor: Actor) {
    const before = await this.get(id);
    try {
      const after = await this.prisma.client.update({ where: { id }, data: toDb(data) });
      await this.audit('cliente.alterado', actor, id, before, after);
      return after;
    } catch (error) {
      throw this.mapConflict(error);
    }
  }

  // Nunca apaga de verdade: arquiva e mantém o histórico (contratos, auditoria)
  async archive(id: string, actor: Actor) {
    const before = await this.get(id);
    const after = await this.prisma.client.update({ where: { id }, data: { archivedAt: new Date() } });
    await this.audit('cliente.arquivado', actor, id, before, after);
  }

  private mapConflict(error: unknown) {
    if (typeof error === 'object' && error !== null && 'code' in error && error.code === 'P2002') {
      return new ConflictException({
        message: 'Dados inválidos',
        errors: { document: ['Já existe um cliente com este documento (ele pode estar arquivado)'] },
      });
    }
    return error;
  }

  private async audit(action: string, actor: Actor, entityId: string, before: unknown, after: unknown) {
    await this.prisma.auditLog.create({
      data: {
        userId: actor.userId,
        action,
        entity: 'client',
        entityId,
        ipAddress: actor.ipAddress,
        ...(before ? { before: toJson(before) } : {}),
        ...(after ? { after: toJson(after) } : {}),
      },
    });
  }
}