import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { WrestlingState } from './engine.js';

/** What custom wrestling rules can use (D16b): points for a side, or ending the bout. */
export const wrestlingRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'points',
      label: 'Points are scored',
      fields: [
        sideField('side', 'For'),
        { key: 'value', label: 'Value', type: 'number', options: [1, 2, 4, 5] },
      ],
    },
    {
      fact: 'caution',
      label: 'A caution is given',
      fields: [sideField('side', 'To'), countField('count', 'Cautions so far', 5)],
    },
    { fact: 'period_ended', label: 'A period ends', fields: [countField('period', 'Period', 3)] },
  ],
  variables: [
    countField('points_side1', 'Points (first side)', 100),
    countField('points_side2', 'Points (second side)', 100),
    countField('lead', 'Lead (points)', 100),
    countField('period', 'Period', 3),
    countField('cautions_side1', 'Cautions (first side)', 5),
    countField('cautions_side2', 'Cautions (second side)', 5),
  ],
  commands: [
    {
      type: 'points',
      label: 'Give points',
      params: [
        sideField('side', 'To'),
        { key: 'value', label: 'Points', type: 'number', options: [1, 2, 4, 5] },
      ],
    },
    { type: 'final_whistle', label: 'End the bout now', params: [] },
  ],
};

export function wrestlingRuleVariables(state: WrestlingState): Record<string, number> {
  return {
    points_side1: state.score[0],
    points_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    period: state.periods.number,
    cautions_side1: state.cautions[0],
    cautions_side2: state.cautions[1],
  };
}
