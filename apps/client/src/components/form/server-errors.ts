import type { FieldValues, Path, UseFormSetError } from 'react-hook-form';
import { ApiClientError } from '@/lib/api';

/**
 * Puts field-level API errors on their form fields and returns the error code to show
 * above the form for anything that isn't tied to a field.
 */
export function applyServerErrors<T extends FieldValues>(
  error: unknown,
  setError: UseFormSetError<T>,
  fields: readonly Path<T>[],
): string {
  if (!(error instanceof ApiClientError)) return 'generic';
  let unplaced: string | undefined;
  for (const detail of error.details) {
    if ((fields as readonly string[]).includes(detail.field)) {
      setError(detail.field as Path<T>, { message: detail.code });
    } else {
      unplaced ??= detail.code;
    }
  }
  if (error.details.length > 0 && !unplaced) return '';
  return unplaced ?? (error.code === 'VALIDATION_ERROR' ? 'generic' : error.code);
}
