/**
 * League standings (plan M7). Pure: the same results always give the same table.
 * Each sport supplies the per-match totals its tie-breaks need (e.g. cricket's runs and overs
 * for net run rate); the order of tie-breaks is part of the tournament's settings.
 */

export interface StandingsPoints {
  win: number;
  draw: number;
  loss: number;
}

/** One completed fixture: who played, who won (null for a draw), and sport totals per side. */
export interface FixtureResult {
  side1: string;
  side2: string;
  winner: string | null;
  totals: [Record<string, number>, Record<string, number>];
}

export interface StandingsRow {
  entryId: string;
  played: number;
  won: number;
  drawn: number;
  lost: number;
  points: number;
  /** Summed sport totals, e.g. `runsFor`, `gamesAgainst`. */
  totals: Record<string, number>;
  /** The value of each tie-break, for display. */
  tieBreaks: Record<string, number>;
  rank: number;
}

export interface TieBreakDefinition {
  key: string;
  label: string;
  /** Larger is better. */
  value: (row: StandingsRow, context: { rows: StandingsRow[]; results: FixtureResult[] }) => number;
}

const sum = (rows: Record<string, number>, key: string) => rows[key] ?? 0;

/** Ratio that treats x/0 as very large (nothing conceded), and 0/0 as neutral. */
export function ratio(a: number, b: number): number {
  if (b === 0) return a === 0 ? 1 : Number.MAX_SAFE_INTEGER;
  return a / b;
}

export const TIE_BREAKS: Record<string, TieBreakDefinition> = {
  wins: { key: 'wins', label: 'Wins', value: (r) => r.won },
  net_run_rate: {
    key: 'net_run_rate',
    label: 'Net run rate',
    // ICC: a side bowled out counts its full quota of overs (the sport totals already do).
    value: (r) => {
      const t = r.totals;
      const forRate = sum(t, 'ballsFaced') ? (sum(t, 'runsFor') * 6) / sum(t, 'ballsFaced') : 0;
      const againstRate = sum(t, 'ballsBowled')
        ? (sum(t, 'runsAgainst') * 6) / sum(t, 'ballsBowled')
        : 0;
      return Math.round((forRate - againstRate) * 1000) / 1000;
    },
  },
  game_difference: {
    key: 'game_difference',
    label: 'Game difference',
    value: (r) => sum(r.totals, 'gamesFor') - sum(r.totals, 'gamesAgainst'),
  },
  goal_difference: {
    key: 'goal_difference',
    label: 'Goal difference',
    value: (r) => sum(r.totals, 'goalsFor') - sum(r.totals, 'goalsAgainst'),
  },
  goals_for: {
    key: 'goals_for',
    label: 'Goals scored',
    value: (r) => sum(r.totals, 'goalsFor'),
  },
  set_difference: {
    key: 'set_difference',
    label: 'Set difference',
    value: (r) => sum(r.totals, 'setsFor') - sum(r.totals, 'setsAgainst'),
  },
  point_difference: {
    key: 'point_difference',
    label: 'Point difference',
    value: (r) => sum(r.totals, 'pointsFor') - sum(r.totals, 'pointsAgainst'),
  },
  set_ratio: {
    key: 'set_ratio',
    label: 'Set ratio',
    value: (r) => ratio(sum(r.totals, 'setsFor'), sum(r.totals, 'setsAgainst')),
  },
  point_ratio: {
    key: 'point_ratio',
    label: 'Point ratio',
    value: (r) => ratio(sum(r.totals, 'pointsFor'), sum(r.totals, 'pointsAgainst')),
  },
  sonneborn_berger: {
    key: 'sonneborn_berger',
    label: 'Sonneborn-Berger',
    // Sum of the scores of opponents beaten, plus half the scores of opponents drawn with.
    value: (r, { rows, results }) => {
      const score = (id: string) => rows.find((x) => x.entryId === id)?.points ?? 0;
      let total = 0;
      for (const f of results) {
        if (f.side1 !== r.entryId && f.side2 !== r.entryId) continue;
        const opponent = f.side1 === r.entryId ? f.side2 : f.side1;
        if (f.winner === r.entryId) total += score(opponent);
        else if (f.winner === null) total += score(opponent) / 2;
      }
      return total;
    },
  },
};

