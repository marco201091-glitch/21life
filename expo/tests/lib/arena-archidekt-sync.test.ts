import { beforeEach, describe, expect, it, vi } from 'vitest';
const apiPost = vi.hoisted(() => vi.fn());
vi.mock('@/lib/api', () => ({ apiPost }));
import { ArenaSyncError, classifyArenaSyncFailure, syncAndRefreshArenaMember, syncArenaMemberArchidektDecks } from '@/lib/arena-archidekt-sync';

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
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toBeInstanceOf(ArenaSyncError);
  });
  it.each([undefined, {}, { inserted: -1, updated: 0, unchanged: 0, skipped: 0 }])(
    'rejects a malformed success payload', async (data) => {
      apiPost.mockResolvedValue({ status: 200, data });
      await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toThrow();
    },
  );
  it.each([[0, 'uncertain'], [401, 'authentication'], [403, 'permission'], [409, 'configuration'], [429, 'rate_limit'], [502, 'upstream'], [500, 'save']] as const)(
    'classifies HTTP %s as %s', (status, reason) => expect(classifyArenaSyncFailure(status)).toBe(reason),
  );
  it('shares simultaneous requests and permits a later retry', async () => {
    let finish!: (value: unknown) => void;
    apiPost.mockReturnValueOnce(new Promise((resolve) => { finish = resolve; }));
    const a = syncArenaMemberArchidektDecks('arena', 'same');
    const b = syncArenaMemberArchidektDecks('arena', 'same');
    expect(apiPost).toHaveBeenCalledTimes(1);
    finish({ status: 200, data: { inserted: 0, updated: 1, unchanged: 0, skipped: 0 } });
    await expect(Promise.all([a, b])).resolves.toHaveLength(2);
    apiPost.mockResolvedValueOnce({ status: 200, data: { inserted: 0, updated: 0, unchanged: 1, skipped: 0 } });
    await syncArenaMemberArchidektDecks('arena', 'same');
    expect(apiPost).toHaveBeenCalledTimes(2);
  });
  it('treats an unstructured proxy failure as an uncertain outcome', async () => {
    apiPost.mockResolvedValue({ status: 502 });
    await expect(syncArenaMemberArchidektDecks('arena', 'proxy')).rejects.toMatchObject({ reason: 'uncertain' });
  });
  it('distinguishes a successful save from a subsequent failed catalog refresh', async () => {
    apiPost.mockResolvedValue({ status: 200, data: { inserted: 1, updated: 0, unchanged: 0, skipped: 0 } });
    const refresh = vi.fn().mockRejectedValue(new Error('offline'));
    await expect(syncAndRefreshArenaMember('arena', 'player', refresh)).resolves.toEqual({ status: 'refresh_failed', skipped: 0, wasPartial: false, wasEmpty: false });
    expect(refresh).toHaveBeenCalledWith('player');
  });
  it('preserves partial results if the list refresh fails', async () => {
    apiPost.mockResolvedValue({ status: 200, data: { inserted: 1, updated: 0, unchanged: 0, skipped: 2 } });
    await expect(syncAndRefreshArenaMember('arena', 'player', async () => { throw new Error('offline'); })).resolves.toEqual({ status: 'refresh_failed', skipped: 2, wasPartial: true, wasEmpty: false });
  });
  it('warns when the deck list reaches its visible limit', async () => {
    apiPost.mockResolvedValue({ status: 200, data: { inserted: 1, updated: 0, unchanged: 0, skipped: 0 } });
    await expect(syncAndRefreshArenaMember('arena', 'player', async () => true)).resolves.toEqual({ status: 'limited', skipped: 0, wasPartial: false, wasEmpty: false });
  });
  it.each([
    [{ inserted: 0, updated: 0, unchanged: 0, skipped: 0 }, 'empty'],
    [{ inserted: 0, updated: 0, unchanged: 1, skipped: 0 }, 'completed'],
    [{ inserted: 1, updated: 0, unchanged: 0, skipped: 2 }, 'partial'],
    [{ inserted: 0, updated: 0, unchanged: 0, skipped: 2 }, 'partial'],
  ] as const)('reports the saved catalog outcome', async (data, status) => {
    apiPost.mockResolvedValue({ status: 200, data });
    expect((await syncAndRefreshArenaMember('arena', 'player', async () => false)).status).toBe(status);
  });
  it('preserves a valid request reference and ignores an invalid one', async () => {
    apiPost.mockResolvedValueOnce({ status: 502, data: { code: 'UPSTREAM_FAILED' }, requestId: '123e4567-e89b-42d3-a456-426614174000' });
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toMatchObject({ reason: 'upstream', requestId: '123e4567-e89b-42d3-a456-426614174000' });
    apiPost.mockResolvedValueOnce({ status: 502, data: { code: 'UPSTREAM_FAILED' }, requestId: 'bad-reference' });
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toMatchObject({ reason: 'upstream', requestId: undefined });
  });
  it.each([false, true])('retains a confirmed sync reference when list refresh fails: %s', async (fails) => {
    const requestId = '123e4567-e89b-42d3-a456-426614174000';
    apiPost.mockResolvedValue({ status: 200, requestId, data: { inserted: 1, updated: 0, unchanged: 0, skipped: 0 } });
    const outcome = await syncAndRefreshArenaMember('arena', 'player', async () => { if (fails) throw new Error('offline'); });
    expect(outcome.requestId).toBe(requestId);
    expect(outcome.status).toBe(fails ? 'refresh_failed' : 'completed');
  });
  it('ignores an invalid reference on successful sync', async () => {
    apiPost.mockResolvedValue({ status: 200, requestId: 'not-an-id', data: { inserted: 0, updated: 0, unchanged: 1, skipped: 0 } });
    expect((await syncArenaMemberArchidektDecks('arena', 'player')).requestId).toBeUndefined();
  });
  it('classifies other status codes without exposing the server message', async () => {
    apiPost.mockResolvedValue({ status: 400, error: 'private details' });
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toMatchObject({ reason: 'unknown', message: 'Archidekt sync: unknown' });
  });
  it('treats an invalid save result as uncertain', async () => {
    apiPost.mockResolvedValue({ status: 500, data: { code: 'SAVE_RESULT_UNCERTAIN' } });
    await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toMatchObject({ reason: 'uncertain' });
  });
  it.each([['UPSTREAM_RATE_LIMIT', 'rate_limit'], ['UPSTREAM_TIMEOUT', 'upstream_timeout']] as const)(
    'maps the backend code %s', async (code, reason) => {
      apiPost.mockResolvedValue({ status: 502, data: { code } });
      await expect(syncArenaMemberArchidektDecks('arena', 'player')).rejects.toMatchObject({ reason });
    },
  );
});
