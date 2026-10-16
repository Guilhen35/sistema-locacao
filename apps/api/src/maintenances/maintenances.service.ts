import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MaintenanceData, MaintenanceStatus } from '@locacao/shared';
import { type Actor, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 30;
const toDate = (value: string) => new Date(`${value}T00:00:00Z`);

// Valores calculados no servidor, em centavos (nunca confia no total da tela)
function prepare(data: MaintenanceData) {
  let totalCents = 0;
  const items = data.items.map((item) => {
    const amountCents = Math.round(item.quantity * Math.round(item.unitPrice * 100));
    totalCents += amountCents;
    return { description: item.description, quantity: item.quantity, unitPrice: item.unitPrice, amount: amountCents / 100 };
  });
  return {
    fields: {
      machineId: data.machineId,
      kind: data.kind,
      date: toDate(data.date),
      hourMeter: data.hourMeter ?? null,
      description: data.description,
      blocksMachine: data.blocksMachine,
      supplier: data.supplier ?? null,
      paymentMethod: data.paymentMethod ?? null,
      dueDate: data.dueDate ? toDate(data.dueDate) : null,
      paid: data.paid,
      sendToFinance: data.sendToFinance,
      totalAmount: totalCents / 100,
    },
    items,
  };
}

@Injectable()
export class MaintenancesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { machineId?: string | undefined; status?: MaintenanceStatus | undefined; page: number }) {
    const where = {
      ...(params.machineId ? { machineId: params.machineId } : {}),
      ...(params.status ? { status: params.status } : {}),
    };
    const [total, items] = await this.prisma.$transaction([
      this.prisma.maintenance.count({ where }),
      this.prisma.maintenance.findMany({
        where,
        orderBy: [{ date: 'desc' }, { createdAt: 'desc' }],
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: { machine: { select: { id: true, code: true } }, _count: { select: { items: true } } },
      }),
    ]);
    return { total, page: params.page, pageSize: PAGE_SIZE, items };
  }

  async get(id: string) {
    const maintenance = await this.prisma.maintenance.findUnique({
      where: { id },
      include: { items: true, machine: { select: { id: true, code: true } } },
    });
    if (!maintenance) throw new NotFoundException('Manutenção não encontrada');
    return maintenance;
  }

  async create(data: MaintenanceData, actor: Actor) {
    await this.ensureMachine(data.machineId);
    const { fields, items } = prepare(data);
    const maintenance = await this.prisma.maintenance.create({ data: { ...fields, items: { create: items } } });
    await this.syncHourMeter(data.machineId, data.hourMeter);
    await writeAudit(this.prisma, { action: 'manutencao.criada', entity: 'maintenance', entityId: maintenance.id, actor, after: maintenance });
    return maintenance;
  }

  async update(id: string, data: MaintenanceData, actor: Actor) {
    const before = await this.get(id);
    if (before.status === 'DONE') throw new ConflictException('Manutenção concluída não pode ser alterada');
    await this.ensureMachine(data.machineId);
    const { fields, items } = prepare(data);
    const [, after] = await this.prisma.$transaction([
      this.prisma.maintenanceItem.deleteMany({ where: { maintenanceId: id } }),
      this.prisma.maintenance.update({ where: { id }, data: { ...fields, items: { create: items } } }),
    ]);
    await this.syncHourMeter(data.machineId, data.hourMeter);
    await writeAudit(this.prisma, { action: 'manutencao.alterada', entity: 'maintenance', entityId: id, actor, before, after });
    return after;
  }

  // Concluir libera a máquina para novos contratos
  async finish(id: string, actor: Actor) {
    const before = await this.get(id);
    if (before.status === 'DONE') throw new ConflictException('Esta manutenção já foi concluída');
    await this.prisma.maintenance.update({ where: { id }, data: { status: 'DONE', finishedAt: new Date() } });
    await writeAudit(this.prisma, { action: 'manutencao.concluida', entity: 'maintenance', entityId: id, actor });
    return this.get(id);
  }

  private async ensureMachine(machineId: string) {
    const machine = await this.prisma.machine.findFirst({ where: { id: machineId, archivedAt: null }, select: { id: true } });
    if (!machine) throw new BadRequestException({ message: 'Dados inválidos', errors: { machineId: ['Máquina não encontrada'] } });
  }

  // O horímetro da máquina só avança, nunca volta
  private async syncHourMeter(machineId: string, hourMeter: number | undefined) {
    if (hourMeter === undefined) return;
    await this.prisma.machine.updateMany({
      where: { id: machineId, OR: [{ hourMeter: null }, { hourMeter: { lt: hourMeter } }] },
      data: { hourMeter },
    });
  }
}
