import { describe, expect, it } from 'vitest'
import { DECOMPOSES_TO, decompose } from './decompose'
import { ALL_GENERATORS, generatorFor } from './generators'
import { factItem, isRuleFact } from './generators/flumult'
import { factorBetween } from './generators/mt4md1'
import { makeRng } from './rng'
import { checkAnswer, canonicalOf } from '../answer'
import { Rational } from '../rational'
import type { Item } from './types'

/** Whole numbers appearing in a string, as numbers. */
function numbersIn(text: string): number[] {
  return (text.match(/\d+/g) ?? []).map(Number)
}

/**
 * Independent of every generator: the prerequisite's answer recomputed from
 * the scaffold's own params by counting, not by the operator the generator
 * used. A fact or a product is `b` put down `a` times; a sum of same-sized
 * pieces is the pieces counted.
 */
function verify(item: Item): string {
  const p = item.params
  switch (item.standardId) {
    case 'FLU.MULT':
    case 'MT.4.NBT.5': {
      let total = 0
      for (let i = 0; i < p.a!; i++) total += p.b!
      return String(total)
    }
    case 'MT.4.NF.3': {
      let pieces = 0
      for (let i = 0; i < p.n1!; i++) pieces += 1
      for (let i = 0; i < p.n2!; i++) pieces += 1
      return new Rational(pieces, p.den!).toString()
    }
    default:
      throw new Error(`no independent check for ${item.standardId}`)
  }
}

function everyItem(standardId: string, seeds = 60): Item[] {
  const gen = generatorFor(standardId)!
  const out: Item[] = []
  for (let d = gen.range[0]; d <= gen.range[1]; d += 1) {
    for (let seed = 0; seed < seeds; seed++) out.push(gen.generate(d, makeRng(seed)))
  }
  return out
}

