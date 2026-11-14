/**
 * Deterministic fixture generation (plan M7). The same entries in the same order always give
 * the same fixtures, so a tournament can be regenerated or audited.
 */

export interface PlannedFixture {
  round: number;
  /** Order within the round, from 1. */
  position: number;
  /** Entry IDs, or null for a slot filled later (knockout) — never both null with a bye. */
  side1: string | null;
  side2: string | null;
  /** One side advances without playing. */
  bye: boolean;
  /** Knockout: the fixture and slot (1 or 2) the winner moves to. */
  next: { round: number; position: number; slot: 1 | 2 } | null;
}

/**
 * Round robin by the circle method: every entry meets every other once. With an odd number of
 * entries one rests each round (no fixture is created for a rest).
 */
export function roundRobin(entryIds: readonly string[]): PlannedFixture[] {
  if (entryIds.length < 2) throw new Error('A round robin needs at least two entries');
  const slots: (string | null)[] = [...entryIds];
  if (slots.length % 2 === 1) slots.push(null);
  const n = slots.length;
  const fixtures: PlannedFixture[] = [];
  for (let round = 0; round < n - 1; round++) {
    let position = 0;
    for (let i = 0; i < n / 2; i++) {
      const home = slots[i]!;
      const away = slots[n - 1 - i]!;
      if (home === null || away === null) continue;
      // Alternate who is listed first so sides (and first serve or batting) balance out.
      const [side1, side2] = round % 2 === 0 ? [home, away] : [away, home];
      fixtures.push({
        round: round + 1,
        position: ++position,
        side1,
        side2,
        bye: false,
        next: null,
      });
    }
    // Keep the first slot fixed and rotate the rest one place.
    slots.splice(1, 0, slots.pop()!);
  }
  return fixtures;
}

/** Bracket positions for seeds 1..size, so seeds 1 and 2 can only meet in the final. */
export function seedOrder(size: number): number[] {
  let order = [1];
  while (order.length < size) {
    const next = order.length * 2 + 1;
    order = order.flatMap((seed) => [seed, next - seed]);
  }
  return order;
}

/**
 * Single elimination. Entries are in seed order (best first); the bracket is padded to a
 * power of two and the empty slots become byes for the top seeds.
 */
export function singleElimination(entryIds: readonly string[]): PlannedFixture[] {
  if (entryIds.length < 2) throw new Error('A knockout needs at least two entries');
  let size = 2;
  while (size < entryIds.length) size *= 2;
  const rounds = Math.log2(size);
  const placed = seedOrder(size).map((seed) => entryIds[seed - 1] ?? null);
  const fixtures: PlannedFixture[] = [];
  for (let round = 1; round <= rounds; round++) {
    const count = size / 2 ** round;
    for (let position = 1; position <= count; position++) {
      const next =
        round < rounds
          ? {
              round: round + 1,
              position: Math.ceil(position / 2),
              slot: (position % 2 === 1 ? 1 : 2) as 1 | 2,
            }
          : null;
      if (round === 1) {
        const side1 = placed[(position - 1) * 2]!;
        const side2 = placed[(position - 1) * 2 + 1] ?? null;
        fixtures.push({ round, position, side1, side2, bye: side2 === null, next });
      } else {
        fixtures.push({ round, position, side1: null, side2: null, bye: false, next });
      }
    }
  }
  // Byes advance straight away.
  for (const f of fixtures.filter((x) => x.bye && x.next)) {
    const target = fixtures.find(
      (x) => x.round === f.next!.round && x.position === f.next!.position,
    )!;
    if (f.next!.slot === 1) target.side1 = f.side1;
    else target.side2 = f.side1;
  }
  return fixtures;
}

/** Display name of a knockout round counted from the end: Final, Semi-final, Quarter-final. */
export function roundName(round: number, totalRounds: number): string {
  const fromEnd = totalRounds - round;
  if (fromEnd === 0) return 'Final';
  if (fromEnd === 1) return 'Semi-finals';
  if (fromEnd === 2) return 'Quarter-finals';
  return `Round ${round}`;
}
