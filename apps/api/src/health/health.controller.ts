import { Controller, Get, Inject } from '@nestjs/common';
import type { HealthStatus } from '@scoresphere/contracts';
import { Pool } from 'pg';
import { ApiError } from '../common/api-error';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';
import { PG_POOL } from '../database/database.module';

@Controller('health')
export class HealthController {
  constructor(
    @Inject(PG_POOL) private readonly pool: Pool,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /** Liveness: the process is up. Never touches dependencies. */
  @Get()
  live(): HealthStatus {
    return { status: 'ok', checks: {}, version: this.env.APP_VERSION };
  }

  /** Readiness: dependencies are reachable, so the instance can take traffic. */
  @Get('ready')
  async ready(): Promise<HealthStatus> {
    try {
      await this.pool.query('select 1');
    } catch {
      throw new ApiError(503, 'SERVICE_UNAVAILABLE', 'Database is unreachable.');
    }
    return { status: 'ok', checks: { database: 'ok' }, version: this.env.APP_VERSION };
  }
}
