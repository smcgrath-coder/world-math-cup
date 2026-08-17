import { describe, expect, it } from 'vitest'
import { K_MATCH, K_TRAINING, updateRating } from '../engine/elo'
import { makeRng } from '../engine/items/rng'
import {
  START_DIFFICULTY,
  STEP_DOWN,
  STEP_UP,
  currentDifficulty,
  currentStep,
  isComplete,
  recordAnswer,
  startTryout,
  trackFor,
  tryoutPlan,
} from '../engine/tryout'
import type { TryoutTrack } from '../engine/tryout'
import { DOMAIN_TO_STAT, STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { CardStat, DomainCode } from '../curriculum/standards.generated'
import type { Attempt, AttemptContext, ShotChoice, StandardRating } from './types'
import {
  DECAY_FLOOR,
  DECAY_PER_WEEK,
  PROVISIONAL_ATTEMPTS,
  RATED_STANDARD_IDS,
  RATING_FLOOR,
  SEED_RATING,
  WEEK_MS,
  deriveCard,
  deriveCourage,
  deriveOverall,
  deriveRatings,
  deriveWorldRank,
  expectedLatencyMs,
} from './derive'

/** 2026-01-01T00:00:00Z. Nothing depends on the wall clock; `now` is a parameter. */
const T0 = 1767225600000
const MINUTE = 60_000

let seq = 0

function attempt(over: Partial<Attempt> = {}): Attempt {
  seq += 1
  return {
    id: `a${String(seq).padStart(6, '0')}`,
    at: T0,
    standardId: 'MT.4.NF.1',
    difficulty: 50,
    params: {},
    given: '1',
    correct: true,
    latencyMs: 8000,
    context: 'training',
    ...over,
  }
}

/** `n` attempts on one standard, one minute apart, starting at `T0`. */
function run(n: number, over: Partial<Attempt> = {}): Attempt[] {
  return Array.from({ length: n }, (_, i) => attempt({ at: T0 + i * MINUTE, ...over }))
}

const lastAt = (as: Attempt[]) => Math.max(...as.map((a) => a.at))

function ratingOf(as: Attempt[], standardId: string, now = lastAt(as)): number {
  const r = deriveRatings(as, now).get(standardId)
  if (!r) throw new Error(`no rating for ${standardId}`)
  return r.rating
}

/** Deterministic shuffle, so a failure is reproducible rather than a coin toss. */
function shuffle<T>(items: readonly T[], seed = 12345): T[] {
  const out = items.slice()
  let s = seed
  for (let i = out.length - 1; i > 0; i--) {
    s = (s * 1664525 + 1013904223) % 4294967296
    const j = s % (i + 1)
    ;[out[i], out[j]] = [out[j]!, out[i]!]
  }
  return out
}

function plain(m: Map<string, StandardRating>): Record<string, StandardRating> {
  return Object.fromEntries([...m.entries()].sort(([a], [b]) => a.localeCompare(b)))
}

const standardsIn = (domain: DomainCode) =>
  RATED_STANDARD_IDS.filter((id) => STANDARDS_BY_ID[id]?.domain === domain)

// ---------------------------------------------------------------------------

describe('RATED_STANDARD_IDS', () => {
  it('covers every standard the game can generate items for, including FLU.MULT', () => {
    expect(RATED_STANDARD_IDS).toContain('FLU.MULT')
    expect(RATED_STANDARD_IDS).toContain('MT.4.NF.1')
    expect(new Set(RATED_STANDARD_IDS).size).toBe(RATED_STANDARD_IDS.length)
  })

  it('has at least two standards in the NF domain, which several tests rely on', () => {
    expect(standardsIn('NF').length).toBeGreaterThanOrEqual(2)
  })
})

describe('deriveRatings — empty log', () => {
  const ratings = deriveRatings([], T0)

  it('gives every rated standard the seed rating', () => {
    for (const id of RATED_STANDARD_IDS) {
      expect(ratings.get(id)?.rating).toBe(SEED_RATING)
    }
  })

  it('marks them all provisional, unattempted and unseen', () => {
    for (const id of RATED_STANDARD_IDS) {
      const r = ratings.get(id)!
      expect(r).toMatchObject({ standardId: id, attempts: 0, lastSeenAt: null, provisional: true })
    }
  })

  it('has an entry for every rated standard and nothing else', () => {
    expect([...ratings.keys()].sort()).toEqual([...RATED_STANDARD_IDS].sort())
  })
})

describe('deriveRatings — bookkeeping', () => {
  it('counts attempts and records the last time the standard was seen', () => {
    const as = run(3, { standardId: 'MT.4.NF.2' })
    const r = deriveRatings(as, lastAt(as)).get('MT.4.NF.2')!
    expect(r.attempts).toBe(3)
    expect(r.lastSeenAt).toBe(T0 + 2 * MINUTE)
  })

  it('rates a standard that appears in the log but has no generator', () => {
    const as = run(2, { standardId: 'MT.5.NF.1' })
    expect(deriveRatings(as, lastAt(as)).get('MT.5.NF.1')?.attempts).toBe(2)
  })
})

describe('deriveRatings — K by context', () => {
  const one = (context: AttemptContext) =>
    ratingOf([attempt({ context, difficulty: 50, correct: true })], 'MT.4.NF.1')

  it('moves a rating further for a correct match answer than a correct training answer', () => {
    expect(one('match') - SEED_RATING).toBeGreaterThan(one('training') - SEED_RATING)
  })

  it('weights matches about 3x training, as elo.ts intends', () => {
    expect((one('match') - SEED_RATING) / (one('training') - SEED_RATING)).toBeCloseTo(3, 5)
  })

  it('treats tackleback and penalty as match', () => {
    expect(one('tackleback')).toBeCloseTo(one('match'), 10)
    expect(one('penalty')).toBeCloseTo(one('match'), 10)
  })

  // `tryout` is deliberately absent from this list: it does not fold through
  // Elo at all. See "the try-out places rather than accumulates" below.
  it('does not fold a try-out attempt through Elo', () => {
    expect(one('tryout')).not.toBeCloseTo(one('training'), 3)
  })
})

describe('deriveRatings — provisional', () => {
  it('stays provisional below the threshold and clears at exactly the threshold', () => {
    for (let n = 0; n < PROVISIONAL_ATTEMPTS; n++) {
      expect(deriveRatings(run(n), T0).get('MT.4.NF.1')?.provisional).toBe(true)
    }
    const at5 = run(PROVISIONAL_ATTEMPTS)
    expect(deriveRatings(at5, lastAt(at5)).get('MT.4.NF.1')?.provisional).toBe(false)
  })

  it('halves K on the attempts taken while provisional and stops halving at the same point', () => {
    const d = 50
    // Same timestamp throughout, deliberately: this test is about K, not about
    // decay, and a session with real gaps would rust by a few thousandths of a
    // point between one attempt and the next — real, but not what is being
    // measured here.
    const as = Array.from({ length: 6 }, () =>
      attempt({ at: T0, difficulty: d, correct: true, context: 'training' }),
    )
    const after = (n: number) => ratingOf(as.slice(0, n), 'MT.4.NF.1', lastAt(as.slice(0, n)))

    // The fifth attempt is the last one taken while provisional: half K.
    expect(after(5)).toBeCloseTo(updateRating(after(4), d, true, K_TRAINING / 2), 10)
    // The sixth is the first taken with a settled rating: full K.
    expect(after(6)).toBeCloseTo(updateRating(after(5), d, true, K_TRAINING), 10)
    // And the step visibly doubles at that boundary.
    expect((after(6) - after(5)) / (after(5) - after(4))).toBeGreaterThan(1.8)
  })
})

describe('deriveRatings — decay', () => {
  it('drops a standard last seen three weeks ago by about 4.5 points', () => {
    const as = run(20, { difficulty: 85, correct: true, context: 'match' })
    const fresh = ratingOf(as, 'MT.4.NF.1')
    const stale = ratingOf(as, 'MT.4.NF.1', lastAt(as) + 3 * WEEK_MS)
    expect(fresh - stale).toBeCloseTo(3 * DECAY_PER_WEEK, 6)
  })

  it('decays continuously rather than in whole-week steps', () => {
    const as = run(20, { difficulty: 85, correct: true, context: 'match' })
    const fresh = ratingOf(as, 'MT.4.NF.1')
    const half = ratingOf(as, 'MT.4.NF.1', lastAt(as) + WEEK_MS / 2)
    expect(fresh - half).toBeCloseTo(DECAY_PER_WEEK / 2, 6)
  })

  it('never decays below the decay floor, however long the layoff', () => {
    const as = run(20, { difficulty: 85, correct: true, context: 'match' })
    expect(ratingOf(as, 'MT.4.NF.1', lastAt(as) + 500 * WEEK_MS)).toBe(DECAY_FLOOR)
  })

  it('does not lift a rating that active misses already pushed below the decay floor', () => {
    // Missing an *easy* item is what costs most: the expected score was near 1.
    const as = run(20, { difficulty: 0, correct: false, context: 'match' })
    const fresh = ratingOf(as, 'MT.4.NF.1')
    expect(fresh).toBeLessThan(DECAY_FLOOR)
    expect(ratingOf(as, 'MT.4.NF.1', lastAt(as) + 100 * WEEK_MS)).toBe(fresh)
  })

  it('leaves never-attempted standards alone, since they have no last-seen time', () => {
    expect(deriveRatings([], T0 + 500 * WEEK_MS).get('MT.4.NF.1')?.rating).toBe(SEED_RATING)
  })
})

describe('deriveRatings — rust', () => {
  /** Six identical-timestamp attempts: past provisional, and — same reasoning as elsewhere in this file — no internal gaps for decay to nibble on before the scenario under test even begins. */
  const settled = (over: Partial<Attempt> = {}) =>
    Array.from({ length: 6 }, () =>
      attempt({ standardId: 'MT.4.NF.1', at: T0, difficulty: 50, correct: true, context: 'match', ...over }),
    )

  it('is always clean minus displayed, and never goes negative', () => {
    const as = settled()
    for (let weeks = 0; weeks <= 12; weeks += 0.5) {
      const r = deriveRatings(as, lastAt(as) + weeks * WEEK_MS).get('MT.4.NF.1')!
      expect(r.ratingClean - r.rating, `week ${weeks}`).toBeGreaterThanOrEqual(-1e-9)
    }
  })

  it('a log with no gaps has zero rust, on every standard, not only the one touched', () => {
    const as = settled()
    const ratings = deriveRatings(as, lastAt(as))
    for (const [id, r] of ratings) {
      expect(r.rating, id).toBe(r.ratingClean)
    }
  })

  it('a correct answer on a rusted standard climbs at exactly double the plain rate, while it stays under the ceiling', () => {
    const as = settled()
    const rustyAt = lastAt(as) + 6 * WEEK_MS
    const before = deriveRatings(as, rustyAt).get('MT.4.NF.1')!
    // Genuinely rusted, and comfortably past dust — six weeks at 1.5/week is 9
    // points, nowhere near the decay floor from a rating settled around 50-ish.
    const rustGap = before.ratingClean - before.rating
    expect(rustGap).toBeCloseTo(6 * DECAY_PER_WEEK, 6)

    // Pitched at the rusted level itself — not rounded, so the expected score
    // is exactly 0.5 and the plain gain is exactly half of K_MATCH — and small
    // enough next to the nine-point rust gap that doubling it still leaves
    // room under the ceiling.
    const difficulty = before.rating
    const plainGain = K_MATCH * 0.5
    expect(2 * plainGain, 'fixture check: must stay under the rust gap').toBeLessThan(rustGap)

    const recovered = deriveRatings(
      [...as, attempt({ standardId: 'MT.4.NF.1', at: rustyAt, difficulty, correct: true, context: 'match' })],
      rustyAt,
    ).get('MT.4.NF.1')!

    expect(recovered.rating).toBeCloseTo(before.rating + 2 * plainGain, 6)
    // Still short of clean — this one step was not enough to fully close a
    // nine-point gap at K_MATCH, doubled or not.
    expect(recovered.rating).toBeLessThan(recovered.ratingClean)
  })

  it('caps the climb at the clean ceiling rather than letting a big boosted step vault past it', () => {
    const as = settled()
    // A small gap on purpose — a big one gives the boosted step so far to
    // travel that it can land short of even the *clean* ceiling's own single
    // plain step, which would prove nothing about capping either way. A small
    // gap next to the hardest item on the scale is what reliably forces the
    // overshoot the cap exists for.
    const rustyAt = lastAt(as) + WEEK_MS
    const before = deriveRatings(as, rustyAt).get('MT.4.NF.1')!

    const recovered = deriveRatings(
      [...as, attempt({ standardId: 'MT.4.NF.1', at: rustyAt, difficulty: 99, correct: true, context: 'match' })],
      rustyAt,
    ).get('MT.4.NF.1')!

    // The uncapped boosted step really would have overshot, or this test
    // would not be exercising the cap at all.
    const uncapped = updateRating(before.rating, 99, true, K_MATCH * 2)
    expect(uncapped, 'fixture check: must actually threaten to overshoot').toBeGreaterThan(recovered.ratingClean)

    expect(recovered.rating).toBe(recovered.ratingClean)
  })

  it('does not boost a miss on a rusted standard — it moves at the same rate a clean standard would', () => {
    const as = settled()
    const rustyAt = lastAt(as) + 6 * WEEK_MS
    const before = deriveRatings(as, rustyAt).get('MT.4.NF.1')!
    const difficulty = 0 // the adversarial case: missing an easy item costs the most

    const missed = deriveRatings(
      [...as, attempt({ standardId: 'MT.4.NF.1', at: rustyAt, difficulty, correct: false, context: 'match' })],
      rustyAt,
    ).get('MT.4.NF.1')!

    expect(missed.rating).toBeCloseTo(updateRating(before.rating, difficulty, false, K_MATCH), 6)
  })

  it('stops boosting the moment the clean level is regained, and grows at the plain rate from there', () => {
    // A rust gap small enough that one easy, generous correct answer clears
    // it outright.
    const as = settled()
    const rustyAt = lastAt(as) + WEEK_MS // one week: 1.5 points, visible, small
    const before = deriveRatings(as, rustyAt).get('MT.4.NF.1')!
    expect(before.ratingClean - before.rating).toBeCloseTo(DECAY_PER_WEEK, 6)

    const firstBack = attempt({ standardId: 'MT.4.NF.1', at: rustyAt, difficulty: 90, correct: true, context: 'match' })
    const afterFirst = deriveRatings([...as, firstBack], rustyAt).get('MT.4.NF.1')!
    // Fully caught up, exactly — a difficulty-90 item against a rating in the
    // fifties is more than enough to close a point and a half even at the
    // plain rate, so the cap is what actually decides the landing spot.
    expect(afterFirst.rating).toBe(afterFirst.ratingClean)

    // One more correct answer, same timestamp, same difficulty — same
    // timestamp deliberately, so this checks only whether the boost is still
    // active and not also, incidentally, the session-dust a real gap would
    // add on top. If the boost were still active this would jump by the same
    // doubled amount again; it should instead move by exactly the plain,
    // unboosted step.
    const secondBack = attempt({ standardId: 'MT.4.NF.1', at: rustyAt, difficulty: 90, correct: true, context: 'match' })
    const afterSecond = deriveRatings([...as, firstBack, secondBack], rustyAt).get('MT.4.NF.1')!

    expect(afterSecond.rating).toBe(updateRating(afterFirst.rating, 90, true, K_MATCH))
  })
})

describe('deriveRatings — the hard floor', () => {
  it('cannot be pushed below the floor by thirty consecutive misses', () => {
    // Difficulty 0 is the adversarial case: missing an item the rating says you
    // should have got is the biggest single drop the mathematics allows.
    const as = run(30, { difficulty: 0, correct: false, context: 'match' })
    expect(ratingOf(as, 'MT.4.NF.1')).toBe(RATING_FLOOR)
  })

  it('holds under a thousand misses at maximum K', () => {
    const as = run(1000, { difficulty: 0, correct: false, context: 'penalty' })
    expect(ratingOf(as, 'MT.4.NF.1')).toBe(RATING_FLOOR)
  })

  it('holds after every intermediate attempt, not only at the end', () => {
    const as = run(40, { difficulty: 0, correct: false, context: 'match' })
    for (let n = 1; n <= as.length; n++) {
      expect(ratingOf(as.slice(0, n), 'MT.4.NF.1')).toBeGreaterThanOrEqual(RATING_FLOOR)
    }
  })

  it('holds across every difficulty and context a miss can arrive in', () => {
    const contexts: AttemptContext[] = ['tryout', 'training', 'match', 'tackleback', 'penalty']
    for (const context of contexts) {
      for (let difficulty = 0; difficulty <= 99; difficulty += 3) {
        const as = run(60, { difficulty, correct: false, context })
        expect(ratingOf(as, 'MT.4.NF.1')).toBeGreaterThanOrEqual(RATING_FLOOR)
      }
    }
  })

  it('holds when misses are mixed with decay and more misses', () => {
    const early = run(20, { difficulty: 0, correct: false, context: 'match' })
    const late = Array.from({ length: 20 }, (_, i) =>
      attempt({
        at: lastAt(early) + 40 * WEEK_MS + i * MINUTE,
        difficulty: 0,
        correct: false,
        context: 'match',
      }),
    )
    const all = [...early, ...late]
    expect(ratingOf(all, 'MT.4.NF.1')).toBeGreaterThanOrEqual(RATING_FLOOR)
    expect(ratingOf(all, 'MT.4.NF.1', lastAt(all) + 500 * WEEK_MS)).toBeGreaterThanOrEqual(
      RATING_FLOOR,
    )
  })

  it('still lets a rating reach the top of the scale', () => {
    const as = run(400, { difficulty: 99, correct: true, context: 'match' })
    expect(ratingOf(as, 'MT.4.NF.1')).toBeLessThanOrEqual(99)
    expect(ratingOf(as, 'MT.4.NF.1')).toBeGreaterThan(90)
  })
})

describe('deriveRatings — seeding a newly taught standard', () => {
  // Deliberately short of the top of the scale: a history that pins NF.1 at 99
  // would make "seeds at the domain average" pass for the wrong reason, since
  // every candidate seed clamps to the same number up there.
  //
  // Same timestamp throughout rather than `run`'s usual minute-apart spacing —
  // these tests check a seed against the exact rating a sibling landed at, and
  // real gaps would rust NF.1 by a few thousandths between its own attempts,
  // which is a real effect but not the one under test here.
  const history = Array.from({ length: 12 }, () =>
    attempt({ standardId: 'MT.4.NF.1', at: T0, difficulty: 75, correct: true, context: 'match' }),
  )

  it('seeds the first standard seen at the default, with nothing else to go on', () => {
    const first = [attempt({ standardId: 'MT.4.NF.1', difficulty: 50, correct: true })]
    expect(ratingOf(first, 'MT.4.NF.1')).toBeCloseTo(
      updateRating(SEED_RATING, 50, true, K_TRAINING / 2),
      10,
    )
  })

  it('shows an untouched sibling at the domain average once the domain has history', () => {
    const ratings = deriveRatings(history, lastAt(history))
    const known = ratings.get('MT.4.NF.1')!.rating
    expect(known).toBeGreaterThan(65)
    expect(known).toBeLessThan(95)
    expect(ratings.get('MT.4.NF.2')!.rating).toBeCloseTo(known, 10)
    expect(ratings.get('MT.4.NF.2')!.attempts).toBe(0)
  })

  it('seeds a newly encountered standard at its domain average, not at 50', () => {
    const known = ratingOf(history, 'MT.4.NF.1')
    const debut = attempt({
      standardId: 'MT.4.NF.2',
      at: lastAt(history) + MINUTE,
      difficulty: 50,
      correct: true,
      context: 'training',
    })
    const all = [...history, debut]
    expect(ratingOf(all, 'MT.4.NF.2')).toBeCloseTo(
      updateRating(known, 50, true, K_TRAINING / 2),
      10,
    )
    // The 50-seed answer would be nowhere near this.
    expect(ratingOf(all, 'MT.4.NF.2')).toBeGreaterThan(65)
  })

  it('averages across every rated standard in the domain, not just the newest', () => {
    // Every attempt on the same timestamp — both across the two standards and
    // within each one's own twenty. Interleaving alone used to be enough to
    // keep the two standards' decay in step; it is not enough on its own to
    // also keep either one's rating exactly equal to its own undecayed walk,
    // which now matters because a real gap between two attempts on the same
    // standard rusts it by a few thousandths of a point internally, before
    // `now` ever gets involved. The seed this test checks is computed from the
    // undecayed walk either way; matching that in the displayed mean too is
    // what the zero gap buys here.
    const seen = Array.from({ length: 20 }, () => [
      attempt({
        standardId: 'MT.4.NF.1',
        at: T0,
        difficulty: 75,
        correct: true,
        context: 'match',
      }),
      attempt({
        standardId: 'MT.4.NF.2',
        at: T0,
        difficulty: 10,
        correct: false,
        context: 'match',
      }),
    ]).flat()
    const ratings = deriveRatings(seen, lastAt(seen))
    expect(ratings.get('MT.4.NF.1')!.rating).toBeGreaterThan(
      ratings.get('MT.4.NF.2')!.rating + 20,
    )
    const mean = (ratings.get('MT.4.NF.1')!.rating + ratings.get('MT.4.NF.2')!.rating) / 2
    expect(ratings.get('MT.4.NF.3')!.rating).toBeCloseTo(mean, 10)
  })

  it('does not let one domain seed another', () => {
    const ratings = deriveRatings(history, lastAt(history))
    expect(ratings.get('MT.4.NBT.4')!.rating).toBe(SEED_RATING)
    expect(ratings.get('MT.4.G.1')!.rating).toBe(SEED_RATING)
  })

  it('seeds FLU.MULT at the default, since fluency belongs to no domain', () => {
    const ratings = deriveRatings(history, lastAt(history))
    expect(ratings.get('FLU.MULT')!.rating).toBe(SEED_RATING)
  })
})

/**
 * The try-out is a placement test, so its ladder *is* the measurement.
 *
 * Folding it through Elo a second time only damps it: at `K_TRAINING`, halved
 * again while provisional, and with a domain's four questions spread over up to
 * four standards, a 72-point ladder spread used to arrive as a 6-point card
 * spread. A child who cannot do fractions and one who has mastered them got
 * near-identical first sessions, which defeats the entire point of measuring.
 */
describe('deriveRatings — the try-out places rather than accumulates', () => {
  /** A full twenty-four question session, built from the real plan. */
  function session(
    correctFor: (track: TryoutTrack) => boolean,
    { seed = 7, at = T0 } = {},
  ): Attempt[] {
    return tryoutPlan(makeRng(seed)).map((step, i) =>
      attempt({
        id: `t${String(i).padStart(4, '0')}`,
        at: at + i * MINUTE,
        standardId: step.standardId,
        // The screen records what the generator actually built, not the rung it
        // asked for, so the ladder can only be replayed from the right/wrong
        // flags. Deliberately nothing like the rung, to prove that.
        difficulty: 45,
        correct: correctFor(step.track),
        context: 'tryout',
        latencyMs: 8000,
      }),
    )
  }

  const cardFor = (as: Attempt[]) => {
    const now = lastAt(as)
    return deriveCard(deriveRatings(as, now), as, now)
  }

  const TOP_RUNG = START_DIFFICULTY + 4 * STEP_UP // 77
  const BOTTOM_RUNG = START_DIFFICULTY - 4 * STEP_DOWN // 5, under the floor

  /**
   * A session runs over twenty-four minutes here, so a standard asked early has
   * already rusted a few thousandths of a point by the time the last question is
   * answered. Real and correct — decay runs from `lastSeenAt` — but it means the
   * placement lands just under its rung rather than exactly on it.
   */
  const SESSION_RUST = DECAY_PER_WEEK * ((24 * MINUTE) / WEEK_MS)

  function expectAtRung(value: number, rung: number, label = '') {
    expect(value, label).toBeLessThanOrEqual(rung)
    expect(value, label).toBeGreaterThan(rung - SESSION_RUST - 1e-9)
  }

  it('reaches the rungs the try-out screen itself reaches', () => {
    expect(TOP_RUNG).toBe(77)
    expect(BOTTOM_RUNG).toBe(5)
    expect(BOTTOM_RUNG).toBeLessThan(RATING_FLOOR)
  })

  it('replays exactly the ladder the try-out screen runs', () => {
    // Anti-divergence: play a session through the engine's own state machine and
    // require derive to land on the same rungs. If the screen's ladder ever
    // changes, this fails rather than quietly drifting.
    const correctFor = (track: TryoutTrack) => track === 'NF' || track === 'MD'
    let state = startTryout(7)
    const log: Attempt[] = []
    while (!isComplete(state)) {
      const step = currentStep(state)!
      const correct = correctFor(step.track)
      log.push(
        attempt({
          id: `p${String(log.length).padStart(4, '0')}`,
          at: T0 + log.length * MINUTE,
          standardId: step.standardId,
          difficulty: currentDifficulty(state),
          correct,
          context: 'tryout',
        }),
      )
      state = recordAnswer(state, correct)
    }

    const ratings = deriveRatings(log, lastAt(log))
    for (const id of RATED_STANDARD_IDS) {
      expectAtRung(ratings.get(id)!.rating, Math.max(RATING_FLOOR, state.ladder[trackFor(id)]), id)
    }
  })

  it('seeds every domain stat at the top rung for an all-correct try-out', () => {
    const card = cardFor(session(() => true))
    for (const stat of ['SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as CardStat[]) {
      expectAtRung(card[stat], TOP_RUNG, stat)
    }
  })

  it('seeds every domain stat at the hard floor for an all-wrong try-out', () => {
    const card = cardFor(session(() => false))
    for (const stat of ['SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as CardStat[]) {
      expect(card[stat], stat).toBe(RATING_FLOOR)
    }
  })

  it('holds the floor at 20 even though the ladder bottoms out at 5', () => {
    const ratings = deriveRatings(session(() => false), T0 + 24 * MINUTE)
    for (const r of ratings.values()) {
      expect(r.rating, r.standardId).toBe(RATING_FLOOR)
    }
  })

  it('opens at least forty points of overall between an all-correct and an all-wrong session', () => {
    const strong = deriveOverall(cardFor(session(() => true)))
    const weak = deriveOverall(cardFor(session(() => false)))
    expect(strong - weak).toBeGreaterThanOrEqual(40)
  })

  // The acceptance test. Before this change the gap was five points.
  it('opens at least forty points between DRI and SHO for a fractions-only session', () => {
    const card = cardFor(session((track) => track === 'NF'))
    expect(card.DRI - card.SHO).toBeGreaterThanOrEqual(40)
    expectAtRung(card.DRI, TOP_RUNG)
    expect(card.SHO).toBe(RATING_FLOOR)
  })

  it('separates every domain the child was actually separated on', () => {
    const card = cardFor(session((track) => track === 'NF' || track === 'G'))
    for (const strong of ['DRI', 'SHO'] as CardStat[]) {
      for (const weak of ['PAS', 'DEF', 'PHY'] as CardStat[]) {
        expect(card[strong] - card[weak], `${strong} vs ${weak}`).toBeGreaterThanOrEqual(40)
      }
    }
  })

  it('counts try-out questions as attempts, so the card shows them at all', () => {
    const ratings = deriveRatings(session(() => true), T0 + 24 * MINUTE)
    for (const id of RATED_STANDARD_IDS) {
      expect(ratings.get(id)!.attempts, id).toBeGreaterThanOrEqual(1)
      expect(ratings.get(id)!.lastSeenAt, id).not.toBeNull()
    }
  })

  it('still applies normal Elo on top of the seed, from the seed and not from fifty', () => {
    const tryout = session(() => true)
    const seeded = deriveRatings(tryout, lastAt(tryout)).get('MT.4.NF.1')!
    expectAtRung(seeded.rating, TOP_RUNG)
    // Four NF standards share four NF questions, so this one was asked once.
    expect(seeded.attempts).toBe(1)
    // The walk itself is never decayed — only what is displayed from it is —
    // so the seed this new attempt actually steps from is exactly the rung,
    // regardless of where in the session NF.1 happened to be asked.
    expect(seeded.ratingClean).toBe(TOP_RUNG)

    const newAttemptAt = lastAt(tryout) + MINUTE
    const after = [
      ...tryout,
      attempt({
        standardId: 'MT.4.NF.1',
        at: newAttemptAt,
        difficulty: 60,
        correct: false,
        context: 'match',
      }),
    ]
    // What the *displayed* number stood at the instant before this attempt —
    // asked of the code rather than hand-derived, since it depends on exactly
    // how long ago NF.1's own last tryout question was, which this test does
    // not otherwise pin down. It will be within a whisker of TOP_RUNG either
    // way; the point of asking rather than assuming is that this attempt is a
    // miss, so it is never boosted, and the update has to start from exactly
    // where the walk actually was.
    const before = deriveRatings(tryout, newAttemptAt).get('MT.4.NF.1')!.rating
    expect(ratingOf(after, 'MT.4.NF.1')).toBeCloseTo(updateRating(before, 60, false, K_MATCH / 2), 10)
  })

  it('leaves a domain the try-out never covered on the old rules', () => {
    // A session that only ever asked about fractions — an aborted one.
    const partial = Array.from({ length: 4 }, (_, i) =>
      attempt({
        id: `q${i}`,
        at: T0 + i * MINUTE,
        standardId: 'MT.4.NF.1',
        difficulty: 45,
        correct: true,
        context: 'tryout',
      }),
    )
    const ratings = deriveRatings(partial, lastAt(partial))
    expectAtRung(ratings.get('MT.4.NF.1')!.rating, TOP_RUNG)
    // Geometry and place value were never asked, so they keep the plain seed.
    expect(ratings.get('MT.4.G.1')!.rating).toBe(SEED_RATING)
    expect(ratings.get('MT.4.NBT.4')!.rating).toBe(SEED_RATING)
  })

  it('does not regress domain-average seeding in an untouched domain', () => {
    const partial = Array.from({ length: 4 }, (_, i) =>
      attempt({
        id: `q${i}`,
        at: T0 + i * MINUTE,
        standardId: 'MT.4.NF.1',
        difficulty: 45,
        correct: true,
        context: 'tryout',
      }),
    )
    // NBT was never in the try-out, but he has since built history in NBT.5.
    // Same timestamp throughout: this checks NBT.4's seed against NBT.5's
    // exact rating, and real gaps between NBT.5's own attempts would rust it
    // internally by a few thousandths — a real effect, but not one this test
    // is about.
    const nbt = Array.from({ length: 12 }, () =>
      attempt({
        standardId: 'MT.4.NBT.5',
        at: lastAt(partial) + MINUTE,
        difficulty: 75,
        correct: true,
        context: 'match',
      }),
    )
    const all = [...partial, ...nbt]
    const ratings = deriveRatings(all, lastAt(all))
    const known = ratings.get('MT.4.NBT.5')!.rating
    expect(known).toBeGreaterThan(65)
    // A newly taught NBT standard still seeds at the domain average, not at 50.
    expect(ratings.get('MT.4.NBT.4')!.rating).toBeCloseTo(known, 10)
  })

  it('is unaffected by the order the session arrives in', () => {
    const as = session((track) => track === 'NF')
    const now = lastAt(as)
    expect(plain(deriveRatings(shuffle(as), now))).toEqual(plain(deriveRatings(as, now)))
  })

  it('decays a try-out placement like any other rating', () => {
    const as = session(() => true)
    const fresh = ratingOf(as, 'MT.4.G.1')
    expect(ratingOf(as, 'MT.4.G.1', lastAt(as) + 3 * WEEK_MS)).toBeCloseTo(
      fresh - 3 * DECAY_PER_WEEK,
      6,
    )
  })
})

describe('deriveRatings — determinism', () => {
  const mixed = [
    ...run(12, { standardId: 'MT.4.NF.1', difficulty: 60, correct: true, context: 'match' }),
    ...Array.from({ length: 9 }, (_, i) =>
      attempt({
        standardId: 'MT.4.NBT.5',
        at: T0 + (20 + i) * MINUTE,
        difficulty: 40,
        correct: i % 3 !== 0,
        context: 'training',
      }),
    ),
    ...Array.from({ length: 7 }, (_, i) =>
      attempt({
        standardId: 'MT.4.NF.2',
        at: T0 + (40 + i) * MINUTE,
        difficulty: 70,
        correct: i % 2 === 0,
        context: 'penalty',
      }),
    ),
  ]
  const now = lastAt(mixed) + 2 * WEEK_MS

  it('derives the same result from the same log twice', () => {
    expect(plain(deriveRatings(mixed, now))).toEqual(plain(deriveRatings(mixed, now)))
  })

  it('derives the same result from a shuffled log, because it sorts by time', () => {
    expect(plain(deriveRatings(shuffle(mixed), now))).toEqual(plain(deriveRatings(mixed, now)))
    expect(plain(deriveRatings(shuffle(mixed, 999), now))).toEqual(plain(deriveRatings(mixed, now)))
  })

  it('does not mutate the array it was handed', () => {
    const input = shuffle(mixed)
    const before = input.map((a) => a.id)
    deriveRatings(input, now)
    expect(input.map((a) => a.id)).toEqual(before)
  })

  it('breaks ties on identical timestamps deterministically', () => {
    const tied = [
      attempt({ id: 'z', at: T0, difficulty: 90, correct: true, context: 'match' }),
      attempt({ id: 'a', at: T0, difficulty: 10, correct: false, context: 'match' }),
    ]
    expect(ratingOf(tied, 'MT.4.NF.1')).toBe(ratingOf([...tied].reverse(), 'MT.4.NF.1'))
  })
})

// ---------------------------------------------------------------------------

describe('deriveCard — the five domain stats', () => {
  it('gives a brand-new player fifty across the board', () => {
    const card = deriveCard(deriveRatings([], T0), [], T0)
    for (const stat of ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as CardStat[]) {
      expect(card[stat]).toBe(SEED_RATING)
    }
  })

  it('equals the mean of its domain’s attempted standards', () => {
    const as = [
      ...run(20, { standardId: 'MT.4.NF.1', difficulty: 85, correct: true, context: 'match' }),
      ...Array.from({ length: 20 }, (_, i) =>
        attempt({
          standardId: 'MT.4.NF.2',
          at: T0 + (30 + i) * MINUTE,
          difficulty: 20,
          correct: false,
          context: 'match',
        }),
      ),
    ]
    const now = lastAt(as)
    const ratings = deriveRatings(as, now)
    const expected =
      (ratings.get('MT.4.NF.1')!.rating + ratings.get('MT.4.NF.2')!.rating) / 2
    expect(deriveCard(ratings, as, now).DRI).toBeCloseTo(expected, 10)
  })

  it('ignores untouched standards rather than counting them as fifty', () => {
    const as = run(20, { standardId: 'MT.4.NF.1', difficulty: 85, correct: true, context: 'match' })
    const now = lastAt(as)
    const ratings = deriveRatings(as, now)
    // Three of the four NF standards are untouched; if they counted, DRI would
    // sit near 50 rather than near NF.1.
    expect(deriveCard(ratings, as, now).DRI).toBeCloseTo(ratings.get('MT.4.NF.1')!.rating, 10)
  })

  it('holds a domain with no history at the seed', () => {
    const as = run(20, { standardId: 'MT.4.NF.1', difficulty: 85, correct: true, context: 'match' })
    const now = lastAt(as)
    const card = deriveCard(deriveRatings(as, now), as, now)
    expect(card.SHO).toBe(SEED_RATING)
    expect(card.DEF).toBe(SEED_RATING)
  })

  it('maps each domain onto the stat the curriculum says it drives', () => {
    expect(DOMAIN_TO_STAT.NF).toBe('DRI')
    expect(DOMAIN_TO_STAT.OA).toBe('PAS')
    expect(DOMAIN_TO_STAT.NBT).toBe('DEF')
    expect(DOMAIN_TO_STAT.MD).toBe('PHY')
    expect(DOMAIN_TO_STAT.G).toBe('SHO')
  })

  it('does not drop the stat when a newly taught standard appears', () => {
    const history = run(12, {
      standardId: 'MT.4.NF.1',
      difficulty: 75,
      correct: true,
      context: 'match',
    })
    const debut = attempt({
      standardId: 'MT.4.NF.2',
      at: lastAt(history) + MINUTE,
      difficulty: 50,
      correct: true,
      context: 'training',
    })
    const all = [...history, debut]
    // Both read at the same instant, so the only difference between them is the
    // arrival of the new standard rather than a minute of rust on the old one.
    const now = lastAt(all)
    const before = deriveCard(deriveRatings(history, now), history, now).DRI
    const after = deriveCard(deriveRatings(all, now), all, now).DRI

    expect(before).toBeGreaterThan(65)
    expect(before).toBeLessThan(95)
    expect(after).toBeGreaterThanOrEqual(before)
    // Seeding the newcomer at 50 would have dragged DRI down by roughly ten points.
    expect(before - after).toBeLessThan(0.5)
  })
})

describe('deriveCard — PAC', () => {
  const fastRun = (n: number, over: Partial<Attempt> = {}) =>
    Array.from({ length: n }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: T0 + i * MINUTE,
        difficulty: 60,
        correct: true,
        latencyMs: 900,
        ...over,
      }),
    )

  const pacOf = (as: Attempt[], now = lastAt(as)) => deriveCard(deriveRatings(as, now), as, now).PAC

  it('rises from fast correct answers', () => {
    expect(pacOf(fastRun(20))).toBeGreaterThan(SEED_RATING + 1)
  })

  it('rises further the faster the answer comes back', () => {
    const quick = pacOf(fastRun(10, { latencyMs: 500 }))
    const merely = pacOf(fastRun(10, { latencyMs: expectedLatencyMs(60) * 0.9 }))
    expect(quick).toBeGreaterThan(merely)
    expect(merely).toBeGreaterThan(SEED_RATING)
  })

  it('does not move at all for a correct answer at exactly the expected time', () => {
    expect(pacOf(fastRun(30, { latencyMs: expectedLatencyMs(60) }))).toBe(SEED_RATING)
  })

  it('does not move at all for a single slow correct answer', () => {
    expect(pacOf(fastRun(1, { latencyMs: 60_000 }))).toBe(SEED_RATING)
  })

  it('is never lowered by a hundred correct-but-slow answers in a row', () => {
    const fast = fastRun(20)
    const raised = pacOf(fast)
    expect(raised).toBeGreaterThan(SEED_RATING)

    const slow = Array.from({ length: 100 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: lastAt(fast) + (i + 1) * MINUTE,
        difficulty: 60,
        correct: true,
        latencyMs: 90_000,
      }),
    )
    // Exact equality, not "close to": slowness must cost literally nothing.
    expect(pacOf([...fast, ...slow])).toBe(raised)
  })

  it('is never lowered by slow answers on any standard, in any context', () => {
    const fast = fastRun(20)
    const raised = pacOf(fast)
    const contexts: AttemptContext[] = ['tryout', 'training', 'match', 'tackleback', 'penalty']
    const slow = RATED_STANDARD_IDS.flatMap((standardId, si) =>
      contexts.map((context, ci) =>
        attempt({
          standardId,
          context,
          at: lastAt(fast) + (si * contexts.length + ci + 1) * MINUTE,
          difficulty: 30,
          correct: true,
          latencyMs: 600_000,
        }),
      ),
    )
    expect(pacOf([...fast, ...slow])).toBe(raised)
  })

  it('never falls at any point along a mixed fast-and-slow history', () => {
    const mixed = Array.from({ length: 120 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: T0 + i * MINUTE,
        difficulty: 40 + (i % 50),
        correct: i % 4 !== 0,
        latencyMs: i % 3 === 0 ? 700 : 45_000,
      }),
    )
    let previous = SEED_RATING
    for (let n = 1; n <= mixed.length; n++) {
      const prefix = mixed.slice(0, n)
      // Each prefix read at the moment of its own last attempt, so decay is
      // zero throughout and a fall could only come from the update rule.
      const now = lastAt(prefix)
      const pac = deriveCard(deriveRatings(prefix, now), prefix, now).PAC
      expect(pac).toBeGreaterThanOrEqual(previous)
      previous = pac
    }
  })

  it('is not moved at all by wrong answers, however fast they were', () => {
    const wrong = Array.from({ length: 50 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: T0 + i * MINUTE,
        difficulty: 80,
        correct: false,
        latencyMs: 200,
      }),
    )
    expect(pacOf(wrong)).toBe(SEED_RATING)
  })

  it('is not moved by wrong answers even once it has been raised', () => {
    const fast = fastRun(20)
    const raised = pacOf(fast)
    const wrong = Array.from({ length: 50 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: lastAt(fast) + (i + 1) * MINUTE,
        difficulty: 90,
        correct: false,
        latencyMs: 150,
      }),
    )
    expect(pacOf([...fast, ...wrong])).toBe(raised)
  })

  it('decays with time like the other stats', () => {
    const fast = fastRun(20)
    const fresh = pacOf(fast)
    expect(pacOf(fast, lastAt(fast) + 3 * WEEK_MS)).toBeCloseTo(fresh - 3 * DECAY_PER_WEEK, 6)
  })

  it('decays from the last time the player played, not the last fast answer', () => {
    const fast = fastRun(20)
    const slow = Array.from({ length: 5 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: lastAt(fast) + 3 * WEEK_MS + i * MINUTE,
        difficulty: 60,
        correct: true,
        latencyMs: 90_000,
      }),
    )
    const all = [...fast, ...slow]
    expect(pacOf(all)).toBe(pacOf(fast))
  })

  it('never decays below the decay floor', () => {
    const fast = fastRun(20)
    expect(pacOf(fast, lastAt(fast) + 500 * WEEK_MS)).toBe(DECAY_FLOOR)
  })

  it('scales the expected time with difficulty, so hard items get longer', () => {
    expect(expectedLatencyMs(80)).toBeGreaterThan(expectedLatencyMs(20))
    expect(expectedLatencyMs(0)).toBeGreaterThan(0)
  })

  it('stays inside the scale', () => {
    const as = Array.from({ length: 3000 }, (_, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: T0 + i * MINUTE,
        difficulty: 99,
        correct: true,
        latencyMs: 1,
      }),
    )
    const pac = pacOf(as)
    expect(pac).toBeLessThanOrEqual(99)
    expect(pac).toBeGreaterThan(90)
  })
})

