import { SHARE_TOKEN_HEADER } from '@scoresphere/contracts';
import { Radio, WifiOff } from 'lucide-react';
import { useMemo } from 'react';
import { useTranslation } from 'react-i18next';
import { useLocation } from 'react-router';
import { Badge } from '@/components/ui/badge';
import { FullScreenSpinner } from '@/features/auth/RequireAuth';
import { STALE_AFTER_MS, useLiveStream, useNow, useProjection } from '@/features/matches/hooks';
import { StatusBadge } from '@/features/matches/StatusBadge';
import { Timeline } from '@/features/matches/Timeline';
import { sportUi } from '@/sports/registry';

/**
 * Read-only spectator view (spec frontend §10). The share token comes from the URL
 * fragment and is sent in a header, so it never appears in requests' URLs (ADR 0021).
 */
export function LivePage() {
  const { t } = useTranslation();
  const { hash } = useLocation();
  const token = useMemo(() => decodeURIComponent(hash.replace(/^#/, '')), [hash]);
  const view = useLiveStream(
    token ? '/public/live/stream' : null,
    () => ({ [SHARE_TOKEN_HEADER]: token }),
    false,
  );
  const snapshot = view.snapshot;
  const projection = useProjection(snapshot?.sport, snapshot?.engineVersion, view.events);
  const now = useNow(5_000);

  if (!token || view.closedWith !== null) {
    return (
      <Shell>
        <div className="space-y-2 py-16 text-center">
          <h1 className="text-xl font-semibold">{t('live.unavailableTitle')}</h1>
          <p className="text-muted-foreground">{t('live.unavailableBody')}</p>
        </div>
      </Shell>
    );
  }
  if (!snapshot) return <FullScreenSpinner />;

  const ui = sportUi(snapshot.sport);
  const seenAt = view.scorerSeenAt ? new Date(view.scorerSeenAt).getTime() : null;
  const stale = view.status === 'live' && (seenAt === null || now - seenAt > STALE_AFTER_MS);
  const lastEvent = view.events[view.events.length - 1];

  return (
    <Shell>
      <div className="space-y-5">
        <div className="space-y-1">
          <div className="flex items-center gap-2">
            {view.status && <StatusBadge status={view.status} />}
            {view.connection === 'live' ? (
              <Badge variant="outline">
                <Radio aria-hidden className="size-3" /> {t('live.connection.live')}
              </Badge>
            ) : (
              <Badge variant="outline">
                <WifiOff aria-hidden className="size-3" /> {t('live.connection.reconnecting')}
              </Badge>
            )}
            {stale && (
              <Badge variant="secondary" data-testid="stale-badge">
                {t('live.stale')}
              </Badge>
            )}
          </div>
          <h1 className="text-xl font-semibold">
            {snapshot.title ?? snapshot.sides.map((s) => s.name).join(t('matches.vs'))}
          </h1>
          {lastEvent && (
            <p className="text-xs text-muted-foreground">
              {t('live.lastUpdated', { time: new Date(lastEvent.occurredAt).toLocaleTimeString() })}
            </p>
          )}
        </div>
        {projection && ui ? (
          <>
            <ui.Scoreboard
              projection={projection}
              sides={snapshot.sides}
              clockOffsetMs={view.clockOffsetMs}
            />
            {view.status === 'completed' && (
              <ui.Scorecard projection={projection} sides={snapshot.sides} />
            )}
            <Timeline entries={projection.timeline} sides={snapshot.sides} ui={ui} limit={20} />
          </>
        ) : (
          <p className="text-muted-foreground">{t('live.cantShow')}</p>
        )}
      </div>
    </Shell>
  );
}

function Shell({ children }: { children: React.ReactNode }) {
  const { t } = useTranslation();
  return (
    <div className="min-h-dvh">
      <header className="border-b px-4 py-3 pt-[calc(env(safe-area-inset-top)+0.75rem)]">
        <p className="font-semibold">{t('live.brand')}</p>
      </header>
      <main className="mx-auto w-full max-w-3xl px-4 py-6">{children}</main>
    </div>
  );
}
