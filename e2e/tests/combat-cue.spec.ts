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

async function newMatch(page: Page, sport: string, preset: RegExp, a: string, b: string) {
  await page.goto(`/app/matches/new?sport=${sport}`);
  await page.getByRole('radio', { name: preset }).click();
  return async () => {
    await page.getByRole('button', { name: 'Continue' }).click();
    await page.getByRole('textbox', { name: 'Name for Side A player 1' }).fill(a);
    await page.getByRole('textbox', { name: 'Name for Side B player 1' }).fill(b);
    await page.getByRole('button', { name: 'Start match' }).click();
    await page.waitForURL(/\/score$/);
    return page.url().split('/').at(-2)!;
  };
}

async function summary(matchId: string) {
  const [match] = await query<{ status: string; summary: string }>(
    `select status, result->>'summary' as summary from matches where id = $1`,
    [matchId],
  );
  return match;
}

test('wrestling: a Greco-Roman bout ends on technical superiority, offline through a reload', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Mahavir', newPhone(), 'wrestling password 1');

  const start = await newMatch(page, 'wrestling', /Greco-Roman/, 'Arjun', 'Bhim');
  await page.getByLabel('Weight category (optional)').fill('67 kg');
  const matchId = await start();
  await expect(page.getByText('Greco-Roman · 67 kg')).toBeVisible();

  await page.getByRole('button', { name: 'Start Period 1' }).click();
  await page.getByRole('button', { name: '4 points Arjun' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('4');
  await page.getByRole('button', { name: 'Caution' }).nth(1).click();
  await page.getByRole('button', { name: '1 point to Arjun' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('5');

  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: '1 point Arjun' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('6');
  await page.reload();
  // An 8-point lead ends a Greco-Roman bout at once.
  await page.getByRole('button', { name: '2 points Arjun' }).click();
  await expect(page.getByTestId('wrestling-status')).toHaveText('Bout over');

  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
  expect(await summary(matchId)).toEqual({
    status: 'completed',
    summary: '8–0 (technical superiority)',
  });
});
