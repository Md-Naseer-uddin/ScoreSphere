import { useTranslation } from 'react-i18next';
import { useRegisterSW } from 'virtual:pwa-register/react';
import { Button } from '@/components/ui/button';

/** Offers a new app version instead of reloading automatically, so a live match is never interrupted. */
export function UpdatePrompt() {
  const { t } = useTranslation();
  const {
    needRefresh: [needRefresh, setNeedRefresh],
    updateServiceWorker,
  } = useRegisterSW();

  if (!needRefresh) return null;

  return (
    <div
      role="status"
      className="fixed inset-x-4 bottom-20 z-20 mx-auto flex max-w-md items-center gap-3 rounded-xl border bg-card p-3 shadow-lg"
    >
      <p className="flex-1 text-sm">{t('update.available')}</p>
      <Button size="sm" variant="ghost" onClick={() => setNeedRefresh(false)}>
        {t('update.later')}
      </Button>
      <Button size="sm" onClick={() => void updateServiceWorker(true)}>
        {t('update.reload')}
      </Button>
    </div>
  );
}
