import { Writable } from 'node:stream';
import pino from 'pino';
import { describe, expect, it } from 'vitest';
import { REDACT_PATHS } from './logging';

describe('log redaction', () => {
  it('never writes secrets or phone numbers', () => {
    const lines: string[] = [];
    const sink = new Writable({
      write(chunk, _enc, done) {
        lines.push(String(chunk));
        done();
      },
    });
    const logger = pino({ redact: { paths: REDACT_PATHS, censor: '[redacted]' } }, sink);
    logger.info({
      req: { headers: { authorization: 'Bearer abc.def', cookie: 'rt=xyz' } },
      body: { phone: '+919876543210', password: 'hunter22', recoveryCode: 'ABCD-EFGH' },
    });
    const out = lines.join('');
    for (const secret of ['abc.def', 'rt=xyz', '+919876543210', 'hunter22', 'ABCD-EFGH']) {
      expect(out).not.toContain(secret);
    }
    expect(out).toContain('[redacted]');
  });
});
