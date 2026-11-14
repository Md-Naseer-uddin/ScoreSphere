import type { RuleCatalogue } from '@scoresphere/engine-kit';
import type { CricketState } from './engine.js';
import { DELIVERY_KINDS, DISMISSALS } from './kinds.js';

/**
 * What custom cricket rules can use (plan D16b). Triggers are facts the engine emits,
 * variables read the innings in progress, and actions are engine commands, so a rule
 * can add penalty runs but can never edit a scorecard directly.
 */
export const cricketRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'ball',
      label: 'A ball is bowled',
      fields: [
        { key: 'kind', label: 'Kind of ball', type: 'string', options: DELIVERY_KINDS },
        { key: 'runs', label: 'Runs from the ball', type: 'number', min: 0, max: 20 },
        { key: 'legal', label: 'Legal ball', type: 'boolean' },
      ],
    },
    { fact: 'four', label: 'A four is hit', fields: [] },
    { fact: 'six', label: 'A six is hit', fields: [] },
    {
      fact: 'wicket',
      label: 'A wicket falls',
      fields: [
        {
          key: 'kind',
          label: 'How out',
          type: 'string',
          options: [...DISMISSALS, 'six_and_out', 'retired_out'],
        },
        { key: 'credited', label: 'Credited to the bowler', type: 'boolean' },
      ],
    },
    {
      fact: 'over_complete',
      label: 'An over ends',
      fields: [{ key: 'over', label: 'Over number', type: 'number', min: 1, max: 100 }],
    },
    {
      fact: 'penalty_runs',
      label: 'Penalty runs are given',
      fields: [{ key: 'runs', label: 'Penalty runs', type: 'number', min: 1, max: 10 }],
    },
  ],
  variables: [
    { key: 'consecutive_wides', label: 'Wides in a row', type: 'number', min: 0, max: 50 },
    { key: 'innings_runs', label: 'Innings runs', type: 'number', min: 0 },
    { key: 'innings_wickets', label: 'Wickets down', type: 'number', min: 0, max: 20 },
    { key: 'legal_balls', label: 'Legal balls bowled', type: 'number', min: 0 },
    { key: 'innings_number', label: 'Innings number', type: 'number', min: 1, max: 20 },
    { key: 'super_over', label: 'In a super over', type: 'boolean' },
    { key: 'free_hit', label: 'Next ball is a free hit', type: 'boolean' },
    { key: 'striker_runs', label: "Striker's runs", type: 'number', min: 0 },
  ],
  commands: [
    {
      type: 'penalty_runs',
      label: 'Give penalty runs to the batting side',
      params: [{ key: 'runs', label: 'Runs', type: 'number', min: 1, max: 10 }],
    },
    { type: 'reset_wide_count', label: 'Start counting wides in a row again', params: [] },
  ],
};

export function cricketRuleVariables(state: CricketState): Record<string, number | boolean> {
  const inn = state.innings.at(-1);
  const striker = inn?.atStrikerEnd ? inn.batters[inn.atStrikerEnd] : undefined;
  return {
    consecutive_wides: inn?.consecutiveWides ?? 0,
    innings_runs: inn?.runs ?? 0,
    innings_wickets: inn?.wickets ?? 0,
    legal_balls: inn?.legalBalls ?? 0,
    innings_number: inn?.number ?? 0,
    super_over: inn?.superOver ?? false,
    free_hit: inn?.freeHit ?? false,
    striker_runs: striker?.runs ?? 0,
  };
}
