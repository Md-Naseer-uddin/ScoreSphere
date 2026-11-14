import { hasRole, type TournamentDetail, type TournamentFixture } from '@scoresphere/contracts';
import { getSport, roundName, tournamentRules, TIE_BREAKS } from '@scoresphere/sports';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Award, Trash2 } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useParams } from 'react-router';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { useRoster, useTeams } from '@/features/teams/local-data';
import { useWorkspaces } from '@/features/workspaces/current-workspace';
import { sportUi } from '@/sports/registry';
import {
  addEntries,
  decideFixture,
  generateFixtures,
  getLeaderboards,
  getStandings,
  getTournament,
  getTournamentAwards,
  removeEntry,
  republishAwards,
  tournamentKeys,
} from './tournaments-api';

function EntriesCard({ tournament, canEdit }: { tournament: TournamentDetail; canEdit: boolean }) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const teamSport = sportUi(tournament.sport)?.namedSides ?? false;
  const teams = useTeams(tournament.workspaceId);
  const roster = useRoster(tournament.workspaceId);
  const [pick, setPick] = useState('');
  const set = (detail: TournamentDetail) =>
    queryClient.setQueryData(tournamentKeys.detail(tournament.id), detail);
  const add = useMutation({
    mutationFn: () =>
      addEntries(tournament.id, {
        entries: [teamSport ? { teamId: pick } : { rosterMemberId: pick }],
      }),
    onSuccess: (detail) => {
      set(detail);
      setPick('');
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });
  const remove = useMutation({
    mutationFn: (entryId: string) => removeEntry(tournament.id, entryId),
    onSuccess: set,
  });
  const generate = useMutation({
    mutationFn: () => generateFixtures(tournament.id),
    onSuccess: set,
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });
  const entered = new Set(tournament.entries.map((e) => e.teamId ?? e.rosterMemberId));
  const options = teamSport
    ? (teams ?? []).filter((x) => !entered.has(x.id)).map((x) => ({ id: x.id, name: x.name }))
    : (roster ?? [])
        .filter((x) => !entered.has(x.id))
        .map((x) => ({ id: x.id, name: x.displayName }));

  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tournaments.entries', { count: tournament.entries.length })}</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <ol className="space-y-1 text-sm">
          {tournament.entries.map((e) => (
            <li key={e.id} className="flex items-center justify-between gap-2">
              <span>
                <span className="mr-2 tabular-nums text-muted-foreground">{e.seed}.</span>
                {e.displayName}
              </span>
              {canEdit && tournament.status === 'draft' && (
                <Button
                  size="icon"
                  variant="ghost"
                  aria-label={t('tournaments.removeEntry', { name: e.displayName })}
                  onClick={() => remove.mutate(e.id)}
                >
                  <Trash2 aria-hidden />
                </Button>
              )}
            </li>
          ))}
        </ol>
        {canEdit && tournament.status === 'draft' && (
          <>
            <div className="flex gap-2">
              <select
                aria-label={teamSport ? t('tournaments.pickTeam') : t('tournaments.pickPlayer')}
                className="h-11 min-w-0 flex-1 rounded-lg border bg-background px-3 text-sm"
                value={pick}
                onChange={(e) => setPick(e.target.value)}
              >
                <option value="">
                  {teamSport ? t('tournaments.pickTeam') : t('tournaments.pickPlayer')}
                </option>
                {options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.name}
                  </option>
                ))}
              </select>
              <Button disabled={!pick || add.isPending} onClick={() => add.mutate()}>
                {t('tournaments.addEntry')}
              </Button>
            </div>
            <p className="text-xs text-muted-foreground">{t('tournaments.seedingHint')}</p>
            <Button
              className="w-full"
              disabled={tournament.entries.length < 2 || generate.isPending}
              onClick={() => generate.mutate()}
            >
              {t('tournaments.makeFixtures')}
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function FixtureRow({
  tournament,
  fixture,
  isAdmin,
}: {
  tournament: TournamentDetail;
  fixture: TournamentFixture;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const name = (id: string | null) =>
    id ? (tournament.entries.find((e) => e.id === id)?.displayName ?? '?') : t('tournaments.tbd');
  const decide = useMutation({
    mutationFn: (winner: string) => decideFixture(tournament.id, fixture.id, winner),
    onSuccess: (detail) => queryClient.setQueryData(tournamentKeys.detail(tournament.id), detail),
  });
  return (
    <li
      className="space-y-2 rounded-lg border p-3 text-sm"
      data-testid={`fixture-${fixture.round}-${fixture.position}`}
    >
      <div className="flex items-center justify-between gap-2">
        <span
          className={
            fixture.winnerEntryId === fixture.side1EntryId && fixture.winnerEntryId
              ? 'font-semibold'
              : ''
          }
        >
          {name(fixture.side1EntryId)}
        </span>
        <span className="text-muted-foreground">
          {fixture.bye ? t('tournaments.bye') : t('matches.vs').trim()}
        </span>
        <span
          className={
            fixture.winnerEntryId === fixture.side2EntryId && fixture.winnerEntryId
              ? 'font-semibold'
              : ''
          }
        >
          {fixture.bye ? '' : name(fixture.side2EntryId)}
        </span>
      </div>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs text-muted-foreground">
          {fixture.resultSummary ?? t(`tournaments.fixtureStatus.${fixture.status}`)}
        </span>
        {fixture.status === 'ready' && (
          <Button size="sm" asChild>
            <Link to={`/app/matches/new?fixture=${fixture.id}&tournament=${tournament.id}`}>
              {t('tournaments.score')}
            </Link>
          </Button>
        )}
        {fixture.matchId && (
          <Button size="sm" variant="outline" asChild>
            <Link to={`/app/matches/${fixture.matchId}`}>{t('tournaments.openMatch')}</Link>
          </Button>
        )}
      </div>
      {fixture.needsDecision && (
        <div className="space-y-2 rounded-md bg-muted p-2">
          <p>{t('tournaments.needsDecision')}</p>
          {isAdmin && (
            <div className="flex gap-2">
              {[fixture.side1EntryId, fixture.side2EntryId].map((id) => (
                <Button
                  key={id}
                  size="sm"
                  variant="outline"
                  disabled={decide.isPending}
                  onClick={() => id && decide.mutate(id)}
                >
                  {t('tournaments.advance', { name: name(id) })}
                </Button>
              ))}
            </div>
          )}
        </div>
      )}
    </li>
  );
}

function StandingsCard({ tournament }: { tournament: TournamentDetail }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: tournamentKeys.standings(tournament.id),
    queryFn: () => getStandings(tournament.id),
  });
  if (!data) return null;
  const breaks = tournament.tieBreaks.filter((k) => TIE_BREAKS[k]);
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tournaments.standings')}</CardTitle>
      </CardHeader>
      <CardContent className="overflow-x-auto">
        <table className="w-full text-sm" aria-label={t('tournaments.standings')}>
          <thead>
            <tr className="text-left text-xs text-muted-foreground">
              <th className="py-1 font-normal">#</th>
              <th className="py-1 font-normal">{t('tournaments.entry')}</th>
              <th className="py-1 text-right font-normal">P</th>
              <th className="py-1 text-right font-normal">W</th>
              {tournamentRules(tournament.sport)?.allowsDraws && (
                <th className="py-1 text-right font-normal">D</th>
              )}
              <th className="py-1 text-right font-normal">L</th>
              <th className="py-1 text-right font-normal">Pts</th>
              {breaks.map((k) => (
                <th key={k} className="py-1 text-right font-normal">
                  {TIE_BREAKS[k]!.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {data.map((r) => (
              <tr key={r.entryId} className="border-t">
                <td className="py-1.5 tabular-nums">{r.rank}</td>
                <td className="py-1.5 font-medium">{r.displayName}</td>
                <td className="py-1.5 text-right tabular-nums">{r.played}</td>
                <td className="py-1.5 text-right tabular-nums">{r.won}</td>
                {tournamentRules(tournament.sport)?.allowsDraws && (
                  <td className="py-1.5 text-right tabular-nums">{r.drawn}</td>
                )}
                <td className="py-1.5 text-right tabular-nums">{r.lost}</td>
                <td className="py-1.5 text-right font-semibold tabular-nums">{r.points}</td>
                {breaks.map((k) => (
                  <td key={k} className="py-1.5 text-right tabular-nums">
                    {Number.isInteger(r.tieBreaks[k]) ? r.tieBreaks[k] : r.tieBreaks[k]?.toFixed(3)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </CardContent>
    </Card>
  );
}

function LeaderboardsCard({ tournamentId }: { tournamentId: string }) {
  const { t } = useTranslation();
  const { data } = useQuery({
    queryKey: tournamentKeys.leaderboards(tournamentId),
    queryFn: () => getLeaderboards(tournamentId),
  });
  if (!data?.some((b) => b.rows.length)) return null;
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t('tournaments.leaderboards')}</CardTitle>
      </CardHeader>
      <CardContent className="grid gap-4 sm:grid-cols-2">
        {data
          .filter((b) => b.rows.length)
          .map((board) => (
            <div key={board.metric}>
              <p className="mb-1 text-sm font-medium">{board.label}</p>
              <ol className="space-y-0.5 text-sm">
                {board.rows.map((r) => (
                  <li key={r.rosterMemberId} className="flex justify-between">
                    <span>{r.displayName}</span>
                    <span className="tabular-nums">{r.value}</span>
                  </li>
                ))}
              </ol>
            </div>
          ))}
      </CardContent>
    </Card>
  );
}

function TournamentAwardsCard({
  tournamentId,
  isAdmin,
}: {
  tournamentId: string;
  isAdmin: boolean;
}) {
  const { t } = useTranslation();
  const queryClient = useQueryClient();
  const { data } = useQuery({
    queryKey: tournamentKeys.awards(tournamentId),
    queryFn: () => getTournamentAwards(tournamentId),
  });
  const republish = useMutation({
    mutationFn: () => republishAwards(tournamentId),
    onSuccess: (records) => {
      queryClient.setQueryData(tournamentKeys.awards(tournamentId), records);
      toast.success(t('tournaments.awardsPublished'));
    },
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });
  if (!data?.length) return null;
  const stale = data.some((a) => a.status === 'STALE');
  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Award aria-hidden className="size-4" /> {t('awards.title')}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {stale && (
          <p className="rounded-md bg-destructive/10 p-2 text-sm text-destructive">
            {t('tournaments.awardsStale')}
          </p>
        )}
        {data.map((a) => (
          <div key={a.awardKey} className="text-sm" data-testid={`tournament-award-${a.awardKey}`}>
            <div className="flex items-center gap-2">
              <span className="font-medium">{a.name}</span>
              {a.status === 'STALE' && (
                <Badge variant="destructive">{t('tournaments.needsReview')}</Badge>
              )}
            </div>
            <p>{a.recipients.map((r) => r.displayName).join(' & ')}</p>
            {Object.keys(a.metrics).length > 0 && (
              <p className="text-xs text-muted-foreground">
                {Object.entries(a.metrics)
                  .map(([k, v]) => `${t(`awards.metric.${k}`, { defaultValue: k })}: ${v}`)
                  .join(' · ')}
              </p>
            )}
          </div>
        ))}
        {isAdmin && (
          <Button
            variant={stale ? 'default' : 'outline'}
            disabled={republish.isPending}
            onClick={() => republish.mutate()}
          >
            {t('tournaments.republish')}
          </Button>
        )}
      </CardContent>
    </Card>
  );
}

/** One tournament: entries, fixtures, standings, leaderboards and awards (plan M7). */
export function TournamentPage() {
  const { t } = useTranslation();
  const { tournamentId = '' } = useParams();
  const { data: tournament, isPending } = useQuery({
    queryKey: tournamentKeys.detail(tournamentId),
    queryFn: () => getTournament(tournamentId),
  });
  const { data: workspaces } = useWorkspaces();
  if (isPending) return <Skeleton className="h-64 w-full" />;
  if (!tournament) return <p className="text-muted-foreground">{t('tournaments.notFound')}</p>;
  const role = workspaces?.find((w) => w.id === tournament.workspaceId)?.role;
  const canEdit = role !== undefined && hasRole(role, 'SCORER');
  const isAdmin = role !== undefined && hasRole(role, 'ADMIN');
  const rounds = [...new Set(tournament.fixtures.map((f) => f.round))].sort((a, b) => a - b);
  const totalRounds = rounds.length;

  return (
    <section className="space-y-5">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/tournaments">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <div className="min-w-0 flex-1">
          <h1 className="truncate text-xl font-semibold">{tournament.name}</h1>
          <p className="text-sm text-muted-foreground">
            {getSport(tournament.sport).name} · {t(`tournaments.format.${tournament.format}`)} ·{' '}
            {t(`tournaments.status.${tournament.status}`)}
          </p>
        </div>
      </div>
      <EntriesCard tournament={tournament} canEdit={canEdit} />
      {tournament.format === 'round_robin' && tournament.status !== 'draft' && (
        <StandingsCard tournament={tournament} />
      )}
      {rounds.map((round) => (
        <Card key={round}>
          <CardHeader>
            <CardTitle>
              {tournament.format === 'single_elimination'
                ? roundName(round, totalRounds)
                : t('tournaments.round', { round })}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <ul className="space-y-2">
              {tournament.fixtures
                .filter((f) => f.round === round)
                .map((f) => (
                  <FixtureRow key={f.id} tournament={tournament} fixture={f} isAdmin={isAdmin} />
                ))}
            </ul>
          </CardContent>
        </Card>
      ))}
      {tournament.status !== 'draft' && <LeaderboardsCard tournamentId={tournament.id} />}
      {tournament.status === 'completed' && (
        <TournamentAwardsCard tournamentId={tournament.id} isAdmin={isAdmin} />
      )}
    </section>
  );
}
