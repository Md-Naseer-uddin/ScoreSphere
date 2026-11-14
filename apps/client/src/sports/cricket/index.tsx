import type { SideIndex } from '@scoresphere/contracts';
import {
  availableBatters,
  ballText,
  type CricketCommand,
  cricketEngine,
  cricketPresets,
  type CricketSettings,
  type CricketState,
  currentInnings,
  type DeliveryKind,
  type DismissalKind,
  howOut,
  type Innings,
  marginText,
  oversText,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { type Choice, ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import type { SideView } from '@/features/matches/hooks';
import { cn } from '@/lib/utils';
import type { ControlsProps, MatchViewProps, SetupProps, SportUi } from '../types';

const tr = (key: string, options: Record<string, unknown> = {}) => i18next.t(key, options);

function names(sides: SideView[]) {
  const map = new Map<string, string>();
  for (const s of sides) for (const p of s.participants) map.set(p.participantId, p.displayName);
  return (id: string | null | undefined) => (id ? (map.get(id) ?? '?') : '?');
}
const sideName = (sides: SideView[], side: number) =>
  sides.find((s) => s.side === side)?.name ?? '?';

const rate = (runs: number, balls: number, bpo: number) =>
  balls === 0 ? '–' : ((runs / balls) * bpo).toFixed(2);

// ---------------------------------------------------------------- setup

function NumberField({
  id,
  label,
  value,
  onChange,
  allowEmpty = false,
}: {
  id: string;
  label: string;
  value: number | null;
  onChange: (value: number | null) => void;
  allowEmpty?: boolean;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={value ?? ''}
        onChange={(e) => {
          if (allowEmpty && e.target.value === '') return onChange(null);
          const n = Number(e.target.value);
          if (Number.isInteger(n) && n >= 0) onChange(n);
        }}
      />
    </div>
  );
}

function Toggle({
  id,
  label,
  checked,
  onChange,
}: {
  id: string;
  label: string;
  checked: boolean;
  onChange: (value: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3">
      <Label htmlFor={id} className="font-normal">
        {label}
      </Label>
      <Switch id={id} checked={checked} onCheckedChange={onChange} />
    </div>
  );
}

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? cricketPresets[0]!.key;
  const config = (value?.config ?? cricketPresets[0]!.config) as CricketSettings;
  const set = (patch: Partial<CricketSettings>) => {
    const preset = cricketPresets.find((p) => p.key === presetKey)!;
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  };
  const choosePreset = (key: string) => {
    const preset = cricketPresets.find((p) => p.key === key)!;
    onChange({ presetKey: key, presetVersion: preset.version, config: { ...preset.config } });
  };

  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t('matches.new.format')}
        columns={1}
        value={presetKey}
        onChange={choosePreset}
        choices={cricketPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('cricket.setup.rules')}</legend>
        <NumberField
          id="ck-overs"
          label={t('cricket.setup.overs')}
          value={config.oversPerInnings}
          onChange={(v) =>
            v &&
            set({
              oversPerInnings: v,
              maxOversPerBowler:
                config.maxOversPerBowler === null ? null : Math.min(config.maxOversPerBowler, v),
            })
          }
        />
        <NumberField
          id="ck-players"
          label={t('cricket.setup.players')}
          value={config.playersPerSide}
          onChange={(v) => v && set({ playersPerSide: v })}
        />
        <NumberField
          id="ck-bowler"
          label={t('cricket.setup.bowlerLimit')}
          value={config.maxOversPerBowler}
          allowEmpty
          onChange={(v) => set({ maxOversPerBowler: v })}
        />
        <NumberField
          id="ck-balls"
          label={t('cricket.setup.ballsPerOver')}
          value={config.ballsPerOver}
          onChange={(v) => v && set({ ballsPerOver: v })}
        />
        <NumberField
          id="ck-wide"
          label={t('cricket.setup.wideRuns')}
          value={config.wideRuns}
          onChange={(v) => v !== null && set({ wideRuns: v })}
        />
        <NumberField
          id="ck-nb"
          label={t('cricket.setup.noBallRuns')}
          value={config.noBallRuns}
          onChange={(v) => v !== null && set({ noBallRuns: v })}
        />
      </fieldset>
      <div className="space-y-3">
        <Toggle
          id="ck-freehit"
          label={t('cricket.setup.freeHit')}
          checked={config.freeHit}
          onChange={(freeHit) => set({ freeHit })}
        />
        <Toggle
          id="ck-consecutive"
          label={t('cricket.setup.consecutiveOvers')}
          checked={config.allowConsecutiveOvers}
          onChange={(allowConsecutiveOvers) => set({ allowConsecutiveOvers })}
        />
        <Toggle
          id="ck-lms"
          label={t('cricket.setup.lastManStands')}
          checked={config.lastManStands}
          onChange={(lastManStands) => set({ lastManStands })}
        />
        <Toggle
          id="ck-otoh"
          label={t('cricket.setup.oneTipOneHand')}
          checked={config.oneTipOneHand}
          onChange={(oneTipOneHand) => set({ oneTipOneHand })}
        />
        <Toggle
          id="ck-wides"
          label={t('cricket.setup.consecutiveWides')}
          checked={config.consecutiveWides !== null}
          onChange={(on) => set({ consecutiveWides: on ? { threshold: 3, penaltyRuns: 1 } : null })}
        />
        {config.consecutiveWides && (
          <div className="grid grid-cols-2 gap-3">
            <NumberField
              id="ck-wides-n"
              label={t('cricket.setup.widesInARow')}
              value={config.consecutiveWides.threshold}
              onChange={(v) =>
                v && set({ consecutiveWides: { ...config.consecutiveWides!, threshold: v } })
              }
            />
            <NumberField
              id="ck-wides-p"
              label={t('cricket.setup.penaltyRuns')}
              value={config.consecutiveWides.penaltyRuns}
              onChange={(v) =>
                v && set({ consecutiveWides: { ...config.consecutiveWides!, penaltyRuns: v } })
              }
            />
          </div>
        )}
      </div>
      <ChoiceGroup
        label={t('cricket.setup.sixAndOut')}
        columns={1}
        value={config.sixAndOut}
        onChange={(sixAndOut) => set({ sixAndOut })}
        choices={(['off', 'out_runs_count', 'out_no_runs'] as const).map((v) => ({
          value: v,
          label: t(`cricket.setup.sixAndOutOption.${v}`),
        }))}
      />
      <ChoiceGroup
        label={t('cricket.setup.superOver')}
        columns={1}
        value={config.superOver}
        onChange={(superOver) => set({ superOver })}
        choices={(['off', 'once', 'until_decided'] as const).map((v) => ({
          value: v,
          label: t(`cricket.setup.superOverOption.${v}`),
        }))}
      />
    </div>
  );
}

