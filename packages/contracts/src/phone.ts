import { z } from 'zod';

/**
 * Indian mobile numbers: 10 digits starting with 6, 7, 8 or 9 (ADR 0025).
 * Accepts common input forms and returns canonical E.164 (`+91XXXXXXXXXX`),
 * or `null` when the input isn't a valid Indian mobile number.
 */
export function normalizeIndianMobile(input: string): string | null {
  let digits = input.replace(/[\s\-().]/g, '');
  if (digits.startsWith('+91')) digits = digits.slice(3);
  else if (digits.length === 12 && digits.startsWith('91')) digits = digits.slice(2);
  else if (digits.length === 11 && digits.startsWith('0')) digits = digits.slice(1);
  return /^[6-9]\d{9}$/.test(digits) ? `+91${digits}` : null;
}

/** Masks all but the last 4 digits for display, e.g. `+91 ••••••3210`. */
export function maskPhone(e164: string): string {
  return `${e164.slice(0, 3)} ••••••${e164.slice(-4)}`;
}

/** Validates and normalizes a phone field to E.164. */
export const phoneSchema = z.string().transform((value, ctx) => {
  const normalized = normalizeIndianMobile(value);
  if (!normalized) {
    ctx.addIssue({ code: 'custom', message: 'INVALID_PHONE' });
    return z.NEVER;
  }
  return normalized;
});
