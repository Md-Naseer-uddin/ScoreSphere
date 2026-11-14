import type { SideIndex } from '@scoresphere/contracts';
import {
  carromCurrentGame,
  carromEngine,
  carromGamesWon,
  carromPresets,
  type CarromSettings,
  type CarromState,
  nextBreak,
} from '@scoresphere/sports';
import i18next from 'i18next';
import { Minus, Plus } from 'lucide-react';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ChoiceGroup } from '@/components/ChoiceGroup';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { SideView } from '@/features/matches/hooks';
import { cn } from '@/lib/utils';
import type { ControlsProps, MatchViewProps, SetupProps, SportUi } from '../types';

const tr = (key: string, options: Record<string, unknown> = {}) => i18next.t(key, options);
const sideName = (sides: SideView[], side: number) =>
  sides.find((s) => s.side === side)?.name ?? '?';

function Setup({ value, onChange }: SetupProps) {
  const { t } = useTranslation();
  const presetKey = value?.presetKey ?? carromPresets[0]!.key;
  const config = (value?.config ?? carromPresets[0]!.config) as CarromSettings;
  const preset = carromPresets.find((p) => p.key === presetKey)!;
  const set = (patch: Partial<CarromSettings>) =>
    onChange({ presetKey, presetVersion: preset.version, config: { ...config, ...patch } });
  const field = (
    id: string,
    key: 'targetPoints' | 'maxBoards' | 'queenPoints' | 'queenCountsBelow' | 'gamesToWin',
    allowEmpty = false,
  ) => (
    <div className="space-y-1">
      <Label htmlFor={id}>{t(`carrom.setup.${key}`)}</Label>
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
          const p = carromPresets.find((x) => x.key === key)!;
          onChange({
            presetKey: key,
            presetVersion: p.version,
            config: { ...p.config, discipline: config.discipline },
          });
        }}
        choices={carromPresets.map((p) => ({
          value: p.key,
          label: p.name,
          hint: t(`matches.presetCategory.${p.category}`),
        }))}
      />
      <ChoiceGroup
        label={t('carrom.discipline')}
        value={config.discipline}
        onChange={(discipline) => set({ discipline })}
        choices={(['singles', 'doubles'] as const).map((d) => ({
          value: d,
          label: t(`carrom.${d}`),
        }))}
      />
      <fieldset className="grid grid-cols-2 gap-3">
        <legend className="mb-2 text-sm font-medium">{t('badminton.rules')}</legend>
        {field('cr-target', 'targetPoints')}
        {field('cr-boards', 'maxBoards', true)}
        {field('cr-queen', 'queenPoints')}
        {field('cr-below', 'queenCountsBelow', true)}
        {field('cr-games', 'gamesToWin')}
      </fieldset>
    </div>
  );
}

function Scoreboard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as CarromState;
  const game = carromCurrentGame(state);
  const won = carromGamesWon(state);
  const breaker = nextBreak(state);
  const status =
    state.phase === 'pre_match'
      ? t('carrom.beforeMatch')
      : state.phase === 'playing'
        ? t('carrom.status', {
            game: state.games.length,
            board: game.boards.length + 1,
            name: breaker === null ? '?' : sideName(sides, breaker),
          })
        : t('basketball.final');
  return (
    <section aria-label={t('matches.score')} className="space-y-3">
      <div className="overflow-hidden rounded-xl border">
        {([0, 1] as const).map((side) => (
          <div
            key={side}
            className={cn('flex items-center gap-3 px-4 py-3', side === 0 && 'border-b')}
          >
            <span
              className={cn(
                'size-3 shrink-0 rounded-full border',
                side === 0 ? 'bg-amber-50' : 'bg-neutral-900',
              )}
            />
            <span className="min-w-0 flex-1 truncate font-medium">{sideName(sides, side)}</span>
            <span className="text-sm text-muted-foreground" aria-label={t('carrom.gamesWon')}>
              {won[side]}
            </span>
            <span
              className="w-14 text-right text-4xl font-bold tabular-nums"
              data-testid={`points-${side}`}
            >
              {game.points[side]}
            </span>
          </div>
        ))}
      </div>
      <p className="text-sm text-muted-foreground" role="status" data-testid="carrom-status">
        {status}
      </p>
    </section>
  );
}

function BoardPanel({ projection, sides, onCommand, busy }: ControlsProps) {
  const { t } = useTranslation();
  const state = projection.state as CarromState;
  const [winner, setWinner] = useState<string | null>(null);
  const [coins, setCoins] = useState(0);
  const [queen, setQueen] = useState('none');
  return (
    <div className="space-y-3 rounded-xl border p-4">
      <h2 className="font-semibold">
        {t('carrom.boardResult', { n: carromCurrentGame(state).boards.length + 1 })}
      </h2>
      <ChoiceGroup
        label={t('carrom.boardWinner')}
        value={winner}
        onChange={setWinner}
        choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
      />
      <div className="flex items-center gap-3">
        <span className="flex-1 text-sm">{t('carrom.coinsLeft')}</span>
        <Button
          size="icon"
          variant="outline"
          aria-label={t('carrom.fewerCoins')}
          disabled={coins === 0}
          onClick={() => setCoins((n) => n - 1)}
        >
          <Minus aria-hidden />
        </Button>
        <span className="w-6 text-center text-xl font-bold tabular-nums" data-testid="coins-left">
          {coins}
        </span>
        <Button
          size="icon"
          variant="outline"
          aria-label={t('carrom.moreCoins')}
          disabled={coins === 9}
          onClick={() => setCoins((n) => n + 1)}
        >
          <Plus aria-hidden />
        </Button>
      </div>
      <ChoiceGroup
        label={t('carrom.queenCoveredBy')}
        value={queen}
        onChange={setQueen}
        columns={1}
        choices={[
          { value: 'none', label: t('carrom.queenNotCovered') },
          ...[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) })),
        ]}
      />
      <Button
        className="w-full"
        size="lg"
        disabled={winner === null || busy}
        onClick={() =>
          void onCommand({
            type: 'board',
            winner: Number(winner) as SideIndex,
            coinsLeft: coins,
            queenCoveredBy: queen === 'none' ? null : Number(queen),
          })
        }
      >
        {t('carrom.recordBoard')}
      </Button>
    </div>
  );
}

