import type { INestApplication } from '@nestjs/common';
import { DocumentBuilder, SwaggerModule } from '@nestjs/swagger';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { Logger } from 'nestjs-pino';
import { cleanupOpenApiDoc } from 'nestjs-zod';
import { ENV } from './config/config.module';
import type { Env } from './config/env';

/** Shared by main.ts and the e2e tests so both run the same HTTP pipeline. */
export function configureApp(app: INestApplication): void {
  const env = app.get<Env>(ENV);
  app.useLogger(app.get(Logger));
  // Behind a load balancer, trust its X-Forwarded-For so rate limits apply per client.
  app.getHttpAdapter().getInstance().set('trust proxy', env.TRUST_PROXY);
  app.use(helmet());
  app.use(cookieParser());
  app.enableCors({ origin: env.CORS_ORIGINS, credentials: true });
  app.setGlobalPrefix('api/v1');
  app.enableShutdownHooks();

  if (env.NODE_ENV !== 'production') {
    const config = new DocumentBuilder()
      .setTitle('ScoreSphere API')
      .setVersion(env.APP_VERSION)
      .build();
    SwaggerModule.setup(
      'api/docs',
      app,
      cleanupOpenApiDoc(SwaggerModule.createDocument(app, config)),
    );
  }
}
