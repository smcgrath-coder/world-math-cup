import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nf4 } from './mt4nf4'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Independent of the generator: the standard's own framing, done literally.
 *
 * "Apply and extend previous understandings of multiplication to multiply a
 * fraction by a whole number" — and the understanding being extended is that
 * multiplying by a whole number is repeated addition. So this adds n/den to
 * itself `whole` times and never multiplies anything at all. The generator
 * computes (whole × n)/den in one step; this arrives at the same value by the
 * route the standard describes.
 */
const answerFrom = (p: Record<string, number>) => {
  let total = new R(0, 1)
  for (let i = 0; i < p.whole!; i++) total = total.add(new R(p.n!, p.den!))
  return total.toString()
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf4.generate(difficulty, makeRng(s)))
}

const EASIEST = 10
const HARDEST = 85

describe('MT.4.NF.4 multiplying a fraction by a whole number', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf4, answerFrom, {
      promptParams: ['whole', 'n', 'den'],
      rebuildPrompt: (p) =>
        p.order === 1 ? `${p.n}/${p.den} × ${p.whole}` : `${p.whole} × ${p.n}/${p.den}`,
    })
  })

  it('writes the question both ways round', () => {
    // 5 × 2/3 and 2/3 × 5 are the same question, and a child who has only ever
    // seen one order can freeze on the other.
    const orders = new Set(itemsAt(45).map((i) => i.params.order))
    expect(orders).toEqual(new Set([0, 1]))
  })

  it('always multiplies a proper fraction in lowest terms by at least two', () => {
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 60)) {
        const { whole, n, den } = item.params as Record<string, number>
        expect(whole, item.prompt).toBeGreaterThanOrEqual(2)
        expect(n, item.prompt).toBeLessThan(den!)
        expect(gcd(n!, den!), item.prompt).toBe(1)
      }
    }
  })

  it('keeps the hardest band above one whole and off a whole number', () => {
    // The point of the top band is the improper answer. Landing on a whole
    // number hides exactly the thing being tested.
    for (const item of itemsAt(HARDEST)) {
      const value = R.parse(item.answer.canonical)!
      expect(value.compare(new R(1)), item.prompt).toBeGreaterThan(0)
      expect(value.isInteger(), item.prompt).toBe(false)
    }
  })

  it('sometimes lands on a whole number in the easiest band', () => {
    // 3 × 2/3 = 2 is a real and useful case, and it only exists down here.
    const wholes = itemsAt(EASIEST).filter((i) => R.parse(i.answer.canonical)!.isInteger())
    expect(wholes.length).toBeGreaterThan(0)
  })

  it('names multiplying the bottom number as well', () => {
    // The signature is worth stating out loud: multiplying top and bottom by the
    // same number lands back on the fraction he started with, every time.
    for (const item of itemsAt(50, 40)) {
      const { whole, n, den } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'multiplied-both')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(whole! * n!, den! * whole!).toString())
      expect(m!.signature).toBe(new R(n!, den!).toString())
    }
  })

  it('names multiplying only the bottom number', () => {
    for (const item of itemsAt(50, 40)) {
      const { whole, n, den } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'multiplied-denominator-only')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(n!, den! * whole!).toString())
    }
  })

  it('names adding instead of multiplying', () => {
    for (const item of itemsAt(50, 40)) {
      const { whole, n, den } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'added-instead')
      expect(m, item.prompt).toBeDefined()
      // whole + n/den, which he would most likely type as the mixed number.
      expect(m!.signature).toBe(new R(whole! * den! + n!, den!).toString())
    }
  })

  it('names losing the bottom number altogether', () => {
    for (const item of itemsAt(50, 40)) {
      const { whole, n } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'dropped-denominator')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(String(whole! * n!))
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nf4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf4.generate(63.9, makeRng(4)).difficulty).toBe(63.9)
  })
})
