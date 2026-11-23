import { expect, test } from '@playwright/test';
import { query } from './db';
import { newPhone, register } from './helpers';

test('a cricket knockout: teams made from the tournament, their players kept for the next match', async ({
  page,
}) => {
  await page.goto('/auth/register');
  await register(page, 'Coach Sameer', newPhone(), 'knockout password 1');
  const run = String(Date.now() % 1e6);
  const [lions, tigers] = [`Lions ${run}`, `Tigers ${run}`];

  await page.goto('/app/tournaments');
  await page.getByRole('link', { name: 'New tournament' }).click();
  await page.getByLabel('Tournament name').fill('Gully Cup');
  await page
    .getByRole('radiogroup', { name: 'Sport' })
    .getByRole('radio', { name: 'Cricket' })
    .click();
  await page.getByRole('radio', { name: 'Knockout' }).click();
  await page.getByLabel('Overs per side').fill('1');
  await page.getByRole('button', { name: 'Create tournament' }).click();
  await expect(page.getByRole('heading', { name: 'Gully Cup' })).toBeVisible();

  // No teams yet: they are created right here.
  await expect(page.getByText('No more teams in this workspace. Create one below.')).toBeVisible();
  for (const name of [lions, tigers]) {
    await page.getByLabel('New team').fill(name);
    await page.getByRole('button', { name: 'Create and add' }).click();
    await expect(page.getByText(new RegExp(`\\d\\.\\s*${name}`))).toBeVisible();
  }
  await page.getByRole('button', { name: 'Make fixtures' }).click();

  // The fixture brings the team names; the players are typed once.
  await page.getByRole('link', { name: 'Score' }).click();
  await expect(page.getByLabel('Side A name')).toHaveValue(lions);
  await expect(page.getByLabel('Side B name')).toHaveValue(tigers);
  const players = { A: ['Asha', 'Bina'], B: ['Ravi', 'Dev'] } as const;
  for (const side of ['A', 'B'] as const) {
    for (const [i, name] of players[side].entries()) {
      await page.getByRole('textbox', { name: `Name for Side ${side} player ${i + 1}` }).fill(name);
    }
  }
  await page.getByRole('button', { name: 'Start match' }).click();
  await page.waitForURL(/\/score$/);

  // They are now the teams' players.
  await expect
    .poll(async () =>
      (
        await query<{ team: string; player: string }>(
          `select t.name as team, r.display_name as player from team_memberships m
             join teams t on t.id = m.team_id join roster_members r on r.id = m.roster_member_id
            where t.name = any($1::text[]) and m.left_at is null order by 1, 2`,
          [[lions, tigers]],
        )
      ).map((r) => `${r.team.split(' ')[0]}:${r.player}`),
    )
    .toEqual(['Lions:Asha', 'Lions:Bina', 'Tigers:Dev', 'Tigers:Ravi']);

  // Next time, choosing the team fills its players in.
  await page.goto('/app/matches/new?sport=cricket');
  await page.getByRole('button', { name: 'Continue' }).click();
  await page.getByLabel('Saved team for side A').selectOption({ label: lions });
  await expect(page.getByLabel('Side A name')).toHaveValue(lions);
  const filled = await Promise.all(
    [1, 2].map((n) =>
      page.getByRole('textbox', { name: `Name for Side A player ${n}` }).inputValue(),
    ),
  );
  expect(filled.sort()).toEqual(['Asha', 'Bina']);
});
