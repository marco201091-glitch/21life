import {expect,test} from '@playwright/test';
test.use({javaScriptEnabled:false});
test('an unhydrated login never puts credentials in the navigation URL',async({page})=>{
  await page.goto('/auth/login');
  // Static production renders the Suspense fallback; Dev can server-render the form.
  // Neither may expose usable credential inputs before hydration.
  await expect(page.locator('input[name="username"]:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('input[name="password"]:not(:disabled)')).toHaveCount(0);
  await expect(page.locator('form:not([method="post"])')).toHaveCount(0);
});
