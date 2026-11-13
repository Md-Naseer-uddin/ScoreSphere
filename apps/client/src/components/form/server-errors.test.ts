import { describe, expect, it, vi } from 'vitest';
import { ApiClientError } from '@/lib/api';
import { applyServerErrors } from './server-errors';

describe('applyServerErrors', () => {
  it('places field errors on their fields', () => {
    const setError = vi.fn();
    const code = applyServerErrors(
      new ApiClientError('CONFLICT', 'x', 409, [{ field: 'phone', code: 'PHONE_TAKEN' }]),
      setError,
      ['phone'],
    );
    expect(setError).toHaveBeenCalledWith('phone', { message: 'PHONE_TAKEN' });
    expect(code).toBe('');
  });

  it('returns the code for errors without a matching field', () => {
    const setError = vi.fn();
    expect(
      applyServerErrors(
        new ApiClientError('UNAUTHENTICATED', 'x', 401, [
          { field: 'credentials', code: 'INVALID_CREDENTIALS' },
        ]),
        setError,
        ['phone'],
      ),
    ).toBe('INVALID_CREDENTIALS');
    expect(applyServerErrors(new ApiClientError('RATE_LIMITED', 'x', 429), setError, [])).toBe(
      'RATE_LIMITED',
    );
    expect(applyServerErrors(new Error('boom'), setError, [])).toBe('generic');
  });
});
