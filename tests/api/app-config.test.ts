import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  latest: null as string | null,
  admin: true,
  error: null as { code?: string } | null,
  data: {
    minimum_supported_version: '8.1.0',
    recommended_version: '9.0.4',
    maintenance_message_it: null as string | null,
    maintenance_message_en: null as string | null,
    feature_flags: { lastStanding: true },
    release_notes: [{ version: '9.0.4', it: 'Nota IT', en: 'Note EN' }],
  },
}));

vi.mock('@/lib/latest-release', () => ({ getLatestReleasedVersion: async () => mocks.latest }));

vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => mocks.admin ? {
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: mocks.error ? null : mocks.data, error: mocks.error }) }),
      }),
    }),
  } : null,
}));

import { version as packageVersion } from '@/package.json';
import { GET } from '@/app/api/app-config/route';

function request(version: string) {
  return new Request(`https://app.example.test/api/app-config?version=${version}`);
}

beforeEach(() => {
  mocks.admin = true;
  mocks.latest = null;
  mocks.error = null;
  mocks.data = {
    minimum_supported_version: '8.1.0',
    recommended_version: '9.0.4',
    maintenance_message_it: null,
    maintenance_message_en: null,
    feature_flags: { lastStanding: true },
    release_notes: [{ version: '9.0.4', it: 'Nota IT', en: 'Note EN' }],
  };
});

describe('app config API', () => {
  it('reports an update from the latest published release, independently of the recommendation', async () => {
    mocks.latest = '9.1.3';
    expect(await (await GET(request('9.1.2'))).json()).toMatchObject({ latestReleasedVersion: '9.1.3', recommendedVersion: '9.1.3', supportState: 'update_available', releaseUpdateAvailable: true });
    expect(await (await GET(request('9.1.3'))).json()).toMatchObject({ releaseUpdateAvailable: false });
    expect(await (await GET(request('9.1.4'))).json()).toMatchObject({ releaseUpdateAvailable: false });
  });

  it('does not invent an update when the release source is unavailable', async () => {
    expect(await (await GET(request('9.1.2'))).json()).toMatchObject({ latestReleasedVersion: null, releaseUpdateAvailable: false });
  });
  it.each([
    ['8.0.0', 'unsupported'],
    ['8.1.0', 'update_available'],
    ['8.2.0', 'update_available'],
    ['9.0.4', 'supported'],
    ['9.0.5', 'supported'],
  ])('reports the support state for client %s', async (version, supportState) => {
    const response = await GET(request(version));
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toContain('max-age=300');
    await expect(response.json()).resolves.toMatchObject({
      currentVersion: version,
      minimumSupportedVersion: '8.1.0',
      recommendedVersion: '9.0.4',
      supportState,
      runtimeConfigurationSource: 'database',
    });
  });

  it('marks the database-error fallback instead of claiming runtime data loaded', async () => {
    mocks.error = { code: 'PGRST000' };
    const response = await GET(request('9.0.0'));
    await expect(response.json()).resolves.toMatchObject({
      minimumSupportedVersion: '8.1.0',
      recommendedVersion: packageVersion,
      runtimeConfigurationSource: 'fallback',
      supportState: 'update_available',
    });
  });

  it('marks a missing runtime row as fallback and uses the package recommendation', async () => {
    mocks.data = null as never;
    const response = await GET(request('8.2.0'));
    const body = await response.json();
    expect(body.runtimeConfigurationSource).toBe('fallback');
    expect(body.recommendedVersion).toBe(packageVersion);
  });
});
