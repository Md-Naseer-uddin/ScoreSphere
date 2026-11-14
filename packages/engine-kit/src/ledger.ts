import {
  createdPayloadSchema,
  lifecyclePayloadSchema,
  type CreatedPayload,
  type LifecycleAction,
  type MatchEventKind,
  type MatchStatus,
} from '@scoresphere/contracts';
import type { DomainFact, EngineError, SportEngine } from './engine.js';
import { RULE_LIMITS, ruleMatches, rulesFor, validateRules } from './rules.js';
import { err, ok, type Result } from './result.js';

/**
 * The match ledger (ADRs 0005, 0006).
 *
 * State is a fold over the non-voided events. Engines only ever move forward; undo is a
 * `VOID` of an earlier event, and a correction is a `REPLACE` of an earlier command. Both
 * are appended, never edited in place, and the whole timeline is re-validated after them.
 */

/** The parts of a ledger event the fold needs (a subset of the sync envelope). */
export interface LedgerEvent {
  seq: number;
  kind: MatchEventKind;
  payload: unknown;
  targetSeq?: number | null;
  occurredAt: number;
}

export type LedgerErrorCode =
  | 'NOT_CREATED'
  | 'SEQ_ORDER'
  | 'BAD_PAYLOAD'
  | 'SPORT_MISMATCH'
  | 'BAD_TARGET'
  | 'NOT_LIVE'
  | 'BAD_TRANSITION'
  | 'ENGINE_REJECTED'
  | 'CORRECTION_INVALIDATES';

export interface LedgerError {
  code: LedgerErrorCode;
  message: string;
  /** The event that could not be accepted. */
  seq: number;
  /** For `CORRECTION_INVALIDATES`: the later event the correction would break. */
  blockedSeq?: number;
  /** The engine's own code when `code` is `ENGINE_REJECTED`. */
  engineCode?: string;
}

/** One scoring or lifecycle event as it reads after corrections. */
export interface TimelineEntry<Command> {
  /** For a rule's effect, the seq of the event that triggered it. */
  seq: number;
  kind: 'COMMAND' | 'LIFECYCLE' | 'DERIVED';
  occurredAt: number;
  /** The command in effect, after any `REPLACE`. */
  command?: Command;
  /** The command as first recorded, when it was replaced. */
  original?: Command;
  action?: LifecycleAction;
  voidedBy?: number;
  replacedBy?: number;
  facts: DomainFact[];
  /** Lenient replays only: why this event was skipped. */
  invalid?: LedgerError;
  /** Effects of the match's rules on this event, in the order they happened. */
  derived?: TimelineEntry<Command>[];
  /** For `DERIVED` entries: the rule that produced this effect (D16b). */
  ruleId?: string;
  ruleName?: string;
}

export interface MatchProjection<State, Config, Command> {
  /** Highest `seq` folded. */
  version: number;
  created: Omit<CreatedPayload, 'config'> & { config: Config };
  status: MatchStatus;
  state: State;
  startedAt: number | null;
  endedAt: number | null;
  /** Live time before `liveSince`; add `now - liveSince` while the match is live. */
  playingMs: number;
  liveSince: number | null;
  timeline: TimelineEntry<Command>[];
  /** Lenient replays only: events the engine disagreed with (ADR 0009). */
  invalid: LedgerError[];
}

export interface ReplayOptions {
  /**
   * Skip events that fail validation instead of stopping. The server uses this so a
   * disagreement flags the match for review instead of losing what happened (ADR 0009).
   */
  lenient?: boolean;
}

type AnyEngine<S, C, Cmd extends { type: string }> = SportEngine<S, C, Cmd>;

const LIFECYCLE_FROM: Record<LifecycleAction, readonly MatchStatus[]> = {
  START: ['scheduled'],
  PAUSE: ['live'],
  RESUME: ['paused'],
  ABANDON: ['scheduled', 'live', 'paused'],
};

const failure = (code: LedgerErrorCode, seq: number, message: string): LedgerError => ({
  code,
  seq,
  message,
});

