import { readFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { readBackupPackage } from './backup-package.mjs';

function loadEnv(path) {
  try {
    for (const line of readFileSync(path, 'utf8').split(/\r?\n/)) {
      if (!line || line.startsWith('#') || !line.includes('=')) continue;
      const index = line.indexOf('=');
      const key = line.slice(0, index);
      if (!(key in process.env)) process.env[key] = line.slice(index + 1).replace(/^"|"$/g, '');
    }
  } catch {}
}

loadEnv(process.env.DOKPLOY_ENV_FILE || '.env.local');
const { bytes } = readBackupPackage(process.argv[2]);

const host = process.env.SELFHOSTED_DEV_VM_HOST;
const user = process.env.SELFHOSTED_DEV_VM_USER;
const key = process.env.SELFHOSTED_DEV_VM_KEY_PATH;
const compose = process.env.SELFHOSTED_DEV_COMPOSE_PROJECT || 'supabase-dev';
if (!host || !user || !key) throw new Error('SELFHOSTED_DEV_VM_HOST, VM_USER and VM_KEY_PATH are required.');
if (!/^[a-z0-9_.-]+$/i.test(compose)) throw new Error('Unsupported Compose project name.');
const database = `restore_drill_${Date.now()}`;
const ssh = ['-i', key, '-o', 'BatchMode=yes', `${user}@${host}`];
const container = `container=$(docker ps -q --filter label=com.docker.compose.project=${compose} --filter label=com.docker.compose.service=db | head -n 1) && test -n "$container"`;

function remote(command, input = undefined, capture = false) {
  const result = spawnSync('ssh', [...ssh, `${container} && ${command}`], {
    input,
    encoding: input ? null : 'utf8',
    stdio: capture ? ['pipe', 'pipe', 'inherit'] : ['pipe', 'inherit', 'inherit'],
    maxBuffer: 1024 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Dev restore drill command failed (${result.status ?? 1}).`);
  return capture ? String(result.stdout).trim() : '';
}

try {
  remote(`docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "create database ${database}"`);
  remote(`docker exec -i "$container" pg_restore -U supabase_admin -d ${database} --no-owner --no-privileges --exit-on-error`, bytes);
  const result = remote(`docker exec "$container" psql -X -At -U supabase_admin -d ${database} -c "select count(*) || ':' || count(*) filter (where relrowsecurity) from pg_class where relnamespace = 'public'::regnamespace and relkind = 'r'"`, undefined, true);
  const [tables, rlsTables] = result.split(':').map(Number);
  if (!Number.isFinite(tables) || tables < 10 || !Number.isFinite(rlsTables) || rlsTables < 1) {
    throw new Error(`Unexpected restored schema counts: ${result}`);
  }
  console.log(`Restore drill OK: ${tables} public tables, ${rlsTables} with RLS.`);
} finally {
  remote(`docker exec "$container" psql -X -v ON_ERROR_STOP=1 -U supabase_admin -d postgres -c "drop database if exists ${database} with (force)"`);
}