// ---------------------------------------------------------------- scoreboard

function inningsLabel(inn: Innings): string {
  return inn.superOver ? tr('cricket.superOver') : tr('cricket.inningsN', { n: inn.number });
}

function Scoreboard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as CricketState;
  const name = names(sides);
  const bpo = state.config.ballsPerOver;
  const inn = currentInnings(state);

  if (!inn) {
    return (
      <section aria-label={t('matches.score')} className="rounded-xl border p-4">
        <p className="font-medium">
          {sideName(sides, 0)} {t('matches.vs').trim()} {sideName(sides, 1)}
        </p>
        <p className="text-sm text-muted-foreground" role="status">
          {state.toss
            ? t('cricket.tossLine', {
                name: sideName(sides, state.toss.winner),
                decision: t(`cricket.decision.${state.toss.decision}`),
              })
            : t('cricket.notStarted')}
        </p>
      </section>
    );
  }

  const remaining = inn.maxBalls - inn.legalBalls;
  const need = inn.target !== null ? inn.target - inn.runs : null;
  const batters = [inn.atStrikerEnd, inn.atNonStrikerEnd].filter((id): id is string => Boolean(id));
  const bowler = inn.bowlerId ? inn.bowlers[inn.bowlerId] : null;
  const previous = state.innings.slice(0, -1);

  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="rounded-xl border p-4">
        <p className="text-xs text-muted-foreground">
          {inningsLabel(inn)} · {sideName(sides, inn.battingSide)}
        </p>
        <p className="text-4xl font-bold tabular-nums">
          <span data-testid="cricket-score">
            {inn.runs}/{inn.wickets}
          </span>
          <span
            className="ml-2 text-lg font-normal text-muted-foreground"
            data-testid="cricket-overs"
          >
            ({oversText(inn.legalBalls, bpo)})
          </span>
        </p>
        <p className="text-sm text-muted-foreground" role="status">
          {need !== null && need > 0 && !inn.closed
            ? t('cricket.need', { runs: need, balls: remaining, rrr: rate(need, remaining, bpo) })
            : t('cricket.runRate', { crr: rate(inn.runs, inn.legalBalls, bpo) })}
          {inn.freeHit && (
            <span className="ml-2 font-semibold text-primary">{t('cricket.freeHit')}</span>
          )}
        </p>
      </div>
      {!inn.closed && (
        <div className="grid gap-2 text-sm">
          {batters.map((id) => {
            const card = inn.batters[id]!;
            return (
              <div
                key={id}
                className="flex justify-between"
                data-testid={id === inn.atStrikerEnd ? 'striker' : 'non-striker'}
              >
                <span className={cn(id === inn.atStrikerEnd && 'font-semibold')}>
                  {name(id)}
                  {id === inn.atStrikerEnd ? ' *' : ''}
                </span>
                <span className="tabular-nums">
                  {card.runs} ({card.balls})
                </span>
              </div>
            );
          })}
          {bowler && (
            <div className="flex justify-between text-muted-foreground">
              <span>{name(bowler.id)}</span>
              <span className="tabular-nums">
                {oversText(bowler.legalBalls, bpo)}-{bowler.maidens}-{bowler.runs}-{bowler.wickets}
              </span>
            </div>
          )}
          {inn.currentOver && inn.currentOver.balls.length > 0 && (
            <div className="flex flex-wrap gap-1" aria-label={t('cricket.thisOver')}>
              {inn.currentOver.balls.map((b, i) => (
                <span
                  key={i}
                  className={cn(
                    'rounded-md border px-1.5 py-0.5 text-xs tabular-nums',
                    b.label.startsWith('W') && 'border-destructive text-destructive',
                  )}
                >
                  {b.label}
                </span>
              ))}
            </div>
          )}
        </div>
      )}
      {previous.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {previous
            .map(
              (p) =>
                `${sideName(sides, p.battingSide)} ${p.runs}/${p.wickets} (${oversText(p.legalBalls, bpo)})`,
            )
            .join(' · ')}
        </p>
      )}
      {state.outcome && (
        <p className="font-medium">
          {state.outcome.kind === 'tie'
            ? t('cricket.tied')
            : `${sideName(sides, state.outcome.winner)} ${marginText(state.outcome)}`}
        </p>
      )}
    </section>
  );
}

