const {chromium}=require('playwright');
const assert=require('node:assert/strict');
const fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch();
 try{
  const page=await browser.newPage();
  await page.emulateMedia({reducedMotion:'reduce'});
  const errors=[];const analytics=[];
  page.on('pageerror',e=>errors.push(e.message));
  page.on('request',r=>{if(/cloudflareinsights/.test(r.url()))analytics.push(r.url())});
  for(const width of [1440,900,390]){
   await page.setViewportSize({width,height:1000});
   for(const route of ['','info/','download/','guida/','confronto/','supporto/']){
    for(const lang of ['it','en']){
     const r=await page.goto(`http://127.0.0.1:4321/${route}?lang=${lang}`);
     assert.equal(r.status(),200);
     await page.waitForFunction(l=>document.documentElement.lang===l,lang);
     assert.equal(await page.locator('h1').count(),1);
     assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,route+' '+lang+' '+width+' overflow');
     assert.equal(await page.locator('meta[name=robots]').getAttribute('content'),'index,follow,max-image-preview:large');
     assert.ok(!(await page.title()).includes('undefined'));
     assert.equal(await page.locator('a[href="#"],a[href="null"]').count(),0);
     if(route==='download/')assert.ok((await page.locator('.coming-soon').innerText()).includes(lang==='it'?'Prossimamente':'Coming soon'));
     if(route==='confronto/')assert.equal(await page.locator('table tbody tr').count(),7);
     if(route===''||route==='supporto/'){
      const questions=await page.evaluate(()=>JSON.parse(document.querySelector('#draft-faq-schema').textContent).mainEntity.map(q=>q.name));
      assert.equal(questions.length,7);
      assert.deepEqual(questions,await page.locator('#faq summary').allTextContents());
     }
    }
   }
   await page.goto('http://127.0.0.1:4321/?lang=it');
   await page.screenshot({path:require('node:path').resolve(__dirname,`../artifacts/website-full-draft/publication-home-${width}.png`),fullPage:true});
   if(width<=1000){
    assert.equal(await page.locator('#navigation').evaluate(e=>e.inert),true);
    await page.locator('[data-menu]').click();
    await page.locator('#navigation a[href="/confronto/?lang=it"]').click();
    assert.ok(page.url().includes('/confronto/'));
   }
  }
  await page.goto('http://127.0.0.1:4321/download/?lang=it');
  await page.context().grantPermissions(['clipboard-read','clipboard-write']);
  await page.locator('[data-copy]').click();
  await page.waitForFunction(()=>document.querySelector('#copy-status').textContent==='Indirizzo copiato.');
  await page.locator('[data-lang]').click();assert.equal(await page.locator('html').getAttribute('lang'),'en');
  await page.goto('http://127.0.0.1:4321/?lang=it');
  await page.locator('#faq summary').first().click();assert.equal(await page.locator('#faq details').first().getAttribute('open'),'');
  for(const route of ['','info/','download/','guida/','confronto/','supporto/']){
   await page.goto('http://127.0.0.1:4321/'+route+'?lang=it');
   await page.evaluate(fs.readFileSync(require.resolve('axe-core/axe.min.js'),'utf8'));
   const violations=await page.evaluate(async()=> (await axe.run(document,{runOnly:{type:'tag',values:['wcag2a','wcag2aa','wcag21aa']}})).violations.map(v=>({id:v.id,nodes:v.nodes.map(n=>n.target)})));
   assert.deepEqual(violations,[],route+' accessibility');
  }
  const nojs=await browser.newPage({javaScriptEnabled:false});
  for(const route of ['','download/','confronto/']){
   await nojs.goto('http://127.0.0.1:4321/'+route);assert.equal(await nojs.locator('h1').count(),1);
  }
  assert.deepEqual(errors,[]);assert.deepEqual(analytics,[]);
  console.log('PASS: 6 routes x 2 languages x 3 widths; mobile navigation, copy, language, FAQ/schema consistency, no-JS, axe, no analytics.');
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exit(1)});
