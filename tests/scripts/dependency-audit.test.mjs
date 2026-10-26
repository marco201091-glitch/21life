import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
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

const approvedReport = () => ({
  metadata: { vulnerabilities: { low: 0, moderate: 0, high: 5, critical: 0 } },
  vulnerabilities: {
    '@expo/cli': { severity: 'high', nodes: ['node_modules/expo/node_modules/@expo/cli'], via: ['@expo/code-signing-certificates', 'node-forge'] },
    '@expo/code-signing-certificates': { severity: 'high', nodes: ['node_modules/@expo/code-signing-certificates'], via: ['node-forge'] },
    '@sentry/react-native': { severity: 'high', nodes: ['node_modules/@sentry/react-native'], via: ['expo'] },
    expo: { severity: 'high', nodes: ['node_modules/expo'], via: ['@expo/cli'] },
    'node-forge': { severity: 'high', nodes: ['node_modules/node-forge'], via: [{ url: 'https://github.com/advisories/GHSA-86w9-cpqp-85rv', name: 'node-forge', severity: 'high' }] },
  },
});
const approvedOptions = () => ({
  project: 'expo',
  now: new Date('2026-10-05T12:00:00Z'),
  lockfile: { packages: {
    'node_modules/expo/node_modules/@expo/cli': { version: '58.1.15' },
    'node_modules/@expo/code-signing-certificates': { version: '0.0.7' },
    'node_modules/@sentry/react-native': { version: '8.28.0' },
    'node_modules/expo': { version: '58.0.19' },
    'node_modules/node-forge': { version: '1.4.0' },
  } },
});
test('approved Expo tooling finding remains visible but passes before expiry', () => {
  const s = summarizeAudit(approvedReport(), approvedOptions());
  assert.equal(s.blocking, false); assert.equal(s.counts.high, 5); assert.equal(s.highestSeverity, 'high');
  assert.deepEqual(s.acceptedAdvisories, ['https://github.com/advisories/GHSA-86w9-cpqp-85rv']);
});
test('exception fails closed at expiry and outside Expo', () => {
  for(const options of [{...approvedOptions(),now:new Date('2026-11-08T23:00:00Z')},{...approvedOptions(),project:'web'}]) assert.equal(summarizeAudit(approvedReport(),options).blocking,true);
});
test('exception fails closed on changed version, path, advisory, or severity', () => {
  const mutations = [
    (a,o)=>{o.lockfile.packages['node_modules/node-forge'].version='1.4.1';},
    (a)=>{a.vulnerabilities['node-forge'].nodes=['node_modules/unreviewed/node_modules/node-forge'];},
    (a)=>{a.vulnerabilities['node-forge'].via[0].url='https://github.com/advisories/GHSA-other';},
    (a)=>{a.vulnerabilities['node-forge'].severity='critical';a.metadata.vulnerabilities.critical=1;},
    (a)=>{a.vulnerabilities['node-forge'].via.push('unreviewed');},
  ];for(const mutate of mutations){const a=approvedReport(),o=approvedOptions();mutate(a,o);assert.equal(summarizeAudit(a,o).blocking,true);}
});
test('approved high-only npm exit remains distinct from infrastructure failure', () => {
  const run=()=>({status:1,stdout:JSON.stringify(approvedReport()),stderr:''});
  assert.equal(executeAudit('.',run,approvedOptions()).summary.blocking,false);
  assert.throws(()=>executeAudit('.',()=>({...run(),status:2}),approvedOptions()),/before its security threshold/);
});

test('a high dependency cannot hide an unreviewed moderate root', () => {
  const a=approvedReport();a.metadata.vulnerabilities.moderate=1;
  a.vulnerabilities['@expo/cli'].via.push('braces');
  a.vulnerabilities.braces={severity:'moderate',nodes:['node_modules/braces'],via:[{url:'https://github.com/advisories/GHSA-other',severity:'moderate'}]};
  const o=approvedOptions();
  assert.equal(summarizeAudit(a,o).blocking,true);
});

test('verified Expo tooling patches mitigate only the reviewed node-forge graph and keep it visible', () => {
  const summary = summarizeAudit(approvedReport(), {
    ...approvedOptions(),
    now: new Date('2026-10-26T12:00:00Z'),
    installedDir: resolve(process.cwd(), 'expo'),
  });
  assert.equal(summary.blocking, false);
  assert.equal(summary.counts.high, 5);
  assert.equal(summary.acceptedAdvisories, undefined);
  assert.deepEqual(summary.mitigatedAdvisories, ['https://github.com/advisories/GHSA-86w9-cpqp-85rv']);
});

test('Expo tooling patch acceptance fails closed after its review date', () => {
  const summary = summarizeAudit(approvedReport(), { ...approvedOptions(), now: new Date('2026-11-10T12:00:00Z') });
  assert.equal(summary.blocking, true);
  assert.equal(summary.acceptedAdvisories, undefined);
});

test('patched installed source is required after exception expiry', {skip: !existsSync(resolve(process.cwd(), 'expo', 'node_modules'))}, () => {
 const o={...approvedOptions(),now:new Date('2026-11-10T12:00:00Z'),installedDir:resolve(process.cwd(), 'expo')};
 assert.equal(summarizeAudit(approvedReport(),o).blocking,false);
 assert.equal(summarizeAudit(approvedReport(),{...o,installedDir:'missing'}).blocking,true);
 });