// ---------------------------------------------------------------------------

describe('deriveOverall', () => {
  it('is the mean of the six stats', () => {
    expect(deriveOverall({ PAC: 60, SHO: 70, PAS: 50, DRI: 40, DEF: 80, PHY: 60 })).toBeCloseTo(
      60,
      10,
    )
  })

  it('is the seed for a brand-new player', () => {
    expect(deriveOverall(deriveCard(deriveRatings([], T0), [], T0))).toBe(SEED_RATING)
  })
})

describe('deriveWorldRank', () => {
  it('puts a brand-new player around sixtieth, with room to climb', () => {
    const rank = deriveWorldRank(SEED_RATING)
    expect(rank).toBeGreaterThan(50)
    expect(rank).toBeLessThanOrEqual(60)
  })

  it('improves as the overall rises', () => {
    let previous = deriveWorldRank(0)
    for (let overall = 1; overall <= 99; overall++) {
      const rank = deriveWorldRank(overall)
      expect(rank).toBeLessThanOrEqual(previous)
      previous = rank
    }
  })

  it('tops out at first in the world', () => {
    expect(deriveWorldRank(99)).toBe(1)
  })

  it('never goes below first or past the bottom of the field', () => {
    for (const overall of [-50, 0, 50, 99, 250]) {
      expect(deriveWorldRank(overall)).toBeGreaterThanOrEqual(1)
      expect(deriveWorldRank(overall)).toBeLessThanOrEqual(60)
    }
  })

  it('returns whole positions', () => {
    expect(Number.isInteger(deriveWorldRank(63.7))).toBe(true)
  })
})

