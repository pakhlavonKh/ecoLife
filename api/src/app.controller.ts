import { Controller, Get } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { SkipThrottle } from '@nestjs/throttler';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { isPaymentsEnabled } from './common/utils/env-flag';
import { PrismaService } from './prisma/prisma.service';

@ApiTags('public')
@Controller()
export class AppController {
  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  @Get('health')
  @SkipThrottle()
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return {
      status: 'ok',
      service: 'ecolife-api',
      phase: 9,
    };
  }

  @Get('config')
  @SkipThrottle()
  @ApiOperation({
    summary:
      'Public runtime flags (e.g. paymentsEnabled for the booking modal).',
  })
  publicConfig() {
    return {
      paymentsEnabled: isPaymentsEnabled(this.config),
    };
  }
}
