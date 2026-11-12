import { test } from 'node:test';
import assert from 'node:assert/strict';
import { verifyInstalledVersions } from '../../scripts/verify-toolchain.mjs';

test('installed graph must match lock; missing package is actionable drift', () => {
  assert.deepEqual(verifyInstalledVersions(['vitest'], () => '5.0.3'), []);
  assert.equal(verifyInstalledVersions(['vitest'], (_, lock) => lock ? '5.0.3' : '3.2.7').length, 1);
  assert.equal(verifyInstalledVersions(['vitest'], (_, lock) => lock ? '5.0.3' : undefined).length, 1);
  assert.equal(verifyInstalledVersions(['vitest'], () => undefined).length, 1);
});
