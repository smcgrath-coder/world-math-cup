import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  CLOSER_TO_HALF,
  CLOSER_TO_ONE,
  COMMON_DENOMINATOR,
  CONTEXTS,
  GREATER,
  NAMES,
  SMALLER,
  WORD_LESS,
  WORD_MORE,
  mt4nf2,
} from './mt4nf2'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

interface Pair {
  n1: number
  d1: number
  n2: number
  d2: number
}

/**
 * The greater of the two, by the standard's own first method, in whole numbers.
 *
 * "Compare two fractions ... by creating common denominators". So put both over
 * the least common denominator and compare the two top numbers as integers.
 * This touches no `Rational` method at all — in particular not `compare`, which
 * is what the generator uses, and whose body (`n1 × d2 − n2 × d1`) is exactly
 * the cross-multiplication shortcut a lazy `verify` would reach for. Expanding
 * to the LCM first is a different computation reaching the same truth.
 */
function greaterOf({ n1, d1, n2, d2 }: Pair): string {
  const common = lcm(d1, d2)
  const left = n1 * (common / d1)
  const right = n2 * (common / d2)
  return left > right ? `${n1}/${d1}` : `${n2}/${d2}`
}

/**
 * The smallest number both denominators go into, found by walking multiples of
 * the larger one.
 *
 * Deliberately not `d1 × d2 ÷ gcd`, which is what the generator computes. This
 * is the definition read literally: try 8, then 16, then 24, and stop at the
 * first one 5 also goes into.
 */
function lcm(a: number, b: number): number {
  const big = Math.max(a, b)
  const small = Math.min(a, b)
  for (let candidate = big; ; candidate += big) {
    if (candidate % small === 0) return candidate
  }
}

/**
 * The one of the two that sits closer to a half.
 *
 * A fraction's distance from 1/2 is |2n − d| ÷ 2d, so comparing two of them is
 * comparing |2n1 − d1| × d2 against |2n2 − d2| × d1. Whole numbers throughout,
 * and nothing here subtracts fractions the way the generator does.
 */
function closerToHalf({ n1, d1, n2, d2 }: Pair): string {
  const first = Math.abs(2 * n1 - d1) * d2
  const second = Math.abs(2 * n2 - d2) * d1
  return first < second ? `${n1}/${d1}` : `${n2}/${d2}`
}

