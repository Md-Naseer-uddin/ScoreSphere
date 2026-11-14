/**
 * Shootouts shared by the timed team sports (football kicks from the penalty mark, hockey
 * shoot-outs): teams alternate, it ends early once one team can no longer catch up, and
 * after the set number of attempts it goes to sudden death.
 */
export type ShootoutSide = 0 | 1;

export interface ShootoutAttempt {
  side: ShootoutSide;
  scored: boolean;
}

export function shootoutTally(attempts: readonly ShootoutAttempt[]): {
  goals: [number, number];
  taken: [number, number];
} {
  const goals: [number, number] = [0, 0];
  const taken: [number, number] = [0, 0];
  for (const a of attempts) {
    taken[a.side] += 1;
    if (a.scored) goals[a.side] += 1;
  }
  return { goals, taken };
}

/** The side to take the next attempt: teams alternate, starting with `firstSide`. */
export function shootoutNext(firstSide: ShootoutSide, attempts: number): ShootoutSide {
  return attempts % 2 === 0 ? firstSide : firstSide === 0 ? 1 : 0;
}

/** The winner once the shootout is decided, or null while it goes on. */
export function shootoutWinner(
  attemptsEach: number,
  attempts: readonly ShootoutAttempt[],
): ShootoutSide | null {
  const { goals, taken } = shootoutTally(attempts);
  if (taken[0] <= attemptsEach && taken[1] <= attemptsEach) {
    if (goals[0] + (attemptsEach - taken[0]) < goals[1]) return 1;
    if (goals[1] + (attemptsEach - taken[1]) < goals[0]) return 0;
    if (taken[0] < attemptsEach || taken[1] < attemptsEach) return null;
  }
  // Sudden death: decided after both have taken the same number of attempts.
  if (taken[0] === taken[1] && goals[0] !== goals[1]) return goals[0] > goals[1] ? 0 : 1;
  return null;
}
