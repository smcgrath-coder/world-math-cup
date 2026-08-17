/**
 * The attempts log, and the shapes derived from it.
 *
 * Everything the player sees about himself — six card stats, an overall rating,
 * a world rank, what to train next — is derived from this one append-only list.
 * Nothing is stored as a mutable total, so the rating mathematics can change and
 * the whole history recomputes under the new rules.
 */

import type { CardStat } from '../curriculum/standards.generated'

export type AttemptContext = 'tryout' | 'training' | 'match' | 'tackleback' | 'penalty'

/** Which shot the player chose, when this attempt was a shot on goal. */
export type ShotChoice = 'wide' | 'box' | 'outside18' | 'bicycle'

export interface Attempt {
  id: string
  at: number
  standardId: string
  difficulty: number
  params: Record<string, number>
  given: string
  correct: boolean
  latencyMs: number
  context: AttemptContext
  misconceptionId?: string
  matchId?: string
  /** Set when this attempt was a shot. Drives the courage track. */
  shot?: ShotChoice
  /**
   * How many options this question offered, when it was a choice rather than a
   * typed answer.
   *
   * Recorded because ratings are derived from this log and nothing is stored as
   * a total: `deriveRatings` needs to know a true/false was right half the time
   * by luck, and the item itself is long gone by then. Optional, so every
   * attempt written before choices existed stays valid and scores as a typed
   * answer, which is exactly what it was.
   */
  choices?: number
}

export interface StandardRating {
  standardId: string
  /** What actually shows on the card — rust subtracted, same as always. */
  rating: number
  /**
   * The rating with no rust taken off it — what he'd be back at the moment the
   * rust burns off. Never lowered by time alone, only by a genuine miss.
   * `rating` is always this minus whatever rust currently sits on the standard.
   */
  ratingClean: number
  attempts: number
  lastSeenAt: number | null
  /** Provisional until PROVISIONAL_ATTEMPTS. Renders as a dashed card segment. */
  provisional: boolean
}

export type Card = Record<CardStat, number>

/**
 * The bravery track.
 *
 * The chores-app reward pays on courage and habit, never on wins or accuracy,
 * so an attempted overhead kick counts whether or not it goes in. That is the
 * entire point of counting it.
 */
export interface Courage {
  /** `shot` was `outside18` or `bicycle`, regardless of outcome. */
  hardShotsAttempted: number
  hardShotsScored: number
  tackleBacksWon: number
  tackleBacksFaced: number
}
