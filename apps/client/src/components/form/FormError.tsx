import { CircleAlert } from 'lucide-react';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useErrorText } from './Field';

/** Form-level error banner for API failures not tied to a single field. */
export function FormError({ code }: { code: string | null }) {
  const text = useErrorText()(code ?? undefined);
  if (!code || !text) return null;
  return (
    <Alert variant="destructive">
      <CircleAlert />
      <AlertDescription>{text}</AlertDescription>
    </Alert>
  );
}
