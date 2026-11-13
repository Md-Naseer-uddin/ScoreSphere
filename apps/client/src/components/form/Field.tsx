import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { Label } from '@/components/ui/label';

/** Translates an error code from Zod or the API into a message, with a generic fallback. */
export function useErrorText() {
  const { t } = useTranslation();
  return (code: string | undefined): string | undefined =>
    code ? t(`errors.${code}`, { defaultValue: t('errors.generic') }) : undefined;
}

interface FieldProps {
  id: string;
  label: string;
  error?: string | undefined;
  hint?: string;
  children: ReactNode;
}

/** Label + control + hint/error, wired up for screen readers via aria-describedby. */
export function Field({ id, label, error, hint, children }: FieldProps) {
  const errorText = useErrorText()(error);
  return (
    <div className="space-y-1.5">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {errorText ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {errorText}
        </p>
      ) : hint ? (
        <p id={`${id}-hint`} className="text-sm text-muted-foreground">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/** Props that link an input to its Field's error or hint. */
export function describedBy(id: string, error?: string, hint?: string) {
  return {
    id,
    'aria-invalid': error ? true : undefined,
    'aria-describedby': error ? `${id}-error` : hint ? `${id}-hint` : undefined,
  } as const;
}
