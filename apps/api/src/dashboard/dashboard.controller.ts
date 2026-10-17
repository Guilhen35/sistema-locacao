import { Controller, Get } from '@nestjs/common';
import { RequirePermission } from '../auth/require-permission.decorator.js';
import { DashboardService } from './dashboard.service.js';

// Um endpoint por área: cada bloco do painel respeita a permissão da sua área
@Controller('dashboard')
export class DashboardController {
  constructor(private readonly dashboard: DashboardService) {}

  @Get('fleet')
  @RequirePermission('maquinas:ler')
  fleet() {
    return this.dashboard.fleet();
  }

  @Get('rentals')
  @RequirePermission('contratos:ler')
  rentals() {
    return this.dashboard.rentals();
  }

  @Get('financial')
  @RequirePermission('financeiro:ler')
  financial() {
    return this.dashboard.financial();
  }
}