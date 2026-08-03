/**
 * The shape of a generated question.
 *
 * Items are produced on demand by a generator for a given difficulty, rather
 * than drawn from a fixed bank, so the same problem is never seen twice and
 * difficulty is a dial rather than a bucket.
 */

import type { AnswerSpec } from '../answer'

/**
 * A wrong answer worth recognising by name.
 *
 * `signature` is the specific wrong value this mistake produces. When what the
 * child typed matches it, the game knows *why* he was wrong rather than only
 * that he was — which is the difference between a quiz and a tutor.
 */
export interface Misconception {
  id: string
  /** The wrong answer this misconception produces, in canonical form. */
  signature: string
  /** Short name, for the film room. */
  label: string
  /** What to say about it. Used by the film room and, later, the tutor. */
  explanation: string
}

export interface Item {
  standardId: string
  difficulty: number
  /** Plain-text prompt. Fractions are written `a/b`. */
  prompt: string
  answer: AnswerSpec
  /** Ordered worked steps. Shown only after a failed tackle-back. */
  workedSteps: string[]
  misconceptions: Misconception[]
  /**
   * The numbers this item was built from.
   *
   * Property tests recompute the expected answer from these independently of
   * the generator's own arithmetic, which is what makes the answer key
   * trustworthy rather than self-certified.
   */
  params: Record<string, number>
}

export interface ItemGenerator {
  standardId: string
  /** Human label, for the Training Ground. */
  label: string
  /** The difficulty band this generator can actually produce, inclusive. */
  range: [number, number]
  generate(difficulty: number, rng: Rng): Item
}

/**
 * Seeded randomness. Deterministic for a given seed so tests are reproducible
 * and a match can be replayed exactly.
 */
export interface Rng {
  /** Inclusive at both ends. */
  int(min: number, max: number): number
  pick<T>(items: readonly T[]): T
}
