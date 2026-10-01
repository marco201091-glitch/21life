import AxeBuilder from '@axe-core/playwright';
import { expect, test } from '@playwright/test';
import { fixtureLogin } from './fixture-login';

test('synthetic deck archive restores selection and has accessible screens', async ({ page }) => {
  test.skip(!process.env.E2E_GROUP_ID, 'Requires the disposable staging fixture runner.');
  await fixtureLogin(page);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'IMP synthetic deck 1', exact: true })).toBeVisible();
  await page.getByRole('button', { name: /Archive deck|Archivia mazzo/ }).first().click();
  await expect(page.getByRole('heading', { name: 'IMP synthetic deck 1', exact: true })).toHaveCount(0);
  await page.getByRole('link', { name: /Archived|Archiviati/ }).click();
  await expect(page.getByText('IMP synthetic deck 1', { exact: true })).toBeVisible();
  const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(results.violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? ''))).toEqual([]);
  await page.getByRole('button', { name: /^Restore$|^Ripristina$/ }).click();
  await expect(page.getByText('IMP synthetic deck 1', { exact: true })).toHaveCount(0);
  await page.goto('/profile');
  await expect(page.getByRole('heading', { name: 'IMP synthetic deck 1', exact: true })).toBeVisible();
});
