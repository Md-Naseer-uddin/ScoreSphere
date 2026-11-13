import { createHash, randomBytes } from 'node:crypto';

/** URL-safe random token (refresh tokens, invitation links). */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString('base64url');
}

/** Tokens are stored as SHA-256 hex, so a database leak doesn't expose usable tokens. */
export function sha256Hex(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

const CROCKFORD = '0123456789ABCDEFGHJKMNPQRSTVWXYZ';

/** 80-bit recovery code as 16 Crockford base32 characters, e.g. `7K2M-QX9P-0BDF-H4RT` (ADR 0025). */
export function generateRecoveryCode(): string {
  const bytes = randomBytes(10);
  let out = '';
  let buffer = 0;
  let bits = 0;
  for (const byte of bytes) {
    buffer = (buffer << 8) | byte;
    bits += 8;
    while (bits >= 5) {
      bits -= 5;
      out += CROCKFORD[(buffer >>> bits) & 31];
    }
    buffer &= (1 << bits) - 1;
  }
  return out.match(/.{4}/g)!.join('-');
}

/** Canonical form used for hashing: upper-case, no separators. */
export function normalizeRecoveryCode(code: string): string {
  return code.toUpperCase().replace(/[\s-]/g, '');
}
