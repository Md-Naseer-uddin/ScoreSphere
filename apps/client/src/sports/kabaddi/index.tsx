import type { SideIndex } from '@scoresphere/contracts';
import { formatClock, periodClockRunning } from '@scoresphere/engine-kit';
import {
  bonusLive,
  isDoOrDie,
  kabaddiClockLeft,
  kabaddiEngine,
  kabaddiPresets,
  type KabaddiSettings,
  type KabaddiState,
  kabaddiTimeoutsLeft,
  type RaidResult,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { Minus, Plus } from 'lucide-react';
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
const halfName = (halves: number, n: number) =>
  halves === 1 ? tr('football.period.match') : tr(`football.period.half${n}`);

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? kabaddiPresets[0]!.key;
  const config = (value?.config ?? kabaddiPresets[0]!.config) as KabaddiSettings;
  const preset = kabaddiPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<KabaddiSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (id: string, key: keyof KabaddiSettings, allowEmpty = false) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`kabaddi.setup.${key}`)}</Label>
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
  const toggles: [string, string, boolean, (on: boolean) => void][] = [
    ['kb-bonus', 'bonusLine', config.bonusLine, (on) => set({ bonusLine: on })],
    ['kb-dod', 'doOrDie', config.doOrDie, (on) => set({ doOrDie: on })],
    [
      'kb-super',
      'superTackle',
      config.superTackleMaxDefenders !== null,
      (on) => set({ superTackleMaxDefenders: on ? 3 : null }),
    ],
  ];
  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t('matches.new.format')}
        columns={1}
        value={presetKey}
        onChange={(key) => {
          const p = kabaddiPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={kabaddiPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('kb-mat', 'playersOnMat')}
        {field('kb-minutes', 'halfMinutes')}
        {field('kb-raid', 'raidSeconds', true)}
        {field('kb-allout', 'allOutPoints')}
        {field('kb-timeouts', 'timeoutsPerHalf')}
      </fieldset>
      <div className="space-y-3">
        {toggles.map(([id, key, checked, toggle]) => (
          <div key={id} className="flex items-center justify-between gap-3">
            <Label htmlFor={id} className="font-normal">
              {t(`kabaddi.setup.${key}`)}
            </Label>
            <Switch id={id} checked={checked} onCheckedChange={toggle} />
          </div>
        ))}
      </div>
    </div>
  );
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as KabaddiState;
  const now = useNow(500) + clockOffsetMs;
  const status =
    state.phase === 'pre_match'
      ? t('football.status.preMatch')
      : state.phase === 'playing'
        ? `${halfName(state.config.halves, state.periods.number)} · ${formatClock(kabaddiClockLeft(state, now))}${
            periodClockRunning(state.periods) ? '' : ` · ${t('hockey.clockStopped')}`
          }`
        : state.phase === 'break'
          ? t('football.status.break', {
              period: halfName(state.config.halves, state.periods.number),
            })
          : t('football.status.fullTime');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span className="min-w-0 flex-1">
              <span className="block truncate font-medium">{sideName(sides, side)}</span>
              <span
                className="flex gap-1"
                role="img"
                aria-label={t('kabaddi.onMat', { count: state.onMat[side] })}
                data-testid={`on-mat-${side}`}
              >
                {Array.from({ length: state.strength[side] }, (_, i) => (
                  <span
                    key={i}
                    className={cn(
                      'size-2.5 rounded-full border border-primary',
                      i < state.onMat[side] && 'bg-primary',
                    )}
                  />
                ))}
              </span>
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
        data-testid="kabaddi-status"
      >
        {status}
      </p>
    </section>
  );
}

/** The raid timer: a display aid on the scoring device, started by hand for each raid. */
function RaidTimer({ seconds }: { seconds: number }) {
  const { t } = useTranslation();
  const now = useNow(100);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const left =
    startedAt === null ? seconds * 1000 : Math.max(0, seconds * 1000 - (now - startedAt));
  return (
    <div className="flex items-center gap-2 rounded-lg border px-3 py-2">
      <span className="text-sm text-muted-foreground">{t('kabaddi.raidTimer')}</span>
      <span
        className={cn('flex-1 text-2xl font-bold tabular-nums', left === 0 && 'text-destructive')}
      >
        {Math.ceil(left / 1000)}
      </span>
      <Button size="sm" variant="outline" onClick={() => setStartedAt(Date.now())}>
        {startedAt === null ? t('kabaddi.startRaid') : t('kabaddi.restartRaid')}
      </Button>
    </div>
  );
}