// ---------------------------------------------------------------------------

describe('deriveCourage', () => {
  const shot = (choice: ShotChoice, correct: boolean, i: number) =>
    attempt({ shot: choice, correct, at: T0 + i * MINUTE, context: 'match' })

  it('is all zeroes for an empty log', () => {
    expect(deriveCourage([])).toEqual({
      hardShotsAttempted: 0,
      hardShotsScored: 0,
      tackleBacksWon: 0,
      tackleBacksFaced: 0,
    })
  })

  it('counts a hard shot that missed, because trying it is the point', () => {
    const as = [shot('bicycle', false, 0), shot('outside18', false, 1)]
    const courage = deriveCourage(as)
    expect(courage.hardShotsAttempted).toBe(2)
    expect(courage.hardShotsScored).toBe(0)
  })

  it('counts hard shots that went in as well', () => {
    const as = [shot('bicycle', true, 0), shot('outside18', false, 1), shot('bicycle', true, 2)]
    expect(deriveCourage(as)).toMatchObject({ hardShotsAttempted: 3, hardShotsScored: 2 })
  })

  it('does not count the safe shots as courage', () => {
    const as = [shot('wide', true, 0), shot('box', true, 1), shot('box', false, 2)]
    expect(deriveCourage(as)).toMatchObject({ hardShotsAttempted: 0, hardShotsScored: 0 })
  })

  it('ignores attempts that were not shots at all', () => {
    expect(deriveCourage(run(10)).hardShotsAttempted).toBe(0)
  })

  it('counts tackle-backs faced and won', () => {
    const as = [
      attempt({ context: 'tackleback', correct: true, at: T0 }),
      attempt({ context: 'tackleback', correct: false, at: T0 + MINUTE }),
      attempt({ context: 'tackleback', correct: true, at: T0 + 2 * MINUTE }),
      attempt({ context: 'match', correct: true, at: T0 + 3 * MINUTE }),
    ]
    expect(deriveCourage(as)).toMatchObject({ tackleBacksFaced: 3, tackleBacksWon: 2 })
  })

  it('does not depend on the order of the log', () => {
    const as = [
      shot('bicycle', true, 0),
      shot('outside18', false, 1),
      attempt({ context: 'tackleback', correct: true, at: T0 + 2 * MINUTE }),
      attempt({ context: 'tackleback', correct: false, at: T0 + 3 * MINUTE }),
    ]
    expect(deriveCourage(shuffle(as))).toEqual(deriveCourage(as))
  })
})

