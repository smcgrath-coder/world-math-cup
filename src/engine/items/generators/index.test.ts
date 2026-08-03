import { describe, expect, it } from 'vitest'
import { STANDARDS_BY_ID } from '../../../curriculum/standards.generated'
import { makeRng } from '../rng'
import { ALL_GENERATORS, generatorFor } from './index'

/**
 * Ids that are deliberately not in the curriculum, listed one by one.
 *
 * PAC is the only card stat no domain maps to: it is fluency, which is speed
 * rather than content, and there is no Montana standard for knowing your tables
 * by heart. `FLU.MULT` feeds it. The standards table is generated from the CASE
 * export and has to stay byte-identical on regeneration, so `FLU.MULT` cannot
 * live there and should not — inventing a row would mean claiming the state
 * wrote something it did not.
 *
 * This is an explicit list rather than "skip anything we do not recognise",
 * because the check it is carving an exception out of is the one that catches a
 * mistyped standard id — and a mistyped id is invisible in every other way,
 * routing a whole standard's practice into nothing while its stat sits at its
 * starting rating looking perfectly healthy. An unrecognised id is still a
 * failure unless it is named here, and `never launders a mistyped Montana code`
 * below stops this list from being used to wave one through.
 */
const NON_CURRICULAR_IDS = ['FLU.MULT']

describe('the generator registry', () => {
  it('claims a standard id that actually exists', () => {
    // A typo here would route a whole standard's practice into nothing, and the
    // card stat it feeds would sit at its starting rating forever while looking
    // perfectly healthy.
    for (const gen of ALL_GENERATORS) {
      if (NON_CURRICULAR_IDS.includes(gen.standardId)) continue
      expect(STANDARDS_BY_ID[gen.standardId], `${gen.standardId} is not a Montana standard`).toBeDefined()
    }
  })

  it('never launders a mistyped Montana code through the exception list', () => {
    // The one way the check above could be defeated is by someone reaching for
    // this list when a real standard id came back undefined. A Montana code is
    // never a fluency id, so nothing shaped like one may be excused here.
    for (const id of NON_CURRICULAR_IDS) {
      expect(id.startsWith('MT.'), `${id} looks like a Montana code and cannot be excused here`).toBe(
        false,
      )
      expect(STANDARDS_BY_ID[id], `${id} is a real standard and does not belong on this list`).toBeUndefined()
    }
  })

  it('keeps the exception list down to ids something actually claims', () => {
    // A stale entry here is a hole in the check above that nothing is using.
    const claimed = new Set(ALL_GENERATORS.map((g) => g.standardId))
    for (const id of NON_CURRICULAR_IDS) {
      expect(claimed.has(id), `${id} is excused but no generator claims it`).toBe(true)
    }
  })

  it('never claims the same standard twice', () => {
    // Two generators on one standard means `generatorFor` silently prefers
    // whichever was registered first and the other is dead weight.
    const ids = ALL_GENERATORS.map((g) => g.standardId)
    expect(new Set(ids).size, `duplicate standard ids in ${ids.join(', ')}`).toBe(ids.length)
  })

  it('gives every generator a label and a usable difficulty range', () => {
    for (const gen of ALL_GENERATORS) {
      expect(gen.label.trim().length, `${gen.standardId} has no label`).toBeGreaterThan(0)
      const [lo, hi] = gen.range
      expect(lo, `${gen.standardId} range starts below 0`).toBeGreaterThanOrEqual(0)
      expect(hi, `${gen.standardId} range ends above 99`).toBeLessThanOrEqual(99)
      expect(hi, `${gen.standardId} has an empty range`).toBeGreaterThan(lo)
    }
  })

  it('looks a generator up by standard id', () => {
    expect(generatorFor('MT.4.NF.3')).toBe(ALL_GENERATORS.find((g) => g.standardId === 'MT.4.NF.3'))
    // A real Montana standard that nothing covers yet, so the miss path stays
    // tested. MT.4.NBT.5 used to sit here and now has a generator of its own.
    expect(generatorFor('MT.4.NBT.1')).toBeUndefined()
  })

  it('covers the whole fraction cluster Phase 1 promised', () => {
    // Fractions are what this app was built for. Losing one of these to a bad
    // merge should fail a test, not go unnoticed.
    for (const id of ['MT.4.NF.1', 'MT.4.NF.2', 'MT.4.NF.3', 'MT.4.NF.4']) {
      expect(generatorFor(id), `no generator for ${id}`).toBeDefined()
    }
  })

  it('covers the base-ten arithmetic that feeds the DEF stat', () => {
    // Place value is the back line. When it leaks, nothing built on top of it
    // holds, so losing one of these should fail a test rather than quietly
    // freeze a card stat at its starting rating.
    for (const id of ['MT.4.NBT.4', 'MT.4.NBT.5', 'MT.4.NBT.6']) {
      expect(generatorFor(id), `no generator for ${id}`).toBeDefined()
    }
  })

  it('covers the operations-and-algebraic-thinking work that feeds the PAS stat', () => {
    // Multiplicative comparison and factors are what the multi-step problems
    // later in the curriculum are built out of, so losing one should fail a test
    // rather than quietly freeze a card stat at its starting rating.
    for (const id of ['MT.4.OA.1', 'MT.4.OA.4']) {
      expect(generatorFor(id), `no generator for ${id}`).toBeDefined()
    }
  })

  it('covers the measurement work that feeds the PHY stat', () => {
    for (const id of ['MT.4.MD.1', 'MT.4.MD.3']) {
      expect(generatorFor(id), `no generator for ${id}`).toBeDefined()
    }
  })

  it('covers the geometry that feeds the SHO stat', () => {
    // Shooting is angles. It is the only generator behind that stat, so losing
    // it would leave a whole face of the player card frozen at its starting
    // rating with nothing to show that anything is wrong.
    expect(generatorFor('MT.4.G.1'), 'no generator for MT.4.G.1').toBeDefined()
  })

  it('covers the fluency that feeds the PAC stat', () => {
    // The only generator behind PAC, and the only one not tied to a standard.
    expect(generatorFor('FLU.MULT'), 'no generator for FLU.MULT').toBeDefined()
  })

  it('produces a gradeable item from every generator at every difficulty', () => {
    // A smoke test across the registry, so a generator that throws on some
    // difficulty cannot reach a match just because its own test file forgot.
    for (const gen of ALL_GENERATORS) {
      for (let d = 0; d <= 99; d += 7) {
        const item = gen.generate(d, makeRng(d))
        expect(item.standardId, `${gen.standardId} at d=${d}`).toBe(gen.standardId)
        expect(item.prompt.trim().length, `${gen.standardId} at d=${d}`).toBeGreaterThan(0)
        expect(item.answer.canonical.trim().length, `${gen.standardId} at d=${d}`).toBeGreaterThan(0)
      }
    }
  })
})
