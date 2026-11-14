import { expect, test } from '@playwright/test';
import { newPhone, register } from './helpers';

test('a user reads the privacy notice, downloads their data and deletes their account', async ({
  page,
}) => {
  await page.goto('/auth/register');
  await page.getByRole('link', { name: 'Privacy notice' }).click();
  await expect(page.getByRole('heading', { name: 'Privacy notice', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Your rights' })).toBeVisible();

  const phone = newPhone();
  await page.goto('/auth/register');
  await register(page, 'Kavya', phone, 'kavya password 1');
  await page.getByRole('link', { name: 'Profile' }).click();

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Download my data' }).click();
  const file = await download;
  expect(file.suggestedFilename()).toBe('scoresphere-my-data.json');
  const exported = JSON.parse(
    await (await file.createReadStream()).toArray().then((c) => Buffer.concat(c).toString()),
  );
  expect(exported.profile.displayName).toBe('Kavya');

  await page.getByRole('button', { name: 'Delete account' }).click();
  await page.getByLabel('Password').fill('wrong password');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('alert')).toHaveText('That password is not right.');
  await page.getByLabel('Password').fill('kavya password 1');
  await page.getByRole('button', { name: 'Delete my account' }).click();
  await expect(page.getByRole('heading', { name: 'Create your account' })).toBeVisible();

  await page.goto('/auth/login');
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill('kavya password 1');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('alert')).toBeVisible();
});
