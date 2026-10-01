import { spawnSync } from 'node:child_process';
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const severityRank = { info: 0, low: 1, moderate: 2, high: 3, critical: 4 };

export function summarizeAudit(payload) {
  const counts = payload?.metadata?.vulnerabilities;
  if (!counts || typeof counts !== 'object') {
    throw new Error(payload?.error?.summary || 'npm audit did not return a valid audit report.');
  }

  const entries = Object.values(payload.vulnerabilities ?? {});
  const severities = entries.map((entry) => entry.severity).filter((value) => value in severityRank);
  const highest = severities.reduce((current, next) => (
    severityRank[next] > severityRank[current] ? next : current
  ), 'info');

  return {
    counts,
    highestSeverity: highest,
    vulnerablePackages: entries.length,
    blocking: (counts.high ?? 0) > 0 || (counts.critical ?? 0) > 0,
  };
}

export function executeAudit(projectDir, run = spawnSync) {
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

  const summary = summarizeAudit(payload);
  if (result.error || (result.status !== 0 && !summary.blocking)) {
    const reason = result.error?.message || result.stderr?.trim() || ('npm audit exited ' + result.status);
    // npm exits nonzero for moderate findings by default; those remain reportable, not blocking.
    const advisoryExit = result.status === 1
      && (summary.counts.moderate ?? 0) + (summary.counts.low ?? 0) > 0
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
    reports[name] = executeAudit(projectPath, run);
    writeFileSync(resolve(outputDir, name + '.json'), JSON.stringify(reports[name].payload, null, 2) + '\n');
  }

  const summary = Object.fromEntries(Object.entries(reports).map(([name, report]) => [name, report.summary]));
  writeFileSync(resolve(outputDir, 'summary.json'), JSON.stringify({ generatedAt: new Date().toISOString(), summary }, null, 2) + '\n');
  return summary;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const rootDir = process.cwd();
  const branch = process.env.GITHUB_REF_NAME || 'local';
  const outputDir = resolve(process.argv[2] || 'artifacts/dependency-audit', branch);
  try {
    const summary = runDependencyAudits({ rootDir, outputDir });
    console.log(JSON.stringify({ branch, outputDir, summary }, null, 2));
    if (Object.values(summary).some((report) => report.blocking)) process.exitCode = 2;
  } catch (error) {
    mkdirSync(outputDir, { recursive: true });
    writeFileSync(resolve(outputDir, 'error.json'), JSON.stringify({ branch, error: error.message, generatedAt: new Date().toISOString() }, null, 2) + '\n');
    console.error(error.message);
    process.exitCode = 3;
  }
}
