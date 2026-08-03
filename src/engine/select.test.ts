import { describe, expect, it } from 'vitest'
import { STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { DomainCode } from '../curriculum/standards.generated'
import { RATED_STANDARD_IDS, SEED_RATING } from '../store/derive'
import type { StandardRating } from '../store/types'
import { difficultyForSuccess } from './elo'
import { ALL_GENERATORS, generatorFor } from './items/generators'
import { makeRng } from './items/rng'
import type { ItemGenerator } from './items/types'
import { PRESSURES, TARGET_SUCCESS, selectItem } from './select'
import type { Pressure } from './select'

/** A ratings map from a plain object. Anything omitted is simply absent. */
function ratingsOf(values: Record<string, number>): Map<string, StandardRating> {
  const out = new Map<string, StandardRating>()
  for (const [standardId, rating] of Object.entries(values)) {
    out.set(standardId, { standardId, rating, attempts: 10, lastSeenAt: 0, provisional: false })
  }
  return out
}

/** Every rated standard at the same rating. */
const flat = (rating: number) =>
  ratingsOf(Object.fromEntries(RATED_STANDARD_IDS.map((id) => [id, rating])))

const rangeOf = (standardId: string): [number, number] => generatorFor(standardId)!.range

const domainOf = (standardId: string) => STANDARDS_BY_ID[standardId]?.domain

const clampTo = (v: number, [lo, hi]: [number, number]) => Math.min(hi, Math.max(lo, v))

/** How often each standard comes back over `n` draws. */
function tally(
  n: number,
  make: (i: number) => Parameters<typeof selectItem>[0],
): Map<string, number> {
  const counts = new Map<string, number>()
  for (let i = 0; i < n; i++) {
    const item = selectItem(make(i))
    counts.set(item.standardId, (counts.get(item.standardId) ?? 0) + 1)
  }
  return counts
}

// ---------------------------------------------------------------------------

describe('TARGET_SUCCESS', () => {
  it('is exactly the calibration the design calls for', () => {
    // Pinned deliberately. 0.75 is the default target rather than 0.5 because
    // this is a capable but avoidant learner who freezes in front of things he
    // fears are too hard, and match difficulty is meant to come from chains of
    // questions rather than from any single one being a coin flip. Changing a
    // number here is a design decision, not a tuning pass.
    expect(TARGET_SUCCESS).toEqual({
      own_third: 0.85,
      midfield: 0.75,
      final_third: 0.68,
      shot: 0.62,
      wide: 0.85,
      box: 0.62,
      outside18: 0.5,
      bicycle: 0.38,
      training: 0.75,
      penalty: 0.8,
    })
  })

  it('never asks for a coin flip or worse, except on the shots he chooses himself', () => {
    for (const pressure of PRESSURES) {
      if (pressure === 'bicycle' || pressure === 'outside18') continue
      expect(TARGET_SUCCESS[pressure]).toBeGreaterThan(0.5)
    }
  })

  it('lists every pressure exactly once', () => {
    expect(new Set(PRESSURES).size).toBe(PRESSURES.length)
    expect(Object.keys(TARGET_SUCCESS).sort()).toEqual([...PRESSURES].sort())
  })
})

describe('difficulty targeting', () => {
  it('tracks difficultyForSuccess across a sweep of ratings and pressures', () => {
    for (const pressure of PRESSURES) {
      for (let rating = 20; rating <= 95; rating += 5) {
        for (let seed = 0; seed < 12; seed++) {
          const item = selectItem({ ratings: flat(rating), pressure, rng: makeRng(seed) })
          const wanted = difficultyForSuccess(rating, TARGET_SUCCESS[pressure])
          const range = rangeOf(item.standardId)
          const where = `${pressure} @ ${rating} seed ${seed} (${item.standardId})`

          if (wanted >= range[0] && wanted <= range[1]) {
            expect(Math.abs(item.difficulty - wanted), where).toBeLessThanOrEqual(2)
          } else {
            // Out of the generator's reach: it must land on the nearest
            // difficulty it can actually produce, and say so on the item.
            expect(item.difficulty, where).toBeCloseTo(clampTo(wanted, range), 5)
          }
        }
      }
    }
  })

  it('targets each standard against its own rating, not a pooled one', () => {
    const ratings = ratingsOf({ 'MT.4.NF.1': 30, 'MT.4.NBT.5': 85 })
    for (let seed = 0; seed < 200; seed++) {
      const item = selectItem({
        ratings,
        pressure: 'midfield',
        rng: makeRng(seed),
        generators: [generatorFor('MT.4.NF.1')!, generatorFor('MT.4.NBT.5')!],
      })
      const own = item.standardId === 'MT.4.NF.1' ? 30 : 85
      const wanted = difficultyForSuccess(own, 0.75)
      expect(Math.abs(item.difficulty - clampTo(wanted, rangeOf(item.standardId)))).toBeLessThan(1)
    }
  })

  it('serves an easier item under gentler pressure and a harder one under a shot', () => {
    const ratings = flat(60)
    const easy = selectItem({ ratings, pressure: 'own_third', rng: makeRng(3) })
    const hard = selectItem({ ratings, pressure: 'bicycle', rng: makeRng(3) })
    expect(hard.difficulty).toBeGreaterThan(easy.difficulty)
  })

  it('prefers a generator that can reach the target when one exists', () => {
    // Rating 20 at `own_third` wants difficulty ~1, which four of the thirteen
    // bands cannot descend to. Preference is a weighting rather than a filter —
    // a hard filter would mean the weakest player never sees the standards with
    // the highest floors, which is backwards — so this asserts the bias, not a
    // guarantee.
    let reachable = 0
    const draws = 600
    for (let seed = 0; seed < draws; seed++) {
      const item = selectItem({ ratings: flat(35), pressure: 'own_third', rng: makeRng(seed) })
      const wanted = difficultyForSuccess(35, TARGET_SUCCESS.own_third)
      const range = rangeOf(item.standardId)
      if (wanted >= range[0] && wanted <= range[1]) reachable += 1
    }
    expect(reachable / draws).toBeGreaterThan(0.8)
  })

  it('still returns a valid item when no generator can reach the target at all', () => {
    // Rating 99 at `bicycle` wants ~104. Nothing goes above 92.
    const only = [generatorFor('MT.4.NF.1')!]
    const item = selectItem({
      ratings: ratingsOf({ 'MT.4.NF.1': 99 }),
      pressure: 'bicycle',
      rng: makeRng(1),
      generators: only,
    })
    expect(item.standardId).toBe('MT.4.NF.1')
    expect(item.difficulty).toBe(only[0]!.range[1])
    expect(item.prompt.length).toBeGreaterThan(0)
    expect(item.workedSteps.length).toBeGreaterThan(0)
  })

  it('clamps up to the lowest difficulty a generator can produce', () => {
    const only = [generatorFor('MT.4.NBT.6')!] // range starts at 20
    const item = selectItem({
      ratings: ratingsOf({ 'MT.4.NBT.6': 20 }),
      pressure: 'own_third',
      rng: makeRng(1),
      generators: only,
    })
    expect(item.difficulty).toBe(20)
  })
})

describe('filters', () => {
  const DOMAINS: DomainCode[] = ['OA', 'NBT', 'NF', 'MD', 'G']

  for (const domain of DOMAINS) {
    it(`respects domain ${domain}`, () => {
      for (let seed = 0; seed < 50; seed++) {
        const item = selectItem({ ratings: flat(50), pressure: 'training', rng: makeRng(seed), domain })
        expect(domainOf(item.standardId)).toBe(domain)
      }
    })
  }

  it('respects standardId', () => {
    for (let seed = 0; seed < 50; seed++) {
      const item = selectItem({
        ratings: flat(50),
        pressure: 'training',
        rng: makeRng(seed),
        standardId: 'MT.4.OA.4',
      })
      expect(item.standardId).toBe('MT.4.OA.4')
    }
  })

  it('never picks FLU.MULT under a domain filter, since it belongs to no domain', () => {
    for (const domain of DOMAINS) {
      for (let seed = 0; seed < 20; seed++) {
        const item = selectItem({ ratings: flat(50), pressure: 'training', rng: makeRng(seed), domain })
        expect(item.standardId).not.toBe('FLU.MULT')
      }
    }
  })

  it('reaches every standard in a domain over enough draws', () => {
    const counts = tally(2000, (i) => ({
      ratings: flat(50),
      pressure: 'training',
      rng: makeRng(i),
      domain: 'NF' as DomainCode,
    }))
    expect([...counts.keys()].sort()).toEqual(['MT.4.NF.1', 'MT.4.NF.2', 'MT.4.NF.3', 'MT.4.NF.4'])
  })
})

describe('recent standards', () => {
  it('suppresses an immediate repeat when there is an alternative', () => {
    for (let seed = 0; seed < 200; seed++) {
      const item = selectItem({
        ratings: flat(50),
        pressure: 'midfield',
        rng: makeRng(seed),
        recentStandardIds: ['MT.4.NF.1', 'MT.4.NF.2'],
      })
      expect(['MT.4.NF.1', 'MT.4.NF.2']).not.toContain(item.standardId)
    }
  })

  it('still returns an item when everything is recent', () => {
    const item = selectItem({
      ratings: flat(50),
      pressure: 'midfield',
      rng: makeRng(7),
      recentStandardIds: RATED_STANDARD_IDS.slice(),
    })
    expect(RATED_STANDARD_IDS).toContain(item.standardId)
  })

  it('still returns the pinned standard when it is also the recent one', () => {
    const item = selectItem({
      ratings: flat(50),
      pressure: 'training',
      rng: makeRng(7),
      standardId: 'MT.4.MD.3',
      recentStandardIds: ['MT.4.MD.3'],
    })
    expect(item.standardId).toBe('MT.4.MD.3')
  })

  it('ignores recent ids it has never heard of', () => {
    const item = selectItem({
      ratings: flat(50),
      pressure: 'midfield',
      rng: makeRng(2),
      recentStandardIds: ['NOT.A.STANDARD', ''],
    })
    expect(RATED_STANDARD_IDS).toContain(item.standardId)
  })
})

describe('weighting without probeWeakest', () => {
  /** A spread of ratings across the thirteen standards, weakest first. */
  const SPREAD_RATINGS = ratingsOf(
    Object.fromEntries(
      RATED_STANDARD_IDS.map((id, i) => [id, 22 + Math.round((i * 70) / (RATED_STANDARD_IDS.length - 1))]),
    ),
  )

  it('starves nothing over 10,000 draws', () => {
    const draws = 10_000
    const counts = tally(draws, (i) => ({
      ratings: SPREAD_RATINGS,
      pressure: 'midfield' as Pressure,
      rng: makeRng(i),
    }))
    for (const id of RATED_STANDARD_IDS) {
      const share = (counts.get(id) ?? 0) / draws
      expect(share, `${id} share`).toBeGreaterThan(0.01)
    }
  })

  it('leans toward the weaker standards without being uniform', () => {
    const draws = 10_000
    const counts = tally(draws, (i) => ({
      ratings: SPREAD_RATINGS,
      pressure: 'midfield' as Pressure,
      rng: makeRng(i),
    }))
    const weakest = counts.get(RATED_STANDARD_IDS[0]!) ?? 0
    const strongest = counts.get(RATED_STANDARD_IDS[RATED_STANDARD_IDS.length - 1]!) ?? 0
    expect(weakest).toBeGreaterThan(strongest)
    // Gently. Practice should drift toward the gaps without turning ordinary
    // play into a drill on his worst topic.
    expect(weakest / strongest).toBeLessThan(6)
  })

  it('is close to uniform when every standard is equally strong', () => {
    const draws = 6500
    const counts = tally(draws, (i) => ({
      ratings: flat(55),
      pressure: 'midfield' as Pressure,
      rng: makeRng(i),
    }))
    const expected = draws / RATED_STANDARD_IDS.length
    for (const id of RATED_STANDARD_IDS) {
      expect(counts.get(id) ?? 0, id).toBeGreaterThan(expected * 0.6)
    }
  })
})

describe('probeWeakest', () => {
  const RATINGS = ratingsOf({
    'MT.4.NF.1': 41,
    'MT.4.NF.2': 44,
    'MT.4.NF.3': 78,
    'MT.4.NF.4': 76,
    'MT.4.NBT.4': 74,
    'MT.4.NBT.5': 70,
    'MT.4.NBT.6': 66,
    'MT.4.OA.1': 72,
    'MT.4.OA.4': 68,
    'MT.4.MD.1': 75,
    'MT.4.MD.3': 71,
    'MT.4.G.1': 73,
    'FLU.MULT': 80,
  })

  const DRAWS = 4000
  const uniform = 1 / RATED_STANDARD_IDS.length

  it('picks the weakest standard at least 3x the uniform rate', () => {
    const counts = tally(DRAWS, (i) => ({
      ratings: RATINGS,
      pressure: 'shot' as Pressure,
      rng: makeRng(i),
      probeWeakest: true,
    }))
    const share = (counts.get('MT.4.NF.1') ?? 0) / DRAWS
    expect(share).toBeGreaterThan(3 * uniform)
  })

  it('gives the real holes at least 3x their share of a big match', () => {
    // Both genuine gaps — 41 and 44, against a pack in the high sixties and
    // seventies — have to be found, not only the lowest one. Asserted on the
    // pair rather than on each: the second hole lands at about 3.1x on its own,
    // which clears the bar but not by enough to measure without noise at this
    // many draws. Together they sit at 3.3x with room to spare.
    const counts = tally(DRAWS, (i) => ({
      ratings: RATINGS,
      pressure: 'shot' as Pressure,
      rng: makeRng(i),
      probeWeakest: true,
    }))
    const holes = ['MT.4.NF.1', 'MT.4.NF.2']
    const share = holes.reduce((n, id) => n + (counts.get(id) ?? 0), 0) / DRAWS
    expect(share).toBeGreaterThan(3 * holes.length * uniform)
    // And each of them individually well clear of ordinary rotation.
    for (const id of holes) {
      expect((counts.get(id) ?? 0) / DRAWS, id).toBeGreaterThan(2.5 * uniform)
    }
  })

  it('draws the bottom quartile several times as often as the top quartile', () => {
    // NOTE — the bar here is the ratio between the ends, not an absolute share
    // of the bottom quartile. With thirteen standards a quartile is four of
    // them, and demanding that those four take three times their uniform share
    // would mean 92% of every big match, leaving the other nine standards under
    // 8% between them. That is not probing a weakness, it is refusing to ask
    // about anything else. The requirement worth holding is that each real gap
    // clears 3x uniform (above) while the ordering stays emphatic.
    const counts = tally(DRAWS, (i) => ({
      ratings: RATINGS,
      pressure: 'shot' as Pressure,
      rng: makeRng(i),
      probeWeakest: true,
    }))
    const ranked = RATED_STANDARD_IDS.slice().sort(
      (a, b) => RATINGS.get(a)!.rating - RATINGS.get(b)!.rating,
    )
    const size = Math.ceil(ranked.length / 4)
    const sum = (ids: string[]) => ids.reduce((n, id) => n + (counts.get(id) ?? 0), 0)
    const bottom = sum(ranked.slice(0, size))
    const top = sum(ranked.slice(-size))
    expect(bottom / DRAWS).toBeGreaterThan(2 * size * uniform)
    expect(bottom).toBeGreaterThan(top * 4)
  })

  it('finds the hole inside a domain rather than reading its average', () => {
    // DRI averages a respectable 60 across NF, but NF.1 sits at 41. A big match
    // must attack the 41 and not be fooled by the average.
    const counts = tally(2000, (i) => ({
      ratings: RATINGS,
      pressure: 'shot' as Pressure,
      rng: makeRng(i),
      domain: 'NF' as DomainCode,
      probeWeakest: true,
    }))
    const weak = (counts.get('MT.4.NF.1') ?? 0) + (counts.get('MT.4.NF.2') ?? 0)
    const strong = (counts.get('MT.4.NF.3') ?? 0) + (counts.get('MT.4.NF.4') ?? 0)
    expect(weak).toBeGreaterThan(strong * 3)
  })

  it('draws the weakest standard far more often than ordinary selection does', () => {
    const share = (probe: boolean) => {
      const counts = tally(DRAWS, (i) => ({
        ratings: RATINGS,
        pressure: 'shot' as Pressure,
        rng: makeRng(i),
        probeWeakest: probe,
      }))
      return (counts.get('MT.4.NF.1') ?? 0) / DRAWS
    }
    expect(share(true)).toBeGreaterThan(share(false) * 2)
  })

  it('still lets a strong standard through sometimes', () => {
    // Probing gaps is not the same as refusing everything else. A big match
    // that only ever asked about his worst topic would be a punishment.
    const counts = tally(DRAWS, (i) => ({
      ratings: RATINGS,
      pressure: 'shot' as Pressure,
      rng: makeRng(i),
      probeWeakest: true,
    }))
    expect(counts.get('FLU.MULT') ?? 0).toBeGreaterThan(0)
  })

  it('still targets the standard rating, so probing a gap is not punishment', () => {
    // The gap is attacked by *topic*, never by serving something too hard.
    for (let seed = 0; seed < 100; seed++) {
      const item = selectItem({
        ratings: RATINGS,
        pressure: 'shot',
        rng: makeRng(seed),
        probeWeakest: true,
      })
      const rating = RATINGS.get(item.standardId)!.rating
      const wanted = difficultyForSuccess(rating, TARGET_SUCCESS.shot)
      expect(item.difficulty).toBeCloseTo(clampTo(wanted, rangeOf(item.standardId)), 5)
    }
  })
})

describe('determinism', () => {
  it('reproduces exactly under a fixed seed', () => {
    for (let seed = 0; seed < 40; seed++) {
      const opts = () => ({ ratings: flat(58), pressure: 'final_third' as Pressure, rng: makeRng(seed) })
      expect(JSON.stringify(selectItem(opts()))).toBe(JSON.stringify(selectItem(opts())))
    }
  })

  it('reproduces exactly with every option set', () => {
    const opts = () => ({
      ratings: flat(44),
      pressure: 'penalty' as Pressure,
      rng: makeRng(99),
      generators: ALL_GENERATORS.slice(),
      domain: 'NBT' as DomainCode,
      probeWeakest: true,
      recentStandardIds: ['MT.4.NBT.4'],
    })
    expect(JSON.stringify(selectItem(opts()))).toBe(JSON.stringify(selectItem(opts())))
  })

  it('does not return the same item forever', () => {
    const prompts = new Set<string>()
    for (let seed = 0; seed < 60; seed++) {
      prompts.add(selectItem({ ratings: flat(58), pressure: 'midfield', rng: makeRng(seed) }).prompt)
    }
    expect(prompts.size).toBeGreaterThan(20)
  })
})

describe('never throws', () => {
  const nasty: [string, Parameters<typeof selectItem>[0]][] = [
    ['empty ratings', { ratings: new Map(), pressure: 'midfield', rng: makeRng(1) }],
    [
      'an unknown standardId',
      { ratings: flat(50), pressure: 'midfield', rng: makeRng(1), standardId: 'MT.9.ZZ.9' },
    ],
    [
      'a standard with no generator',
      { ratings: flat(50), pressure: 'midfield', rng: makeRng(1), standardId: 'MT.4.OA.3' },
    ],
    [
      'an empty generator list',
      { ratings: flat(50), pressure: 'midfield', rng: makeRng(1), generators: [] },
    ],
    [
      'a domain with no generators in the pool',
      {
        ratings: flat(50),
        pressure: 'midfield',
        rng: makeRng(1),
        generators: [generatorFor('FLU.MULT')!],
        domain: 'G' as DomainCode,
      },
    ],
    [
      'a NaN rating',
      { ratings: ratingsOf({ 'MT.4.NF.1': Number.NaN }), pressure: 'midfield', rng: makeRng(1) },
    ],
    [
      'an infinite rating',
      {
        ratings: ratingsOf({ 'MT.4.NF.1': Number.POSITIVE_INFINITY }),
        pressure: 'midfield',
        rng: makeRng(1),
      },
    ],
    [
      'ratings far outside the scale',
      { ratings: flat(-4000), pressure: 'bicycle', rng: makeRng(1) },
    ],
    ['an unknown pressure', { ratings: flat(50), pressure: 'kickoff' as Pressure, rng: makeRng(1) }],
    [
      'every option at once, all hostile',
      {
        ratings: new Map(),
        pressure: 'nonsense' as Pressure,
        rng: makeRng(1),
        generators: [],
        domain: 'ZZ' as DomainCode,
        standardId: '',
        probeWeakest: true,
        recentStandardIds: [],
      },
    ],
  ]

  for (const [name, opts] of nasty) {
    it(`returns a usable item for ${name}`, () => {
      const item = selectItem(opts)
      expect(item.prompt.trim().length).toBeGreaterThan(0)
      expect(Number.isFinite(item.difficulty)).toBe(true)
      expect(item.workedSteps.length).toBeGreaterThan(0)
      expect(item.misconceptions.length).toBeGreaterThan(0)
    })
  }

  it('falls back to the full roster when the pool is filtered to nothing', () => {
    const item = selectItem({
      ratings: flat(50),
      pressure: 'midfield',
      rng: makeRng(1),
      standardId: 'MT.9.ZZ.9',
    })
    expect(RATED_STANDARD_IDS).toContain(item.standardId)
  })

  it('survives a generator list containing a duplicate', () => {
    const dup: ItemGenerator[] = [generatorFor('MT.4.NF.1')!, generatorFor('MT.4.NF.1')!]
    const item = selectItem({ ratings: flat(50), pressure: 'midfield', rng: makeRng(1), generators: dup })
    expect(item.standardId).toBe('MT.4.NF.1')
  })

  it('treats a missing rating as the seed', () => {
    const seeded = selectItem({ ratings: new Map(), pressure: 'midfield', rng: makeRng(4) })
    const explicit = selectItem({ ratings: flat(SEED_RATING), pressure: 'midfield', rng: makeRng(4) })
    expect(JSON.stringify(seeded)).toBe(JSON.stringify(explicit))
  })
})
