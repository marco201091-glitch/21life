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

test('version 2 requires every recovery component and verifies the manifest checksum', () => {
  const directory = mkdtempSync(join(tmpdir(), '21life-backup-v2-'));
  const packageFiles = {
    'database.dump': Buffer.concat([Buffer.from('PGDMP'), Buffer.alloc(1024)]),
    'storage.tar.gz': Buffer.from('fixture'),
    'recovery-roles.sql': Buffer.from('roles'),
    'recovery-privileges.sql': Buffer.from('grants'),
    'recovery-config.tar.gz': Buffer.from('PRIVATE fixture configuration'),
    'recovery-inventory.json': Buffer.from('{}'),
  };
  const manifest = { schemaVersion: 2, requiredFiles: Object.keys(packageFiles) };
  const allFiles = { ...packageFiles, 'manifest.json': Buffer.from(JSON.stringify(manifest)) };
  try {
    for (const [name, bytes] of Object.entries(allFiles)) writeFileSync(join(directory, name), bytes);
    writeFileSync(join(directory, 'SHA256SUMS'), Object.entries(allFiles).map(([name, bytes]) => `${hash(bytes)}  ${name}`).join('\n'));
    const result = readBackupPackage(directory);
    assert.equal(result.recoveryVersion, 2);
    assert.equal(result.completeRecoveryPackage, true);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ ...manifest, sourceProject: 'tampered' }));
    assert.throws(() => readBackupPackage(directory), /checksum/i);
    writeFileSync(join(directory, 'manifest.json'), allFiles['manifest.json']);
    unlinkSync(join(directory, 'recovery-config.tar.gz'));
    assert.throws(() => readBackupPackage(directory), /ENOENT|missing/i);
    writeFileSync(join(directory, 'recovery-config.tar.gz'), allFiles['recovery-config.tar.gz']);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 3 }));
    assert.throws(() => readBackupPackage(directory), /unsupported/i);
    writeFileSync(join(directory, 'manifest.json'), JSON.stringify({ schemaVersion: 2, requiredFiles: ['database.dump'] }));
    assert.throws(() => readBackupPackage(directory), /incomplete/i);
  } finally {
    for (const name of [...Object.keys(allFiles), 'SHA256SUMS']) {
      try { unlinkSync(join(directory, name)); } catch (error) { if (error.code !== 'ENOENT') throw error; }
    }
    rmdirSync(directory);
  }
});
