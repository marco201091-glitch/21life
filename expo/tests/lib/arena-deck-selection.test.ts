import { describe, expect, it } from 'vitest';
import { getPreferredDeckId } from '@/lib/arena-deck-selection';

describe('arena deck selection', () => {
  it('automatically selects the only available deck', () => {
    expect(getPreferredDeckId([{ id: 'only' }], null)).toBe('only');
  });

  it('restores the last deck only while it is still available', () => {
    const decks = [{ id: 'a' }, { id: 'b' }];
    expect(getPreferredDeckId(decks, 'b')).toBe('b');
    expect(getPreferredDeckId(decks, 'removed')).toBeNull();
  });

  it('does not automatically select an occasional deck from the previous match', () => {
    const decks = [
      { id: 'regular-a', source_type: null },
      { id: 'regular-b', source_type: 'archidekt' },
      { id: 'borrowed', source_type: 'occasional' },
    ];
    expect(getPreferredDeckId(decks, 'borrowed')).toBeNull();
    expect(getPreferredDeckId([{ id: 'borrowed', source_type: 'occasional' }], null)).toBeNull();
    expect(getPreferredDeckId([decks[0], decks[2]], 'borrowed')).toBe('regular-a');
  });
});
