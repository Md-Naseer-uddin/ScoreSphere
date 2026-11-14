import type { SideIndex } from '@scoresphere/contracts';
import { formatClock, periodClockRunning, periodElapsed } from '@scoresphere/engine-kit';
import {
  basketballClockLeft,
  basketballEngine,
  basketballPresets,
  type BasketballSettings,
  type BasketballState,
  FOUL_KINDS,
  inPenalty,
  PLAY_KINDS,
  teamFouls,
  timeoutsLeft,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { type SideView, useNow } from '@/features/matches/hooks';
import { cn } from '@/lib/utils';
import type { ControlsProps, MatchViewProps, SetupProps, SportUi } from '../types';

const tr = (key: string, options: Record<string, unknown> = {}) => i18next.t(key, options);
const sideName = (sides: SideView[], side: number) =>
  sides.find((s) => s.side === side)?.name ?? '?';
function nameOf(sides: SideView[], id: string | null | undefined) {
  if (!id) return tr('football.notRecorded');
  for (const s of sides)
    for (const p of s.participants) if (p.participantId === id) return p.displayName;
  return '?';
}
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-2 text-sm';

/** "Quarter 2", "Overtime 1"… for period `n` of `periods` regular ones. */
function periodName(periods: number, n: number): string {
  if (n > periods) return tr('basketball.overtime', { n: n - periods });
  if (periods === 4) return tr('hockey.quarter', { n });
  if (periods === 2) return tr(`football.period.half${n}`);
  if (periods === 1) return tr('basketball.game');
  return tr('football.period.numbered', { n });
}

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? basketballPresets[0]!.key;
  const config = (value?.config ?? basketballPresets[0]!.config) as BasketballSettings;
  const preset = basketballPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<BasketballSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (id: string, key: keyof BasketballSettings, allowEmpty = false) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`basketball.setup.${key}`)}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={(config[key] as number | null) ?? ''}
        onChange={(e) => {
          if (allowEmpty && e.target.value === '') return set({ [key]: null });
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0) set({ [key]: n });
        }}
      />
    </div>
  );
  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t('matches.new.format')}
        columns={1}
        value={presetKey}
        onChange={(key) => {
          const p = basketballPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={basketballPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('bb-periods', 'periods')}
        {field('bb-minutes', 'periodMinutes')}
        {field('bb-ot', 'overtimeMinutes')}
        {field('bb-fouls', 'foulLimit', true)}
        {field('bb-team-fouls', 'teamFoulLimit', true)}
        {field('bb-to1', 'timeoutsFirstHalf')}
        {field('bb-to2', 'timeoutsSecondHalf')}
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as BasketballState;
  const now = useNow(200) + clockOffsetMs;
  const { periods } = state.config;
  const status =
    state.phase === 'pre_match'
      ? t('basketball.preGame')
      : state.phase === 'playing'
        ? `${periodName(periods, state.periods.number)} · ${formatClock(basketballClockLeft(state, now))}${
            periodClockRunning(state.periods) ? '' : ` · ${t('hockey.clockStopped')}`
          }`
        : state.phase === 'break'
          ? t('football.status.break', { period: periodName(periods, state.periods.number) })
          : t('basketball.final');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            {state.phase !== 'pre_match' && state.phase !== 'complete' && (
              <span className="text-right text-xs text-muted-foreground">
                {t('basketball.fouls', { count: teamFouls(state, side) })}
                {inPenalty(state, side) && (
                  <span className="ml-1 rounded bg-destructive/10 px-1 font-medium text-destructive">
                    {t('basketball.penalty')}
                  </span>
                )}
                <br />
                {t('basketball.timeoutsLeft', { count: timeoutsLeft(state, side) })}
              </span>
            )}
            <span
              className="w-16 text-right text-4xl font-bold tabular-nums"
              data-testid={`points-${side}`}
            >
              {state.score[side]}
            </span>
          </div>
        ))}
      </div>
      <p
        className="text-sm text-muted-foreground tabular-nums"
        role="status"
        data-testid="basketball-status"
      >
        {status}
      </p>
      {state.disqualified.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('basketball.outOfGame', {
            names: state.disqualified.map((id) => nameOf(sides, id)).join(', '),
          })}
        </p>
      )}
    </section>
  );
}

/**
 * The shot clock, as a display aid on the scoring device only: it runs down with the game
 * clock and is reset to 24 or 14 seconds by hand. It is not recorded in the match.
 */
