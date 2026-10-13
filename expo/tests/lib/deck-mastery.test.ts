import { describe, expect, it } from 'vitest';
import { getDeckMastery, getHighestMasteryDeck } from '@/lib/deck-mastery';

describe('deck mastery', () => {
  it('awards one point per game plus two extra per win', () => {
    expect(getDeckMastery(12, 4).points).toBe(20);
  });

  it('preserves progress at every tier boundary', () => {
    expect(getDeckMastery(9, 0)).toMatchObject({ tier: 'bronze', nextTarget: 10 });
    expect(getDeckMastery(10, 0)).toMatchObject({ tier: 'silver', progress: 0 });
    expect(getDeckMastery(100, 0)).toMatchObject({ tier: 'diamond', complete: true });
  });
});

describe('profile favorite deck', () => {
  const decks = [
    { id: 'first', is_favorite: true },
    { id: 'most-played', is_favorite: false },
    { id: 'highest', is_favorite: false },
  ];
  const performance = {
    first: { gamesPlayed: 2, wins: 1 },
    'most-played': { gamesPlayed: 10, wins: 0 },
    highest: { gamesPlayed: 5, wins: 4 },
  };

  it('selects mastery points over list position, stars and games played', () => {
    expect(getHighestMasteryDeck(decks, (deck) => performance[deck.id as keyof typeof performance])).toBe(decks[2]);
    expect(decks.map((deck) => deck.id)).toEqual(['first', 'most-played', 'highest']);
  });

  it('keeps the first deck on ties and handles missing statistics or decks', () => {
    expect(getHighestMasteryDeck(decks, () => undefined)).toBe(decks[0]);
    expect(getHighestMasteryDeck([], () => undefined)).toBeUndefined();
  });
});
