import type { SportKey } from '@scoresphere/contracts';

/** Where a rule summary comes from (spec sports §7). Never label a casual preset official. */
export interface RulesSource {
  name: string;
  url: string;
  edition: string;
  effectiveFrom?: string;
  effectiveUntil?: string;
  lastReviewed: string;
}

/** In-app rules help, bundled with the client so it works offline (ADR 0015). */
export interface RulesContent {
  sport: SportKey;
  summary: string;
  sources: RulesSource[];
  sections: { title: string; points: string[] }[];
}