function ShotClock({ state }: { state: BasketballState }) {
  const { t } = useTranslation();
  const now = useNow(100);
  const [reset, setReset] = useState({ seconds: 24, at: 0, period: state.periods.number });
  const elapsed = periodElapsed(state.periods, now);
  const current =
    reset.period === state.periods.number
      ? reset
      : { seconds: 24, at: 0, period: state.periods.number };
  const left = Math.max(0, current.seconds * 1000 - (elapsed - current.at));
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{t('basketball.shotClock')}</span>
      <span
        className={cn('flex-1 text-2xl font-bold tabular-nums', left === 0 && 'text-destructive')}
      >
        {Math.ceil(left / 1000)}
      </span>
      {[24, 14].map((seconds) => (
        <Button
          key={seconds}
          size="sm"
          variant="outline"
          onClick={() => setReset({ seconds, at: elapsed, period: state.periods.number })}
        >
          {seconds}
        </Button>
      ))}
    </div>
  );
}

type Panel =
  | null
  | { kind: 'score'; side: SideIndex; points: 1 | 2 | 3 }
  | { kind: 'miss' }
  | { kind: 'foul' }
  | { kind: 'play' };

interface PanelProps {
  state: BasketballState;
  sides: SideView[];
  busy: boolean;
  onDone: () => void;
  onCommand: ControlsProps['onCommand'];
}

/** Players of a side still in the game. */
const available = (state: BasketballState, side: SideIndex) =>
  state.players[side].filter((id) => !state.disqualified.includes(id));

function PlayerSelect({
  id,
  label,
  value,
  onChange,
  options,
  sides,
  emptyLabel,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
  options: string[];
  sides: SideView[];
  emptyLabel?: string;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <select
        id={id}
        className={selectClass}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {emptyLabel !== undefined && <option value="">{emptyLabel}</option>}
        {options.map((p) => (
          <option key={p} value={p}>
            {nameOf(sides, p)}
          </option>
        ))}
      </select>
    </div>
  );
}

