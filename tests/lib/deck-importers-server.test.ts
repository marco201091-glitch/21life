import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeckFromSource } from '@/lib/deck-importers-server';
import responses from '../fixtures/archidekt-dfc.json';

// Captured public commander/printing metadata; these unit tests never call live services.
function stubResponses(overrides: Record<string, unknown> = {}) {
  const fixtures: Record<string, unknown> = { ...responses, ...overrides };
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url in fixtures)) throw new Error(`Unexpected fixture request: ${url}`);
    const payload = fixtures[url];
    return typeof payload === 'string'
      ? new Response(payload)
      : Response.json(payload);
  }));
}

beforeEach(() => stubResponses());

afterEach(() => vi.unstubAllGlobals());

describe('fetchFromArchidekt commander options', () => {
  it('reports a rejected Archidekt response', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(null, { status: 403 }));
    await expect(fetchDeckFromSource('archidekt', '22733112', { fresh: true }))
      .rejects.toThrow('Failed to fetch deck from Archidekt (403)');
  });

  it('reads top-level commander metadata and a bracket split across HTML tags', async () => {
    const url = 'https://archidekt.com/api/decks/22733112/';
    stubResponses({
      [url]: {
        ...responses[url],
        commanders: [{ name: 'Eirdu, Carrier of Dawn // Isilu, Carrier of Twilight' }],
      },
      'https://archidekt.com/decks/22733112/': '<span>Estimated</span><span>Bracket:</span><b>Core</b><span>(2)</span>',
    });
    const deck = await fetchDeckFromSource('archidekt', '22733112', { fresh: true });
    expect(deck.commanderOptions.map((option) => option.name)).toEqual([
      'Eirdu, Carrier of Dawn', 'Isilu, Carrier of Twilight',
    ]);
    expect(deck.bracket).toBe('2');
  });

  it('assigns distinct images to Eirdu and Isilu transform faces', async () => {
    const deck = await fetchDeckFromSource('archidekt', '22733112', { fresh: true });

    expect(deck.commanderOptions).toHaveLength(2);
    expect(deck.commanderOptions[0]?.name).toBe('Eirdu, Carrier of Dawn');
    expect(deck.commanderOptions[1]?.name).toBe('Isilu, Carrier of Twilight');
    expect(deck.commanderOptions[0]?.imageUrl).toBeTruthy();
    expect(deck.commanderOptions[1]?.imageUrl).toBeTruthy();
    expect(deck.commanderOptions[0]?.imageUrl).not.toBe(deck.commanderOptions[1]?.imageUrl);
  }, 30_000);

  it('assigns distinct images to Urabrask DFC faces', async () => {
    const deck = await fetchDeckFromSource('archidekt', '9213662', { fresh: true });

    expect(deck.commanderOptions.length).toBeGreaterThanOrEqual(2);
    expect(deck.commanderOptions[0]?.imageUrl).toBeTruthy();
    expect(deck.commanderOptions[1]?.imageUrl).toBeTruthy();
    expect(deck.commanderOptions[0]?.imageUrl).not.toBe(deck.commanderOptions[1]?.imageUrl);
  }, 30_000);
});
