import { afterEach, describe, expect, it, vi } from 'vitest';
import { getLatestReleasedVersion } from '@/lib/latest-release';

afterEach(() => vi.unstubAllGlobals());

describe('latest published release', () => {
  it('accepts a stable public release', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ tag_name: 'v9.1.4', draft: false, prerelease: false }) }));
    await expect(getLatestReleasedVersion()).resolves.toBe('9.1.4');
  });

  it.each([
    { tag_name: 'v9.1.4', draft: true, prerelease: false },
    { tag_name: 'v9.1.4', draft: false, prerelease: true },
    { tag_name: 'fdroid-v9.1.4', draft: false, prerelease: false },
    { tag_name: 'v9.1.4-rc1', draft: false, prerelease: false },
  ])('ignores unpublished or variant releases', async (release) => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => release }));
    await expect(getLatestReleasedVersion()).resolves.toBeNull();
  });

  it('tolerates network failure', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('offline')));
    await expect(getLatestReleasedVersion()).resolves.toBeNull();
  });
});
