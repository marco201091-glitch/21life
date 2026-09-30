import crypto from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';

const [apkArgument, expectedVersion] = process.argv.slice(2);
if (!apkArgument || !expectedVersion) {
  console.error('Usage: node scripts/verify-release-apk.mjs <apk> <version>');
  process.exit(1);
}

const apkPath = path.resolve(apkArgument);
if (!fs.existsSync(apkPath)) {
  console.error(`APK not found: ${apkPath}`);
  process.exit(1);
}

const sdkRoot = process.env.ANDROID_HOME
  || process.env.ANDROID_SDK_ROOT
  || path.join(os.homedir(), 'AppData', 'Local', 'Android', 'Sdk');
const buildToolsRoot = path.join(sdkRoot, 'build-tools');
const versions = fs.readdirSync(buildToolsRoot, { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort((left, right) => right.localeCompare(left, undefined, { numeric: true }));
if (!versions.length) {
  console.error('Android build-tools not found');
  process.exit(1);
}

const executable = (name) => path.join(
  buildToolsRoot,
  versions[0],
  process.platform === 'win32' ? `${name}.${name === 'apksigner' ? 'bat' : 'exe'}` : name,
);
const run = (command, args) => {
  // Android SDK exposes apksigner as a .bat wrapper on Windows.
  const result = spawnSync(command, args, {
    encoding: 'utf8',
    shell: process.platform === 'win32' && command.toLowerCase().endsWith('.bat'),
  });
  if (result.status !== 0) {
    console.error(result.stderr || result.stdout || `${path.basename(command)} failed`);
    process.exit(1);
  }
  return `${result.stdout || ''}${result.stderr || ''}`;
};

const badging = run(executable('aapt'), ['dump', 'badging', apkPath]);
if (!badging.includes("package: name='com.phyrexianarena.app'")) {
  console.error('Unexpected production package identifier');
  process.exit(1);
}
const nativeCode = badging.match(/^native-code:.*$/m)?.[0] || '';
if (!nativeCode.includes("'arm64-v8a'") || !nativeCode.includes("'x86_64'")) {
  console.error('Production APK must include arm64-v8a and x86_64 native libraries');
  process.exit(1);
}
if (!badging.includes(`versionName='${expectedVersion}'`)) {
  console.error('APK version does not match the requested release');
  process.exit(1);
}
if (/application-debuggable/i.test(badging)) {
  console.error('Release APK is debuggable');
  process.exit(1);
}

const signature = run(executable('apksigner'), [
  'verify',
  '--verbose',
  '--print-certs',
  apkPath,
]);
if (/CN=Android Debug|androiddebugkey/i.test(signature)) {
  console.error('Release APK uses a debug certificate');
  process.exit(1);
}
if (!/Verifies/i.test(signature)) {
  console.error('APK signature verification did not succeed');
  process.exit(1);
}

const digest = crypto.createHash('sha256').update(fs.readFileSync(apkPath)).digest('hex');
const checksumPath = `${apkPath}.sha256`;
fs.writeFileSync(checksumPath, `${digest}  ${path.basename(apkPath)}\n`, 'utf8');

console.log(`Release APK verified: ${path.basename(apkPath)}`);
console.log(`SHA-256: ${digest}`);
