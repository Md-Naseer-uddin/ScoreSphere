import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { HockeyState } from './engine.js';

/** What custom hockey rules can use (D16b): a goal for a side, or the final whistle. */
export const hockeyRuleCatalogue: RuleCatalogue = {
  triggers: [
    {
      fact: 'goal',
      label: 'A goal is scored',
      fields: [
        sideField('side', 'For'),
        {
          key: 'kind',
          label: 'Kind of goal',
          type: 'string',
          options: ['field_goal', 'penalty_corner', 'penalty_stroke'],
          optionLabels: ['Field goal', 'Penalty corner', 'Penalty stroke'],
        },
      ],
    },
    {
      fact: 'penalty_corner',
      label: 'A penalty corner is awarded',
      fields: [sideField('side', 'To')],
    },
    {
      fact: 'card',
      label: 'A card is shown',
      fields: [
        sideField('side', 'To'),
        {
          key: 'color',
          label: 'Colour',
          type: 'string',
          options: ['green', 'yellow', 'red'],
          optionLabels: ['Green', 'Yellow', 'Red'],
        },
      ],
    },
    { fact: 'period_ended', label: 'A period ends', fields: [countField('period', 'Period', 4)] },
  ],
  variables: [
    countField('goals_side1', 'Goals (first side)', 50),
    countField('goals_side2', 'Goals (second side)', 50),
    countField('lead', 'Lead (goal difference)', 50),
    countField('period', 'Period', 4),
    countField('penalty_corners_side1', 'Penalty corners (first side)', 50),
    countField('penalty_corners_side2', 'Penalty corners (second side)', 50),
  ],
  commands: [
    {
      type: 'goal',
      label: 'Give a goal',
      params: [
        sideField('side', 'To'),
        {
          key: 'kind',
          label: 'Kind',
          type: 'string',
          options: ['field_goal', 'penalty_corner'],
          optionLabels: ['Field goal', 'Penalty corner'],
        },
      ],
    },
    { type: 'final_whistle', label: 'End the match now', params: [] },
  ],
};

export function hockeyRuleVariables(state: HockeyState): Record<string, number> {
  return {
    goals_side1: state.score[0],
    goals_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    period: state.periods.number,
    penalty_corners_side1: state.penaltyCorners[0],
    penalty_corners_side2: state.penaltyCorners[1],
  };
}
