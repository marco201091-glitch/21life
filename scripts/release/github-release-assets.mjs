import { createHash } from 'node:crypto';

export class GitHubReleaseError extends Error {
  constructor(message, options = {}) {
    super(message, options);
    this.name = 'GitHubReleaseError';
  }
}

function sha256(bytes) {
  return createHash('sha256').update(bytes).digest('hex');
}

export function validateReleaseAssets(version, assets) {
  const expectedNames = [
    `21life-v${version}.apk`,
    `21life-v${version}.apk.sha256`,
    `web-sbom-${version}.json`,
    `android-sbom-${version}.json`,
  ];
  const byName = new Map(assets.map((asset) => [asset.name, asset]));
  if (assets.length !== expectedNames.length || expectedNames.some((name) => !byName.has(name))) {
    throw new GitHubReleaseError('Release candidate must provide the APK, its SHA-256, and both version-matched SBOMs.');
  }
  for (const asset of assets) {
    if (!Buffer.isBuffer(asset.bytes) || asset.bytes.length === 0) {
      throw new GitHubReleaseError(`Release asset is missing or empty: ${asset.name}`);
    }
  }

  const apkName = expectedNames[0];
  const apk = byName.get(apkName);
  const checksum = byName.get(expectedNames[1]);
  const checksumText = checksum.bytes.toString('utf8').trim();
  const checksumMatch = /^([a-f0-9]{64})\s+(.+)$/.exec(checksumText);
  if (!checksumMatch || checksumMatch[1] !== sha256(apk.bytes) || checksumMatch[2] !== apkName) {
    throw new GitHubReleaseError('APK checksum does not match the candidate APK.');
  }

  for (const name of expectedNames.slice(2)) {
    let sbom;
    try {
      sbom = JSON.parse(byName.get(name).bytes.toString('utf8'));
    } catch (error) {
      throw new GitHubReleaseError(`Invalid SBOM JSON: ${name}`, { cause: error });
    }
    if (sbom.bomFormat !== 'CycloneDX' || !Array.isArray(sbom.components)
      || sbom.metadata?.component?.version !== version) {
      throw new GitHubReleaseError(`SBOM format or version does not match the release: ${name}`);
    }
  }

  return assets.map((asset) => ({ ...asset, digest: sha256(asset.bytes) }));
}

async function getTagCommit(api, repo, tag) {
  let ref = await api.request('GET', `/repos/${repo}/git/ref/tags/${encodeURIComponent(tag)}`);
  let object = ref.object;
  for (let depth = 0; object?.type === 'tag' && depth < 5; depth += 1) {
    const annotated = await api.request('GET', `/repos/${repo}/git/tags/${object.sha}`);
    object = annotated.object;
  }
  if (object?.type !== 'commit' || !/^[a-f0-9]{40}$/i.test(object.sha ?? '')) {
    throw new GitHubReleaseError(`Could not resolve release tag ${tag} to a commit.`);
  }
  return object.sha.toLowerCase();
}

async function remoteDigest(api, asset) {
  if (typeof asset.digest === 'string' && /^sha256:[a-f0-9]{64}$/i.test(asset.digest)) {
    return asset.digest.slice('sha256:'.length).toLowerCase();
  }
  if (!asset.url && !asset.apiUrl) throw new GitHubReleaseError(`Cannot verify remote asset ${asset.name}.`);
  return sha256(await api.downloadAsset(asset.url || asset.apiUrl));
}

export async function publishReleaseAssets({ api, repo, tag, version, commitSha, title, body, assets }) {
  if (!/^v\d+\.\d+\.\d+$/.test(tag) || tag !== `v${version}`) {
    throw new GitHubReleaseError('Release tag and version do not match.');
  }
  if (!/^[a-f0-9]{40}$/i.test(commitSha)) throw new GitHubReleaseError('Invalid candidate commit SHA.');
  const preparedAssets = validateReleaseAssets(version, assets);
  const taggedCommit = await getTagCommit(api, repo, tag);
  if (taggedCommit !== commitSha.toLowerCase()) {
    throw new GitHubReleaseError('Release tag resolves to a different commit than the candidate.');
  }

  const ancestry = await api.request('GET', `/repos/${repo}/compare/${taggedCommit}...main`);
  if (ancestry.merge_base_commit?.sha !== taggedCommit) {
    throw new GitHubReleaseError('Only commits belonging to main may publish Obtainium releases.');
  }

  let release;
  let created = false;
  try {
    release = await api.request('GET', `/repos/${repo}/releases/tags/${encodeURIComponent(tag)}`);
  } catch (error) {
    if (error.status !== 404) throw error;
    // Drafts can be absent from the by-tag endpoint. Find them before creating
    // another release, and fail closed if listing itself fails.
    for (let page = 1; page <= 20; page += 1) {
      const entries = await api.request('GET', `/repos/${repo}/releases?per_page=100&page=${page}`);
      release = entries.find(entry => entry.tag_name === tag);
      if (release || entries.length < 100) break;
      if (page === 20) throw new GitHubReleaseError('Release search exceeded its safe pagination limit.');
    }
    if (!release) {
      release = await api.request('POST', `/repos/${repo}/releases`, {
        tag_name: tag, target_commitish: commitSha, name: title, body,
        draft: true, prerelease: false,
      });
      created = true;
    }
  }

  if (release.tag_name !== tag || !release.upload_url) {
    throw new GitHubReleaseError('Existing GitHub release metadata does not match the requested tag.');
  }
  if (created && release.draft !== true) {
    throw new GitHubReleaseError('GitHub did not create the release as a draft.');
  }

  const listed = new Map((release.assets ?? []).map((asset) => [asset.name, asset]));
  for (const candidate of preparedAssets) {
    const current = listed.get(candidate.name);
    if (current) {
      if (current.size !== candidate.bytes.length || await remoteDigest(api, current) !== candidate.digest) {
        throw new GitHubReleaseError(`Remote asset differs; refusing to replace ${candidate.name}.`);
      }
      continue;
    }
    await api.uploadAsset(release.upload_url, candidate.name, candidate.bytes);
  }

  const verified = await api.request('GET', `/repos/${repo}/releases/${release.id}`);
  if (verified.tag_name !== tag) throw new GitHubReleaseError('Release tag changed during asset publication.');
  const finalAssets = new Map((verified.assets ?? []).map((asset) => [asset.name, asset]));
  for (const candidate of preparedAssets) {
    const current = finalAssets.get(candidate.name);
    if (!current || current.size !== candidate.bytes.length || await remoteDigest(api, current) !== candidate.digest) {
      throw new GitHubReleaseError(`Remote release verification failed for ${candidate.name}.`);
    }
  }

  if (verified.draft) {
    await api.request('PATCH', `/repos/${repo}/releases/${verified.id}`, { draft: false });
  }
  return { tag, created, assetCount: preparedAssets.length, commitSha: taggedCommit };
}