// ---------------------------------------------------------------------------

/**
 * The log is about to become persisted JSON (Task 10). A fuzz over corrupt logs
 * found that a non-finite `difficulty` produced a `NaN` rating, which defeated
 * the floor silently and poisoned every stat downstream. These pin the fix.
 */
describe('a corrupt log cannot break the invariants', () => {
  const NASTY = [NaN, Infinity, -Infinity, -1000, -1, 0, 99, 100, 1e9]

  it('keeps every rating finite and inside the floor and the ceiling', () => {
    const log = NASTY.flatMap((difficulty, di) =>
      NASTY.map((latencyMs, li) =>
        attempt({
          standardId: 'MT.4.NF.1',
          at: T0 + (di * NASTY.length + li) * MINUTE,
          difficulty,
          latencyMs,
          correct: (di + li) % 3 !== 0,
          context: 'match',
        }),
      ),
    )
    for (const now of [T0, lastAt(log), lastAt(log) + 400 * WEEK_MS, NaN]) {
      for (const r of deriveRatings(log, now).values()) {
        expect(Number.isFinite(r.rating)).toBe(true)
        expect(r.rating).toBeGreaterThanOrEqual(RATING_FLOOR)
        expect(r.rating).toBeLessThanOrEqual(99)
      }
    }
  })

  it('keeps every card stat finite, so one bad row cannot erase the card', () => {
    const log = NASTY.map((difficulty, i) =>
      attempt({
        standardId: 'FLU.MULT',
        at: T0 + i * MINUTE,
        difficulty,
        latencyMs: NaN,
        correct: true,
      }),
    )
    const now = lastAt(log)
    const card = deriveCard(deriveRatings(log, now), log, now)
    for (const stat of ['PAC', 'SHO', 'PAS', 'DRI', 'DEF', 'PHY'] as CardStat[]) {
      expect(Number.isFinite(card[stat])).toBe(true)
      expect(card[stat]).toBeGreaterThanOrEqual(RATING_FLOOR)
    }
    expect(card.PAC).toBe(SEED_RATING)
  })

  it('does not decay when the caller hands it a nonsense now', () => {
    const as = run(20, { difficulty: 85, correct: true, context: 'match' })
    expect(ratingOf(as, 'MT.4.NF.1', NaN)).toBe(ratingOf(as, 'MT.4.NF.1'))
  })

  it('does not run decay backwards when now is before the last attempt', () => {
    const as = run(20, { difficulty: 85, correct: true, context: 'match' })
    expect(ratingOf(as, 'MT.4.NF.1', T0 - 100 * WEEK_MS)).toBe(ratingOf(as, 'MT.4.NF.1'))
  })
})

