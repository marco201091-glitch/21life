import { expect, test } from '@playwright/test';

for (const mode of ['normal', 'system', 'app'] as const) {
  test(`quick game life feedback (${mode})`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: mode === 'system' ? 'reduce' : 'no-preference' });
    if (mode === 'app') await page.addInitScript(() => {
      localStorage.setItem('phyrexian:counter-preferences:v1', JSON.stringify({ schemaVersion: 2, reducedMotion: true }));
    });
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
    if (mode !== 'normal') {
      expect(await total.evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
      expect(await seat.locator('.life-delta-float').evaluate((node) => getComputedStyle(node).animationName)).toBe('none');
    }
    await expect(seat.locator('.life-delta-float')).toHaveCount(0, { timeout: 4_000 });
    const after = await total.boundingBox();
    // Rotated seats expose digit-width changes on the vertical axis.
    expect(after!.x + after!.width / 2).toBeCloseTo(before!.x + before!.width / 2, 0);
    expect(after!.y + after!.height / 2).toBeCloseTo(before!.y + before!.height / 2, 0);
    await seat.getByRole('button').nth(0).click();
    await expect(total).toHaveText('41');
    await expect(seat.getByText('−1', { exact: true })).toBeVisible();
  });
}
