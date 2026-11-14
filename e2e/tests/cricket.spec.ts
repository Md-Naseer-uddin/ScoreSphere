import { expect, type Page, test } from '@playwright/test';
import { query } from './db';
import { newPhone, register } from './helpers';

const syncBadge = (page: Page) => page.locator('[data-sync-state]');
const score = (page: Page) => page.getByTestId('cricket-score');

async function tap(page: Page, button: string, expectedScore: string) {
  await page.getByRole('button', { name: button, exact: true }).click();
  await expect(score(page)).toHaveText(expectedScore);
}

test('scores a one-over cricket match, finishing the chase offline through a reload', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Vikram', newPhone(), 'cricket password 1');

  // Setup: T20 rules, but one over a side for a quick game.
  await page.goto('/app/matches/new?sport=cricket');
  await page.getByLabel('Overs per side').fill('1');
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

  // First innings.
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

  await tap(page, '1 run', '1/0');
  await expect(page.getByTestId('striker')).toContainText('Bina');
  await tap(page, 'Four', '5/0');
  await page.getByRole('button', { name: 'Wd', exact: true }).click();
  await tap(page, 'Wd', '6/0');
  await tap(page, '2 runs', '8/0');
  await tap(page, 'Dot ball', '8/0');
  await tap(page, '1 run', '9/0');
  // The wide didn't count, so the over needs one more ball; then the innings is complete.
  await page.getByRole('button', { name: 'Dot ball', exact: true }).click();
  await expect(page.getByText('Target: 10')).toBeVisible();
  await expect(syncBadge(page)).toHaveText('Synced');

  // The chase is scored with no signal, and the phone reloads the app mid-innings.
  await page.evaluate(async () => {
    const sw = (navigator as unknown as { serviceWorker: { ready: Promise<unknown> } })
      .serviceWorker;
    await sw.ready;
  });
  await context.setOffline(true);
  await page
    .getByRole('radiogroup', { name: 'Striker (on strike)' })
    .getByRole('radio', { name: 'Ravi' })
    .click();
  await page
    .getByRole('radiogroup', { name: 'Non-striker' })
    .getByRole('radio', { name: 'Dev' })
    .click();
  await page.getByRole('button', { name: 'Start innings', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'Bowler' })
    .getByRole('radio', { name: 'Asha' })
    .click();
  await tap(page, 'Four', '4/0');
  await page.reload();
  await expect(score(page)).toHaveText('4/0');
  await tap(page, 'Four', '8/0');
  await page.getByRole('button', { name: 'Wicket', exact: true }).click();
  await page
    .getByRole('radiogroup', { name: 'How out?' })
    .getByRole('radio', { name: 'Bowled' })
    .click();
  await page.getByRole('button', { name: 'Record wicket' }).click();
  await expect(page.getByText('Lions won', { exact: true })).toBeVisible();
  await expect(syncBadge(page)).toHaveText('Offline — saving on this device');

  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });

  // The scorecard shows how the wicket fell.
  await page.getByRole('link', { name: 'View scorecard' }).click();
  await expect(page.getByText('won by 1 run').first()).toBeVisible();
  await expect(page.getByText('b Asha')).toBeVisible();

  // Awards come from the server once synced: Asha's wicket and run make her Player of the Match.
  await expect(page.getByTestId('award-player-of-the-match')).toContainText('Asha');
  const bestBatter = page.getByTestId('award-best-batter');
  await expect(bestBatter).toContainText('Ravi');
  // The organizer overrides it, with a reason.
  await bestBatter.getByRole('button', { name: 'Choose recipient' }).click();
  await bestBatter.getByLabel('Ravi').uncheck();
  await bestBatter.getByLabel('Bina').check();
  await bestBatter.getByLabel(/^Reason/).fill('Held the innings together');
  await bestBatter.getByRole('button', { name: 'Save' }).click();
  await expect(bestBatter).toContainText('Selected by organizer');
  await expect(bestBatter).toContainText('Reason: Held the innings together');

  const [ledger] = await query<{ events: number; distinct_ids: number; status: string }>(
    `select count(*)::int as events, count(distinct e.event_id)::int as distinct_ids, m.status
       from match_events e join matches m on m.id = e.match_id
      where e.match_id = $1 group by m.status`,
    [matchId],
  );
  // CREATED and START; openers, bowler and 7 deliveries; openers, bowler and 3 deliveries.
  expect(ledger).toEqual({ events: 16, distinct_ids: 16, status: 'completed' });
});
