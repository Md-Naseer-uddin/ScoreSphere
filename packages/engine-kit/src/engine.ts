import type { MatchResult, MatchRoster, SportKey } from '@scoresphere/contracts';
import type { z } from 'zod';
import type { Result } from './result.js';

export type { MatchResult, MatchRoster };

/** Why the engine refused a command. `code` is stable; `message` is for the scorer. */
export interface EngineError {
  code: string;
  message: string;
}

/** Describes one command the scoring UI can offer right now (drives sport-specific screens). */
export interface CommandDescriptor {
  type: string;
  label: string;
  /** Zod schema for the command payload, used to build inputs and validate. */
  payload?: z.ZodType;
}

/** Something that happened as a consequence of a command; rule triggers listen for these (ADR 0016). */
export interface DomainFact {
  type: string;
  data?: Record<string, unknown>;
}

export interface ApplyContext {
  /** Device-measured time of the command in epoch ms (ADR 0006). */
  occurredAt: number;
}

/** One statistic for one participant or side, keyed by a sport-specific metric (spec scoring §6). */
export interface MetricRecord {
  metric: string;
  value: number;
  unit?: string;
  participantId?: string;
  side?: number;
}

export interface Preset<Config> {
  key: string;
  version: number;
  name: string;
  category: 'official' | 'casual' | 'local';
  config: Config;
}

/**
 * The contract every sport engine implements (plan §3.3).
 * Engines are pure and forward-only: undo, corrections, lifecycle and
 * replay are handled by the ledger in engine-kit (ADR 0005).
 * `apply` must not mutate its input state, and must depend only on its arguments.
 */
export interface SportEngine<State, Config, Command extends { type: string }> {
  readonly sport: SportKey;
  readonly version: number;
  readonly settingsSchema: z.ZodType<Config>;
  /** Validates command payloads from the ledger before `validate` sees them. */
  readonly commandSchema: z.ZodType<Command>;
  readonly presets: readonly Preset<Config>[];
  init(config: Config, roster: MatchRoster): State;
  commands(state: State): CommandDescriptor[];
  validate(state: State, command: Command): Result<void, EngineError>;
  apply(state: State, command: Command, ctx: ApplyContext): { state: State; facts: DomainFact[] };
  isComplete(state: State): boolean;
  result(state: State): MatchResult;
  stats(state: State): MetricRecord[];
}
