import type { SideIndex } from '@scoresphere/contracts';
import {
  volleyballBestBlocker,
  volleyballBestSpiker,
  volleyballCurrentSet,
  volleyballEngine,
  volleyballMvp,
  volleyballNextFirstServer,
  volleyballPresets,
  volleyballServer,
  type VolleyballSettings,
  volleyballSetsWon,
  type VolleyballState,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { Award } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  const presetKey = value?.presetKey ?? volleyballPresets[0]!.key;
  const config = (value?.config ?? volleyballPresets[0]!.config) as VolleyballSettings;
  const preset = volleyballPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<VolleyballSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (id: string, key: keyof VolleyballSettings, allowEmpty = false) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`volleyball.setup.${key}`)}</Label>
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
          const p = volleyballPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={volleyballPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('vb-court', 'playersOnCourt')}
        {field('vb-sets', 'setsToWin')}
        {field('vb-points', 'pointsPerSet')}
        {field('vb-decider', 'decidingSetPoints')}
        {field('vb-subs', 'substitutionsPerSet', true)}
        {field('vb-timeouts', 'timeoutsPerSet')}
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as VolleyballState;
  const set = volleyballCurrentSet(state) ?? state.sets[state.sets.length - 1];
  const won = volleyballSetsWon(state);
  const server = volleyballServer(state);
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span
              aria-label={state.serving === side ? t('badminton.serving') : undefined}
              className={cn(
                'size-2.5 shrink-0 rounded-full',
                state.serving === side ? 'bg-primary' : 'bg-transparent',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            <span className="text-sm text-muted-foreground" aria-label={t('volleyball.setsWon')}>
              {won[side]}
            </span>
            <span
              className="w-14 text-right text-4xl font-bold tabular-nums"
              data-testid={`points-${side}`}
            >
              {set ? set.points[side] : 0}
            </span>
          </div>
        ))}
      </div>
      {state.phase === 'rallying' && (
        <p className="text-sm text-muted-foreground" role="status">
          {t('volleyball.serviceLine', { set: state.sets.length, server: nameOf(sides, server) })}
          {' · '}
          {t('volleyball.timeouts', {
            a: state.timeoutsUsed[0],
            b: state.timeoutsUsed[1],
            max: state.config.timeoutsPerSet,
          })}
        </p>
      )}
      {state.sets.filter((s) => s.winner !== null).length > 0 && (
        <p className="text-sm tabular-nums">
          {state.sets
            .filter((s) => s.winner !== null)
            .map((s, i) =>
              t('volleyball.setScore', { set: i + 1, score: `${s.points[0]}–${s.points[1]}` }),
            )
            .join(' · ')}
        </p>
      )}
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
      <p className="text-xs text-muted-foreground">{t('volleyball.lineupHint', { size })}</p>
      <div className="grid grid-cols-2 gap-2">
        {squad.map((id) => {
          const position = value.indexOf(id);
          return (
            <button
              key={id}
              type="button"
              aria-pressed={position >= 0}
              onClick={() =>
                onChange(
                  position >= 0
                    ? value.filter((x) => x !== id)
                    : value.length < size
                      ? [...value, id]
                      : value,
                )
              }
              className={cn(
                'min-h-11 rounded-lg border px-3 text-left text-sm',
                position >= 0 && 'border-primary bg-primary/10 font-semibold',
              )}
            >
              {position >= 0 && (
                <span className="mr-2 tabular-nums">
                  {t('volleyball.position', { n: position + 1 })}
                </span>
              )}
              {nameOf(sides, id)}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}

function StartSet({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as VolleyballState;
  const n = state.config.playersOnCourt;
  const required = volleyballNextFirstServer(state);
  const [serving, setServing] = useState<string | null>(
    required === null ? null : String(required),
  );
  const [lineups, setLineups] = useState<[string[], string[]]>([
    state.players[0].slice(0, n),
    state.players[1].slice(0, n),
  ]);
  const ready = serving !== null && lineups.every((l) => l.length === n);
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <h2 className="font-semibold">{t('volleyball.startSet', { set: state.sets.length + 1 })}</h2>
      {required !== null ? (
        <p className="text-sm text-muted-foreground">
          {t('volleyball.servesFirst', { name: sideName(sides, required) })}
        </p>
      ) : (
        <ChoiceGroup
          label={t('badminton.whoServes')}
          value={serving}
          onChange={setServing}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
      )}
      {([0, 1] as const).map((side) => (
        <LineupPicker
          key={side}
          label={t('volleyball.lineup', { name: sideName(sides, side) })}
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
        disabled={!ready || busy}
        onClick={() =>
          void onCommand({ type: 'start_set', servingSide: Number(serving) as SideIndex, lineups })
        }
      >
        {t('volleyball.startSet', { set: state.sets.length + 1 })}
      </Button>
    </div>
  );
}

type Panel = null | { kind: 'credit'; side: SideIndex } | { kind: 'sub' };

function Rallying(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy, sides } = props;
  const state = props.projection.state as VolleyballState;
  const [detailed, setDetailed] = useState(false);
  const [panel, setPanel] = useState<Panel>(null);
  const [subSide, setSubSide] = useState<SideIndex>(0);
  const [subOut, setSubOut] = useState<string | null>(null);
  const [subIn, setSubIn] = useState<string | null>(null);
  const point = (side: SideIndex, credit?: { playerId: string; kind: string }) => {
    setPanel(null);
    void onCommand({ type: 'rally', winner: side, ...(credit ? { credit } : {}) });
  };

  if (panel?.kind === 'credit') {
    const side = panel.side;
    const server = volleyballServer(state);
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">
          {t('volleyball.whoScored', { name: sideName(sides, side) })}
        </h2>
        <div className="space-y-2">
          {state.lineups![side].map((id) => (
            <div key={id} className="flex flex-wrap items-center gap-2">
              <span className="min-w-24 text-sm">{nameOf(sides, id)}</span>
              {(['attack', 'block'] as const).map((kind) => (
                <Button
                  key={kind}
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => point(side, { playerId: id, kind })}
                >
                  {t(`volleyball.kind.${kind}`)}
                </Button>
              ))}
              {state.serving === side && id === server && (
                <Button
                  size="sm"
                  variant="outline"
                  disabled={busy}
                  onClick={() => point(side, { playerId: id, kind: 'ace' })}
                >
                  {t('volleyball.kind.ace')}
                </Button>
              )}
            </div>
          ))}
        </div>
        <div className="flex gap-2">
          <Button variant="secondary" disabled={busy} onClick={() => point(side)}>
            {t('volleyball.opponentError')}
          </Button>
          <Button variant="ghost" onClick={() => setPanel(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  if (panel?.kind === 'sub') {
    const court = state.lineups![subSide];
    const bench = state.players[subSide].filter((id) => !court.includes(id));
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <h2 className="font-semibold">{t('volleyball.substitution')}</h2>
        <ChoiceGroup
          label={t('volleyball.team')}
          value={String(subSide)}
          onChange={(v) => {
            setSubSide(Number(v) as SideIndex);
            setSubOut(null);
            setSubIn(null);
          }}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <ChoiceGroup
          label={t('volleyball.playerOut')}
          value={subOut}
          onChange={setSubOut}
          choices={court.map((id) => ({ value: id, label: nameOf(sides, id) }))}
        />
        <ChoiceGroup
          label={t('volleyball.playerIn')}
          value={subIn}
          onChange={setSubIn}
          choices={bench.map((id) => ({ value: id, label: nameOf(sides, id) }))}
        />
        <div className="flex gap-2">
          <Button
            disabled={!subOut || !subIn || busy}
            onClick={() => {
              setPanel(null);
              void onCommand({ type: 'substitute', side: subSide, outId: subOut, inId: subIn });
            }}
          >
            {t('volleyball.confirmSub')}
          </Button>
          <Button variant="ghost" onClick={() => setPanel(null)}>
            {t('common.cancel')}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as const).map((side) => (
          <Button
            key={side}
            size="lg"
            variant={side === 0 ? 'default' : 'secondary'}
            className="h-28 whitespace-normal text-lg"
            disabled={busy}
            onClick={() => (detailed ? setPanel({ kind: 'credit', side }) : point(side))}
          >
            {t('badminton.pointTo', { name: sideName(sides, side) })}
          </Button>
        ))}
      </div>
      <div className="flex items-center justify-between gap-3">
        <Label htmlFor="vb-detailed" className="font-normal">
          {t('volleyball.recordScorer')}
        </Label>
        <Switch id="vb-detailed" checked={detailed} onCheckedChange={setDetailed} />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button size="sm" variant="ghost" disabled={busy} onClick={() => setPanel({ kind: 'sub' })}>
          {t('volleyball.substitution')}
        </Button>
        {([0, 1] as const).map((side) => (
          <Button
            key={side}
            size="sm"
            variant="ghost"
            disabled={busy || state.timeoutsUsed[side] >= state.config.timeoutsPerSet}
            onClick={() => void onCommand({ type: 'timeout', side })}
          >
            {t('volleyball.timeoutFor', { name: sideName(sides, side) })}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const state = props.projection.state as VolleyballState;
  if (state.phase === 'awaiting_set') return <StartSet key={state.sets.length} {...props} />;
  if (state.phase === 'rallying') return <Rallying {...props} />;
  return null;
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as VolleyballState;
  const stats = volleyballEngine.stats(state);
  const credited = Object.keys(state.credits);
  const metric = (m: string, id: string) =>
    stats.find((s) => s.metric === m && s.participantId === id)?.value ?? 0;
  const awards = [volleyballMvp, volleyballBestSpiker, volleyballBestBlocker]
    .map((award) => ({ award, result: award.compute(state, stats) }))
    .filter((a) => a.result);
  return (
    <div className="space-y-4">
      <p className="font-medium tabular-nums">{volleyballEngine.result(state).summary}</p>
      {credited.length > 0 && (
        <table className="w-full text-sm">
          <caption className="mb-1 text-left font-medium">{t('matches.stats')}</caption>
          <thead>
            <tr className="text-xs text-muted-foreground">
              <th className="text-left font-normal">{t('volleyball.player')}</th>
              <th className="text-right font-normal">{t('volleyball.kind.attack')}</th>
              <th className="text-right font-normal">{t('volleyball.kind.block')}</th>
              <th className="text-right font-normal">{t('volleyball.kind.ace')}</th>
            </tr>
          </thead>
          <tbody>
            {credited.map((id) => (
              <tr key={id} className="border-t">
                <td className="py-1.5">{nameOf(sides, id)}</td>
                <td className="py-1.5 text-right tabular-nums">{metric('attack_points', id)}</td>
                <td className="py-1.5 text-right tabular-nums">{metric('block_points', id)}</td>
                <td className="py-1.5 text-right tabular-nums">{metric('service_aces', id)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
      {awards.map(({ award, result }) => (
        <div key={award.key} className="flex items-start gap-3 rounded-xl border p-3">
          <Award aria-hidden className="mt-0.5 size-5 text-primary" />
          <div>
            <p className="font-medium">
              {award.name}:{' '}
              {result!.recipients.map((r) => nameOf(sides, r.participantId)).join(' & ')}
            </p>
            <p className="text-xs text-muted-foreground">
              {t('matches.awardAuto')} · {award.criteria}
            </p>
          </div>
        </div>
      ))}
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return tr('matches.unknownEvent');
  switch (cmd.type) {
    case 'rally': {
      const name = sideName(sides, cmd.winner as number);
      const score = (
        entry.facts.find((f) => f.type === 'point')?.data?.score as number[] | undefined
      )?.join('–');
      const credit = cmd.credit as { playerId: string; kind: string } | undefined;
      const base = score
        ? tr('badminton.timeline.rally', { name, score })
        : tr('badminton.timeline.rallyUndone', { name });
      return credit
        ? `${base} (${nameOf(sides, credit.playerId)}, ${tr(`volleyball.kind.${credit.kind}`)})`
        : base;
    }
    case 'start_set':
      return tr('volleyball.timeline.startSet', {
        name: sideName(sides, cmd.servingSide as number),
      });
    case 'substitute':
      return tr('volleyball.timeline.sub', {
        in: nameOf(sides, cmd.inId as string),
        out: nameOf(sides, cmd.outId as string),
      });
    case 'timeout':
      return tr('volleyball.timeline.timeout', { name: sideName(sides, cmd.side as number) });
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
    if (f.type === 'set_won') return [tr('tennis.announce.set', { name })];
    if (f.type === 'change_ends') return [tr('badminton.announce.changeEnds')];
    if (f.type === 'match_won') return [tr('badminton.announce.matchWon', { name })];
    return [];
  });
}

export const volleyballUi: SportUi = {
  sport: 'volleyball',
  Setup,
  defaultSetup: () => {
    const preset = volleyballPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: (config) => {
    const n = (config as VolleyballSettings).playersOnCourt;
    return { min: n, max: 14, initial: n };
  },
  namedSides: true,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  correction: (entry) => {
    if (entry.command?.type !== 'rally') return null;
    return {
      label: tr('badminton.correctWinner'),
      payload: { type: 'rally', winner: entry.command.winner === 0 ? 1 : 0 },
    };
  },
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['retired', 'walkover', 'forfeit'],
};
