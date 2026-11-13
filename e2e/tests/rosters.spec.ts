import { expect, type Page, test } from '@playwright/test';
import { createOrganization, newPhone, register } from './helpers';

test('a player added by phone claims their profile and a second scorer sees the roster', async ({
  browser,
}) => {
  const admin = await (await browser.newContext()).newPage();
  await admin.goto('/auth/register');
  await register(admin, 'Coach Meera', newPhone(), 'owner password 1');
  await createOrganization(admin, 'Hill View School');

  // Build a team: one player invited by phone, one name-only.
  await admin.getByRole('link', { name: 'Teams' }).click();
  await admin.getByRole('button', { name: 'New team' }).click();
  await admin.getByLabel('Team name').fill('U17 Boys');
  await admin.getByRole('button', { name: 'Cricket' }).click();
  await admin.getByRole('button', { name: 'Create team' }).click();
  await expect(admin.getByRole('heading', { name: 'U17 Boys' })).toBeVisible();

  const raviPhone = newPhone();
  await admin.getByRole('button', { name: 'Add players' }).click();
  await admin.getByLabel('Mobile number').fill(raviPhone);
  await admin.getByRole('button', { name: 'Search' }).click();
  await expect(admin.getByText(/Not found, or their profile is private/)).toBeVisible();
  await admin.getByLabel('Name on this team').fill('Ravi K');
  await admin.getByRole('button', { name: 'Add and invite' }).click();
  await expect(admin.getByRole('button', { name: 'Send invitation' })).toBeVisible();

  await admin.getByRole('tab', { name: 'Name only' }).click();
  await admin.getByLabel('Name', { exact: true }).fill('Anil');
  await admin.getByRole('button', { name: 'Add to team' }).click();
  await expect(admin.getByText('Anil added')).toBeVisible();
  await admin.keyboard.press('Escape');

  const teamMembers = admin.getByRole('main').getByRole('listitem');
  await expect(teamMembers).toHaveCount(2);
  await expect(teamMembers.filter({ hasText: 'Ravi K' })).toContainText('Invited');

  // Ravi signs up with that number and confirms the team is really him.
  const ravi = await (await browser.newContext()).newPage();
  await ravi.goto('/auth/register');
  await register(ravi, 'Ravi Kumar', raviPhone, 'ravi password 1');
  await ravi.getByRole('link', { name: 'Profile' }).click();
  await expect(ravi.getByText('Hill View School added you as “Ravi K”.')).toBeVisible();
  await ravi.getByRole('button', { name: "That's me" }).click();
  await expect(ravi.getByText("Waiting for the team's admin")).toBeVisible();

  // The admin approves the claim from the roster.
  await admin.goto('/app/teams/roster');
  await expect(admin.getByText(/The account “Ravi Kumar” says it is Ravi K/)).toBeVisible();
  await admin.getByRole('button', { name: 'Approve' }).click();
  await expect(admin.getByText('Claim approved')).toBeVisible();
  await expect(
    admin.getByRole('main').getByRole('listitem').filter({ hasText: 'Ravi K' }),
  ).toContainText('Linked');

  // A second scorer on another device sees the same team and roster.
  await admin.goto('/app/workspaces/' + (await currentWorkspaceId(admin)));
  await admin.getByRole('button', { name: 'Create link' }).click();
  const link = await admin.getByLabel('Invitation link').inputValue();

  const scorer = await (await browser.newContext()).newPage();
  await scorer.goto(link);
  await scorer.getByRole('link', { name: 'Create account' }).click();
  await register(scorer, 'Kiran', newPhone(), 'scorer password 1');
  await scorer.getByRole('button', { name: 'Join' }).click();
  await expect(scorer.getByRole('heading', { name: 'Hill View School', level: 1 })).toBeVisible();
  await scorer.getByRole('link', { name: 'Teams' }).click();
  await scorer.getByRole('link', { name: /U17 Boys/ }).click();
  const seen = scorer.getByRole('main').getByRole('listitem');
  await expect(seen).toHaveCount(2);
  await expect(seen.filter({ hasText: 'Ravi K' })).toContainText('Linked');
  await expect(seen.filter({ hasText: 'Anil' })).toBeVisible();
  await scorer.screenshot({ path: 'test-results/screens/team-detail.png', fullPage: true });
});

/** Reads the selected workspace ID the app keeps in localStorage. */
async function currentWorkspaceId(page: Page): Promise<string> {
  return page.evaluate(() => localStorage.getItem('scoresphere.currentWorkspace') ?? '');
}
