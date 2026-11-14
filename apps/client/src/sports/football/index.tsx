import type { SideIndex } from '@scoresphere/contracts';
import { formatClock, periodElapsed } from '@scoresphere/engine-kit';
import {
  footballEngine,
  footballPresets,
  type FootballSettings,
  type FootballState,
  GOAL_KINDS,
  type GoalKind,
  nextKicker,
  periodInfo,
  shootoutScore,
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
const minuteText = (minute: number, added: number) =>
  added ? `${minute}+${added}′` : `${minute}′`;
const selectClass = 'h-10 w-full rounded-md border border-input bg-background px-2 text-sm';

/** "First half", "Period 3", "Extra time, second half"… for period `n`. */
function periodLabel(regular: number, extraPeriods: number, n: number): string {
  if (n > regular) {
    return extraPeriods === 2
      ? tr(`football.period.extraHalf${n - regular}`)
      : tr('football.period.extra');
  }
  if (regular === 2) return tr(`football.period.half${n}`);
  if (regular === 1) return tr('football.period.match');
  return tr('football.period.numbered', { n });
}

const periodName = (config: FootballSettings, n: number) =>
  periodLabel(config.periods, config.extraTime?.periods ?? 0, n);

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? footballPresets[0]!.key;
  const config = (value?.config ?? footballPresets[0]!.config) as FootballSettings;
  const preset = footballPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<FootballSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const number = (
    id: string,
    label: string,
    current: number | null,
    apply: (n: number | null) => void,
    allowEmpty = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={current ?? ''}
        onChange={(e) => {
          if (allowEmpty && e.target.value === '') return apply(null);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0) apply(n);
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
          const p = footballPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={footballPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {number('fb-players', t('football.setup.playersOnField'), config.playersOnField, (n) =>
          set({ playersOnField: n ?? 11 }),
        )}
        {number('fb-periods', t('football.setup.periods'), config.periods, (n) =>
          set({ periods: n ?? 2 }),
        )}
        {number('fb-minutes', t('football.setup.periodMinutes'), config.periodMinutes, (n) =>
          set({ periodMinutes: n ?? 45 }),
        )}
        {number(
          'fb-subs',
          t('football.setup.maxSubstitutions'),
          config.maxSubstitutions,
          (n) => set({ maxSubstitutions: n }),
          true,
        )}
      </fieldset>
      <div className="space-y-3">
        {(
          [
            [
              'fb-rolling',
              'rollingSubstitutions',
              config.rollingSubstitutions,
              (on: boolean) => set({ rollingSubstitutions: on }),
            ],
            [
              'fb-et',
              'extraTime',
              config.extraTime !== null,
              (on: boolean) => set({ extraTime: on ? { periods: 2, periodMinutes: 15 } : null }),
            ],
            [
              'fb-pens',
              'shootout',
              config.shootout !== null,
              (on: boolean) => set({ shootout: on ? { kicks: 5 } : null }),
            ],
          ] as const
        ).map(([id, key, checked, toggle]) => (
          <div key={id} className="flex items-center justify-between gap-3">
            <Label htmlFor={id} className="font-normal">
              {t(`football.setup.${key}`)}
            </Label>
            <Switch id={id} checked={checked} onCheckedChange={toggle} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** The match clock: minutes played so far, with added time beyond the period's length. */
function clockText(state: FootballState, now: number): string {
  const n = Math.max(1, state.periods.number);
  const info = periodInfo(state.config, n);
  const elapsed = periodElapsed(state.periods, now);
  const length = info.lengthMinutes * 60_000;
  const start = info.startMinute * 60_000;
  if (elapsed <= length) return formatClock(start + elapsed);
  return `${formatClock(start + length)} +${formatClock(elapsed - length)}`;
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as FootballState;
  const now = useNow(500) + clockOffsetMs;
  const pens = shootoutScore(state);
  const status =
    state.phase === 'pre_match'
      ? t('football.status.preMatch')
      : state.phase === 'playing'
        ? `${periodName(state.config, state.periods.number)} · ${clockText(state, now)}`
        : state.phase === 'break'
          ? t('football.status.break', { period: periodName(state.config, state.periods.number) })
          : state.phase === 'shootout'
            ? t('football.status.shootout')
            : t('football.status.fullTime');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => {
          const reds = state.sentOff.filter((id) => state.players[side].includes(id)).length;
          return (
            <div
              key={side}
              className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
            >
              <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
              {reds > 0 && (
                <span className="flex gap-0.5" aria-label={t('football.redCards', { count: reds })}>
                  {Array.from({ length: reds }, (_, i) => (
                    <span key={i} className="h-3.5 w-2.5 rounded-sm bg-destructive" />
                  ))}
                </span>
              )}
              {state.shootout && (
                <span
                  className="text-sm text-muted-foreground tabular-nums"
                  aria-label={t('football.pens')}
                >
                  ({pens.goals[side]})
                </span>
              )}
              <span
                className="w-14 text-right text-4xl font-bold tabular-nums"
                data-testid={`goals-${side}`}
              >
                {state.score[side]}
              </span>
            </div>
          );
        })}
      </div>
      <p
        className="text-sm text-muted-foreground tabular-nums"
        role="status"
        data-testid="football-status"
      >
        {status}
      </p>
    </section>
  );
}

function LineupPicker({
  label,
  squad,
  value,
  onChange,
  size,
  sides,
}: {
  label: string;
  squad: string[];
  value: string[];
  onChange: (ids: string[]) => void;
  size: number;
  sides: SideView[];
}) {
  const { t } = useTranslation();
  return (
    <fieldset className="space-y-2">
      <legend className="text-sm font-medium">{label}</legend>
      <p className="text-xs text-muted-foreground">{t('football.lineupHint', { size })}</p>
      <div className="grid grid-cols-2 gap-2">
        {squad.map((id) => {
          const picked = value.includes(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={picked}
              onClick={() =>
                onChange(
                  picked
                    ? value.filter((x) => x !== id)
                    : value.length < size
                      ? [...value, id]
                      : value,
                )
              }
              className={cn(
                'min-h-11 rounded-lg border px-3 text-left text-sm',
                picked && 'border-primary bg-primary/10 font-semibold',
              )}
            >
              {nameOf(sides, id)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function Kickoff({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as FootballState;
  const n = state.config.playersOnField;
  const [lineups, setLineups] = useState<[string[], string[]]>([
    state.players[0].slice(0, n),
    state.players[1].slice(0, n),
  ]);
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">{t('football.startingPlayers')}</h2>
      {([0, 1] as const).map((side) => (
        <LineupPicker
          key={side}
          label={sideName(sides, side)}
          squad={state.players[side]}
          value={lineups[side]}
          size={n}
          sides={sides}
          onChange={(ids) => setLineups((l) => (side === 0 ? [ids, l[1]] : [l[0], ids]))}
        />
      ))}
      <Button
        className="w-full"
        size="lg"
        disabled={busy || lineups.some((l) => l.length === 0)}
        onClick={() => void onCommand({ type: 'start_period', lineups })}
      >
        {t('football.kickOff')}
      </Button>
    </div>
  );
}

type Panel = null | { kind: 'goal'; side: SideIndex } | { kind: 'card' } | { kind: 'sub' };

function GoalPanel({
  state,
  side,
  sides,
  busy,
  onDone,
  onCommand,
}: {
  state: FootballState;
  side: SideIndex;
  sides: SideView[];
  busy: boolean;
  onDone: () => void;
  onCommand: ControlsProps['onCommand'];
}) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<GoalKind>('regular');
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  const scorerSide = kind === 'own_goal' ? (side === 0 ? 1 : 0) : side;
  const team = state.onField[side];
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('football.goalFor', { name: sideName(sides, side) })}</h2>
      <ChoiceGroup
        label={t('football.goalKind')}
        value={kind}
        onChange={(k) => {
          setKind(k);
          setScorer('');
          setAssist('');
        }}
        choices={GOAL_KINDS.map((k) => ({ value: k, label: t(`football.kind.${k}`) }))}
      />
      <div className="space-y-1">
        <Label htmlFor="fb-scorer">
          {kind === 'own_goal' ? t('football.ownGoalBy') : t('football.scorer')}
        </Label>
        <select
          id="fb-scorer"
          className={selectClass}
          value={scorer}
          onChange={(e) => setScorer(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {state.onField[scorerSide].map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      {kind !== 'own_goal' && (
        <div className="space-y-1">
          <Label htmlFor="fb-assist">{t('football.assist')}</Label>
          <select
            id="fb-assist"
            className={selectClass}
            value={assist}
            onChange={(e) => setAssist(e.target.value)}
          >
            <option value="">{t('football.noAssist')}</option>
            {team
              .filter((id) => id !== scorer)
              .map((id) => (
                <option key={id} value={id}>
                  {nameOf(sides, id)}
                </option>
              ))}
          </select>
        </div>
      )}
      <div className="flex gap-2">
        <Button
          disabled={busy}
          onClick={() => {
            onDone();
            void onCommand({
              type: 'goal',
              side,
              kind,
              ...(scorer ? { scorerId: scorer } : {}),
              ...(assist && kind !== 'own_goal' ? { assistId: assist } : {}),
            });
          }}
        >
          {t('football.recordGoal')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function CardPanel({
  state,
  sides,
  busy,
  onDone,
  onCommand,
}: Omit<Parameters<typeof GoalPanel>[0], 'side'>) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [player, setPlayer] = useState<string | null>(null);
  const eligible = state.players[side].filter((id) => !state.sentOff.includes(id));
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('football.card')}</h2>
      <ChoiceGroup
        label={t('volleyball.team')}
        value={String(side)}
        onChange={(v) => {
          setSide(Number(v) as SideIndex);
          setPlayer(null);
        }}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <ChoiceGroup
        label={t('football.player')}
        value={player}
        onChange={setPlayer}
        choices={eligible.map((id) => ({
          value: id,
          label: nameOf(sides, id),
          hint: state.yellowCards[id] ? t('football.booked') : undefined,
        }))}
      />
      <div className="flex flex-wrap gap-2">
        {(['yellow', 'red'] as const).map((color) => (
          <Button
            key={color}
            variant={color === 'red' ? 'destructive' : 'secondary'}
            disabled={!player || busy}
            onClick={() => {
              onDone();
              void onCommand({ type: 'card', side, playerId: player, color });
            }}
          >
            {t(`football.cardColor.${color}`)}
          </Button>
        ))}
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function SubPanel({
  state,
  sides,
  busy,
  onDone,
  onCommand,
}: Omit<Parameters<typeof GoalPanel>[0], 'side'>) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [out, setOut] = useState<string | null>(null);
  const [inId, setIn] = useState<string | null>(null);
  const { config } = state;
  const bench = state.players[side].filter(
    (id) =>
      !state.onField[side].includes(id) &&
      !state.sentOff.includes(id) &&
      (config.rollingSubstitutions || !state.substitutedOff.includes(id)),
  );
  const limitReached =
    !config.rollingSubstitutions &&
    config.maxSubstitutions !== null &&
    state.substitutionsUsed[side] >= config.maxSubstitutions;
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('volleyball.substitution')}</h2>
      <ChoiceGroup
        label={t('volleyball.team')}
        value={String(side)}
        onChange={(v) => {
          setSide(Number(v) as SideIndex);
          setOut(null);
          setIn(null);
        }}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      {limitReached ? (
        <p className="text-sm text-muted-foreground">
          {t('football.subLimit', { count: config.maxSubstitutions ?? 0 })}
        </p>
      ) : (
        <>
          <ChoiceGroup
            label={t('volleyball.playerOut')}
            value={out}
            onChange={setOut}
            choices={state.onField[side].map((id) => ({ value: id, label: nameOf(sides, id) }))}
          />
          <ChoiceGroup
            label={t('volleyball.playerIn')}
            value={inId}
            onChange={setIn}
            choices={bench.map((id) => ({ value: id, label: nameOf(sides, id) }))}
          />
        </>
      )}
      <div className="flex gap-2">
        <Button
          disabled={!out || !inId || busy || limitReached}
          onClick={() => {
            onDone();
            void onCommand({ type: 'substitute', side, outId: out, inId });
          }}
        >
          {t('volleyball.confirmSub')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function Shootout({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as FootballState;
  const [first, setFirst] = useState<string | null>(null);
  const [kicker, setKicker] = useState('');
  if (!state.shootout) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t('football.status.shootout')}</h2>
        <ChoiceGroup
          label={t('football.kicksFirst')}
          value={first}
          onChange={setFirst}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <Button
          className="w-full"
          disabled={first === null || busy}
          onClick={() => void onCommand({ type: 'start_shootout', firstSide: Number(first) })}
        >
          {t('football.startShootout')}
        </Button>
      </div>
    );
  }
  const side = nextKicker(state)!;
  const kick = (scored: boolean) => {
    setKicker('');
    void onCommand({
      type: 'shootout_kick',
      side,
      scored,
      ...(kicker ? { kickerId: kicker } : {}),
    });
  };
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('football.toKick', { name: sideName(sides, side) })}</h2>
      <div className="space-y-1">
        <Label htmlFor="fb-kicker">{t('football.kicker')}</Label>
        <select
          id="fb-kicker"
          className={selectClass}
          value={kicker}
          onChange={(e) => setKicker(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {state.players[side]
            .filter((id) => !state.sentOff.includes(id))
            .map((id) => (
              <option key={id} value={id}>
                {nameOf(sides, id)}
              </option>
            ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" className="h-16" disabled={busy} onClick={() => kick(true)}>
          {t('football.scored')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-16"
          disabled={busy}
          onClick={() => kick(false)}
        >
          {t('football.missed')}
        </Button>
      </div>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy, sides } = props;
  const state = props.projection.state as FootballState;
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);
  if (state.phase === 'pre_match') return <Kickoff {...props} />;
  if (state.phase === 'shootout') return <Shootout {...props} />;
  if (state.phase === 'complete') return null;
  const shared = { state, sides, busy, onDone: close, onCommand };
  if (panel?.kind === 'goal') return <GoalPanel {...shared} side={panel.side} />;
  if (panel?.kind === 'card') return <CardPanel {...shared} />;
  if (panel?.kind === 'sub') return <SubPanel {...shared} />;
  const playing = state.phase === 'playing';
  return (
    <div className="space-y-3">
      {playing ? (
        <div className="grid grid-cols-2 gap-3">
          {([0, 1] as const).map((side) => (
            <Button
              key={side}
              size="lg"
              variant={side === 0 ? 'default' : 'secondary'}
              className="h-24 whitespace-normal text-lg"
              disabled={busy}
              onClick={() => setPanel({ kind: 'goal', side })}
            >
              {t('football.goalFor', { name: sideName(sides, side) })}
            </Button>
          ))}
        </div>
      ) : (
        <Button
          size="lg"
          className="h-16 w-full"
          disabled={busy}
          onClick={() => void onCommand({ type: 'start_period' })}
        >
          {t('football.start', { period: periodName(state.config, state.periods.number + 1) })}
        </Button>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'card' })}
        >
          {t('football.card')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'sub' })}
        >
          {t('volleyball.substitution')}
        </Button>
        {playing && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onCommand({ type: 'end_period' })}
          >
            {t('football.end', { period: periodName(state.config, state.periods.number) })}
          </Button>
        )}
      </div>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as FootballState;
  const goalText = (g: FootballState['goals'][number]) => {
    const kind = g.kind === 'regular' ? '' : ` (${t(`football.kind.${g.kind}`)})`;
    const assist = g.assistId
      ? ` · ${t('football.assistBy', { name: nameOf(sides, g.assistId) })}`
      : '';
    return `${minuteText(g.minute, g.added)} ${nameOf(sides, g.scorerId)}${kind}${assist}`;
  };
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{footballEngine.result(state).summary}</p>
      <div className="grid grid-cols-2 gap-4">
        {([0, 1] as const).map((side) => (
          <div key={side} className="space-y-1">
            <p className="font-medium">{sideName(sides, side)}</p>
            <ul
              className="space-y-0.5"
              aria-label={t('football.goalsFor', { name: sideName(sides, side) })}
            >
              {state.goals
                .filter((g) => g.side === side)
                .map((g, i) => (
                  <li key={i} className="tabular-nums">
                    ⚽ {goalText(g)}
                  </li>
                ))}
            </ul>
            <ul className="space-y-0.5 text-muted-foreground">
              {state.cards
                .filter((c) => c.side === side)
                .map((c, i) => (
                  <li key={i}>
                    <span
                      className={cn(
                        'mr-1 inline-block h-3 w-2 rounded-sm align-middle',
                        c.color === 'red' || c.secondYellow ? 'bg-destructive' : 'bg-yellow-400',
                      )}
                    />
                    {c.period > 0 ? `${minuteText(c.minute, c.added)} ` : ''}
                    {nameOf(sides, c.playerId)}
                  </li>
                ))}
              {state.substitutions
                .filter((s) => s.side === side)
                .map((s, i) => (
                  <li key={`s${i}`}>
                    ⇄ {s.minute !== null ? `${minuteText(s.minute, s.added)} ` : ''}
                    {t('volleyball.timeline.sub', {
                      in: nameOf(sides, s.inId),
                      out: nameOf(sides, s.outId),
                    })}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      {state.shootout && state.shootout.kicks.length > 0 && (
        <div>
          <p className="font-medium">{t('football.pens')}</p>
          {([0, 1] as const).map((side) => (
            <p key={side} className="tabular-nums">
              {sideName(sides, side)}:{' '}
              {state
                .shootout!.kicks.filter((k) => k.side === side)
                .map((k) => (k.scored ? '●' : '○'))
                .join(' ')}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return tr('matches.unknownEvent');
  const fact = (type: string) => entry.facts.find((f) => f.type === type)?.data;
  switch (cmd.type) {
    case 'start_period':
    case 'end_period': {
      const data = fact(cmd.type === 'start_period' ? 'period_started' : 'period_ended');
      if (cmd.lineups) return tr('football.kickOff');
      // An undone event has no facts, so its period isn't known.
      if (!data)
        return tr(
          `football.timeline.${cmd.type === 'start_period' ? 'periodStarted' : 'periodEnded'}`,
        );
      const period = periodLabel(
        data.regularPeriods as number,
        data.extraPeriods as number,
        data.period as number,
      );
      return cmd.type === 'start_period'
        ? tr('football.timeline.started', { period })
        : tr('football.status.break', { period });
    }
    case 'goal': {
      const data = fact('goal');
      const minute = data ? ` ${data.minute as number}′` : '';
      const name = sideName(sides, cmd.side as number);
      if (cmd.kind === 'own_goal') {
        return tr('football.timeline.ownGoal', {
          name,
          player: nameOf(sides, cmd.scorerId as string),
          minute,
        });
      }
      const scorer = cmd.scorerId ? ` – ${nameOf(sides, cmd.scorerId as string)}` : '';
      const pen = cmd.kind === 'penalty' ? ` (${tr('football.kind.penalty')})` : '';
      return `${tr('football.timeline.goal', { name })}${scorer}${pen}${minute}`;
    }
    case 'card': {
      const second = fact('card')?.secondYellow === true;
      return tr(
        second ? 'football.timeline.secondYellow' : `football.timeline.${cmd.color as string}`,
        {
          name: nameOf(sides, cmd.playerId as string),
        },
      );
    }
    case 'substitute':
      return tr('volleyball.timeline.sub', {
        in: nameOf(sides, cmd.inId as string),
        out: nameOf(sides, cmd.outId as string),
      });
    case 'start_shootout':
      return tr('football.timeline.shootout', { name: sideName(sides, cmd.firstSide as number) });
    case 'shootout_kick':
      return tr(cmd.scored ? 'football.timeline.penScored' : 'football.timeline.penMissed', {
        name: sideName(sides, cmd.side as number),
      });
    case 'final_whistle':
      return tr('football.timeline.finalWhistle');
    case 'concede':
      return tr(`cricket.text.concede.${cmd.reason === 'walkover' ? 'walkover' : 'forfeit'}`, {
        name: sideName(sides, cmd.side as number),
      });
    default:
      return cmd.type;
  }
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    const name = sideName(sides, f.data?.side as number);
    switch (f.type) {
      case 'goal':
        return [tr('football.announce.goal', { name })];
      case 'sent_off':
        return [tr('football.announce.sentOff', { name })];
      case 'extra_time_needed':
        return [tr('football.announce.extraTime')];
      case 'shootout_needed':
        return [tr('football.announce.shootout')];
      case 'match_won':
        return [tr('badminton.announce.matchWon', { name })];
      case 'match_drawn':
        return [tr('football.announce.draw')];
      default:
        return [];
    }
  });
}

export const footballUi: SportUi = {
  sport: 'football',
  Setup,
  defaultSetup: () => {
    const preset = footballPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: () => ({ min: 1, max: 30, initial: 1 }),
  namedSides: true,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['forfeit', 'walkover'],
};
