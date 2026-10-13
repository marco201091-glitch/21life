type SelectableDeck = { id: string; source_type?: string | null };

export function getPreferredDeckId(
  deckOptions: SelectableDeck[],
  lastDeckId: string | null | undefined,
): string | null {
  const regularDecks = deckOptions.filter((deck) => deck.source_type !== 'occasional');
  if (regularDecks.length === 1) return regularDecks[0].id;
  if (lastDeckId && regularDecks.some((deck) => deck.id === lastDeckId)) return lastDeckId;
  return null;
}
