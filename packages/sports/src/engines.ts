import type { SportKey } from '@scoresphere/contracts';
import type { SportEngine } from '@scoresphere/engine-kit';
import { badmintonEngine } from './badminton/engine.js';
import { chessEngine } from './chess/engine.js';
import { cricketEngine } from './cricket/engine.js';
import { footballEngine } from './football/engine.js';
import { tennisEngine } from './tennis/engine.js';
import { volleyballEngine } from './volleyball/engine.js';

/**
 * Engines are frozen once released: a new rule changes the version (`badminton@2`) and
 * both stay registered, because every match is pinned to the version it started on
 * (ADR 0019).
 */
// The registry erases each engine's own types; callers that need them import the engine.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type AnySportEngine = SportEngine<any, any, any>;

const registry: readonly AnySportEngine[] = [
  badmintonEngine,
  chessEngine,
  cricketEngine,
  footballEngine,
  tennisEngine,
  volleyballEngine,
];

export function getEngine(sport: SportKey, version: number): AnySportEngine | undefined {
  return registry.find((e) => e.sport === sport && e.version === version);
}

/** The version new matches start on, or undefined while the sport has no engine yet. */
export function latestEngine(sport: SportKey): AnySportEngine | undefined {
  return registry
    .filter((e) => e.sport === sport)
    .reduce<AnySportEngine | undefined>(
      (best, e) => (!best || e.version > best.version ? e : best),
      undefined,
    );
}

export function isScorable(sport: SportKey): boolean {
  return latestEngine(sport) !== undefined;
}
