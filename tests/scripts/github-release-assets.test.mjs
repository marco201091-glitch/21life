import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { publishReleaseAssets, validateReleaseAssets } from '../../scripts/release/github-release-assets.mjs';

const commitSha = 'a'.repeat(40);
const version = '9.0.4';
const tag = 'v' + version;

function assets() {
  const apk = Buffer.from('signed-apk-bytes');
  const checksum = createHash('sha256').update(apk).digest('hex');
  const sbom = (name) => Buffer.from(JSON.stringify({
    bomFormat: 'CycloneDX',
    specVersion: '1.5',
    metadata: { component: { name, version } },
    components: [{ name: 'dependency' }],
  }));
  return [
    { name: `21life-v${version}.apk`, bytes: apk },
    { name: `21life-v${version}.apk.sha256`, bytes: Buffer.from(`${checksum}  21life-v${version}.apk\n`) },
    { name: `web-sbom-${version}.json`, bytes: sbom('web') },
    { name: `android-sbom-${version}.json`, bytes: sbom('android') },
  ];
}

function fakeApi({ existing = null, releaseLookupError = null, uploadFailureAt = 0, remoteCommit = commitSha } = {}) {
  const state = { release: existing, posts: 0, patches: [], uploads: 0, calls: [], failedUpload: false };
  const api = {
    async request(method, path, body) {
      state.calls.push({ method, path, body });
      if (path.endsWith(`/git/ref/tags/${tag}`)) {
        return { object: { type: 'commit', sha: remoteCommit } };
      }
      if (path.endsWith(`/releases/tags/${tag}`)) {
        if (releaseLookupError) throw Object.assign(new Error('API unavailable'), { status: releaseLookupError });
        if (!state.release) throw Object.assign(new Error('Not found'), { status: 404 });
        return structuredClone(state.release);
      }
      if (path.endsWith('/releases') && method === 'POST') {
        state.posts += 1;
        state.release = {
          id: 17,
          tag_name: body.tag_name,
          upload_url: 'https://uploads.example.test/assets{?name,label}',
          draft: true,
          body: body.body,
          assets: [],
        };
        return structuredClone(state.release);
      }
      if (path.endsWith('/releases/17') && method === 'PATCH') {
        state.patches.push(body);
        state.release = { ...state.release, ...body };
        return null;
      }
      throw new Error(`Unexpected mock request ${method} ${path}`);
    },
    async uploadAsset(_url, name, bytes) {
      state.uploads += 1;
      if (uploadFailureAt === state.uploads && !state.failedUpload) {
        state.failedUpload = true;
        throw Object.assign(new Error('interrupted upload'), { status: 502 });
      }
      state.release.assets.push({
        name,
        size: bytes.length,
        digest: 'sha256:' + createHash('sha256').update(bytes).digest('hex'),
        url: `https://api.example.test/assets/${encodeURIComponent(name)}`,
      });
    },
    async downloadAsset(url) {
      const name = decodeURIComponent(url.split('/').at(-1));
      return assets().find((asset) => asset.name === name).bytes;
    },
  };
  return { api, state };
}

function existingRelease(candidateAssets, overrides = {}) {
  return {
    id: 17,
    tag_name: tag,
    upload_url: 'https://uploads.example.test/assets{?name,label}',
    draft: false,
    body: 'Curated public notes must remain untouched.',
    assets: candidateAssets.map((asset) => ({
      name: asset.name,
      size: asset.bytes.length,
      digest: 'sha256:' + createHash('sha256').update(asset.bytes).digest('hex'),
      url: 'https://api.example.test/assets/' + encodeURIComponent(asset.name),
    })),
    ...overrides,
  };
}

const input = (api, candidateAssets = assets()) => publishReleaseAssets({
  api,
  repo: 'owner/repo',
  tag,
  version,
  commitSha,
  title: `21Life ${tag}`,
  body: 'Curated release notes.',
  assets: candidateAssets,
});

test('validates APK checksum and version-matched CycloneDX SBOMs', () => {
  assert.equal(validateReleaseAssets(version, assets()).length, 4);
  const invalid = assets();
  invalid[1] = { ...invalid[1], bytes: Buffer.from('0'.repeat(64) + '  wrong.apk') };
  assert.throws(() => validateReleaseAssets(version, invalid), /checksum/);
});

test('creates a draft, uploads all assets, verifies bytes and publishes only at the end', async () => {
  const { api, state } = fakeApi();
  await input(api);
  assert.equal(state.posts, 1);
  assert.equal(state.uploads, 4);
  assert.deepEqual(state.patches, [{ draft: false }]);
  assert.equal(state.release.assets.length, 4);
});

test('same-name same-content assets are a no-op and curated notes are preserved', async () => {
  const { api, state } = fakeApi({ existing: existingRelease(assets()) });
  await input(api);
  assert.equal(state.posts, 0);
  assert.equal(state.uploads, 0);
  assert.equal(state.patches.length, 0);
  assert.equal(state.release.body, 'Curated public notes must remain untouched.');
});

test('refuses to overwrite a same-name asset whose digest differs', async () => {
  const conflicting = existingRelease(assets());
  conflicting.assets[0] = { ...conflicting.assets[0], digest: 'sha256:' + '0'.repeat(64) };
  const { api, state } = fakeApi({ existing: conflicting });
  await assert.rejects(input(api), /refusing to replace/);
  assert.equal(state.uploads, 0);
  assert.equal(state.patches.length, 0);
});

test('treats only a real 404 as missing and never creates after API denial', async () => {
  const { api, state } = fakeApi({ releaseLookupError: 403 });
  await assert.rejects(input(api), /API unavailable/);
  assert.equal(state.posts, 0);
});

test('an interrupted upload remains draft and retry fills only missing assets', async () => {
  const { api, state } = fakeApi({ uploadFailureAt: 3 });
  await assert.rejects(input(api), /interrupted upload/);
  assert.equal(state.release.draft, true);
  await input(api);
  assert.equal(state.release.assets.length, 4);
  assert.equal(state.release.draft, false);
});

test('rejects a tag resolving to another commit before release lookup or creation', async () => {
  const { api, state } = fakeApi({ remoteCommit: 'b'.repeat(40) });
  await assert.rejects(input(api), /different commit/);
  assert.equal(state.posts, 0);
  assert.equal(state.calls.some((call) => call.path.includes('/releases/tags/')), false);
});

test('rejects an SBOM for another release version', () => {
  const invalid = assets();
  const sbom = JSON.parse(invalid[2].bytes.toString('utf8'));
  sbom.metadata.component.version = '9.0.3';
  invalid[2] = { ...invalid[2], bytes: Buffer.from(JSON.stringify(sbom)) };
  assert.throws(() => validateReleaseAssets(version, invalid), /version/);
});
