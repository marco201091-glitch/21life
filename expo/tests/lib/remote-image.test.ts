import { describe, expect, it } from 'vitest';
import { getRemoteImageHeaders } from '@/lib/remote-image';

describe('remote image request headers', () => {
  it('identifies the app when loading Scryfall card images', () => {
    expect(getRemoteImageHeaders('https://cards.scryfall.io/large/front/a/b/card.jpg')).toEqual({
      Accept: 'image/*',
      'User-Agent': 'MTGCommander/9.0.2 (https://phyrexianarena.app)',
    });
  });

  it('does not attach Scryfall headers to unrelated hosts', () => {
    expect(getRemoteImageHeaders('https://images.example.com/profile/a.jpg'))
      .toBeUndefined();
  });
});
