import type { SideIndex } from '@scoresphere/contracts';
import {
  type BadmintonSettings,
  type BadmintonState,
  badmintonEngine,
  badmintonPlayerOfTheMatch,
  badmintonPresets,
  currentGame,
  gamesWon,
  serviceView,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { Award } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SideView } from '@/features/matches/hooks';
import { cn } from '@/lib/utils';
import type { ControlsProps, MatchViewProps, SetupProps, SportUi } from '../types';

const t = (key: string, options: Record<string, unknown> = {}) => i18next.t(key, options);

function nameOf(sides: SideView[], participantId: string | null | undefined): string {
  for (const s of sides) {
    const p = s.participants.find((x) => x.participantId === participantId);
    if (p) return p.displayName;
  }
  return '?';
}

const sideName = (sides: SideView[], side: number) =>
  sides.find((s) => s.side === side)?.name ?? '?';

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const config = (value?.config ?? {
    ...badmintonPresets[0]!.config,
    discipline: 'singles',
  }) as BadmintonSettings;
  const presetKey = value?.presetKey ?? badmintonPresets[0]!.key;
  const emit = (key: string, patch: Partial<BadmintonSettings>) => {
    const preset = badmintonPresets.find((p) => p.key === key)!;
    const base = key === presetKey ? config : { ...preset.config, discipline: config.discipline };
    onChange({ presetKey: key, presetVersion: preset.version, config: { ...base, ...patch } });
  };
  const number = (field: 'pointsToWin' | 'cap' | 'gamesToWin', raw: string) => {
    const n = Number(raw);
    if (field === 'cap' && raw === '') return emit(presetKey, { cap: null });
    if (Number.isInteger(n) && n > 0) emit(presetKey, { [field]: n });
  };

  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t('badminton.discipline')}
        value={config.discipline}
        onChange={(discipline) => emit(presetKey, { discipline })}
        choices={[
          { value: 'singles', label: t('badminton.singles') },
          { value: 'doubles', label: t('badminton.doubles') },
        ]}
      />
      <ChoiceGroup
        label={t('matches.new.format')}
        columns={1}
        value={presetKey}
        onChange={(key) => emit(key, {})}
        choices={badmintonPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-3 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        <div className="space-y-1">
          <Label htmlFor="bd-points">{t('badminton.pointsToWin')}</Label>
          <Input
            id="bd-points"
            inputMode="numeric"
            value={config.pointsToWin}
            onChange={(e) => number('pointsToWin', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bd-cap">{t('badminton.cap')}</Label>
          <Input
            id="bd-cap"
            inputMode="numeric"
            value={config.cap ?? ''}
            onChange={(e) => number('cap', e.target.value)}
          />
        </div>
        <div className="space-y-1">
          <Label htmlFor="bd-games">{t('badminton.gamesToWin')}</Label>
          <Input
            id="bd-games"
            inputMode="numeric"
            value={config.gamesToWin}
            onChange={(e) => number('gamesToWin', e.target.value)}
          />
        </div>
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as BadmintonState;
  const game = currentGame(state);
  const won = gamesWon(state);
  const service = serviceView(state);
  const finished = state.games.filter((g) => g.winner !== null);

  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
            data-testid={`side-${side}`}
          >
            <span
              aria-label={service?.servingSide === side ? t('badminton.serving') : undefined}
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                service?.servingSide === side ? 'bg-primary' : 'bg-transparent',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            <span className="text-sm text-muted-foreground" aria-label={t('badminton.gamesWon')}>
              {won[side]}
            </span>
            <span
              className="w-14 text-right text-4xl font-bold tabular-nums"
              data-testid={`points-${side}`}
            >
              {state.phase === 'complete' && game.points[0] + game.points[1] === 0
                ? ''
                : game.points[side]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" role="status">
        {state.phase === 'complete'
          ? t('badminton.matchOver')
          : service
            ? t('badminton.serviceLine', {
                game: state.games.length,
                server: nameOf(sides, service.serverId),
                receiver: nameOf(sides, service.receiverId),
                court: t(`badminton.court.${service.court}`),
              })
            : t('badminton.gameNotStarted', { game: state.games.length })}
      </p>
      {finished.length > 0 && (
        <p className="text-sm">
          {finished.map((g, i) => (
            <span key={i} className="mr-3 tabular-nums">
              {t('badminton.gameScore', { game: i + 1, score: `${g.points[0]}–${g.points[1]}` })}
            </span>
          ))}
        </p>
      )}
    </section>
  );
}

function StartGame({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as BadmintonState;
  const doubles = state.config.discipline === 'doubles';
  const [servingSide, setServingSide] = useState<SideIndex | null>(state.nextServingSide);
  const [serverId, setServerId] = useState<string | null>(null);
  const [receiverId, setReceiverId] = useState<string | null>(null);
  const chosen = servingSide ?? state.nextServingSide;
  const receiving = chosen === null ? null : chosen === 0 ? 1 : 0;
  const players = (side: number | null) =>
    side === null
      ? []
      : state.players[side as SideIndex].map((id) => ({ value: id, label: nameOf(sides, id) }));
  const ready = chosen !== null && (!doubles || (serverId && receiverId));

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">{t('badminton.startGame', { game: state.games.length })}</h2>
      {state.nextServingSide !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('badminton.winnerServes', { name: sideName(sides, state.nextServingSide) })}
        </p>
      ) : (
        <ChoiceGroup
          label={t('badminton.whoServes')}
          value={chosen === null ? null : String(chosen)}
          onChange={(v) => {
            setServingSide(Number(v) as SideIndex);
            setServerId(null);
            setReceiverId(null);
          }}
          choices={[0, 1].map((side) => ({ value: String(side), label: sideName(sides, side) }))}
        />
      )}
      {doubles && chosen !== null && (
        <>
          <ChoiceGroup
            label={t('badminton.firstServer')}
            value={serverId}
            onChange={setServerId}
            choices={players(chosen)}
          />
          <ChoiceGroup
            label={t('badminton.firstReceiver')}
            value={receiverId}
            onChange={setReceiverId}
            choices={players(receiving)}
          />
        </>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={!ready || busy}
        onClick={() =>
          void onCommand({
            type: 'start_game',
            servingSide: chosen,
            ...(doubles ? { serverId, receiverId } : {}),
          })
        }
      >
        {t('badminton.startGame', { game: state.games.length })}
      </Button>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const state = props.projection.state as BadmintonState;
  if (state.phase === 'complete') return null;
  if (state.phase === 'awaiting_service') return <StartGame {...props} />;
  return (
    <div className="grid grid-cols-2 gap-3">
      {([0, 1] as const).map((side) => (
        <Button
          key={side}
          size="lg"
          variant={side === 0 ? 'default' : 'secondary'}
          className="h-28 whitespace-normal text-lg"
          disabled={props.busy}
          onClick={() => void props.onCommand({ type: 'rally', winner: side })}
        >
          {t('badminton.pointTo', { name: sideName(props.sides, side) })}
        </Button>
      ))}
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as BadmintonState;
  const stats = badmintonEngine.stats(state);
  const games = state.games.filter((g) => g.winner !== null || g.points[0] + g.points[1] > 0);
  const metric = (name: string, side: number) =>
    stats.find((s) => s.metric === name && s.side === side && !s.participantId)?.value ?? 0;
  const award = badmintonPlayerOfTheMatch.compute(state, stats);
  const rows = ['points_won', 'service_points_won', 'receiving_points_won', 'longest_streak'];

  return (
    <div className="space-y-4">
      <table className="w-full text-sm">
        <caption className="sr-only">{t('matches.scorecard')}</caption>
        <thead>
          <tr className="text-left text-muted-foreground">
            <th className="py-1 font-normal">{t('matches.side')}</th>
            {games.map((_, i) => (
              <th key={i} className="py-1 text-right font-normal">
                {t('badminton.gameShort', { game: i + 1 })}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {([0, 1] as const).map((side) => (
            <tr key={side} className="border-t">
              <th className="py-2 text-left font-medium">{sideName(sides, side)}</th>
              {games.map((g, i) => (
                <td
                  key={i}
                  className={cn('py-2 text-right tabular-nums', g.winner === side && 'font-bold')}
                >
                  {g.points[side]}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <table className="w-full text-sm">
        <caption className="mb-1 text-left font-medium">{t('matches.stats')}</caption>
        <tbody>
          {rows.map((row) => (
            <tr key={row} className="border-t">
              <th className="py-1.5 text-left font-normal text-muted-foreground">
                {t(`badminton.metric.${row}`)}
              </th>
              <td className="py-1.5 text-right tabular-nums">{metric(row, 0)}</td>
              <td className="py-1.5 text-right tabular-nums">{metric(row, 1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
      {award && (
        <div className="flex items-start gap-3 rounded-xl border p-3">
          <Award aria-hidden className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-medium">
              {badmintonPlayerOfTheMatch.name}:{' '}
              {award.recipients.map((r) => nameOf(sides, r.participantId)).join(' & ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('matches.awardAuto')} · {badmintonPlayerOfTheMatch.criteria}
            </p>
          </div>
        </div>
      )}
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return t(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return t('matches.unknownEvent');
  if (cmd.type === 'rally') {
    const point = entry.facts.find((f) => f.type === 'point');
    const score = (point?.data?.score as number[] | undefined)?.join('–');
    return score
      ? t('badminton.timeline.rally', { name: sideName(sides, cmd.winner as number), score })
      : t('badminton.timeline.rallyUndone', { name: sideName(sides, cmd.winner as number) });
  }
  if (cmd.type === 'start_game') {
    const game = entry.facts.find((f) => f.type === 'game_started')?.data?.game;
    return t('badminton.timeline.startGame', {
      game: game ?? '',
      name: sideName(sides, cmd.servingSide as number),
    });
  }
  if (cmd.type === 'concede') {
    return t(`badminton.timeline.concede.${cmd.reason as string}`, {
      name: sideName(sides, cmd.side as number),
    });
  }
  return cmd.type;
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    if (f.type === 'interval') return [t('badminton.announce.interval')];
    if (f.type === 'change_ends') return [t('badminton.announce.changeEnds')];
    if (f.type === 'game_won') {
      const score = (f.data?.score as number[]).join('–');
      return [
        t('badminton.announce.gameWon', { name: sideName(sides, f.data?.side as number), score }),
      ];
    }
    if (f.type === 'match_won')
      return [t('badminton.announce.matchWon', { name: sideName(sides, f.data?.side as number) })];
    return [];
  });
}

export const badmintonUi: SportUi = {
  sport: 'badminton',
  Setup,
  defaultSetup: () => {
    const preset = badmintonPresets[0]!;
    return {
      presetKey: preset.key,
      presetVersion: preset.version,
      config: { ...preset.config, discipline: 'singles' },
    };
  },
  sideSize: (config) => {
    const n = (config as BadmintonSettings).discipline === 'doubles' ? 2 : 1;
    return { min: n, max: n, initial: n };
  },
  namedSides: false,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  correction: (entry) => {
    if (entry.command?.type !== 'rally') return null;
    const other = entry.command.winner === 0 ? 1 : 0;
    return { label: t('badminton.correctWinner'), payload: { type: 'rally', winner: other } };
  },
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['retired', 'walkover', 'disqualified'],
};
