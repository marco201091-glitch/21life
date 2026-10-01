import { createHash, randomBytes, randomUUID } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { spawnSync } from 'node:child_process';
import nextEnv from '@next/env';
import { createClient } from '@supabase/supabase-js';

nextEnv.loadEnvConfig(resolve(process.env.E2E_ENV_ROOT || '.'));
const url = process.env.SUPABASE_URL;
if (!url || new URL(url).hostname !== process.env.STAGING_SUPABASE_DOMAIN
  || process.env.SELFHOSTED_DEV_COMPOSE_PROJECT !== 'supabase-dev') {
  throw new Error('Recovery drill requires the explicit self-hosted staging target.');
}
const client = createClient(url, process.env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = randomBytes(6).toString('hex');
const password = randomBytes(32).toString('base64url');
const bucket = 'imp12-' + suffix;
const users = [];
let bucketCreated = false;
let report = null;
let exitCode = 1;
const check = ({ error }) => { if (error) throw new Error('Staging recovery fixture failed: ' + error.code); };
try {
  for (let index = 0; index < 2; index += 1) {
    const email = `imp12-${suffix}-${index}@example.com`;
    const { data, error } = await client.auth.admin.createUser({ email, password, email_confirm: true,
      user_metadata: { username: `imp12_${suffix}_${index}` } });
    if (error || !data.user) throw new Error('Recovery Auth fixture creation failed: ' + error?.code);
    users.push({ id: data.user.id, email });
    check(await client.from('decks').insert({ id: randomUUID(), user_id: data.user.id,
      group_id: null, name: 'Recovery fixture deck', commander: 'Fixture' }));
  }
  check(await client.storage.createBucket(bucket, { public: false }));
  bucketCreated = true;
  const content = Buffer.from('21Life staging recovery fixture ' + suffix);
  check(await client.storage.from(bucket).upload('probe.txt', content, { contentType: 'text/plain' }));
  const args = ['-o', 'BatchMode=yes'];
  if (process.env.SELFHOSTED_DEV_VM_PORT) args.push('-p', process.env.SELFHOSTED_DEV_VM_PORT);
  if (process.env.SELFHOSTED_DEV_VM_KEY_PATH) args.push('-i', process.env.SELFHOSTED_DEV_VM_KEY_PATH);
  args.push(process.env.SELFHOSTED_DEV_VM_USER + '@' + process.env.SELFHOSTED_DEV_VM_HOST, 'sudo -n python3 -');
  const fixture = Buffer.from(JSON.stringify({ suffix, password, users, bucket,
    storage_hash: createHash('sha256').update(content).digest('hex') })).toString('base64');
  const source = readFileSync(resolve('scripts/qa/staging-recovery-drill.py'), 'utf8');
  const input = source + `\nimport base64,sys\nresult=run_drill(json.loads(base64.b64decode('${fixture}')))\nsys.exit(0 if result['passed'] else 1)\n`;
  const result = spawnSync('ssh', args, { input, encoding: 'utf8', maxBuffer: 2 * 1024 * 1024 });
  const line = result.stdout?.trim().split(/\r?\n/).findLast((entry) => entry.startsWith('{'));
  if (line) report = JSON.parse(line);
  else throw new Error('Remote recovery drill did not return a report. Check SSH/sudo access.');
  console.log(JSON.stringify(report, null, 2));
  exitCode = result.status === 0 && report.passed ? 0 : 1;
} finally {
  let cleaned = true;
  if (bucketCreated) {
    const { error: removeError } = await client.storage.from(bucket).remove(['probe.txt']);
    const { error: bucketError } = await client.storage.deleteBucket(bucket);
    if (removeError || bucketError) cleaned = false;
  }
  for (const user of users) {
    const { error } = await client.auth.admin.deleteUser(user.id);
    if (error) cleaned = false;
    const { data, error: lookupError } = await client.auth.admin.getUserById(user.id);
    if (data?.user || (lookupError && lookupError.status !== 404 && lookupError.code !== 'user_not_found')) cleaned = false;
  }
  if (report) {
    report.source_fixture_cleanup = cleaned;
    mkdirSync(resolve('artifacts/recovery'), { recursive: true });
    writeFileSync(resolve(`artifacts/recovery/imp12-${suffix}.json`), JSON.stringify(report, null, 2) + '\n');
  }
  if (!cleaned) { console.error('Recovery fixture cleanup needs attention.'); exitCode = 1; }
  console.log('Staging recovery source cleanup: ' + (cleaned ? 'verified' : 'failed'));
}
process.exitCode = exitCode;
