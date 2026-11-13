import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD, APP_INTERCEPTOR, APP_PIPE } from '@nestjs/core';
import { ThrottlerGuard, ThrottlerModule } from '@nestjs/throttler';
import { LoggerModule } from 'nestjs-pino';
import { ZodValidationPipe } from 'nestjs-zod';
import { AuditModule } from './audit/audit.module';
import { AuthGuard } from './auth/auth.guard';
import { AuthModule } from './auth/auth.module';
import { EnvelopeInterceptor } from './common/envelope.interceptor';
import { ApiExceptionFilter } from './common/exception.filter';
import { loggerParams } from './common/logging';
import { ConfigModule, ENV } from './config/config.module';
import type { Env } from './config/env';
import { DatabaseModule } from './database/database.module';
import { HealthController } from './health/health.controller';
import { MediaModule } from './media/media.module';
import { PeopleModule } from './people/people.module';
import { PersonsModule } from './people/persons.service';
import { SyncModule } from './sync/sync.module';
import { TeamsModule } from './teams/teams.module';
import { UsersModule } from './users/users.module';
import { WorkspacesModule } from './workspaces/workspaces.module';

@Module({
  imports: [
    ConfigModule,
    LoggerModule.forRootAsync({ inject: [ENV], useFactory: (env: Env) => loggerParams(env) }),
    ThrottlerModule.forRootAsync({
      inject: [ENV],
      useFactory: (env: Env) => ({
        // Per-IP default; auth routes set tighter limits with @Throttle.
        throttlers: [{ name: 'default', ttl: 60_000, limit: 120 }],
        skipIf: () => !env.RATE_LIMIT_ENABLED,
      }),
    }),
    DatabaseModule,
    AuditModule,
    PersonsModule,
    AuthModule,
    UsersModule,
    WorkspacesModule,
    MediaModule,
    PeopleModule,
    TeamsModule,
    SyncModule,
  ],
  controllers: [HealthController],
  providers: [
    { provide: APP_PIPE, useClass: ZodValidationPipe },
    // Guards run in this order: rate limit first, then authentication.
    { provide: APP_GUARD, useClass: ThrottlerGuard },
    { provide: APP_GUARD, useExisting: AuthGuard },
    { provide: APP_INTERCEPTOR, useClass: EnvelopeInterceptor },
    { provide: APP_FILTER, useClass: ApiExceptionFilter },
  ],
})
export class AppModule {}
