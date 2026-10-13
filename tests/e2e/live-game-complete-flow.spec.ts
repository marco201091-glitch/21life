import { expect, test } from '@playwright/test';
import { fixtureLogin } from './fixture-login';
import AxeBuilder from '@axe-core/playwright';

test('wizard → damage → Last Standing → recap', async ({ page, browser }) => {
  test.setTimeout(90_000);
  test.skip(process.env.E2E_LIVE_GAME_FLOW !== '1', 'Set E2E_LIVE_GAME_FLOW=1 for the state-changing live flow.');
  const identifier = process.env.E2E_USERNAME;
  const password = process.env.E2E_PASSWORD;
  test.skip(!identifier || !password, 'E2E credentials are required.');

  await fixtureLogin(page);
  await page.getByRole('button', { name: /Open|Apri/ }).first().click();
  await page.getByRole('button', { name: /Play Game|Gioca live/ }).click();
  await page.getByRole('button', { name: /^2$/ }).click();
  await page.getByRole('button', { name: /Step 4|Passaggio 4/ }).click();
  const wizardA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(wizardA11y.violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? ''))).toEqual([]);

  for (let seatIndex = 0; seatIndex < 2; seatIndex += 1) {
    await page.getByRole('button', { name: new RegExp(`^(Seat|Posto) ${seatIndex + 1}`) }).click();
    const select = page.getByTestId('live-player-select');
    const option = select.locator('option:not([disabled])').filter({ hasNotText: /Choose player|Scegli giocatore/ }).first();
    await select.selectOption((await option.getAttribute('value'))!);
    await page.getByTestId('live-deck-option').first().click();
  }

  await page.evaluate(() => localStorage.setItem('live-onboarding-v1', 'done'));
  await page.getByTestId('live-start').click();
  await expect(page.getByTestId('live-end')).toBeVisible({ timeout: 20_000 });
  const arenaA11y = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze();
  expect(arenaA11y.violations.filter((entry) => ['serious', 'critical'].includes(entry.impact ?? ''))).toEqual([]);
  const journal = () => page.evaluate((groupId) => {
    const key = `phyrexian-arena:web-live-game:v1:${groupId}`;
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  }, process.env.E2E_GROUP_ID);
  if (process.env.E2E_GROUP_ID) {
    await expect.poll(async () => (await journal())?.mutations.length).toBe(0);
    const before = (await journal()).record.state.players[0].life;
    await page.route('**/rest/v1/rpc/apply_live_game_mutation*', (route) => route.abort());
    await page.getByRole('button', { name: /Reduce life for|Riduci punti vita di/ }).first().click();
    await expect.poll(async () => (await journal())?.mutations.length).toBe(1);
    await expect.poll(async () => (await journal())?.record.state.players[0].life).toBe(before - 1);
    await page.reload();
    await expect(page.getByTestId('live-end')).toBeVisible();
    await expect.poll(async () => (await journal())?.mutations.length).toBe(1);
    await page.unroute('**/rest/v1/rpc/apply_live_game_mutation*');
    await page.getByRole('button', { name: /Retry sync|Riprova sync/ }).click();
    await expect.poll(async () => (await journal())?.mutations.length, { timeout: 20_000 }).toBe(0);
    expect((await journal()).serverRecord.state.players[0].life).toBe(before - 1);
    await page.route('**/rest/v1/rpc/apply_live_game_mutation*', (route) => route.fulfill({
      status: 401, contentType: 'application/json',
      body: JSON.stringify({ code: 'PGRST301', message: 'JWT expired', details: null, hint: null }),
    }));
    await page.getByRole('button', { name: /Reduce life for|Riduci punti vita di/ }).first().click();
    await expect(page.getByRole('button', { name: /Retry sync|Riprova sync/ })).toBeVisible();
    expect((await journal()).mutations.length).toBe(1);
    expect((await journal()).record.state.players[0].life).toBe(before - 2);
    await page.unroute('**/rest/v1/rpc/apply_live_game_mutation*');
    await page.getByRole('button', { name: /Retry sync|Riprova sync/ }).click();
    await expect.poll(async () => (await journal())?.mutations.length).toBe(0);
    const secondContext = await browser.newContext({ storageState: await page.context().storageState() });
    try {
      const secondPage = await secondContext.newPage();
      const diagnostics: unknown[] = [];
      for (const [index, clientPage] of [[0, page], [1, secondPage]] as const) {
        clientPage.on('response', async (response) => {
          if (!response.url().includes('/rpc/apply_live_game_mutation')) return;
          const result = await response.json().catch(() => null);
          diagnostics.push({ client: index, status: response.status(), applied: result?.applied, version: result?.record?.state?.version, life: result?.record?.state?.players?.[0]?.life });
        });
        clientPage.on('websocket', (socket) => socket.on('framereceived', ({ payload }) => {
          try {
            const message = JSON.parse(String(payload));
            diagnostics.push({ client: index, realtimeEvent: message.event, status: message.payload?.status, version: message.payload?.data?.record?.state?.version });
          } catch { /* Binary frames have no diagnostic state. */ }
        }));
      }
      await secondPage.goto(new URL(`/table/${process.env.E2E_GROUP_ID}/play`, page.url()).href);
      await expect(secondPage.getByTestId('live-end')).toBeVisible();
      await Promise.all([page, secondPage].map((clientPage) =>
        clientPage.getByRole('button', { name: /Reduce life for|Riduci punti vita di/ }).first().click()
      ));
      try { for (const clientPage of [page, secondPage]) {
        await expect.poll(() => clientPage.evaluate((groupId) => {
          const value = JSON.parse(localStorage.getItem(`phyrexian-arena:web-live-game:v1:${groupId}`)!);
          return { life: value.serverRecord.state.players[0].life, pending: value.mutations.length };
        }, process.env.E2E_GROUP_ID), { timeout: 20_000 }).toEqual({ life: before - 4, pending: 0 });
      }
      } finally {
        console.log('Synthetic sync boundaries:', JSON.stringify(diagnostics));
        await test.info().attach('sync-boundaries', { body: JSON.stringify(diagnostics), contentType: 'application/json' });
      }
    } finally {
      await secondContext.close();
    }
  }
  await page.getByRole('button', { name: /Reduce life for|Riduci punti vita di/ }).first().click();
  await page.getByTestId('live-end').focus();
  await page.keyboard.press('Enter');
  const endDialog = page.getByRole('dialog');
  await expect(endDialog).toBeVisible();
  await endDialog.getByRole('button', { name: /^Close$|^Chiudi$/ }).click();
  await expect(page.getByTestId('live-end')).toBeFocused();
  await page.keyboard.press('Enter');
  await page.getByTestId('live-winner').first().click();
  await page.getByTestId('live-win-last_standing').click();
  let lostFinalizationResponse = false;
  if (process.env.E2E_GROUP_ID) {
    await page.route('**/rest/v1/rpc/finalize_live_game*', async (route) => {
      if (lostFinalizationResponse) return route.continue();
      const response = await route.fetch();
      expect(response.ok()).toBe(true);
      lostFinalizationResponse = true;
      await route.abort();
    });
  }
  await page.getByTestId('live-save').click();
  if (process.env.E2E_GROUP_ID) {
    await expect.poll(() => lostFinalizationResponse).toBe(true);
    await expect.poll(async () => (await journal())?.pendingFinalization != null).toBe(true);
    await page.unroute('**/rest/v1/rpc/finalize_live_game*');
    await page.reload();
  }
  await expect(page.getByText(/Game saved|Partita salvata/).first()).toBeVisible({ timeout: 20_000 });
  await expect(page.getByRole('button', { name: /Share|Condividi/ })).toBeVisible();
});
