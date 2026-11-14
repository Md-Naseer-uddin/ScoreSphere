import { formatClock, periodClockRunning } from '@scoresphere/engine-kit';
import {
  batchView,
  khoKhoClockLeft,
  khoKhoEngine,
  khoKhoPresets,
  type KhoKhoSettings,
  type KhoKhoState,
  OUT_KINDS,
  type OutKind,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
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

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? khoKhoPresets[0]!.key;
  const config = (value?.config ?? khoKhoPresets[0]!.config) as KhoKhoSettings;
  const preset = khoKhoPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<KhoKhoSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (id: string, key: keyof KhoKhoSettings) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`khoKho.setup.${key}`)}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={config[key]}
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
          const p = khoKhoPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={khoKhoPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('kk-innings', 'innings')}
        {field('kk-minutes', 'turnMinutes')}
        {field('kk-batch', 'batchSize')}
        {field('kk-points', 'pointsPerOut')}
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as KhoKhoState;
  const now = useNow(500) + clockOffsetMs;
  const turn = state.periods.number;
  const batch = batchView(state);
  const status =
    state.phase === 'pre_match'
      ? t('football.status.preMatch')
      : state.phase === 'playing'
        ? `${t('khoKho.turnOf', { n: turn, name: sideName(sides, state.chasing!) })} · ${formatClock(khoKhoClockLeft(state, now))}${
            periodClockRunning(state.periods) ? '' : ` · ${t('hockey.clockStopped')}`
          }`
        : state.phase === 'break'
          ? t('khoKho.endOfTurn', { n: turn })
          : t('football.status.fullTime');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span className="min-w-0 flex-1 truncate font-medium">
              {sideName(sides, side)}
              {state.phase === 'playing' && state.chasing === side && (
                <span className="ml-2 text-xs text-muted-foreground">{t('khoKho.chasing')}</span>
              )}
            </span>
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
        data-testid="kho-kho-status"
      >
        {status}
      </p>
      {state.phase === 'playing' && (
        <p className="text-sm" data-testid="batch">
          {t('khoKho.batch', {
            batch: batch.batch,
            out: batch.outInBatch,
            size: state.config.batchSize,
          })}
        </p>
      )}
    </section>
  );
}

