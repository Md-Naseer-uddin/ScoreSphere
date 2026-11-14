import type { MatchDetail } from '@scoresphere/contracts';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Radio } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { FullScreenSpinner } from '@/features/auth/RequireAuth';
import { useSession } from '@/features/auth/session';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';
import { ApiClientError } from '@/lib/api';
import type { LocalMatchEvent } from '@/lib/db';
import { sportUi } from '@/sports/registry';
import {
  type SideView,
  useLiveStream,
  useLocalMatch,
  useMatchSyncStatus,
  useProjection,
} from './hooks';
import { adoptServerMatch } from './local-store';
import { getMatch, lease, matchKeys } from './matches-api';
import { AwardsCard } from './AwardsCard';
import { ShareLinksCard } from './ShareLinksCard';
import { StatusBadge } from './StatusBadge';
import { checkServerCopy } from './sync-worker';
import { SyncBadge } from './SyncBadge';
import { Timeline } from './Timeline';

/** Saves events the server refused, so nothing scored on this device is lost (ADR 0007). */
function downloadKept(matchId: string, events: LocalMatchEvent[]) {
  const blob = new Blob([JSON.stringify({ matchId, events }, null, 2)], {
    type: 'application/json',
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `scoresphere-${matchId}-kept-events.json`;
  a.click();
  URL.revokeObjectURL(url);
}

export function MatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { matchId = '' } = useParams();
  const online = useOnlineStatus();
  const userId = useSession((s) => s.user?.id);
  const authenticated = useSession((s) => s.status === 'authenticated');
  const local = useLocalMatch(matchId);
  const scoredHere = Boolean(local?.match.holdsLease);

  // Matches scored elsewhere are followed live from the server.
  const remote = useQuery({
    queryKey: matchKeys.detail(matchId),
    queryFn: () => getMatch(matchId),
    enabled: local !== undefined && !scoredHere && authenticated,
  });
  const stream = useLiveStream(
    local !== undefined && !scoredHere && remote.data ? `/matches/${matchId}/stream` : null,
    () => ({}),
    true,
  );

  const header: Pick<MatchDetail, 'sport' | 'engineVersion' | 'title' | 'sides'> | undefined =
    local?.match ?? remote.data;
  const events = scoredHere
    ? local?.match && local.events
    : stream.events.length
      ? stream.events
      : (remote.data?.events ?? local?.events);
  const projection = useProjection(header?.sport, header?.engineVersion, events);
  const sync = useMatchSyncStatus(local?.match, local?.events);
  const [confirmTakeover, setConfirmTakeover] = useState(false);
  // A match scored here: make sure the server still has all of it (e.g. after a restore).
  useEffect(() => {
    if (scoredHere && online && authenticated) void checkServerCopy(matchId).catch(() => undefined);
  }, [matchId, scoredHere, online, authenticated]);
  const [claiming, setClaiming] = useState(false);

  if (local === undefined || (!local && remote.isPending && authenticated))
    return <FullScreenSpinner />;
  if (!header) {
    return (
      <div className="space-y-3 text-center">
        <p>
          {remote.error instanceof ApiClientError && remote.error.status === 404
            ? t('matches.notFound')
            : t('matches.unavailableOffline')}
        </p>
        <Button asChild variant="link">
          <Link to="/app/matches">{t('matches.backToMatches')}</Link>
        </Button>
      </div>
    );
  }
  const ui = sportUi(header.sport);
  const sides: SideView[] = header.sides;
  const status = scoredHere ? local!.match.status : (stream.status ?? remote.data?.status);
  const kept = local?.events.filter((e) => e.sync === 'conflict' || e.sync === 'rejected') ?? [];
  const serverKnown = local ? local.match.serverKnown : true;

  const scoreHere = async (mode: 'CLAIM' | 'TAKEOVER') => {
    if (!userId) return;
    setClaiming(true);
    try {
      const granted = await lease(matchId, mode);
      const detail = await getMatch(matchId);
      await adoptServerMatch(detail, userId, granted.leaseEpoch);
      navigate(`/app/matches/${matchId}/score`);
    } catch (error) {
      if (mode === 'CLAIM' && error instanceof ApiClientError && error.status === 409) {
        setConfirmTakeover(true);
      } else {
        toast.error(error instanceof Error ? error.message : t('errors.generic'));
      }
    } finally {
      setClaiming(false);
    }
  };

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/matches">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate text-xl font-semibold">
          {header.title ?? sides.map((s) => s.name).join(t('matches.vs'))}
        </h1>
        {status && <StatusBadge status={status} />}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        {local && <SyncBadge state={sync.state} pending={sync.pending} />}
        {!scoredHere && stream.connection === 'live' && (
          <Badge variant="outline">
            <Radio aria-hidden className="size-3" /> {t('live.connection.live')}
          </Badge>
        )}
        {(local?.match.needsReview || remote.data?.needsReview) && (
          <Badge variant="destructive">{t('matches.needsReview')}</Badge>
        )}
      </div>

      {projection && ui && (
        <ui.Scoreboard
          projection={projection}
          sides={sides}
          clockOffsetMs={scoredHere ? 0 : stream.clockOffsetMs}
        />
      )}

      <div className="flex flex-wrap gap-2">
        {scoredHere && status !== 'completed' && status !== 'abandoned' && (
          <Button asChild size="lg" className="flex-1">
            <Link to={`/app/matches/${matchId}/score`}>{t('matches.continueScoring')}</Link>
          </Button>
        )}
        {!scoredHere && status !== 'completed' && status !== 'abandoned' && online && (
          <Button
            size="lg"
            className="flex-1"
            disabled={claiming}
            onClick={() => void scoreHere('CLAIM')}
          >
            {t('matches.scoreHere')}
          </Button>
        )}
      </div>

      {kept.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle>{t('matches.kept.title', { count: kept.length })}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p className="text-muted-foreground">{t('matches.kept.body')}</p>
            <Button variant="outline" size="sm" onClick={() => downloadKept(matchId, kept)}>
              <Download aria-hidden /> {t('matches.kept.download')}
            </Button>
          </CardContent>
        </Card>
      )}

      {projection && ui && (status === 'completed' || projection.timeline.length > 2) && (
        <Card>
          <CardHeader>
            <CardTitle>{t('matches.scorecard')}</CardTitle>
          </CardHeader>
          <CardContent>
            <ui.Scorecard projection={projection} sides={sides} />
          </CardContent>
        </Card>
      )}

      {projection && (
        <AwardsCard
          matchId={matchId}
          sport={header.sport}
          engineVersion={header.engineVersion}
          workspaceId={local?.match.workspaceId ?? remote.data?.workspaceId ?? null}
          projection={projection}
          sides={sides}
          fromServer={serverKnown && online && authenticated}
        />
      )}

      {projection && ui && (
        <Timeline entries={projection.timeline} sides={sides} ui={ui} limit={30} />
      )}

      {serverKnown && online && authenticated ? (
        <ShareLinksCard matchId={matchId} />
      ) : (
        <p className="text-sm text-muted-foreground">{t('matches.share.needsSync')}</p>
      )}

      <Dialog open={confirmTakeover} onOpenChange={setConfirmTakeover}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('matches.takeover.title')}</DialogTitle>
            <DialogDescription>{t('matches.takeover.body')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmTakeover(false)}>
              {t('common.cancel')}
            </Button>
            <Button
              disabled={claiming}
              onClick={() => {
                setConfirmTakeover(false);
                void scoreHere('TAKEOVER');
              }}
            >
              {t('matches.takeover.confirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
}
