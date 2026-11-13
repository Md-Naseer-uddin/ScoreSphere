import { expect, test } from '@playwright/test';
import { newPhone, register } from './helpers';

test('register, create an organization, invite a scorer who joins through the link', async ({
  browser,
}) => {
  // Owner signs up and creates an organization.
  const ownerContext = await browser.newContext();
  const owner = await ownerContext.newPage();
  await owner.goto('/');
  await expect(owner.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await owner.getByRole('link', { name: 'Create account' }).click();
  await register(owner, 'Coach Meera', newPhone(), 'owner password 1');
  await expect(owner.getByRole('heading', { name: 'Ready to score' })).toBeVisible();

  await owner.getByRole('button', { name: /Personal/ }).click();
  await owner.getByRole('menuitem', { name: 'New organization' }).click();
  await owner.getByLabel('Name').fill('Riverside Cricket Academy');
  await owner.getByRole('button', { name: 'Create organization' }).click();
  await expect(
    owner.getByRole('heading', { name: 'Riverside Cricket Academy', level: 1 }),
  ).toBeVisible();

  // Owner creates a single-use invitation link for a scorer.
  await owner.getByRole('button', { name: 'Create link' }).click();
  const link = await owner.getByLabel('Invitation link').inputValue();
  expect(link).toMatch(/\/join#[\w-]{20,}$/);
  await owner.screenshot({
    path: 'test-results/screens/organization-settings.png',
    fullPage: true,
  });

  // A new person opens the link, signs up, and lands back on the invitation.
  const joinerContext = await browser.newContext();
  const joiner = await joinerContext.newPage();
  await joiner.goto(link);
  await expect(joiner.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await joiner.getByRole('link', { name: 'Create account' }).click();
  await register(joiner, 'Kiran', newPhone(), 'joiner password 1');
  await expect(
    joiner.getByRole('heading', { name: 'Join Riverside Cricket Academy' }),
  ).toBeVisible();
  await expect(joiner.getByText("You've been invited as Scorer.")).toBeVisible();
  await joiner.getByRole('button', { name: 'Join' }).click();
  await expect(
    joiner.getByRole('heading', { name: 'Riverside Cricket Academy', level: 1 }),
  ).toBeVisible();

  // The owner sees the new member with the invited role.
  await owner.reload();
  const kiran = owner.getByRole('listitem').filter({ hasText: 'Kiran' });
  await expect(kiran).toBeVisible();
  await expect(owner.getByRole('combobox', { name: 'Role for Kiran' })).toHaveText('Scorer');

  await ownerContext.close();
  await joinerContext.close();
});

test('sign out, sign back in, and reset a forgotten password with the recovery code', async ({
  page,
}) => {
  const phone = newPhone();
  await page.goto('/auth/register');
  const code = await register(page, 'Asha', phone, 'first password 1');

  await page.getByRole('link', { name: 'Profile' }).click();
  await expect(page.getByText(`+91 ••••••${phone.slice(-4)}`)).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/profile.png', fullPage: true });
  await page.getByRole('button', { name: 'Sign out' }).last().click();
  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();

  await page.getByRole('link', { name: 'Forgot password?' }).click();
  await expect(page.getByRole('heading', { name: 'Reset your password' })).toBeVisible();
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Recovery code').fill(code);
  await page.getByLabel('New password').fill('second password 2');
  await page.getByRole('button', { name: 'Reset password' }).click();
  await expect(page.getByRole('heading', { name: 'Save your recovery code' })).toBeVisible();
  await page.getByLabel("I've saved my recovery code somewhere safe.").check();
  await page.getByRole('button', { name: 'Continue' }).click();

  await expect(page.getByRole('heading', { name: 'Sign in' })).toBeVisible();
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill('first password 1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('Mobile number or password is incorrect.')).toBeVisible();

  await page.getByLabel('Password', { exact: true }).fill('second password 2');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Ready to score' })).toBeVisible();
  await page.screenshot({ path: 'test-results/screens/home.png', fullPage: true });
});
