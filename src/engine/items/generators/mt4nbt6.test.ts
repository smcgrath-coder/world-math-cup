import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nbt6 } from './mt4nbt6'

const DIVIDE = '÷'
const QUOTIENT = 1

/**
 * Independent of the generator: division from its own definition.
 *
 * The generator builds a dividend from a quotient and a remainder it chose, and
 * publishes only the dividend and the divisor. This takes those two back apart
 * by repeated subtraction — take the divisor away until you cannot any more,
 * which is what "how many whole groups, and what is left over" means — and then
 * asserts the pair of invariants that define the answer at all:
 *
 *   quotient × divisor + remainder === dividend,  and  0 <= remainder < divisor
 *
 * Those two together are stronger than recomputing a division: a quotient one
 * too small satisfies the first and fails the second, and a remainder borrowed
 * from the wrong place fails the first. Nothing here divides.
 */
function divisionAnswer(p: Record<string, number>): string {
  const dividend = p.dividend!
  const divisor = p.divisor!
  const where = `${dividend} ${DIVIDE} ${divisor}`

  let remainder = dividend
  let quotient = 0
  while (remainder >= divisor) {
    remainder -= divisor
    quotient++
  }

  expect(quotient * divisor + remainder, `${where} does not rebuild from its parts`).toBe(dividend)
  expect(remainder, `${where} has a negative remainder`).toBeGreaterThanOrEqual(0)
  expect(remainder, `${where} has a remainder at least as big as the divisor`).toBeLessThan(divisor)

  return String(p.ask === QUOTIENT ? quotient : remainder)
}

/** The quotient and remainder, by repeated subtraction. */
function parts(dividend: number, divisor: number): [number, number] {
  let remainder = dividend
  let quotient = 0
  while (remainder >= divisor) {
    remainder -= divisor
    quotient++
  }
  return [quotient, remainder]
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nbt6.generate(difficulty, makeRng(s)))
}

const EASIEST = 20
const HARDEST = 92

