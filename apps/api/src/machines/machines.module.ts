import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { MachinePhotosController } from './machine-photos.controller.js';
import { MachinePhotosService } from './machine-photos.service.js';
import { MachineTypesService } from './machine-types.service.js';
import { MachineTypesController, MachinesController } from './machines.controller.js';
import { MachinesService } from './machines.service.js';

@Module({
  imports: [AuthModule],
  controllers: [MachineTypesController, MachinesController, MachinePhotosController],
  providers: [MachineTypesService, MachinesService, MachinePhotosService],
})
export class MachinesModule {}