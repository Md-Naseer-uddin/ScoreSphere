import type { MetricRecord } from './engine.js';

/** Who an award goes to. Doubles partners or a whole side can share one award. */
export interface AwardRecipient {
  participantId: string;
  side: number;
}

export interface AwardOutcome {
  recipients: AwardRecipient[];
  /** Metric snapshot shown next to the award, so users can see why (spec scoring §5). */
  metrics: Record<string, number>;
}

/**
 * An award definition is versioned code (ADR 0015). `compute` returns null when the award
 * does not apply (e.g. a walkover); the organizer can still select a recipient manually.
 */
export interface MatchAwardDefinition<State> {
  key: string;
  name: string;
  criteriaVersion: number;
  /** Plain-language criteria, including how ties are settled. */
  criteria: string;
  compute(state: State, stats: readonly MetricRecord[]): AwardOutcome | null;
}
