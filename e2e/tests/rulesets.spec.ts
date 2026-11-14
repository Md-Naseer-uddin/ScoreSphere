import { expect, type Page, test } from '@playwright/test';
import { query } from './db';
import { newPhone, register } from './helpers';

const score = (page: Page) => page.getByTestId('cricket-score');

/** A wide with no runs: the pad opens the wide panel, then the plain wide is chosen. */
async function wide(page: Page, expectedScore: string) {
  await page.getByRole('button', { name: 'Wd', exact: true }).click();
  await page.getByRole('button', { name: 'Wd', exact: true }).click();
  await expect(score(page)).toHaveText(expectedScore);
}

test('builds a consecutive-wides rule, previews it and scores a match with it (M8)', async ({
  page,
}) => {
  await page.goto('/auth/register');
  await register(page, 'Coach Meera', newPhone(), 'rules password 1');

  // Builder: preset settings, then a rule made only from what cricket offers.
  await page.goto('/app/matches');
  await page.getByRole('link', { name: 'Rulesets' }).click();
  await page.getByRole('link', { name: 'New ruleset' }).click();
  await page.getByRole('radio', { name: 'Cricket' }).click();
  await page.getByLabel('Ruleset name').fill('Gully rules');
  await page.getByLabel('Overs per side').fill('1');
  await page.getByRole('button', { name: 'Add rule' }).click();

  const rule = page.getByRole('group', { name: 'Rule 1' });
  await expect(rule.getByLabel('When')).toHaveValue('ball');
  await rule.getByRole('button', { name: 'Add condition' }).click();
  await rule.getByLabel('Condition 1: Kind of ball').selectOption('wide');
  await rule.getByRole('button', { name: 'Add condition' }).click();
  await rule.getByLabel('Condition 2: what to check').selectOption('state:consecutive_wides');
  await rule.getByLabel('Condition 2: comparison').selectOption('gte');
  await rule.getByLabel('Condition 2: Wides in a row').fill('3');
  await expect(rule.getByLabel('Action 1', { exact: true })).toHaveValue('penalty_runs');
  await rule.getByLabel('Action 1: Runs').fill('1');
  await rule.getByRole('button', { name: 'Add action' }).click();
  await rule.getByLabel('Action 2', { exact: true }).selectOption('reset_wide_count');

  // Unnamed rules can't be saved.
  await expect(page.getByText('Give every rule a name.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save ruleset' })).toBeDisabled();
  await rule.getByLabel('Rule 1 name').fill('Three wides in a row');

  // The preview runs a sample over: three wides open it, so the rule fires once.
  const preview = page.getByRole('region', { name: 'Preview' });
  await expect(preview.getByText('Rule “Three wides in a row”: 1 penalty run')).toHaveCount(1);
  await page.getByRole('button', { name: 'Save ruleset' }).click();
  await expect(page.getByText('Saved as version 1')).toBeVisible();
  await expect(page.getByRole('link', { name: /Gully rules/ })).toBeVisible();

  // A match with the ruleset: its settings are fixed and its rules apply as it is scored.
  await page.goto('/app/matches/new?sport=cricket');
  await page.getByRole('radio', { name: /Gully rules/ }).click();
  await expect(page.getByText('Settings and rules come from “Gully rules”:')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Side A name').fill('Lions');
  await page.getByRole('textbox', { name: 'Name for Side A player 1' }).fill('Asha');
  await page.getByRole('textbox', { name: 'Name for Side A player 2' }).fill('Bina');
  await page.getByLabel('Side B name').fill('Tigers');
  await page.getByRole('textbox', { name: 'Name for Side B player 1' }).fill('Ravi');
  await page.getByRole('textbox', { name: 'Name for Side B player 2' }).fill('Dev');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const matchId = page.url().split('/').at(-2)!;

  await page
    .getByRole('radiogroup', { name: 'Who bats first?' })
    .getByRole('radio', { name: 'Lions' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Striker (on strike)' })
    .getByRole('radio', { name: 'Asha' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Non-striker' })
    .getByRole('radio', { name: 'Bina' })
    .click();
  await page.getByRole('button', { name: 'Start innings', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Bowler' })
    .getByRole('radio', { name: 'Ravi' })
    .click();

  await wide(page, '1/0');
  await wide(page, '2/0');
  // The third wide in a row brings the rule's penalty run.
  await wide(page, '4/0');
  await expect(page.getByText('Rule “Three wides in a row”: 1 penalty run')).toBeVisible();
  // The count starts again, so the next wide is just a wide.
  await wide(page, '5/0');

  // Undoing the third wide takes its penalty run away too.
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(score(page)).toHaveText('4/0');
  await page.getByRole('button', { name: 'Undo' }).click();
  await expect(score(page)).toHaveText('2/0');
  await wide(page, '4/0');
  await expect(page.locator('[data-sync-state]')).toHaveText('Synced', { timeout: 30_000 });

  // The server replayed the same rules and knows which ruleset version the match used.
  const [match] = await query<{ linked: boolean; runs: string; needs_review: boolean }>(
    `select m.ruleset_version_id is not null as linked, m.needs_review,
            m.current_state->'innings'->0->>'runs' as runs
       from matches m where m.id = $1`,
    [matchId],
  );
  expect(match).toEqual({ linked: true, runs: '4', needs_review: false });

  // Duplicating starts a new ruleset from a copy of the rules.
  await page.goto('/app/rulesets');
  await page.getByRole('link', { name: /Gully rules/ }).click();
  await page.getByRole('link', { name: 'Duplicate as a new ruleset' }).click();
  await expect(page.getByLabel('Ruleset name')).toHaveValue('Gully rules (copy)');
  await expect(page.getByRole('group', { name: 'Rule 1' }).getByLabel('Rule 1 name')).toHaveValue(
    'Three wides in a row',
  );
  await page.getByRole('button', { name: 'Save ruleset' }).click();
  await expect(page.getByRole('link', { name: /Gully rules \(copy\)/ })).toBeVisible();
});
