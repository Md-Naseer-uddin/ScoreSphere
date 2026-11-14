import { Controller, Get, Inject } from '@nestjs/common';
import type { AppVersionInfo } from '@scoresphere/contracts';
import { Public } from '../auth/decorators';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * What clients need to stay current (ADR 0019): the oldest version allowed to start new
 * matches, and the latest release with its checksum for the download page.
 */
@Public()
@Controller('app/version')
export class VersionController {
  constructor(@Inject(ENV) private readonly env: Env) {}

  @Get()
  get(): AppVersionInfo {
    const e = this.env;
    return {
      minClientVersion: e.MIN_CLIENT_VERSION,
      latestVersion: e.LATEST_CLIENT_VERSION ?? null,
      apk: e.APK_URL && e.APK_SHA256 ? { url: e.APK_URL, sha256: e.APK_SHA256 } : null,
      releaseNotesUrl: e.RELEASE_NOTES_URL ?? null,
    };
  }
}
