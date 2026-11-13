/**
 * A clock measured in device time (ADR 0006). The scoring device's timestamps are the
 * authority; anything shown on screen is derived from the clock and "now", so a reload,
 * a locked screen or a killed app never loses time.
 */
export interface Clock {
  /** Time counted while stopped, ms. */
  elapsedMs: number;
  /** Device time the clock last started, or null when stopped. */
  runningSince: number | null;
}

export const newClock = (): Clock => ({ elapsedMs: 0, runningSince: null });

export function startClock(clock: Clock, at: number): Clock {
  return clock.runningSince === null ? { ...clock, runningSince: at } : clock;
}

export function stopClock(clock: Clock, at: number): Clock {
  if (clock.runningSince === null) return clock;
  // A device clock that moved backwards adds nothing rather than going negative.
  return { elapsedMs: clock.elapsedMs + Math.max(0, at - clock.runningSince), runningSince: null };
}

/** Elapsed time at `now`, including the current run. */
export function clockElapsed(clock: Clock, now: number): number {
  return (
    clock.elapsedMs + (clock.runningSince === null ? 0 : Math.max(0, now - clock.runningSince))
  );
}

/** "m:ss" (or "h:mm:ss"), rounding down to whole seconds; negative values show as 0:00. */
export function formatClock(ms: number): string {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = String(total % 60).padStart(2, '0');
  return h > 0 ? `${h}:${String(m).padStart(2, '0')}:${s}` : `${m}:${s}`;
}
