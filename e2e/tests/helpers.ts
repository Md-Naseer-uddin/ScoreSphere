import { expect, type Page } from '@playwright/test';

let counter = 0;

/** A unique valid Indian mobile number per call. */
export function newPhone(): string {
  counter += 1;
  return `9${String(Date.now() % 1e5).padStart(5, '0')}${String(counter).padStart(4, '0')}`;
}

/** Fills the registration form and gets past the recovery-code screen. Returns the code. */
export async function register(
  page: Page,
  name: string,
  phone: string,
  password: string,
): Promise<string> {
  await page.getByLabel('Name').fill(name);
  await page.getByLabel('Mobile number').fill(phone);
  await page.getByLabel('Password', { exact: true }).fill(password);
  await page.getByLabel('I confirm I am 18 or older.').check();
  await page.getByRole('button', { name: 'Create account' }).click();

  await expect(page.getByRole('heading', { name: 'Save your recovery code' })).toBeVisible();
  const code = (await page.getByLabel('Save your recovery code').textContent())?.trim() ?? '';
  expect(code).toMatch(/^[0-9A-Z]{4}(-[0-9A-Z]{4}){3}$/);
  await page.getByLabel("I've saved my recovery code somewhere safe.").check();
  await page.getByRole('button', { name: 'Continue' }).click();
  return code;
}

/** Creates an organization from the workspace switcher and lands on its settings page. */
export async function createOrganization(page: Page, name: string): Promise<void> {
  await page.getByRole('button', { name: /Personal/ }).click();
  await page.getByRole('menuitem', { name: 'New organization' }).click();
  await page.getByLabel('Name').fill(name);
  await page.getByRole('button', { name: 'Create organization' }).click();
  await expect(page.getByRole('heading', { name, level: 1 })).toBeVisible();
}