// ---------------------------------------------------------------- controls

function useEngineCheck(state: CricketState) {
  return (cmd: CricketCommand) => cricketEngine.validate(state, cmd);
}

function StartInnings({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as CricketState;
  const name = names(sides);
  const count = state.innings.length;
  const derived: SideIndex | null =
    count === 0
      ? state.toss
        ? state.toss.decision === 'bat'
          ? state.toss.winner
          : state.toss.winner === 0
            ? 1
            : 0
        : null
      : count % 2 === 1
        ? state.innings[count - 1]!.battingSide === 0
          ? 1
          : 0
        : state.innings[count - 1]!.battingSide;
  const [battingSide, setBattingSide] = useState<SideIndex | null>(derived);
  const [striker, setStriker] = useState<string | null>(null);
  const [nonStriker, setNonStriker] = useState<string | null>(null);
  const [tossWinner, setTossWinner] = useState<string | null>(null);
  const side = derived ?? battingSide;
  const squad = side === null ? [] : state.players[side];
  const choices = (exclude: string | null): Choice<string>[] =>
    squad.map((id) => ({ value: id, label: name(id), disabled: id === exclude }));
  const target = count % 2 === 1 ? state.innings[count - 1]!.runs + 1 : null;

  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">
        {count >= 2 ? t('cricket.startSuperOver') : t('cricket.startInnings', { n: count + 1 })}
      </h2>
      {target !== null && (
        <p className="text-sm text-muted-foreground">{t('cricket.target', { runs: target })}</p>
      )}
      {count === 0 && !state.toss && (
        <details className="rounded-lg border p-3">
          <summary className="cursor-pointer text-sm font-medium">
            {t('cricket.recordToss')}
          </summary>
          <div className="mt-3 space-y-3">
            <ChoiceGroup
              label={t('cricket.tossWinner')}
              value={tossWinner}
              onChange={setTossWinner}
              choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
            />
            <div className="flex gap-2">
              {(['bat', 'bowl'] as const).map((decision) => (
                <Button
                  key={decision}
                  variant="outline"
                  size="sm"
                  disabled={tossWinner === null || busy}
                  onClick={() =>
                    void onCommand({ type: 'toss', winner: Number(tossWinner), decision })
                  }
                >
                  {t(`cricket.chose.${decision}`)}
                </Button>
              ))}
            </div>
          </div>
        </details>
      )}
      {derived === null && (
        <ChoiceGroup
          label={t('cricket.whoBats')}
          value={battingSide === null ? null : String(battingSide)}
          onChange={(v) => {
            setBattingSide(Number(v) as SideIndex);
            setStriker(null);
            setNonStriker(null);
          }}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
      )}
      {side !== null && (
        <>
          <ChoiceGroup
            label={t('cricket.striker')}
            value={striker}
            onChange={setStriker}
            choices={choices(nonStriker)}
          />
          <ChoiceGroup
            label={t('cricket.nonStriker')}
            value={nonStriker}
            onChange={setNonStriker}
            choices={choices(striker)}
          />
        </>
      )}
      <Button
        className="w-full"
        size="lg"
        disabled={!striker || !nonStriker || busy}
        onClick={() =>
          void onCommand({
            type: 'start_innings',
            ...(derived === null && side !== null ? { battingSide: side } : {}),
            strikerId: striker,
            nonStrikerId: nonStriker,
          })
        }
      >
        {t('cricket.startPlay')}
      </Button>
    </div>
  );
}

