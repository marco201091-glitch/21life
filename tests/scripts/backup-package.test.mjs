import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { verifyBackupChecksums } from '../../scripts/backup-package.mjs';

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