/** Independent of the generator, one route per format. */
const answerFrom = (p: Record<string, number>) => {
  const pair = p as unknown as Pair
  switch (p.format) {
    case GREATER:
    case WORD_MORE:
      return greaterOf(pair)
    // Both fractions are proper, so the one closer to a whole one is simply the
    // greater one. Reached the same way, because the truth is the same truth.
    case CLOSER_TO_ONE:
      return greaterOf(pair)
    case SMALLER:
    case WORD_LESS: {
      const greater = greaterOf(pair)
      return greater === `${pair.n1}/${pair.d1}` ? `${pair.n2}/${pair.d2}` : `${pair.n1}/${pair.d1}`
    }
    case CLOSER_TO_HALF:
      return closerToHalf(pair)
    case COMMON_DENOMINATOR:
      return String(lcm(pair.d1, pair.d2))
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

const rebuildPrompt = (p: Record<string, number>) => {
  const { n1, d1, n2, d2 } = p
  switch (p.format) {
    case GREATER:
      return `Which is greater: ${n1}/${d1} or ${n2}/${d2}?`
    case SMALLER:
      return `Which is smaller: ${n1}/${d1} or ${n2}/${d2}?`
    case CLOSER_TO_HALF:
      return `Which is closer to 1/2: ${n1}/${d1} or ${n2}/${d2}?`
    case CLOSER_TO_ONE:
      return `Which is closer to 1 whole: ${n1}/${d1} or ${n2}/${d2}?`
    case COMMON_DENOMINATOR:
      return (
        `To compare ${n1}/${d1} and ${n2}/${d2} you can give them the same bottom number. ` +
        `What is the smallest number that both ${d1} and ${d2} go into?`
      )
    case WORD_MORE:
    case WORD_LESS: {
      const first = NAMES[p.nameA!]
      const second = NAMES[p.nameB!]
      const { thing, past } = CONTEXTS[p.context!]!
      const which = p.format === WORD_MORE ? 'bigger' : 'smaller'
      return (
        `${first} ${past} ${n1}/${d1} of a ${thing}. ${second} ${past} ${n2}/${d2} of another ` +
        `${thing} the same size. Which is the ${which} amount, ${n1}/${d1} or ${n2}/${d2}?`
      )
    }
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** Every item at `difficulty` over a fixed span of seeds. */
function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf2.generate(difficulty, makeRng(s)))
}

/** -1, 0 or 1 as the fraction is below, exactly on, or above one half. */
function versusHalf(n: number, d: number): number {
  return Math.sign(n * 2 - d)
}

const EASIEST = 8
const HARDEST = 78

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/** The formats where the answer is one of the two fractions on screen. */
const TWO_FRACTION_FORMATS = [GREATER, SMALLER, CLOSER_TO_HALF, CLOSER_TO_ONE, WORD_MORE, WORD_LESS]

describe('MT.4.NF.2 comparing two fractions', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf2, answerFrom, {
      promptParams: ['n1', 'd1', 'n2', 'd2'],
      rebuildPrompt,
    })
  })

  it('never asks him to compare two fractions that are equal', () => {
    // The prompt promises one of them is greater. If they were equal there
    // would be no right answer at all, and he would be marked wrong whatever
    // he typed.
    for (const item of everyItem()) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(new R(n1!, d1!).equals(new R(n2!, d2!)), item.prompt).toBe(false)
    }
  })

  it('always uses different numerators and different denominators', () => {
    // The standard asks for exactly this. Matching either number turns the
    // question into a one-glance comparison and stops testing the standard.
    for (const item of everyItem()) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(n1, item.prompt).not.toBe(n2)
      expect(d1, item.prompt).not.toBe(d2)
    }
  })

  it('shows both fractions proper and in lowest terms', () => {
    // He is asked to type one of the two back. If a displayed fraction were not
    // in lowest terms, copying it exactly would trip the "unreduced" nudge on
    // an answer the question told him to give.
    for (const item of everyItem()) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(gcd(n1!, d1!), item.prompt).toBe(1)
      expect(gcd(n2!, d2!), item.prompt).toBe(1)
      expect(n1, item.prompt).toBeLessThan(d1!)
      expect(n2, item.prompt).toBeLessThan(d2!)
    }
  })

  it('asks seven genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard he was right: there was exactly one sentence, "which is greater".
    const items = everyItem()
    const shapes = new Map<string, number>()
    const formats = new Map<number, number>()
    for (const item of items) {
      const key = shape(item.prompt)
      shapes.set(key, (shapes.get(key) ?? 0) + 1)
      formats.set(item.params.format!, (formats.get(item.params.format!) ?? 0) + 1)
    }

    expect(shapes.size).toBeGreaterThanOrEqual(6)
    for (const [key, count] of shapes) {
      expect(count / items.length, `"${key}" is ${((count / items.length) * 100).toFixed(0)}% of items`)
        .toBeLessThan(0.35)
    }
    // Formats, not just wordings: seven sentences that were really one question
    // would pass the check above and fail the point of it.
    expect(formats.size).toBe(7)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('answers with one of the two fractions on screen, except when it asks for a number', () => {
    for (const item of everyItem()) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      if (item.params.format === COMMON_DENOMINATOR) {
        expect(R.parse(item.answer.canonical)!.isInteger(), item.prompt).toBe(true)
      } else {
        expect([`${n1}/${d1}`, `${n2}/${d2}`], item.prompt).toContain(item.answer.canonical)
      }
    }
  })

  it('never asks which is closer to 1/2 about a fraction that is exactly 1/2', () => {
    // The answer would be sitting in the question, and a child who spotted that
    // would have learnt something about question-writing rather than fractions.
    for (const item of everyItem().filter((i) => i.params.format === CLOSER_TO_HALF)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(versusHalf(n1!, d1!), item.prompt).not.toBe(0)
      expect(versusHalf(n2!, d2!), item.prompt).not.toBe(0)
      // And never a pair sitting the same distance either side of it: 1/4 and
      // 3/4 have no closer one, so the question would have no right answer.
      expect(Math.abs(2 * n1! - d1!) * d2!, item.prompt).not.toBe(Math.abs(2 * n2! - d2!) * d1!)
    }
  })

  it('keeps the two hardest framings out of the easiest band', () => {
    // Asking for a common denominator, and asking about the smaller amount in a
    // word problem, both need the comparison plus something else on top.
    const easyFormats = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easyFormats.has(COMMON_DENOMINATOR)).toBe(false)
    expect(easyFormats.has(CLOSER_TO_ONE)).toBe(false)
    expect(easyFormats.has(GREATER)).toBe(true)
  })

  it('lets the half benchmark settle every question in the easiest band', () => {
    // Band one exists to reward "is it more or less than a half?", so the two
    // fractions always land on opposite sides of it.
    for (const item of itemsAt(EASIEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(versusHalf(n1!, d1!), item.prompt).not.toBe(versusHalf(n2!, d2!))
    }
  })

  it('keeps the easiest band on denominators that go into each other', () => {
    for (const item of itemsAt(EASIEST)) {
      const { d1, d2 } = item.params as Record<string, number>
      expect(d1! % d2! === 0 || d2! % d1! === 0, item.prompt).toBe(true)
    }
  })

  it('denies the half benchmark in the hardest band', () => {
    // Both above a half, or both below it, so the shortcut cannot decide and
    // he has to actually make common denominators.
    for (const item of itemsAt(HARDEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(versusHalf(n1!, d1!), item.prompt).toBe(versusHalf(n2!, d2!))
      expect(versusHalf(n1!, d1!), item.prompt).not.toBe(0)
    }
  })

  it('makes the hardest band share no factor and stay close together', () => {
    for (const item of itemsAt(HARDEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(gcd(d1!, d2!), item.prompt).toBe(1)
      const gap = new R(n1!, d1!).sub(new R(n2!, d2!))
      expect(Math.abs(gap.toNumber()), item.prompt).toBeLessThanOrEqual(1 / 8)
    }
  })

  it('names the other fraction as the one wrong answer there is', () => {
    // With two fractions on screen and one of them wanted back, there is
    // exactly one wrong value a child can mean to type. Naming two mistakes
    // would mean two names for the same answer, which is a coin flip dressed
    // up as a diagnosis.
    for (const item of everyItem()) {
      if (!TWO_FRACTION_FORMATS.includes(item.params.format!)) continue
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      const correct = item.answer.canonical
      const other = correct === `${n1}/${d1}` ? `${n2}/${d2}` : `${n1}/${d1}`
      expect(item.misconceptions, item.prompt).toHaveLength(1)
      expect(item.misconceptions[0]!.signature, item.prompt).toBe(other)
    }
  })

  it('blames the bottom number only when the bottom number is the trap', () => {
    // "Bigger bottom number means bigger fraction" is only a live explanation
    // when the smaller fraction is the one with the bigger denominator, and only
    // on the formats where the wrong answer *is* the smaller fraction.
    let denominatorTraps = 0
    let noTrap = 0
    for (const item of everyItem()) {
      if (![GREATER, WORD_MORE, CLOSER_TO_ONE].includes(item.params.format!)) continue
      const { n1, d1, d2 } = item.params as Record<string, number>
      const loserIsFirst = item.answer.canonical !== `${n1}/${d1}`
      const loserDen = loserIsFirst ? d1! : d2!
      const winnerDen = loserIsFirst ? d2! : d1!
      const id = item.misconceptions[0]!.id

      if (loserDen > winnerDen) {
        denominatorTraps++
        expect(['bigger-denominator-wins', 'bigger-numbers-win'], item.prompt).toContain(id)
      } else {
        noTrap++
        expect(id, item.prompt).toBe('picked-the-smaller')
      }
    }
    // Both shapes have to actually occur, or one of these branches is dead code
    // that the test is quietly certifying.
    expect(denominatorTraps).toBeGreaterThan(0)
    expect(noTrap).toBeGreaterThan(0)
  })

  it('calls it whole-number thinking only when both of the losing numbers are bigger', () => {
    let seen = 0
    for (const item of everyItem()) {
      if (![GREATER, WORD_MORE].includes(item.params.format!)) continue
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      const loserIsFirst = item.answer.canonical !== `${n1}/${d1}`
      const loser = loserIsFirst ? [n1!, d1!] : [n2!, d2!]
      const winner = loserIsFirst ? [n2!, d2!] : [n1!, d1!]
      const bothBigger = loser[0]! > winner[0]! && loser[1]! > winner[1]!
      if (item.misconceptions[0]!.id === 'bigger-numbers-win') {
        seen++
        expect(bothBigger, item.prompt).toBe(true)
      } else {
        expect(bothBigger, item.prompt).toBe(false)
      }
    }
    expect(seen, 'whole-number thinking never came up').toBeGreaterThan(0)
  })

  it('names size-instead-of-distance on the benchmark question, in the right direction', () => {
    // A child who reads "closest to 1/2" as "biggest" and one who reads it as
    // "smallest" have made different mistakes, and the arithmetic says which of
    // the two is even possible on this pair.
    let bigger = 0
    let smaller = 0
    for (const item of everyItem().filter((i) => i.params.format === CLOSER_TO_HALF)) {
      const wrong = item.misconceptions[0]!
      const isGreater = wrong.signature === greaterOf(item.params as unknown as Pair)
      if (isGreater) {
        bigger++
        expect(wrong.id, item.prompt).toBe('bigger-not-closer')
      } else {
        smaller++
        expect(wrong.id, item.prompt).toBe('smaller-not-closer')
      }
    }
    expect(bigger).toBeGreaterThan(0)
    expect(smaller).toBeGreaterThan(0)
  })

  it('names the wrong ways to a common denominator, and only the possible ones', () => {
    // Multiplying the two denominators always gives *a* common denominator, so
    // it is only a mistake when it is not the smallest one. Taking the bigger
    // denominator is only a mistake when the smaller one does not go into it.
    // Naming either where it happens to be right would mean telling him a
    // correct answer is a known error.
    let multiplied = 0
    let tookBigger = 0
    for (const item of everyItem().filter((i) => i.params.format === COMMON_DENOMINATOR)) {
      const { d1, d2 } = item.params as Record<string, number>
      const answer = lcm(d1!, d2!)
      const ids = item.misconceptions.map((m) => m.id)
      expect(ids, item.prompt).toContain('added-the-bottom-numbers')
      expect(item.misconceptions.find((m) => m.id === 'added-the-bottom-numbers')!.signature).toBe(
        String(d1! + d2!),
      )
      if (d1! * d2! === answer) {
        expect(ids, item.prompt).not.toContain('multiplied-the-bottom-numbers')
      } else {
        multiplied++
        expect(ids, item.prompt).toContain('multiplied-the-bottom-numbers')
      }
      if (Math.max(d1!, d2!) === answer) {
        expect(ids, item.prompt).not.toContain('took-the-bigger-bottom-number')
      } else {
        tookBigger++
        expect(ids, item.prompt).toContain('took-the-bigger-bottom-number')
      }
    }
    expect(multiplied).toBeGreaterThan(0)
    expect(tookBigger).toBeGreaterThan(0)
  })

  it('never names two different children in the same word problem', () => {
    const words = everyItem().filter((i) => [WORD_MORE, WORD_LESS].includes(i.params.format!))
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) expect(item.params.nameA, item.prompt).not.toBe(item.params.nameB)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf2.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf2.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nf2.generate(-8, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf2.generate(52.3, makeRng(4)).difficulty).toBe(52.3)
  })
})
