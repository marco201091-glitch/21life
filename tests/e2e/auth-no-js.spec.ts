import {expect,test} from '@playwright/test';
test.use({javaScriptEnabled:false});
test('an unhydrated login never puts credentials in the navigation URL',async({page})=>{
  await page.goto('/auth/login');
  await expect(page.getByLabel('Email or username')).toBeDisabled();
  await expect(page.getByLabel('Password',{exact:true})).toBeDisabled();
  await expect(page.getByRole('button',{name:'Enter',exact:true})).toBeDisabled();
  await expect(page.locator('form')).toHaveAttribute('method','post');
});
