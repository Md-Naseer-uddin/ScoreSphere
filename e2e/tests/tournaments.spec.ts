import { expect, type Page, test } from '@playwright/test';
import { newPhone, register } from './helpers';

const syncBadge = (page: Page) => page.locator('[data-sync-state]');

async function addNameOnly(page: Page, name: string) {
  await page.getByRole('button', { name: 'Add players' }).click();
  await page.getByRole('tab', { name: 'Name only' }).click();
  await page.getByLabel('Name', { exact: true }).fill(name);
  await page.getByRole('button', { name: 'Add to team' }).click();
  await expect(page.getByText(`${name} added`)).toBeVisible();
  await page.keyboard.press('Escape');
}

async function tap(page: Page, name: string, times: number) {
  for (let i = 0; i < times; i++) {
    const before = await page.getByTestId('points-0').textContent();
    const beforeB = await page.getByTestId('points-1').textContent();
    await page.getByRole('button', { name }).click();
    await expect
      .poll(
        async () =>
          `${await page.getByTestId('points-0').textContent()}|${await page.getByTestId('points-1').textContent()}`,
      )
      .not.toBe(`${before}|${beforeB}`);
  }
}

test('a league: fixtures, scoring, standings, awards, and republishing after a correction', async ({
  page,
}) => {
  await page.goto('/auth/register');
  await register(page, 'Coach Nisha', newPhone(), 'tournament password 1');

  // Players come from the roster; add them through a team.
  await page.getByRole('link', { name: 'Teams' }).click();
  await page.getByRole('button', { name: 'New team' }).click();
  await page.getByLabel('Team name').fill('Club');
  await page.getByRole('button', { name: 'Badminton' }).click();
  await page.getByRole('button', { name: 'Create team' }).click();
  await addNameOnly(page, 'Asha');
  await addNameOnly(page, 'Ravi');

  // A short-game league: one game to 3.
  await page.getByRole('link', { name: 'Matches' }).click();
  await page.getByRole('link', { name: 'Tournaments' }).click();
  await page.getByRole('link', { name: 'New tournament' }).click();
  await page.getByLabel('Tournament name').fill('Club Open');
  await page
    .getByRole('radiogroup', { name: 'Sport' })
    .getByRole('radio', { name: 'Badminton' })
    .click();
  await page.getByLabel('Points to win').fill('3');
  await page.getByLabel('Cap').fill('3');
  await page.getByLabel('Games to win').fill('1');
  await page.getByRole('button', { name: 'Create tournament' }).click();
  await expect(page.getByRole('heading', { name: 'Club Open' })).toBeVisible();

  for (const name of ['Asha', 'Ravi']) {
    await page.getByRole('combobox', { name: 'Choose a player' }).selectOption({ label: name });
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await expect(page.getByText(new RegExp(`\\d\\.\\s*${name}`))).toBeVisible();
  }
  await page.getByRole('button', { name: 'Make fixtures' }).click();

  // Score the only fixture: the wizard is filled from it.
  await page.getByRole('link', { name: 'Score' }).click();
  await expect(page.getByRole('combobox', { name: 'Side A player 1' })).toHaveValue(/^roster:/);
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  await page
    .getByRole('radiogroup', { name: 'Who serves first?' })
    .getByRole('radio', { name: 'Asha' })
    .click();
  await page.getByRole('button', { name: 'Start game 1' }).click();
  await tap(page, 'Point Asha', 3);
  await expect(page.getByText('Asha won', { exact: true })).toBeVisible();
  await expect(syncBadge(page)).toHaveText('Synced');
  const scoreUrl = page.url();

  // Standings and awards.
  await page.goto('/app/tournaments');
  await page.getByRole('link', { name: /Club Open/ }).click();
  const standings = page.getByRole('table', { name: 'Standings' });
  await expect(standings.getByRole('row').nth(1)).toContainText('Asha');
  await expect(page.getByTestId('tournament-award-champion')).toContainText('Asha');
  await expect(page.getByTestId('tournament-award-runner-up')).toContainText('Ravi');

  // A scoring mistake is corrected: the last point is undone and Ravi wins it instead.
  await page.goto(scoreUrl);
  await page.getByRole('button', { name: 'Undo' }).click();
  await tap(page, 'Point Ravi', 3);
  await expect(page.getByText('Ravi won', { exact: true })).toBeVisible();
  await expect(syncBadge(page)).toHaveText('Synced');

  await page.goto('/app/tournaments');
  await page.getByRole('link', { name: /Club Open/ }).click();
  await expect(
    page.getByText('A match changed after the awards were published.', { exact: false }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Publish awards' }).click();
  await expect(page.getByText('Awards published')).toBeVisible();
  await expect(page.getByTestId('tournament-award-champion')).toContainText('Ravi');
  await expect(page.getByTestId('tournament-award-runner-up')).toContainText('Asha');

  // Asha's player page reflects the corrected result.
  await page.goto('/app/teams/roster');
  await page.getByRole('link', { name: 'Asha' }).click();
  await expect(page.getByTestId('stats-badminton')).toContainText(
    '1 played · 0 won · 0 drawn · 1 lost',
  );
});
