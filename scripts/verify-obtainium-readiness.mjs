import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relativePath) => fs.readFileSync(path.join(repoRoot, relativePath), 'utf8');
const failures = [];

const requiredFiles = [
  'LICENSE',
  'THIRD_PARTY_NOTICES.md',
  'docs/ASSET_PROVENANCE.md',
  'docs/OBTAINIUM_RELEASE_CHECKLIST.md',
  '.github/RELEASE_TEMPLATE.md',
];
for (const relativePath of requiredFiles) {
  if (!fs.existsSync(path.join(repoRoot, relativePath))) {
    failures.push(`missing ${relativePath}`);
  }
}

const appConfig = JSON.parse(read('expo/app.json'));
if (appConfig.expo?.name !== '21Life') {
  failures.push('unexpected Android display name');
}
if (appConfig.expo?.android?.package !== 'com.phyrexianarena.app') {
  failures.push('unexpected production package identifier');
}

const license = read('LICENSE');
if (!license.includes('MIT License') || !license.includes('blackistoostrong')) {
  failures.push('MIT license identity is incomplete');
}

const legalSite = read('lib/legal-site.ts');
if (!legalSite.includes("LEGAL_CONTROLLER_NAME = 'Marco Andreani'")) {
  failures.push('GDPR controller is missing');
}
if (!legalSite.includes("OFFICIAL_SUPPORT_EMAIL = 'support@21life.win'")) {
  failures.push('official support email is missing');
}
if (!legalSite.includes('unofficial Fan Content permitted under the Fan Content Policy')) {
  failures.push('Wizards fan-content notice is missing');
}

const assetProvenance = read('docs/ASSET_PROVENANCE.md');
if (process.argv.includes('--release') && /\bPENDING\b/.test(assetProvenance)) {
  failures.push('asset provenance still contains PENDING release blockers');
}

if (failures.length) {
  console.error(`Obtainium readiness failed:\n- ${failures.join('\n- ')}`);
  process.exit(1);
}

console.log(`Obtainium readiness passed${process.argv.includes('--release') ? ' for release' : ''}.`);
