import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import type { MachineData } from '@locacao/shared';
import { type Actor, isUniqueViolation, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';

const PAGE_SIZE = 48;
const CODE_PREFIX = 'PLT-';

type MachineWhere = NonNullable<NonNullable<Parameters<PrismaService['machine']['findMany']>[0]>['where']>;

function toDb(data: MachineData) {
  return {
    code: data.code,
    typeId: data.typeId,
    manufacturer: data.manufacturer ?? null,
    model: data.model ?? null,
    year: data.year ?? null,
    serialNumber: data.serialNumber ?? null,
    assetTag: data.assetTag ?? null,
    hourMeter: data.hourMeter ?? null,
    blocked: data.blocked,
    blockedReason: data.blocked ? (data.blockedReason ?? null) : null,
    showOnWebsite: data.showOnWebsite,
  };
}

function codeConflict() {
  return new ConflictException({ message: 'Dados inválidos', errors: { code: ['Já existe uma máquina com este código'] } });
}

const TYPE_SUMMARY = { id: true, name: true, category: true, powerSource: true, workingHeightM: true } as const;

@Injectable()
export class MachinesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(params: { q?: string | undefined; typeId?: string | undefined; page: number }) {
    const where: MachineWhere = { archivedAt: null };
    if (params.typeId) where.typeId = params.typeId;

    const q = params.q?.trim();
    if (q) {
      where.OR = [
        { code: { contains: q, mode: 'insensitive' } },
        { manufacturer: { contains: q, mode: 'insensitive' } },
        { model: { contains: q, mode: 'insensitive' } },
        { type: { name: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const [total, rows] = await this.prisma.$transaction([
      this.prisma.machine.count({ where }),
      this.prisma.machine.findMany({
        where,
        orderBy: { code: 'asc' },
        skip: (params.page - 1) * PAGE_SIZE,
        take: PAGE_SIZE,
        include: {
          type: { select: TYPE_SUMMARY },
          photos: { select: { id: true }, orderBy: { position: 'asc' }, take: 1 },
        },
      }),
    ]);

    return {
      total,
      page: params.page,
      pageSize: PAGE_SIZE,
      items: rows.map(({ photos, ...machine }) => ({ ...machine, coverPhotoId: photos[0]?.id ?? null })),
    };
  }

  async get(id: string) {
    const machine = await this.prisma.machine.findFirst({
      where: { id, archivedAt: null },
      include: {
        type: true,
        photos: { select: { id: true, position: true, width: true, height: true }, orderBy: { position: 'asc' } },
      },
    });
    if (!machine) throw new NotFoundException('Máquina não encontrada');
    return machine;
  }

  // Sugere o próximo código livre: PLT-001, PLT-002...
  async nextCode() {
    const last = await this.prisma.machine.findFirst({
      where: { code: { startsWith: CODE_PREFIX } },
      orderBy: { code: 'desc' },
      select: { code: true },
    });
    const lastNumber = last ? Number.parseInt(last.code.slice(CODE_PREFIX.length), 10) : 0;
    const next = Number.isFinite(lastNumber) ? lastNumber + 1 : 1;
    return { code: `${CODE_PREFIX}${String(next).padStart(3, '0')}` };
  }

  async create(data: MachineData, actor: Actor) {
    await this.ensureType(data.typeId);
    try {
      const machine = await this.prisma.machine.create({ data: toDb(data) });
      await writeAudit(this.prisma, { action: 'maquina.criada', entity: 'machine', entityId: machine.id, actor, after: machine });
      return machine;
    } catch (error) {
      throw isUniqueViolation(error) ? codeConflict() : error;
    }
  }

  async update(id: string, data: MachineData, actor: Actor) {
    const before = await this.findRow(id);
    await this.ensureType(data.typeId);
    try {
      const after = await this.prisma.machine.update({ where: { id }, data: toDb(data) });
      await writeAudit(this.prisma, { action: 'maquina.alterada', entity: 'machine', entityId: id, actor, before, after });
      return after;
    } catch (error) {
      throw isUniqueViolation(error) ? codeConflict() : error;
    }
  }

  async archive(id: string, actor: Actor) {
    const before = await this.findRow(id);
    const after = await this.prisma.machine.update({ where: { id }, data: { archivedAt: new Date(), showOnWebsite: false } });
    await writeAudit(this.prisma, { action: 'maquina.arquivada', entity: 'machine', entityId: id, actor, before, after });
  }

  private async findRow(id: string) {
    const machine = await this.prisma.machine.findFirst({ where: { id, archivedAt: null } });
    if (!machine) throw new NotFoundException('Máquina não encontrada');
    return machine;
  }

  private async ensureType(typeId: string) {
    const type = await this.prisma.machineType.findFirst({ where: { id: typeId, archivedAt: null }, select: { id: true } });
    if (!type) {
      throw new BadRequestException({ message: 'Dados inválidos', errors: { typeId: ['Tipo de máquina não encontrado'] } });
    }
  }
}