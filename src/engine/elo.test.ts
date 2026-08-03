import { describe, expect, it } from 'vitest'
import { expectedScore, updateRating, difficultyForSuccess, K_TRAINING, K_MATCH, SPREAD } from './elo'

describe('expectedScore', () => {
  it('is 0.5 when rating equals difficulty', () => {
    expect(expectedScore(50, 50)).toBeCloseTo(0.5, 5)
  })
  it('rises as the item gets easier', () => {
    expect(expectedScore(50, 25)).toBeGreaterThan(0.9)
  })
  it('falls as the item gets harder', () => {
    expect(expectedScore(50, 75)).toBeLessThan(0.1)
  })
})

describe('difficultyForSuccess', () => {
  it('returns a difficulty about 12 below rating for p=0.75', () => {
    expect(difficultyForSuccess(50, 0.75)).toBeCloseTo(38.1, 1)
  })
  it('round-trips through expectedScore', () => {
    for (const p of [0.5, 0.62, 0.68, 0.75, 0.85]) {
      const d = difficultyForSuccess(60, p)
      expect(expectedScore(60, d)).toBeCloseTo(p, 5)
    }
  })
  it('clamps into range', () => {
    expect(difficultyForSuccess(2, 0.85)).toBeGreaterThanOrEqual(0)
    expect(difficultyForSuccess(97, 0.2)).toBeLessThanOrEqual(99)
  })
})

describe('updateRating', () => {
  it('barely moves when an easy item is answered correctly', () => {
    const before = 60
    const after = updateRating(before, 30, true, K_TRAINING)
    expect(after - before).toBeLessThan(0.3)
  })

  it('moves substantially when a hard item is answered correctly', () => {
    const before = 60
    const after = updateRating(before, 85, true, K_MATCH)
    expect(after - before).toBeGreaterThan(5)
  })

  it('drops sharply when an easy item is missed', () => {
    const before = 60
    const after = updateRating(before, 30, false, K_MATCH)
    expect(before - after).toBeGreaterThan(6)
  })

  it('weights matches about 3x training', () => {
    const t = updateRating(50, 50, true, K_TRAINING) - 50
    const m = updateRating(50, 50, true, K_MATCH) - 50
    expect(m / t).toBeCloseTo(3, 1)
  })

  it('clamps to 0..99', () => {
    expect(updateRating(0.1, 99, false, K_MATCH)).toBeGreaterThanOrEqual(0)
    expect(updateRating(98.9, 0, true, K_MATCH)).toBeLessThanOrEqual(99)
  })

  // Easy-grinding is blocked by making it a terrible trade, not by capping the total.
  //
  // The plan for this module asked for "200 easy items yields under 3 points". That
  // threshold is not reachable with SPREAD=25: an item 35 points below rating has
  // expected score 0.962, so one correct answer moves 0.096 and 200 of them move
  // 11.17. Getting the 200-item total under 3 needs SPREAD <= ~15, which contradicts
  // both the documented 91/9 odds across a 25-point gap and difficultyForSuccess(50,
  // 0.75) ~ 38.1. A search over SPREAD and K found no combination satisfying the
  // "under 3" bound and the rest of this file at once. The tests below assert what
  // Elo actually guarantees, which is the property the design doc is really after.
  it('makes grinding easy items a bad trade against honest practice', () => {
    let ground = 60
    for (let i = 0; i < 200; i++) ground = updateRating(ground, 25, true, K_TRAINING)

    // The same gain, from items served at the game's own 0.75 target.
    let honest = 60
    let items = 0
    while (honest - 60 < ground - 60 && items < 1000) {
      honest = updateRating(honest, difficultyForSuccess(honest, 0.75), true, K_TRAINING)
      items++
    }

    // 200 easy reps buy what fewer than 20 properly-pitched ones would: a 10x tax.
    expect(items).toBeLessThan(20)
    expect(ground - 60).toBeLessThan(12)
  })

  it('yields less per item the further the item is below the rating', () => {
    const at = updateRating(60, 60, true, K_TRAINING) - 60
    const below25 = updateRating(60, 35, true, K_TRAINING) - 60
    const below35 = updateRating(60, 25, true, K_TRAINING) - 60

    expect(at).toBeGreaterThan(below25)
    expect(below25).toBeGreaterThan(below35)
    expect(below35).toBeLessThan(0.1)
  })

  it('pays less for each successive easy answer as the rating pulls away', () => {
    const first = updateRating(60, 25, true, K_TRAINING) - 60
    let r = 60
    for (let i = 0; i < 200; i++) r = updateRating(r, 25, true, K_TRAINING)
    const last = updateRating(r, 25, true, K_TRAINING) - r

    expect(last).toBeLessThan(first)
  })
})

