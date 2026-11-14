import type { SideIndex } from '@scoresphere/contracts';
import { formatClock } from '@scoresphere/engine-kit';
import {
  CHESS_ENDINGS,
  chessClocksAt,
  chessEngine,
  chessPresets,
  type ChessSettings,
  type ChessState,
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
const other = (s: SideIndex): SideIndex => (s === 0 ? 1 : 0);

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? chessPresets[0]!.key;
  const config = (value?.config ?? chessPresets[0]!.config) as ChessSettings;
  const preset = chessPresets.find((p) => p.key === presetKey)!;
  const tc = config.timeControl;
  const set = (patch: Partial<NonNullable<ChessSettings['timeControl']>>) =>
    tc &&
    onChange({
      presetKey,
      presetVersion: preset.version,
      config: { timeControl: { ...tc, ...patch } },
    });
  const field = (
    id: string,
    label: string,
    valueMs: number,
    unitMs: number,
    key: 'baseMs' | 'incrementMs' | 'delayMs',
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        inputMode="numeric"
        value={valueMs / unitMs}
        onChange={(e) => {
          const n = Number(e.target.value);
          if (Number.isFinite(n) && n >= 0) set({ [key]: Math.round(n * unitMs) });
        }}
      />
    </div>
  );
  return (
    <div className="space-y-5">
      <ChoiceGroup
        label={t('chess.timeControl')}
        columns={1}
        value={presetKey}
        onChange={(key) => {
          const p = chessPresets.find((x) => x.key === key)!;
          onChange({ presetKey: key, presetVersion: p.version, config: { ...p.config } });
        }}
        choices={chessPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      {tc && (
        <fieldset className="grid grid-cols-3 gap-3">
          <legend className="mb-2 text-sm font-medium">{t('chess.adjust')}</legend>
          {field('ch-base', t('chess.baseMinutes'), tc.baseMs, 60_000, 'baseMs')}
          {field('ch-inc', t('chess.incrementSeconds'), tc.incrementMs, 1000, 'incrementMs')}
          {field('ch-delay', t('chess.delaySeconds'), tc.delayMs, 1000, 'delayMs')}
        </fieldset>
      )}
    </div>
  );
}

function colourOf(state: ChessState, side: SideIndex): 'white' | 'black' | null {
  if (state.whiteSide === null) return null;
  return state.whiteSide === side ? 'white' : 'black';
}

function Scoreboard({ projection, sides, clockOffsetMs = 0 }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as ChessState;
  const now = useNow(200);
  const clocks = chessClocksAt(state, now + clockOffsetMs);
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        {([0, 1] as const).map((side) => {
          const running =
            state.phase === 'playing' && state.toMove === side && state.turnStartedAt !== null;
          const colour = colourOf(state, side);
          return (
            <div
              key={side}
              className={cn(
                'rounded-xl border p-4 text-center',
                running && 'border-primary bg-primary/10',
              )}
              data-testid={`clock-${side}`}
            >
              <p className="truncate font-medium">{sideName(sides, side)}</p>
              {colour && <p className="text-xs text-muted-foreground">{t(`chess.${colour}`)}</p>}
              {clocks && (
                <p
                  className={cn(
                    'mt-1 text-4xl font-bold tabular-nums',
                    clocks[side] === 0 && 'text-destructive',
                  )}
                  data-testid={`time-${side}`}
                >
                  {formatClock(clocks[side])}
                </p>
              )}
              <p className="text-xs text-muted-foreground">
                {t('chess.moves', { count: state.clocks[side].moves })}
              </p>
            </div>
          );
        })}
      </div>
      {state.outcome && <p className="font-medium">{chessEngine.result(state).summary}</p>}
    </section>
  );
}

function StartGame({ sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const [white, setWhite] = useState<string | null>(null);
  return (
    <div className="space-y-4 rounded-xl border p-4">
      <ChoiceGroup
        label={t('chess.whoIsWhite')}
        value={white}
        onChange={setWhite}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <Button
        className="w-full"
        size="lg"
        disabled={white === null || busy}
        onClick={() => void onCommand({ type: 'start_clock', whiteSide: Number(white) })}
      >
        {t('chess.startClock')}
      </Button>
    </div>
  );
}

function ResultPanel({ sides, onCommand, busy, onClose }: ControlsProps & { onClose: () => void }) {
  const { t } = useTranslation();
  const [ending, setEnding] = useState<string | null>(null);
  const [winner, setWinner] = useState<string | null>(null);
  const decisive = ending === 'checkmate' || ending === 'resignation' || ending === 'forfeit';
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <ChoiceGroup
        label={t('chess.howEnded')}
        value={ending}
        onChange={setEnding}
        choices={CHESS_ENDINGS.map((e) => ({ value: e, label: t(`chess.ending.${e}`) }))}
      />
      {decisive && (
        <ChoiceGroup
          label={t('chess.winner')}
          value={winner}
          onChange={setWinner}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
      )}
      <div className="flex gap-2">
        <Button
          disabled={!ending || (decisive && winner === null) || busy}
          onClick={() => {
            onClose();
            void onCommand({
              type: 'result',
              ending,
              ...(decisive ? { winner: Number(winner) } : {}),
            });
          }}
        >
          {t('chess.recordResult')}
        </Button>
        <Button variant="ghost" onClick={onClose}>
          {t('common.cancel')}
        </Button>
      </div>
    </div>
  );
}

