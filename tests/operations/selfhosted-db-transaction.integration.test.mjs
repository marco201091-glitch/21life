import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { createHash, randomBytes } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { buildMigrationScript } from '../../scripts/selfhosted-db-core.mjs';

const enabled = process.env.SELFHOSTED_DB_TESTS === '1';
const target = process.env.SELFHOSTED_DB_TEST_TARGET || 'docker';
const databaseUser = target === 'ssh' ? sshConfig().databaseUser : 'postgres';
const suffix = randomBytes(5).toString('hex');
const versionSeed = Number(BigInt('0x' + randomBytes(8).toString('hex')) % 9_999_999_990n) + 1;
const versions = Array.from({ length: 5 }, (_, index) => '2099' + String(versionSeed + index).padStart(10, '0'));
const psqlArgs = ['psql', '-X', '-qAt', '--single-transaction', '-v', 'ON_ERROR_STOP=1', '-U', databaseUser, '-d', 'postgres'];
let containerId = '';

function shellQuote(value) {
  return "'" + String(value).replaceAll("'", "'\\''") + "'";
}

function sshConfig() {
  const envPath = process.env.DOKPLOY_ENV_FILE || '.env.local';
  const values = {};
  for (const line of readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const match = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (!match || !match[1].startsWith('SELFHOSTED_DEV_')) continue;
    values[match[1]] = match[2].replace(/^"|"$/g, '');
  }
  const project = process.env.SELFHOSTED_DB_TEST_PROJECT || values.SELFHOSTED_DEV_COMPOSE_PROJECT;
  if (project !== 'supabase-dev') throw new Error('SSH integration tests are restricted to the isolated supabase-dev staging stack.');
  const host = values.SELFHOSTED_DEV_VM_HOST;
  const user = values.SELFHOSTED_DEV_VM_USER;
  if (!host || !user) throw new Error('The staging SSH target is missing from .env.local.');
  const databaseUser = values.SELFHOSTED_DEV_DB_USER || 'postgres';
  if (!/^[a-z_][a-z0-9_]*$/i.test(databaseUser)) throw new Error('The staging database role is invalid.');
  const args = ['-o', 'BatchMode=yes'];
  if (values.SELFHOSTED_DEV_VM_PORT) args.push('-p', values.SELFHOSTED_DEV_VM_PORT);
  if (values.SELFHOSTED_DEV_VM_KEY_PATH) args.push('-i', values.SELFHOSTED_DEV_VM_KEY_PATH);
  return { args, destination: user + '@' + host, project, databaseUser };
}

function sshCommand(dockerArgs, input, options = {}) {
  const config = sshConfig();
  const remote = ['docker', ...dockerArgs].map(shellQuote).join(' ');
  return spawnSync('ssh', [...config.args, config.destination, remote], {
    input,
    encoding: options.encoding || 'utf8',
    timeout: options.timeout || 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function docker(args, input) {
  if (target === 'ssh') return sshCommand(args, input);
  return spawnSync('docker', args, {
    input,
    encoding: 'utf8',
    timeout: 30_000,
    maxBuffer: 4 * 1024 * 1024,
  });
}

function runSql(sql, { lockTimeoutMs, version = versions[0] } = {}) {
  const checksum = createHash('sha256').update(sql).digest('hex');
  const script = buildMigrationScript({
    version,
    name: 'integration_' + suffix,
    checksum,
    sql,
    lockTimeoutMs,
  });
  const result = docker(['exec', '-i', containerId, ...psqlArgs], script);
  return { ...result, checksum };
}

function query(sql) {
  const result = docker(['exec', containerId, ...psqlArgs, '-c', sql]);
  if (result.status !== 0) throw new Error(result.stderr || 'PostgreSQL verification query failed.');
  return result.stdout.trim();
}

function startSql(sql) {
  const command = target === 'ssh'
    ? (() => {
      const config = sshConfig();
      const remote = ['docker', 'exec', '-i', containerId, ...psqlArgs].map(shellQuote).join(' ');
      return { file: 'ssh', args: [...config.args, config.destination, remote] };
    })()
    : { file: 'docker', args: ['exec', '-i', containerId, ...psqlArgs] };
  const child = spawn(command.file, command.args, {
    stdio: ['pipe', 'pipe', 'pipe'],
  });
  let stdout = '';
  let stderr = '';
  child.stdout.setEncoding('utf8').on('data', (chunk) => { stdout += chunk; });
  child.stderr.setEncoding('utf8').on('data', (chunk) => { stderr += chunk; });
  const done = new Promise((resolve) => child.once('close', (status) => resolve({ status, stdout, stderr })));
  child.stdin.end(sql);
  return { child, done, getOutput: () => ({ stdout, stderr }) };
}

function waitForOutput(running, marker, timeoutMs = 10_000) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Timed out waiting for Postgres fixture marker.')), timeoutMs);
    const check = () => {
      if (running.getOutput().stdout.includes(marker)) {
        clearTimeout(timer);
        resolve();
      }
    };
    const interval = setInterval(check, 10);
    running.done.finally(() => {
      clearInterval(interval);
      clearTimeout(timer);
      if (!running.getOutput().stdout.includes(marker)) reject(new Error('Postgres fixture exited before its marker.'));
    });
  });
}

