import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MaintenancesController } from './maintenances.controller.js';
import { MaintenancesService } from './maintenances.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MaintenancesController],
  providers: [MaintenancesService],
})
export class MaintenancesModule {}
