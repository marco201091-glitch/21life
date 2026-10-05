import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

const policy = JSON.parse(readFileSync(new URL('./dependency-audit-policy.json', import.meta.url), 'utf8'));
if (!Number.isFinite(Date.parse(policy.expiresAt))) throw new Error('Audit exception policy has invalid expiry.');

function acceptedToolingAdvisories(payload, { project, lockfile, now = new Date() } = {}) {
  if (project !== policy.project || !Number.isFinite(Number(now)) || Number(now) >= Date.parse(policy.expiresAt)) return [];
  const entries = Object.entries(payload.vulnerabilities ?? {}).filter(([, v]) => severityRank[v.severity] >= severityRank.high);
  if (!entries.length || payload.metadata.vulnerabilities.critical > 0 || entries.length !== payload.metadata.vulnerabilities.high) return [];
  const reachable = new Set(entries.map(([name]) => name));
  for (const name of reachable) {
    for (const item of payload.vulnerabilities[name]?.via ?? []) {
      if (typeof item === 'string') reachable.add(item);
    }
  }
  for (const name of reachable) {
    const entry = payload.vulnerabilities[name];
    if (!entry) return [];
    const approved = policy.packages[name];
    if (!approved || entry.severity !== 'high' || !entry.nodes?.length || !entry.via?.length) return [];
    if (entry.nodes.length !== Object.keys(approved.nodes).length || entry.nodes.some((node) => !approved.nodes[node] || lockfile?.packages?.[node]?.version !== approved.nodes[node])) return [];
    const via = entry.via.map((item) => typeof item === 'string' ? item : item.url).sort();
    if (JSON.stringify(via) !== JSON.stringify(approved.via)) return [];
    for (const item of entry.via) {
      if (typeof item === 'string') {
        if (!payload.vulnerabilities[item] || !policy.packages[item]) return [];
      } else if (!policy.advisories[item.url] || policy.advisories[item.url].package !== name || item.severity !== 'high') return [];
    }
  }
  const accepted = new Set();
  for (const [name] of entries) {
    const visited = new Set();
    const found = new Set();
    const visit = (dependency) => {
      if (visited.has(dependency)) return;
      visited.add(dependency);
      for (const item of payload.vulnerabilities[dependency]?.via ?? []) {
        if (typeof item === 'string') visit(item);
        else if (policy.advisories[item.url]) found.add(item.url);
      }
    };
    visit(name);
    if (!found.size) return [];
    for (const url of found) accepted.add(url);
  }
  return [...accepted].sort();
}

export function summarizeAudit(payload, options = {}) {
  const counts = payload?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') {
    throw new Error(payload?.error?.summary || 'npm audit did not return a valid audit report.');
  }

  const entries = Object.values(payload.vulnerabilities ?? {});
  const severities = entries.map((entry) => entry.severity).filter((value) => value in severityRank);
  const highest = severities.reduce((current, next) => (
    severityRank[next] > severityRank[current] ? next : current
  ), 'info');

  const acceptedAdvisories = acceptedToolingAdvisories(payload, options);
  return {
    ...(acceptedAdvisories.length ? { acceptedAdvisories, exceptionExpiresAt: policy.expiresAt } : {}),
    counts,
    highestSeverity: highest,
    vulnerablePackages: entries.length,
    blocking: ((counts.high ?? 0) > 0 || (counts.critical ?? 0) > 0) && acceptedAdvisories.length === 0,
  };
}

export function executeAudit(projectDir, run = spawnSync, options = {}) {
  const npmCli = resolve(dirname(process.execPath), 'node_modules/npm/bin/npm-cli.js');
  const executable = process.platform === 'win32' && existsSync(npmCli) ? process.execPath : 'npm';
  const args = executable === process.execPath
    ? [npmCli, 'audit', '--omit=dev', '--json']
    : ['audit', '--omit=dev', '--json'];
  const result = run(executable, args, {
    cwd: projectDir,
    encoding: 'utf8',
    timeout: 120_000,
    maxBuffer: 32 * 1024 * 1024,
  });

  let payload;
  try {
    payload = JSON.parse(result.stdout || '');
  } catch {
    const reason = result.error?.message || result.stderr?.trim() || ('npm audit exited ' + result.status);
    throw new Error('npm audit could not produce JSON: ' + reason);
  }

  const summary = summarizeAudit(payload, options);
  if (result.error || (result.status !== 0 && !summary.blocking)) {
    const reason = result.error?.message || result.stderr?.trim() || ('npm audit exited ' + result.status);
    // npm exits nonzero for moderate findings by default; those remain reportable, not blocking.
    const advisoryExit = result.status === 1
      && ((summary.counts.moderate ?? 0) + (summary.counts.low ?? 0) > 0 || summary.acceptedAdvisories?.length > 0)
      && !summary.blocking;
    if (result.error || !advisoryExit) {
      throw new Error('npm audit failed before its security threshold: ' + reason);
    }
  }

  return { payload, summary };
}

export function runDependencyAudits({ rootDir, outputDir, run = spawnSync }) {
  mkdirSync(outputDir, { recursive: true });
  const reports = {};
  for (const [name, projectPath] of [
    ['web', rootDir],
    ['expo', resolve(rootDir, 'expo')],
  ]) {
    reports[name] = executeAudit(projectPath, run, name === 'expo' ? {
      project: 'expo', lockfile: JSON.parse(readFileSync(resolve(projectPath, 'package-lock.json'), 'utf8')),
    } : {});
    writeFileSync(resolve(outputDir, name + '.json'), JSON.stringify(reports[name].payload, null, 2) + '\n');
  }

  const summary = Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, report.summary]));
  writeFileSync(resolve(outputDir, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = process.cwd();
  const branch = process.env.AUDIT_TARGET_BRANCH || process.env.GITHUB_REF_NAME || 'local';
  const expoOnly = process.argv[2] === '--expo';
  const outputDir = resolve(expoOnly ? '../artifacts/dependency-audit' : process.argv[2] || 'artifacts/dependency-audit', branch);
  try {
    let summary;
    if (expoOnly) {
      mkdirSync(outputDir, { recursive: true });
      const report = executeAudit(rootDir, spawnSync, { project: 'expo', lockfile: JSON.parse(readFileSync(resolve(rootDir, 'package-lock.json'), 'utf8')) });
      writeFileSync(resolve(outputDir, 'expo.json'), JSON.stringify(report.payload, null, 2) + '\n');
      summary = { expo: report.summary };
      writeFileSync(resolve(outputDir, 'expo-summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2) + '\n');
    } else summary = runDependencyAudits({ rootDir, outputDir });
    console.log(JSON.stringify({ branch, outputDir, summary }, null, 2));
    for (const [project, report] of Object.entries(summary)) {
      if (report.acceptedAdvisories?.length) console.warn(project + ': accepted temporary tooling exceptions until ' + report.exceptionExpiresAt + ': ' + report.acceptedAdvisories.join(', '));
    }
    if (Object.values(summary).some((report) => report.blocking)) process.exitCode = 2;
  } catch (error) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(resolve(outputDir, 'error.json'), JSON.stringify({ branch, error: error.message, generatedAt: new Date().toISOString() }, null, 2) + '\n');
    console.error(error.message);
    process.exitCode = 3;
  }
}
