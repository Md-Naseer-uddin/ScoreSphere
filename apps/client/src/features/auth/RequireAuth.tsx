import { Loader2, WifiOff } from 'lucide-react';
import { type ReactNode, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation } from 'react-router';
import { Button } from '@/components/ui/button';
import { refreshSession, useSession } from './session';

export function FullScreenSpinner() {
  const { t } = useTranslation();
  return (
    <div className="flex min-h-dvh items-center justify-center" role="status">
      <Loader2 aria-hidden className="size-6 animate-spin text-muted-foreground" />
      <span className="sr-only">{t('common.loading')}</span>
    </div>
  );
}

/** Gate for signed-in areas: waits for the session check, then redirects to login if needed. */
export function RequireAuth({ children }: { children: ReactNode }) {
  const { t } = useTranslation();
  const status = useSession((s) => s.status);
  const hasUser = useSession((s) => s.user !== null);
  const location = useLocation();

  // Working offline: check the session again as soon as the connection returns.
  useEffect(() => {
    if (status !== 'offline') return;
    const retry = () => void refreshSession();
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [status]);

  if (status === 'loading') return <FullScreenSpinner />;
  if (status === 'offline' && hasUser) return children;
  if (status === 'offline') {
    return (
      <div className="mx-auto flex min-h-dvh max-w-sm flex-col items-center justify-center gap-3 p-6 text-center">
        <WifiOff aria-hidden className="size-8 text-muted-foreground" />
        <h1 className="text-lg font-semibold">{t('auth.offlineTitle')}</h1>
        <p className="text-muted-foreground">{t('auth.offlineBody')}</p>
        <Button onClick={() => void refreshSession()}>{t('common.retry')}</Button>
      </div>
    );
  }
  if (status === 'anonymous') {
    const next = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/auth/login?next=${next}`} replace />;
  }
  return children;
}
