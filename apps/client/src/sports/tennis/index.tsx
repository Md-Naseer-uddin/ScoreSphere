import type { SideIndex } from '@scoresphere/contracts';
import {
  gameCall,
  tennisCurrentServer,
  tennisEngine,
  tennisPresets,
  type TennisSettings,
  type TennisState,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SideView } from '@/features/matches/hooks';
import { cn } from '@/lib/utils';
import type { ControlsProps, MatchViewProps, SetupProps, SportUi } from '../types';

const tr = (key: string, options: Record<string, unknown> = {}) => i18next.t(key, options);
const sideName = (sides: SideView[], side: number) =>
  sides.find((s) => s.side === side)?.name ?? '?';
function nameOf(sides: SideView[], id: string | null | undefined) {
  for (const s of sides)
    for (const p of s.participants) if (p.participantId === id) return p.displayName;
  return '?';
}

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? tennisPresets[0]!.key;
  const config = (value?.config ?? {
    ...tennisPresets[0]!.config,
    discipline: 'singles',
  }) as TennisSettings;
  const emit = (key: string, patch: Partial<TennisSettings>) => {
    const preset = tennisPresets.find((p) => p.key === key)!;
    const base = key === presetKey ? config : { ...preset.config, discipline: config.discipline };
    onChange({ presetKey: key, presetVersion: preset.version, config: { ...base, ...patch } });
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
        choices={tennisPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="tn-noad" className="font-normal">
          {t('tennis.noAd')}
        </Label>
        <Switch
          id="tn-noad"
          checked={config.noAd}
          onCheckedChange={(noAd) => emit(presetKey, { noAd })}
        />
      </div>
    </div>
  );
}

function callText(state: TennisState, sides: SideView[]): string {
  const call = gameCall(state);
  switch (call.kind) {
    case 'deuce':
      return tr('tennis.deuce');
    case 'advantage':
      return tr('tennis.advantage', { name: sideName(sides, call.side) });
    case 'tiebreak':
      return tr('tennis.tiebreakScore', { score: `${call.values[0]}–${call.values[1]}` });
    case 'points':
      return `${call.values[0]}–${call.values[1]}`;
  }
}

function Scoreboard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as TennisState;
  const server = tennisCurrentServer(state);
  const serving = server ? (state.players[0].includes(server) ? 0 : 1) : null;
  const shownSets = state.sets.filter(
    (s) => s.winner !== null || s.games[0] + s.games[1] > 0 || s.matchTiebreak,
  );
  const call = gameCall(state);
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span
              aria-label={serving === side ? t('badminton.serving') : undefined}
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                serving === side ? 'bg-primary' : 'bg-transparent',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            {shownSets.map((set, i) => (
              <span
                key={i}
                className={cn('w-6 text-center tabular-nums', set.winner === side && 'font-bold')}
              >
                {set.matchTiebreak
                  ? (set.tiebreak?.[side] ?? state.game.points[side])
                  : set.games[side]}
              </span>
            ))}
            {state.phase === 'playing' && (
              <span
                className="w-12 text-right text-2xl font-bold tabular-nums"
                data-testid={`points-${side}`}
              >
                {call.kind === 'points' || call.kind === 'tiebreak' ? call.values[side] : ''}
              </span>
            )}
          </div>
        ))}
      </div>
      {state.phase === 'playing' && (
        <p className="text-sm text-muted-foreground" role="status">
          {callText(state, sides)} · {t('tennis.serving', { name: nameOf(sides, server) })}
        </p>
      )}
    </section>
  );
}

