import { Injectable } from '@nestjs/common';
import { todayInSaoPaulo } from '../agenda/agenda.service.js';
import { FinanceService } from '../finance/finance.service.js';
import { PrismaService } from '../prisma/prisma.service.js';

const DAY_MS = 86_400_000;
const REVENUE_MONTHS = 6;
const LIST_SIZE = 5;

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (value: Date) => value.toISOString().slice(0, 10);
const addDays = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);
const monthStart = (date: Date, offset = 0) => new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + offset, 1));

// Dias do aluguel que caem dentro do período [from, to)
function overlapDays(start: Date, end: Date, from: Date, to: Date): number {
  const s = Math.max(start.getTime(), from.getTime());
  const e = Math.min(end.getTime(), to.getTime());
  return e > s ? Math.round((e - s) / DAY_MS) : 0;
}

type EntryWhere = NonNullable<NonNullable<Parameters<PrismaService['financialEntry']['findMany']>[0]>['where']>;

type FleetStatus = 'AVAILABLE' | 'RENTED' | 'RESERVED' | 'MAINTENANCE' | 'BLOCKED';

@Injectable()
export class DashboardService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly finance: FinanceService,
  ) {}

  async fleet() {
    const today = toDate(todayInSaoPaulo());
    const machines = await this.prisma.machine.findMany({
      where: { archivedAt: null },
      select: {
        blocked: true,
        maintenances: { where: { status: 'OPEN', blocksMachine: true }, select: { id: true }, take: 1 },
        contractItems: { where: { reserved: true }, select: { startDate: true }, orderBy: { startDate: 'asc' }, take: 1 },
      },
    });

    const counts: Record<FleetStatus, number> = { AVAILABLE: 0, RENTED: 0, RESERVED: 0, MAINTENANCE: 0, BLOCKED: 0 };
    for (const m of machines) {
      const next = m.contractItems[0];
      if (m.blocked) counts.BLOCKED += 1;
      else if (m.maintenances.length > 0) counts.MAINTENANCE += 1;
      else if (!next) counts.AVAILABLE += 1;
      else if (next.startDate <= today) counts.RENTED += 1;
      else counts.RESERVED += 1;
    }
    return { total: machines.length, counts };
  }

  // Máquinas mais alugadas no mês (dias alugados ÷ dias do mês)
  async rentals() {
    const today = toDate(todayInSaoPaulo());
    const from = monthStart(today);
    const to = monthStart(today, 1);
    const daysInMonth = Math.round((to.getTime() - from.getTime()) / DAY_MS);

    const [machines, items, activeContracts, startingSoon] = await Promise.all([
      this.prisma.machine.findMany({ where: { archivedAt: null }, select: { id: true, code: true } }),
      this.prisma.contractItem.findMany({
        where: { startDate: { lt: to }, endDate: { gt: from }, contract: { status: { in: ['ACTIVE', 'FINISHED'] } } },
        select: { machineId: true, startDate: true, endDate: true },
        take: 5000,
      }),
      this.prisma.contract.count({ where: { status: 'ACTIVE' } }),
      this.prisma.contract.count({
        where: { status: { in: ['DRAFT', 'ACTIVE'] }, startDate: { gte: today, lt: addDays(today, 7) } },
      }),
    ]);

    const days = new Map<string, number>();
    for (const item of items) {
      days.set(item.machineId, (days.get(item.machineId) ?? 0) + overlapDays(item.startDate, item.endDate, from, to));
    }

    const ranking = machines
      .map((m) => {
        const rented = Math.min(days.get(m.id) ?? 0, daysInMonth);
        return { machineId: m.id, code: m.code, days: rented, occupancy: Math.round((rented / daysInMonth) * 100) };
      })
      .sort((a, b) => b.days - a.days || a.code.localeCompare(b.code))
      .slice(0, 12);

    return { month: toIso(from).slice(0, 7), daysInMonth, activeContracts, startingSoon, ranking };
  }

  async financial() {
    await this.finance.sync();
    const todayIso = todayInSaoPaulo();
    const today = toDate(todayIso);
    const month = { gte: monthStart(today), lt: monthStart(today, 1) };
    const open = { cancelledAt: null, paidAt: null };

    const sum = async (where: EntryWhere) => {
      const r = await this.prisma.financialEntry.aggregate({ where: { cancelledAt: null, ...where }, _sum: { amount: true }, _count: true });
      return { amount: Number(r._sum.amount ?? 0), count: r._count };
    };

    const entrySelect = {
      id: true,
      description: true,
      supplier: true,
      dueDate: true,
      amount: true,
      contract: { select: { number: true, client: { select: { name: true, tradeName: true } } } },
    } as const;

    const [receivable, received, overdue, receivables, payables, { revenue, topClients }] = await Promise.all([
      sum({ kind: 'RECEIVABLE', dueDate: month }),
      sum({ kind: 'RECEIVABLE', dueDate: month, paidAt: { not: null } }),
      sum({ kind: 'RECEIVABLE', paidAt: null, dueDate: { lt: today } }),
      this.prisma.financialEntry.findMany({
        where: { ...open, kind: 'RECEIVABLE' },
        orderBy: { dueDate: 'asc' },
        take: LIST_SIZE,
        select: entrySelect,
      }),
      this.prisma.financialEntry.findMany({
        where: { ...open, kind: 'PAYABLE' },
        orderBy: { dueDate: 'asc' },
        take: LIST_SIZE,
        select: entrySelect,
      }),
      this.revenueReport(today),
    ]);

    const toRow = (e: (typeof receivables)[number]) => ({
      id: e.id,
      who: e.contract ? (e.contract.client.tradeName ?? e.contract.client.name) : (e.supplier ?? e.description),
      description: e.description,
      dueDate: toIso(e.dueDate),
      amount: Number(e.amount),
    });

    return {
      today: todayIso,
      totals: { receivable: receivable.amount, received: received.amount, overdue: overdue.amount, overdueCount: overdue.count },
      receivables: receivables.map(toRow),
      payables: payables.map(toRow),
      revenue,
      topClients,
    };
  }

  // Faturamento por competência: diária × dias alugados em cada mês (por tipo e por cliente)
  private async revenueReport(today: Date) {
    const from = monthStart(today, -(REVENUE_MONTHS - 1));
    const to = monthStart(today, 1);
    const months = Array.from({ length: REVENUE_MONTHS }, (_, i) => monthStart(from, i));

    const items = await this.prisma.contractItem.findMany({
      where: { startDate: { lt: to }, endDate: { gt: from }, contract: { status: { in: ['ACTIVE', 'FINISHED'] } } },
      select: {
        startDate: true,
        endDate: true,
        dailyRate: true,
        machine: { select: { type: { select: { id: true, name: true } } } },
        contract: { select: { client: { select: { id: true, name: true, tradeName: true } } } },
      },
      take: 5000,
    });

    const types = new Map<string, { id: string; name: string; total: number }>();
    const cents = new Map<string, number>();
    const clients = new Map<string, { id: string; name: string; month: number; sixMonths: number }>();
    const lastMonth = REVENUE_MONTHS - 1;
    for (const item of items) {
      const type = item.machine.type;
      const client = item.contract.client;
      const rate = Math.round(Number(item.dailyRate) * 100);
      months.forEach((m, i) => {
        const value = rate * overlapDays(item.startDate, item.endDate, m, monthStart(m, 1));
        if (!value) return;
        const key = `${i}:${type.id}`;
        cents.set(key, (cents.get(key) ?? 0) + value);
        const entry = types.get(type.id) ?? { id: type.id, name: type.name, total: 0 };
        entry.total += value;
        types.set(type.id, entry);

        const c = clients.get(client.id) ?? { id: client.id, name: client.tradeName ?? client.name, month: 0, sixMonths: 0 };
        c.sixMonths += value;
        if (i === lastMonth) c.month += value;
        clients.set(client.id, c);
      });
    }

    const top = (field: 'month' | 'sixMonths') =>
      [...clients.values()]
        .filter((c) => c[field] > 0)
        .sort((a, b) => b[field] - a[field])
        .slice(0, 5)
        .map((c) => ({ clientId: c.id, name: c.name, amount: c[field] / 100 }));

    // Ordem fixa por faturamento total: a cor de cada tipo não muda entre os meses
    const typeList = [...types.values()].sort((a, b) => b.total - a.total);
    return {
      revenue: {
        types: typeList.map((t) => ({ id: t.id, name: t.name })),
        months: months.map((m, i) => ({
          month: toIso(m).slice(0, 7),
          values: typeList.map((t) => (cents.get(`${i}:${t.id}`) ?? 0) / 100),
        })),
      },
      topClients: { month: top('month'), sixMonths: top('sixMonths') },
    };
  }
}