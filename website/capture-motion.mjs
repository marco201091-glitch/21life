import {chromium} from '@playwright/test';
import fs from 'node:fs';
const dir='../artifacts/site-motion';fs.mkdirSync(dir,{recursive:true});
const b=await chromium.launch();const c=await b.newContext({viewport:{width:1440,height:900},recordVideo:{dir,size:{width:1440,height:900}}});const p=await c.newPage();await p.goto('http://127.0.0.1:4319');await p.waitForTimeout(1700);
for(const y of [650,1250,1900,2450]) {await p.evaluate(y=>scrollTo({top:y,behavior:'smooth'}),y);await p.waitForTimeout(1000)}
await p.goto('http://127.0.0.1:4319/supporto/');await p.waitForTimeout(900);await p.locator('summary').first().click();await p.waitForTimeout(700);await p.screenshot({path:dir+'/faq-desktop.png'});await p.locator('summary').first().click();await p.waitForTimeout(500);
const v=p.video();await c.close();await v.saveAs(dir+'/21life-motion-preview.webm');
const m=await b.newPage({viewport:{width:390,height:844}});await m.goto('http://127.0.0.1:4319');await m.waitForTimeout(1600);await m.locator('[data-menu]').click();await m.waitForTimeout(350);await m.screenshot({path:dir+'/menu-mobile.png'});await b.close();console.log('Motion preview and FAQ/mobile-menu screenshots saved.');
