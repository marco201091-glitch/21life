import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyBackupChecksums, readBackupPackage } from '../../scripts/backup-package.mjs';
import { mkdtempSync, writeFileSync, unlinkSync, rmdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

const hash = (value) => createHash('sha256').update(value).digest('hex');
const files = { 'database.dump': Buffer.from('PGDMP-fixture'), 'storage.tar.gz': Buffer.from('storage-fixture') };
const checksums = Object.entries(files).map(([name, bytes]) => `${hash(bytes)}  ${name}`).join('\n');

test('off-site package verifies both files from SHA256SUMS', () => {
  assert.doesNotThrow(() => verifyBackupChecksums(checksums, files));
});
test('off-site package rejects corruption, missing storage, duplicate or unsafe names', () => {
  assert.throws(() => verifyBackupChecksums(checksums, { ...files, 'database.dump': Buffer.from('corrupted') }), /checksum/);
  assert.throws(() => verifyBackupChecksums(checksums, { 'database.dump': files['database.dump'] }), /missing/i);
  assert.throws(() => verifyBackupChecksums(`${checksums}\n${hash(files['database.dump'])}  database.dump`, files), /duplicate/i);
  assert.throws(() => verifyBackupChecksums(`${hash(files['database.dump'])}  ../database.dump`, files), /unsafe/i);
});
test('recovery package verifies optional roles and privileges and rejects their corruption', () => {
  const directory = mkdtempSync(join(tmpdir(), '21life-backup-test-'));
  const packageFiles = {
    'database.dump': Buffer.concat([Buffer.from('PGDMP'), Buffer.alloc(1024)]),
    'storage.tar.gz': Buffer.from('fixture'),
    'recovery-roles.sql': Buffer.from('CREATE ROLE fixture;'),
    'recovery-privileges.sql': Buffer.from('GRANT USAGE ON SCHEMA public TO fixture;'),
  };
  const names = [...Object.keys(packageFiles), 'SHA256SUMS', 'manifest.json'];
  try {
    for (const [name, bytes] of Object.entries(packageFiles)) writeFileSync(join(directory, name), bytes);
    writeFileSync(join(directory, 'manifest.json'), '{}');
    writeFileSync(join(directory, 'SHA256SUMS'), Object.entries(packageFiles).map(([name, bytes]) => `${hash(bytes)}  ${name}`).join('\n'));
    assert.equal(readBackupPackage(directory).format, 'offsite-package');
    writeFileSync(join(directory, 'recovery-privileges.sql'), 'corrupted');
    assert.throws(() => readBackupPackage(directory), /checksum/i);
  } finally {
    for (const name of names) unlinkSync(join(directory, name));
    rmdirSync(directory);
  }
});
