import type { SideIndex } from '@scoresphere/contracts';
import { formatClock, periodClockRunning, periodElapsed } from '@scoresphere/engine-kit';
import {
  HOCKEY_CARDS,
  hockeyEngine,
  hockeyNextShooter,
  hockeyPresets,
  type HockeySettings,
  hockeyShootoutScore,
  type HockeyState,
  hockeySuspensions,
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

/** "Quarter 2", "First half"… for period `n` of `periods`. */
function periodName(periods: number, n: number): string {
  if (periods === 4) return tr('hockey.quarter', { n });
  if (periods === 2) return tr(`football.period.half${n}`);
  if (periods === 1) return tr('football.period.match');
  return tr('football.period.numbered', { n });
}

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? hockeyPresets[0]!.key;
  const config = (value?.config ?? hockeyPresets[0]!.config) as HockeySettings;
  const preset = hockeyPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<HockeySettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (id: string, key: keyof HockeySettings) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`hockey.setup.${key}`)}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={config[key] as number}
        onChange={(e) => {
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
          const p = hockeyPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={hockeyPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('hk-players', 'playersOnField')}
        {field('hk-periods', 'periods')}
        {field('hk-minutes', 'periodMinutes')}
        {field('hk-green', 'greenCardMinutes')}
        {field('hk-yellow', 'yellowCardMinutes')}
      </fieldset>
      <div className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="hk-stop" className="font-normal">
            {t('hockey.setup.stopClock')}
          </Label>
          <Switch
            id="hk-stop"
            checked={config.stopClock}
            onCheckedChange={(on) => set({ stopClock: on })}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label htmlFor="hk-so" className="font-normal">
            {t('hockey.setup.shootout')}
          </Label>
          <Switch
            id="hk-so"
            checked={config.shootout !== null}
            onCheckedChange={(on) => set({ shootout: on ? { attempts: 5 } : null })}
          />
        </div>
      </div>
    </div>
  );
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as HockeyState;
  const now = useNow(500) + clockOffsetMs;
  const { periods, periodMinutes } = state.config;
  const remaining = periodMinutes * 60_000 - periodElapsed(state.periods, now);
  const so = hockeyShootoutScore(state);
  const suspensions = hockeySuspensions(state, now);
  const status =
    state.phase === 'pre_match'
      ? t('football.status.preMatch')
      : state.phase === 'playing'
        ? `${periodName(periods, state.periods.number)} · ${formatClock(Math.max(0, remaining))}${
            periodClockRunning(state.periods) ? '' : ` · ${t('hockey.clockStopped')}`
          }`
        : state.phase === 'break'
          ? t('football.status.break', { period: periodName(periods, state.periods.number) })
          : state.phase === 'shootout'
            ? t('hockey.shootout')
            : t('football.status.fullTime');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            <span
              className="text-xs text-muted-foreground"
              aria-label={t('hockey.cornersFor', { count: state.penaltyCorners[side] })}
            >
              {t('hockey.pcShort', { count: state.penaltyCorners[side] })}
            </span>
            {state.shootout && (
              <span className="text-sm text-muted-foreground tabular-nums">({so.goals[side]})</span>
            )}
            <span
              className="w-14 text-right text-4xl font-bold tabular-nums"
              data-testid={`goals-${side}`}
            >
              {state.score[side]}
            </span>
          </div>
        ))}
      </div>
      <p
        className="text-sm text-muted-foreground tabular-nums"
        role="status"
        data-testid="hockey-status"
      >
        {status}
      </p>
      {suspensions.length > 0 && (
        <ul className="space-y-1 text-sm" aria-label={t('hockey.suspended')}>
          {suspensions.map((s, i) => (
            <li key={i} className="flex items-center gap-2 tabular-nums">
              <span
                className={cn(
                  'inline-block h-3.5 w-2.5 rounded-sm',
                  s.color === 'green' ? 'bg-green-600' : 'bg-yellow-400',
                )}
              />
              {nameOf(sides, s.playerId)} ({sideName(sides, s.side)}) · {formatClock(s.remainingMs)}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

type Panel = null | { kind: 'goal'; side: SideIndex } | { kind: 'stroke' } | { kind: 'card' };

interface PanelProps {
  state: HockeyState;
  sides: SideView[];
  busy: boolean;
  onDone: () => void;
  onCommand: ControlsProps['onCommand'];
}

/** Players of a side still in the match (red cards excluded). */
const available = (state: HockeyState, side: SideIndex) =>
  state.players[side].filter((id) => !state.excluded.includes(id));

function GoalPanel({
  state,
  sides,
  busy,
  onDone,
  onCommand,
  side,
}: PanelProps & { side: SideIndex }) {
  const { t } = useTranslation();
  const [kind, setKind] = useState<'field_goal' | 'penalty_corner'>('field_goal');
  const [scorer, setScorer] = useState('');
  const [assist, setAssist] = useState('');
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('football.goalFor', { name: sideName(sides, side) })}</h2>
      <ChoiceGroup
        label={t('football.goalKind')}
        value={kind}
        onChange={setKind}
        choices={(['field_goal', 'penalty_corner'] as const).map((k) => ({
          value: k,
          label: t(`hockey.kind.${k}`),
        }))}
      />
      <div className="space-y-1">
        <Label htmlFor="hk-scorer">{t('football.scorer')}</Label>
        <select
          id="hk-scorer"
          className={selectClass}
          value={scorer}
          onChange={(e) => setScorer(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {available(state, side).map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="space-y-1">
        <Label htmlFor="hk-assist">{t('football.assist')}</Label>
        <select
          id="hk-assist"
          className={selectClass}
          value={assist}
          onChange={(e) => setAssist(e.target.value)}
        >
          <option value="">{t('football.noAssist')}</option>
          {available(state, side)
            .filter((id) => id !== scorer)
            .map((id) => (
              <option key={id} value={id}>
                {nameOf(sides, id)}
              </option>
            ))}
        </select>
      </div>
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
              ...(assist ? { assistId: assist } : {}),
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

function StrokePanel({ state, sides, busy, onDone, onCommand }: PanelProps) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [taker, setTaker] = useState('');
  const record = (scored: boolean) => {
    onDone();
    void onCommand({ type: 'penalty_stroke', side, scored, ...(taker ? { takerId: taker } : {}) });
  };
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('hockey.stroke')}</h2>
      <ChoiceGroup
        label={t('hockey.strokeTo')}
        value={String(side)}
        onChange={(v) => {
          setSide(Number(v) as SideIndex);
          setTaker('');
        }}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <div className="space-y-1">
        <Label htmlFor="hk-taker">{t('hockey.taker')}</Label>
        <select
          id="hk-taker"
          className={selectClass}
          value={taker}
          onChange={(e) => setTaker(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {available(state, side).map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button disabled={busy} onClick={() => record(true)}>
          {t('football.scored')}
        </Button>
        <Button variant="secondary" disabled={busy} onClick={() => record(false)}>
          {t('football.missed')}
        </Button>
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function CardPanel({ state, sides, busy, onDone, onCommand }: PanelProps) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [player, setPlayer] = useState<string | null>(null);
  const [longer, setLonger] = useState(false);
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
        choices={available(state, side).map((id) => ({ value: id, label: nameOf(sides, id) }))}
      />
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="hk-longer" className="font-normal">
          {t('hockey.longerYellow')}
        </Label>
        <Switch id="hk-longer" checked={longer} onCheckedChange={setLonger} />
      </div>
      <div className="flex flex-wrap gap-2">
        {HOCKEY_CARDS.map((color) => (
          <Button
            key={color}
            variant={color === 'red' ? 'destructive' : 'secondary'}
            disabled={!player || busy}
            onClick={() => {
              onDone();
              void onCommand({
                type: 'card',
                side,
                playerId: player,
                color,
                ...(color === 'yellow' && longer ? { minutes: 10 } : {}),
              });
            }}
          >
            {t(`hockey.card.${color}`)}
          </Button>
        ))}
        <Button variant="ghost" onClick={onDone}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function Shootout({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as HockeyState;
  const [first, setFirst] = useState<string | null>(null);
  const [player, setPlayer] = useState('');
  if (!state.shootout) {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t('hockey.shootout')}</h2>
        <ChoiceGroup
          label={t('hockey.goesFirst')}
          value={first}
          onChange={setFirst}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <Button
          className="w-full"
          disabled={first === null || busy}
          onClick={() => void onCommand({ type: 'start_shootout', firstSide: Number(first) })}
        >
          {t('hockey.startShootout')}
        </Button>
      </div>
    );
  }
  const side = hockeyNextShooter(state)!;
  const attempt = (scored: boolean) => {
    setPlayer('');
    void onCommand({
      type: 'shootout_attempt',
      side,
      scored,
      ...(player ? { playerId: player } : {}),
    });
  };
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('hockey.toGo', { name: sideName(sides, side) })}</h2>
      <div className="space-y-1">
        <Label htmlFor="hk-so-player">{t('football.player')}</Label>
        <select
          id="hk-so-player"
          className={selectClass}
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {available(state, side).map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Button size="lg" className="h-16" disabled={busy} onClick={() => attempt(true)}>
          {t('football.scored')}
        </Button>
        <Button
          size="lg"
          variant="secondary"
          className="h-16"
          disabled={busy}
          onClick={() => attempt(false)}
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
  const state = props.projection.state as HockeyState;
  const [panel, setPanel] = useState<Panel>(null);
  const close = () => setPanel(null);
  if (state.phase === 'shootout') return <Shootout {...props} />;
  if (state.phase === 'complete') return null;
  const shared = { state, sides, busy, onDone: close, onCommand };
  if (panel?.kind === 'goal') return <GoalPanel {...shared} side={panel.side} />;
  if (panel?.kind === 'stroke') return <StrokePanel {...shared} />;
  if (panel?.kind === 'card') return <CardPanel {...shared} />;
  const { periods } = state.config;
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
            ? t('hockey.pushBack')
            : t('football.start', { period: periodName(periods, state.periods.number + 1) })}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'card' })}
        >
          {t('football.card')}
        </Button>
      </div>
    );
  }
  const running = periodClockRunning(state.periods);
  return (
    <div className="space-y-3">
      {!running && (
        <Button
          size="lg"
          className="h-14 w-full"
          disabled={busy}
          onClick={() => void onCommand({ type: 'restart_clock' })}
        >
          {t('hockey.restartClock')}
        </Button>
      )}
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
        {([0, 1] as const).map((side) => (
          <Button
            key={`pc${side}`}
            variant="outline"
            className="h-12 whitespace-normal"
            disabled={busy}
            onClick={() => void onCommand({ type: 'penalty_corner', side })}
          >
            {t('hockey.cornerTo', { name: sideName(sides, side) })}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'stroke' })}
        >
          {t('hockey.stroke')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => setPanel({ kind: 'card' })}
        >
          {t('football.card')}
        </Button>
        {running && (
          <Button
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onCommand({ type: 'stop_clock' })}
          >
            {t('hockey.stopClock')}
          </Button>
        )}
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCommand({ type: 'end_period' })}
        >
          {t('football.end', { period: periodName(periods, state.periods.number) })}
        </Button>
      </div>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as HockeyState;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{hockeyEngine.result(state).summary}</p>
      <div className="grid grid-cols-2 gap-4">
        {([0, 1] as const).map((side) => (
          <div key={side} className="space-y-1">
            <p className="font-medium">{sideName(sides, side)}</p>
            <p className="text-muted-foreground">
              {t('hockey.cornersFor', { count: state.penaltyCorners[side] })}
            </p>
            <ul className="space-y-0.5">
              {state.goals
                .filter((g) => g.side === side)
                .map((g, i) => (
                  <li key={i} className="tabular-nums">
                    {minuteText(g.minute, g.added)} {nameOf(sides, g.scorerId)}
                    {g.kind !== 'field_goal' && ` (${t(`hockey.kind.${g.kind}`)})`}
                    {g.assistId &&
                      ` · ${t('football.assistBy', { name: nameOf(sides, g.assistId) })}`}
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
                        c.color === 'green'
                          ? 'bg-green-600'
                          : c.color === 'yellow'
                            ? 'bg-yellow-400'
                            : 'bg-destructive',
                      )}
                    />
                    {c.period > 0 ? `${minuteText(c.minute, c.added)} ` : ''}
                    {nameOf(sides, c.playerId)}
                  </li>
                ))}
              {state.strokes
                .filter((s) => s.side === side && !s.scored)
                .map((s, i) => (
                  <li key={`s${i}`}>
                    {minuteText(s.minute, s.added)}{' '}
                    {t('hockey.strokeMissed', { name: nameOf(sides, s.takerId) })}
                  </li>
                ))}
            </ul>
          </div>
        ))}
      </div>
      {state.shootout && state.shootout.attempts.length > 0 && (
        <div>
          <p className="font-medium">{t('hockey.shootout')}</p>
          {([0, 1] as const).map((side) => (
            <p key={side} className="tabular-nums">
              {sideName(sides, side)}:{' '}
              {state
                .shootout!.attempts.filter((a) => a.side === side)
                .map((a) => (a.scored ? '●' : '○'))
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
  const name = sideName(sides, cmd.side as number);
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
    case 'stop_clock':
      return tr('hockey.stopClock');
    case 'restart_clock':
      return tr('hockey.restartClock');
    case 'goal': {
      const minute = fact('goal')?.minute;
      const scorer = cmd.scorerId ? ` – ${nameOf(sides, cmd.scorerId as string)}` : '';
      const kind = cmd.kind === 'penalty_corner' ? ` (${tr('hockey.kind.penalty_corner')})` : '';
      return `${tr('football.timeline.goal', { name })}${scorer}${kind}${minute ? ` ${minute as number}′` : ''}`;
    }
    case 'penalty_corner':
      return tr('hockey.cornerTo', { name });
    case 'penalty_stroke':
      return tr(cmd.scored ? 'hockey.timeline.strokeScored' : 'hockey.timeline.strokeMissed', {
        name,
      });
    case 'card':
      return tr(`hockey.timeline.${cmd.color as string}`, {
        name: nameOf(sides, cmd.playerId as string),
      });
    case 'start_shootout':
      return tr('hockey.timeline.shootout', { name: sideName(sides, cmd.firstSide as number) });
    case 'shootout_attempt':
      return tr(cmd.scored ? 'hockey.timeline.attemptScored' : 'hockey.timeline.attemptMissed', {
        name,
      });
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
      case 'goal':
        return [tr('football.announce.goal', { name })];
      case 'sent_off':
        return [tr('football.announce.sentOff', { name })];
      case 'shootout_needed':
        return [tr('hockey.announce.shootout')];
      case 'match_won':
        return [tr('badminton.announce.matchWon', { name })];
      case 'match_drawn':
        return [tr('football.announce.draw')];
      default:
        return [];
    }
  });
}

export const hockeyUi: SportUi = {
  sport: 'field-hockey',
  Setup,
  defaultSetup: () => {
    const preset = hockeyPresets[0]!;
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
