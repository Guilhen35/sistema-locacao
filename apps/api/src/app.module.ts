import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_GUARD } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { AppController } from './app.controller.js';
import { AppService } from './app.service.js';
import { AuthModule } from './auth/auth.module.js';
import { ClientsModule } from './clients/clients.module.js';
import { ContractsModule } from './contracts/contracts.module.js';
import { MachinesModule } from './machines/machines.module.js';
import { MaintenancesModule } from './maintenances/maintenances.module.js';
import { AgendaModule } from './agenda/agenda.module.js';
import { FinanceModule } from './finance/finance.module.js';
import { DashboardModule } from './dashboard/dashboard.module.js';
import { HealthController } from './health/health.controller.js';
import { PrismaModule } from './prisma/prisma.module.js';
import { StorageModule } from './storage/storage.module.js';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    // Padrão: 120 requisições por minuto por IP em qualquer rota
    ThrottlerModule.forRoot([{ ttl: 60_000, limit: 120 }]),
    PrismaModule,
    StorageModule,
    AuthModule,
    ClientsModule,
    ContractsModule,
    MachinesModule,
    AgendaModule,
    FinanceModule,
    DashboardModule,
    MaintenancesModule,
  ],
  controllers: [AppController, HealthController],
  providers: [AppService, { provide: APP_GUARD, useClass: ThrottlerGuard }],
})
export class AppModule {}
