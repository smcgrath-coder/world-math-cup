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
}

export interface StandardRating {
  standardId: string
  rating: number
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
