import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
const mocks = vi.hoisted(() => ({ fetchDeck: vi.fn() }));
vi.mock('@/lib/deck-importers-server', () => ({ fetchDeckFromSource: mocks.fetchDeck }));
import { ArchidektRateLimited, fetchArchidektSyncDecks } from '@/lib/archidekt-sync-server';

const data = { name: 'Control', commander: 'Talrand', commanderImageUrl: 'https://images.test/talrand.jpg', commanderOptions: [{ name: 'Talrand', imageUrl: 'https://images.test/talrand.jpg', colorIdentity: ['U'] }], colorIdentity: ['U'], bracket: '3' };
describe('fresh bounded server Archidekt import', () => {
  beforeEach(() => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ results: [{ id: 123, name: 'Control' }] })));
    mocks.fetchDeck.mockReset().mockResolvedValue(data);
  });
  afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
  it('bypasses both search and detail caches', async () => {
    const result = await fetchArchidektSyncDecks(' configured-user ');
    expect(fetch).toHaveBeenCalledWith(expect.stringContaining('ownerUsername=configured-user'), expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }));
    expect(mocks.fetchDeck).toHaveBeenCalledWith('archidekt', '123', expect.objectContaining({ fresh: true, signal: expect.any(AbortSignal) }));
    expect(result).toEqual({ decks: [expect.objectContaining({ name: 'Control', commander: 'Talrand', source_url: 'https://archidekt.com/decks/123', source_type: 'archidekt' })], skipped: 0 });
  });
  it('never imports private decks', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123, private: true }, { id: 124 }] }));
    await fetchArchidektSyncDecks('user');
    expect(mocks.fetchDeck).toHaveBeenCalledTimes(1);
    expect(mocks.fetchDeck.mock.calls[0][1]).toBe('124');
  });
  it('reports an invalid public summary as skipped alongside valid decks', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ name: 'invalid' }, { id: 123 }] }));
    const result = await fetchArchidektSyncDecks('user');
    expect(result.skipped).toBe(1);
    expect(result.decks).toHaveLength(1);
  });
  it('imports a repeated deck only once', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123 }, { id: 123 }] }));
    const result = await fetchArchidektSyncDecks('user');
    expect(result.decks).toHaveLength(1);
    expect(result.skipped).toBe(0);
  });
  it('fails rather than claiming success if all public summaries are malformed', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 0 }] }));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow('No Archidekt decks');
  });
  it('treats an empty valid profile as a completed empty import', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [] }));
    expect(await fetchArchidektSyncDecks('user')).toEqual({ decks: [], skipped: 0 });
  });
  it('does not mistake a malformed upstream payload for an empty account', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'unavailable' }));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow();
  });
  it('distinguishes upstream rate limiting', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(null, { status: 429 }));
    await expect(fetchArchidektSyncDecks('user')).rejects.toBeInstanceOf(ArchidektRateLimited);
  });
  it('fails if all deck imports fail rather than declaring a successful empty sync', async () => {
    mocks.fetchDeck.mockRejectedValue(new Error('403'));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow();
  });
  it('reports upstream rate limiting when deck details cannot be fetched', async () => {
    mocks.fetchDeck.mockRejectedValue(new Error('Failed to fetch deck from Archidekt (429)'));
    await expect(fetchArchidektSyncDecks('user')).rejects.toBeInstanceOf(ArchidektRateLimited);
  });
  it('does not attribute mixed invalid summaries and rate limiting to one cause', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123 }, { id: 0 }] }));
    mocks.fetchDeck.mockRejectedValue(new Error('Failed to fetch deck from Archidekt (429)'));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow('No Archidekt decks');
  });
  it('does not misclassify mixed upstream deck errors as rate limiting', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123 }, { id: 124 }] }));
    mocks.fetchDeck.mockRejectedValueOnce(new Error('Failed to fetch deck from Archidekt (429)')).mockRejectedValueOnce(new Error('403'));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow('No Archidekt decks');
  });
  it('preserves successful imports and reports failed decks', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123 }, { id: 124 }] }));
    mocks.fetchDeck.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(data);
    const result = await fetchArchidektSyncDecks('user');
    expect(result.skipped).toBe(1);
    expect(result.decks).toHaveLength(1);
    expect(result.decks[0].source_url).toBe('https://archidekt.com/decks/124');
  });
  it('bounds the entire import even if an upstream request never resolves', async () => {
    vi.useFakeTimers();
    vi.mocked(fetch).mockReturnValue(new Promise(() => {}));
    const operation = fetchArchidektSyncDecks('user');
    const assertion = expect(operation).rejects.toThrow('timed out');
    await vi.advanceTimersByTimeAsync(90_000);
    await assertion;
    const signal = vi.mocked(fetch).mock.calls[0][1]?.signal;
    expect(signal?.aborted).toBe(true);
  });
  it('limits upstream concurrency without silently truncating decks', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: Array.from({ length: 90 }, (_, i) => ({ id: i + 1 })) }));
    let active = 0; let peak = 0;
    mocks.fetchDeck.mockImplementation(async () => { active++; peak = Math.max(peak, active); await Promise.resolve(); active--; return data; });
    const result = await fetchArchidektSyncDecks('user');
    expect(result.decks).toHaveLength(90);
    expect(peak).toBeLessThanOrEqual(4);
  });
  it('imports every page using the same verified username', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(Response.json({ results: [{ id: 123 }], next: 'https://archidekt.com/api/decks/v3/?page=2' }))
      .mockResolvedValueOnce(Response.json({ results: [{ id: 124 }], next: null }));
    const result = await fetchArchidektSyncDecks('user');
    expect(result.decks).toHaveLength(2);
    expect(fetch).toHaveBeenCalledTimes(2);
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain('ownerUsername=user');
    expect(vi.mocked(fetch).mock.calls[1][0]).toContain('page=2');
  });
  it('rejects a pagination loop instead of claiming a complete sync', async () => {
    vi.mocked(fetch).mockResolvedValue(Response.json({ results: [{ id: 123 }], next: 'https://archidekt.com/api/decks/v3/?page=1' }));
    await expect(fetchArchidektSyncDecks('user')).rejects.toThrow();
  });

});
