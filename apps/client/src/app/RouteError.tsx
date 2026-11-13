import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';

/** Shown when a route throws. Local data lives in IndexedDB, so a reload loses nothing. */
export function RouteError() {
  const { t } = useTranslation();
  return (
    <div role="alert" className="mx-auto max-w-md space-y-3 p-6 text-center">
      <h1 className="text-xl font-semibold">{t('common.error')}</h1>
      <p className="text-muted-foreground">{t('common.errorBody')}</p>
      <Button onClick={() => window.location.reload()}>{t('common.reload')}</Button>
    </div>
  );
}
