import test from 'node:test';
import assert from 'node:assert/strict';
import { createMigrationManifest } from '../../scripts/build-migration-manifest.mjs';

test('manifest checksum is SHA-256 of exact migration bytes, preserving LF and CRLF distinctions', () => {
  const lf = Buffer.from('SELECT 1;\n');
  const crlf = Buffer.from('SELECT 1;\r\n');
  const lfManifest = createMigrationManifest([{ name: '20260101000000_example.sql', bytes: lf }]);
  const crlfManifest = createMigrationManifest([{ name: '20260101000000_example.sql', bytes: crlf }]);
  assert.notEqual(lfManifest.migrations[0].checksum, crlfManifest.migrations[0].checksum);
  assert.deepEqual(createMigrationManifest([
    { name: '20260102000000_b.sql', bytes: Buffer.from('b') },
    { name: '20260101000000_a.sql', bytes: Buffer.from('a') },
  ]).migrations.map(({ name }) => name), [
    '20260101000000_a.sql',
    '20260102000000_b.sql',
  ]);
});
