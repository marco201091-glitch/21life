export type DeckMasteryTier = 'unranked' | 'bronze' | 'silver' | 'gold' | 'platinum' | 'diamond';

export type DeckMastery = {
  tier: DeckMasteryTier;
  color: string;
  points: number;
  progress: number;
  currentFloor: number;
  nextTarget: number;
  complete: boolean;
};

const TIERS = [
  { tier: 'bronze', floor: 0, target: 10, color: '#b7794b' },
  { tier: 'silver', floor: 10, target: 20, color: '#aeb8c4' },
  { tier: 'gold', floor: 20, target: 40, color: '#e5b94f' },
  { tier: 'platinum', floor: 40, target: 60, color: '#49c5b6' },
  { tier: 'diamond', floor: 60, target: 100, color: '#72a7ff' },
] as const;

export function getDeckMastery(gamesPlayed = 0, wins = 0): DeckMastery {
  const safeGames = Math.max(0, Math.floor(gamesPlayed));
  const safeWins = Math.min(safeGames, Math.max(0, Math.floor(wins)));
  const points = safeGames + (safeWins * 2);

  if (safeGames === 0) {
    return {
      tier: 'unranked',
      color: '#71717a',
      points: 0,
      progress: 0,
      currentFloor: 0,
      nextTarget: 10,
      complete: false,
    };
  }

  const config = TIERS.find((entry) => points < entry.target) ?? TIERS[TIERS.length - 1];
  const complete = points >= 100;
  const progress = complete
    ? 1
    : Math.min(1, Math.max(0, (points - config.floor) / (config.target - config.floor)));

  return {
    tier: config.tier,
    color: config.color,
    points,
    progress,
    currentFloor: config.floor,
    nextTarget: config.target,
    complete,
  };
}

export function getHighestMasteryDeck<T>(
  decks: readonly T[],
  getPerformance: (deck: T) => { gamesPlayed: number; wins: number } | undefined,
): T | undefined {
  let highest: T | undefined;
  let highestPoints = -1;
  for (const deck of decks) {
    const performance = getPerformance(deck);
    const { points } = getDeckMastery(performance?.gamesPlayed ?? 0, performance?.wins ?? 0);
    if (points > highestPoints) {
      highest = deck;
      highestPoints = points;
    }
  }
  return highest;
}

export function getDeckMasteryLabel(tier: DeckMasteryTier, language: 'it' | 'en'): string {
  const labels: Record<DeckMasteryTier, { it: string; en: string }> = {
    unranked: { it: 'Non classificato', en: 'Unranked' },
    bronze: { it: 'Bronzo', en: 'Bronze' },
    silver: { it: 'Argento', en: 'Silver' },
    gold: { it: 'Oro', en: 'Gold' },
    platinum: { it: 'Platino', en: 'Platinum' },
    diamond: { it: 'Diamante', en: 'Diamond' },
  };
  return labels[tier][language];
}
