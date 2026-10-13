import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service.js';

@Controller('health')
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get()
  async check() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok' };
    } catch {
      // Não expõe o erro do banco para quem chamou: detalhes ficam só nos logs do servidor
      throw new ServiceUnavailableException({ status: 'unavailable' });
    }
  }
}