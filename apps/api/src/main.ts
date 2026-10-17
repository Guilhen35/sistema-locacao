import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { NestFactory } from '@nestjs/core';
import { ConfigService } from '@nestjs/config';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import { originCheck } from './common/middleware/origin-check.js';
import { AppModule } from './app.module.js';

async function bootstrap() {
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  const config = app.get(ConfigService);

  // Atrás do proxy da hospedagem: lê o IP real (limite de tentativas e auditoria)
  app.set('trust proxy', Number(process.env['TRUST_PROXY_HOPS'] ?? 1));

  // Cabeçalhos de segurança; também remove o X-Powered-By
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'", 'https://fonts.googleapis.com'],
          fontSrc: ["'self'", 'data:', 'https://fonts.gstatic.com'],
          // blob: para a prévia da foto antes do envio
          imgSrc: ["'self'", 'data:', 'blob:'],
          // ViaCEP é chamado pelo navegador no cadastro de endereço
          connectSrc: ["'self'", 'https://viacep.com.br'],
          objectSrc: ["'none'"],
          baseUri: ["'self'"],
          formAction: ["'self'"],
          frameAncestors: ["'none'"],
        },
      },
    }),
  );
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
    methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'],
  });

  // Todas as rotas ficam em /api/... (o health check fica fora, para a hospedagem)
  app.setGlobalPrefix('api', { exclude: ['health'] });

  // Em produção a API também entrega a tela: mesmo endereço, cookie de login seguro
  const webDist = resolve(process.env['WEB_DIST_DIR'] ?? join(process.cwd(), '../web/dist'));
  if (existsSync(join(webDist, 'index.html'))) {
    app.useStaticAssets(webDist, { index: false, maxAge: '1h' });
    app.use((req: Request, res: Response, next: NextFunction) => {
      const isPage = req.method === 'GET' && !req.path.startsWith('/api') && req.path !== '/health';
      if (!isPage) return next();
      res.setHeader('Cache-Control', 'no-cache');
      res.sendFile(join(webDist, 'index.html'));
    });
  }

  // Fecha conexões com calma ao reiniciar ou fazer deploy
  app.enableShutdownHooks();

  await app.listen(config.get<number>('PORT') ?? 3000);
}

await bootstrap();