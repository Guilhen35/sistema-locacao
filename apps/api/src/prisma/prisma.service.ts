import { Injectable, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '../generated/prisma/client.js';

// Com o certificado do provedor (DATABASE_CA_CERT), a conexão é criptografada E verificada:
// impede que alguém no caminho se passe pelo banco. O sslmode da URL fica para o "prisma migrate"
function sslOptions(url: string, ca: string | undefined) {
  if (!ca) return { connectionString: url };
  const parsed = new URL(url);
  parsed.searchParams.delete('sslmode');
  return {
    connectionString: parsed.toString(),
    // Variáveis de ambiente às vezes guardam as quebras de linha como "\n"
    ssl: { ca: ca.replace(/\\n/g, '\n'), rejectUnauthorized: true },
  };
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  constructor(config: ConfigService) {
    // getOrThrow: a API nem liga se DATABASE_URL não estiver configurada
    const adapter = new PrismaPg({
      ...sslOptions(config.getOrThrow<string>('DATABASE_URL'), config.get<string>('DATABASE_CA_CERT')),
      // Plano grátis tem poucas conexões: um pool pequeno evita estourar o limite
      max: Number(config.get<string>('DATABASE_POOL_MAX') ?? 5),
    });
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}