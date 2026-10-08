import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
function check(api, site = api, db = 'https://supabase-staging.phyrexianarena.dpdns.org') {
  return spawnSync(process.execPath, ['scripts/verify-expo-build-env.mjs', 'dev'], {
    encoding: 'utf8',
    env: { ...process.env, APP_VARIANT: 'dev', EXPO_PUBLIC_SUPABASE_URL: db,
      EXPO_PUBLIC_SUPABASE_ANON_KEY: 'test-key', EXPO_PUBLIC_API_BASE_URL: api, EXPO_PUBLIC_SITE_URL: site },
  });
}
test('Dev accepts new and legacy web domains with the staging backend', () => {
  for (const host of ['dev.21life.win', 'dev.phyrexianarena.dpdns.org']) {
    const result = check(`https://${host}`);
    assert.equal(result.status, 0, result.stderr);
  }
});
test('Dev rejects production, lookalike, insecure and mismatched origins', () => {
  for (const [api, site, db] of [
    ['https://app.21life.win'],
    ['https://dev.phyrexianarena.attacker.example'],
    ['http://dev.21life.win'],
    ['https://dev.21life.win', 'https://app.21life.win'],
    ['https://dev.21life.win', 'https://dev.21life.win', 'https://phyrexianarena.dpdns.org'],
  ]) assert.notEqual(check(api, site, db).status, 0);
});
