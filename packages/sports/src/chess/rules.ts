import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { ChessState } from './engine.js';

/** What custom chess rules can use (D16b): clock events, and extra time as the action. */
export const chessRuleCatalogue: RuleCatalogue = {
  triggers: [
    { fact: 'press', label: 'A move is made (clock pressed)', fields: [sideField('side', 'By')] },
    { fact: 'time_added', label: 'Time is added', fields: [sideField('side', 'For')] },
  ],
  variables: [
    countField('moves_side1', 'Moves made (first side)'),
    countField('moves_side2', 'Moves made (second side)'),
    countField('seconds_side1', 'Seconds left (first side)'),
    countField('seconds_side2', 'Seconds left (second side)'),
  ],
  commands: [
    {
      type: 'add_time',
      label: 'Add time to a clock',
      params: [
        sideField('side', 'For'),
        { key: 'seconds', label: 'Seconds', type: 'number', min: 1, max: 3600 },
      ],
    },
  ],
};

export function chessRuleVariables(state: ChessState): Record<string, number> {
  return {
    moves_side1: state.clocks[0].moves,
    moves_side2: state.clocks[1].moves,
    seconds_side1: Math.floor(state.clocks[0].remainingMs / 1000),
    seconds_side2: Math.floor(state.clocks[1].remainingMs / 1000),
  };
}
