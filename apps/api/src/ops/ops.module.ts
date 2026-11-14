import { Global, Module } from '@nestjs/common';
import { LiveModule } from '../live/live.module';
import { ErrorReporter } from './error-reporter';
import { MetricsController } from './metrics.controller';
import { VersionController } from './version.controller';

@Global()
@Module({
  imports: [LiveModule],
  controllers: [MetricsController, VersionController],
  providers: [ErrorReporter],
  exports: [ErrorReporter],
})
export class OpsModule {}
