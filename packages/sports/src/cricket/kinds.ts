/** Constants shared by the engine and its rule catalogue (kept apart to avoid an import cycle). */

export const DISMISSALS = [
  'bowled',
  'caught',
  'lbw',
  'run_out',
  'stumped',
  'hit_wicket',
  'obstructing_field',
  'hit_ball_twice',
  'timed_out',
  'one_tip_one_hand',
] as const;
/** How the runs on a delivery were scored. Wides and no-balls are re-bowled. */
export const DELIVERY_KINDS = [
  'bat',
  'bye',
  'leg_bye',
  'wide',
  'no_ball_bat',
  'no_ball_bye',
  'no_ball_leg_bye',
] as const;