describe('SPREAD', () => {
  it('gives roughly 91/9 odds across a 25-point gap', () => {
    expect(SPREAD).toBe(25)
    expect(expectedScore(50, 50 - SPREAD)).toBeCloseTo(0.909, 3)
    expect(expectedScore(50, 50 + SPREAD)).toBeCloseTo(0.091, 3)
  })
})

describe('difficultyForSuccess at the ends of the scale', () => {
  it('saturates rather than round-tripping for a beginner', () => {
    const d = difficultyForSuccess(5, 0.85)
    expect(d).toBe(0)
    expect(expectedScore(5, d)).toBeCloseTo(0.613, 3)
    expect(expectedScore(5, d)).toBeLessThan(0.85)
  })

  it('saturates rather than round-tripping at the top of the scale', () => {
    const d = difficultyForSuccess(95, 0.38)
    expect(d).toBe(99)
    expect(expectedScore(95, d)).toBeCloseTo(0.409, 3)
    expect(expectedScore(95, d)).toBeGreaterThan(0.38)
  })

  it('round-trips everywhere the clamp does not bite', () => {
    for (const rating of [15, 30, 50, 70, 90]) {
      const d = difficultyForSuccess(rating, 0.75)
      expect(d).toBeGreaterThan(0)
      expect(d).toBeLessThan(99)
      expect(expectedScore(rating, d)).toBeCloseTo(0.75, 5)
    }
  })
})

describe('updateRating invariants', () => {
  it('is monotonic in outcome across the whole grid', () => {
    for (let rating = 0; rating <= 99; rating += 7) {
      for (let difficulty = 0; difficulty <= 99; difficulty += 7) {
        for (const k of [K_TRAINING, K_MATCH]) {
          expect(updateRating(rating, difficulty, true, k)).toBeGreaterThanOrEqual(rating)
          expect(updateRating(rating, difficulty, false, k)).toBeLessThanOrEqual(rating)
        }
      }
    }
  })

  it('moves by exactly k/2 for a correct answer at rating == difficulty', () => {
    for (const rating of [20, 50, 60, 90]) {
      for (const k of [K_TRAINING, K_MATCH]) {
        expect(updateRating(rating, rating, true, k) - rating).toBe(k / 2)
      }
    }
  })

  it('gains and losses at the same item sum to k', () => {
    for (let rating = 20; rating <= 80; rating += 7) {
      for (let difficulty = 10; difficulty <= 90; difficulty += 7) {
        for (const k of [K_TRAINING, K_MATCH]) {
          const gain = updateRating(rating, difficulty, true, k) - rating
          const loss = rating - updateRating(rating, difficulty, false, k)
          expect(gain + loss).toBeCloseTo(k, 12)
        }
      }
    }
  })

  it('never produces a non-finite value', () => {
    const probabilities = [-0.5, 0, 0.01, 0.25, 0.5, 0.75, 0.99, 1, 1.5]
    for (let rating = 0; rating <= 99; rating++) {
      for (const p of probabilities) {
        const d = difficultyForSuccess(rating, p)
        expect(Number.isFinite(d)).toBe(true)
        expect(d).toBeGreaterThanOrEqual(0)
        expect(d).toBeLessThanOrEqual(99)
      }
      for (let difficulty = 0; difficulty <= 99; difficulty++) {
        expect(Number.isFinite(expectedScore(rating, difficulty))).toBe(true)
        for (const k of [K_TRAINING, K_MATCH]) {
          for (const correct of [true, false]) {
            const next = updateRating(rating, difficulty, correct, k)
            expect(Number.isFinite(next)).toBe(true)
            expect(next).toBeGreaterThanOrEqual(0)
            expect(next).toBeLessThanOrEqual(99)
          }
        }
      }
    }
  })
})
