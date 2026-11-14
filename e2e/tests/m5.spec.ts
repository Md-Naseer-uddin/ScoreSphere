import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { newPhone, register } from './helpers';

const syncBadge = (page: Page) => page.locator('[data-sync-state]');

async function newUser(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Leela', newPhone(), 'timer password 1');
  return page;
}

async function serviceWorkerReady(page: Page) {
  await page.evaluate(async () => {
    const sw = (navigator as unknown as { serviceWorker: { ready: Promise<unknown> } })
      .serviceWorker;
    await sw.ready;
  });
}

async function names(page: Page, a: string, b: string) {
  await page.getByRole('textbox', { name: 'Name for Side A player 1' }).fill(a);
  await page.getByRole('textbox', { name: 'Name for Side B player 1' }).fill(b);
}

/** Reads a clock face like "14:57" as seconds. */
async function clockSeconds(page: Page, side: 0 | 1): Promise<number> {
  const text = (await page.getByTestId(`time-${side}`).textContent())!.trim();
  const parts = text.split(':').map(Number);
  return parts.reduce((total, part) => total * 60 + part, 0);
}

test('a chess clock keeps running through going offline and an app reload', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newUser(context);
  await page.goto('/app/matches/new?sport=chess');
  await page.getByRole('button', { name: 'Continue' }).click();
  await names(page, 'Meera', 'Ravi');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);

  await page
    .getByRole('radiogroup', { name: 'Who plays White?' })
    .getByRole('radio', { name: 'Meera' })
    .click();
  await page.getByRole('button', { name: "Start White's clock" }).click();
  await page.waitForTimeout(2_000);
  await page.getByRole('button', { name: 'Meera: moved' }).click();
  // Rapid 15+10: Meera used about 2 s and gained 10.
  await expect(page.getByTestId('time-0')).toHaveText(/^15:0[789]$/);
  const pressedAt = Date.now();
  await expect(syncBadge(page)).toHaveText('Synced');

  // Ravi thinks while the phone loses signal and the app is reloaded.
  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.waitForTimeout(3_000);
  await page.reload();
  await expect(page.getByTestId('time-1')).toBeVisible();
  const expected = 15 * 60 - Math.round((Date.now() - pressedAt) / 1000);
  // Within the plan's ±1 s tolerance (plus one for display rounding at the second boundary).
  expect(Math.abs((await clockSeconds(page, 1)) - expected)).toBeLessThanOrEqual(2);

  await page.getByRole('button', { name: 'Ravi: moved' }).click();
  await expect(page.getByText(/^Ravi moved \(0:0[3-9]\)$/)).toBeVisible();
  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
});

test('tennis points scored offline survive a reload and sync', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newUser(context);
  await page.goto('/app/matches/new?sport=tennis');
  await page.getByRole('button', { name: 'Continue' }).click();
  await names(page, 'Asha', 'Bina');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  await page
    .getByRole('radiogroup', { name: 'Who serves first?' })
    .getByRole('radio', { name: 'Asha' })
    .click();
  await page.getByRole('button', { name: 'Start match' }).click();

  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Point Asha' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('15');
  await page.getByRole('button', { name: 'Point Asha' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('30');
  await page.reload();
  await expect(page.getByTestId('points-0')).toHaveText('30');
  await page.getByRole('button', { name: 'Point Bina' }).click();
  await expect(page.getByRole('status').filter({ hasText: '30–15' })).toBeVisible();
  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
});

test('volleyball rallies scored offline survive a reload and sync', async ({ browser }) => {
  const context = await browser.newContext();
  const page = await newUser(context);
  await page.goto('/app/matches/new?sport=volleyball');
  await page.getByLabel('Players on court').fill('2');
  await page.getByRole('button', { name: 'Continue' }).click();
  for (const [side, players] of [
    ['A', ['Anu', 'Bala']],
    ['B', ['Chitra', 'Deepa']],
  ] as const) {
    for (const [i, name] of players.entries()) {
      await page.getByRole('textbox', { name: `Name for Side ${side} player ${i + 1}` }).fill(name);
    }
  }
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  await page
    .getByRole('radiogroup', { name: 'Who serves first?' })
    .getByRole('radio', { name: 'Team A' })
    .click();
  await page.getByRole('button', { name: 'Start set 1' }).click();

  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Point Team A' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('1');
  await page.getByRole('button', { name: 'Point Team B' }).click();
  await expect(page.getByTestId('points-1')).toHaveText('1');
  // Team B won the serve back: Deepa rotates into position I and serves.
  await expect(page.getByText(/Deepa serving/)).toBeVisible();
  await page.reload();
  await expect(page.getByTestId('points-1')).toHaveText('1');
  await expect(page.getByText(/Deepa serving/)).toBeVisible();
  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
});
