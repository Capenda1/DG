import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { SkipThrottle } from '@nestjs/throttler';
import { PrismaService } from '../../prisma/prisma.service';

@Controller('health')
@SkipThrottle()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness — processo activo (sem I/O pesado). */
  @Get()
  liveness() {
    return { status: 'ok', service: 'dadiva-api' };
  }

  /** Readiness — inclui ligação à base de dados. */
  @Get('ready')
  async readiness() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ok', service: 'dadiva-api', database: 'up' };
    } catch {
      throw new ServiceUnavailableException({
        status: 'degraded',
        service: 'dadiva-api',
        database: 'down',
      });
    }
  }
}
