export const DECK_RANKING_MIN_GAMES = 5;

export function isProvisionalDeckRanking(gamesPlayed: number) {
  return gamesPlayed < DECK_RANKING_MIN_GAMES;
}

export function filterDeckRankings<T extends { gamesPlayed: number }>(
  decks: T[],
  showProvisional: boolean,
) {
  return showProvisional
    ? decks
    : decks.filter((deck) => !isProvisionalDeckRanking(deck.gamesPlayed));
}

export function countProvisionalDeckRankings<T extends { gamesPlayed: number }>(decks: T[]) {
  return decks.filter((deck) => isProvisionalDeckRanking(deck.gamesPlayed)).length;
}
