import {resolve} from 'node:path';
import {fileURLToPath} from 'node:url';

export const DEV_APIS=['https://dev.21life.win','https://dev.phyrexianarena.dpdns.org'];
export const DEV_BACKENDS=['https://supabase-dev.21life.win','https://supabase-staging.phyrexianarena.dpdns.org'];
export function productionDomains(generation='21life'){
  if(generation==='21life')return {api:'https://app.21life.win',supabase:'https://supabase.21life.win'};
  if(generation==='legacy')return {api:'https://app.phyrexianarena.dpdns.org',supabase:'https://phyrexianarena.dpdns.org'};
  throw Error('Unknown production domain generation');
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
  if(process.argv[2]!=='production')throw Error('Usage: build-domains.mjs production');
  console.log(JSON.stringify(productionDomains(process.env.PRODUCTION_DOMAIN_GENERATION)));
}
