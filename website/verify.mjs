import {chromium} from '@playwright/test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const browser=await chromium.launch({headless:true});
try {
const page=await browser.newPage({viewport:{width:1440,height:1000}});
async function settleMotion(page) {
 for (const node of await page.locator('[data-reveal]').all()) { await node.scrollIntoViewIfNeeded(); await page.waitForTimeout(80); }
 await page.waitForTimeout(1500);
 await page.evaluate(()=>scrollTo({top:0,behavior:'instant'}));
}
const errors=[];page.on('pageerror',e=>errors.push(e.message));
for(const route of ['','info/','download/','guida/','supporto/'])for(const lang of ['it','en']){
 const response=await page.goto('http://127.0.0.1:4319/'+route+'?lang='+lang);
 assert.equal(response.status(),200);await page.waitForSelector('main h1');
 assert.equal(await page.locator('html').getAttribute('lang'),lang);
 assert.equal(await page.locator('.table-demo,[data-life],[data-reset]').count(),0,'No inaccurate game demo');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' desktop overflow');
 await page.locator('img').first().waitFor();
 await page.waitForFunction(()=>Array.from(document.images).every(i=>i.complete&&i.naturalWidth>0));
 await settleMotion(page);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
 const accessibility=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
 assert.deepEqual(accessibility.violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})),[],route+' '+lang+' accessibility');
}
await page.goto('http://127.0.0.1:4319');
assert.equal(await page.locator('a[href*="app.21life.win"]').count()>0,true,'Launch domain');
await page.goto('http://127.0.0.1:4319/download/');
assert.equal(await page.locator('main').textContent().then(s=>/iOS|iPad|iPhone|F-Droid|IPA/.test(s)),false,'Hidden download platforms remain hidden');
const release=await page.evaluate(()=>window.TWENTYONE_RELEASE);
assert.equal(release.version,'9.1.2','Release version');
if(release.downloadsEnabled){
 assert.equal(await page.locator('a[href$=".apk"]').count(),1,'Published APK is downloadable');
 assert.equal(await page.locator('a[href$=".apk"]').getAttribute('href'),release.apkUrl,'Verified release APK link');
 assert.equal(await page.locator('[aria-disabled="true"]').count(),0,'Published download is enabled');
}else{
 assert.equal(await page.locator('a[href$=".apk"]').count(),0,'Unreleased APK must not be downloadable');
 assert.equal(await page.locator('[aria-disabled="true"]').count(),1,'Release download is staged');
}
assert.equal(await page.locator('body').textContent().then(s=>s.includes('9.0.5')),false,'No obsolete release copy');
await page.context().grantPermissions(['clipboard-read','clipboard-write']);
await page.locator('[data-copy]').click();
await page.waitForFunction(()=>document.querySelector('#copy-status').textContent==='Address copied.');
assert.equal(await page.evaluate(()=>navigator.clipboard.readText()),'https://github.com/marco201091-glitch/21life','Obtainium copy works');
await page.evaluate(()=>scrollTo(0,0));
await settleMotion(page); await page.screenshot({path:'../artifacts/21life-website-download-desktop.png',fullPage:true});
await page.goto('http://127.0.0.1:4319/supporto/#account');assert.equal(await page.locator('#account').count(),1);
assert.equal(await page.locator('a[href*="legal/delete-account"]').count(),0,'No known broken deletion URL');
await page.goto('http://127.0.0.1:4319');
assert.equal(await page.locator('html').getAttribute('lang'),'en','English by default');
await page.locator('[data-lang]').click();assert.equal(await page.locator('html').getAttribute('lang'),'it');
await page.locator('a[href="/info/?lang=it"]').first().click();assert.equal(await page.locator('html').getAttribute('lang'),'it','Italian preserved during navigation');
await page.goto('http://127.0.0.1:4319');
await page.evaluate(()=>{document.activeElement.blur();scrollTo(0,0)});
const art=await page.locator('.hero-art img').boundingBox();assert.ok(Math.abs(art.width-art.height)<1,'Emblem proportions');
await settleMotion(page); await page.screenshot({path:'../artifacts/21life-website-desktop.png',fullPage:true});
await page.setViewportSize({width:390,height:844});
for(const route of ['','info/','download/','guida/','supporto/']){
await page.goto('http://127.0.0.1:4319/'+route);
await settleMotion(page);
 await page.addScriptTag({path:require.resolve('axe-core/axe.min.js')});
const mobileAccessibility=await page.evaluate(async()=>window.axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}}));
assert.deepEqual(mobileAccessibility.violations.map(v=>v.id),[],route+' mobile accessibility');
 assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' mobile overflow');
 await page.locator('[data-menu]').click();assert.equal(await page.locator('[data-menu]').getAttribute('aria-expanded'),'true');
 await page.keyboard.press('Escape');assert.equal(await page.locator('[data-menu]').getAttribute('aria-expanded'),'false');
}
await page.goto('http://127.0.0.1:4319');await settleMotion(page); await page.screenshot({path:'../artifacts/21life-website-mobile.png',fullPage:true});
assert.deepEqual(errors,[]);
const context=await browser.newContext({javaScriptEnabled:false});const staticPage=await context.newPage();
await staticPage.goto('http://127.0.0.1:4319/info/');assert.equal(await staticPage.locator('main h1').count(),1);
assert.equal(await staticPage.locator('html').getAttribute('lang'),'en','Static default language');
console.log('PASS: 10 page/language combinations, WCAG A/AA axe checks, assets, desktop/mobile layouts, language toggle/navigation, menu/Escape, no-JS content, 9.1.2 downloads; zero runtime errors.');
} finally {await browser.close()}
