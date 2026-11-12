/**
 * Win rate convention: a draw is neutral.
 *
 * A drawn match stores `is_draw = true` and leaves every participant at
 * `is_winner = false`. Deriving the rate as `wins / gamesPlayed` therefore
 * counts a draw as a loss and drags the number down, which is why every
 * aggregate keeps the three counters below and derives the rate here.
 *
 * The rate is `wins / (gamesPlayed - draws)`: a draw stays inside
 * `gamesPlayed` so the match total stays honest, but it reaches neither the
 * numerator nor the denominator. One win, one loss and one draw is 50%, not
 * 33%.
 */

export interface MatchRecordCounts {
  gamesPlayed: number;
  wins: number;
  draws?: number | null;
}

export interface MatchRecord {
  /** Every match, draws included. */
  gamesPlayed: number;
  wins: number;
  losses: number;
  draws: number;
  /** Matches that produced a winner: the win rate denominator. */
  decisiveGames: number;
  /** `wins / decisiveGames` as a whole percentage. */
  winRate: number;
}

export interface MatchRecordLabels {
  win: string;
  loss: string;
  draw: string;
}

export const MATCH_RECORD_LABELS: MatchRecordLabels = { win: 'W', loss: 'L', draw: 'D' };

function count(value: number | null | undefined) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : 0;
}

export function buildMatchRecord({ gamesPlayed, wins, draws }: MatchRecordCounts): MatchRecord {
  const totalGames = count(gamesPlayed);
  // Draws and wins are clamped so a partially migrated aggregate can never
  // produce a negative loss count or a rate above 100.
  const totalDraws = Math.min(totalGames, count(draws));
  const decisiveGames = totalGames - totalDraws;
  const totalWins = Math.min(decisiveGames, count(wins));

  return {
    gamesPlayed: totalGames,
    wins: totalWins,
    losses: decisiveGames - totalWins,
    draws: totalDraws,
    decisiveGames,
    winRate: decisiveGames > 0 ? Math.round((totalWins / decisiveGames) * 100) : 0,
  };
}

/** The rate alone, for call sites that only need the percentage. */
export function winRate(wins: number, gamesPlayed: number, draws = 0) {
  return buildMatchRecord({ gamesPlayed, wins, draws }).winRate;
}

/** Compact record, e.g. `6W-2L-2P`. */
export function formatMatchRecord(
  record: MatchRecord,
  labels: MatchRecordLabels = MATCH_RECORD_LABELS,
) {
  return `${record.wins}${labels.win}-${record.losses}${labels.loss}-${record.draws}${labels.draw}`;
}