function ScorePanel({
  state,
  sides,
  busy,
  onDone,
  onCommand,
  side,
  points,
}: PanelProps & { side: SideIndex; points: 1 | 2 | 3 }) {
  const { t } = useTranslation();
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">
        {t('basketball.pointsFor', { name: sideName(sides, side), points })}
      </h2>
      <PlayerSelect
        id="bb-scorer"
        label={t('basketball.scorer')}
        value={scorer}
        onChange={setScorer}
        options={available(state, side)}
        sides={sides}
        emptyLabel={t('football.notRecorded')}
      />
      {points > 1 && (
        <PlayerSelect
          id="bb-assist"
          label={t('football.assist')}
          value={assist}
          onChange={setAssist}
          options={available(state, side).filter((p) => p !== scorer)}
          sides={sides}
          emptyLabel={t('football.noAssist')}
        />
      )}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            onDone();
            void onCommand({
              type: 'score',
              side,
              points,
              ...(scorer ? { playerId: scorer } : {}),
              ...(assist && points > 1 ? { assistId: assist } : {}),
            });
          }}
        >
          {t('basketball.record')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

/** Team, then player, then one of `choices`: used for misses, fouls and other plays. */
function PickPanel({
  state,
  sides,
  busy,
  onDone,
  title,
  playerRequired,
  choices,
  onPick,
}: PanelProps & {
  title: string;
  playerRequired: boolean;
  choices: { value: string; label: string }[];
  onPick: (side: SideIndex, playerId: string, choice: string) => void;
}) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [player, setPlayer] = useState('');
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{title}</h2>
      <ChoiceGroup
        label={t('volleyball.team')}
        value={String(side)}
        onChange={(v) => {
          setSide(Number(v) as SideIndex);
          setPlayer('');
        }}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <PlayerSelect
        id="bb-player"
        label={t('football.player')}
        value={player}
        onChange={setPlayer}
        options={available(state, side)}
        sides={sides}
        emptyLabel={playerRequired ? t('basketball.choosePlayer') : t('football.notRecorded')}
      />
      <div className="flex flex-wrap gap-2">
        {choices.map((c) => (
          <Button
            key={c.value}
            variant="secondary"
            disabled={busy || (playerRequired && !player)}
            onClick={() => {
              onDone();
              onPick(side, player, c.value);
            }}
          >
            {c.label}
          </Button>
        ))}
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy, sides } = props;
  const state = props.projection.state as BasketballState;
  const [panel, setPanel] = useState<Panel>(null);
  const [detailed, setDetailed] = useState(false);
  const close = () => setPanel(null);
  if (state.phase === 'complete') return null;
  const shared = { state, sides, busy, onDone: close, onCommand };
  const withPlayer = (playerId: string) => (playerId ? { playerId } : {});
  if (panel?.kind === 'score')
    return <ScorePanel {...shared} side={panel.side} points={panel.points} />;
  if (panel?.kind === 'miss') {
    return (
      <PickPanel
        {...shared}
        title={t('basketball.miss')}
        playerRequired={false}
        choices={[1, 2, 3].map((p) => ({ value: String(p), label: t(`basketball.missed.${p}`) }))}
        onPick={(side, playerId, points) =>
          void onCommand({ type: 'miss', side, points: Number(points), ...withPlayer(playerId) })
        }
      />
    );
  }
  if (panel?.kind === 'foul') {
    return (
      <PickPanel
        {...shared}
        title={t('basketball.foul')}
        playerRequired={false}
        choices={FOUL_KINDS.map((k) => ({ value: k, label: t(`basketball.foulKind.${k}`) }))}
        onPick={(side, playerId, kind) =>
          void onCommand({ type: 'foul', side, kind, ...withPlayer(playerId) })
        }
      />
    );
  }
  if (panel?.kind === 'play') {
    return (
      <PickPanel
        {...shared}
        title={t('basketball.stats')}
        playerRequired
        choices={PLAY_KINDS.map((k) => ({ value: k, label: t(`basketball.play.${k}`) }))}
        onPick={(side, playerId, kind) => void onCommand({ type: 'play', side, kind, playerId })}
      />
    );
  }
  const { periods } = state.config;
  const timeoutButtons = ([0, 1] as const).map((side) => (
    <Button
      key={`to${side}`}
      size="sm"
      variant="ghost"
      disabled={busy || timeoutsLeft(state, side) === 0}
      onClick={() => void onCommand({ type: 'timeout', side })}
    >
      {t('volleyball.timeoutFor', { name: sideName(sides, side) })}
    </Button>
  ));
  if (state.phase !== 'playing') {
    return (
      <div className="space-y-3">
        <Button
          size="lg"
          className="h-16 w-full"
          disabled={busy}
          onClick={() => void onCommand({ type: 'start_period' })}
        >
          {state.phase === 'pre_match'
            ? t('basketball.tipOff')
            : t('football.start', { period: periodName(periods, state.periods.number + 1) })}
        </Button>
        {state.phase === 'break' && <div className="flex flex-wrap gap-2">{timeoutButtons}</div>}
      </div>
    );
  }
  const running = periodClockRunning(state.periods);
  const score = (side: SideIndex, points: 1 | 2 | 3) =>
    detailed
      ? setPanel({ kind: 'score', side, points })
      : void onCommand({ type: 'score', side, points });
  return (
    <div className="space-y-3">
      <Button
        size="lg"
        variant={running ? 'outline' : 'default'}
        className="h-14 w-full"
        disabled={busy}
        onClick={() => void onCommand({ type: running ? 'stop_clock' : 'start_clock' })}
      >
        {running ? t('hockey.stopClock') : t('basketball.startClock')}
      </Button>
      <ShotClock state={state} />
      {([0, 1] as const).map((side) => (
        <div key={side} className="space-y-1">
          <p className="text-sm font-medium">{sideName(sides, side)}</p>
          <div className="grid grid-cols-3 gap-2">
            {([1, 2, 3] as const).map((points) => (
              <Button
                key={points}
                size="lg"
                variant={side === 0 ? 'default' : 'secondary'}
                className="h-14 text-lg"
                disabled={busy}
                aria-label={t('basketball.pointsFor', { name: sideName(sides, side), points })}
                onClick={() => score(side, points)}
              >
                +{points}
              </Button>
            ))}
          </div>
        </div>
      ))}
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="bb-detailed" className="font-normal">
          {t('basketball.recordPlayers')}
        </Label>
        <Switch id="bb-detailed" checked={detailed} onCheckedChange={setDetailed} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'foul' })}
        >
          {t('basketball.foul')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'miss' })}
        >
          {t('basketball.miss')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'play' })}
        >
          {t('basketball.stats')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCommand({ type: 'end_period' })}
        >
          {t('football.end', { period: periodName(periods, state.periods.number) })}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">{timeoutButtons}</div>
    </div>
  );
}

