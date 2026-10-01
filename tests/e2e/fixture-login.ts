import { expect, type Page } from '@playwright/test';

export async function fixtureLogin(page: Page) {
  await page.goto('/auth/login');
  if (process.env.E2E_SESSION_COOKIES) {
    const url = new URL(page.url()).origin;
    await page.context().addCookies(JSON.parse(process.env.E2E_SESSION_COOKIES).map((cookie: { name: string; value: string }) => ({ ...cookie, url })));
    await page.goto('/dashboard');
  } else {
    await page.getByLabel('Email or username').fill(process.env.E2E_USERNAME!);
    await page.getByLabel('Password', { exact: true }).fill(process.env.E2E_PASSWORD!);
    await page.getByRole('button', { name: /^Enter(?: Playgroup)?$/ }).click();
  }
  await expect(page).toHaveURL(/\/dashboard$/);
}
