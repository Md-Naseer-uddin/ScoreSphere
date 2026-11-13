import type { SideIndex } from '@scoresphere/contracts';
import { undoTarget } from '@scoresphere/engine-kit';
import { ArrowLeft, MoreVertical, Pause, Play, Undo2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate, useParams } from 'react-router';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { FullScreenSpinner } from '@/features/auth/RequireAuth';
import { ApiClientError } from '@/lib/api';
import { db } from '@/lib/db';
import { sportUi } from '@/sports/registry';
import { useLocalMatch, useMatchSyncStatus, useProjection } from './hooks';
import { recordEvent, type NewEvent } from './local-store';
import { lease } from './matches-api';
import { SyncBadge } from './SyncBadge';
import { syncMatch } from './sync-worker';
import { Timeline } from './Timeline';

const HEARTBEAT_MS = 30_000;

/** Keeps the screen on while scoring, where the browser allows it. */
function useWakeLock(active: boolean) {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return;
    let sentinel: WakeLockSentinel | null = null;
    let released = false;
    void navigator.wakeLock
      .request('screen')
      .then((s) => {
        if (released) void s.release();
        else sentinel = s;
      })
      .catch(() => undefined);
    return () => {
      released = true;
      void sentinel?.release();
    };
  }, [active]);
}

/** Tells the server (and spectators) the scorer is still here; learns about takeovers. */
function useScorerHeartbeat(matchId: string, active: boolean) {
  useEffect(() => {
    if (!active) return;
    const beat = () =>
      void lease(matchId, 'HEARTBEAT').catch(async (error: unknown) => {
        if (error instanceof ApiClientError && error.status === 409) {
          await db.matches.update(matchId, { holdsLease: false });
        }
      });
    beat();
    const timer = window.setInterval(beat, HEARTBEAT_MS);
    return () => window.clearInterval(timer);
  }, [matchId, active]);
}

/**
 * The scorer's screen: a focused layout with the score always visible, the sport's own
 * controls, undo within reach and the sync state on show (spec frontend §8, §11).
 */
