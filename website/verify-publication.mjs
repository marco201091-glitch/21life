import fs from 'node:fs';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {chromium} from '@playwright/test';
const root=new URL('./dist/',import.meta.url);
const csp=fs.readFileSync(new URL('./nginx.conf',import.meta.url),'utf8').match(/add_header Content-Security-Policy "([^"]+)"/)[1];
const token=JSON.parse(fs.readFileSync(new URL('./analytics-config.json',import.meta.url),'utf8')).token;
const preview=process.env.PREVIEW_URL||'http://127.0.0.1:4319';
for(const route of ['','info/','download/','guida/','confronto/','supporto/']){
 const html=fs.readFileSync(new URL(route+'index.html',root),'utf8');
 const schemaBlocks=[...html.matchAll(/<script(?: id="[^"]*")? type="application\/ld\+json">(.*?)<\/script>/g)].map(m=>m[1]);
 const schemaText=schemaBlocks[0];
 const graph=JSON.parse(schemaText)['@graph'];
 assert.ok(graph.some(n=>n['@type']==='SoftwareApplication'&&n.name==='21Life'));
 assert.ok(csp.includes("'sha256-"+createHash('sha256').update(schemaText).digest('base64')+"'"));
 for(const block of schemaBlocks)assert.ok(csp.includes("'sha256-"+createHash('sha256').update(block).digest('base64')+"'"));
 assert.ok(html.includes('content="index,follow,max-image-preview:large"'));
 assert.ok(!html.includes('noindex'));
 assert.equal((html.match(/src="\/analytics.js"/g)||[]).length,1);
 assert.ok(html.includes(`rel="canonical" href="https://21life.win/${route}"`));
}
const browser=await chromium.launch();
try{
 const page=await browser.newPage();
 const violations=[];const runtime=[];const beacons=[];
 await page.addInitScript(()=>document.addEventListener('securitypolicyviolation',e=>window.__cspViolations=(window.__cspViolations||[]).concat(e.violatedDirective+': '+e.blockedURI)));
 page.on('pageerror',e=>runtime.push(e.message));
 await page.route('https://cloudflareinsights.com/**',async route=>{
  beacons.push(route.request().postDataJSON());
  await route.fulfill({status:204,headers:{'access-control-allow-origin':'*'}});
 });
 await page.route('https://21life.win/**',async route=>{
  const pathname=new URL(route.request().url()).pathname;
  const local=await page.request.get(preview+pathname);
  const headers={...local.headers(),'content-security-policy':csp};
  if(pathname.endsWith('.webp'))headers['content-type']='image/webp';
  await route.fulfill({status:local.status(),headers,body:await local.body()});
 });
 await page.goto('https://21life.win/?lang=it');
 await page.waitForFunction(()=>performance.getEntriesByType('resource').some(e=>e.name.includes('beacon.min.js')));
 // The beacon normally reports on page hide. Force that lifecycle signal without navigating.
 await page.evaluate(()=>window.dispatchEvent(new Event('pagehide')));
 await page.waitForTimeout(1500);
 const scripts=await page.locator('script[src*="static.cloudflareinsights.com"]').count();
 assert.equal(scripts,1);
 assert.equal(await page.locator('script[src*="static.cloudflareinsights.com"]').getAttribute('data-cf-beacon'),JSON.stringify({token}));
 violations.push(...await page.evaluate(()=>window.__cspViolations||[]));
 assert.deepEqual(violations,[],'CSP must permit the page and analytics');
 assert.deepEqual(runtime,[]);
 assert.ok(beacons.some(b=>b.siteToken===token),'Real beacon code must submit the configured site token');
 assert.deepEqual(await page.context().cookies(),[],'No analytics cookies');
 const localPage=await browser.newPage();await localPage.goto(preview+'/');
 assert.equal(await localPage.locator('script[src*="static.cloudflareinsights.com"]').count(),0,'Local previews must not count as visits');
 console.log('PASS: structured data, canonical URLs, CSP hashes, production beacon submission, no cookies, local tracking disabled.');
}finally{await browser.close();}
