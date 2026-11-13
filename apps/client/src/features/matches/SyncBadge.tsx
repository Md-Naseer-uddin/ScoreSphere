import { AlertTriangle, CheckCircle2, CloudOff, Loader2, UploadCloud, XCircle } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { cn } from '@/lib/utils';
import type { SyncDisplay } from './hooks';

const ICONS = {
  synced: CheckCircle2,
  offline: CloudOff,
  pending: UploadCloud,
  syncing: Loader2,
  failed: XCircle,
  conflict: AlertTriangle,
} as const;

/** Always-visible save/sync state for the scorer (spec frontend §11). */
export function SyncBadge({ state, pending }: { state: SyncDisplay; pending: number }) {
  const { t } = useTranslation();
  const Icon = ICONS[state];
  return (
    <span
      role="status"
      data-sync-state={state}
      className={cn(
        'inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-medium',
        state === 'synced' && 'bg-muted text-muted-foreground',
        (state === 'offline' || state === 'pending' || state === 'syncing') &&
          'bg-accent text-accent-foreground',
        (state === 'failed' || state === 'conflict') && 'bg-destructive/10 text-destructive',
      )}
    >
      <Icon aria-hidden className={cn('size-3.5', state === 'syncing' && 'animate-spin')} />
      {t(`matches.sync.${state}`, { count: pending })}
    </span>
  );
}
