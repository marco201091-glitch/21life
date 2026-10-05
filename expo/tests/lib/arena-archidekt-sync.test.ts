import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiPost }));
import { syncArenaMemberArchidektDecks } from '@/lib/arena-archidekt-sync';

describe('arena Archidekt sync', () => {
  beforeEach(() => vi.resetAllMocks());
  it('awaits an authenticated server result, including an unchanged catalog', async () => {
    const data = { inserted: 0, updated: 0, unchanged: 5, skipped: 0 };
    apiPost.mockResolvedValue({ status: 200, data });
    expect(await syncArenaMemberArchidektDecks('arena', 'other-player')).toEqual(data);
    expect(apiPost).toHaveBeenCalledWith('/api/arena-archidekt-sync',
      { groupId: 'arena', userId: 'other-player' }, { timeoutMs: 120_000 });
  });
  it('reports partial imports explicitly', async () => {
    apiPost.mockResolvedValue({ status: 200, data: { inserted: 2, updated: 1, unchanged: 0, skipped: 3 } });
    expect((await syncArenaMemberArchidektDecks('arena', 'player')).skipped).toBe(3);
  });
  it.each([0, 401, 403, 409, 429, 502])('rejects an unsuccessful response (%s)', async (status) => {
    apiPost.mockResolvedValue({ status, error: 'Unable to sync' });
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toThrow('Unable to sync');
  });
  it.each([undefined, {}, { inserted: -1, updated: 0, unchanged: 0, skipped: 0 }])(
    'rejects a malformed success payload', async (data) => {
      apiPost.mockResolvedValue({ status: 200, data });
      await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toThrow();
    },
  );
});
