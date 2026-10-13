import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const expoDir = path.resolve(scriptDir, '..');
const repoRoot = path.resolve(expoDir, '..');
const require = createRequire(import.meta.url);

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(expoDir, relativePath), 'utf8'));
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const app = readJson('app.json').expo;
const eas = readJson('eas.json');
const mobilePackage = readJson('package.json');
const rootPackage = JSON.parse(fs.readFileSync(path.join(repoRoot, 'package.json'), 'utf8'));
const workflowPath = path.join(expoDir, '.eas', 'build', 'unsigned-ios.yml');
const workflow = fs.readFileSync(workflowPath, 'utf8');
const resolveConfig = require(path.join(expoDir, 'app.config.js'));
const expectedBuildNumber = String(
  Number(app.version.split('.')[0]) * 10_000
  + Number(app.version.split('.')[1]) * 100
  + Number(app.version.split('.')[2]),
);

assert(app.platforms.includes('ios'), 'iOS is missing from expo.platforms');
assert(app.ios?.bundleIdentifier === 'com.phyrexianarena.app', 'Unexpected Production bundle identifier');
assert(app.ios?.supportsTablet === true, 'iPad support must stay enabled');
assert(app.ios?.requireFullScreen === false, 'iPad multitasking support must stay enabled');
assert(app.orientation === 'default', 'iPad rotation requires the default orientation policy');
assert(app.ios?.buildNumber === expectedBuildNumber, 'iOS buildNumber does not match the semantic version');
assert(app.version === mobilePackage.version, 'Expo app and mobile package versions differ');
assert(app.version === rootPackage.version, 'Root and mobile versions differ');
assert(app.ios?.privacyManifests?.NSPrivacyTracking === false, 'Privacy manifest must explicitly disable tracking');
assert(app.ios?.associatedDomains?.includes('applinks:app.phyrexianarena.dpdns.org'), 'Production Universal Link domain is missing');

const previousVariant = process.env.APP_VARIANT;
process.env.APP_VARIANT = 'dev';
const devConfig = resolveConfig({ config: app });
process.env.APP_VARIANT = 'production';
const productionConfig = resolveConfig({ config: app });
if (previousVariant === undefined) delete process.env.APP_VARIANT;
else process.env.APP_VARIANT = previousVariant;

assert(devConfig.ios?.bundleIdentifier === 'com.phyrexianarena.app.dev', 'Dev iOS bundle identifier is invalid');
assert(devConfig.scheme === 'phyrexianarena-dev', 'Dev iOS URL scheme is invalid');
assert(devConfig.ios?.associatedDomains?.includes('applinks:dev.phyrexianarena.dpdns.org'), 'Dev Universal Link domain is missing');
assert(productionConfig.ios?.bundleIdentifier === app.ios.bundleIdentifier, 'Production dynamic iOS config diverges from app.json');
assert(productionConfig.scheme === app.scheme, 'Production iOS URL scheme diverges from app.json');

const plugins = app.plugins.map((plugin) => Array.isArray(plugin) ? plugin[0] : plugin);
for (const plugin of ['expo-router', 'expo-screen-orientation', 'expo-secure-store']) {
  assert(plugins.includes(plugin), `Required iOS config plugin is missing: ${plugin}`);
}

for (const dependency of [
  'react-native-gesture-handler',
  'react-native-reanimated',
  'react-native-worklets',
  'zustand',
]) {
  assert(mobilePackage.dependencies[dependency], `Required mobile dependency is missing: ${dependency}`);
}

assert(eas.build?.['ios-simulator']?.ios?.simulator === true, 'iOS simulator profile is invalid');
assert(eas.build?.['ios-unsigned']?.ios?.withoutCredentials === true, 'Unsigned IPA profile must not require credentials');
assert(eas.build?.['ios-unsigned']?.ios?.config === 'unsigned-ios.yml', 'Unsigned IPA workflow is not connected');
assert(eas.build?.['ios-release-unsigned']?.environment === 'production', 'Release IPA must use the Production EAS environment');
assert(eas.build?.['ios-release-unsigned']?.env?.APP_VARIANT === 'production', 'Release IPA must use the Production app variant');
assert(eas.build?.['ios-release-unsigned']?.ios?.withoutCredentials === true, 'Unsigned Release IPA must not require credentials');
assert(eas.build?.['ios-release-unsigned']?.ios?.config === 'unsigned-ios.yml', 'Unsigned Release IPA workflow is not connected');
assert(eas.build?.preview?.ios, 'Signed preview iOS profile is missing');
assert(eas.build?.production?.ios, 'Production iOS profile is missing');

for (const marker of [
  'eas/prebuild',
  'pod install',
  "generic/platform=iOS",
  'CODE_SIGNING_ALLOWED=NO',
  'SENTRY_DISABLE_AUTO_UPLOAD:?',
  'main.jsbundle',
  '21Life-unsigned.ipa',
  'eas/upload_artifact',
]) {
  assert(workflow.includes(marker), `Unsigned IPA workflow is missing: ${marker}`);
}

assert(!workflow.includes('SENTRY_ALLOW_FAILURE'), 'Unsigned IPA workflow must not bypass React Native bundling');
assert(!workflow.includes('export SENTRY_DISABLE_AUTO_UPLOAD=true'), 'Unsigned IPA must preserve the profile upload policy');
assert(eas.build['ios-release-unsigned'].env.SENTRY_DISABLE_AUTO_UPLOAD === 'false', 'Production unsigned IPA must upload symbols');

for (const asset of ['assets/icon.png', 'assets/splash-icon.png']) {
  assert(fs.existsSync(path.join(expoDir, asset)), `Missing iOS asset: ${asset}`);
}

console.log(`iOS/iPad gate passed: v${app.version} (${app.ios.buildNumber}), Dev/Preview/Production profiles ready.`);