function parseCreated<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  event: LedgerEvent | undefined,
): Result<MatchProjection<S, C, Cmd>, LedgerError> {
  if (!event || event.seq !== 1 || event.kind !== 'CREATED') {
    return err(failure('NOT_CREATED', event?.seq ?? 1, 'A match ledger starts with CREATED.'));
  }
  const created = createdPayloadSchema.safeParse(event.payload);
  if (!created.success) return err(failure('BAD_PAYLOAD', 1, 'The match setup is invalid.'));
  if (created.data.sport !== engine.sport) {
    return err(failure('SPORT_MISMATCH', 1, `This ledger is for ${created.data.sport}.`));
  }
  const config = engine.settingsSchema.safeParse(created.data.config);
  if (!config.success) return err(failure('BAD_PAYLOAD', 1, 'The match settings are invalid.'));
  const setup = engine.validateSetup(config.data, created.data.roster);
  if (!setup.ok) return err(engineRejected(1, setup.error));
  const rules = created.data.rules ?? [];
  if (rules.length) {
    const problems = engine.ruleCatalogue
      ? validateRules(engine.ruleCatalogue, rules)
      : [{ message: 'This sport has no custom rules.' }];
    if (problems.length)
      return err(
        failure('BAD_PAYLOAD', 1, `The match's rules are invalid: ${problems[0]!.message}`),
      );
  }
  const state = engine.init(config.data, created.data.roster);
  return ok({
    version: 1,
    created: { ...created.data, config: config.data },
    status: 'scheduled',
    state,
    startedAt: null,
    endedAt: null,
    playingMs: 0,
    liveSince: null,
    timeline: [],
    invalid: [],
  });
}

function closeLiveInterval<S, C, Cmd>(p: MatchProjection<S, C, Cmd>, at: number): void {
  if (p.liveSince !== null) {
    // The scoring device owns time; a clock moved backwards adds nothing rather than going negative.
    p.playingMs += Math.max(0, at - p.liveSince);
    p.liveSince = null;
  }
}

/** Applies one base event to a mutable projection. Returns an error instead of applying it. */
function step<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  p: MatchProjection<S, C, Cmd>,
  event: LedgerEvent,
  replacement: { seq: number; command: Cmd } | undefined,
): LedgerError | TimelineEntry<Cmd> {
  if (event.kind === 'LIFECYCLE') {
    const parsed = lifecyclePayloadSchema.safeParse(event.payload);
    if (!parsed.success) return failure('BAD_PAYLOAD', event.seq, 'Unknown match action.');
    const { action } = parsed.data;
    if (!LIFECYCLE_FROM[action].includes(p.status)) {
      return failure(
        'BAD_TRANSITION',
        event.seq,
        `Cannot ${action.toLowerCase()} a ${p.status} match.`,
      );
    }
    switch (action) {
      case 'START':
        p.status = 'live';
        p.startedAt ??= event.occurredAt;
        p.liveSince = event.occurredAt;
        break;
      case 'PAUSE':
        closeLiveInterval(p, event.occurredAt);
        p.status = 'paused';
        break;
      case 'RESUME':
        p.status = 'live';
        p.liveSince = event.occurredAt;
        break;
      case 'ABANDON':
        closeLiveInterval(p, event.occurredAt);
        p.status = 'abandoned';
        p.endedAt = event.occurredAt;
        break;
    }
    if (engine.onLifecycle)
      p.state = engine.onLifecycle(p.state, action, { occurredAt: event.occurredAt });
    return { seq: event.seq, kind: 'LIFECYCLE', occurredAt: event.occurredAt, action, facts: [] };
  }

  const original = engine.commandSchema.safeParse(event.payload);
  if (!original.success) return failure('BAD_PAYLOAD', event.seq, 'The scoring action is invalid.');
  const command = replacement?.command ?? original.data;
  if (p.status !== 'live') {
    return failure('NOT_LIVE', event.seq, `Scoring needs a live match; this one is ${p.status}.`);
  }
  const valid = engine.validate(p.state, command, { occurredAt: event.occurredAt });
  if (!valid.ok) return engineRejected(event.seq, valid.error);
  const next = engine.apply(p.state, command, { occurredAt: event.occurredAt });
  p.state = next.state;
  const derived = fireRules(engine, p, next.facts, event);
  if (engine.isComplete(p.state)) {
    closeLiveInterval(p, event.occurredAt);
    p.status = 'completed';
    p.endedAt = event.occurredAt;
  }
  return {
    seq: event.seq,
    kind: 'COMMAND',
    occurredAt: event.occurredAt,
    command,
    ...(replacement ? { original: original.data, replacedBy: replacement.seq } : {}),
    facts: next.facts,
    ...(derived.length ? { derived } : {}),
  };
}

