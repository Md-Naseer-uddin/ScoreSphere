import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { newPhone, register } from './helpers';

/** WCAG 2.1 A and AA; serious and critical violations fail the test (plan M11). */
async function audit(page: Page, label: string) {
  const results = await new AxeBuilder({ page })
    .withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa'])
    .analyze();
  const blocking = results.violations
    .filter((v) => v.impact === 'serious' || v.impact === 'critical')
    .map(
      (v) =>
        `${label}: ${v.id} (${v.impact}) ${v.nodes.map((n) => n.target.join(' ')).join(' | ')}`,
    );
  expect(blocking, blocking.join('\n')).toEqual([]);
}

const SPORTS = [
  'cricket',
  'badminton',
  'tennis',
  'chess',
  'kabaddi',
  'volleyball',
  'basketball',
  'wrestling',
  'football',
  'kho-kho',
  'field-hockey',
  'carrom',
];

/** Fills every empty name box the wizard shows and starts the match. */
async function startMatch(page: Page, sport: string) {
  await page.goto(`/app/matches/new?sport=${sport}`);
  await page.getByRole('button', { name: 'Continue' }).click();
  let n = 0;
  for (const box of await page.getByRole('textbox').all()) {
    if ((await box.inputValue()) === '') await box.fill(`Player ${++n}`);
  }
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
}

test('the main screens meet WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/auth/login');
  await audit(page, 'sign in');
  await page.goto('/auth/register');
  await register(page, 'Coach Asha', newPhone(), 'access password 1');

  for (const [path, label] of [
    ['/app', 'home'],
    ['/app/matches', 'matches'],
    ['/app/matches/new', 'new match'],
    ['/app/sports', 'sports'],
    ['/app/sports/cricket', 'sport page'],
    ['/app/teams', 'teams'],
    ['/app/tournaments', 'tournaments'],
    ['/app/rulesets', 'rulesets'],
    ['/app/profile', 'profile'],
  ] as const) {
    await page.goto(path);
    await expect(page.getByRole('main')).toBeVisible();
    await audit(page, label);
  }

  await page.goto('/app/rulesets/new?sport=cricket');
  await page.getByRole('button', { name: 'Add rule' }).click();
  await page.getByRole('button', { name: 'Add condition' }).click();
  await audit(page, 'rules builder');
});

test('every sport’s scoring screen and match page meet WCAG 2.1 AA', async ({ page }) => {
  await page.goto('/auth/register');
  await register(page, 'Coach Bala', newPhone(), 'access password 2');
  for (const sport of SPORTS) {
    await startMatch(page, sport);
    await audit(page, `${sport} scoring`);
    // The match page: scoreboard, scorecard and timeline.
    await page.goto(page.url().replace(/\/score$/, ''));
    await expect(page.getByRole('main')).toBeVisible();
    await audit(page, `${sport} match page`);
  }
});

test.describe('in dark mode', () => {
  test.use({ colorScheme: 'dark' });

  test('home, the new-match wizard and scoring keep enough contrast', async ({ page }) => {
    await page.goto('/auth/register');
    await register(page, 'Coach Chitra', newPhone(), 'access password 3');
    await page.goto('/app');
    await audit(page, 'dark home');
    await page.goto('/app/matches/new');
    await audit(page, 'dark new match');
    for (const sport of ['cricket', 'football', 'basketball']) {
      await startMatch(page, sport);
      await audit(page, `dark ${sport} scoring`);
    }
  });
});
