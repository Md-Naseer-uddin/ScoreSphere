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

async function teams(page: Page, a: [string, string[]], b: [string, string[]]) {
  for (const [letter, [name, players]] of [
    ['A', a],
    ['B', b],
  ] as const) {
    await page.getByLabel(`Side ${letter} name`).fill(name);
    for (const [i, player] of players.entries()) {
      await page
        .getByRole('textbox', { name: `Name for Side ${letter} player ${i + 1}` })
        .fill(player);
    }
  }
}

test('kabaddi: an all out, a super tackle and a failed do-or-die raid, offline through a reload', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Anup', newPhone(), 'kabaddi password 1');

  await page.goto('/app/matches/new?sport=kabaddi');
  await page.getByRole('radio', { name: /School game/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await teams(page, ['Bengal', ['Maninder', 'Fazel']], ['Patna', ['Pardeep', 'Neeraj']]);
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const matchId = page.url().split('/').at(-2)!;

  await page.getByRole('radio', { name: 'Bengal' }).click();
  await page.getByRole('button', { name: 'Start First half' }).click();
  await expect(page.getByRole('heading', { name: 'Raid: Bengal' })).toBeVisible();
  await page.getByLabel('Raider').selectOption({ label: 'Maninder' });
  await page.getByRole('button', { name: 'One more touch' }).click();
  await page.getByRole('button', { name: 'Back safely' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('1');
  await expect(page.getByTestId('on-mat-1')).toHaveAccessibleName('1 player on the mat');

  // Patna's last player raids and is tackled by two defenders: super tackle and all out.
  await page.getByRole('button', { name: 'Tackled' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('5');
  await expect(page.getByTestId('on-mat-1')).toHaveAccessibleName('2 players on the mat');

  await serviceWorkerReady(page);
  await context.setOffline(true);
  // Two empty raids each: the raid passes to the other team after every one.
  for (const next of ['Patna', 'Bengal', 'Patna', 'Bengal']) {
    await page.getByRole('button', { name: 'Back safely' }).click();
    await expect(page.getByRole('heading', { name: `Raid: ${next}` })).toBeVisible();
  }
  await page.reload();
  await expect(page.getByText('Do-or-die', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back safely' }).click();
  await expect(page.getByTestId('points-1')).toHaveText('1');
  await page.getByRole('button', { name: 'End First half' }).click();
  await page.getByRole('button', { name: 'Start Second half' }).click();
  await page.getByRole('button', { name: 'End Second half' }).click();
  await expect(page.getByTestId('kabaddi-status')).toHaveText('Full time');

  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
  const [match] = await query<{ status: string; summary: string }>(
    `select status, result->>'summary' as summary from matches where id = $1`,
    [matchId],
  );
  expect(match).toEqual({ status: 'completed', summary: '5–1' });
});

test('kho-kho: a batch put out, then the other team chases, offline through a reload', async ({
  browser,
}) => {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto('/auth/register');
  await register(page, 'Coach Sarika', newPhone(), 'kho-kho password 1');

  await page.goto('/app/matches/new?sport=kho-kho');
  await page.getByRole('radio', { name: /School game/ }).click();
  await page.getByRole('button', { name: 'Continue' }).click();
  await teams(page, ['Mumbai', ['Ravi']], ['Pune', ['Kiran']]);
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const matchId = page.url().split('/').at(-2)!;

  await page.getByRole('radio', { name: 'Mumbai' }).click();
  await page.getByRole('button', { name: 'Start turn 1' }).click();
  await expect(page.getByTestId('kho-kho-status')).toContainText('Turn 1: Mumbai chasing');
  await page.getByLabel('Chaser').selectOption({ label: 'Ravi' });
  await page.getByRole('button', { name: 'Touch', exact: true }).click();
  await expect(page.getByTestId('points-0')).toHaveText('1');
  await expect(page.getByTestId('batch')).toHaveText('Batch 1: 1 of 3 out');
  await page.getByRole('button', { name: 'Pole dive' }).click();
  await expect(page.getByTestId('points-0')).toHaveText('2');

  await serviceWorkerReady(page);
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Out of the field' }).click();
  await expect(page.getByTestId('batch')).toHaveText('Batch 2: 0 of 3 out');
  await page.reload();
  await expect(page.getByTestId('points-0')).toHaveText('3');
  await page.getByRole('button', { name: 'End turn 1' }).click();
  await page.getByRole('button', { name: 'Start turn 2' }).click();
  await expect(page.getByTestId('kho-kho-status')).toContainText('Turn 2: Pune chasing');
  await page.getByRole('button', { name: 'Touch', exact: true }).click();
  await expect(page.getByTestId('points-1')).toHaveText('1');
  await page.getByRole('button', { name: 'End turn 2' }).click();
  await expect(page.getByTestId('kho-kho-status')).toHaveText('Full time');

  await context.setOffline(false);
  await expect(syncBadge(page)).toHaveText('Synced', { timeout: 30_000 });
  const [match] = await query<{ status: string; summary: string }>(
    `select status, result->>'summary' as summary from matches where id = $1`,
    [matchId],
  );
  expect(match).toEqual({ status: 'completed', summary: '3–1' });
});