/**
 * Runs the match's rules on the facts an event produced (D16b). Effects go through the
 * engine like any command and are recorded as derived timeline entries; they are computed
 * here on every replay, never stored, so undo and corrections apply to them too (ADR 0032).
 * A rule fires at most once per event, and chains stop at the depth and count limits.
 */
function fireRules<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  p: MatchProjection<S, C, Cmd>,
  facts: DomainFact[],
  event: LedgerEvent,
): TimelineEntry<Cmd>[] {
  const rules = p.created.rules ?? [];
  if (!rules.length) return [];
  const derived: TimelineEntry<Cmd>[] = [];
  const fired = new Set<string>();
  const ctx = { occurredAt: event.occurredAt };
  const queue = facts.map((fact) => ({ fact, depth: 1 }));
  while (queue.length && derived.length < RULE_LIMITS.maxEffectsPerEvent) {
    const { fact, depth } = queue.shift()!;
    for (const rule of rulesFor(rules, fact.type)) {
      if (fired.has(rule.id)) continue;
      if (!ruleMatches(rule, fact, engine.ruleVariables?.(p.state) ?? {})) continue;
      fired.add(rule.id);
      for (const action of rule.actions) {
        if (derived.length >= RULE_LIMITS.maxEffectsPerEvent) break;
        const base = {
          seq: event.seq,
          kind: 'DERIVED' as const,
          occurredAt: event.occurredAt,
          ruleId: rule.id,
          ruleName: rule.name,
        };
        const parsed = engine.commandSchema.safeParse({ ...action.params, type: action.command });
        if (!parsed.success) {
          derived.push({
            ...base,
            facts: [],
            invalid: failure(
              'BAD_PAYLOAD',
              event.seq,
              `Rule "${rule.name}" has an invalid action.`,
            ),
          });
          continue;
        }
        const valid = engine.validate(p.state, parsed.data, ctx);
        if (!valid.ok) {
          derived.push({
            ...base,
            command: parsed.data,
            facts: [],
            invalid: engineRejected(event.seq, valid.error),
          });
          continue;
        }
        const effect = engine.apply(p.state, parsed.data, ctx);
        p.state = effect.state;
        derived.push({ ...base, command: parsed.data, facts: effect.facts });
        if (depth < RULE_LIMITS.maxDepth)
          for (const f of effect.facts) queue.push({ fact: f, depth: depth + 1 });
      }
    }
  }
  return derived;
}

function engineRejected(seq: number, error: EngineError): LedgerError {
  return { code: 'ENGINE_REJECTED', seq, message: error.message, engineCode: error.code };
}

const isEntry = <Cmd>(x: LedgerError | TimelineEntry<Cmd>): x is TimelineEntry<Cmd> => 'facts' in x;

/**
 * Folds a full ledger into a projection. In strict mode (the default, used by the scoring
 * device) the first invalid event stops the fold. In lenient mode only a structurally
 * broken ledger (no CREATED, gaps in `seq`, bad settings) fails.
 */
export function replay<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  events: readonly LedgerEvent[],
  options: ReplayOptions = {},
): Result<MatchProjection<S, C, Cmd>, LedgerError> {
  const ordered = [...events].sort((a, b) => a.seq - b.seq);
  for (let i = 0; i < ordered.length; i++) {
    if (ordered[i]!.seq !== i + 1) {
      return err(failure('SEQ_ORDER', ordered[i]!.seq, `Expected event ${i + 1}.`));
    }
  }
  const init = parseCreated(engine, ordered[0]);
  if (!init.ok) return init;
  const p = init.value;
  p.version = ordered.length;

  // Pass 1: resolve corrections, in the order they were recorded.
  const bySeq = new Map(ordered.map((e) => [e.seq, e]));
  const voidedBy = new Map<number, number>();
  const replaced = new Map<number, { seq: number; command: Cmd }>();
  for (const e of ordered) {
    if (e.kind !== 'VOID' && e.kind !== 'REPLACE') continue;
    const problem = checkCorrection(engine, e, bySeq, voidedBy);
    if (typeof problem === 'string') {
      const error = failure('BAD_TARGET', e.seq, problem);
      if (!options.lenient) return err(error);
      p.invalid.push(error);
      continue;
    }
    if (e.kind === 'VOID') voidedBy.set(e.targetSeq!, e.seq);
    else replaced.set(e.targetSeq!, { seq: e.seq, command: problem.command! });
  }

  // Pass 2: fold the base events in order.
  for (const e of ordered) {
    if (e.kind !== 'COMMAND' && e.kind !== 'LIFECYCLE') continue;
    const voider = voidedBy.get(e.seq);
    if (voider !== undefined) {
      p.timeline.push(voidedEntry(engine, e, voider));
      continue;
    }
    const result = step(engine, p, e, replaced.get(e.seq));
    if (isEntry(result)) {
      p.timeline.push(result);
    } else if (options.lenient) {
      p.invalid.push(result);
      p.timeline.push({ ...voidedEntry(engine, e, undefined), invalid: result });
    } else {
      return err(result);
    }
  }
  return ok(p);
}

