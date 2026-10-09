import { expect, test } from '@playwright/test';

for (const reducedMotion of ['no-preference', 'reduce'] as const) {
  test(`quick game life feedback (${reducedMotion})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion });
    await page.goto('/counter');
    await page.getByRole('button', { name: 'Start game' }).click();
    const seat = page.locator('section').first();
    const total = seat.locator('.font-black.leading-none');
    const before = await total.boundingBox();
    await seat.getByRole('button').nth(1).click();
    await expect(total).toHaveText('41');
    await expect(seat.getByText('+1', { exact: true })).toBeVisible();
    await seat.getByRole('button').nth(1).click();
    await expect(total).toHaveText('42');
    await expect(seat.getByText('+2', { exact: true })).toBeVisible();
    if (reducedMotion === 'reduce') {
      expect(await total.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      expect(await seat.locator('.life-delta-float').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    }
    await expect(seat.locator('.life-delta-float')).toHaveCount(0, { timeout: 4_000 });
    const after = await total.boundingBox();
    expect(after?.x).toBeCloseTo(before!.x, 0);
    expect(after?.y).toBeCloseTo(before!.y, 0);
    await seat.getByRole('button').nth(0).click();
    await expect(total).toHaveText('41');
    await expect(seat.getByText('−1', { exact: true })).toBeVisible();
  });
}