/** Points from the matches between the tied entries only. */
function headToHead(
  group: StandingsRow[],
  results: FixtureResult[],
  points: StandingsPoints,
): Map<string, number> {
  const ids = new Set(group.map((r) => r.entryId));
  const table = new Map(group.map((r) => [r.entryId, 0]));
  for (const f of results) {
    if (!ids.has(f.side1) || !ids.has(f.side2)) continue;
    if (f.winner === null) {
      table.set(f.side1, table.get(f.side1)! + points.draw);
      table.set(f.side2, table.get(f.side2)! + points.draw);
    } else {
      const loser = f.winner === f.side1 ? f.side2 : f.side1;
      table.set(f.winner, table.get(f.winner)! + points.win);
      table.set(loser, table.get(loser)! + points.loss);
    }
  }
  return table;
}

/**
 * The table: points first, then each tie-break in order, then head-to-head among whoever is
 * still level, then entry order (seeding) so the result is always deterministic.
 */
export function computeStandings(
  entryIds: readonly string[],
  results: readonly FixtureResult[],
  points: StandingsPoints,
  tieBreakKeys: readonly string[],
): StandingsRow[] {
  const rows = new Map<string, StandingsRow>(
    entryIds.map((entryId) => [
      entryId,
      {
        entryId,
        played: 0,
        won: 0,
        drawn: 0,
        lost: 0,
        points: 0,
        totals: {},
        tieBreaks: {},
        rank: 0,
      },
    ]),
  );
  for (const f of results) {
    ([f.side1, f.side2] as const).forEach((id, i) => {
      const row = rows.get(id);
      if (!row) return;
      row.played++;
      if (f.winner === null) {
        row.drawn++;
        row.points += points.draw;
      } else if (f.winner === id) {
        row.won++;
        row.points += points.win;
      } else {
        row.lost++;
        row.points += points.loss;
      }
      for (const [key, value] of Object.entries(f.totals[i]!))
        row.totals[key] = (row.totals[key] ?? 0) + value;
    });
  }
  const list = [...rows.values()];
  const context = { rows: list, results: [...results] };
  const breaks = tieBreakKeys
    .map((k) => TIE_BREAKS[k])
    .filter((t): t is TieBreakDefinition => Boolean(t));
  for (const row of list) for (const t of breaks) row.tieBreaks[t.key] = t.value(row, context);

  const seed = new Map(entryIds.map((id, i) => [id, i]));
  const compare = (a: StandingsRow, b: StandingsRow) => {
    if (b.points !== a.points) return b.points - a.points;
    for (const t of breaks) {
      const diff = b.tieBreaks[t.key]! - a.tieBreaks[t.key]!;
      if (diff !== 0) return diff;
    }
    return 0;
  };
  list.sort((a, b) => compare(a, b) || seed.get(a.entryId)! - seed.get(b.entryId)!);

  // Head-to-head settles groups still level after every other tie-break.
  for (let i = 0; i < list.length;) {
    let j = i + 1;
    while (j < list.length && compare(list[i]!, list[j]!) === 0) j++;
    if (j - i > 1) {
      const group = list.slice(i, j);
      const h2h = headToHead(group, [...results], points);
      group.sort(
        (a, b) =>
          h2h.get(b.entryId)! - h2h.get(a.entryId)! || seed.get(a.entryId)! - seed.get(b.entryId)!,
      );
      list.splice(i, j - i, ...group);
    }
    i = j;
  }
  list.forEach((row, i) => {
    row.rank = i + 1;
  });
  return list;
}
