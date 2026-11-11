import fs from 'node:fs';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import {pages,schemaBase} from './site-metadata.mjs';

const origin='https://21life.win';
const source=fs.readFileSync('dist/app.js','utf8');
const releaseContext={window:{},Object};
vm.runInNewContext(fs.readFileSync('dist/config.js','utf8'),releaseContext);
const release=releaseContext.window.TWENTYONE_RELEASE;
const analytics=JSON.parse(fs.readFileSync('analytics-config.json','utf8'));
if(!/^[a-f0-9]{32}$/.test(analytics.token))throw Error('Invalid analytics collection token');
const escape=value=>String(value).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const hashes=new Set();
function schemaScript(value,id=''){
 const text=JSON.stringify(value).replace(/</g,'\\u003c');
 hashes.add("'sha256-"+createHash('sha256').update(text).digest('base64')+"'");
 return `<script${id?` id="${id}"`:''} type="application/ld+json">${text}</script>`;
}
for(const [pathname,page] of Object.entries(pages)){
 const element={innerHTML:''};
 const context=vm.createContext({window:releaseContext.window,location:{pathname,search:''},URLSearchParams,document:{documentElement:{},querySelector:()=>element,addEventListener:()=>{}},Date});
 vm.runInContext(source,context);
 const graph=structuredClone(schemaBase);
 const app=graph.find(n=>n['@type']==='SoftwareApplication');
 app.downloadUrl=release.apkUrl;app.softwareVersion=release.version;
 app.installUrl=[release.appUrl];
 graph.push({'@type':'WebPage','@id':origin+pathname+'#page',url:origin+pathname,name:page.title,description:page.description,inLanguage:'en',isPartOf:{'@id':origin+'/#website'},about:{'@id':origin+'/#app'}});
 let schema=schemaScript({'@context':'https://schema.org','@graph':graph});
 if(pathname==='/'||pathname==='/supporto/'){
  const items=vm.runInContext('draftFaqItems()',context);
  schema+=schemaScript({'@context':'https://schema.org','@type':'FAQPage','@id':origin+pathname+'#faq',inLanguage:'en',mainEntity:items.map(([q,a])=>({'@type':'Question',name:q,acceptedAnswer:{'@type':'Answer',text:a}}))},'draft-faq-schema');
 }
 const dir='dist'+pathname;fs.mkdirSync(dir,{recursive:true});
 fs.writeFileSync(dir+'index.html',`<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="theme-color" content="#090b09"><meta name="robots" content="index,follow,max-image-preview:large"><title>${escape(page.title)}</title><meta name="description" content="${escape(page.description)}"><link rel="canonical" href="${origin}${pathname}"><meta property="og:type" content="website"><meta property="og:site_name" content="21Life"><meta property="og:title" content="${escape(page.title)}"><meta property="og:description" content="${escape(page.description)}"><meta property="og:url" content="${origin}${pathname}"><meta property="og:locale" content="en_US"><meta property="og:image" content="${origin}/assets/emblem.png"><meta property="og:image:alt" content="21Life — open source Commander tracker"><meta name="twitter:card" content="summary"><meta name="twitter:title" content="${escape(page.title)}"><meta name="twitter:description" content="${escape(page.description)}"><meta name="twitter:image" content="${origin}/assets/emblem.png"><link rel="icon" href="/assets/icon.png"><link rel="stylesheet" href="/style.css"><link rel="stylesheet" href="/refinement.css"><link rel="stylesheet" href="/motion.css"><link rel="preload" href="/assets/inter.woff2" as="font" type="font/woff2" crossorigin>${schema}<script src="/config.js" defer></script><script src="/app.js" defer></script><script src="/motion.js" defer></script><script src="/analytics.js" defer></script><script src="/click-counters.js" defer></script></head><body><div id="site">${element.innerHTML}</div><noscript><p class="wrap">JavaScript is required for the mobile menu and language switch. / JavaScript è necessario per il menu mobile e il cambio lingua.</p></noscript></body></html>`);
}
fs.writeFileSync('dist/analytics.js',`// Public collection token; statistics require the owner's Cloudflare login.\nif(location.hostname==='21life.win'){const beacon=document.createElement('script');beacon.defer=true;beacon.src='https://static.cloudflareinsights.com/beacon.min.js';beacon.dataset.cfBeacon=JSON.stringify({token:'${analytics.token}'});document.head.appendChild(beacon);}\n`);
fs.copyFileSync('click-counters.js','dist/click-counters.js');
const csp=`default-src 'self'; script-src 'self' https://static.cloudflareinsights.com ${[...hashes].join(' ')}; style-src 'self'; img-src 'self' data:; font-src 'self'; connect-src 'self' https://cloudflareinsights.com https://21life-clicks.21life-stats.workers.dev; object-src 'none'; base-uri 'self'; form-action 'none'; frame-ancestors 'none'`;
fs.writeFileSync('nginx.conf',fs.readFileSync('nginx.conf','utf8').replace(/add_header Content-Security-Policy "[^"]*" always;/,`add_header Content-Security-Policy "${csp}" always;`));
fs.writeFileSync('dist/_headers',`/*\n  X-Content-Type-Options: nosniff\n  Referrer-Policy: strict-origin-when-cross-origin\n  X-Frame-Options: DENY\n  Permissions-Policy: camera=(), microphone=(), geolocation=()\n  Content-Security-Policy: ${csp}\n`);
fs.writeFileSync('dist/robots.txt',`User-agent: *\nAllow: /\nSitemap: ${origin}/sitemap.xml\n`);
fs.writeFileSync('dist/sitemap.xml','<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">'+Object.keys(pages).map(p=>`<url><loc>${origin}${p}</loc></url>`).join('')+'</urlset>');
console.log('Built 6 public pages with SEO metadata, MIT/free schema, matching FAQ/CSP and private analytics.');
