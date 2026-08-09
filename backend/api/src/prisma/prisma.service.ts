import {
  Injectable,
  Logger,
  OnModuleDestroy,
  OnModuleInit,
} from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

/**
 * Evita P2024 (pool esgotado): se `DATABASE_URL` não define `connection_limit` /
 * `pool_timeout`, aplicam-se omissões adequadas a um servidor Nest long-running.
 * Ver: https://www.prisma.io/docs/orm/prisma-client/setup-and-configuration/databases-connections/connection-pool
 */
function augmentDatabaseUrlWithPoolDefaults(rawUrl: string): string {
  const defaultLimit = process.env.PRISMA_CONNECTION_LIMIT ?? '15';
  const defaultTimeout = process.env.PRISMA_POOL_TIMEOUT ?? '30';
  try {
    const u = new URL(rawUrl);
    if (!u.searchParams.has('connection_limit')) {
      u.searchParams.set('connection_limit', defaultLimit);
    }
    if (!u.searchParams.has('pool_timeout')) {
      u.searchParams.set('pool_timeout', defaultTimeout);
    }
    return u.toString();
  } catch {
    return rawUrl;
  }
}

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const url = process.env.DATABASE_URL?.trim();
    if (url) {
      const datasourceUrl = augmentDatabaseUrlWithPoolDefaults(url);
      super({ datasources: { db: { url: datasourceUrl } } });
    } else {
      super();
    }
  }

  async onModuleInit() {
    try {
      await this.$connect();
      this.logger.log('Ligação à base de dados estabelecida.');
    } catch (err) {
      this.logger.error(
        'Falha ao ligar à base de dados. Verifique DATABASE_URL e se o PostgreSQL está em execução.',
        err,
      );
      throw err;
    }
  }

  async onModuleDestroy() {
    await this.$disconnect();
  }
}