function RaidPanel({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as KabaddiState;
  const raiding = state.nextRaid!;
  const defending: SideIndex = raiding === 0 ? 1 : 0;
  const [raider, setRaider] = useState('');
  const [touches, setTouches] = useState(0);
  const [bonus, setBonus] = useState(false);
  const [tackler, setTackler] = useState('');
  const canBonus = bonusLive(state, defending);
  const doOrDie = isDoOrDie(state, raiding);
  const submit = (result: RaidResult) =>
    void onCommand({
      type: 'raid',
      side: raiding,
      ...(raider ? { raiderId: raider } : {}),
      touches: result === 'safe' ? touches : 0,
      bonus: bonus && canBonus && result !== 'out',
      result,
      ...(tackler && result === 'tackled' ? { tacklerId: tackler } : {}),
    });
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="flex items-center gap-2 font-semibold">
        {t('kabaddi.raidBy', { name: sideName(sides, raiding) })}
        {doOrDie && (
          <span className="rounded bg-destructive/10 px-1.5 text-xs font-medium text-destructive">
            {t('kabaddi.doOrDie')}
          </span>
        )}
      </h2>
      {state.config.raidSeconds !== null && <RaidTimer seconds={state.config.raidSeconds} />}
      <div className="space-y-1">
        <Label htmlFor="kb-raider">{t('kabaddi.raider')}</Label>
        <select
          id="kb-raider"
          className={selectClass}
          value={raider}
          onChange={(e) => setRaider(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {state.players[raiding].map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm">{t('kabaddi.touches')}</span>
        <Button
          size="icon"
          variant="outline"
          aria-label={t('kabaddi.fewerTouches')}
          disabled={touches === 0}
          onClick={() => setTouches((n) => n - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <span className="w-6 text-center text-xl font-bold tabular-nums" data-testid="touches">
          {touches}
        </span>
        <Button
          size="icon"
          variant="outline"
          aria-label={t('kabaddi.moreTouches')}
          disabled={touches >= state.onMat[defending]}
          onClick={() => setTouches((n) => n + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="kb-bonus-now" className="font-normal">
          {canBonus ? t('kabaddi.bonus') : t('kabaddi.noBonus')}
        </Label>
        <Switch
          id="kb-bonus-now"
          checked={bonus && canBonus}
          disabled={!canBonus}
          onCheckedChange={setBonus}
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="kb-tackler">{t('kabaddi.tackler')}</Label>
        <select
          id="kb-tackler"
          className={selectClass}
          value={tackler}
          onChange={(e) => setTackler(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {state.players[defending].map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Button className="h-14 whitespace-normal" disabled={busy} onClick={() => submit('safe')}>
          {t('kabaddi.result.safe')}
        </Button>
        <Button
          variant="secondary"
          className="h-14 whitespace-normal"
          disabled={busy}
          onClick={() => submit('tackled')}
        >
          {t('kabaddi.result.tackled')}
        </Button>
        <Button
          variant="outline"
          className="h-14 whitespace-normal"
          disabled={busy}
          onClick={() => submit('out')}
        >
          {t('kabaddi.result.out')}
        </Button>
      </div>
    </div>
  );
}

function OtherPanel({
  state,
  sides,
  busy,
  onDone,
  onCommand,
}: {
  state: KabaddiState;
  sides: SideView[];
  busy: boolean;
  onDone: () => void;
  onCommand: ControlsProps['onCommand'];
}) {
  const { t } = useTranslation();
  const [side, setSide] = useState<SideIndex>(0);
  const [player, setPlayer] = useState('');
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('kabaddi.other')}</h2>
      <ChoiceGroup
        label={t('volleyball.team')}
        value={String(side)}
        onChange={(v) => {
          setSide(Number(v) as SideIndex);
          setPlayer('');
        }}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <div className="space-y-1">
        <Label htmlFor="kb-out-player">{t('football.player')}</Label>
        <select
          id="kb-out-player"
          className={selectClass}
          value={player}
          onChange={(e) => setPlayer(e.target.value)}
        >
          <option value="">{t('football.notRecorded')}</option>
          {state.players[side].map((id) => (
            <option key={id} value={id}>
              {nameOf(sides, id)}
            </option>
          ))}
        </select>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button
          variant="secondary"
          disabled={busy || state.onMat[side] === 0}
          onClick={() => {
            onDone();
            void onCommand({ type: 'player_out', side, ...(player ? { playerId: player } : {}) });
          }}
        >
          {t('kabaddi.playerOut')}
        </Button>
        <Button
          variant="secondary"
          disabled={busy}
          onClick={() => {
            onDone();
            void onCommand({ type: 'technical', side, points: 1 });
          }}
        >
          {t('kabaddi.technicalPoint')}
        </Button>
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
  const state = props.projection.state as KabaddiState;
  const [first, setFirst] = useState<string | null>(null);
  const [other, setOther] = useState(false);
  if (state.phase === 'complete') return null;
  if (state.phase === 'pre_match') {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">{t('kabaddi.firstRaid')}</p>
        <ChoiceGroup
          label={t('kabaddi.firstRaid')}
          value={first}
          onChange={setFirst}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <Button
          className="w-full"
          size="lg"
          disabled={first === null || busy}
          onClick={() => void onCommand({ type: 'start_period', firstRaid: Number(first) })}
        >
          {t('football.start', { period: halfName(state.config.halves, 1) })}
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
        onClick={() => void onCommand({ type: 'start_period' })}
      >
        {t('football.start', { period: halfName(state.config.halves, state.periods.number + 1) })}
      </Button>
    );
  }
  if (other)
    return (
      <OtherPanel
        state={state}
        sides={sides}
        busy={busy}
        onDone={() => setOther(false)}
        onCommand={onCommand}
      />
    );
  const running = periodClockRunning(state.periods);
  return (
    <div className="space-y-3">
      <RaidPanel key={state.raids.length} {...props} />
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="outline" disabled={busy} onClick={() => setOther(true)}>
          {t('kabaddi.other')}
        </Button>
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
          {t('football.end', { period: halfName(state.config.halves, state.periods.number) })}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        {([0, 1] as const).map((side) => (
          <Button
            key={side}
            size="sm"
            variant="ghost"
            disabled={busy || kabaddiTimeoutsLeft(state, side) === 0}
            onClick={() => void onCommand({ type: 'timeout', side })}
          >
            {t('volleyball.timeoutFor', { name: sideName(sides, side) })}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as KabaddiState;
  const stats = kabaddiEngine.stats(state);
  const value = (metric: string, side: number, id?: string) =>
    stats.find((s) => s.metric === metric && s.side === side && s.participantId === id)?.value ?? 0;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{kabaddiEngine.result(state).summary}</p>
      {([0, 1] as const).map((side) => (
        <table key={side} className="w-full tabular-nums">
          <caption className="mb-1 text-left font-medium">
            {sideName(sides, side)} ·{' '}
            {t('kabaddi.teamLine', {
              raids: value('raids', side),
              successful: value('successful_raids', side),
              tackles: value('tackles', side),
              allOuts: value('all_outs', side),
            })}
          </caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-normal">{t('volleyball.player')}</th>
              <th className="text-right font-normal">{t('kabaddi.box.raid')}</th>
              <th className="text-right font-normal">{t('kabaddi.box.tackle')}</th>
              <th className="text-right font-normal">{t('kabaddi.box.raids')}</th>
            </tr>
          </thead>
          <tbody>
            {state.players[side].map((id) => (
              <tr key={id} className="border-t">
                <td className="py-1">{nameOf(sides, id)}</td>
                <td className="py-1 text-right">{value('raid_points', side, id)}</td>
                <td className="py-1 text-right">{value('tackle_points', side, id)}</td>
                <td className="py-1 text-right">{value('raids', side, id)}</td>
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
  switch (cmd.type) {
    case 'start_period':
    case 'end_period': {
      const data = fact(cmd.type === 'start_period' ? 'period_started' : 'period_ended');
      if (!data)
        return tr(
          `football.timeline.${cmd.type === 'start_period' ? 'periodStarted' : 'periodEnded'}`,
        );
      const period = halfName(data.periods as number, data.period as number);
      return cmd.type === 'start_period'
        ? tr('football.timeline.started', { period })
        : tr('football.status.break', { period });
    }
    case 'start_clock':
      return tr('basketball.timeline.clockStarted');
    case 'stop_clock':
      return tr('basketball.timeline.clockStopped');
    case 'raid': {
      const raider = cmd.raiderId ? ` – ${nameOf(sides, cmd.raiderId as string)}` : '';
      const raid = fact('raid');
      const result = raid?.tackled
        ? cmd.result === 'tackled'
          ? tr('kabaddi.timeline.tackled', {
              by: cmd.tacklerId ? ` (${nameOf(sides, cmd.tacklerId as string)})` : '',
            })
          : tr('kabaddi.timeline.out')
        : tr('kabaddi.timeline.points', { count: Number(raid?.points ?? 0) });
      const extras = [
        raid?.doOrDie ? tr('kabaddi.doOrDie') : null,
        cmd.bonus ? tr('kabaddi.bonusShort') : null,
        fact('all_out') ? tr('kabaddi.allOut') : null,
        fact('tackle')?.super ? tr('kabaddi.superTackle') : null,
      ].filter(Boolean);
      return `${tr('kabaddi.timeline.raid', { name })}${raider}: ${result}${extras.length ? ` (${extras.join(', ')})` : ''}`;
    }
    case 'player_out':
      return tr('kabaddi.timeline.playerOut', {
        name,
        player: cmd.playerId ? ` (${nameOf(sides, cmd.playerId as string)})` : '',
      });
    case 'technical':
      return tr('kabaddi.timeline.technical', { name, count: cmd.points as number });
    case 'timeout':
      return tr('volleyball.timeline.timeout', { name });
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
      case 'all_out':
        return [tr('kabaddi.announce.allOut', { name })];
      case 'tackle':
        return f.data?.super ? [tr('kabaddi.announce.superTackle', { name })] : [];
      case 'match_won':
        return [tr('badminton.announce.matchWon', { name })];
      case 'match_drawn':
        return [tr('football.announce.draw')];
      default:
        return [];
    }
  });
}

export const kabaddiUi: SportUi = {
  sport: 'kabaddi',
  Setup,
  defaultSetup: () => {
    const preset = kabaddiPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: (config) => {
    const n = (config as KabaddiSettings).playersOnMat;
    return { min: 1, max: 15, initial: Math.min(n, 2) };
  },
  namedSides: true,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['forfeit', 'walkover'],
};