function voidedEntry<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  e: LedgerEvent,
  voidedBy: number | undefined,
): TimelineEntry<Cmd> {
  const entry: TimelineEntry<Cmd> = {
    seq: e.seq,
    kind: e.kind === 'LIFECYCLE' ? 'LIFECYCLE' : 'COMMAND',
    occurredAt: e.occurredAt,
    facts: [],
    ...(voidedBy !== undefined ? { voidedBy } : {}),
  };
  if (e.kind === 'LIFECYCLE') {
    const parsed = lifecyclePayloadSchema.safeParse(e.payload);
    if (parsed.success) entry.action = parsed.data.action;
  } else {
    const parsed = engine.commandSchema.safeParse(e.payload);
    if (parsed.success) entry.command = parsed.data;
  }
  return entry;
}

function checkCorrection<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  e: LedgerEvent,
  bySeq: Map<number, LedgerEvent>,
  voidedBy: Map<number, number>,
): string | { command?: Cmd } {
  const targetSeq = e.targetSeq;
  if (targetSeq == null || targetSeq >= e.seq)
    return 'A correction must point at an earlier event.';
  const target = bySeq.get(targetSeq);
  if (!target) return 'The corrected event does not exist.';
  if (voidedBy.has(targetSeq)) return 'That event was already undone.';
  if (e.kind === 'VOID') {
    if (target.kind !== 'COMMAND' && target.kind !== 'LIFECYCLE') {
      return 'Only scoring and match actions can be undone.';
    }
    return {};
  }
  if (target.kind !== 'COMMAND') return 'Only scoring actions can be corrected.';
  const command = engine.commandSchema.safeParse(e.payload);
  if (!command.success) return 'The corrected action is invalid.';
  return { command: command.data };
}

/**
 * Validates `event` against the ledger and returns the new projection. Scoring and
 * lifecycle events extend `current` directly; corrections replay the whole ledger, and
 * are refused when a later event would no longer be valid (ADR 0005).
 */
export function append<S, C, Cmd extends { type: string }>(
  engine: AnyEngine<S, C, Cmd>,
  current: MatchProjection<S, C, Cmd>,
  events: readonly LedgerEvent[],
  event: LedgerEvent,
): Result<MatchProjection<S, C, Cmd>, LedgerError> {
  if (event.seq !== current.version + 1) {
    return err(failure('SEQ_ORDER', event.seq, `Expected event ${current.version + 1}.`));
  }
  if (event.kind === 'CREATED') {
    return err(failure('NOT_CREATED', event.seq, 'A match is created only once.'));
  }
  if (event.kind === 'COMMAND' || event.kind === 'LIFECYCLE') {
    const next: MatchProjection<S, C, Cmd> = { ...current, timeline: [...current.timeline] };
    const result = step(engine, next, event, undefined);
    if (!isEntry(result)) return err(result);
    next.timeline.push(result);
    next.version = event.seq;
    return ok(next);
  }
  const replayed = replay(engine, [...events, event]);
  if (replayed.ok) return replayed;
  const error = replayed.error;
  if (error.seq === event.seq) return replayed;
  return err({
    code: 'CORRECTION_INVALIDATES',
    seq: event.seq,
    blockedSeq: error.seq,
    message: `This correction would make event ${error.seq} invalid: ${error.message}`,
  });
}

/** The most recent event an "Undo" button would void, if any. */
export function undoTarget<Cmd>(timeline: readonly TimelineEntry<Cmd>[]): number | null {
  for (let i = timeline.length - 1; i >= 0; i--) {
    const entry = timeline[i]!;
    if (entry.voidedBy === undefined && !entry.invalid) return entry.seq;
  }
  return null;
}

/** Live playing time at `now`, for clocks that tick on screen. */
export function playingTimeAt(
  p: { playingMs: number; liveSince: number | null },
  now: number,
): number {
  return p.playingMs + (p.liveSince === null ? 0 : Math.max(0, now - p.liveSince));
}
