import { Global, Module } from '@nestjs/common';
import { PrismaService } from './prisma.service.js';

// Global: qualquer módulo da API pode usar o PrismaService sem importar este módulo
@Global()
@Module({
  providers: [PrismaService],
  exports: [PrismaService],
})
export class PrismaModule {}