function PickBowler({
  projection,
  sides,
  onCommand,
  busy,
  midOver = false,
}: ControlsProps & { midOver?: boolean }) {
  const { t } = useTranslation();
  const state = projection.state as CricketState;
  const inn = currentInnings(state)!;
  const name = names(sides);
  const check = useEngineCheck(state);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">
        {midOver
          ? t('cricket.changeBowler')
          : t('cricket.pickBowler', { over: inn.overs.length + 1 })}
      </h2>
      <ChoiceGroup
        label={t('cricket.bowler')}
        value={null}
        onChange={(bowlerId) => void onCommand({ type: 'set_bowler', bowlerId })}
        choices={state.players[inn.bowlingSide].map((id) => {
          const ok = check({ type: 'set_bowler', bowlerId: id });
          const card = inn.bowlers[id];
          return {
            value: id,
            label: name(id),
            hint: !ok.ok
              ? ok.error.message
              : card
                ? `${oversText(card.legalBalls, state.config.ballsPerOver)}-${card.maidens}-${card.runs}-${card.wickets}`
                : undefined,
            disabled: !ok.ok || busy,
          };
        })}
      />
    </div>
  );
}

function PickBatter({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as CricketState;
  const inn = currentInnings(state)!;
  const name = names(sides);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('cricket.pickBatter')}</h2>
      <ChoiceGroup
        label={t('cricket.nextBatter')}
        value={null}
        onChange={(batterId) => void onCommand({ type: 'next_batter', batterId })}
        choices={availableBatters(state, inn).map((id) => ({
          value: id,
          label: name(id),
          hint: inn.batters[id]?.status === 'retired_hurt' ? t('cricket.returning') : undefined,
          disabled: busy,
        }))}
      />
    </div>
  );
}

type Panel =
  null | 'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'more' | 'wicket' | 'retire' | 'bowler';

const DISMISSAL_KINDS: DismissalKind[] = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'one_tip_one_hand',
  'obstructing_field',
  'hit_ball_twice',
];