function Controls(props: ControlsProps) {
  const { t } = useTranslation();
  const { onCommand, busy, sides } = props;
  const state = props.projection.state as CarromState;
  const [first, setFirst] = useState<string | null>(null);
  if (state.phase === 'complete') return null;
  if (state.phase === 'pre_match') {
    return (
      <div className="space-y-3 rounded-xl border p-4">
        <p className="text-sm font-medium">{t('carrom.firstBreak')}</p>
        <ChoiceGroup
          label={t('carrom.firstBreak')}
          value={first}
          onChange={setFirst}
          choices={[0, 1].map((s) => ({ value: String(s), label: sideName(sides, s) }))}
        />
        <Button
          className="w-full"
          size="lg"
          disabled={first === null || busy}
          onClick={() => void onCommand({ type: 'start_match', firstBreak: Number(first) })}
        >
          {t('carrom.start')}
        </Button>
      </div>
    );
  }
  const boards = state.games.reduce((n, g) => n + g.boards.length, 0);
  return (
    <div className="space-y-3">
      <BoardPanel key={boards} {...props} />
      <div className="flex flex-wrap gap-2">
        {([0, 1] as const).map((side) => (
          <Button
            key={side}
            size="sm"
            variant="outline"
            disabled={busy}
            onClick={() => void onCommand({ type: 'foul', side })}
          >
            {t('carrom.foulBy', { name: sideName(sides, side) })}
          </Button>
        ))}
      </div>
    </div>
  );
}

function Scorecard({ projection, sides }: MatchViewProps) {
  const { t } = useTranslation();
  const state = projection.state as CarromState;
  return (
    <div className="space-y-4 text-sm">
      <p className="font-medium tabular-nums">{carromEngine.result(state).summary}</p>
      {state.games
        .filter((g) => g.boards.length > 0)
        .map((g, i) => (
          <table key={i} className="w-full tabular-nums">
            <caption className="mb-1 text-left font-medium">
              {t('carrom.game', { n: i + 1 })} · {g.points[0]}–{g.points[1]}
            </caption>
            <tbody>
              {g.boards.map((b, j) => (
                <tr key={j} className="border-t">
                  <td className="py-1">{t('carrom.board', { n: j + 1 })}</td>
                  <td className="py-1">{sideName(sides, b.winner)}</td>
                  <td className="py-1 text-right">
                    {b.points}
                    {b.queenCounted && ` (${t('carrom.withQueen')})`}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ))}
      <p className="text-muted-foreground">
        {t('carrom.fouls', { a: state.fouls[0], b: state.fouls[1] })}
      </p>
    </div>
  );
}

type Entry = Parameters<SportUi['describe']>[0];

function describe(entry: Entry, sides: SideView[]): string {
  if (entry.kind === 'LIFECYCLE') return tr(`matches.lifecycle.${entry.action}`);
  const cmd = entry.command;
  if (!cmd) return tr('matches.unknownEvent');
  switch (cmd.type) {
    case 'start_match':
      return tr('carrom.timeline.start', { name: sideName(sides, cmd.firstBreak as number) });
    case 'board': {
      const data = entry.facts.find((f) => f.type === 'board_won')?.data;
      const name = sideName(sides, cmd.winner as number);
      return data
        ? tr(data.queen ? 'carrom.timeline.boardQueen' : 'carrom.timeline.board', {
            name,
            count: data.points as number,
          })
        : tr('carrom.timeline.boardUndone', { name });
    }
    case 'foul':
      return tr('carrom.foulBy', { name: sideName(sides, cmd.side as number) });
    case 'bonus':
      return tr('kabaddi.timeline.technical', {
        name: sideName(sides, cmd.side as number),
        count: cmd.points as number,
      });
    case 'concede':
      return tr(
        `badminton.timeline.concede.${cmd.reason === 'walkover' ? 'walkover' : 'retired'}`,
        {
          name: sideName(sides, cmd.side as number),
        },
      );
    default:
      return cmd.type;
  }
}

function announce(facts: Entry['facts'], sides: SideView[]): string[] {
  return facts.flatMap((f) => {
    const name = sideName(sides, f.data?.side as number);
    if (f.type === 'game_won') return [tr('carrom.announce.game', { name })];
    if (f.type === 'match_won') return [tr('badminton.announce.matchWon', { name })];
    return [];
  });
}

export const carromUi: SportUi = {
  sport: 'carrom',
  Setup,
  defaultSetup: () => {
    const preset = carromPresets[0]!;
    return { presetKey: preset.key, presetVersion: preset.version, config: { ...preset.config } };
  },
  sideSize: (config) => {
    const n = (config as CarromSettings).discipline === 'doubles' ? 2 : 1;
    return { min: n, max: n, initial: n };
  },
  namedSides: false,
  Scoreboard,
  Controls,
  Scorecard,
  describe,
  announce,
  concede: (side, reason) => ({ type: 'concede', side, reason }),
  concedeReasons: ['retired', 'walkover', 'forfeit'],
};
