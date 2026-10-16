import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { rentalDays, type ContractData, type ContractStatus } from '@locacao/shared';
import { type Actor, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 30;

type ContractWhere = NonNullable<NonNullable<Parameters<PrismaService['contract']['findMany']>[0]>['where']>;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (value: Date) => value.toISOString().slice(0, 10);

// Erro do Postgres quando a trava de agenda (EXCLUDE) recusa a gravação
function isOverlapViolation(error: unknown): boolean {
  const cause = typeof error === 'object' && error !== null && 'cause' in error ? String(error.cause) : '';
  const text = `${error instanceof Error ? error.message : String(error)} ${cause}`;
  return text.includes('contract_items_no_overlap') || text.includes('23P01');
}

function fieldError(field: string, message: string) {
  return new BadRequestException({ message: 'Dados inválidos', errors: { [field]: [message] } });
}

export interface Conflict {
  machineId: string;
  machineCode: string;
  contractNumber: number;
  startDate: string;
  endDate: string;
}

@Injectable()
export class ContractsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string | undefined; status?: ContractStatus | undefined; page: number }) {
    const where: ContractWhere = {};
    if (params.status) where.status = params.status;

    const q = params.q?.trim();
    if (q) {
      const or: ContractWhere[] = [
        { client: { name: { contains: q, mode: 'insensitive' } } },
        { client: { tradeName: { contains: q, mode: 'insensitive' } } },
        { items: { some: { machine: { code: { contains: q, mode: 'insensitive' } } } } },
      ];
      if (/^\d{1,9}$/.test(q)) or.push({ number: Number(q) });
      where.OR = or;
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.contract.count({ where }),
      this.prisma.contract.findMany({
        where,
        orderBy: { number: 'desc' },
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          client: { select: { id: true, name: true, tradeName: true } },
          items: { select: { machine: { select: { code: true } } } },
        },
      }),
    ]);

    return { total, page: params.page, pageSize: PAGE_SIZE, items: rows };
  }

  async get(id: string) {
    const contract = await this.prisma.contract.findUnique({
      where: { id },
      include: {
        client: { select: { id: true, name: true, tradeName: true, document: true, type: true, contactName: true } },
        items: {
          include: { machine: { select: { id: true, code: true, type: { select: { name: true } } } } },
          orderBy: { machine: { code: 'asc' } },
        },
      },
    });
    if (!contract) throw new NotFoundException('Contrato não encontrado');
    return contract;
  }

  // Itens reservados (contratos ativos) que cruzam o período pedido
  async conflicts(machineIds: string[], startDate: string, endDate: string, excludeContractId?: string): Promise<Conflict[]> {
    const rows = await this.prisma.contractItem.findMany({
      where: {
        reserved: true,
        machineId: { in: machineIds },
        startDate: { lt: toDate(endDate) },
        endDate: { gt: toDate(startDate) },
        ...(excludeContractId ? { contractId: { not: excludeContractId } } : {}),
      },
      include: { machine: { select: { code: true } }, contract: { select: { number: true } } },
      orderBy: { startDate: 'asc' },
    });
    return rows.map((row) => ({
      machineId: row.machineId,
      machineCode: row.machine.code,
      contractNumber: row.contract.number,
      startDate: toIso(row.startDate),
      endDate: toIso(row.endDate),
    }));
  }

  async create(data: ContractData, actor: Actor) {
    const prepared = await this.prepare(data);
    const contract = await this.prisma.contract.create({
      data: { ...prepared.contract, items: { create: prepared.items } },
    });
    await writeAudit(this.prisma, { action: 'contrato.criado', entity: 'contract', entityId: contract.id, actor, after: contract });
    return contract;
  }

  async update(id: string, data: ContractData, actor: Actor) {
    const before = await this.findWithStatus(id, ['DRAFT'], 'Só contratos em rascunho podem ser editados');
    const prepared = await this.prepare(data);
    const [, after] = await this.prisma.$transaction([
      this.prisma.contractItem.deleteMany({ where: { contractId: id } }),
      this.prisma.contract.update({ where: { id }, data: { ...prepared.contract, items: { create: prepared.items } } }),
    ]);
    await writeAudit(this.prisma, { action: 'contrato.alterado', entity: 'contract', entityId: id, actor, before, after });
    return after;
  }

  async activate(id: string, actor: Actor) {
    const contract = await this.findWithStatus(id, ['DRAFT'], 'Só contratos em rascunho podem ser ativados');
    const items = await this.prisma.contractItem.findMany({
      where: { contractId: id },
      include: { machine: { select: { code: true, blocked: true, archivedAt: true } } },
    });

    const unavailable = items.filter((item) => item.machine.blocked || item.machine.archivedAt);
    if (unavailable.length > 0) {
      throw new ConflictException(`Máquina indisponível: ${unavailable.map((i) => i.machine.code).join(', ')}`);
    }

    const conflicts = await this.conflicts(
      items.map((i) => i.machineId),
      toIso(contract.startDate),
      toIso(contract.endDate),
      id,
    );
    if (conflicts.length > 0) throw this.conflictError(conflicts);

    try {
      await this.prisma.$transaction([
        this.prisma.contractItem.updateMany({ where: { contractId: id }, data: { reserved: true } }),
        this.prisma.contract.update({ where: { id }, data: { status: 'ACTIVE', activatedAt: new Date() } }),
      ]);
    } catch (error) {
      // Outra pessoa reservou a máquina no mesmo instante: a trava do banco recusou
      if (isOverlapViolation(error)) throw new ConflictException('A máquina acabou de ser reservada em outro contrato. Confira a agenda.');
      throw error;
    }
    await writeAudit(this.prisma, { action: 'contrato.ativado', entity: 'contract', entityId: id, actor });
    return this.get(id);
  }

  async finish(id: string, actor: Actor) {
    await this.findWithStatus(id, ['ACTIVE'], 'Só contratos ativos podem ser encerrados');
    await this.release(id, { status: 'FINISHED', finishedAt: new Date() });
    await writeAudit(this.prisma, { action: 'contrato.encerrado', entity: 'contract', entityId: id, actor });
    return this.get(id);
  }

  async cancel(id: string, actor: Actor) {
    await this.findWithStatus(id, ['DRAFT', 'ACTIVE'], 'Este contrato não pode mais ser cancelado');
    await this.release(id, { status: 'CANCELLED', cancelledAt: new Date() });
    await writeAudit(this.prisma, { action: 'contrato.cancelado', entity: 'contract', entityId: id, actor });
    return this.get(id);
  }

  private async release(id: string, data: { status: ContractStatus; finishedAt?: Date; cancelledAt?: Date }) {
    await this.prisma.$transaction([
      this.prisma.contractItem.updateMany({ where: { contractId: id }, data: { reserved: false } }),
      this.prisma.contract.update({ where: { id }, data }),
    ]);
  }

  private async findWithStatus(id: string, allowed: ContractStatus[], message: string) {
    const contract = await this.prisma.contract.findUnique({ where: { id } });
    if (!contract) throw new NotFoundException('Contrato não encontrado');
    if (!allowed.includes(contract.status)) throw new ConflictException(message);
    return contract;
  }

  private conflictError(conflicts: Conflict[]) {
    const text = conflicts
      .map((c) => `${c.machineCode} já está no contrato nº ${c.contractNumber} (${c.startDate} a ${c.endDate})`)
      .join('; ');
    return new ConflictException({ message: `Conflito de agenda: ${text}`, conflicts });
  }

  // Confere cliente e máquinas e calcula os valores no servidor (nunca confia no total da tela)
  private async prepare(data: ContractData) {
    const client = await this.prisma.client.findFirst({ where: { id: data.clientId, archivedAt: null }, select: { id: true } });
    if (!client) throw fieldError('clientId', 'Cliente não encontrado');

    const machineIds = data.items.map((item) => item.machineId);
    const machines = await this.prisma.machine.findMany({
      where: { id: { in: machineIds }, archivedAt: null },
      select: { id: true, type: { select: { dailyPrice: true } } },
    });
    if (machines.length !== machineIds.length) throw fieldError('items', 'Máquina não encontrada ou arquivada');

    const days = rentalDays(data.startDate, data.endDate);
    const startDate = toDate(data.startDate);
    const endDate = toDate(data.endDate);
    let totalCents = 0;

    // Contas em centavos (números inteiros) para não ter erro de arredondamento
    const items = data.items.map((item) => {
      const machine = machines.find((m) => m.id === item.machineId);
      const rate = item.dailyRate ?? Number(machine?.type.dailyPrice ?? 0);
      const amountCents = Math.round(rate * 100) * days;
      totalCents += amountCents;
      return { machineId: item.machineId, startDate, endDate, days, dailyRate: rate, amount: amountCents / 100, reserved: false };
    });

    return {
      contract: {
        clientId: data.clientId,
        startDate,
        endDate,
        siteName: data.siteName ?? null,
        siteZipCode: data.siteZipCode ?? null,
        siteStreet: data.siteStreet ?? null,
        siteNumber: data.siteNumber ?? null,
        siteDistrict: data.siteDistrict ?? null,
        siteCity: data.siteCity ?? null,
        siteState: data.siteState ?? null,
        paymentMethod: data.paymentMethod,
        installments: data.installments,
        notes: data.notes ?? null,
        totalAmount: totalCents / 100,
      },
      items,
    };
  }
}