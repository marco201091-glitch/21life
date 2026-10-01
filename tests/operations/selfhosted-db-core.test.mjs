import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import {
  buildMigrationScript,
  getMigrationMetadata,
  stripOuterTransaction,
} from '../../scripts/selfhosted-db-core.mjs';

test('migration metadata accepts the repository filename format', () => {
  assert.deepEqual(getMigrationMetadata(
    '20261001010101_example_change.sql',
    'create table example_change (id int);',
  ), { version: '20261001010101', name: 'example_change' });
});

test('outer transaction wrappers are removed without changing dollar-quoted bodies', () => {
  const sql = [
    '-- retained migration header',
    'BEGIN;',
    'DO $$',
    'BEGIN',
    "  PERFORM 'text with ; and COMMIT;';",
    'END',
    '$$;',
    'COMMIT;',
    '',
  ].join('\n');
  const result = stripOuterTransaction(sql);
  assert.doesNotMatch(result, /^\s*BEGIN\s*;/i);
  assert.doesNotMatch(result, /COMMIT;\s*$/i);
  assert.match(result, /DO \$\$[\s\S]+END\s*\$\$;/);
});

test('transaction-less migration remains byte-for-byte unchanged', () => {
  const sql = '-- comment\nCREATE TABLE sample (value text DEFAULT \u0027semi;colon\u0027);\n';
  assert.equal(stripOuterTransaction(sql), sql);
});

test('a partial or nested outer transaction is rejected', () => {
  assert.throws(() => stripOuterTransaction('BEGIN;\nCREATE TABLE sample (id int);'), /unmatched/);
  assert.throws(
    () => stripOuterTransaction('BEGIN;\nBEGIN;\nSELECT 1;\nCOMMIT;\nCOMMIT;'),
    /nested transaction/,
  );
});

test('generated psql input locks, checks the checksum, applies SQL and records atomically', () => {
  const sql = '-- additive change\nCREATE TABLE sample (id int);';
  const checksum = createHash('sha256').update(sql).digest('hex');
  const script = buildMigrationScript({
    version: '20261001010101',
    name: 'example_change',
    checksum,
    sql,
  });
  assert.match(script, /pg_advisory_xact_lock\(2101212101, 1\)/);
  assert.match(script, /COALESCE\(\(SELECT checksum = '[a-f0-9]{64}'/);
  assert.ok(script.indexOf('CREATE TABLE sample') < script.indexOf('INSERT INTO app_private.schema_migrations'));
  assert.match(script, /\\if :migration_exists/);
  assert.match(script, /SELECT 1 \/ 0; -- checksum differs/);
});

test('checksum and timeout inputs are validated before SQL generation', () => {
  assert.throws(() => buildMigrationScript({
    version: '20261001010101',
    name: 'safe_name',
    checksum: 'not-a-checksum',
    sql: 'SELECT 1;',
  }), /SHA-256/);
  assert.throws(() => buildMigrationScript({
    version: '20261001010101',
    name: 'safe_name',
    checksum: 'a'.repeat(64),
    sql: 'SELECT 1;',
    lockTimeoutMs: 0,
  }), /timeout/);
});

test('transaction commands and psql escapes cannot bypass the atomic runner', () => {
  for (const boundary of ['COMMIT', 'COMMIT WORK', 'END', 'ROLLBACK', 'START TRANSACTION', 'START /* separator */ TRANSACTION', 'BEGIN WORK', 'PREPARE TRANSACTION \'x\'']) {
    assert.throws(() => stripOuterTransaction(`SELECT 1; ${boundary}; SELECT 2;`), /transaction boundary/);
  }
  assert.throws(() => stripOuterTransaction('SELECT 1;\n\\quit\n'), /psql/);
  assert.throws(() => stripOuterTransaction('/* outer /* inner */ outer */ COMMIT; SELECT 1;'), /transaction boundary/);
});
