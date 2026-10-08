import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';

const version = process.argv[2];
const match = /^(\d+)\.(\d+)\.(\d+)$/.exec(version ?? '');

if (!match) {
  console.error('Usage: node scripts/update-mobile-version.mjs <major.minor.patch>');
  process.exit(1);
}

const [, major, minor, patch] = match.map(Number);
if (minor > 99 || patch > 99) {
  console.error('Minor and patch must be between 0 and 99.');
  process.exit(1);
}

const versionCode = major * 10000 + minor * 100 + patch;
if (versionCode > 2_100_000_000) {
  console.error('Computed Android versionCode exceeds Play Store limit.');
  process.exit(1);
}

const root = resolve(import.meta.dirname, '..');

function update(relativePath, replacements) {
  const path = resolve(root, relativePath);
  let content = readFileSync(path, 'utf8');

  for (const [pattern, replacement] of replacements) {
    if (!pattern.test(content)) {
      throw new Error(`Expected version field missing in ${relativePath}: ${pattern}`);
    }
    content = content.replace(pattern, replacement);
  }

  writeFileSync(path, content);
  console.log(`Updated ${relativePath}`);
}

const packageVersion = [/^(\s*"version"\s*:\s*")[^"]+("\s*,)/m, `$1${version}$2`];
const packageLockProjectVersion = [
  /("packages"\s*:\s*\{\s*""\s*:\s*\{\s*"name"\s*:\s*"[^"]+",\s*"version"\s*:\s*")[^"]+/,
  `$1${version}`,
];

update('package.json', [packageVersion]);
update('package-lock.json', [packageVersion, packageLockProjectVersion]);
update('expo/package.json', [packageVersion]);
update('expo/package-lock.json', [packageVersion, packageLockProjectVersion]);
update('README.md', [
  [/(img\.shields\.io\/badge\/Android-v)[^-]+(-7c3aed)/, `$1${version}$2`],
]);
update('expo/app.json', [
  packageVersion,
  [/("buildNumber"\s*:\s*")[^"]+("\s*,)/, `$1${versionCode}$2`],
  [/("versionCode"\s*:\s*)\d+/, `$1${versionCode}`],
]);
update('expo/lib/app-version.ts', [
  [/APP_DISPLAY_VERSION\s*=\s*'[^']+'/, `APP_DISPLAY_VERSION = '${version}'`],
]);
update('lib/legal-site.ts', [
  [/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${version}'`],
]);
update('expo/lib/legal-site.ts', [
  [/APP_VERSION\s*=\s*'[^']+'/, `APP_VERSION = '${version}'`],
]);
for (const relativePath of [
  'expo/lib/remote-image.ts',
  'expo/lib/scryfall-search.ts',
  'expo/tests/lib/remote-image.test.ts',
]) {
  update(relativePath, [
    [/21Life\/\d+\.\d+\.\d+/, `21Life/${version}`],
  ]);
}
console.log(`Version ${version} (code ${versionCode}) synchronized.`);
