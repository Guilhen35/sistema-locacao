import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MachineTypesService } from './machine-types.service.js';
import { MachineTypesController, MachinesController } from './machines.controller.js';
import { MachinesService } from './machines.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MachineTypesController, MachinesController],
  providers: [MachineTypesService, MachinesService],
})
export class MachinesModule {}