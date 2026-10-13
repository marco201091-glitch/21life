import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  administrator: true,
  admin: true,
  metricsError: false,
  rpc: vi.fn(),
}));

vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: async () => ({ auth: { getUser: async () => ({ data: { user: { id: 'admin-user' } } }) } }),
}));
vi.mock('@/lib/admin', () => ({ isPlatformAdministrator: async () => mocks.administrator }));
vi.mock('@/lib/supabase-admin', () => ({
  getSupabaseAdminClient: () => mocks.admin ? {
    rpc: mocks.rpc,
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }) }),
  } : null,
}));

import { GET } from '@/app/api/admin/operations/route';

describe('GET /api/admin/operations', () => {
  beforeEach(() => {
    mocks.administrator = true;
    mocks.admin = true;
    mocks.metricsError = false;
    mocks.rpc.mockReset().mockImplementation(async () => mocks.metricsError
      ? { data: null, error: { message: 'private database detail' } }
      : { data: {
        asOf: '2026-10-01T00:00:00Z',
        clientAdoption30d: { appVersions: { '9.0.4': 10_001 }, webVisits: 10_002, queryLimited: false, available: true },
        notificationDeliveries24h: { counts: { sent: 3 }, available: true },
        liveGameSync14d: { available: true, sessions: 10_003, successfulSyncs: 8, failedSyncs: 2, failureRate: 20, recoveredSessions: 1, sessionsWithQueue: 2, maxQueueDepth: 4, versionConflicts: 3, slowestSyncMs: 500, queryLimited: false },
      }, error: null });
  });

  it('requires platform admin before calling aggregated metrics', async () => {
    mocks.administrator = false;
    const response = await GET();
    expect(response.status).toBe(403);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });

  it('returns complete aggregates with one shared timestamp and no API cap', async () => {
    const response = await GET();
    const body = await response.json();
    expect(response.status).toBe(200);
    expect(response.headers.get('cache-control')).toBe('no-store');
    expect(mocks.rpc).toHaveBeenCalledWith('get_admin_operations_metrics');
    expect(body).toMatchObject({
      database: { ok: true },
      metricsAsOf: '2026-10-01T00:00:00Z',
      clientAdoption30d: { appVersions: { '9.0.4': 10_001 }, queryLimited: false, available: true },
      notificationDeliveries24h: { counts: { sent: 3 }, available: true },
      liveGameSync14d: { sessions: 10_003, failureRate: 20, queryLimited: false },
    });
  });

  it('marks failed aggregation unavailable instead of presenting zero activity', async () => {
    mocks.metricsError = true;
    const response = await GET();
    const body = await response.json();
    expect(body.database.ok).toBe(false);
    expect(body.clientAdoption30d.available).toBe(false);
    expect(body.notificationDeliveries24h.available).toBe(false);
    expect(body.liveGameSync14d.available).toBe(false);
    expect(JSON.stringify(body)).not.toContain('private database detail');
  });
});
