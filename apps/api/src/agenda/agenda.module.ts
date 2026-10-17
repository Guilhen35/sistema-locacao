import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module.js';
import { AgendaController } from './agenda.controller.js';
import { AgendaService } from './agenda.service.js';

@Module({
  imports: [AuthModule],
  controllers: [AgendaController],
  providers: [AgendaService],
})
export class AgendaModule {}
