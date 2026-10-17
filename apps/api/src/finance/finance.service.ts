import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { EntryData, EntryFilter, EntryKind, PayEntryData } from '@locacao/shared';
import { todayInSaoPaulo } from '../agenda/agenda.service.js';
import { type Actor, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

type EntryWhere = NonNullable<NonNullable<Parameters<PrismaService['financialEntry']['findMany']>[0]>['where']>;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (value: Date) => value.toISOString().slice(0, 10);
const SYNC_BATCH = 200;

// Mesmo dia nos meses seguintes; 31/01 + 1 mês vira 28/02
function addMonths(date: Date, months: number): Date {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(date.getUTCDate(), lastDay));
  return target;
}

// Divide em centavos; a sobra do arredondamento fica na 1ª parcela
export function splitInstallments(total: number, count: number): number[] {
  const cents = Math.round(total * 100);
  const base = Math.floor(cents / count);
  return Array.from({ length: count }, (_, i) => (i === 0 ? base + cents - base * count : base) / 100);
}

function monthRange(month: string) {
  const start = toDate(`${month}-01`);
  return { gte: start, lt: addMonths(start, 1) };
}

@Injectable()
export class FinanceService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { kind: EntryKind; filter: EntryFilter; month: string }) {
    await this.sync();
    const today = toDate(todayInSaoPaulo());
    const month = monthRange(params.month);

    const base: EntryWhere = { cancelledAt: null };
    const byFilter: Record<EntryFilter, EntryWhere> = {
      all: { dueDate: month },
      open: { dueDate: month, paidAt: null },
      // Atrasados aparecem mesmo sendo de meses anteriores
      overdue: { paidAt: null, dueDate: { lt: today } },
      paid: { dueDate: month, paidAt: { not: null } },
    };
    const where: EntryWhere = { ...base, ...byFilter[params.filter] };

    const sum = async (extra: EntryWhere) => {
      const result = await this.prisma.financialEntry.aggregate({ where: { ...base, ...extra }, _sum: { amount: true } });
      return Number(result._sum.amount ?? 0);
    };

    const [rows, receivableCount, payableCount, receivable, received, overdue, payable] = await Promise.all([
      this.prisma.financialEntry.findMany({
        where: { ...where, kind: params.kind },
        orderBy: [{ dueDate: 'asc' }, { createdAt: 'asc' }],
        take: 500,
        include: {
          contract: { select: { id: true, number: true, client: { select: { id: true, name: true, tradeName: true } } } },
          maintenance: { select: { id: true, machine: { select: { code: true } } } },
        },
      }),
      this.prisma.financialEntry.count({ where: { ...where, kind: 'RECEIVABLE' } }),
      this.prisma.financialEntry.count({ where: { ...where, kind: 'PAYABLE' } }),
      sum({ kind: 'RECEIVABLE', dueDate: month }),
      sum({ kind: 'RECEIVABLE', dueDate: month, paidAt: { not: null } }),
      sum({ kind: 'RECEIVABLE', paidAt: null, dueDate: { lt: today } }),
      sum({ kind: 'PAYABLE', dueDate: month }),
    ]);

