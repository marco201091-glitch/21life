import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchDeckFromSource } from '@/lib/deck-importers-server';
vi.mock('@/lib/scryfall', () => ({ fetchCommanderImage: vi.fn().mockResolvedValue(null) }));

const card = (name: string, companion: boolean, categories = ['Commander']) => ({
  companion, categories, quantity: 1,
  card: { uid: name.toLowerCase().replaceAll(' ', '-'), edition: { editioncode: 'dmu' }, oracleCard: { name, colorIdentity: ['W', 'U', 'B', 'R', 'G'] } },
});

afterEach(() => vi.unstubAllGlobals());

describe('Archidekt commander and companion', () => {
  it('imports Jodah rather than the earlier Jegantha companion, even when both have the Commander category', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'League of Legends - Jodah the Unifier', edhBracket: 3,
      cards: [card('Jegantha, the Wellspring', true, ['Sideboard', 'Commander']), card('Jodah, the Unifier', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '5059948', { fresh: true });
    expect(deck.commander).toBe('Jodah, the Unifier');
    expect(deck.commanderOptions.map((option) => option.name)).toEqual(['Jodah, the Unifier']);
    expect(deck.commanderImageUrl).toContain('jodah');
  });

  it('retains true partners when a companion is also present', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Partners', edhBracket: 3,
      cards: [card('Lurrus of the Dream-Den', true), card('Tymna the Weaver', false), card('Thrasios, Triton Hero', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commanderOptions.map((option) => option.name)).toEqual(['Tymna the Weaver', 'Thrasios, Triton Hero']);
  });

  it('filters companion names from the optional commander summary', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Jodah', edhBracket: 3,
      commanders: [{ name: 'Jegantha, the Wellspring' }, { name: 'Jodah, the Unifier' }],
      cards: [card('Jegantha, the Wellspring', true), card('Jodah, the Unifier', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '5059948', { fresh: true });
    expect(deck.commanderOptions.map((option) => option.name)).toEqual(['Jodah, the Unifier']);
  });

  it('keeps a companion-capable card when it is actually marked as commander', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Lurrus commander', edhBracket: 3,
      cards: [card('Lurrus of the Dream-Den', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Lurrus of the Dream-Den');
  });

  it('does not promote a companion when there is no identifiable commander', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Unknown', edhBracket: 3, commanders: [{ name: 'Jegantha, the Wellspring' }],
      cards: [card('Jegantha, the Wellspring', true), card('Plains', false, ['Land'])],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Unknown Commander');
    expect(deck.commanderOptions.some((option) => option.name === 'Jegantha, the Wellspring')).toBe(false);
  });

  it('uses the single physical card when no commander is identified', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Single card', edhBracket: 3, cards: [card('Jodah, the Unifier', false, ['Creature'])],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Jodah, the Unifier');
    expect(deck.commanderOptions[0]?.imageUrl).toContain('jodah');
  });

  it('applies the single-card rule even when that card has a companion flag', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Single card', edhBracket: 3, cards: [card('Jegantha, the Wellspring', true, ['Companion'])],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Jegantha, the Wellspring');
  });

  it('does not guess a commander when a single entry represents multiple cards', async () => {
    const singleEntry = { ...card('Jodah, the Unifier', false, ['Creature']), quantity: 2 };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ name: 'Two cards', edhBracket: 3, cards: [singleEntry] })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Unknown Commander');
  });

  it('uses the only card when the optional commander summary says Unknown Commander', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Single card', edhBracket: 3, commanders: [{ name: 'Unknown Commander' }],
      cards: [card('Jodah, the Unifier', false, ['Creature'])],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Jodah, the Unifier');
  });

  it('does not let an unknown summary precede the identified commander', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Single card', edhBracket: 3, commanders: [{ name: 'Unknown Commander' }],
      cards: [card('Jodah, the Unifier', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commanderOptions.map((option) => option.name)).toEqual(['Jodah, the Unifier']);
  });

  it('keeps a real commander when a separate companion entry shares the same name', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({
      name: 'Same card', edhBracket: 3, commanders: [{ name: 'Lurrus of the Dream-Den' }],
      cards: [card('Lurrus of the Dream-Den', true), card('Lurrus of the Dream-Den', false)],
    })));
    const deck = await fetchDeckFromSource('archidekt', '123', { fresh: true });
    expect(deck.commander).toBe('Lurrus of the Dream-Den');
  });

  it.skipIf(process.env.ARCHIDEKT_LIVE_TEST !== '1')('verifies the public Jodah deck against Archidekt', async () => {
    const deck = await fetchDeckFromSource('archidekt', '5059948', { fresh: true });
    expect(deck.commanderOptions[0]?.name).toBe('Jodah, the Unifier');
    expect(deck.commanderOptions.some((option) => option.name === 'Jegantha, the Wellspring')).toBe(false);
  }, 30_000);
});
