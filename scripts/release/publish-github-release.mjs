import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { publishReleaseAssets } from './github-release-assets.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const version = process.env.RELEASE_VERSION;
const repo = process.env.GITHUB_REPOSITORY;
const token = process.env.GITHUB_TOKEN;
const commitSha = process.env.GITHUB_SHA;
const tag = process.env.RELEASE_TAG;
if (!version || !repo || !token || !commitSha || !tag) throw new Error('Release publication environment is incomplete.');

const artifactDirectory = path.join(root, 'artifacts', 'apk');
const names = [
  `21life-v${version}.apk`,
  `21life-v${version}.apk.sha256`,
  `web-sbom-${version}.json`,
  `android-sbom-${version}.json`,
];
const assets = names.map((name) => {
  const filename = path.join(artifactDirectory, name);
  return { name, bytes: fs.readFileSync(filename) };
});
const apiBase = 'https://api.github.com';
const apiHeaders = {
  Accept: 'application/vnd.github+json',
  Authorization: `Bearer ${token}`,
  'X-GitHub-Api-Version': '2022-11-28',
};
async function request(method, pathname, body) {
  const response = await fetch(apiBase + pathname, {
    method,
    headers: { ...apiHeaders, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  if (!response.ok) {
    const error = new Error(`GitHub API ${method} ${pathname} failed with HTTP ${response.status}.`);
    error.status = response.status;
    throw error;
  }
  return response.status === 204 ? null : response.json();
}
const api = {
  request,
  async uploadAsset(uploadUrl, name, bytes) {
    const url = uploadUrl.replace(/\{\?.*$/, '') + '?name=' + encodeURIComponent(name);
    const response = await fetch(url, {
      method: 'POST',
      headers: { ...apiHeaders, 'Content-Type': 'application/octet-stream', 'Content-Length': String(bytes.length) },
      body: bytes,
    });
    if (!response.ok) {
      const error = new Error(`GitHub asset upload failed with HTTP ${response.status}.`);
      error.status = response.status;
      throw error;
    }
    return response.json();
  },
  async downloadAsset(url) {
    const response = await fetch(url, { headers: { ...apiHeaders, Accept: 'application/octet-stream' } });
    if (!response.ok) throw new Error(`GitHub asset download failed with HTTP ${response.status}.`);
    return Buffer.from(await response.arrayBuffer());
  },
};

const notesPath = path.join(root, 'docs', 'releases', `${version}.md`);
const trailer = [
  '',
  'Install or update with Obtainium from this repository’s GitHub Releases.',
  '',
  'The attached checksum can be used to verify the APK before installation.',
].join('\n');
const body = fs.existsSync(notesPath)
  ? fs.readFileSync(notesPath, 'utf8').trimEnd() + trailer
  : `21Life ${tag}\n\nSee the merged changes for this release.${trailer}`;
const result = await publishReleaseAssets({
  api,
  repo,
  tag,
  version,
  commitSha,
  title: `21Life ${tag}`,
  body,
  assets,
});
console.log(`Verified ${result.assetCount} release assets for ${result.tag} at ${result.commitSha}.`);
