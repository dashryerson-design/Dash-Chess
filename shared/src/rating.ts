/**
 * DC Rating — Elo-based with provisional placement.
 * - First PLACEMENT_GAMES games in a category are provisional with a high K so players
 *   reach their true level quickly.
 * - K shrinks as rating grows to keep the top stable.
 */
export const START_RATING = 1000;
export const PLACEMENT_GAMES = 10;
export const RATING_FLOOR = 100;

export function expectedScore(rating: number, opponent: number): number {
  return 1 / (1 + Math.pow(10, (opponent - rating) / 400));
}

export function kFactor(rating: number, gamesPlayed: number): number {
  if (gamesPlayed < PLACEMENT_GAMES) return 40;
  if (rating < 2000) return 24;
  if (rating < 2400) return 16;
  return 12;
}

export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

/** score: 1 win, 0.5 draw, 0 loss */
export function ratingChange(rating: number, gamesPlayed: number, opponent: number, score: 0 | 0.5 | 1): RatingChange {
  const k = kFactor(rating, gamesPlayed);
  let delta = Math.round(k * (score - expectedScore(rating, opponent)));
  // A win always gains at least 1 and a loss always costs at least 1 (unless at floor).
  if (score === 1 && delta < 1) delta = 1;
  if (score === 0 && delta > -1) delta = -1;
  const after = Math.max(RATING_FLOOR, rating + delta);
  return { before: rating, after, delta: after - rating };
}

/** Overall DC Rating: games-weighted mean across categories that have been played. */
export function overallRating(entries: { rating: number; games: number }[]): number {
  const played = entries.filter((e) => e.games > 0);
  if (played.length === 0) return START_RATING;
  const total = played.reduce((s, e) => s + e.games, 0);
  return Math.round(played.reduce((s, e) => s + e.rating * e.games, 0) / total);
}
