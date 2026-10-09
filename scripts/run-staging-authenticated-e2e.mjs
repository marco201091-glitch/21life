import { randomBytes, randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { resolve } from 'node:path';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';
import { createServerClient } from '@supabase/ssr';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { runMaestro } from '../expo/scripts/maestro-command.mjs';

const envRoot = resolve(process.env.E2E_ENV_ROOT || '.');
const driver = process.env.E2E_DRIVER || 'playwright';
if (!['playwright', 'maestro'].includes(driver)) throw new Error('E2E_DRIVER must be playwright or maestro.');
if (driver === 'maestro') {
  const preflight = spawnSync(process.execPath, [resolve('expo/scripts/e2e-android-preflight.mjs')], { stdio: 'inherit' });
  if (preflight.status !== 0) throw new Error('Maestro/device preflight failed before staging fixtures were created.');
}
nextEnv.loadEnvConfig(envRoot);
const stagingHost = process.env.STAGING_SUPABASE_DOMAIN;
const supabaseUrl = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!stagingHost || !supabaseUrl || new URL(supabaseUrl).hostname !== stagingHost) {
  throw new Error('Refusing authenticated E2E: configured Supabase URL is not the staging host.');
}
if (!serviceRoleKey) throw new Error('SUPABASE_SERVICE_ROLE_KEY is required to provision a disposable staging E2E user.');
if (driver === 'maestro') {
  const api = process.env.EXPO_PUBLIC_API_BASE_URL;
  const site = process.env.EXPO_PUBLIC_SITE_URL;
  const deviceDb = process.env.EXPO_PUBLIC_SUPABASE_URL;
  const allowedApis = ['https://dev.21life.win', 'https://dev.phyrexianarena.dpdns.org'];
  if (!api || !site || !deviceDb || !allowedApis.includes(new URL(api).origin)
    || new URL(site).origin !== new URL(api).origin || new URL(deviceDb).hostname !== stagingHost) {
    throw new Error('Require explicit staging Expo DB/API/site configuration before provisioning device fixtures. The installed APK/Metro must use these same values.');
  }
}

process.env.NEXT_PUBLIC_SUPABASE_URL ||= supabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||= process.env.SUPABASE_ANON_KEY;
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) throw new Error('Staging anon key is missing.');

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});
const email = `e2e-${Date.now()}-${randomBytes(4).toString('hex')}@example.com`;
const password = randomBytes(32).toString('base64url');
const userIds = [];
const usernames = [];
const groupId = randomUUID();
let exitCode = 1;