describe('decomposing a missed question into the fact inside it', () => {
  it('only ever lands on the standard underneath, and never on the one he missed', () => {
    for (const [standardId, below] of Object.entries(DECOMPOSES_TO)) {
      expect(generatorFor(standardId), standardId).toBeDefined()
      for (const id of below) {
        expect(generatorFor(id), id).toBeDefined()
        expect(id).not.toBe(standardId)
      }
    }  })

  it('is sound wherever it answers: the key survives an independent recount', () => {
    for (const standardId of Object.keys(DECOMPOSES_TO)) {
      for (const item of everyItem(standardId)) {
        const scaffold = decompose(item, makeRng(1))
        if (scaffold === null) continue
        const where = `${item.prompt} -> ${scaffold.prompt}`

        expect(DECOMPOSES_TO[standardId], where).toContain(scaffold.standardId)
        const [lo, hi] = generatorFor(scaffold.standardId)!.range
        expect(scaffold.difficulty, where).toBeGreaterThanOrEqual(lo)
        expect(scaffold.difficulty, where).toBeLessThanOrEqual(hi)

        expect(checkAnswer(canonicalOf(scaffold.answer), scaffold.answer).correct, where).toBe(true)
        expect(checkAnswer(verify(scaffold), scaffold.answer).correct, where).toBe(true)
        expect(scaffold.workedSteps.length, where).toBeGreaterThan(0)
        expect(scaffold.misconceptions.length, where).toBeGreaterThan(0)
      }
    }
  })

  it('is built from the question he missed, not drawn from a hat', () => {
    // Every number in the scaffold is a number in the missed question, or a
    // digit of one, or the quotient of two of them. Otherwise it is not a
    // decomposition — it is a different question.
    for (const standardId of Object.keys(DECOMPOSES_TO)) {
      for (const item of everyItem(standardId, 30)) {
        const scaffold = decompose(item, makeRng(1))
        if (scaffold === null) continue
        const allowed = new Set<number>()
        for (const n of Object.values(item.params)) {
          allowed.add(n)
          for (const digit of String(n)) allowed.add(Number(digit))
        }
        // The fact inside a division or a multiple is divisor × a digit of the
        // quotient; the fact inside a factor question is a factor pair of n.
        const n = item.params.n ?? item.params.dividend ?? item.params.given
        const by = item.params.by ?? item.params.divisor ?? item.params.factor
        if (n !== undefined && by !== undefined && by > 0) {
          for (const digit of String(Math.floor(n / by))) allowed.add(Number(digit))
        }
        if (n !== undefined) {
          for (let f = 2; f <= 9; f++) if (n % f === 0) allowed.add(f).add(n / f)
        }
        // A conversion's factor is not in its params — the harness insists on
        // deriving it — so its digits are looked up here the same way.
        if (item.standardId === 'MT.4.MD.1') {
          for (const digit of String(factorBetween(item.params.from!, item.params.to!))) allowed.add(Number(digit))
        }        const scaffoldNumbers =
          scaffold.standardId === 'MT.4.NF.3'
            ? [scaffold.params.n1!, scaffold.params.n2!, scaffold.params.den!]
            : [scaffold.params.a!, scaffold.params.b!]
        for (const value of scaffoldNumbers) {
          expect(allowed.has(value), `${scaffold.prompt} is not inside ${item.prompt}`).toBe(true)
        }
      }
    }
  })

  it('never hands back a rule fact', () => {
    // `7 × 0` and `1 × 6` are not rungs to anything. The scaffold either finds
    // a real fact inside the question or says it cannot.
    for (const standardId of Object.keys(DECOMPOSES_TO)) {
      for (const item of everyItem(standardId, 30)) {
        const scaffold = decompose(item, makeRng(1))
        if (scaffold === null || scaffold.standardId !== 'FLU.MULT') continue
        expect(isRuleFact(scaffold.params.a!, scaffold.params.b!), `${item.prompt} -> ${scaffold.prompt}`).toBe(false)
      }
    }
  })

  it('answers for nearly every multiplication and division he can be asked', () => {
    // The decomposition exists for exactly these standards, so a scaffold that
    // shrugged on most of their items would leave the old random draw doing
    // the teaching. The gaps are all honest ones, measured: `MT.4.NBT.5`'s
    // ten-times framing (`2 × 10`) and its `11 × n` items have only rule
    // digits inside them; `MT.4.OA.4`'s primes have no factor pair to ask
    // about; a power-of-ten conversion has no fact inside it worth asking; and
    // `MT.4.NF.3` has never asked about ninths, so `MT.4.NF.4`'s ninths have no
    // sum underneath them that this game knows how to explain.
    const floor: Record<string, number> = {
      'MT.4.NBT.5': 0.75,
      'MT.4.NBT.6': 0.9,
      'MT.4.OA.1': 0.75,
      'MT.4.OA.4': 0.6,
      'MT.4.MD.1': 0.3,
      'MT.4.MD.3': 0.95,
      'MT.4.NF.4': 0.8,
    }
    for (const standardId of Object.keys(DECOMPOSES_TO)) {
      // A perimeter is an addition, which nothing underneath `MT.4.MD.3` asks,
      // so only its areas are expected to come apart.
      const items = everyItem(standardId, 20).filter(
        (item) => standardId !== 'MT.4.MD.3' || item.params.ask === 1,
      )
      const answered = items.filter((item) => decompose(item, makeRng(1)) !== null).length
      expect(answered / items.length, standardId).toBeGreaterThanOrEqual(floor[standardId]!)
    }
  })

  it('is deterministic for a seed, so a replayed match shows the same tackle-back', () => {
    for (const standardId of Object.keys(DECOMPOSES_TO)) {
      for (const item of everyItem(standardId, 5)) {
        const a = decompose(item, makeRng(4))
        const b = decompose(item, makeRng(4))
        expect(JSON.stringify(a)).toBe(JSON.stringify(b))
      }
    }
  })

  it('says nothing for a standard it does not know how to take apart', () => {
    for (const gen of ALL_GENERATORS) {
      if (gen.standardId in DECOMPOSES_TO) continue
      expect(decompose(gen.generate(50, makeRng(2)), makeRng(1)), gen.standardId).toBeNull()
    }
  })

  describe('the fact it picks', () => {
    const scaffoldOf = (item: Item) => decompose(item, makeRng(1))!

    const nbt5 = (a: number, b: number): Item => ({
      standardId: 'MT.4.NBT.5',
      difficulty: 50,
      prompt: `${a} × ${b}`,
      answer: { kind: 'rational', canonical: String(a * b) },
      params: { a, b, format: 0 },
      workedSteps: ['x'],
      misconceptions: [],
    })

    it('takes a digit of the long number against the one-digit multiplier', () => {
      const s = scaffoldOf(nbt5(347, 6))
      expect(s.standardId).toBe('FLU.MULT')
      expect([3, 4, 7]).toContain(s.params.a)
      expect(s.params.b).toBe(6)
    })

    it('takes the easiest fact inside, so the rung stays a rung', () => {
      // `347 × 8` holds 3 × 8, 4 × 8 and 7 × 8. The child who just missed the
      // long sum is not helped by the hardest square in the table on a clock.
      for (let seed = 0; seed < 30; seed++) {
        const s = decompose(nbt5(347, 8), makeRng(seed))!
        expect([3, 4]).toContain(s.params.a)
        expect(s.params.b).toBe(8)
      }
      // 23 × 45 holds four facts; 2 × 5 is the one a child certainly has.
      for (let seed = 0; seed < 10; seed++) {
        expect(decompose(nbt5(23, 45), makeRng(seed))!.params).toEqual({ a: 2, b: 5 })
      }
      // And ties are shared out rather than always the first one found: the
      // sevens are hard against every digit of 346 alike.
      const seen = new Set<number>()
      for (let seed = 0; seed < 40; seed++) seen.add(decompose(nbt5(346, 7), makeRng(seed))!.params.a!)
      expect(seen).toEqual(new Set([3, 4, 6]))
    })

    it('skips the digits that are rules: 1s and 0s in the long number', () => {
      for (let seed = 0; seed < 20; seed++) {
        const s = decompose(nbt5(1046, 7), makeRng(seed))!
        expect([4, 6]).toContain(s.params.a)
      }
      // Nothing but rule digits: there is no fact inside `11 × 5` to ask.
      expect(decompose(nbt5(11, 5), makeRng(1))).toBeNull()
    })

    it('reads a division as the fact between the divisor and a digit of the quotient', () => {
      const item: Item = {
        ...nbt5(0, 0),
        standardId: 'MT.4.NBT.6',
        params: { dividend: 97, divisor: 4, format: 0 },
      }
      // 97 ÷ 4 = 24 r 1, so the facts inside it are 4 × 2 and 4 × 4, and the
      // twos are the easier row.
      const s = scaffoldOf(item)
      expect(s.params).toEqual({ a: 4, b: 2 })
    })

    it('reads a multiple question the same way', () => {
      const item: Item = {
        ...nbt5(0, 0),
        standardId: 'MT.4.OA.4',
        params: { n: 97, format: 7, by: 5 },
      }
      // 97 ÷ 5 = 19 r 2, so the fact inside it is 5 × 9.
      const s = scaffoldOf(item)
      expect(s.params).toEqual({ a: 5, b: 9 })
    })

    it('reads a factor question as one of its factor pairs', () => {
      const item: Item = {
        ...nbt5(0, 0),
        standardId: 'MT.4.OA.4',
        params: { n: 24, format: 3, by: 0 },
      }
      // 24 is 3 × 8 and 4 × 6; the second is the easier fact.
      const s = scaffoldOf(item)
      expect([s.params.a, s.params.b].sort()).toEqual([4, 6])
      // A prime has no pair to offer.
      expect(decompose({ ...item, params: { n: 37, format: 3, by: 0 } }, makeRng(1))).toBeNull()
    })

    it('reads an area as the multiplication before it is anything else', () => {
      const small: Item = { ...nbt5(0, 0), standardId: 'MT.4.MD.3', params: { w: 7, h: 6, ask: 1, context: 0 } }
      expect(scaffoldOf(small)).toEqual(factItem(7, 6))
      const big: Item = { ...nbt5(0, 0), standardId: 'MT.4.MD.3', params: { w: 14, h: 6, ask: 1, context: 0 } }
      const s = scaffoldOf(big)
      expect(s.standardId).toBe('MT.4.NBT.5')
      expect(s.params).toMatchObject({ a: 14, b: 6 })
      // A perimeter is an addition, which nothing underneath this standard asks.
      expect(decompose({ ...small, params: { ...small.params, ask: 0 } }, makeRng(1))).toBeNull()
    })

    it('reads a fraction times a whole as two of the lots added', () => {
      const item: Item = {
        ...nbt5(0, 0),
        standardId: 'MT.4.NF.4',
        params: { whole: 3, n: 3, den: 4, order: 0, format: 0 },
      }
      const s = scaffoldOf(item)
      expect(s.standardId).toBe('MT.4.NF.3')
      expect(s.params).toMatchObject({ n1: 3, n2: 3, den: 4 })
      expect(canonicalOf(s.answer)).toBe('3/2')
    })

    it('reads a conversion as the quantity against the digit of the factor', () => {
      // 7 minutes to seconds: 7 × 60, and the fact inside it is 7 × 6.
      const item: Item = { ...nbt5(0, 0), standardId: 'MT.4.MD.1', params: { quantity: 7, from: 10, to: 9 } }
      expect(scaffoldOf(item).params).toEqual({ a: 7, b: 6 })
      // 7 centimeters to millimeters is a place-value shift with no fact in it.
      expect(decompose({ ...item, params: { quantity: 7, from: 1, to: 0 } }, makeRng(1))).toBeNull()
    })

    it('keeps the prompt numbers it borrows visible in the scaffold prompt', () => {
      for (const item of everyItem('MT.4.NBT.5', 10)) {
        const s = decompose(item, makeRng(1))
        if (s === null) continue
        const shown = numbersIn(s.prompt)
        expect(shown).toContain(s.params.a)
        expect(shown).toContain(s.params.b)
      }
    })
  })
})
