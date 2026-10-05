import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { copyFileSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const root = fileURLToPath(new URL('..', import.meta.url));
const publicConfig = JSON.parse(readFileSync(resolve(root, 'expo/fdroid-build-env.json'), 'utf8'));
const jwt = (claims) => `e30.${Buffer.from(JSON.stringify(claims)).toString('base64url')}.test`;

function run(config, check) {
  const dir = mkdtempSync(resolve(tmpdir(), 'fdroid-env-test-'));
  try {
    mkdirSync(resolve(dir, 'scripts'));
    mkdirSync(resolve(dir, 'expo'));
    for (const name of ['prepare-fdroid-env.mjs', 'verify-expo-build-env.mjs']) {
      copyFileSync(resolve(root, 'scripts', name), resolve(dir, 'scripts', name));
    }
    writeFileSync(resolve(dir, 'expo/fdroid-build-env.json'), JSON.stringify(config));
    const result = spawnSync(process.execPath, [resolve(dir, 'scripts/prepare-fdroid-env.mjs')], { encoding: 'utf8' });
    check(result, dir);
  } finally {
    const resolved = resolve(dir);
    assert.ok(resolved.startsWith(resolve(tmpdir()) + '\\') || resolved.startsWith(resolve(tmpdir()) + '/'));
    rmSync(resolved, { recursive: true, force: true });
  }
}

const config = () => ({ ...publicConfig, EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt({ role: 'anon', exp: 4102444800 }) });
test('writes the pinned public client environment byte for byte', () => {
  const value = config();
  run(value, (result, dir) => {
    assert.equal(result.status, 0, result.stderr);
    assert.equal(readFileSync(resolve(dir, 'expo/.env'), 'utf8'), Object.entries(value).map(([key, entry]) => `${key}=${entry}`).join('\n') + '\n');
  });
});
for (const [name, claims] of [
  ['privileged role', { role: 'service_role', exp: 4102444800 }],
  ['expired key', { role: 'anon', exp: 1 }],
  ['missing expiry', { role: 'anon' }],
]) {
  test(`rejects ${name} before writing the client environment`, () => {
    run({ ...config(), EXPO_PUBLIC_SUPABASE_ANON_KEY: jwt(claims) }, (result) => assert.notEqual(result.status, 0));
  });
}
for (const [name, changes] of [
  ['unexpected private credential', { RELEASE_STORE_PASSWORD: 'never-public' }],
  ['environment injection', { EXPO_PUBLIC_SUPPORT_EMAIL: 'support@example.org\nSERVICE_ROLE_KEY=bad' }],
  ['staging backend', { EXPO_PUBLIC_SUPABASE_URL: 'https://supabase-staging.phyrexianarena.dpdns.org' }],
  ['enabled diagnostics', { EXPO_PUBLIC_SENTRY_ENABLED: 'true' }],
]) {
  test(`rejects ${name}`, () => run({ ...config(), ...changes }, (result) => assert.notEqual(result.status, 0)));
}