try {
  for (let index = 0; index < 2; index += 1) {
    const username = `e2e_${randomBytes(8).toString('hex')}`;
    const { data, error } = await supabase.auth.admin.createUser({
      email: index === 0 ? email : `second-${email}`, password, email_confirm: true,
      user_metadata: { username },
    });
    if (error || !data.user) throw new Error(`Could not provision staging E2E user: ${error?.code ?? 'no user returned'}`);
    userIds.push(data.user.id);
    usernames.push(username);
  }
  const check = ({ error }) => { if (error) throw new Error(`Staging E2E seed failed: ${error.code}`); };
  check(await supabase.from('groups').insert({ id: groupId, name: 'IMP synthetic playgroup', created_by: userIds[0] }));
  check(await supabase.from('group_members').upsert(userIds.map((user_id) => ({ group_id: groupId, user_id })), { onConflict: 'group_id,user_id' }));
  check(await supabase.from('decks').insert(userIds.map((user_id, index) => ({
    id: randomUUID(), user_id, group_id: null, name: `IMP synthetic deck ${index + 1}`, commander: 'E2E Commander',
  }))));
  process.env.E2E_USERNAME = email;
  process.env.E2E_PASSWORD = password;
  process.env.E2E_GROUP_ID = groupId;
  process.env.E2E_LIVE_GAME_FLOW = '1';
  const sessionCookies = [];
  const authClient = createServerClient(supabaseUrl, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY, {
    auth: { storageKey: 'sb-supabase-staging-auth-token' },
    cookies: { getAll: () => sessionCookies, setAll: (values) => sessionCookies.push(...values) },
  });
  const { error: sessionError } = await authClient.auth.signInWithPassword({ email, password });
  if (sessionError) throw new Error(`Staging fixture login failed: ${sessionError.code}`);
  process.env.E2E_SESSION_COOKIES = JSON.stringify(sessionCookies.map(({ name, value }) => ({ name, value })));
  exitCode = 0;
  if (driver === 'maestro') {
    for (const flow of ['authenticated-live-game', 'authenticated-archive']) {
      const result = runMaestro(['test', '--debug-output', resolve(`artifacts/e2e/maestro/${flow}`), resolve(`expo/e2e/${flow}.yaml`)], {
        stdio: 'inherit', env: { ...process.env, MAESTRO_E2E_USERNAME: email, MAESTRO_E2E_PASSWORD: password,
          MAESTRO_PLAYER_1: usernames[0], MAESTRO_PLAYER_2: usernames[1], MAESTRO_METRO_URL: process.env.E2E_METRO_URL || '' },
      });
      if ((result.status ?? 1) !== 0) { exitCode = result.status ?? 1; break; }
    }
    if (exitCode === 0) {
      const { count, error } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
      if (error || count !== 1) throw new Error('Expected exactly one native saved match in staging history.');
      console.log('Staging native saved-match history verified.');
    }
  }
  for (const grep of (driver === 'maestro' ? [] : process.env.E2E_GREP ? [process.env.E2E_GREP] : ['Archidekt settings', 'authenticated screens fit', 'wizard → damage', 'synthetic deck archive', 'wizard layout previews', 'low-sample decks'])) {
    const result = spawnSync(process.execPath, [
      resolve('node_modules/@playwright/test/cli.js'), 'test',
      'tests/e2e/public-ui.spec.ts',
      'tests/e2e/responsive-layout.spec.ts',
      'tests/e2e/live-game-complete-flow.spec.ts',
      'tests/e2e/staging-archive.spec.ts',
      'tests/e2e/live-game-wizard.spec.ts',
      'tests/e2e/deck-ranking-filter.spec.ts',
      '--grep', grep,
      '--project=desktop', '--project=mobile', '--workers=1', '--trace=off', '--max-failures=1',
    ], { stdio: 'inherit' });
    if ((result.status ?? 1) !== 0) exitCode = result.status ?? 1;
  }
  if (driver === 'playwright' && exitCode === 0 && (!process.env.E2E_GREP || process.env.E2E_GREP.includes('wizard → damage'))) {
    const { count, error } = await supabase.from('matches').select('id', { count: 'exact', head: true }).eq('group_id', groupId);
    if (error || count !== 2) throw new Error('Expected exactly one saved match per browser project after finalization retries.');
    console.log('Staging finalization idempotency verified: exactly 2 matches for 2 browser flows.');
  }
} finally {
  // Playwright error context can include entered passwords; redact before retaining evidence.
  const redact = (directory) => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      const path = resolve(directory, entry.name);
      if (entry.isDirectory()) redact(path);
      else if (/\.(md|txt|json)$/.test(entry.name)) {
        const original = readFileSync(path, 'utf8');
        writeFileSync(path, original.replaceAll(password, '[redacted]'));
      }
    }
  };
  try { redact(resolve('test-results')); } catch (error) { if (error.code !== 'ENOENT') exitCode = 1; }
  try { redact(resolve('artifacts/e2e/maestro')); } catch (error) { if (error.code !== 'ENOENT') exitCode = 1; }
  if (userIds.length) {
    const { error: groupError } = await supabase.from('groups').delete().eq('id', groupId);
    if (groupError) { console.error('Could not clean up disposable staging E2E group.'); exitCode = 1; }
  }
  for (const userId of userIds) {
    const { error } = await supabase.auth.admin.deleteUser(userId);
    if (error) {
      console.error('Could not clean up the disposable staging E2E user.');
      exitCode = 1;
    }
  }
  const { count, error: cleanupError } = await supabase.from('groups').select('id', { count: 'exact', head: true }).eq('id', groupId);
  if (cleanupError || count !== 0) {
    console.error('Disposable staging group cleanup verification failed.');
    exitCode = 1;
  }
  for (const userId of userIds) {
    const { data, error } = await supabase.auth.admin.getUserById(userId);
    if (data?.user || (error && error.status !== 404 && error.code !== 'user_not_found')) {
      console.error('Disposable staging user cleanup verification failed.');
      exitCode = 1;
    }
  }
  console.log(`Staging fixture cleanup ${exitCode === 0 ? 'verified' : 'finished with failures'}.`);
}

process.exitCode = exitCode;