function StartMatch({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as TennisState;
  const doubles = state.config.discipline === 'doubles';
  const [servingSide, setServingSide] = useState<string | null>(null);
  const [firsts, setFirsts] = useState<[string | null, string | null]>([null, null]);
  const ready = servingSide !== null && (!doubles || (firsts[0] && firsts[1]));
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <ChoiceGroup
        label={t('badminton.whoServes')}
        value={servingSide}
        onChange={setServingSide}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      {doubles &&
        ([0, 1] as const).map((side) => (
          <ChoiceGroup
            key={side}
            label={t('tennis.firstServerFor', { name: sideName(sides, side) })}
            value={firsts[side]}
            onChange={(id) => setFirsts((f) => (side === 0 ? [id, f[1]] : [f[0], id]))}
            choices={state.players[side].map((id) => ({ value: id, label: nameOf(sides, id) }))}
          />
        ))}
      <Button
        className="w-full"
        size="lg"
        disabled={!ready || busy}
        onClick={() =>
          void onCommand({
            type: 'start_match',
            servingSide: Number(servingSide) as SideIndex,
            ...(doubles ? { firstServers: firsts } : {}),
          })
        }
      >
        {t('tennis.startMatch')}
      </Button>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const state = props.projection.state as TennisState;
  if (state.phase === 'pre_match') return <StartMatch {...props} />;
  if (state.phase !== 'playing') return null;
  return (
    <div className="grid grid-cols-2 gap-3">
      {([0, 1] as const).map((side) => (
        <Button
          key={side}
          size="lg"
          variant={side === 0 ? 'default' : 'secondary'}
          className="h-28 whitespace-normal text-lg"
          disabled={props.busy}
          onClick={() => void props.onCommand({ type: 'point', winner: side })}
        >
          {t('badminton.pointTo', { name: sideName(props.sides, side) })}
        </Button>
      ))}
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as TennisState;
  const stats = tennisEngine.stats(state);
  const metric = (m: string, side: number) =>
    stats.find((s) => s.metric === m && s.side === side)?.value ?? 0;
  const pct = (side: number) => {
    const played = metric('service_points_played', side);
    return played ? `${Math.round((metric('service_points_won', side) / played) * 100)}%` : '–';
  };
  const rows: [string, (side: number) => string | number][] = [
    ['points_won', (s) => metric('points_won', s)],
    ['service_points_won', pct],
    ['breaks', (s) => metric('breaks', s)],
    ['tiebreaks_won', (s) => metric('tiebreaks_won', s)],
  ];
  return (
    <div className="space-y-4">
      <p className="font-medium tabular-nums">{tennisEngine.result(state).summary}</p>
      <table className="w-full text-sm">
        <caption className="mb-1 text-left font-medium">{t('matches.stats')}</caption>
        <thead>
          <tr className="text-xs text-muted-foreground">
            <th />
            <th className="text-right font-normal">{sideName(sides, 0)}</th>
            <th className="text-right font-normal">{sideName(sides, 1)}</th>
          </tr>
        </thead>
        <tbody>
          {rows.map(([key, value]) => (
            <tr key={key} className="border-t">
              <th className="py-1.5 text-left font-normal text-muted-foreground">
                {t(`tennis.metric.${key}`)}
              </th>
              <td className="py-1.5 text-right tabular-nums">{value(0)}</td>
              <td className="py-1.5 text-right tabular-nums">{value(1)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return tr('matches.unknownEvent');
  if (cmd.type === 'point') {
    const name = sideName(sides, cmd.winner as number);
    const set = entry.facts.find((f) => f.type === 'set_won');
    const game = entry.facts.find((f) => f.type === 'game_won');
    if (set) return tr('tennis.timeline.set', { name });
    if (game)
      return tr('tennis.timeline.game', { name, games: (game.data?.games as number[]).join('–') });
    return tr('tennis.timeline.point', { name });
  }
  if (cmd.type === 'start_match')
    return tr('tennis.timeline.start', { name: sideName(sides, cmd.servingSide as number) });
  if (cmd.type === 'concede')
    return tr(
      `badminton.timeline.concede.${cmd.reason === 'defaulted' ? 'disqualified' : cmd.reason}`,
      { name: sideName(sides, cmd.side as number) },
    );
  return cmd.type;
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    const name = sideName(sides, f.data?.side as number);
    if (f.type === 'change_ends') return [tr('badminton.announce.changeEnds')];
    if (f.type === 'break') return [tr('tennis.announce.break', { name })];
    if (f.type === 'set_won') return [tr('tennis.announce.set', { name })];
    if (f.type === 'match_won') return [tr('badminton.announce.matchWon', { name })];
    return [];
  });
}

export const tennisUi: SportUi = {
  sport: 'tennis',
  Setup,
  defaultSetup: () => {
    const preset = tennisPresets[0]!;
    return {
      presetKey: preset.key,
      presetVersion: preset.version,
      config: { ...preset.config, discipline: 'singles' },
    };
  },
  sideSize: (config) => {
    const n = (config as TennisSettings).discipline === 'doubles' ? 2 : 1;
    return { min: n, max: n, initial: n };
  },
  namedSides: false,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  correction: (entry) => {
    if (entry.command?.type !== 'point') return null;
    return {
      label: tr('badminton.correctWinner'),
      payload: { type: 'point', winner: entry.command.winner === 0 ? 1 : 0 },
    };
  },
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['retired', 'walkover', 'defaulted'],
};
