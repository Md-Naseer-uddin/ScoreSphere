import { type BrowserContext, expect, type Page, test } from '@playwright/test';
import { query } from './db';
import { expectScore, login, newPhone, point, register, startBadmintonMatch } from './helpers';

async function waitForServiceWorker(page: Page) {
  // Offline reloads are served by the service worker, so it must be in control first.
  await page.evaluate(async () => {
    const sw = (navigator as unknown as { serviceWorker: { ready: Promise<unknown> } })
      .serviceWorker;
    await sw.ready;
  });
}

const syncBadge = (page: Page) => page.locator('[data-sync-state]');

async function createShareLink(page: Page, matchId: string): Promise<string> {
  await page.goto(`/app/matches/${matchId}`);
  await page.getByRole('button', { name: 'Create link', exact: true }).click();
  const url = (await page.getByTestId('share-url').textContent())!.trim();
  expect(url).toMatch(/\/live#[\w-]{40,}$/);
  return url;
}

test('scores through going offline and a reload, syncs each event exactly once, and spectators follow', async ({
  browser,
}) => {
  const scorerContext: BrowserContext = await browser.newContext();
  const scorer = await scorerContext.newPage();
  await scorer.goto('/auth/register');
  await register(scorer, 'Coach Meera', newPhone(), 'scorer password 1');

  const matchId = await startBadmintonMatch(scorer, 'Asha', 'Ravi');
  await point(scorer, 'Asha', 0, 1);
  await point(scorer, 'Asha', 0, 2);
  await expect(syncBadge(scorer)).toHaveText('Synced', { timeout: 30_000 });

  // A spectator opens a live link without signing in.
  const liveUrl = await createShareLink(scorer, matchId);
  const spectator = await (await browser.newContext()).newPage();
  await spectator.goto(liveUrl);
  await expect(spectator.getByRole('heading', { name: 'Asha vs Ravi' })).toBeVisible();
  await expectScore(spectator, 2, 0);

  // Back to scoring; then the connection drops mid-match.
  await scorer.goto(`/app/matches/${matchId}/score`);
  await waitForServiceWorker(scorer);
  await scorerContext.setOffline(true);
  await point(scorer, 'Ravi', 1, 1);
  await point(scorer, 'Ravi', 1, 2);
  await expect(syncBadge(scorer)).toHaveText('Offline — saving on this device');

  // The phone reloads the app while still offline: everything is still there.
  await scorer.reload();
  await expectScore(scorer, 2, 2);
  await point(scorer, 'Asha', 0, 3);
  // Spectators see only what has synced.
  await expectScore(spectator, 2, 0);

  // Back online: the queue drains and the spectator catches up.
  await scorerContext.setOffline(false);
  await expect(syncBadge(scorer)).toHaveText('Synced', { timeout: 30_000 });
  await expectScore(spectator, 3, 2);

  const [ledger] = await query<{ events: number; ids: number; max: number }>(
    'select count(*)::int as events, count(distinct event_id)::int as ids, max(seq) as max from match_events where match_id = $1',
    [matchId],
  );
  // CREATED, START, start_game, then five rallies: each stored once.
  expect(ledger).toEqual({ events: 8, ids: 8, max: 8 });

  // A spectator who joins now gets the whole match from the snapshot.
  const late = await (await browser.newContext()).newPage();
  await late.goto(liveUrl);
  await expectScore(late, 3, 2);

  // Revoking the link cuts spectators off.
  await scorer.goto(`/app/matches/${matchId}`);
  await scorer.getByRole('button', { name: 'Revoke' }).click();
  await expect(scorer.getByText('Link revoked')).toBeVisible();
  await expect(
    spectator.getByRole('heading', { name: "This live link isn't available" }),
  ).toBeVisible();
  await late.reload();
  await expect(late.getByRole('heading', { name: "This live link isn't available" })).toBeVisible();
});

test('taking over on another device fences off the old one and keeps its events', async ({
  browser,
}) => {
  const phone = newPhone();
  const password = 'scorer password 2';
  const oldContext = await browser.newContext();
  const oldPhone = await oldContext.newPage();
  await oldPhone.goto('/auth/register');
  await register(oldPhone, 'Coach Arjun', phone, password);
  const matchId = await startBadmintonMatch(oldPhone, 'Kiran', 'Dev');
  await point(oldPhone, 'Kiran', 0, 1);
  await expect(syncBadge(oldPhone)).toHaveText('Synced', { timeout: 30_000 });

  // The old phone loses signal and keeps scoring.
  await oldContext.setOffline(true);
  await point(oldPhone, 'Dev', 1, 1);
  await point(oldPhone, 'Dev', 1, 2);

  // Meanwhile the scorer picks up a tablet and takes over.
  const tablet = await (await browser.newContext()).newPage();
  await login(tablet, phone, password);
  await tablet.goto(`/app/matches/${matchId}`);
  await tablet.getByRole('button', { name: 'Score on this device' }).click();
  await expect(tablet.getByRole('heading', { name: 'Take over scoring?' })).toBeVisible();
  await tablet.getByRole('button', { name: 'Take over' }).click();
  await tablet.waitForURL(`**/app/matches/${matchId}/score`);
  await expectScore(tablet, 1, 0);
  await point(tablet, 'Kiran', 0, 2);
  await expect(syncBadge(tablet)).toHaveText('Synced', { timeout: 30_000 });

  // The old phone reconnects: its events are refused, kept, and it stops scoring.
  await oldContext.setOffline(false);
  await expect(syncBadge(oldPhone)).toHaveText('Conflict — local events kept', { timeout: 30_000 });
  await expect(oldPhone.getByRole('alert')).toContainText(
    'Another device is now scoring this match',
  );
  await oldPhone.goto(`/app/matches/${matchId}`);
  await expect(oldPhone.getByText('2 events kept on this device')).toBeVisible();

  const counted = await query<{ seq: number; kind: string }>(
    'select seq, kind from match_events where match_id = $1 order by seq',
    [matchId],
  );
  expect(counted.map((e) => e.seq)).toEqual([1, 2, 3, 4, 5]);
  const kept = await query<{ code: string }>(
    'select code from match_event_rejections where match_id = $1',
    [matchId],
  );
  expect(kept.map((r) => r.code)).toEqual(['NOT_LEASE_HOLDER', 'NOT_LEASE_HOLDER']);
});
