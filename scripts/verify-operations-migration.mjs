import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = process.cwd();
const migrations = readdirSync(join(root, 'supabase', 'migrations'))
  .filter((name) => /^\d{14}_.+\.sql$/i.test(name))
  .sort()
  .map((name) => ({
    version: name.slice(0, 14),
    name,
    checksum: createHash('sha256').update(readFileSync(join(root, 'supabase', 'migrations', name))).digest('hex'),
  }));
const latest = migrations.at(-1)?.name;
assert.ok(latest, 'No Supabase migrations found.');

const manifestPath = join(root, 'lib', 'migration-manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
assert.deepEqual(manifest.migrations, migrations, 'Migration manifest is stale or checksums do not match raw file bytes. Run npm run build.');

const operationsRoute = readFileSync(join(root, 'app', 'api', 'admin', 'operations', 'route.ts'), 'utf8');
assert.match(
  operationsRoute,
  new RegExp(String.raw`expectedLatestMigration: migrationManifest\.migrations\.at\(-1\)\?\.name`),
  'Operations must derive the newest migration from the standalone manifest.',
);
console.log(`Operations migration manifest passed: ${migrations.length} raw-file checksums; latest ${latest}.`);
