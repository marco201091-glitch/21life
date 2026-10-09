import {expect,test} from '@playwright/test';

test.use({locale:'it-IT'});
test.beforeEach(async({page})=>{
  await page.addInitScript(()=>Object.defineProperty(navigator,'language',{value:'it-IT'}));
});
test('English is default even in an Italian browser without a saved preference',async({page})=>{
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('label[for="loginIdentifier"]')).toHaveText('Email or username');
  await expect(page.locator('html')).toHaveAttribute('lang','en');
});
test('stored Italian remains selected and declares the correct document language',async({page})=>{
  await page.addInitScript(()=>localStorage.setItem('phyrexian-arena-language','it'));
  await page.goto('/auth/login');
  await page.waitForLoadState('networkidle');
  await expect(page.locator('label[for="loginIdentifier"]')).toHaveText('Email o username');
  await expect(page.locator('html')).toHaveAttribute('lang','it');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('lang','it');
});
