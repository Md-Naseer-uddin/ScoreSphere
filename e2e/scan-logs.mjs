// Fails the e2e run if the API logged personal data or secrets (ADR 0024, plan §4).
import { readFileSync } from 'node:fs';

const log = readFileSync(new URL('./logs/api.log', import.meta.url), 'utf8');
const CROCKFORD = '[0-9A-HJKMNP-TV-Z]';

const forbidden = {
  'phone number': /(?<![\d])(?:\+91)?[6-9]\d{9}(?![\d])/,
  'recovery code': new RegExp(
    `\\b${CROCKFORD}{4}-${CROCKFORD}{4}-${CROCKFORD}{4}-${CROCKFORD}{4}\\b`,
  ),
  'bearer token': /Bearer\s+[\w.-]{10,}/,
  'refresh cookie': /ss_rt=[\w-]{10,}/,
  'test password': /(owner|joiner|first|second) password \d/,
};

if (!/request completed/.test(log)) {
  console.error('Log scan: no request logs captured, so the scan would prove nothing.');
  process.exit(1);
}

const hits = Object.entries(forbidden).filter(([, pattern]) => pattern.test(log));
if (hits.length > 0) {
  for (const [name, pattern] of hits) {
    const line = log.split('\n').find((l) => pattern.test(l));
    console.error(`Log scan: found a ${name} in API logs:\n  ${line?.slice(0, 300)}`);
  }
  process.exit(1);
}
console.log(`Log scan: ${log.split('\n').length} lines, no personal data or secrets found.`);
