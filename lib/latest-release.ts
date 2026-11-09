import 'server-only';

/** Only published, stable standard releases are eligible for update notices. */
export async function getLatestReleasedVersion(): Promise<string | null> {
  try {
    const response = await fetch('https://api.github.com/repos/marco201091-glitch/21life/releases/latest', {
      headers: { Accept: 'application/vnd.github+json', 'User-Agent': '21Life' },
      next: { revalidate: 3600 },
      signal: AbortSignal.timeout(3000),
    });
    if (!response.ok) return null;
    const release: unknown = await response.json();
    if (!release || typeof release !== 'object') return null;
    const { tag_name, draft, prerelease } = release as Record<string, unknown>;
    if (draft !== false || prerelease !== false || typeof tag_name !== 'string' || !/^v\d+\.\d+\.\d+$/.test(tag_name)) return null;
    return tag_name.slice(1);
  } catch {
    return null;
  }
}
