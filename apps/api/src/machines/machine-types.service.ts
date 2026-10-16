import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MachineTypeData } from '@locacao/shared';
import { type Actor, isUniqueViolation, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

function toDb(data: MachineTypeData) {
  return {
    name: data.name,
    category: data.category,
    powerSource: data.powerSource,
    workingHeightM: data.workingHeightM,
    capacityKg: data.capacityKg,
    usage: data.usage ?? null,
    dailyPrice: data.dailyPrice,
    weeklyPrice: data.weeklyPrice ?? null,
    monthlyPrice: data.monthlyPrice ?? null,
  };
}

function nameConflict() {
  return new ConflictException({ message: 'Dados inválidos', errors: { name: ['Já existe um tipo com este nome'] } });
}

@Injectable()
export class MachineTypesService {
  constructor(private readonly prisma: PrismaService) {}

  list() {
    return this.prisma.machineType.findMany({
      where: { archivedAt: null },
      orderBy: [{ category: 'asc' }, { workingHeightM: 'asc' }],
      include: { _count: { select: { machines: { where: { archivedAt: null } } } } },
    });
  }

  async get(id: string) {
    const type = await this.prisma.machineType.findFirst({ where: { id, archivedAt: null } });
    if (!type) throw new NotFoundException('Tipo de máquina não encontrado');
    return type;
  }

  async create(data: MachineTypeData, actor: Actor) {
    try {
      const type = await this.prisma.machineType.create({ data: toDb(data) });
      await writeAudit(this.prisma, { action: 'tipo_maquina.criado', entity: 'machine_type', entityId: type.id, actor, after: type });
      return type;
    } catch (error) {
      throw isUniqueViolation(error) ? nameConflict() : error;
    }
  }

  async update(id: string, data: MachineTypeData, actor: Actor) {
    const before = await this.get(id);
    try {
      const after = await this.prisma.machineType.update({ where: { id }, data: toDb(data) });
      await writeAudit(this.prisma, { action: 'tipo_maquina.alterado', entity: 'machine_type', entityId: id, actor, before, after });
      return after;
    } catch (error) {
      throw isUniqueViolation(error) ? nameConflict() : error;
    }
  }

  async archive(id: string, actor: Actor) {
    const before = await this.get(id);
    const inUse = await this.prisma.machine.count({ where: { typeId: id, archivedAt: null } });
    if (inUse > 0) {
      throw new ConflictException('Este tipo tem máquinas ativas. Mude o tipo delas antes de arquivar.');
    }
    const after = await this.prisma.machineType.update({ where: { id }, data: { archivedAt: new Date() } });
    await writeAudit(this.prisma, { action: 'tipo_maquina.arquivado', entity: 'machine_type', entityId: id, actor, before, after });
  }
}