test('self-hosted migration transaction protocol on isolated staging/CI database', {
  skip: !enabled && 'Set SELFHOSTED_DB_TESTS=1 only for the isolated Supabase staging or CI database.',
}, async (t) => {
  assert.ok(target === 'docker' || target === 'ssh', 'SELFHOSTED_DB_TEST_TARGET must be docker or ssh.');
  const project = target === 'ssh'
    ? sshConfig().project
    : process.env.SELFHOSTED_DB_TEST_PROJECT || 'phyrexian-arena';
  assert.match(project, /^[a-z0-9_.-]+$/i, 'The integration database project name must be explicit and safe.');
  const filters = target === 'ssh'
    ? ['--filter', 'label=com.docker.compose.project=' + project, '--filter', 'label=com.docker.compose.service=db']
    : ['--filter', 'name=^/supabase_db_' + project.replaceAll('.', '\\.') + '$'];
  const found = docker(['ps', '-q', ...filters]);
  assert.equal(found.status, 0, found.stderr);
  containerId = found.stdout.trim().split(/\r?\n/)[0];
  assert.ok(containerId, 'The isolated Supabase CI database container was not found.');
  assert.equal(query('SELECT 1'), '1');

  const schema = 'migration_test_' + suffix;
  const rejectFunction = 'reject_test_migration_' + suffix;
  const rejectTrigger = 'reject_test_migration_' + suffix;
  const schemas = [schema, schema + '_rollback', schema + '_registry_failure', schema + '_disconnect', schema + '_concurrent'];

  t.after(() => {
    docker(['exec', '-i', containerId, ...psqlArgs], [
      ...schemas.map((name) => 'DROP SCHEMA IF EXISTS ' + name + ' CASCADE;'),
      'DROP TRIGGER IF EXISTS ' + rejectTrigger + ' ON app_private.schema_migrations;',
      'DROP FUNCTION IF EXISTS app_private.' + rejectFunction + '();',
      "DELETE FROM app_private.schema_migrations WHERE version IN (" + versions.map((version) => "'" + version + "'").join(', ') + ");",
    ].join('\n'));
  });

  await t.test('success, matching retry, and checksum mismatch', () => {
    const sql = 'CREATE SCHEMA ' + schema + '; CREATE TABLE ' + schema + '.items (id integer);';
    const first = runSql(sql);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(query("SELECT checksum FROM app_private.schema_migrations WHERE version = '" + versions[0] + "'"), first.checksum);

    const retry = runSql(sql);
    assert.equal(retry.status, 0, retry.stderr);
    assert.match(retry.stdout, /already applied; checksum verified/);

    const changedSql = 'CREATE SCHEMA ' + schema + '; CREATE TABLE ' + schema + '.other (id integer);';
    const mismatch = buildMigrationScript({
      version: versions[0],
      name: 'integration_' + suffix,
      checksum: createHash('sha256').update(changedSql).digest('hex'),
      sql: changedSql,
    });
    const refused = docker(['exec', '-i', containerId, ...psqlArgs], mismatch);
    assert.notEqual(refused.status, 0);
    assert.match(refused.stderr, /division by zero/i);
    assert.equal(query("SELECT count(*) FROM information_schema.tables WHERE table_schema = '" + schema + "'"), '1');
  });

  await t.test('SQL failure after DDL rolls back schema and migration record', () => {
    const sql = 'CREATE SCHEMA ' + schema + '_rollback; SELECT 1 / 0;';
    const failed = runSql(sql, { version: versions[1] });
    assert.notEqual(failed.status, 0);
    assert.equal(query("SELECT count(*) FROM information_schema.schemata WHERE schema_name = '" + schema + "_rollback'"), '0');
    assert.equal(query("SELECT count(*) FROM app_private.schema_migrations WHERE version = '" + versions[1] + "'"), '0');
  });

  await t.test('registry failure after DDL rolls the DDL back', () => {
    const version = versions[2];
    const triggerSetup = [
      'CREATE OR REPLACE FUNCTION app_private.' + rejectFunction + '() RETURNS trigger LANGUAGE plpgsql AS $$',
      'BEGIN',
      "  IF NEW.version = '" + version + "' THEN RAISE EXCEPTION 'intentional test failure'; END IF;",
      '  RETURN NEW;',
      'END;',
      '$$;',
      'CREATE TRIGGER ' + rejectTrigger + ' BEFORE INSERT ON app_private.schema_migrations',
      'FOR EACH ROW EXECUTE FUNCTION app_private.' + rejectFunction + '();',
    ].join('\n');
    const setup = docker(['exec', '-i', containerId, ...psqlArgs], triggerSetup);
    assert.equal(setup.status, 0, setup.stderr);

    const sql = 'CREATE SCHEMA ' + schema + '_registry_failure;';
    const failed = docker(['exec', '-i', containerId, ...psqlArgs], buildMigrationScript({
      version,
      name: 'integration_' + suffix,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    }));
    assert.notEqual(failed.status, 0);
    assert.equal(query("SELECT count(*) FROM information_schema.schemata WHERE schema_name = '" + schema + "_registry_failure'"), '0');
    assert.equal(query("SELECT count(*) FROM app_private.schema_migrations WHERE version = '" + version + "'"), '0');
    docker(['exec', '-i', containerId, ...psqlArgs], [
      'DROP TRIGGER IF EXISTS ' + rejectTrigger + ' ON app_private.schema_migrations;',
      'DROP FUNCTION IF EXISTS app_private.' + rejectFunction + '();',
    ].join('\n'));
  });

  await t.test('connection loss during a migration leaves no partial schema and retry is idempotent', async () => {
    const version = versions[3];
    const sql = 'CREATE SCHEMA ' + schema + "_disconnect;\nSELECT 'MIGRATION_TEST_TRANSACTION_OPEN';\nSELECT pg_sleep(5);";
    const script = buildMigrationScript({
      version,
      name: 'integration_' + suffix,
      checksum: createHash('sha256').update(sql).digest('hex'),
      sql,
    });
    const running = startSql(script);
    await waitForOutput(running, 'MIGRATION_TEST_TRANSACTION_OPEN');
    running.child.kill();
    await running.done;

    const state = query(
      "SELECT (SELECT count(*) FROM information_schema.schemata WHERE schema_name = '" + schema
        + "_disconnect') || ':' || (SELECT count(*) FROM app_private.schema_migrations WHERE version = '" + version + "')",
    );
    assert.equal(state, '0:0', 'A lost connection before COMMIT must roll the migration back.');
    const retry = docker(['exec', '-i', containerId, ...psqlArgs], script);
    assert.equal(retry.status, 0, retry.stderr);
    assert.match(retry.stdout, /already applied; checksum verified/);
  });

  await t.test('advisory lock serializes two simultaneous attempts', async () => {
    const sql = 'SELECT pg_sleep(0.3); CREATE SCHEMA ' + schema + '_concurrent;';
    const checksum = createHash('sha256').update(sql).digest('hex');
    const version = versions[4];
    const script = buildMigrationScript({
      version,
      name: 'integration_' + suffix,
      checksum,
      sql,
    });
    const [first, second] = await Promise.all([startSql(script).done, startSql(script).done]);
    assert.equal(first.status, 0, first.stderr);
    assert.equal(second.status, 0, second.stderr);
    assert.equal(query("SELECT count(*) FROM app_private.schema_migrations WHERE version = '" + version + "'"), '1');
    assert.equal(query("SELECT count(*) FROM information_schema.schemata WHERE schema_name = '" + schema + "_concurrent'"), '1');
  });
});