    return {
      today: toIso(today),
      totals: { receivable, received, overdue, payable },
      counts: { RECEIVABLE: receivableCount, PAYABLE: payableCount },
      items: rows.map((row) => ({
        ...row,
        dueDate: toIso(row.dueDate),
        paidAt: row.paidAt ? toIso(row.paidAt) : null,
        manual: !row.contractId && !row.maintenanceId,
      })),
    };
  }

  async create(data: EntryData, actor: Actor) {
    const today = todayInSaoPaulo();
    const entry = await this.prisma.financialEntry.create({
      data: {
        kind: data.kind,
        description: data.description,
        supplier: data.supplier ?? null,
        dueDate: toDate(data.dueDate),
        amount: data.amount,
        paymentMethod: data.paymentMethod ?? null,
        paidAt: data.paid ? toDate(data.dueDate < today ? data.dueDate : today) : null,
        notes: data.notes ?? null,
      },
    });
    await writeAudit(this.prisma, { action: 'financeiro.lancado', entity: 'financial_entry', entityId: entry.id, actor, after: entry });
    return entry;
  }

  async pay(id: string, data: PayEntryData, actor: Actor) {
    if (data.paidAt > todayInSaoPaulo()) {
      throw new BadRequestException({ message: 'Dados inválidos', errors: { paidAt: ['A data do pagamento não pode ser futura'] } });
    }
    const entry = await this.find(id);
    // updateMany com condição evita baixa dupla se dois cliques chegarem juntos
    await this.prisma.$transaction(async (tx) => {
      const result = await tx.financialEntry.updateMany({
        where: { id, paidAt: null, cancelledAt: null },
        data: { paidAt: toDate(data.paidAt), paymentMethod: data.paymentMethod },
      });
      if (result.count === 0) throw new ConflictException('Este lançamento já foi pago ou cancelado');
      if (entry.maintenanceId) {
        await tx.maintenance.update({ where: { id: entry.maintenanceId }, data: { paid: true, paymentMethod: data.paymentMethod } });
      }
    });
    await writeAudit(this.prisma, { action: 'financeiro.baixa', entity: 'financial_entry', entityId: id, actor, before: entry, after: data });
    return this.find(id);
  }

  async unpay(id: string, actor: Actor) {
    const entry = await this.find(id);
    if (!entry.paidAt) throw new ConflictException('Este lançamento não está pago');
    await this.prisma.$transaction(async (tx) => {
      await tx.financialEntry.update({ where: { id }, data: { paidAt: null } });
      if (entry.maintenanceId) await tx.maintenance.update({ where: { id: entry.maintenanceId }, data: { paid: false } });
    });
    await writeAudit(this.prisma, { action: 'financeiro.estorno', entity: 'financial_entry', entityId: id, actor, before: entry });
    return this.find(id);
  }

  // Só lançamentos manuais; parcelas e manutenções seguem o contrato/manutenção de origem
  async cancel(id: string, actor: Actor) {
    const entry = await this.find(id);
    if (entry.contractId || entry.maintenanceId) {
      throw new ConflictException('Este lançamento vem de um contrato ou manutenção. Altere na origem.');
    }
    if (entry.paidAt) throw new ConflictException('Desfaça o pagamento antes de cancelar');
    await this.prisma.financialEntry.update({ where: { id }, data: { cancelledAt: new Date() } });
    await writeAudit(this.prisma, { action: 'financeiro.cancelado', entity: 'financial_entry', entityId: id, actor, before: entry });
  }

  private async find(id: string) {
    const entry = await this.prisma.financialEntry.findFirst({ where: { id, cancelledAt: null } });
    if (!entry) throw new NotFoundException('Lançamento não encontrado');
    return entry;
  }

  // Gera e atualiza lançamentos a partir de contratos e manutenções
  private async sync() {
    const contracts = await this.prisma.contract.findMany({
      where: { status: { in: ['ACTIVE', 'FINISHED'] }, financialEntries: { none: {} } },
      select: { id: true, number: true, startDate: true, totalAmount: true, installments: true, paymentMethod: true },
      take: SYNC_BATCH,
    });
    const installments = contracts.flatMap((c) =>
      splitInstallments(Number(c.totalAmount), c.installments).map((amount, i) => ({
        kind: 'RECEIVABLE' as const,
        description: `Contrato nº ${c.number} · parcela ${i + 1} de ${c.installments}`,
        dueDate: addMonths(c.startDate, i),
        amount,
        paymentMethod: c.paymentMethod,
        contractId: c.id,
        installmentNumber: i + 1,
        installmentCount: c.installments,
      })),
    );

    const maintenances = await this.prisma.maintenance.findMany({
      where: { sendToFinance: true, totalAmount: { gt: 0 }, financialEntry: null },
      select: {
        id: true,
        date: true,
        dueDate: true,
        description: true,
        supplier: true,
        totalAmount: true,
        paymentMethod: true,
        paid: true,
        machine: { select: { code: true } },
      },
      take: SYNC_BATCH,
    });
    const expenses = maintenances.map((m) => ({
      kind: 'PAYABLE' as const,
      description: `Manutenção ${m.machine.code}: ${m.description}`.slice(0, 200),
      supplier: m.supplier,
      dueDate: m.dueDate ?? m.date,
      amount: m.totalAmount,
      paymentMethod: m.paymentMethod,
      paidAt: m.paid ? (m.dueDate ?? m.date) : null,
      maintenanceId: m.id,
    }));

    const now = new Date();
    await this.prisma.$transaction([
      // skipDuplicates + índices únicos: duas abas abertas não duplicam lançamentos
      this.prisma.financialEntry.createMany({ data: [...installments, ...expenses], skipDuplicates: true }),
      this.prisma.financialEntry.updateMany({
        where: { cancelledAt: null, paidAt: null, contract: { status: 'CANCELLED' } },
        data: { cancelledAt: now },
      }),
      this.prisma.financialEntry.updateMany({
        where: { cancelledAt: null, paidAt: null, maintenance: { sendToFinance: false } },
        data: { cancelledAt: now },
      }),
      // Manutenção editada depois de lançada: atualiza valor e vencimento
      this.prisma.$executeRaw`
        UPDATE financial_entries fe
        SET amount = m.total_amount, due_date = COALESCE(m.due_date, m.date), updated_at = now()
        FROM maintenances m
        WHERE fe.maintenance_id = m.id AND fe.paid_at IS NULL AND fe.cancelled_at IS NULL AND m.total_amount > 0
          AND (fe.amount <> m.total_amount OR fe.due_date <> COALESCE(m.due_date, m.date))`,
    ]);
  }
}