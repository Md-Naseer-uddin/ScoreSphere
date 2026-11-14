import { expect, type Page, test } from '@playwright/test';
import { query } from './db';
import { newPhone, register } from './helpers';

const syncBadge = (page: Page) => page.locator('[data-sync-state]');

async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    const sw = (navigator as unknown as { serviceWorker: { ready: Promise<unknown> } })
      .serviceWorker;
    await sw.ready;
  });
}

/** Fills each side's players, adding slots after the first. */
async function players(page: Page, teams: Record<'A' | 'B', string[]>) {
  for (const side of ['A', 'B'] as const) {
    for (const [i, name] of teams[side].entries()) {
      if (i > 0) await page.getByRole('button', { name: `Add player to side ${side}` }).click();
      await page.getByRole('textbox', { name: `Name for Side ${side} player ${i + 1}` }).fill(name);
    }
  }
}

test('football: goals, a second yellow and half-time scored offline through a reload', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Farhan', newPhone(), 'football password 1');

  // The sport page explains the rules and starts a match.
  await page.goto('/app/sports');
  await page.getByRole('link', { name: /Football/ }).click();
  await expect(page.getByText('IFAB Laws of the Game')).toBeVisible();
  await page.getByRole('link', { name: 'Start a match' }).click();

  await page.getByRole('radio', { name: /5-a-side/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Side A name').fill('Rovers');
  await page.getByLabel('Side B name').fill('United');
  await players(page, { A: ['Imran', 'Joel'], B: ['Kiran', 'Lata'] });
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const matchId = page.url().split('/').at(-2)!;

  await page.getByRole('button', { name: 'Kick off' }).click();
  await expect(page.getByTestId('football-status')).toContainText('First half');

  await page.getByRole('button', { name: 'Goal Rovers' }).click();
  await page.getByLabel('Scorer').selectOption({ label: 'Imran' });
  await page.getByLabel('Assist').selectOption({ label: 'Joel' });
  await page.getByRole('button', { name: 'Record goal' }).click();
  await expect(page.getByTestId('goals-0')).toHaveText('1');

  // No signal: two yellow cards send Lata off, then the app is reloaded.
  await serviceWorkerReady(page);
  await context.setOffline(true);
  for (let i = 0; i < 2; i++) {
    await page.getByRole('button', { name: 'Card', exact: true }).click();
    await page.getByRole('radio', { name: 'United' }).click();
    await page.getByRole('radio', { name: /Lata/ }).click();
    await page.getByRole('button', { name: 'Yellow card' }).click();
  }
  await expect(page.getByText('Second yellow card: Lata is sent off')).toBeVisible();
  await page.reload();
  await expect(page.getByLabel('1 player sent off')).toBeVisible();

  await page.getByRole('button', { name: 'Goal United' }).click();
  await page.getByLabel('Kind of goal').getByRole('radio', { name: 'Own goal' }).click();
  await page.getByLabel('Own goal by').selectOption({ label: 'Joel' });
  await page.getByRole('button', { name: 'Record goal' }).click();
  await expect(page.getByTestId('goals-1')).toHaveText('1');
  await page.getByRole('button', { name: 'End First half' }).click();
  await expect(page.getByTestId('football-status')).toHaveText('End of First half');
  await page.getByRole('button', { name: 'Start Second half' }).click();
  await page.getByRole('button', { name: 'Goal Rovers' }).click();
  await page.getByRole('button', { name: 'Record goal' }).click();
  await page.getByRole('button', { name: 'End Second half' }).click();
  await expect(page.getByTestId('football-status')).toHaveText('Full time');
  await expect(syncBadge(page)).toHaveText('Offline — saving on this device');

  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });

  // The scorecard and the server agree, and Imran is Player of the Match.
  await page.getByRole('link', { name: 'View scorecard' }).click();
  await expect(page.getByText('2–1').first()).toBeVisible();
  await expect(page.getByTestId('award-player-of-the-match')).toContainText('Imran');
  const [match] = await query<{ status: string; summary: string }>(
    `select status, result->>'summary' as summary from matches where id = $1`,
    [matchId],
  );
  expect(match).toEqual({ status: 'completed', summary: '2–1' });
});
