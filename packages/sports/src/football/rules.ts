import type { RuleCatalogue } from '@scoresphere/engine-kit';
import { countField, sideField } from '../rule-fields.js';
import type { FootballState } from './engine.js';

/**
 * What custom football rules can use (D16b). Actions are a goal for a side (as a goal
 * with no scorer recorded) or the final whistle, e.g. for golden goal or a mercy rule.
 */
export const footballRuleCatalogue: RuleCatalogue = {
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
          options: ['regular', 'penalty', 'own_goal'],
          optionLabels: ['Goal', 'Penalty', 'Own goal'],
        },
        { key: 'extra', label: 'In extra time', type: 'boolean' },
      ],
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
          options: ['yellow', 'red'],
          optionLabels: ['Yellow', 'Red'],
        },
      ],
    },
    {
      fact: 'period_ended',
      label: 'A period ends',
      fields: [
        countField('period', 'Period', 6),
        { key: 'extra', label: 'Extra time', type: 'boolean' },
      ],
    },
  ],
  variables: [
    countField('goals_side1', 'Goals (first side)', 50),
    countField('goals_side2', 'Goals (second side)', 50),
    countField('lead', 'Lead (goal difference)', 50),
    countField('period', 'Period', 6),
    { key: 'extra_time', label: 'In extra time', type: 'boolean' },
    countField('sent_off_side1', 'Players sent off (first side)', 11),
    countField('sent_off_side2', 'Players sent off (second side)', 11),
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
          options: ['regular', 'penalty'],
          optionLabels: ['Goal', 'Penalty'],
        },
      ],
    },
    { type: 'final_whistle', label: 'End the match now', params: [] },
  ],
};

export function footballRuleVariables(state: FootballState): Record<string, number | boolean> {
  const sentOff = (side: 0 | 1) =>
    state.sentOff.filter((id) => state.players[side].includes(id)).length;
  return {
    goals_side1: state.score[0],
    goals_side2: state.score[1],
    lead: Math.abs(state.score[0] - state.score[1]),
    period: state.periods.number,
    extra_time: state.periods.number > state.config.periods,
    sent_off_side1: sentOff(0),
    sent_off_side2: sentOff(1),
  };
}