function Playing(props: ControlsProps) {
  const { t } = useTranslation();
  const { sides, onCommand, busy } = props;
  const state = props.projection.state as ChessState;
  const now = useNow(200);
  const [showResult, setShowResult] = useState(false);
  if (showResult) return <ResultPanel {...props} onClose={() => setShowResult(false)} />;
  const clocks = chessClocksAt(state, now);
  const toMove = state.toMove!;
  const flagged = clocks !== null && clocks[toMove] === 0;
  const paused = state.turnStartedAt === null;

  return (
    <div className="space-y-3">
      {clocks && !flagged && (
        <div className="grid grid-cols-2 gap-3">
          {([0, 1] as const).map((side) => (
            <Button
              key={side}
              size="lg"
              variant={side === toMove ? 'default' : 'outline'}
              className="h-28 whitespace-normal text-lg"
              disabled={busy || paused || side !== toMove}
              onClick={() => void onCommand({ type: 'press', side })}
            >
              {t('chess.press', { name: sideName(sides, side) })}
            </Button>
          ))}
        </div>
      )}
      {flagged && (
        <div role="alert" className="space-y-3 rounded-xl border border-destructive/40 p-4">
          <p className="font-semibold">{t('chess.flagFell', { name: sideName(sides, toMove) })}</p>
          <p className="text-sm text-muted-foreground">
            {t('chess.flagHelp', { name: sideName(sides, other(toMove)) })}
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="destructive"
              disabled={busy}
              onClick={() => void onCommand({ type: 'flag', side: toMove, result: 'loss' })}
            >
              {t('chess.lossOnTime')}
            </Button>
            <Button
              variant="outline"
              disabled={busy}
              onClick={() => void onCommand({ type: 'flag', side: toMove, result: 'draw' })}
            >
              {t('chess.drawOnTime')}
            </Button>
          </div>
        </div>
      )}
      <Button
        variant="outline"
        className="w-full"
        disabled={busy}
        onClick={() => setShowResult(true)}
      >
        {t('chess.recordResult')}
      </Button>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const state = props.projection.state as ChessState;
  if (state.phase === 'pre_match') return <StartGame {...props} />;
  if (state.phase === 'playing') return <Playing {...props} />;
  return null;
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as ChessState;
  return (
    <div className="space-y-3">
      <p className="font-medium">{chessEngine.result(state).summary || t('chess.inProgress')}</p>
      <table className="w-full text-sm">
        <tbody>
          {([0, 1] as const).map((side) => (
            <tr key={side} className="border-t">
              <th className="py-1.5 text-left font-medium">
                {sideName(sides, side)}
                {colourOf(state, side) && (
                  <span className="ml-2 text-xs font-normal text-muted-foreground">
                    {t(`chess.${colourOf(state, side)}`)}
                  </span>
                )}
              </th>
              <td className="py-1.5 text-right tabular-nums">
                {t('chess.moves', { count: state.clocks[side].moves })}
              </td>
              <td className="py-1.5 text-right tabular-nums">
                {formatClock(state.timeUsedMs[side])}
              </td>
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
  switch (cmd.type) {
    case 'start_clock':
      return tr('chess.timeline.start', { name: sideName(sides, cmd.whiteSide as number) });
    case 'press': {
      const used = entry.facts.find((f) => f.type === 'press')?.data?.usedMs as number | undefined;
      return tr('chess.timeline.press', {
        name: sideName(sides, cmd.side as number),
        time: used === undefined ? '' : formatClock(used),
      });
    }
    case 'flag':
      return tr('chess.timeline.flag', { name: sideName(sides, cmd.side as number) });
    case 'result':
      return tr(`chess.ending.${cmd.ending as string}`);
    default:
      return cmd.type;
  }
}

export const chessUi: SportUi = {
  sport: 'chess',
  Setup,
  defaultSetup: () => {
    const preset = chessPresets.find((p) => p.key === 'rapid-15-10')!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: () => ({ min: 1, max: 1, initial: 1 }),
  namedSides: false,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  concede: (side) => ({ type: 'result', ending: 'forfeit', winner: other(side) }),
  concedeReasons: ['forfeit'],
};
