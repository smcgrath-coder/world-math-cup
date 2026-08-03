import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nf3 } from './mt4nf3'

/** Independent of the generator: recompute the answer from params with Rational only. */
const answerFrom = (p: Record<string, number>) => {
  const a = new R(p.n1!, p.den!)
  const b = new R(p.n2!, p.den!)
  return (p.op === 1 ? a.add(b) : a.sub(b)).toString()
}

/** The first item at `difficulty` whose operation is `op`, walking seeds. */
function firstItemWithOp(difficulty: number, op: number) {
  for (let seed = 0; seed < 200; seed++) {
    const item = mt4nf3.generate(difficulty, makeRng(seed))
    if (item.params.op === op) return item
  }
  throw new Error(`no item with op=${op} at difficulty ${difficulty} in 200 seeds`)
}

describe('MT.4.NF.3 add/subtract like denominators', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf3, answerFrom, {
      promptParams: ['n1', 'n2', 'den'],
      // Rebuilt independently, minus sign and all, so the prompt cannot drift
      // away from the numbers the answer is computed from.
      rebuildPrompt: (p) => `${p.n1}/${p.den} ${p.op === 1 ? '+' : '−'} ${p.n2}/${p.den}`,
    })
  })

  it('produces larger denominators at higher difficulty', () => {
    const easy = mt4nf3.generate(10, makeRng(1))
    const hard = mt4nf3.generate(70, makeRng(1))
    expect(hard.params.den).toBeGreaterThan(easy.params.den)
  })

  it('never produces a negative result for subtraction', () => {
    for (let s = 0; s < 100; s++) {
      const item = mt4nf3.generate(50, makeRng(s))
      expect(R.parse(item.answer.canonical)!.n).toBeGreaterThanOrEqual(0)
    }
  })

  it('carries the add-across misconception on addition items', () => {
    const item = firstItemWithOp(40, 1)
    const across = item.misconceptions.find((m) => m.id === 'add-across')
    expect(across, `no add-across on ${item.prompt}`).toBeDefined()
    // Recomputed independently: adding straight across doubles the denominator.
    expect(across!.signature).toBe(new R(item.params.n1! + item.params.n2!, item.params.den! * 2).toString())
  })

  it('never carries add-across on subtraction items', () => {
    // Subtracting straight across gives a denominator of zero, which is not a
    // number, so there is no wrong answer to recognise. Emitting one anyway
    // would mean naming a mistake that cannot happen.
    for (let s = 0; s < 200; s++) {
      const item = mt4nf3.generate(50, makeRng(s))
      if (item.params.op === 0) {
        expect(item.misconceptions.some((m) => m.id === 'add-across'), item.prompt).toBe(false)
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    // `difficultyForSuccess` returns anything in 0..99, fractional. Throwing
    // here would crash a match for the lowest-rated player.
    expect(mt4nf3.generate(0, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf3.generate(99, makeRng(4)).difficulty).toBe(80)
    expect(mt4nf3.generate(37.4, makeRng(4)).difficulty).toBe(37.4)
  })

  it('makes the hardest band cross a whole one or need simplifying', () => {
    for (let s = 0; s < 100; s++) {
      const item = mt4nf3.generate(80, makeRng(s))
      const { n1, n2, den, op } = item.params as Record<string, number>
      const raw = op === 1 ? n1! + n2! : n1! - n2!
      const crosses = raw >= den!
      const simplifies = new R(raw, den!).d !== den
      expect(crosses || simplifies, `${item.prompt} is neither`).toBe(true)
    }
  })

  it('keeps the easiest band inside one whole', () => {
    for (let s = 0; s < 100; s++) {
      const item = mt4nf3.generate(5, makeRng(s))
      expect(R.parse(item.answer.canonical)!.compare(new R(1)), item.prompt).toBeLessThanOrEqual(0)
    }
  })
})
