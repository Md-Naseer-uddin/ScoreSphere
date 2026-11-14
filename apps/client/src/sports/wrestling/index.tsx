import type { SideIndex } from '@scoresphere/contracts';
import { formatClock, periodClockRunning } from '@scoresphere/engine-kit';
import {
  classificationPoints,
  wrestlingClockLeft,
  wrestlingEngine,
  wrestlingPresets,
  type WrestlingSettings,
  type WrestlingState,
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

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? wrestlingPresets[0]!.key;
  const config = (value?.config ?? wrestlingPresets[0]!.config) as WrestlingSettings;
  const preset = wrestlingPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<WrestlingSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (
    id: string,
    key: 'periods' | 'periodMinutes' | 'technicalSuperiority',
    allowEmpty = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`wrestling.setup.${key}`)}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={config[key] ?? ''}
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
          const p = wrestlingPresets.find((x) => x.key === key)!;
          onChange({
            presetKey: key,
            presetVersion: p.version,
            config: { ...p.config, weightClass: config.weightClass },
          });
        }}
        choices={wrestlingPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <div className="space-y-1">
        <Label htmlFor="wr-weight">{t('wrestling.setup.weightClass')}</Label>
        <Input
          id="wr-weight"
          maxLength={20}
          placeholder="57 kg"
          value={config.weightClass ?? ''}
          onChange={(e) => set({ weightClass: e.target.value.trim() ? e.target.value : null })}
        />
      </div>
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('wr-periods', 'periods')}
        {field('wr-minutes', 'periodMinutes')}
        {field('wr-ts', 'technicalSuperiority', true)}
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as WrestlingState;
  const now = useNow(200) + clockOffsetMs;
  const { style, weightClass } = state.config;
  const status =
    state.phase === 'pre_match'
      ? t('wrestling.beforeBout')
      : state.phase === 'playing'
        ? `${t('wrestling.period', { n: state.periods.number })} · ${formatClock(wrestlingClockLeft(state, now))}${
            periodClockRunning(state.periods) ? '' : ` · ${t('hockey.clockStopped')}`
          }`
        : state.phase === 'break'
          ? t('wrestling.break')
          : t('wrestling.final');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <p className="text-sm text-muted-foreground">
        {t(`wrestling.style.${style}`)}
        {weightClass ? ` · ${weightClass}` : ''}
      </p>
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span
              className={cn(
                'size-3 shrink-0 rounded-full',
                side === 0 ? 'bg-red-600' : 'bg-blue-600',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            {state.cautions[side] > 0 && (
              <span className="text-xs text-muted-foreground">
                {t('wrestling.cautions', { count: state.cautions[side] })}
              </span>
            )}
            <span
              className="w-14 text-right text-4xl font-bold tabular-nums"
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
        data-testid="wrestling-status"
      >
        {status}
      </p>
    </section>
  );
}

function Controls({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as WrestlingState;
  const [caution, setCaution] = useState<SideIndex | null>(null);
  if (state.phase === 'complete') return null;
  if (state.phase !== 'playing') {
    return (
      <Button
        size="lg"
        className="h-16 w-full"
        disabled={busy}
        onClick={() => void onCommand({ type: 'start_period' })}
      >
        {t('football.start', { period: t('wrestling.period', { n: state.periods.number + 1 }) })}
      </Button>
    );
  }
  if (caution !== null) {
    const opponent = caution === 0 ? 1 : 0;
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">
          {t('wrestling.cautionFor', { name: sideName(sides, caution) })}
        </h2>
        <div className="flex flex-wrap gap-2">
          {([1, 2] as const).map((penalty) => (
            <Button
              key={penalty}
              variant="secondary"
              disabled={busy}
              onClick={() => {
                setCaution(null);
                void onCommand({ type: 'caution', side: caution, penalty });
              }}
            >
              {t('wrestling.cautionPoints', { count: penalty, name: sideName(sides, opponent) })}
            </Button>
          ))}
          <Button variant="ghost" onClick={() => setCaution(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }
  const running = periodClockRunning(state.periods);
  return (
    <div className="space-y-3">
      {([0, 1] as const).map((side) => (
        <div key={side} className="space-y-1">
          <p className="text-sm font-medium">{sideName(sides, side)}</p>
          <div className="grid grid-cols-4 gap-2">
            {([1, 2, 4, 5] as const).map((value) => (
              <Button
                key={value}
                size="lg"
                variant={side === 0 ? 'default' : 'secondary'}
                className="h-14 text-lg"
                disabled={busy}
                aria-label={t('wrestling.pointsFor', { count: value, name: sideName(sides, side) })}
                onClick={() => void onCommand({ type: 'points', side, value })}
              >
                +{value}
              </Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" disabled={busy} onClick={() => setCaution(side)}>
              {t('wrestling.caution')}
            </Button>
            <Button
              size="sm"
              variant="outline"
              disabled={busy}
              onClick={() => void onCommand({ type: 'fall', side })}
            >
              {t('wrestling.fall')}
            </Button>
          </div>
        </div>
      ))}
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
          onClick={() => void onCommand({ type: 'end_period' })}
        >
          {t('football.end', { period: t('wrestling.period', { n: state.periods.number }) })}
        </Button>
      </div>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as WrestlingState;
  const cp = classificationPoints(state);
  return (
    <div className="space-y-3 text-sm">
      <p className="font-medium tabular-nums">{wrestlingEngine.result(state).summary}</p>
      {cp && (
        <p>
          {t('wrestling.classification', {
            a: sideName(sides, 0),
            b: sideName(sides, 1),
            score: `${cp[0]}:${cp[1]}`,
          })}
        </p>
      )}
      <ol className="space-y-0.5 tabular-nums">
        {state.actions.map((a, i) => (
          <li key={i}>
            {t('wrestling.period', { n: a.period })}: {sideName(sides, a.side)} +{a.value}
            {a.kind !== 'other' && ` (${t(`wrestling.kind.${a.kind}`)})`}
          </li>
        ))}
      </ol>
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
      const period = tr('wrestling.period', { n: data.period as number });
      return cmd.type === 'start_period'
        ? tr('football.timeline.started', { period })
        : tr('football.status.break', { period });
    }
    case 'start_clock':
      return tr('basketball.timeline.clockStarted');
    case 'stop_clock':
      return tr('basketball.timeline.clockStopped');
    case 'points':
      return `${name} +${cmd.value as number}${cmd.kind ? ` (${tr(`wrestling.kind.${cmd.kind as string}`)})` : ''}`;
    case 'caution':
      return tr('wrestling.timeline.caution', { name, count: cmd.penalty as number });
    case 'fall':
      return tr('wrestling.timeline.fall', { name });
    case 'final_whistle':
      return tr('football.timeline.finalWhistle');
    case 'concede':
      return tr('wrestling.timeline.concede', {
        name,
        reason: tr(`wrestling.ending.${cmd.reason as string}`),
      });
    default:
      return cmd.type;
  }
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    if (f.type !== 'match_won') return [];
    return [
      tr('wrestling.announce.won', {
        name: sideName(sides, f.data?.side as number),
        method: tr(`wrestling.method.${f.data?.method as string}`),
      }),
    ];
  });
}

export const wrestlingUi: SportUi = {
  sport: 'wrestling',
  Setup,
  defaultSetup: () => {
    const preset = wrestlingPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: () => ({ min: 1, max: 1, initial: 1 }),
  namedSides: false,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['injury', 'forfeit', 'disqualification'],
};
