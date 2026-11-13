import { useTranslation } from 'react-i18next';
import { Outlet } from 'react-router';

export function AuthLayout() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-start justify-center bg-muted/40 px-4 py-10 sm:items-center">
      <div className="w-full max-w-sm space-y-6">
        <div className="flex flex-col items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-12" />
          <span className="text-lg font-semibold">{t('app.name')}</span>
        </div>
        <Outlet />
      </div>
    </div>
  );
}
