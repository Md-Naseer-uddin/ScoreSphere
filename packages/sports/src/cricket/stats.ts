import type { MetricRecord } from '@scoresphere/engine-kit';
import type { CricketState } from './engine.js';

/**
 * Per-player and per-side statistics for the main innings. Super-over runs and wickets
 * are left out, as in official records.
 */
export function cricketStats(state: CricketState): MetricRecord[] {
  const records: MetricRecord[] = [];
  const add = (metric: string, value: number, side: number, participantId?: string) =>
    records.push({ metric, value, side, ...(participantId ? { participantId } : {}) });
  const fielding = new Map<string, { catches: number; stumpings: number; runOuts: number }>();

  for (const inn of state.innings.filter((i) => !i.superOver)) {
    add('runs', inn.runs, inn.battingSide);
    add('wickets_lost', inn.wickets, inn.battingSide);
    add('legal_balls', inn.legalBalls, inn.battingSide);
    const e = inn.extras;
    add('extras', e.wides + e.noBalls + e.byes + e.legByes + e.penalties, inn.bowlingSide);
    for (const id of inn.battingOrder) {
      const b = inn.batters[id]!;
      add('runs', b.runs, inn.battingSide, id);
      add('balls_faced', b.balls, inn.battingSide, id);
      add('fours', b.fours, inn.battingSide, id);
      add('sixes', b.sixes, inn.battingSide, id);
      add('dismissed', b.status === 'out' ? 1 : 0, inn.battingSide, id);
      const fielder = b.dismissal?.fielderId;
      if (fielder && b.dismissal) {
        const f = fielding.get(fielder) ?? { catches: 0, stumpings: 0, runOuts: 0 };
        if (b.dismissal.kind === 'caught' || b.dismissal.kind === 'one_tip_one_hand')
          f.catches += 1;
        if (b.dismissal.kind === 'stumped') f.stumpings += 1;
        if (b.dismissal.kind === 'run_out') f.runOuts += 1;
        fielding.set(fielder, f);
      }
    }
    for (const id of inn.bowlingOrder) {
      const w = inn.bowlers[id]!;
      add('balls_bowled', w.legalBalls, inn.bowlingSide, id);
      add('runs_conceded', w.runs, inn.bowlingSide, id);
      add('wickets', w.wickets, inn.bowlingSide, id);
      add('maidens', w.maidens, inn.bowlingSide, id);
      add('wides', w.wides, inn.bowlingSide, id);
      add('no_balls', w.noBalls, inn.bowlingSide, id);
    }
  }
  for (const [id, f] of fielding) {
    const side = state.players[0].includes(id) ? 0 : 1;
    add('catches', f.catches, side, id);
    add('stumpings', f.stumpings, side, id);
    add('run_outs', f.runOuts, side, id);
  }
  return records;
}

/** Sums a metric for one player across records. */
export function playerMetric(
  records: readonly MetricRecord[],
  participantId: string,
  metric: string,
): number {
  return records
    .filter((r) => r.participantId === participantId && r.metric === metric)
    .reduce((sum, r) => sum + r.value, 0);
}
