/**
 * The scouting try-out: what gets asked, in what order, and how hard.
 *
 * This is the first maths he ever does in the game and it sets all six starting
 * stats, so it is a *measurement*, and everything here follows from that being
 * true rather than from it being a level.
 *
 * **The ladder is per-domain, not per-session.** One running difficulty for the
 * whole try-out would average him: four right answers on fractions would hand
 * him harder geometry, and a card built from that says the same thing on every
 * axis. Six independent ladders is what makes "strong at fractions, weak at
 * geometry" come out of the session as two different numbers, which is the only
 * reason to run the session at all.
 *
 * **Down harder than up.** Correct adds 8, wrong takes off 10. A child who is
 * struggling has to feel the next question get easier — noticeably, not
 * fractionally — and one who is flying should climb steadily rather than be
 * fired out of range in three answers. The asymmetry also keeps the session
 * hovering a little above 50% success rather than at it, which is the right side
 * of the line for a child who freezes in front of things he thinks are too hard.
 *
 * **Four each, and never twice in a row.** Twenty-four questions over six tracks
 * is four apiece, so no stat is set off one question and no domain can dominate.
 * Within a domain the standards are sampled round-robin from a random offset, so
 * fractions gets all four of its topics rather than the same one four times, and
 * the tracks are interleaved so he is never asked two of the same thing back to
 * back — the try-out should feel like a combine running through stations, not
 * like four worksheets stapled together.
 *
 * Everything here is pure and seeded. The screen owns the clock, the store and
 * the encouragement; this file owns nothing but the plan and the arithmetic, so
 * the whole session can be played out in a test without a DOM.
 */

import { STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { DomainCode } from '../curriculum/standards.generated'
import { ALL_GENERATORS, generatorFor } from './items/generators'
import { makeRng } from './items/rng'
import type { Item, Rng } from './items/types'

/**
 * The five Montana domains plus fluency.
 *
 * `FLU` is not a domain and never will be: PAC is how fast his right answers
 * arrive rather than a subject, so it has no curriculum code and sits here by
 * name. It still gets four questions, because a card with a PAC of 50 and no
 * evidence behind it would be the one stat on his card that was made up.
 */
export type TryoutTrack = DomainCode | 'FLU'

export const TRYOUT_TRACKS: readonly TryoutTrack[] = ['OA', 'NBT', 'NF', 'MD', 'G', 'FLU']

export const QUESTIONS_PER_TRACK = 4
export const TRYOUT_LENGTH = TRYOUT_TRACKS.length * QUESTIONS_PER_TRACK

/** Mid-fourth-grade. Where every track opens, before it has any evidence. */
export const START_DIFFICULTY = 45

export const STEP_UP = 8
export const STEP_DOWN = 10

/**
 * The range the ladder may wander over.
 *
 * Wider than the try-out can actually reach — four wrong answers bottom out at
 * exactly 5 and four right ones stop at 77 — so these are rails rather than
 * shaping. Each generator clamps to its own narrower band on top of this, and
 * the item reports the difficulty it was really built at.
 */
export const MIN_DIFFICULTY = 5
export const MAX_DIFFICULTY = 95

/** Which track a standard belongs to. Anything without a domain is fluency. */
export function trackFor(standardId: string): TryoutTrack {
  return STANDARDS_BY_ID[standardId]?.domain ?? 'FLU'
}

export interface TryoutStep {
  track: TryoutTrack
  standardId: string
}

export type TryoutLadder = Readonly<Record<TryoutTrack, number>>

export interface TryoutState {
  /** The twenty-four questions, decided up front. Difficulty is not. */
  readonly plan: readonly TryoutStep[]
  /** How many have been answered. Equal to `plan.length` when it is over. */
  readonly index: number
  readonly ladder: TryoutLadder
}

/** The next difficulty for a track, floored, capped, and never `NaN`. */
export function nextDifficulty(current: number, correct: boolean): number {
  const from = Number.isFinite(current) ? current : START_DIFFICULTY
  const moved = from + (correct ? STEP_UP : -STEP_DOWN)
  return Math.min(MAX_DIFFICULTY, Math.max(MIN_DIFFICULTY, moved))
}

/** In place, consuming one number per swap, so a seed reproduces the order. */
function shuffled<T>(items: readonly T[], rng: Rng): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = rng.int(0, i)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

/** Every standard the game can ask about, grouped by track. */
function standardsByTrack(): Map<TryoutTrack, string[]> {
  const out = new Map<TryoutTrack, string[]>()
  for (const track of TRYOUT_TRACKS) out.set(track, [])
  for (const generator of ALL_GENERATORS) {
    out.get(trackFor(generator.standardId))?.push(generator.standardId)
  }
  return out
}

/**
 * The twenty-four questions, in order.
 *
 * Four rounds of all six tracks, each round shuffled, with the first track of a
 * round nudged aside when it would repeat the last track of the one before.
 * Round-based rather than a free shuffle because a free shuffle of twenty-four
 * tokens can legitimately put all four fraction questions in the first six, and
 * a child would read that as "this whole thing is fractions".
 */
export function tryoutPlan(rng: Rng): TryoutStep[] {
  const pool = standardsByTrack()

  // Where each track starts its round-robin. A domain with four generators and
  // four slots therefore visits all four, in a different order each session.
  const cursor = new Map<TryoutTrack, number>()
  for (const track of TRYOUT_TRACKS) {
    const ids = pool.get(track)!
    cursor.set(track, ids.length > 0 ? rng.int(0, ids.length - 1) : 0)
  }

  const plan: TryoutStep[] = []
  for (let round = 0; round < QUESTIONS_PER_TRACK; round++) {
    const order = shuffled(TRYOUT_TRACKS, rng)
    const previous = plan[plan.length - 1]?.track
    if (order[0] === previous && order.length > 1) {
      ;[order[0], order[1]] = [order[1]!, order[0]!]
    }

    for (const track of order) {
      const ids = pool.get(track)!
      // A track with no generator at all cannot happen today and must not be a
      // crash if it ever does: it simply contributes nothing to the session.
      if (ids.length === 0) continue
      plan.push({ track, standardId: ids[(cursor.get(track)! + round) % ids.length]! })
    }
  }
  return plan
}

/**
 * The stream the *questions* are drawn from, given a session seed.
 *
 * Kept beside the plan's stream rather than on top of it, so two sessions seeded
 * a step apart cannot deal each other's questions. It lives here rather than in
 * the screen because it is half of what makes a session reproducible: the plan
 * and the items together are the session, and a test that wants to know what
 * will be asked needs both.
 */
export const itemSeedFor = (seed: number): number => (seed ^ 0x51de) >>> 0

export function startTryout(seed: number): TryoutState {
  const ladder = {} as Record<TryoutTrack, number>
  for (const track of TRYOUT_TRACKS) ladder[track] = START_DIFFICULTY
  return { plan: tryoutPlan(makeRng(seed)), index: 0, ladder }
}

export function isComplete(state: TryoutState): boolean {
  return state.index >= state.plan.length
}

/** The question he is looking at, or `undefined` once the session is over. */
export function currentStep(state: TryoutState): TryoutStep | undefined {
  return state.plan[state.index]
}

/** How hard the next question should be, from that track's own ladder. */
export function currentDifficulty(state: TryoutState): number {
  const step = currentStep(state)
  return step === undefined ? START_DIFFICULTY : state.ladder[step.track]
}

/**
 * Fold one answer in.
 *
 * Only the answered track's rung moves. Answering after the last question
 * returns the state untouched rather than throwing — the screen already stops
 * asking, and a double-submit at the buzzer must not end the session in a stack
 * trace.
 */
export function recordAnswer(state: TryoutState, correct: boolean): TryoutState {
  const step = currentStep(state)
  if (step === undefined) return state
  return {
    plan: state.plan,
    index: state.index + 1,
    ladder: { ...state.ladder, [step.track]: nextDifficulty(state.ladder[step.track], correct) },
  }
}

/**
 * The question itself.
 *
 * Deliberately not `selectItem`: that picks a topic *and* derives a difficulty
 * from his current ratings, and during the try-out there are no ratings yet —
 * the ladder is the whole source of difficulty, and the plan is the whole source
 * of topic. Falls back to the first generator rather than throwing if a standard
 * ever loses its generator, because a missing question mid-session is a blank
 * screen a ten-year-old cannot get past.
 */
export function itemFor(step: TryoutStep, difficulty: number, rng: Rng): Item {
  const generator = generatorFor(step.standardId) ?? ALL_GENERATORS[0]!
  return generator.generate(difficulty, rng)
}
