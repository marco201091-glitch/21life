import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export function verifyInstalledVersions(packages, readInstalled) {
  const errors = [];
  for (const name of packages) {
    const expected = readInstalled(name, true);
    const actual = readInstalled(name, false);
    if (!expected || actual !== expected) errors.push(`${name}: installed ${actual ?? 'missing'}, lock ${expected ?? 'missing'}`);
  }
  return errors;
}

export function verifyToolchain(root, expoOnly = false) {
  const errors = [];
  const expectedNode = readFileSync(resolve(root, '.node-version'), 'utf8').trim();
  if (process.versions.node !== expectedNode) errors.push(`Node ${process.versions.node}; use ${expectedNode} from .node-version`);
  const npmVersion = process.env.npm_config_user_agent?.match(/npm\/([\d.]+)/)?.[1];
  if (npmVersion && !/^(10|11)\./.test(npmVersion)) errors.push(`Unsupported npm ${npmVersion}; use packageManager from package.json`);
  for (const [base, names] of [
    ['.', ['next', 'react', 'typescript', 'vitest']],
    ['expo', ['expo', 'react-native', 'react', 'typescript', 'vitest']],
  ]) {
    if (expoOnly && base !== 'expo') continue;
    const lock = JSON.parse(readFileSync(resolve(root, base, 'package-lock.json'), 'utf8'));
    errors.push(...verifyInstalledVersions(names, (name, expected) => {
      if (expected) return lock.packages?.[`node_modules/${name}`]?.version;
      try { return JSON.parse(readFileSync(resolve(root, base, 'node_modules', name, 'package.json'), 'utf8')).version; }
      catch { return undefined; }
    }).map(error => `${base}: ${error}`));
  }
  return errors;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
  const errors = verifyToolchain(root, process.argv.includes('--expo'));
  if (errors.length) {
    console.error(errors.join('\n'));
    console.error('Use the project Node version, then npm ci and npm --prefix expo ci. Do not reuse another worktree node_modules.');
    process.exitCode = 1;
  } else console.log('Toolchain matches project Node and both lockfiles.');
}
