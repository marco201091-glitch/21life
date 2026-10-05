import { execFileSync } from 'node:child_process';
import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
// Public client configuration is pinned with the source, not read from CI secrets
// or a mutable network endpoint. F-Droid and the reference APK use identical bytes.
const env = JSON.parse(readFileSync(resolve(root, 'expo/fdroid-build-env.json'), 'utf8'));
const allowed = new Set([
  'EXPO_PUBLIC_SUPABASE_URL', 'EXPO_PUBLIC_SUPABASE_ANON_KEY',
  'EXPO_PUBLIC_API_BASE_URL', 'EXPO_PUBLIC_SITE_URL',
  'EXPO_PUBLIC_TURNSTILE_SITE_KEY', 'EXPO_PUBLIC_SUPPORT_EMAIL',
  'APP_VARIANT', 'EXPO_PUBLIC_FDROID_BUILD', 'EXPO_PUBLIC_SENTRY_ENABLED',
  'EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS',
]);
if (Object.keys(env).length !== allowed.size || Object.entries(env).some(([key, value]) =>
  !allowed.has(key) || typeof value !== 'string' || !value || /[\r\n]/.test(value))) {
  throw new Error('Invalid public F-Droid build environment');
}
const claims = JSON.parse(Buffer.from(env.EXPO_PUBLIC_SUPABASE_ANON_KEY.split('.')[1], 'base64url').toString());
if (claims.role !== 'anon' || !Number.isInteger(claims.exp) || claims.exp <= Math.floor(Date.now() / 1000)) {
  throw new Error('F-Droid client requires an unexpired public anon key');
}
if (env.APP_VARIANT !== 'fdroid' || env.EXPO_PUBLIC_FDROID_BUILD !== 'true'
  || env.EXPO_PUBLIC_SENTRY_ENABLED !== 'false' || env.EXPO_PUBLIC_DISABLE_PUSH_NOTIFICATIONS !== 'true') {
  throw new Error('F-Droid exclusions must remain enabled');
}
execFileSync(process.execPath, [resolve(root, 'scripts/verify-expo-build-env.mjs'), 'production'], {
  env: { ...process.env, ...env }, stdio: 'inherit',
});
writeFileSync(resolve(root, 'expo/.env'), Object.entries(env).map(([key, value]) => `${key}=${value}`).join('\n') + '\n');
console.log('Pinned public F-Droid environment prepared.');
