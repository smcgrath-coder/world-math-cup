import { describe, expect, it } from 'vitest'
import {
  MAX_DIFFICULTY,
  MIN_DIFFICULTY,
  QUESTIONS_PER_TRACK,
  START_DIFFICULTY,
  STEP_DOWN,
  STEP_UP,
  TRYOUT_LENGTH,
  TRYOUT_TRACKS,
  currentDifficulty,
  currentStep,
  isComplete,
  itemFor,
  nextDifficulty,
  recordAnswer,
  startTryout,
  tryoutPlan,
} from './tryout'
import type { TryoutState, TryoutTrack } from './tryout'
import { makeRng } from './items/rng'
import { ALL_GENERATORS, generatorFor } from './items/generators'
import { checkAnswer } from './answer'

const SEED = 20260804

/** Play the whole session, deciding each answer from the question in front of us. */
function play(seed: number, answer: (track: TryoutTrack, index: number) => boolean): TryoutState {
  let state = startTryout(seed)
  while (!isComplete(state)) {
    state = recordAnswer(state, answer(currentStep(state)!.track, state.index))
  }
  return state
}

const tracksOf = (state: TryoutState): TryoutTrack[] => state.plan.map((s) => s.track)

function counts(tracks: readonly TryoutTrack[]): Map<TryoutTrack, number> {
  const out = new Map<TryoutTrack, number>()
  for (const t of tracks) out.set(t, (out.get(t) ?? 0) + 1)
  return out
}

describe('tryout ladder', () => {
  it('is twenty-four questions', () => {
    expect(startTryout(SEED).plan).toHaveLength(TRYOUT_LENGTH)
  })

  it('spreads them evenly over the five domains plus fluency', () => {
    // Four each. A session that spent nine questions on fractions and one on
    // geometry would set a geometry stat off a single question.
    for (let seed = 0; seed < 40; seed++) {
      const spread = counts(tracksOf(startTryout(seed)))
      expect(spread.size).toBe(TRYOUT_TRACKS.length)
      for (const track of TRYOUT_TRACKS) expect(spread.get(track)).toBe(QUESTIONS_PER_TRACK)
    }
  })

  it('never asks about the same thing twice in a row', () => {
    for (let seed = 0; seed < 40; seed++) {
      const tracks = tracksOf(startTryout(seed))
      for (let i = 1; i < tracks.length; i++) expect(tracks[i]).not.toBe(tracks[i - 1])
    }
  })

  it('only ever names standards the game can actually generate', () => {
    const known = new Set(ALL_GENERATORS.map((g) => g.standardId))
    for (let seed = 0; seed < 20; seed++) {
      for (const step of startTryout(seed).plan) expect(known.has(step.standardId)).toBe(true)
    }
  })

  it('samples across the topics inside a domain rather than repeating one', () => {
    // Fractions has four generators and four slots, so a try-out should visit
    // all four rather than asking the same one four times.
    const fractions = startTryout(SEED)
      .plan.filter((s) => s.track === 'NF')
      .map((s) => s.standardId)
    expect(new Set(fractions).size).toBe(4)
  })

  it('starts every track in the middle of fourth grade', () => {
    const state = startTryout(SEED)
    for (const track of TRYOUT_TRACKS) expect(state.ladder[track]).toBe(START_DIFFICULTY)
    expect(currentDifficulty(state)).toBe(START_DIFFICULTY)
  })

  it('rises on a correct answer and falls further on a wrong one', () => {
    expect(nextDifficulty(50, true)).toBe(50 + STEP_UP)
    expect(nextDifficulty(50, false)).toBe(50 - STEP_DOWN)
    // Down harder than up, on purpose: a child who is struggling should find
    // the next question noticeably easier rather than fractionally so.
    expect(STEP_DOWN).toBeGreaterThan(STEP_UP)
  })

  it('clamps to a sensible range at both ends', () => {
    expect(nextDifficulty(MAX_DIFFICULTY, true)).toBe(MAX_DIFFICULTY)
    expect(nextDifficulty(MIN_DIFFICULTY, false)).toBe(MIN_DIFFICULTY)
    // A rung that has somehow gone non-finite restarts from the middle and
    // still counts the answer, rather than poisoning the rest of the session.
    expect(nextDifficulty(Number.NaN, true)).toBe(START_DIFFICULTY + STEP_UP)
  })

  it('carries a separate ladder per domain', () => {
    // Strong at fractions, weak at geometry. The two must not drag on each
    // other, or the six starting stats all end up saying the same thing.
    const state = play(SEED, (track) => track === 'NF')

    expect(state.ladder.NF).toBe(START_DIFFICULTY + QUESTIONS_PER_TRACK * STEP_UP)
    expect(state.ladder.G).toBe(START_DIFFICULTY - QUESTIONS_PER_TRACK * STEP_DOWN)
    expect(state.ladder.NBT).toBe(state.ladder.G)
  })

  it('answers the very next question of a domain at the difficulty it just earned', () => {
    let state = startTryout(SEED)
    const first = currentStep(state)!.track
    state = recordAnswer(state, true)

    // The other tracks have not moved, and the one that was answered has.
    expect(state.ladder[first]).toBe(START_DIFFICULTY + STEP_UP)
    for (const track of TRYOUT_TRACKS) {
      if (track !== first) expect(state.ladder[track]).toBe(START_DIFFICULTY)
    }
  })

  it('is deterministic under a seed, and different under a different one', () => {
    const a = startTryout(SEED)
    const b = startTryout(SEED)
    expect(a.plan).toEqual(b.plan)
    expect(startTryout(SEED + 1).plan).not.toEqual(a.plan)
  })

  it('finishes even when every single answer is wrong', () => {
    const state = play(SEED, () => false)

    expect(isComplete(state)).toBe(true)
    expect(state.index).toBe(TRYOUT_LENGTH)
    expect(currentStep(state)).toBeUndefined()
    // Four wrong answers on a track lands exactly on the floor, and the floor
    // holds. Nothing goes negative and nothing gets stuck.
    for (const track of TRYOUT_TRACKS) {
      expect(state.ladder[track]).toBeGreaterThanOrEqual(MIN_DIFFICULTY)
    }
  })

  it('finishes even when every single answer is right', () => {
    const state = play(SEED, () => true)
    expect(isComplete(state)).toBe(true)
    for (const track of TRYOUT_TRACKS) {
      expect(state.ladder[track]).toBeLessThanOrEqual(MAX_DIFFICULTY)
    }
  })

  it('answering past the end changes nothing', () => {
    const state = play(SEED, () => true)
    expect(recordAnswer(state, true)).toBe(state)
  })

  it('builds a real, answerable question for every step of a session', () => {
    const rng = makeRng(SEED)
    let state = startTryout(SEED)
    while (!isComplete(state)) {
      const step = currentStep(state)!
      const item = itemFor(step, currentDifficulty(state), rng)

      expect(item.standardId).toBe(step.standardId)
      expect(item.prompt.length).toBeGreaterThan(0)
      // The generator clamps to its own band, so what gets logged is the
      // difficulty the question was really built at, never the one we asked for.
      const [lo, hi] = generatorFor(step.standardId)!.range
      expect(item.difficulty).toBeGreaterThanOrEqual(lo)
      expect(item.difficulty).toBeLessThanOrEqual(hi)
      expect(checkAnswer(item.answer.canonical, item.answer).correct).toBe(true)

      state = recordAnswer(state, true)
    }
  })

  it('plans from an rng directly, so the plan can be built without a seed', () => {
    expect(tryoutPlan(makeRng(SEED))).toEqual(startTryout(SEED).plan)
  })
})
