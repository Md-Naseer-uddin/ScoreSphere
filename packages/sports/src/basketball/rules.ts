import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { BasketballState } from './engine.js';

/** What custom basketball rules can use (D16b): points for a side, or the final whistle. */
export const basketballRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'basket',
      label: 'Points are scored',
      fields: [sideField('side', 'For'), countField('points', 'Points', 3)],
    },
    {
      fact: 'foul',
      label: 'A foul is called',
      fields: [
        sideField('side', 'Against'),
        {
          key: 'kind',
          label: 'Kind of foul',
          type: 'string',
          options: ['personal', 'technical', 'unsportsmanlike', 'disqualifying'],
          optionLabels: ['Personal', 'Technical', 'Unsportsmanlike', 'Disqualifying'],
        },
      ],
    },
    { fact: 'period_ended', label: 'A period ends', fields: [countField('period', 'Period', 10)] },
  ],
  variables: [
    countField('points_side1', 'Points (first side)', 300),
    countField('points_side2', 'Points (second side)', 300),
    countField('lead', 'Lead (points)', 300),
    countField('period', 'Period', 10),
    { key: 'overtime', label: 'In overtime', type: 'boolean' },
  ],
  commands: [
    {
      type: 'score',
      label: 'Give points',
      params: [
        sideField('side', 'To'),
        { key: 'points', label: 'Points', type: 'number', options: [1, 2, 3] },
      ],
    },
    { type: 'final_whistle', label: 'End the game now', params: [] },
  ],
};

export function basketballRuleVariables(state: BasketballState): Record<string, number | boolean> {
  return {
    points_side1: state.score[0],
    points_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    period: state.periods.number,
    overtime: state.periods.number > state.config.periods,
  };
}