export function ScoreMatchPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { matchId = '' } = useParams();
  const data = useLocalMatch(matchId);
  const match = data?.match;
  const events = data?.events;
  const projection = useProjection(match?.sport, match?.engineVersion, events);
  const sync = useMatchSyncStatus(match, events);
  const [busy, setBusy] = useState(false);
  const [dialog, setDialog] = useState<'concede' | 'abandon' | null>(null);
  const [concedeSide, setConcedeSide] = useState<string | null>(null);
  const [concedeReason, setConcedeReason] = useState<string | null>(null);

  const live = projection?.status === 'live';
  useWakeLock(live);
  useScorerHeartbeat(matchId, Boolean(match?.serverKnown && match.holdsLease && live));

  if (data === undefined) return <FullScreenSpinner />;
  if (!match || !projection) {
    return (
      <div className="p-6 text-center">
        <p>{t('matches.notOnDevice')}</p>
        <Button asChild variant="link">
          <Link to={`/app/matches/${matchId}`}>{t('matches.viewMatch')}</Link>
        </Button>
      </div>
    );
  }
  const ui = sportUi(match.sport);
  if (!ui) return null;

  const record = async (input: NewEvent): Promise<boolean> => {
    setBusy(true);
    try {
      const result = await recordEvent(matchId, input);
      if (!result.ok) {
        toast.error(result.error.message);
        return false;
      }
      const last = result.value.timeline[result.value.timeline.length - 1];
      if (input.kind === 'COMMAND' && last) {
        for (const message of ui.announce?.(last.facts, match.sides) ?? []) toast.info(message);
      }
      void syncMatch(matchId);
      return true;
    } finally {
      setBusy(false);
    }
  };

  const undoSeq = undoTarget(projection.timeline);
  const canScore = match.holdsLease;
  const status = projection.status;

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b bg-background/95 px-2 pt-[env(safe-area-inset-top)] backdrop-blur">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to={`/app/matches/${matchId}`}>
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="min-w-0 flex-1 truncate py-3 font-semibold">
          {match.title ?? match.sides.map((s) => s.name).join(t('matches.vs'))}
        </h1>
        <SyncBadge state={sync.state} pending={sync.pending} />
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" aria-label={t('matches.menu')}>
              <MoreVertical aria-hidden />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {ui.concede && status !== 'completed' && status !== 'abandoned' && (
              <DropdownMenuItem disabled={!canScore} onSelect={() => setDialog('concede')}>
                {t('matches.endEarly')}
              </DropdownMenuItem>
            )}
            {status !== 'completed' && status !== 'abandoned' && (
              <DropdownMenuItem disabled={!canScore} onSelect={() => setDialog('abandon')}>
                {t('matches.abandon')}
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onSelect={() => navigate(`/app/matches/${matchId}`)}>
              {t('matches.shareAndDetails')}
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 space-y-5 px-4 py-4">
        {!canScore && (
          <div
            role="alert"
            className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm"
          >
            {t('matches.lostLease')}
          </div>
        )}
        <ui.Scoreboard projection={projection} sides={match.sides} />

        {status === 'scheduled' && (
          <Button
            className="w-full"
            size="lg"
            disabled={busy || !canScore}
            onClick={() => void record({ kind: 'LIFECYCLE', payload: { action: 'START' } })}
          >
            <Play aria-hidden /> {t('matches.startMatch')}
          </Button>
        )}
        {status === 'paused' && (
          <Button
            className="w-full"
            size="lg"
            disabled={busy || !canScore}
            onClick={() => void record({ kind: 'LIFECYCLE', payload: { action: 'RESUME' } })}
          >
            <Play aria-hidden /> {t('matches.resume')}
          </Button>
        )}
        {status === 'live' && canScore && (
          <ui.Controls
            projection={projection}
            sides={match.sides}
            busy={busy}
            onCommand={(payload) => record({ kind: 'COMMAND', payload })}
          />
        )}
        {(status === 'completed' || status === 'abandoned') && (
          <div role="status" className="rounded-xl bg-muted p-4 text-center">
            <p className="text-lg font-semibold">
              {status === 'abandoned'
                ? t('matches.abandoned')
                : t('matches.wonBy', {
                    name: match.sides.find((s) => s.side === match.winnerSide)?.name ?? '',
                  })}
            </p>
            <p className="text-sm text-muted-foreground">{match.resultSummary}</p>
            <Button asChild variant="link">
              <Link to={`/app/matches/${matchId}`}>{t('matches.viewScorecard')}</Link>
            </Button>
          </div>
        )}

        <div className="flex gap-2">
          <Button
            variant="outline"
            className="flex-1"
            disabled={busy || !canScore || undoSeq === null}
            onClick={() =>
              undoSeq !== null && void record({ kind: 'VOID', payload: {}, targetSeq: undoSeq })
            }
          >
            <Undo2 aria-hidden /> {t('matches.undo')}
          </Button>
          {status === 'live' && (
            <Button
              variant="outline"
              disabled={busy || !canScore}
              onClick={() => void record({ kind: 'LIFECYCLE', payload: { action: 'PAUSE' } })}
            >
              <Pause aria-hidden /> {t('matches.pause')}
            </Button>
          )}
        </div>

        <Timeline
          entries={projection.timeline}
          sides={match.sides}
          ui={ui}
          busy={busy || !canScore}
          onCorrect={(entry, payload) =>
            void record({ kind: 'REPLACE', payload, targetSeq: entry.seq })
          }
        />
      </main>

      <Dialog open={dialog === 'concede'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('matches.endEarly')}</DialogTitle>
            <DialogDescription>{t('matches.endEarlyBody')}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <ChoiceGroup
              label={t('matches.whoStops')}
              value={concedeSide}
              onChange={setConcedeSide}
              choices={match.sides.map((s) => ({ value: String(s.side), label: s.name }))}
            />
            <ChoiceGroup
              label={t('matches.reason')}
              value={concedeReason}
              onChange={setConcedeReason}
              columns={1}
              choices={(ui.concedeReasons ?? []).map((r) => ({
                value: r,
                label: t(`matches.concede.${r}`),
              }))}
            />
          </div>
          <DialogFooter>
            <Button
              disabled={concedeSide === null || concedeReason === null || busy}
              onClick={() => {
                setDialog(null);
                void record({
                  kind: 'COMMAND',
                  payload: ui.concede!(Number(concedeSide) as SideIndex, concedeReason!),
                });
              }}
            >
              {t('matches.confirmEnd')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={dialog === 'abandon'} onOpenChange={(open) => !open && setDialog(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t('matches.abandon')}</DialogTitle>
            <DialogDescription>{t('matches.abandonBody')}</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialog(null)}>
              {t('common.cancel')}
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                setDialog(null);
                void record({ kind: 'LIFECYCLE', payload: { action: 'ABANDON' } });
              }}
            >
              {t('matches.abandon')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
