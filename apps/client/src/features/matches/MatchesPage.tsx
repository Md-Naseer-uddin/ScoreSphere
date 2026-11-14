import type { MatchStatus, SportKey } from '@scoresphere/contracts';
import { getSport } from '@scoresphere/sports';
import { useQuery } from '@tanstack/react-query';
import { useLiveQuery } from 'dexie-react-hooks';
import { CloudUpload, Plus } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { Link } from 'react-router';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { db } from '@/lib/db';
import { listMatches, matchKeys } from './matches-api';
import { StatusBadge } from './StatusBadge';

interface Row {
  id: string;
  sport: SportKey;
  title: string | null;
  sideNames: string[];
  status: MatchStatus;
  summary: string;
  updatedAt: string;
  pending: number;
}

/** Match history for the current workspace: this device's matches plus the server's. */
export function MatchesPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const userId = useSession((s) => s.user?.id);
  const authenticated = useSession((s) => s.status === 'authenticated');

  const local = useLiveQuery(async () => {
    if (!workspace || !userId) return [];
    const matches = await db.matches
      .where('[ownerUserId+workspaceId]')
      .equals([userId, workspace.id])
      .toArray();
    return Promise.all(
      matches.map(async (m): Promise<Row> => ({
        id: m.id,
        sport: m.sport,
        title: m.title,
        sideNames: m.sides.map((s) => s.name),
        status: m.status,
        summary: m.resultSummary,
        updatedAt: m.updatedAt,
        pending: await db.matchEvents.where('[matchId+sync]').equals([m.id, 'pending']).count(),
      })),
    );
  }, [workspace?.id, userId]);

  const remote = useQuery({
    queryKey: matchKeys.list(workspace?.id ?? ''),
    queryFn: () => listMatches(workspace!.id),
    enabled: Boolean(workspace) && authenticated,
  });

  const rows = new Map<string, Row>();
  for (const m of remote.data ?? []) {
    rows.set(m.id, {
      id: m.id,
      sport: m.sport,
      title: m.title,
      sideNames: m.sides.map((s) => s.name),
      status: m.status,
      summary: m.result?.summary ?? '',
      updatedAt: m.updatedAt,
      pending: 0,
    });
  }
  // This device's copy is at least as fresh as the server's for matches scored here.
  for (const m of local ?? []) rows.set(m.id, m);
  const sorted = [...rows.values()].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('matches.title')}</h1>
        <Button asChild variant="outline" className="ml-auto">
          <Link to="/app/tournaments">{t('tournaments.title')}</Link>
        </Button>
        <Button asChild>
          <Link to="/app/matches/new">
            <Plus aria-hidden /> {t('matches.new.title')}
          </Link>
        </Button>
      </div>

      {local === undefined ? (
        <Skeleton className="h-20 w-full" />
      ) : sorted.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          <p>{t('matches.empty')}</p>
        </div>
      ) : (
        <ul className="space-y-2">
          {sorted.map((m) => (
            <li key={m.id}>
              <Link
                to={`/app/matches/${m.id}`}
                className="block rounded-xl border p-4 transition-colors hover:bg-muted"
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-muted-foreground">{getSport(m.sport).name}</span>
                  <StatusBadge status={m.status} />
                </div>
                <p className="mt-1 font-medium">{m.title ?? m.sideNames.join(t('matches.vs'))}</p>
                <div className="mt-1 flex items-center justify-between gap-2 text-sm text-muted-foreground">
                  <span className="tabular-nums">{m.summary}</span>
                  {m.pending > 0 && (
                    <span className="inline-flex items-center gap-1">
                      <CloudUpload aria-hidden className="size-3.5" />
                      {t('matches.sync.pending', { count: m.pending })}
                    </span>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
