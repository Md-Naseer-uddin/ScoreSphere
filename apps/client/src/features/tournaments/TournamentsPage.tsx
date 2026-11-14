import { type SportKey, type TournamentFormat } from '@scoresphere/contracts';
import { getSport, SPORTS, tournamentRules } from '@scoresphere/sports';
import { useMutation, useQuery } from '@tanstack/react-query';
import { ArrowLeft, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { toast } from 'sonner';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Skeleton } from '@/components/ui/skeleton';
import { useSession } from '@/features/auth/session';
import { useCurrentWorkspace } from '@/features/workspaces/current-workspace';
import { sportUi } from '@/sports/registry';
import type { SportSetup } from '@/sports/types';
import { createTournament, listTournaments, tournamentKeys } from './tournaments-api';

/** Sports that have both scoring screens and tournament rules. */
const tournamentSports = SPORTS.filter((s) => sportUi(s.key) && tournamentRules(s.key));

export function TournamentsPage() {
  const { t } = useTranslation();
  const workspace = useCurrentWorkspace();
  const authenticated = useSession((s) => s.status === 'authenticated');
  const { data, isPending } = useQuery({
    queryKey: tournamentKeys.list(workspace?.id ?? ''),
    queryFn: () => listTournaments(workspace!.id),
    enabled: Boolean(workspace) && authenticated,
  });
  return (
    <section className="space-y-4">
      <div className="flex items-center justify-between gap-2">
        <h1 className="text-2xl font-semibold">{t('tournaments.title')}</h1>
        <Button asChild>
          <Link to="/app/tournaments/new">
            <Plus aria-hidden /> {t('tournaments.new')}
          </Link>
        </Button>
      </div>
      {!authenticated ? (
        <p className="text-muted-foreground">{t('tournaments.needsOnline')}</p>
      ) : isPending ? (
        <Skeleton className="h-20 w-full" />
      ) : !data?.length ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-muted-foreground">
          {t('tournaments.empty')}
        </div>
      ) : (
        <ul className="space-y-2">
          {data.map((x) => (
            <li key={x.id}>
              <Link
                to={`/app/tournaments/${x.id}`}
                className="block rounded-xl border p-4 hover:bg-muted"
              >
                <p className="font-medium">{x.name}</p>
                <p className="text-sm text-muted-foreground">
                  {getSport(x.sport).name} · {t(`tournaments.format.${x.format}`)} ·{' '}
                  {t(`tournaments.status.${x.status}`)}
                </p>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export function NewTournamentPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const workspace = useCurrentWorkspace();
  const [name, setName] = useState('');
  const [sport, setSport] = useState<SportKey | null>(null);
  const [format, setFormat] = useState<TournamentFormat>('round_robin');
  const [setup, setSetup] = useState<SportSetup | null>(null);
  const ui = sport ? sportUi(sport) : undefined;

  const create = useMutation({
    mutationFn: () =>
      createTournament(workspace!.id, {
        name: name.trim(),
        sport: sport!,
        format,
        presetKey: setup!.presetKey,
        presetVersion: setup!.presetVersion,
        config: setup!.config,
      }),
    onSuccess: (tournament) => navigate(`/app/tournaments/${tournament.id}`, { replace: true }),
    onError: (e) => toast.error(e instanceof Error ? e.message : t('errors.generic')),
  });

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2">
        <Button asChild variant="ghost" size="icon" aria-label={t('common.back')}>
          <Link to="/app/tournaments">
            <ArrowLeft aria-hidden />
          </Link>
        </Button>
        <h1 className="text-2xl font-semibold">{t('tournaments.new')}</h1>
      </div>
      <div className="space-y-1">
        <Label htmlFor="tournament-name">{t('tournaments.name')}</Label>
        <Input
          id="tournament-name"
          maxLength={120}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
      </div>
      <ChoiceGroup
        label={t('matches.new.sport')}
        value={sport}
        onChange={(key) => {
          setSport(key);
          setSetup(sportUi(key)?.defaultSetup() ?? null);
        }}
        choices={tournamentSports.map((s) => ({ value: s.key, label: s.name }))}
      />
      <ChoiceGroup
        label={t('tournaments.formatLabel')}
        value={format}
        onChange={setFormat}
        choices={(['round_robin', 'single_elimination'] as const).map((f) => ({
          value: f,
          label: t(`tournaments.format.${f}`),
        }))}
      />
      {ui && <ui.Setup value={setup} onChange={setSetup} />}
      <Button
        className="w-full"
        size="lg"
        disabled={!name.trim() || !sport || !setup || !workspace || create.isPending}
        onClick={() => create.mutate()}
      >
        {t('tournaments.create')}
      </Button>
    </section>
  );
}
