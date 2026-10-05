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
  metadata: { vulnerabilities: { high: 1, critical: 0 } },
  vulnerabilities: { braces: { severity: 'high', nodes: ['node_modules/braces'], via: [{ url: 'https://github.com/advisories/GHSA-vfj7-8cjw-p6xm', name: 'braces', severity: 'high' }] } },
});
const approvedOptions = () => ({ project: 'expo', now: new Date('2026-10-05T12:00:00Z'), lockfile: { packages: { 'node_modules/braces': {version:'3.0.3'} } } });
test('approved Expo tooling finding remains visible but passes before expiry', () => {
  const s = summarizeAudit(approvedReport(), approvedOptions());
  assert.equal(s.blocking, false); assert.equal(s.counts.high, 1); assert.equal(s.highestSeverity, 'high');
  assert.deepEqual(s.acceptedAdvisories, ['https://github.com/advisories/GHSA-vfj7-8cjw-p6xm']);
});
test('exception fails closed at expiry and outside Expo', () => {
  for(const options of [{...approvedOptions(),now:new Date('2026-10-18T22:00:00Z')},{...approvedOptions(),project:'web'}]) assert.equal(summarizeAudit(approvedReport(),options).blocking,true);
});
test('exception fails closed on changed version, path, advisory, or severity', () => {
  const mutations = [
    (a,o)=>{o.lockfile.packages['node_modules/braces'].version='3.0.4';},
    (a)=>{a.vulnerabilities.braces.nodes=['node_modules/unreviewed/node_modules/braces'];},
    (a)=>{a.vulnerabilities.braces.via[0].url='https://github.com/advisories/GHSA-other';},
    (a)=>{a.vulnerabilities.braces.severity='critical';a.metadata.vulnerabilities.critical=1;},
    (a)=>{a.vulnerabilities.braces.via.push('unreviewed');},
  ];for(const mutate of mutations){const a=approvedReport(),o=approvedOptions();mutate(a,o);assert.equal(summarizeAudit(a,o).blocking,true);}
});
test('approved high-only npm exit remains distinct from infrastructure failure', () => {
  const run=()=>({status:1,stdout:JSON.stringify(approvedReport()),stderr:''});
  assert.equal(executeAudit('.',run,approvedOptions()).summary.blocking,false);
  assert.throws(()=>executeAudit('.',()=>({...run(),status:2}),approvedOptions()),/before its security threshold/);
});

test('a high dependency cannot hide an unreviewed moderate root', () => {
  const a=approvedReport();a.metadata.vulnerabilities.moderate=1;
  a.vulnerabilities.micromatch={severity:'high',nodes:['node_modules/micromatch'],via:['braces']};
  a.vulnerabilities.braces.severity='moderate';a.vulnerabilities.braces.nodes=['node_modules/unreviewed/node_modules/braces'];
  a.vulnerabilities.braces.via.push({url:'https://github.com/advisories/GHSA-other',severity:'moderate'});
  const o=approvedOptions();o.lockfile.packages['node_modules/micromatch']={version:'4.0.8'};
  assert.equal(summarizeAudit(a,o).blocking,true);
});
