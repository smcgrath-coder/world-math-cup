/**
 * Elo ratings — the single measure of strength in the game.
 *
 * Every skill the player has, every opponent they face and their world rank are
 * all points on one 0–99 scale, rated by the same mathematics FIFA uses for its
 * world rankings. One concept, not three.
 *
 * Two properties here are load-bearing for the design, not incidental:
 *
 *  - Item selection targets ~0.75 success, not 0.5 (see `difficultyForSuccess`).
 *    This follows Math Garden's validated adaptive-practice work. A coin-flip
 *    difficulty is the wrong calibration for a capable but avoidant learner.
 *  - Matches count 3x training (`K_MATCH` / `K_TRAINING`). Practice prepares;
 *    only matches make a rating true.
 */

export const SPREAD = 25
export const K_TRAINING = 2.5
export const K_MATCH = 7.5
export const MIN_RATING = 0
export const MAX_RATING = 99

const clamp = (v: number) => Math.min(MAX_RATING, Math.max(MIN_RATING, v))

/**
 * Probability that `rating` answers an item of `difficulty` correctly.
 *
 * The logistic curve is scaled so a `SPREAD` (25) point gap gives roughly
 * 91/9 odds; equal rating and difficulty gives exactly 0.5.
 */
export function expectedScore(rating: number, difficulty: number): number {
  return 1 / (1 + 10 ** ((difficulty - rating) / SPREAD))
}

/**
 * Difficulty at which this rating has probability `p` of succeeding.
 *
 * Inverting `expectedScore`:
 *
 *     p = 1 / (1 + 10^((d - r) / SPREAD))
 *     1/p - 1 = 10^((d - r) / SPREAD)
 *     log10(1/p - 1) = (d - r) / SPREAD
 *     d = r + SPREAD * log10(1/p - 1)
 *
 * For p > 0.5 the log is negative, so the difficulty lands *below* the rating:
 * to succeed 75% of the time you need an item easier than your level
 * (`difficultyForSuccess(50, 0.75)` is about 38).
 *
 * NOTE — near the ends of the scale the requested probability is not
 * achievable and difficulty saturates instead. There is nothing easier than 0
 * and nothing harder than 99, so:
 *
 *  - Below rating ~12, an item targeting p=0.75 would need negative difficulty.
 *    It clamps to 0, and the player's real success rate comes out *lower* than
 *    requested (at rating 5, asking for 0.85 actually yields 0.61).
 *  - Above rating ~87, an item targeting a low p would need difficulty over 99.
 *    It clamps, and the real success rate comes out *higher* than requested.
 *
 * Callers that care about the true probability should ask `expectedScore` for
 * the difficulty they actually got rather than assuming they got `p`.
 */
export function difficultyForSuccess(rating: number, p: number): number {
  const clampedP = Math.min(0.99, Math.max(0.01, p))
  return clamp(rating + SPREAD * Math.log10(1 / clampedP - 1))
}

/**
 * The rating after answering one item. `k` is how much a single item is allowed
 * to move things: `K_TRAINING` for practice, `K_MATCH` for matches.
 *
 * A correct answer on an item far below the rating moves it by almost nothing,
 * because the expected score is already near 1. That is what stops easy items
 * being ground for cheap rating.
 */
export function updateRating(
  rating: number,
  difficulty: number,
  correct: boolean,
  k: number,
): number {
  const e = expectedScore(rating, difficulty)
  return clamp(rating + k * ((correct ? 1 : 0) - e))
}