// ---------------------------------------------------------------------------

describe('performance', () => {
  it('derives a year of play fast enough to run on every render', () => {
    const contexts: AttemptContext[] = ['tryout', 'training', 'match', 'tackleback', 'penalty']
    const shots: ShotChoice[] = ['wide', 'box', 'outside18', 'bicycle']
    const log = Array.from({ length: 20_000 }, (_, i) =>
      attempt({
        standardId: RATED_STANDARD_IDS[i % RATED_STANDARD_IDS.length]!,
        at: T0 + i * MINUTE,
        difficulty: 20 + (i % 70),
        correct: i % 5 !== 0,
        latencyMs: 500 + ((i * 137) % 20_000),
        context: contexts[i % contexts.length]!,
        shot: i % 3 === 0 ? shots[i % shots.length] : undefined,
      }),
    )
    const now = lastAt(log) + WEEK_MS
    const shuffled = shuffle(log)

    const started = performance.now()
    const ratings = deriveRatings(shuffled, now)
    const card = deriveCard(ratings, shuffled, now)
    deriveOverall(card)
    deriveWorldRank(deriveOverall(card))
    deriveCourage(shuffled)
    const elapsed = performance.now() - started

    console.log(`derive over 20,000 attempts: ${elapsed.toFixed(1)}ms`)
    expect(elapsed).toBeLessThan(250)
  })

  it('derives the same answer from twenty thousand shuffled attempts', () => {
    const log = Array.from({ length: 20_000 }, (_, i) =>
      attempt({
        standardId: RATED_STANDARD_IDS[i % RATED_STANDARD_IDS.length]!,
        at: T0 + i * MINUTE,
        difficulty: 20 + (i % 70),
        correct: i % 5 !== 0,
        latencyMs: 500 + ((i * 137) % 20_000),
      }),
    )
    const now = lastAt(log) + WEEK_MS
    expect(plain(deriveRatings(shuffle(log), now))).toEqual(plain(deriveRatings(log, now)))
  })
})

