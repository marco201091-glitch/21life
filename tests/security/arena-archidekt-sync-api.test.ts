import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), limit: vi.fn(), getAdmin: vi.fn(), memberships: vi.fn(), profile: vi.fn(),
  fetchDecks: vi.fn(), rpc: vi.fn(), from: vi.fn(),
}));
vi.mock('@/app/api/_lib/require-auth', () => ({ requireAuthOr401: mocks.auth }));
vi.mock('@/lib/api-rate-limit', () => ({ enforceUserRateLimit: mocks.limit }));
vi.mock('@/lib/supabase-admin', () => ({ getSupabaseAdminClient: mocks.getAdmin }));
vi.mock('@/lib/archidekt-sync-server', () => ({ fetchArchidektSyncDecks: mocks.fetchDecks }));
import { POST } from '@/app/api/arena-archidekt-sync/route';

const requester = '11111111-1111-4111-8111-111111111111';
const target = '22222222-2222-4222-8222-222222222222';
const group = '33333333-3333-4333-8333-333333333333';
const row = { name: 'Public deck', commander: 'Talrand', source_url: 'https://archidekt.com/decks/123', source_type: 'archidekt' };
const request = (body: unknown = { groupId: group, userId: target }) => new Request('https://app.test/api/arena-archidekt-sync', { method: 'POST', body: JSON.stringify(body) });

describe('arena member Archidekt sync authorization', () => {
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ user: { id: requester }, response: null });
    mocks.limit.mockResolvedValue(null);
    mocks.memberships.mockResolvedValue({ data: [{ user_id: requester }, { user_id: target }], error: null });
    mocks.profile.mockResolvedValue({ data: { archidekt_auto_import: true, archidekt_username: 'configured-user' }, error: null });
    mocks.from.mockImplementation((table: string) => ({ select: () => ({ eq: () => table === 'group_members' ? { in: mocks.memberships } : { maybeSingle: mocks.profile } }) }));
    mocks.getAdmin.mockReturnValue({ from: mocks.from, rpc: mocks.rpc });
    mocks.fetchDecks.mockResolvedValue({ decks: [row], skipped: 0 });
    mocks.rpc.mockResolvedValue({ data: { inserted: 1, updated: 0, unchanged: 0 }, error: null });
  });

  it('requires a verified authenticated requester', async () => {
    mocks.auth.mockResolvedValue({ user: null, response: Response.json({ error: 'Authentication required' }, { status: 401 }) });
    expect((await POST(request())).status).toBe(401);
    expect(mocks.getAdmin).not.toHaveBeenCalled();
  });
  it.each([{ groupId: 'invalid', userId: target }, { groupId: group, userId: 'invalid' }, {}])('rejects malformed identifiers %j', async (body) => {
    expect((await POST(request(body))).status).toBe(400);
    expect(mocks.fetchDecks).not.toHaveBeenCalled();
  });
  it.each([{ members: [{ user_id: target }] }, { members: [{ user_id: requester }] }, { members: [] }])('requires both users to belong to the requested arena %j', async ({ members }) => {
    mocks.memberships.mockResolvedValue({ data: members, error: null });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.fetchDecks).not.toHaveBeenCalled();
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('requires the target to opt in', async () => {
    mocks.profile.mockResolvedValue({ data: { archidekt_auto_import: false, archidekt_username: 'configured-user' }, error: null });
    expect((await POST(request())).status).toBe(409);
    expect(mocks.fetchDecks).not.toHaveBeenCalled();
  });
  it('requires a configured username', async () => {
    mocks.profile.mockResolvedValue({ data: { archidekt_auto_import: true, archidekt_username: ' ' }, error: null });
    expect((await POST(request())).status).toBe(409);
  });
  it('uses the configured target identity and saves atomically without the target phone', async () => {
    const response = await POST(request({ groupId: group, userId: target, username: 'forged', requestedBy: target, decks: [{ name: 'forged' }] }));
    expect(response.status).toBe(200);
    expect(mocks.fetchDecks).toHaveBeenCalledWith('configured-user');
    expect(mocks.rpc).toHaveBeenCalledWith('sync_archidekt_decks_for_arena', { p_group_id: group, p_user_id: target, p_requested_by: requester, p_username: 'configured-user', p_decks: [row] });
    expect(await response.json()).toEqual({ inserted: 1, updated: 0, unchanged: 0, skipped: 0 });
  });
  it('returns completion even when no deck changed', async () => {
    mocks.rpc.mockResolvedValue({ data: { inserted: 0, updated: 0, unchanged: 1 }, error: null });
    expect(await (await POST(request())).json()).toEqual({ inserted: 0, updated: 0, unchanged: 1, skipped: 0 });
  });
  it('reports partial imports explicitly', async () => {
    mocks.fetchDecks.mockResolvedValue({ decks: [row], skipped: 2 });
    expect((await (await POST(request())).json()).skipped).toBe(2);
  });
  it('does not stamp or save a failed upstream import', async () => {
    mocks.fetchDecks.mockRejectedValue(new Error('Upstream unavailable'));
    expect((await POST(request())).status).toBe(502);
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
  it('does not expose database errors', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: 'private database details', code: 'XX000' } });
    const response = await POST(request());
    expect(response.status).toBe(500);
    expect(JSON.stringify(await response.json())).not.toContain('private database details');
  });
  it('rechecks authorization at write time', async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { code: '42501', message: 'permission revoked' } });
    expect((await POST(request())).status).toBe(403);
  });
  it('supports refreshing your own decks as an arena member', async () => {
    mocks.memberships.mockResolvedValue({ data: [{ user_id: requester }], error: null });
    expect((await POST(request({ groupId: group, userId: requester }))).status).toBe(200);
  });
  it('fails closed if the privileged server client is unavailable', async () => {
    mocks.getAdmin.mockReturnValue(null);
    expect((await POST(request())).status).toBe(503);
  });
  it('enforces request limits before importing', async () => {
    mocks.limit.mockResolvedValue(Response.json({ error: 'Too many requests' }, { status: 429 }));
    expect((await POST(request())).status).toBe(429);
    expect(mocks.fetchDecks).not.toHaveBeenCalled();
  });
});
