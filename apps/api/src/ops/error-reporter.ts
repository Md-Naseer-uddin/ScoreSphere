import { Inject, Injectable, Logger } from '@nestjs/common';
import { ENV } from '../config/config.module';
import type { Env } from '../config/env';

/**
 * Removes anything that could be personal data or a secret from error text before it
 * leaves the server (ADR 0024): phone-like digit runs, long tokens and email addresses.
 */
export function scrub(text: string): string {
  return text
    .replace(/[\w.+-]+@[\w-]+\.[\w.-]+/g, '[email]')
    .replace(/\+?\d[\d\s-]{8,}\d/g, '[number]')
    .replace(/[A-Za-z0-9_-]{32,}/g, '[token]');
}

/**
 * Sends unexpected server errors to an error tracker. Without `ERROR_WEBHOOK_URL` errors
 * are only logged. Request bodies, headers and user data are never included.
 */
@Injectable()
export class ErrorReporter {
  private readonly logger = new Logger(ErrorReporter.name);

  constructor(@Inject(ENV) private readonly env: Env) {}

  capture(error: unknown, context: { requestId: string; method: string; route: string }): void {
    const url = this.env.ERROR_WEBHOOK_URL;
    if (!url) return;
    const err = error instanceof Error ? error : new Error(String(error));
    const report = {
      name: err.name,
      message: scrub(err.message),
      stack: err.stack ? scrub(err.stack).split('\n').slice(0, 15).join('\n') : null,
      release: this.env.APP_VERSION,
      environment: this.env.NODE_ENV,
      ...context,
      at: new Date().toISOString(),
    };
    void fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(report),
      signal: AbortSignal.timeout(5_000),
    }).catch(() => this.logger.warn('Could not deliver an error report'));
  }
}
