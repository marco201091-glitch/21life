import {DEV_APIS,DEV_BACKENDS,productionDomains} from './build-domains.mjs';
const mode=process.argv[2];
if(!['dev','production'].includes(mode))throw Error('Usage: verify-expo-build-env.mjs <dev|production>');
const required=['EXPO_PUBLIC_SUPABASE_URL','EXPO_PUBLIC_SUPABASE_ANON_KEY','EXPO_PUBLIC_API_BASE_URL','EXPO_PUBLIC_SITE_URL'];
const missing=required.filter(name=>!process.env[name]?.trim());
if(missing.length)throw Error('Missing required build variables: '+missing.join(', '));
const api=process.env.EXPO_PUBLIC_API_BASE_URL.replace(/\/$/,'');
const site=process.env.EXPO_PUBLIC_SITE_URL.replace(/\/$/,'');
const db=process.env.EXPO_PUBLIC_SUPABASE_URL.replace(/\/$/,'');
if(mode==='dev'){
  if(process.env.APP_VARIANT!=='dev'||!DEV_APIS.includes(api)||site!==api||!DEV_BACKENDS.includes(db))throw Error('Refusing Dev build: environment isolation failed.');
}else{
  const expected=productionDomains(process.env.PRODUCTION_DOMAIN_GENERATION);
  if(process.env.APP_VARIANT==='dev'||api!==expected.api||site!==api||db!==expected.supabase)throw Error('Refusing Production build: environment isolation failed.');
}
console.log('Environment gate passed for '+mode+'.');
