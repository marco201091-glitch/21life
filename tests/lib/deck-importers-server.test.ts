import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchDeckFromSource } from '@/lib/deck-importers-server';
import responses from '../fixtures/archidekt-dfc.json';

// Captured public commander/printing metadata; these unit tests never call live services.
beforeEach(() => {
  const fixtures: Record<string, unknown> = responses;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request) => {
    const url = input instanceof Request ? input.url : String(input);
    if (!(url in fixtures)) throw new Error(`Unexpected fixture request: ${url}`);
    const payload = fixtures[url];
    return typeof payload === 'string'
      ? new Response(payload)
      : Response.json(payload);
  }));
});

afterEach(() => vi.unstubAllGlobals());

describe('fetchFromArchidekt commander options', () => {
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
