import { expect, type Page, test } from '@playwright/test';
import { query } from './db';
import { newPhone, register } from './helpers';

const nameBox = (page: Page, side: 'A' | 'B', n: number) =>
  page.getByRole('textbox', { name: `Name for Side ${side} player ${n}` });

async function startCricket(page: Page) {
  await page.goto('/app/matches/new?sport=cricket');
  await page.getByLabel('Overs per side').fill('1');
  await page.getByRole('button', { name: 'Continue' }).click();
}

test('players are saved for next time, team names are required and can be fixed later', async ({
  page,
}) => {
  await page.goto('/auth/register');
  await register(page, 'Coach Imran', newPhone(), 'players password 1');

  // First match: every name typed by hand. Team names start empty and are required.
  await startCricket(page);
  await expect(page.getByLabel('Side A name')).toHaveValue('');
  await nameBox(page, 'A', 1).fill('Asha');
  await nameBox(page, 'A', 2).fill('Bina');
  await nameBox(page, 'B', 1).fill('Ravi');
  await nameBox(page, 'B', 2).fill('Dev');
  await expect(page.getByRole('button', { name: 'Start match' })).toBeDisabled();
  await expect(page.getByText('Enter a name for each team.')).toBeVisible();
  await page.getByLabel('Side A name').fill('Lions');
  await page.getByLabel('Side B name').fill('Team B');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const firstMatch = page.url().split('/').at(-2)!;

  // Second match: side A from the saved list, side B from suggestions while typing.
  await startCricket(page);
  await page.getByRole('button', { name: 'Choose saved players for side A' }).click();
  await page.getByRole('checkbox', { name: 'Asha' }).check();
  await page.getByRole('checkbox', { name: 'Bina' }).check();
  await page.getByRole('button', { name: 'Add 2 players' }).click();
  await expect(nameBox(page, 'A', 1)).toHaveValue('Asha');
  await expect(nameBox(page, 'A', 2)).toHaveValue('Bina');
  await nameBox(page, 'B', 1).fill('ra');
  await page
    .getByRole('group', { name: 'Saved players' })
    .getByRole('button', { name: 'Ravi' })
    .click();
  await expect(nameBox(page, 'B', 1)).toHaveValue('Ravi');
  // A typed name that matches a saved player is that player, whatever the case.
  await nameBox(page, 'B', 2).fill('dev');
  await page.getByLabel('Side A name').fill('Lions');
  await page.getByLabel('Side B name').fill('Tigers');
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);
  const secondMatch = page.url().split('/').at(-2)!;
  await expect(page.locator('[data-sync-state]')).toHaveText('Synced', { timeout: 30_000 });

  // Four roster members, each once, and both matches linked to them.
  const roster = await query<{ display_name: string }>(
    `select r.display_name from roster_members r
       join match_side_participants p on p.roster_member_id = r.id
      where p.match_id = $1 order by 1`,
    [secondMatch],
  );
  expect(roster.map((r) => r.display_name)).toEqual(['Asha', 'Bina', 'Dev', 'Ravi']);
  const [linked] = await query<{ members: number }>(
    `select count(distinct r.id)::int as members from roster_members r
       join match_side_participants p on p.roster_member_id = r.id
      where p.match_id = any($1::uuid[])`,
    [[firstMatch, secondMatch]],
  );
  expect(linked?.members).toBe(4);

  // The ⋮ menu is drawn on a solid background, not over the screen behind it.
  await page.getByRole('button', { name: 'Match options' }).click();
  const menu = page.getByRole('menu');
  await expect(menu).toBeVisible();
  await expect(menu).not.toHaveCSS('background-color', 'rgba(0, 0, 0, 0)');
  await page.keyboard.press('Escape');

  // The first match's "Team B" is fixed afterwards.
  await page.goto(`/app/matches/${firstMatch}`);
  await page.getByRole('button', { name: 'Rename teams' }).click();
  await page.getByLabel('Side B name').fill('Rayyan XI');
  await page.getByRole('button', { name: 'Save' }).click();
  await expect(page.getByRole('heading', { name: 'Lions vs Rayyan XI' })).toBeVisible();
  const [side] = await query<{ name: string }>(
    'select name from match_sides where match_id = $1 and side = 1',
    [firstMatch],
  );
  expect(side?.name).toBe('Rayyan XI');

  // Dark theme is a choice in Profile, and it sticks.
  await page.goto('/app/profile');
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
  await page.getByRole('radio', { name: /Dark/ }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
});
