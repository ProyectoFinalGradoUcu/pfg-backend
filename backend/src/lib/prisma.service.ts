import { Injectable, Logger, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';
import { PrismaPg } from '@prisma/adapter-pg';
import pg from 'pg';

@Injectable()
export class PrismaService
  extends PrismaClient
  implements OnModuleInit, OnModuleDestroy
{
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    const databaseUrl = process.env.DATABASE_URL;

    if (!databaseUrl) {
      Logger.error('DATABASE_URL no está definido', PrismaService.name);
    } else {
      Logger.log('Inicializando Prisma adapter con DATABASE_URL', PrismaService.name);
    }

    const pool = new pg.Pool({
      connectionString: databaseUrl,
    });
    const adapter = new PrismaPg(pool);
    super({ adapter });
  }

  async onModuleInit() {
    await this.$connect();
    this.logger.log('Conexión Prisma establecida');
  }

  async onModuleDestroy() {
    await this.$disconnect();
    this.logger.log('Conexión Prisma cerrada');
  }
}
