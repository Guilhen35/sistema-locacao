import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

const toDate = (value: string) => new Date(`${value}T00:00:00Z`);
const toIso = (value: Date) => value.toISOString().slice(0, 10);

// "Hoje" no fuso da empresa, não do servidor (que roda em UTC)
export function todayInSaoPaulo(): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(new Date());
}

const itemInclude = {
  machine: { select: { id: true, code: true } },
  contract: {
    select: {
      id: true,
      number: true,
      siteName: true,
      siteStreet: true,
      siteNumber: true,
      siteDistrict: true,
      siteCity: true,
      client: { select: { id: true, name: true, tradeName: true, contactName: true, phone: true } },
    },
  },
} as const;

@Injectable()
export class AgendaService {
  constructor(private readonly prisma: PrismaService) {}

  // Só contratos ativos (itens reservados) entram na agenda
  async movements(from: string, to: string) {
    const today = todayInSaoPaulo();
    const range = { gte: toDate(from), lt: toDate(to) };

    const [inRange, overdue] = await this.prisma.$transaction([
      this.prisma.contractItem.findMany({
        where: { reserved: true, OR: [{ startDate: range }, { endDate: range }] },
        include: itemInclude,
        orderBy: [{ startDate: 'asc' }, { machine: { code: 'asc' } }],
        take: 1000,
      }),
      this.prisma.contractItem.findMany({
        where: { reserved: true, endDate: { lt: toDate(today) } },
        include: itemInclude,
        orderBy: { endDate: 'asc' },
        take: 100,
      }),
    ]);

    const toMovement = ({ contract, ...row }: (typeof inRange)[number]) => ({
      id: row.id,
      startDate: toIso(row.startDate),
      endDate: toIso(row.endDate),
      machine: row.machine,
      contract: { id: contract.id, number: contract.number },
      client: contract.client,
      site: {
        name: contract.siteName,
        street: contract.siteStreet,
        number: contract.siteNumber,
        district: contract.siteDistrict,
        city: contract.siteCity,
      },
    });

    return { today, items: inRange.map(toMovement), overdue: overdue.map(toMovement) };
  }

  async maintenances(from: string, to: string) {
    const rows = await this.prisma.maintenance.findMany({
      where: { OR: [{ date: { gte: toDate(from), lt: toDate(to) } }, { status: 'OPEN' }] },
      select: {
        id: true,
        date: true,
        status: true,
        description: true,
        blocksMachine: true,
        machine: { select: { id: true, code: true } },
      },
      orderBy: { date: 'asc' },
      take: 500,
    });
    return rows.map((row) => ({ ...row, date: toIso(row.date) }));
  }
}