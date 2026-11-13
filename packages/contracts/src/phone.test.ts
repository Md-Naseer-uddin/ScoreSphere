import { describe, expect, it } from 'vitest';
import { maskPhone, normalizeIndianMobile, phoneSchema } from './phone.js';

describe('normalizeIndianMobile', () => {
  it.each([
    ['9876543210', '+919876543210'],
    ['98765 43210', '+919876543210'],
    ['+91 98765-43210', '+919876543210'],
    ['919876543210', '+919876543210'],
    ['09876543210', '+919876543210'],
    ['6000000000', '+916000000000'],
  ])('accepts %s', (input, expected) => {
    expect(normalizeIndianMobile(input)).toBe(expected);
  });

  it.each([
    ['5876543210', 'starts with 5'],
    ['987654321', '9 digits'],
    ['98765432101', '11 digits without leading 0'],
    ['+1 9876543210', 'other country code'],
    ['98765abcde', 'letters'],
    ['', 'empty'],
  ])('rejects %s (%s)', (input) => {
    expect(normalizeIndianMobile(input)).toBeNull();
  });
});

describe('phoneSchema', () => {
  it('normalizes to E.164', () => {
    expect(phoneSchema.parse('98765 43210')).toBe('+919876543210');
  });

  it('reports INVALID_PHONE', () => {
    const result = phoneSchema.safeParse('12345');
    expect(result.success).toBe(false);
    expect(result.error?.issues[0]?.message).toBe('INVALID_PHONE');
  });
});

describe('maskPhone', () => {
  it('keeps only the last four digits', () => {
    expect(maskPhone('+919876543210')).toBe('+91 ••••••3210');
  });
});