describe('MT.4.NBT.6 whole-number quotients and remainders', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt6, divisionAnswer, {
      promptParams: ['dividend', 'divisor'],
      rebuildPrompt: (p) =>
        p.ask === QUOTIENT
          ? `${p.dividend} ${DIVIDE} ${p.divisor}. How many whole groups of ${p.divisor}?`
          : `${p.dividend} ${DIVIDE} ${p.divisor}. What is the remainder?`,
    })
  })

  it('stays inside four-digit dividends and one-digit divisors', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { dividend, divisor } = item.params as Record<string, number>
        expect(String(dividend).length, item.prompt).toBeLessThanOrEqual(4)
        expect(String(dividend).length, item.prompt).toBeGreaterThanOrEqual(2)
        expect(divisor, item.prompt).toBeGreaterThanOrEqual(2)
        expect(divisor, item.prompt).toBeLessThanOrEqual(9)
      }
    }
  })

  it('asks for one part at a time, and says which', () => {
    // `AnswerSpec` grades a single number, so `169 r 2` is not something the
    // checker can read. Each item asks for the quotient or the remainder and
    // the prompt says plainly which one it wants.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 30)) {
        const asksQuotient = item.params.ask === QUOTIENT
        expect(item.prompt, item.prompt).toContain(
          asksQuotient ? 'How many whole groups' : 'What is the remainder',
        )
        const [quotient, remainder] = parts(item.params.dividend!, item.params.divisor!)
        expect(item.answer.canonical, item.prompt).toBe(String(asksQuotient ? quotient : remainder))
      }
    }
  })

  it('only asks for the quotient in the easiest band, and both parts higher up', () => {
    expect(new Set(itemsAt(EASIEST).map((i) => i.params.ask))).toEqual(new Set([QUOTIENT]))
    for (const d of [45, 60, HARDEST]) {
      expect(new Set(itemsAt(d).map((i) => i.params.ask)), `d=${d}`).toEqual(new Set([0, QUOTIENT]))
    }
  })

  it('lets him meet both a clean division and a leftover low down', () => {
    for (const d of [EASIEST, 45]) {
      const remainders = itemsAt(d).map((i) => parts(i.params.dividend!, i.params.divisor!)[1])
      expect(remainders.filter((r) => r === 0).length, `d=${d} never divides exactly`).toBeGreaterThan(0)
      expect(remainders.filter((r) => r > 0).length, `d=${d} always divides exactly`).toBeGreaterThan(0)
    }
  })

  it('always leaves something over in the top two bands', () => {
    // Higher up, the remainder is the point of the question.
    for (const d of [57, 74, 75, HARDEST]) {
      for (const item of itemsAt(d)) {
        const [, remainder] = parts(item.params.dividend!, item.params.divisor!)
        expect(remainder, `d=${d} ${item.prompt}`).toBeGreaterThan(0)
      }
    }
  })

  it('reaches four-digit dividends at the top of the range', () => {
    expect(itemsAt(HARDEST).filter((i) => i.params.dividend! >= 1000).length).toBeGreaterThan(0)
  })

  it('names answering the other part of the answer', () => {
    let named = 0
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const [quotient, remainder] = parts(item.params.dividend!, item.params.divisor!)
        const asksQuotient = item.params.ask === QUOTIENT
        const id = asksQuotient ? 'answered-the-remainder' : 'answered-the-quotient'
        const other = asksQuotient ? remainder : quotient
        const wanted = asksQuotient ? quotient : remainder
        const m = item.misconceptions.find((x) => x.id === id)

        if (other === wanted || (asksQuotient && remainder === 0)) {
          // Two reasons this is not a mistake worth naming. 20 ÷ 9 is 2
          // remainder 2, so whichever part he was asked for the other one is the
          // same number and there is nothing to tell apart — naming it would
          // mean calling a correct answer a known error. And on a clean
          // division, "gave the leftover instead" would be an answer of 0 to
          // "how many groups", which nobody types.
          expect(m, `d=${d} ${item.prompt}`).toBeUndefined()
          continue
        }
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(other))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names stopping before the last whole group', () => {
    // The remainder came out as big as the divisor or bigger, which always means
    // one more group could still have been made. It shows up in the quotient as
    // one too few and in the remainder as one divisor too many.
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { dividend, divisor, ask } = item.params as Record<string, number>
        const [quotient, remainder] = parts(dividend!, divisor!)
        const m = item.misconceptions.find((x) => x.id === 'stopped-too-early')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(
          String(ask === QUOTIENT ? quotient - 1 : remainder + divisor!),
        )
      }
    }
  })

  it('names saying nothing was left over, but only when something was', () => {
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.ask === QUOTIENT) continue
        const [, remainder] = parts(item.params.dividend!, item.params.divisor!)
        const m = item.misconceptions.find((x) => x.id === 'dropped-the-remainder')
        if (remainder === 0) {
          // 0 is the right answer here. Naming it as a mistake would tell him a
          // correct answer is a known error, which is the one thing this app
          // must never do.
          expect(m, item.prompt).toBeUndefined()
          continue
        }
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe('0')
      }
    }
  })

  it('checks itself by multiplying back, in the worked steps', () => {
    // "the relationship between multiplication and division" is in the standard
    // by name, and it is also how he can tell on his own whether he is right.
    for (const d of [EASIEST, 45, 60, HARDEST]) {
      for (const item of itemsAt(d, 20)) {
        const { dividend, divisor } = item.params as Record<string, number>
        const [quotient] = parts(dividend!, divisor!)
        const steps = item.workedSteps.join(' ')
        expect(steps, item.prompt).toContain(`${quotient} × ${divisor} = ${quotient * divisor!}`)
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          item.answer.canonical,
        )
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt6.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt6.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt6.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt6.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt6.generate(66.8, makeRng(4)).difficulty).toBe(66.8)
  })
})