function WicketForm({
  projection,
  sides,
  onCommand,
  busy,
  onDone,
}: ControlsProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const state = projection.state as CricketState;
  const inn = currentInnings(state)!;
  const name = names(sides);
  const check = useEngineCheck(state);
  const [kind, setKind] = useState<DismissalKind | null>(null);
  const [batterId, setBatterId] = useState<string>(inn.atStrikerEnd!);
  const [end, setEnd] = useState<'striker' | 'non_striker'>('striker');
  const [runs, setRuns] = useState(0);
  const [delivery, setDelivery] = useState<DeliveryKind>('bat');
  const [fielderId, setFielderId] = useState<string>('');
  const runOut = kind === 'run_out' || kind === 'obstructing_field';
  const needsFielder =
    kind === 'caught' || kind === 'stumped' || kind === 'run_out' || kind === 'one_tip_one_hand';

  const build = (k: DismissalKind): CricketCommand => ({
    type: 'delivery',
    kind: k === 'stumped' || runOut ? delivery : 'bat',
    runs: runOut ? runs : 0,
    boundary: false,
    wicket: {
      kind: k as Exclude<DismissalKind, 'six_and_out' | 'retired_out'>,
      batterId: runOut ? batterId : inn.atStrikerEnd!,
      ...(runOut ? { end } : {}),
      ...(fielderId ? { fielderId } : {}),
    },
  });
  const valid = kind ? check(build(kind)) : null;

  return (
    <div className="space-y-3 rounded-xl border border-destructive/40 p-4">
      <h2 className="font-semibold">{t('cricket.wicket')}</h2>
      <ChoiceGroup
        label={t('cricket.howOut')}
        value={kind}
        onChange={setKind}
        choices={DISMISSAL_KINDS.filter(
          (k) => k !== 'one_tip_one_hand' || state.config.oneTipOneHand,
        ).map((k) => ({ value: k, label: t(`cricket.dismissal.${k}`) }))}
      />
      {runOut && (
        <>
          <ChoiceGroup
            label={t('cricket.whoIsOut')}
            value={batterId}
            onChange={setBatterId}
            choices={[inn.atStrikerEnd, inn.atNonStrikerEnd]
              .filter((id): id is string => Boolean(id))
              .map((id) => ({ value: id, label: name(id) }))}
          />
          <ChoiceGroup
            label={t('cricket.whichEnd')}
            value={end}
            onChange={setEnd}
            choices={[
              { value: 'striker', label: t('cricket.end.striker') },
              { value: 'non_striker', label: t('cricket.end.non_striker') },
            ]}
          />
          <ChoiceGroup
            label={t('cricket.runsCompleted')}
            value={String(runs)}
            onChange={(v) => setRuns(Number(v))}
            choices={[0, 1, 2, 3].map((r) => ({ value: String(r), label: String(r) }))}
          />
        </>
      )}
      {(runOut || kind === 'stumped') && (
        <ChoiceGroup
          label={t('cricket.offDelivery')}
          value={delivery}
          onChange={setDelivery}
          choices={(kind === 'stumped'
            ? (['bat', 'wide'] as const)
            : (['bat', 'wide', 'no_ball_bat', 'bye', 'leg_bye'] as const)
          ).map((k) => ({ value: k, label: t(`cricket.deliveryKind.${k}`) }))}
        />
      )}
      {needsFielder && (
        <div className="space-y-1">
          <Label htmlFor="ck-fielder">{t('cricket.fielder')}</Label>
          <select
            id="ck-fielder"
            className="h-11 w-full rounded-lg border bg-background px-3 text-sm"
            value={fielderId}
            onChange={(e) => setFielderId(e.target.value)}
          >
            <option value="">{t('cricket.noFielder')}</option>
            {state.players[inn.bowlingSide].map((id) => (
              <option key={id} value={id}>
                {name(id)}
              </option>
            ))}
          </select>
        </div>
      )}
      {valid && !valid.ok && <p className="text-sm text-destructive">{valid.error.message}</p>}
      <div className="flex gap-2">
        <Button variant="outline" onClick={onDone}>
          {t('common.cancel')}
        </Button>
        <Button
          variant="destructive"
          className="flex-1"
          disabled={!kind || !valid?.ok || busy}
          onClick={() => {
            onDone();
            void onCommand(build(kind!));
          }}
        >
          {t('cricket.confirmWicket')}
        </Button>
      </div>
    </div>
  );
}

function RetireForm({
  projection,
  sides,
  onCommand,
  busy,
  onDone,
}: ControlsProps & { onDone: () => void }) {
  const { t } = useTranslation();
  const inn = currentInnings(projection.state as CricketState)!;
  const name = names(sides);
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">{t('cricket.retire')}</h2>
      {[inn.atStrikerEnd, inn.atNonStrikerEnd]
        .filter((id): id is string => Boolean(id))
        .map((id) => (
          <div key={id} className="flex items-center justify-between gap-2">
            <span>{name(id)}</span>
            <div className="flex gap-2">
              {(['hurt', 'out'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => {
                    onDone();
                    void onCommand({ type: 'retire', batterId: id, kind });
                  }}
                >
                  {t(`cricket.retired.${kind}`)}
                </Button>
              ))}
            </div>
          </div>
        ))}
      <Button variant="ghost" onClick={onDone}>
        {t('common.cancel')}
      </Button>
    </div>
  );
}

