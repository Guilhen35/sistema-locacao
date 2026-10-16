import { randomUUID } from 'node:crypto';
import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import sharp from 'sharp';
import { type Actor, writeAudit } from '../common/audit.js';
import { PrismaService } from '../prisma/prisma.service.js';
import { StorageService } from '../storage/storage.service.js';

export const MAX_PHOTO_BYTES = 5 * 1024 * 1024;
const MAX_PHOTOS = 10;
const MAX_INPUT_PIXELS = 40_000_000;
const MAX_SIDE = 2000;
const ALLOWED_FORMATS = new Set(['jpeg', 'png', 'webp']);

function invalidImage() {
  return new BadRequestException('Envie uma foto JPG, PNG ou WebP de até 5 MB');
}

@Injectable()
export class MachinePhotosService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly storage: StorageService,
  ) {}

  // Confere se é imagem de verdade e grava de novo em WebP, sem metadados (GPS, câmera)
  private async processImage(buffer: Buffer) {
    try {
      const meta = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS }).metadata();
      if (!meta.format || !ALLOWED_FORMATS.has(meta.format)) throw invalidImage();

      const { data, info } = await sharp(buffer, { limitInputPixels: MAX_INPUT_PIXELS })
        .rotate()
        .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
        .webp({ quality: 82 })
        .toBuffer({ resolveWithObject: true });

      return { data, width: info.width, height: info.height, sizeBytes: info.size };
    } catch {
      // Arquivo corrompido, disfarçado de imagem ou grande demais: mesma resposta
      throw invalidImage();
    }
  }

  private async ensureMachine(machineId: string) {
    const machine = await this.prisma.machine.findFirst({ where: { id: machineId, archivedAt: null }, select: { id: true } });
    if (!machine) throw new NotFoundException('Máquina não encontrada');
  }

  async upload(machineId: string, buffer: Buffer, actor: Actor) {
    await this.ensureMachine(machineId);

    const count = await this.prisma.machinePhoto.count({ where: { machineId } });
    if (count >= MAX_PHOTOS) throw new BadRequestException(`Limite de ${MAX_PHOTOS} fotos por máquina`);

    const image = await this.processImage(buffer);
    const storageKey = `${randomUUID()}.webp`;
    await this.storage.put(storageKey, image.data);

    try {
      const photo = await this.prisma.machinePhoto.create({
        data: { machineId, storageKey, position: count, width: image.width, height: image.height, sizeBytes: image.sizeBytes },
        select: { id: true, position: true, width: true, height: true },
      });
      await writeAudit(this.prisma, { action: 'maquina.foto_adicionada', entity: 'machine', entityId: machineId, actor, after: photo });
      return photo;
    } catch (error) {
      // Se o banco falhar, não deixa arquivo órfão no disco
      await this.storage.remove(storageKey);
      throw error;
    }
  }

  async open(photoId: string) {
    const photo = await this.prisma.machinePhoto.findFirst({
      where: { id: photoId, machine: { archivedAt: null } },
      select: { storageKey: true },
    });
    if (!photo) throw new NotFoundException('Foto não encontrada');
    return this.storage.open(photo.storageKey);
  }

  async remove(machineId: string, photoId: string, actor: Actor) {
    // Confere que a foto é DESTA máquina (evita IDOR: apagar foto de outra máquina pelo id)
    const photo = await this.prisma.machinePhoto.findFirst({ where: { id: photoId, machineId } });
    if (!photo) throw new NotFoundException('Foto não encontrada');

    const remaining = await this.prisma.machinePhoto.findMany({
      where: { machineId, id: { not: photoId } },
      orderBy: { position: 'asc' },
      select: { id: true },
    });

    await this.prisma.$transaction([
      this.prisma.machinePhoto.delete({ where: { id: photoId } }),
      ...remaining.map((p, index) =>
        this.prisma.machinePhoto.update({ where: { id: p.id }, data: { position: index } }),
      ),
    ]);
    await this.storage.remove(photo.storageKey);
    await writeAudit(this.prisma, { action: 'maquina.foto_removida', entity: 'machine', entityId: machineId, actor, before: { photoId } });
  }

  async reorder(machineId: string, ids: string[], actor: Actor) {
    await this.ensureMachine(machineId);
    const photos = await this.prisma.machinePhoto.findMany({ where: { machineId }, select: { id: true } });
    const current = new Set(photos.map((p) => p.id));

    // A lista precisa ter exatamente as fotos desta máquina, sem repetir
    if (ids.length !== current.size || new Set(ids).size !== ids.length || !ids.every((id) => current.has(id))) {
      throw new BadRequestException('Lista de fotos inválida');
    }

    await this.prisma.$transaction(
      ids.map((id, index) => this.prisma.machinePhoto.update({ where: { id }, data: { position: index } })),
    );
    await writeAudit(this.prisma, { action: 'maquina.fotos_reordenadas', entity: 'machine', entityId: machineId, actor, after: { ids: ids.join(',') } });
  }
}