import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import { originCheck } from './common/middleware/origin-check.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Cabeçalhos de segurança; também remove o X-Powered-By
  app.use(helmet());
  app.use(originCheck((process.env['WEB_ORIGIN'] ?? '').split(',').map((o) => o.trim()).filter(Boolean)));

  // Limite de tamanho das requisições (proteção contra DoS)
  app.useBodyParser('json', { limit: '100kb' });
  app.useBodyParser('urlencoded', { limit: '100kb', extended: false });

  // Só os endereços do painel podem chamar a API pelo navegador
  const allowedOrigins = config
    .getOrThrow<string>('WEB_ORIGIN')
    .split(',')
    .map((origin) => origin.trim())
    .filter(Boolean);

  app.enableCors({
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST', 'PATCH', 'DELETE'],
  });

  // Todas as rotas ficam em /api/... (o health check fica fora, para a hospedagem)
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Fecha conexões com calma ao reiniciar ou fazer deploy
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT') ?? 3000);
}

await bootstrap();