function RunPad(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy } = props;
  const [panel, setPanel] = useState<Panel>(null);
  const ball = (kind: DeliveryKind, runs: number, boundary = false) => {
    setPanel(null);
    void onCommand({ type: 'delivery', kind, runs, boundary });
  };
  const close = () => setPanel(null);

  if (panel === 'wicket') return <WicketForm {...props} onDone={close} />;
  if (panel === 'retire') return <RetireForm {...props} onDone={close} />;
  if (panel === 'bowler')
    return (
      <PickBowler
        {...props}
        midOver
        onCommand={(p) => {
          close();
          return props.onCommand(p);
        }}
      />
    );

  interface PadOption {
    label: string;
    kind: DeliveryKind;
    runs: number;
    boundary: boolean;
  }
  const opt = (label: string, kind: DeliveryKind, runs: number, boundary = false): PadOption => ({
    label,
    kind,
    runs,
    boundary,
  });
  const extraOptions: Record<'wide' | 'no_ball' | 'bye' | 'leg_bye' | 'more', PadOption[]> = {
    wide: [
      opt(t('cricket.pad.wide'), 'wide', 0),
      opt('+1', 'wide', 1),
      opt('+2', 'wide', 2),
      opt('+3', 'wide', 3),
      opt('+4', 'wide', 4, true),
    ],
    no_ball: [
      opt(t('cricket.pad.noBall'), 'no_ball_bat', 0),
      opt('+1', 'no_ball_bat', 1),
      opt('+2', 'no_ball_bat', 2),
      opt('+3', 'no_ball_bat', 3),
      opt(t('cricket.pad.four'), 'no_ball_bat', 4, true),
      opt(t('cricket.pad.six'), 'no_ball_bat', 6, true),
      opt(t('cricket.pad.nbByes', { runs: 1 }), 'no_ball_bye', 1),
      opt(t('cricket.pad.nbLegByes', { runs: 1 }), 'no_ball_leg_bye', 1),
    ],
    bye: [opt('1', 'bye', 1), opt('2', 'bye', 2), opt('3', 'bye', 3), opt('4', 'bye', 4, true)],
    leg_bye: [
      opt('1', 'leg_bye', 1),
      opt('2', 'leg_bye', 2),
      opt('3', 'leg_bye', 3),
      opt('4', 'leg_bye', 4, true),
    ],
    more: [
      opt(t('cricket.pad.fiveRuns'), 'bat', 5),
      opt(t('cricket.pad.fourRun'), 'bat', 4),
      opt(t('cricket.pad.sevenRuns'), 'bat', 7),
    ],
  };

  if (panel) {
    const options = extraOptions[panel];
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t(`cricket.panel.${panel}`)}</h2>
        <div className="grid grid-cols-3 gap-2">
          {options.map((o) => (
            <Button
              key={`${o.kind}-${o.runs}-${o.label}`}
              variant="outline"
              className="h-14"
              disabled={busy}
              onClick={() => ball(o.kind, o.runs, o.boundary)}
            >
              {o.label}
            </Button>
          ))}
        </div>
        <Button variant="ghost" onClick={close}>
          {t('common.cancel')}
        </Button>
      </div>
    );
  }

  const runs: { label: string; aria: string; runs: number; boundary?: boolean }[] = [
    { label: '0', aria: t('cricket.pad.dot'), runs: 0 },
    { label: '1', aria: t('cricket.pad.runs', { count: 1 }), runs: 1 },
    { label: '2', aria: t('cricket.pad.runs', { count: 2 }), runs: 2 },
    { label: '3', aria: t('cricket.pad.runs', { count: 3 }), runs: 3 },
    { label: '4', aria: t('cricket.pad.four'), runs: 4, boundary: true },
    { label: '6', aria: t('cricket.pad.six'), runs: 6, boundary: true },
  ];
  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        {runs.map((r) => (
          <Button
            key={r.label}
            aria-label={r.aria}
            className="h-16 text-2xl"
            variant={r.boundary ? 'default' : 'secondary'}
            disabled={busy}
            onClick={() => ball('bat', r.runs, r.boundary)}
          >
            {r.label}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-4 gap-2">
        {(['wide', 'no_ball', 'bye', 'leg_bye'] as const).map((p) => (
          <Button
            key={p}
            variant="outline"
            className="h-12"
            disabled={busy}
            onClick={() => setPanel(p)}
          >
            {t(`cricket.pad.${p}`)}
          </Button>
        ))}
      </div>
      <div className="grid grid-cols-2 gap-2">
        <Button
          variant="destructive"
          className="h-12"
          disabled={busy}
          onClick={() => setPanel('wicket')}
        >
          {t('cricket.pad.wicket')}
        </Button>
        <Button variant="outline" className="h-12" disabled={busy} onClick={() => setPanel('more')}>
          {t('cricket.pad.more')}
        </Button>
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPanel('retire')}>
          {t('cricket.retire')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onCommand({ type: 'swap_ends' })}
        >
          {t('cricket.swapStrike')}
        </Button>
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPanel('bowler')}>
          {t('cricket.changeBowler')}
        </Button>
        <Button
          size="sm"
          variant="ghost"
          disabled={busy}
          onClick={() => void onCommand({ type: 'declare' })}
        >
          {t('cricket.declare')}
        </Button>
      </div>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const state = props.projection.state as CricketState;
  switch (state.phase) {
    case 'pre_match':
    case 'innings_break':
      return <StartInnings key={state.innings.length} {...props} />;
    case 'awaiting_bowler':
      return <PickBowler {...props} />;
    case 'awaiting_batter':
      return <PickBatter {...props} />;
    case 'in_play':
      return <RunPad {...props} />;
    case 'complete':
      return null;
  }
}