function Playing({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as KhoKhoState;
  const chasing = state.chasing!;
  const defending = chasing === 0 ? 1 : 0;
  const [chaser, setChaser] = useState('');
  const [defender, setDefender] = useState('');
  const record = (kind: OutKind) => {
    const credited = kind === 'touch' || kind === 'pole_dive';
    setChaser('');
    setDefender('');
    void onCommand({
      type: 'out',
      kind,
      ...(chaser && credited ? { chaserId: chaser } : {}),
      ...(defender ? { defenderId: defender } : {}),
    });
  };
  const running = periodClockRunning(state.periods);
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <Label htmlFor="kk-chaser">{t('khoKho.chaser')}</Label>
          <select
            id="kk-chaser"
            className={selectClass}
            value={chaser}
            onChange={(e) => setChaser(e.target.value)}
          >
            <option value="">{t('football.notRecorded')}</option>
            {state.players[chasing].map((id) => (
              <option key={id} value={id}>
                {nameOf(sides, id)}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="kk-defender">{t('khoKho.defender')}</Label>
          <select
            id="kk-defender"
            className={selectClass}
            value={defender}
            onChange={(e) => setDefender(e.target.value)}
          >
            <option value="">{t('football.notRecorded')}</option>
            {state.players[defending].map((id) => (
              <option key={id} value={id}>
                {nameOf(sides, id)}
              </option>
            ))}
          </select>
        </div>
      </div>
      <Button
        size="lg"
        className="h-20 w-full text-lg"
        disabled={busy}
        onClick={() => record('touch')}
      >
        {t('khoKho.kind.touch')}
      </Button>
      <div className="grid grid-cols-2 gap-2">
        {OUT_KINDS.filter((k) => k !== 'touch').map((kind) => (
          <Button key={kind} variant="outline" disabled={busy} onClick={() => record(kind)}>
            {t(`khoKho.kind.${kind}`)}
          </Button>
        ))}
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCommand({ type: running ? 'stop_clock' : 'start_clock' })}
        >
          {running ? t('hockey.stopClock') : t('basketball.startClock')}
        </Button>
        <Button
          size="sm"
          variant="outline"
          disabled={busy}
          onClick={() => void onCommand({ type: 'end_turn' })}
        >
          {t('khoKho.endTurn', { n: state.periods.number })}
        </Button>
      </div>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy, sides } = props;
  const state = props.projection.state as KhoKhoState;
  const [first, setFirst] = useState<string | null>(null);
  if (state.phase === 'complete') return null;
  if (state.phase === 'pre_match') {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">{t('khoKho.firstChase')}</p>
        <ChoiceGroup
          label={t('khoKho.firstChase')}
          value={first}
          onChange={setFirst}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <Button
          className="w-full"
          size="lg"
          disabled={first === null || busy}
          onClick={() => void onCommand({ type: 'start_turn', chasing: Number(first) })}
        >
          {t('khoKho.startTurn', { n: 1 })}
        </Button>
      </div>
    );
  }
  if (state.phase === 'break') {
    return (
      <Button
        size="lg"
        className="h-16 w-full"
        disabled={busy}
        onClick={() => void onCommand({ type: 'start_turn' })}
      >
        {t('khoKho.startTurn', { n: state.periods.number + 1 })}
      </Button>
    );
  }
  return <Playing key={state.outs.length} {...props} />;
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as KhoKhoState;
  const stats = khoKhoEngine.stats(state);
  const value = (metric: string, id: string) =>
    stats.find((s) => s.metric === metric && s.participantId === id)?.value ?? 0;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{khoKhoEngine.result(state).summary}</p>
      {state.turnPoints.length > 0 && (
        <table className="w-full tabular-nums">
          <caption className="mb-1 text-left font-medium">{t('khoKho.byTurn')}</caption>
          <tbody>
            {([0, 1] as const).map((side) => (
              <tr key={side} className="border-t">
                <th className="py-1 text-left font-normal">{sideName(sides, side)}</th>
                {state.turnPoints.map((p, i) => (
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
              <th className="text-right font-normal">{t('khoKho.box.outs')}</th>
              <th className="text-right font-normal">{t('khoKho.box.dives')}</th>
              <th className="text-right font-normal">{t('khoKho.box.timesOut')}</th>
            </tr>
          </thead>
          <tbody>
            {state.players[side].map((id) => (
              <tr key={id} className="border-t">
                <td className="py-1">{nameOf(sides, id)}</td>
                <td className="py-1 text-right">{value('outs_made', id)}</td>
                <td className="py-1 text-right">{value('pole_dives', id)}</td>
                <td className="py-1 text-right">{value('times_out', id)}</td>
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
  switch (cmd.type) {
    case 'start_turn': {
      const data = fact('turn_started');
      return data
        ? tr('khoKho.turnOf', {
            n: data.turn as number,
            name: sideName(sides, data.chasing as number),
          })
        : tr('football.timeline.periodStarted');
    }
    case 'end_turn': {
      const data = fact('turn_ended');
      return data
        ? tr('khoKho.endOfTurn', { n: data.turn as number })
        : tr('football.timeline.periodEnded');
    }
    case 'start_clock':
      return tr('basketball.timeline.clockStarted');
    case 'stop_clock':
      return tr('basketball.timeline.clockStopped');
    case 'out': {
      const who = [
        cmd.chaserId ? tr('khoKho.by', { name: nameOf(sides, cmd.chaserId as string) }) : null,
        cmd.defenderId ? nameOf(sides, cmd.defenderId as string) : null,
      ].filter(Boolean);
      const side = fact('out')?.side;
      const team = side === undefined ? '' : `${sideName(sides, side as number)}: `;
      return `${team}${tr(`khoKho.kind.${cmd.kind as string}`)}${who.length ? ` (${who.join(', ')})` : ''}`;
    }
    case 'technical':
      return tr('kabaddi.timeline.technical', {
        name: sideName(sides, cmd.side as number),
        count: cmd.points as number,
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
      case 'batch_out':
        return [tr('khoKho.announce.batchOut', { name })];
      case 'match_won':
        return [tr('badminton.announce.matchWon', { name })];
      case 'match_drawn':
        return [tr('football.announce.draw')];
      default:
        return [];
    }
  });
}

export const khoKhoUi: SportUi = {
  sport: 'kho-kho',
  Setup,
  defaultSetup: () => {
    const preset = khoKhoPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: () => ({ min: 1, max: 15, initial: 1 }),
  namedSides: true,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['forfeit', 'walkover'],
};
