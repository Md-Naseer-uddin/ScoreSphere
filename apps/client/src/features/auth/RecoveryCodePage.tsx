import { Share } from '@capacitor/share';
import { Copy, Download } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Navigate, useLocation, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { isNative } from '@/lib/platform';
import { safeNext } from './auth-api';

interface RecoveryState {
  recoveryCode?: string;
  next?: string;
  context?: 'register' | 'reset' | 'regenerate';
}

/** Shows a one-time recovery code and makes the user confirm they've kept it (ADR 0025). */
export function RecoveryCodePage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as RecoveryState;
  const [saved, setSaved] = useState(false);

  if (!state.recoveryCode) return <Navigate to="/app" replace />;
  const code = state.recoveryCode;
  const fallback = state.context === 'reset' ? '/auth/login' : '/app';
  const text = t('recovery.fileContents', { code });

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      toast.success(t('recovery.copied'));
    } catch {
      toast.error(t('errors.generic'));
    }
  };

  const save = async () => {
    if (isNative()) {
      await Share.share({ title: t('recovery.title'), text });
      return;
    }
    const url = URL.createObjectURL(new Blob([text], { type: 'text/plain' }));
    const link = Object.assign(document.createElement('a'), {
      href: url,
      download: 'scoresphere-recovery-code.txt',
    });
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>
          <h1>{t('recovery.title')}</h1>
        </CardTitle>
        <CardDescription>{t('recovery.body')}</CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <p
          aria-label={t('recovery.title')}
          className="rounded-lg border bg-muted px-4 py-3 text-center font-mono text-xl tracking-wider select-all"
        >
          {code}
        </p>
        <div className="grid grid-cols-2 gap-2">
          <Button variant="outline" onClick={() => void copy()}>
            <Copy aria-hidden /> {t('recovery.copy')}
          </Button>
          <Button variant="outline" onClick={() => void save()}>
            <Download aria-hidden /> {t('recovery.save')}
          </Button>
        </div>
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-0.5 size-5 accent-primary"
            checked={saved}
            onChange={(e) => setSaved(e.target.checked)}
          />
          <span>{t('recovery.confirm')}</span>
        </label>
      </CardContent>
      <CardFooter>
        <Button
          className="w-full"
          disabled={!saved}
          onClick={() => void navigate(safeNext(state.next, fallback), { replace: true })}
        >
          {t('common.continue')}
        </Button>
      </CardFooter>
    </Card>
  );
}
