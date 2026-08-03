import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nf1 } from './mt4nf1'

/**
 * Independent of the generator: the standard says a/b is equivalent to
 * (n × a)/(n × b). So the number sitting over `targetDen` is whatever a/b scales
 * to at that bottom number — a × targetDen ÷ b.
 *
 * This deliberately never touches `mult`, which is the number the generator
 * actually multiplied by. It recovers the scaling from the two denominators
 * instead, so a generator that drew one multiplier and used another would be
 * caught rather than agreed with.
 */
const answerFrom = (p: Record<string, number>) => new R(p.a! * p.targetDen!, p.b!).toString()

/** Mean of a param over many seeds, so a difficulty claim is not one lucky draw. */
function meanParam(difficulty: number, key: string): number {
  let total = 0
  for (let seed = 0; seed < 60; seed++) total += mt4nf1.generate(difficulty, makeRng(seed)).params[key]!
  return total / 60
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

describe('MT.4.NF.1 equivalent fractions', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf1, answerFrom, {
      promptParams: ['a', 'b', 'targetDen'],
      rebuildPrompt: (p) => `${p.a}/${p.b} = ?/${p.targetDen}. What is the missing top number?`,
    })
  })

  it('scales up the multiplier and the starting denominator with difficulty', () => {
    expect(meanParam(60, 'mult')).toBeGreaterThan(meanParam(8, 'mult'))
    expect(meanParam(60, 'b')).toBeGreaterThan(meanParam(8, 'b'))
  })

  it('always starts from a proper fraction in lowest terms', () => {
    // An unreduced start (2/4 = ?/12) muddies what is being asked: he could get
    // there by reducing rather than by scaling, which is a different standard.
    for (let d = 5; d <= 70; d += 5) {
      for (let s = 0; s < 40; s++) {
        const { a, b } = mt4nf1.generate(d, makeRng(s)).params as Record<string, number>
        expect(a, `a out of range at d=${d} s=${s}`).toBeGreaterThanOrEqual(1)
        expect(a, `not proper at d=${d} s=${s}`).toBeLessThan(b!)
        expect(gcd(a!, b!), `${a}/${b} is not in lowest terms`).toBe(1)
      }
    }
  })

  it('always asks for a bigger denominator that is a whole multiple of the first', () => {
    for (let d = 5; d <= 70; d += 5) {
      for (let s = 0; s < 40; s++) {
        const { b, targetDen, mult } = mt4nf1.generate(d, makeRng(s)).params as Record<string, number>
        expect(mult, `multiplier of 1 is not a question at d=${d} s=${s}`).toBeGreaterThanOrEqual(2)
        expect(targetDen).toBe(b! * mult!)
      }
    }
  })

  it('answers with a whole number, never a fraction', () => {
    // The prompt asks for the missing top number. A fractional key would mean
    // the question and the answer box disagree about what is wanted.
    for (let s = 0; s < 100; s++) {
      const item = mt4nf1.generate(40, makeRng(s))
      expect(R.parse(item.answer.canonical)!.isInteger(), item.prompt).toBe(true)
    }
  })

  it('names adding the multiplier instead of multiplying by it', () => {
    const item = mt4nf1.generate(40, makeRng(3))
    const { a, mult } = item.params as Record<string, number>
    const added = item.misconceptions.find((m) => m.id === 'added-multiplier')
    // Only asserted when it survives the collision filters, which is the point
    // of looking it up by id rather than by position.
    if (added) expect(added.signature).toBe(String(a! + mult!))
  })

  it('names adding the denominator gap to the top instead of scaling', () => {
    // 3/4 = ?/12: the bottom went up by 8, so the child puts the top up by 8
    // too. This is the classic additive slip and it is always available, since
    // a + (targetDen - b) can never equal a × mult for a proper fraction.
    for (let s = 0; s < 60; s++) {
      const item = mt4nf1.generate(45, makeRng(s))
      const { a, b, targetDen } = item.params as Record<string, number>
      const gap = item.misconceptions.find((m) => m.id === 'added-difference')
      if (gap) expect(gap.signature).toBe(String(a! + (targetDen! - b!)))
    }
  })

  it('keeps the more diagnostic mistake when two land on the same number', () => {
    // When the multiplier equals the starting top number (3/4 = ?/12), "kept the
    // top number" and "wrote the multiplier" both produce 3. They cannot be told
    // apart, so only the one that says more about his thinking is named.
    let checked = 0
    for (let s = 0; s < 200 && checked < 3; s++) {
      const item = mt4nf1.generate(45, makeRng(s))
      const { a, mult } = item.params as Record<string, number>
      if (a !== mult) continue
      checked++
      expect(item.misconceptions.some((m) => m.id === 'kept-numerator'), item.prompt).toBe(true)
      expect(item.misconceptions.some((m) => m.id === 'answered-multiplier'), item.prompt).toBe(false)
    }
    expect(checked, 'no item where the multiplier equals the top number').toBeGreaterThan(0)
  })

  it('recognises writing the whole fraction rather than the missing number', () => {
    // He may well have understood it perfectly and answered 9/12. The point of
    // naming it is that the film room can say so instead of filing it as "off".
    for (let s = 0; s < 40; s++) {
      const item = mt4nf1.generate(30, makeRng(s))
      const { a, b } = item.params as Record<string, number>
      const wrote = item.misconceptions.find((m) => m.id === 'wrote-the-fraction')
      expect(wrote, item.prompt).toBeDefined()
      expect(wrote!.signature).toBe(new R(a!, b!).toString())
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf1.generate(0, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf1.generate(99, makeRng(4)).difficulty).toBe(70)
    expect(mt4nf1.generate(-3, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf1.generate(31.6, makeRng(4)).difficulty).toBe(31.6)
  })
})
