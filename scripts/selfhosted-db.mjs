import { readFileSync } from 'node:fs';
import { basename } from 'node:path';
import { createHash } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { buildMigrationScript, getMigrationMetadata } from './selfhosted-db-core.mjs';

try {
  const local = readFileSync(process.env.DOKPLOY_ENV_FILE || '.env.local', 'utf8');
  for (const line of local.split(/\r?\n/)) {
    if (!line || line.startsWith('#') || !line.includes('=')) continue;
    const index = line.indexOf('=');
    const key = line.slice(0, index);
    if (!(key in process.env)) process.env[key] = line.slice(index + 1).replace(/^"|"$/g, '');
  }
} catch {
  // CI and callers may supply the variables directly instead.
}

const [action, environment, sqlPath] = process.argv.slice(2);
if (action !== 'apply' || !['dev', 'production'].includes(environment) || !sqlPath) {
  throw new Error('Usage: node scripts/selfhosted-db.mjs apply <dev|production> <migration.sql>');
}

const prefix = environment === 'production' ? 'SELFHOSTED_PRODUCTION' : 'SELFHOSTED_DEV';
const required = ['VM_HOST', 'VM_USER', 'COMPOSE_PROJECT'];
const config = Object.fromEntries(required.map((name) => [name, process.env[prefix + '_' + name]]));
const missing = required.filter((name) => !config[name]);
if (missing.length) throw new Error('Missing ' + missing.map((name) => prefix + '_' + name).join(', '));
if (!/^[a-z0-9_.-]+$/i.test(config.COMPOSE_PROJECT)) {
  throw new Error(prefix + '_COMPOSE_PROJECT contains unsupported characters.');
}
if (!/^[a-z_][a-z0-9_]*$/i.test(process.env[prefix + '_DB_USER'] ?? 'postgres')) {
  throw new Error(prefix + '_DB_USER must be a valid PostgreSQL role name.');
}
if (!/^[a-z0-9_.-]+$/i.test(config.VM_USER) || !/^[a-z0-9_.:-]+$/i.test(config.VM_HOST)) {
  throw new Error(prefix + ' SSH user/host contains unsupported characters.');
}

const sshArgs = ['-o', 'BatchMode=yes'];
const port = process.env[prefix + '_VM_PORT'];
const keyPath = process.env[prefix + '_VM_KEY_PATH'];
if (port) {
  const numericPort = Number(port);
  if (!Number.isInteger(numericPort) || numericPort < 1 || numericPort > 65_535) {
    throw new Error(prefix + '_VM_PORT must be between 1 and 65535.');
  }
  sshArgs.push('-p', String(numericPort));
}
if (keyPath) sshArgs.push('-i', keyPath);
sshArgs.push(config.VM_USER + '@' + config.VM_HOST);

const migrationFile = basename(sqlPath);
const sql = readFileSync(sqlPath, 'utf8');
const metadata = getMigrationMetadata(migrationFile, sql);
const checksum = createHash('sha256').update(sql).digest('hex');
const script = buildMigrationScript({ ...metadata, checksum, sql });
const dbUser = process.env[prefix + '_DB_USER'] ?? 'postgres';
const containerCommand = [
  'container=$(docker ps -q --filter label=com.docker.compose.project=' + config.COMPOSE_PROJECT
    + ' --filter label=com.docker.compose.service=db | head -n 1)',
  'test -n "$container"',
].join(' && ');
const remoteCommand = containerCommand + ' && docker exec -i "$container" psql -X -qAt'
  + ' --single-transaction -v ON_ERROR_STOP=1 -U ' + dbUser + ' -d postgres';

const result = spawnSync('ssh', [...sshArgs, remoteCommand], {
  input: script,
  encoding: 'utf8',
  stdio: ['pipe', 'pipe', 'inherit'],
  maxBuffer: 8 * 1024 * 1024,
});
if (result.error) throw result.error;
if (result.status !== 0) process.exit(result.status ?? 1);

const alreadyApplied = result.stdout.includes('already applied; checksum verified.');
console.log(alreadyApplied
  ? 'Migration ' + metadata.version + ' already applied; checksum verified.'
  : 'Migration ' + metadata.version + ' applied and recorded atomically.');
