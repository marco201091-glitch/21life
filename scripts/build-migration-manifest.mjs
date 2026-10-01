import { createHash } from 'node:crypto';
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

export function createMigrationManifest(files) {
  const migrations = [...files]
    .sort((a, b) => a.name.localeCompare(b.name))
    .map(({ name, bytes }) => ({
      version: name.slice(0, 14),
      name,
      checksum: createHash('sha256').update(bytes).digest('hex'),
    }));
  if (migrations.some(({ name }) => !/^\d{14}_.+\.sql$/i.test(name))) {
    throw new Error('Migration filename must start with a 14-digit version.');
  }
  return { migrations };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const root = process.cwd();
  const migrationDirectory = join(root, 'supabase', 'migrations');
  const files = readdirSync(migrationDirectory)
    .filter((name) => /^\d{14}_.+\.sql$/i.test(name))
    .map((name) => ({ name, bytes: readFileSync(join(migrationDirectory, name)) }));
  const manifest = createMigrationManifest(files);
  if (manifest.migrations.length === 0) throw new Error('No migration files found.');
  const output = join(root, 'lib', 'migration-manifest.json');
  mkdirSync(join(root, 'lib'), { recursive: true });
  writeFileSync(output, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`Generated ${manifest.migrations.length} migration entries.`);
}