const BOX = ['points', 'rebounds', 'assists', 'steals', 'blocks', 'turnovers', 'fouls'] as const;

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as BasketballState;
  const stats = basketballEngine.stats(state);
  const value = (id: string, metric: string) =>
    stats.find((s) => s.participantId === id && s.metric === metric)?.value ?? 0;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{basketballEngine.result(state).summary}</p>
      {state.periodScores.length > 0 && (
        <table className="w-full tabular-nums">
          <caption className="mb-1 text-left font-medium">{t('basketball.byPeriod')}</caption>
          <tbody>
            {([0, 1] as const).map((side) => (
              <tr key={side} className="border-t">
                <th className="py-1 text-left font-normal">{sideName(sides, side)}</th>
                {state.periodScores.map((p, i) => (
                  <td key={i} className="py-1 text-right">
                    {p[side]}
                  </td>
                ))}
                <td className="py-1 text-right font-semibold">{state.score[side]}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {([0, 1] as const).map((side) => (
        <table key={side} className="w-full tabular-nums">
          <caption className="mb-1 text-left font-medium">{sideName(sides, side)}</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-normal">{t('volleyball.player')}</th>
              {BOX.map((m) => (
                <th key={m} className="text-right font-normal">
                  {t(`basketball.box.${m}`)}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {state.players[side].map((id) => (
              <tr key={id} className="border-t">
                <td className="py-1">
                  {nameOf(sides, id)}
                  {state.disqualified.includes(id) && (
                    <span className="ml-1 text-destructive">✕</span>
                  )}
                </td>
                {BOX.map((m) => (
                  <td key={m} className="py-1 text-right">
                    {value(id, m)}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      ))}
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return tr('matches.unknownEvent');
  const fact = (type: string) => entry.facts.find((f) => f.type === type)?.data;
  const name = sideName(sides, cmd.side as number);
  const player = cmd.playerId ? ` – ${nameOf(sides, cmd.playerId as string)}` : '';
  switch (cmd.type) {
    case 'start_period':
    case 'end_period': {
      const data = fact(cmd.type === 'start_period' ? 'period_started' : 'period_ended');
      if (!data)
        return tr(
          `football.timeline.${cmd.type === 'start_period' ? 'periodStarted' : 'periodEnded'}`,
        );
      const period = periodName(data.periods as number, data.period as number);
      return cmd.type === 'start_period'
        ? tr('football.timeline.started', { period })
        : tr('football.status.break', { period });
    }
    case 'start_clock':
      return tr('basketball.timeline.clockStarted');
    case 'stop_clock':
      return tr('basketball.timeline.clockStopped');
    case 'score': {
      const assist = cmd.assistId
        ? ` (${tr('football.assistBy', { name: nameOf(sides, cmd.assistId as string) })})`
        : '';
      return `${tr('basketball.timeline.score', { name, points: cmd.points as number })}${player}${assist}`;
    }
    case 'miss':
      return `${tr(`basketball.missed.${cmd.points as number}`)} – ${name}${player}`;
    case 'foul':
      return `${tr(`basketball.foulKind.${cmd.kind as string}`)} – ${name}${player}`;
    case 'timeout':
      return tr('volleyball.timeline.timeout', { name });
    case 'play':
      return `${tr(`basketball.play.${cmd.kind as string}`)}${player}`;
    case 'final_whistle':
      return tr('football.timeline.finalWhistle');
    case 'concede':
      return tr(`cricket.text.concede.${cmd.reason === 'walkover' ? 'walkover' : 'forfeit'}`, {
        name,
      });
    default:
      return cmd.type;
  }
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    const name = sideName(sides, f.data?.side as number);
    switch (f.type) {
      case 'player_out':
        return [tr('basketball.announce.playerOut', { name })];
      case 'team_penalty':
        return [tr('basketball.announce.penalty', { name })];
      case 'overtime_needed':
        return [tr('basketball.announce.overtime')];
      case 'match_won':
        return [tr('badminton.announce.matchWon', { name })];
      default:
        return [];
    }
  });
}

export const basketballUi: SportUi = {
  sport: 'basketball',
  Setup,
  defaultSetup: () => {
    const preset = basketballPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: () => ({ min: 1, max: 20, initial: 1 }),
  namedSides: true,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['forfeit', 'walkover'],
};