// ---------------------------------------------------------------- scorecard

function InningsCard({
  inn,
  state,
  sides,
}: {
  inn: Innings;
  state: CricketState;
  sides: SideView[];
}) {
  const { t } = useTranslation();
  const name = names(sides);
  const bpo = state.config.ballsPerOver;
  const e = inn.extras;
  const extras = e.wides + e.noBalls + e.byes + e.legByes + e.penalties;
  const didNotBat = state.players[inn.battingSide].filter((id) => !inn.batters[id]);
  return (
    <div className="space-y-3">
      <h3 className="font-medium">
        {sideName(sides, inn.battingSide)} · {inningsLabel(inn)}
        <span className="ml-2 tabular-nums text-muted-foreground">
          {inn.runs}/{inn.wickets} ({oversText(inn.legalBalls, bpo)})
        </span>
      </h3>
      <table className="w-full text-sm">
        <caption className="sr-only">{t('cricket.batting')}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-normal">{t('cricket.batting')}</th>
            <th className="py-1 text-right font-normal">R</th>
            <th className="py-1 text-right font-normal">B</th>
            <th className="py-1 text-right font-normal">4s</th>
            <th className="py-1 text-right font-normal">6s</th>
            <th className="py-1 text-right font-normal">SR</th>
          </tr>
        </thead>
        <tbody>
          {inn.battingOrder.map((id) => {
            const b = inn.batters[id]!;
            return (
              <tr key={id} className="border-t align-top">
                <td className="py-1.5">
                  <span className="font-medium">{name(id)}</span>
                  <span className="block text-xs text-muted-foreground">{howOut(b, name)}</span>
                </td>
                <td className="py-1.5 text-right font-medium tabular-nums">{b.runs}</td>
                <td className="py-1.5 text-right tabular-nums">{b.balls}</td>
                <td className="py-1.5 text-right tabular-nums">{b.fours}</td>
                <td className="py-1.5 text-right tabular-nums">{b.sixes}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {b.balls ? ((b.runs / b.balls) * 100).toFixed(1) : '–'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className="text-sm">
        {t('cricket.extras')}: {extras}{' '}
        <span className="text-muted-foreground">
          (b {e.byes}, lb {e.legByes}, w {e.wides}, nb {e.noBalls}, p {e.penalties})
        </span>
      </p>
      {didNotBat.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('cricket.didNotBat')}: {didNotBat.map(name).join(', ')}
        </p>
      )}
      {inn.fallOfWickets.length > 0 && (
        <p className="text-sm text-muted-foreground">
          {t('cricket.fallOfWickets')}:{' '}
          {inn.fallOfWickets
            .map(
              (f) => `${f.wicket}-${f.runs} (${name(f.batterId)}, ${ballText(f.legalBalls, bpo)})`,
            )
            .join(', ')}
        </p>
      )}
      <table className="w-full text-sm">
        <caption className="sr-only">{t('cricket.bowling')}</caption>
        <thead>
          <tr className="text-left text-xs text-muted-foreground">
            <th className="py-1 font-normal">{t('cricket.bowling')}</th>
            <th className="py-1 text-right font-normal">O</th>
            <th className="py-1 text-right font-normal">M</th>
            <th className="py-1 text-right font-normal">R</th>
            <th className="py-1 text-right font-normal">W</th>
            <th className="py-1 text-right font-normal">Econ</th>
          </tr>
        </thead>
        <tbody>
          {inn.bowlingOrder.map((id) => {
            const w = inn.bowlers[id]!;
            return (
              <tr key={id} className="border-t">
                <td className="py-1.5 font-medium">
                  {name(id)}
                  {(w.wides > 0 || w.noBalls > 0) && (
                    <span className="ml-1 text-xs font-normal text-muted-foreground">
                      ({w.wides}w {w.noBalls}nb)
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right tabular-nums">{oversText(w.legalBalls, bpo)}</td>
                <td className="py-1.5 text-right tabular-nums">{w.maidens}</td>
                <td className="py-1.5 text-right tabular-nums">{w.runs}</td>
                <td className="py-1.5 text-right font-medium tabular-nums">{w.wickets}</td>
                <td className="py-1.5 text-right tabular-nums">
                  {rate(w.runs, w.legalBalls, bpo)}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const state = projection.state as CricketState;
  return (
    <div className="space-y-6">
      {state.innings.map((inn) => (
        <InningsCard key={inn.number} inn={inn} state={state} sides={sides} />
      ))}
    </div>
  );
}

// ---------------------------------------------------------------- timeline text

type Entry = Parameters<SportUi['describe']>[0];

function deliveryText(cmd: Extract<CricketCommand, { type: 'delivery' }>): string {
  const r = cmd.runs;
  const base =
    cmd.kind === 'bat'
      ? cmd.boundary
        ? r === 6
          ? tr('cricket.text.six')
          : tr('cricket.text.four')
        : r === 0
          ? tr('cricket.text.dot')
          : tr('cricket.text.runs', { count: r })
      : tr(`cricket.text.${cmd.kind}`, { count: r });
  return cmd.wicket
    ? `${tr('cricket.text.wicket', { kind: tr(`cricket.dismissal.${cmd.wicket.kind}`) })} · ${base}`
    : base;
}

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command as CricketCommand | undefined;
  if (!cmd) return tr('matches.unknownEvent');
  const name = names(sides);
  switch (cmd.type) {
    case 'delivery': {
      const over = entry.facts.find((f) => f.type === 'over_complete');
      return over
        ? `${deliveryText(cmd)} · ${tr('cricket.text.endOfOver', { over: over.data?.over })}`
        : deliveryText(cmd);
    }
    case 'toss':
      return tr('cricket.tossLine', {
        name: sideName(sides, cmd.winner),
        decision: tr(`cricket.decision.${cmd.decision}`),
      });
    case 'start_innings':
      return tr('cricket.text.inningsStarted', {
        striker: name(cmd.strikerId),
        nonStriker: name(cmd.nonStrikerId),
      });
    case 'set_bowler':
      return tr('cricket.text.bowler', { name: name(cmd.bowlerId) });
    case 'next_batter':
      return tr('cricket.text.batter', { name: name(cmd.batterId) });
    case 'retire':
      return tr(`cricket.text.retired.${cmd.kind}`, { name: name(cmd.batterId) });
    case 'swap_ends':
      return tr('cricket.swapStrike');
    case 'declare':
      return tr('cricket.declare');
    case 'concede':
      return tr(`cricket.text.concede.${cmd.reason}`, { name: sideName(sides, cmd.side) });
  }
}

function announce(facts: Entry['facts']): string[] {
  return facts.flatMap((f) => {
    switch (f.type) {
      case 'wicket':
        return [tr('cricket.announce.wicket')];
      case 'over_complete':
        return [tr('cricket.announce.overComplete', { over: f.data?.over })];
      case 'innings_closed':
        return [tr('cricket.announce.inningsClosed')];
      case 'wide_penalty':
        return [tr('cricket.announce.widePenalty', { runs: f.data?.runs })];
      case 'super_over_needed':
        return [tr('cricket.announce.superOver')];
      default:
        return [];
    }
  });
}

export const cricketUi: SportUi = {
  sport: 'cricket',
  Setup,
  defaultSetup: () => {
    const preset = cricketPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: (config) => {
    const max = (config as CricketSettings).playersPerSide;
    return { min: 2, max, initial: Math.min(max, 2) };
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