describe('choices in the log', () => {
  const run = (n: number, choices?: number): Attempt[] =>
    Array.from({ length: n }, (_, i) => ({
      id: `c-${String(i).padStart(3, '0')}`,
      at: 1_000 + i * 1_000,
      standardId: 'FLU.MULT',
      difficulty: 50,
      params: {},
      given: 'x',
      correct: true,
      latencyMs: 4000,
      context: 'training' as const,
      ...(choices === undefined ? {} : { choices }),
    }))

  const NOW = 1_000 + 40 * 1_000
  const ratingOf = (log: Attempt[]) => deriveRatings(log, NOW).get('FLU.MULT')!.rating

  it('rates a run of choices below the same run of typed answers', () => {
    // Measured: 68.94 typed, 65.98 four-option, 62.21 true/false over 30 right
    // answers at difficulty 50. Ordered, and none of them pinned at a ceiling.
    const typed = ratingOf(run(30))
    const four = ratingOf(run(30, 4))
    const coin = ratingOf(run(30, 2))

    expect(typed).toBeGreaterThan(four)
    expect(four).toBeGreaterThan(coin)
    expect(typed).toBeLessThan(99)
  })

  it('leaves an attempt with no choices field exactly where it was', () => {
    // The compatibility guarantee. Every attempt in Rion's save predates this
    // and must derive to the same number it did before.
    expect(ratingOf(run(20))).toBe(ratingOf(run(20, undefined)))
  })

  it('ignores a choices count that cannot be real', () => {
    // `floorFor`'s rails, from the outside. One option would make the expected
    // score 1 and every answer a disappointment; zero divides by zero.
    const sane = ratingOf(run(20))
    for (const bad of [1, 0, -3, Number.NaN, Number.POSITIVE_INFINITY]) {
      expect(ratingOf(run(20, bad)), `choices ${bad}`).toBe(sane)
    }
  })

  it('still floors and never returns a non-finite rating', () => {
    const wild = run(10, 2).map((a, i) => ({ ...a, correct: i % 2 === 0 }))
    const rating = ratingOf(wild)
    expect(Number.isFinite(rating)).toBe(true)
    expect(rating).toBeGreaterThanOrEqual(RATING_FLOOR)
  })
})
