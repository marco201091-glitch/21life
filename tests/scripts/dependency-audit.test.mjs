import test from 'node:test';
import assert from 'node:assert/strict';
import { executeAudit, summarizeAudit } from '../../scripts/dependency-audit.mjs';

const audit = (vulnerabilities) => ({
  metadata: { vulnerabilities },
  vulnerabilities: {},
});

test('clean reports pass', () => {
  assert.deepEqual(summarizeAudit(audit({ low: 0, moderate: 0, high: 0, critical: 0 })), {
    counts: { low: 0, moderate: 0, high: 0, critical: 0 },
    highestSeverity: 'info',
    vulnerablePackages: 0,
    blocking: false,
  });
});

test('moderate findings are reported without blocking', () => {
  assert.equal(summarizeAudit(audit({ moderate: 2, high: 0, critical: 0 })).blocking, false);
});

test('npm advisory exit for low or moderate reports does not become an infrastructure error', () => {
  const run = () => ({ status: 1, stdout: JSON.stringify(audit({ low: 1, moderate: 0, high: 0, critical: 0 })), stderr: '' });
  assert.equal(executeAudit('.', run).summary.blocking, false);
});

test('registry failure without an audit report is an infrastructure error', () => {
  const run = () => ({ status: 1, stdout: JSON.stringify({ error: { summary: 'registry unavailable' } }), stderr: '' });
  assert.throws(() => executeAudit('.', run), /registry unavailable/);
});

test('high and critical findings block', () => {
  assert.equal(summarizeAudit(audit({ high: 1, critical: 0 })).blocking, true);
  assert.equal(summarizeAudit(audit({ high: 0, critical: 1 })).blocking, true);
});

test('infrastructure errors are distinguishable from clean reports', () => {
  assert.throws(() => summarizeAudit({ error: { summary: 'registry unavailable' } }), /registry unavailable/);
});
