import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { mt4oa4 } from './mt4oa4'

const TIMES = '×'

/** Redeclared rather than imported: a mismatch with the generator is a bug this file should catch. */
const REMAINDER = 0
const SMALLEST = 1
const PAIRS = 2

const EASIEST = 15
const HARDEST = 90

/**
 * Independent of the generator: trial division over the whole range, every time.
 *
 * The generator never divides. It builds each number by multiplying prime
 * factors it chose, and reads the answer straight off that construction — the
 * count of factor pairs from expanding the factorisation, the smallest divisor
 * from the smallest prime it used. This does the opposite in every case: it
 * takes the finished number, knows nothing about how it was made, and walks
 * every whole number from 1 to n asking which ones go in. Two different
 * algorithms have to agree on every item at every difficulty.
 *
 * The remainder framing goes further and does not divide at all — repeated
 * subtraction, then the two invariants that define a remainder.
 */
function factorsAnswer(p: Record<string, number>): string {
  const n = p.n!

  if (p.ask === PAIRS) {
    const divisors: number[] = []
    for (let k = 1; k <= n; k++) if (n % k === 0) divisors.push(k)
    // A perfect square has a factor pair whose two numbers are the same, and
    // whether that counts as a pair is a fair argument for a ten-year-old to
    // lose. The generator must never ask about one, so an odd divisor count
    // here is a bug in the pool rather than a case to handle.
    expect(divisors.length % 2, `${n} is a perfect square and its pair count is arguable`).toBe(0)
    return String(divisors.length / 2)
  }

  if (p.ask === SMALLEST) {
    for (let k = 2; k <= n; k++) if (n % k === 0) return String(k)
    throw new Error(`nothing divides ${n}`)
  }

  const by = p.by!
  expect(by, `divisor ${by} for ${n}`).toBeGreaterThanOrEqual(2)
  let remainder = n
  let quotient = 0
  while (remainder >= by) {
    remainder -= by
    quotient++
  }
  expect(quotient * by + remainder, `${n} does not rebuild from its parts`).toBe(n)
  expect(remainder, `${n} ÷ ${by} has a negative remainder`).toBeGreaterThanOrEqual(0)
  expect(remainder, `${n} ÷ ${by} has a remainder as big as the divisor`).toBeLessThan(by)
  return String(remainder)
}

function rebuildPrompt(p: Record<string, number>): string {
  const n = p.n!
  if (p.ask === PAIRS) {
    return `How many factor pairs does ${n} have? Count 1 ${TIMES} ${n} as one of them.`
  }
  if (p.ask === SMALLEST) {
    return (
      `What is the smallest number bigger than 1 that divides ${n} evenly? ` +
      `If nothing but ${n} itself divides it, then ${n} is prime and the answer is ${n}.`
    )
  }
  return (
    `Is ${n} a multiple of ${p.by}? Give the remainder when ${n} is divided by ${p.by} — ` +
    `a remainder of 0 means yes.`
  )
}

function itemsAt(difficulty: number, seeds = 120) {
  return Array.from({ length: seeds }, (_, s) => mt4oa4.generate(difficulty, makeRng(s)))
}

/** The quotient and remainder, by repeated subtraction. */
function parts(n: number, by: number): [number, number] {
  let remainder = n
  let quotient = 0
  while (remainder >= by) {
    remainder -= by
    quotient++
  }
  return [quotient, remainder]
}

function isPrime(n: number): boolean {
  if (n < 2) return false
  for (let k = 2; k < n; k++) if (n % k === 0) return false
  return true
}

describe('MT.4.OA.4 factors, multiples, prime and composite', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4oa4, factorsAnswer, { promptParams: ['n'], rebuildPrompt })
  })

  it('never asks how many factor pairs a perfect square has', () => {
    // 36 is 1 × 36, 2 × 18, 3 × 12, 4 × 9, 6 × 6. Whether that last one is a
    // pair is a genuinely arguable point, and a child who decides it is not has
    // done nothing wrong. Squares are kept out of this framing entirely rather
    // than marked against him.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.ask !== PAIRS) continue
        const root = Math.round(Math.sqrt(item.params.n!))
        expect(root * root, item.prompt).not.toBe(item.params.n!)
      }
    }
  })

  it('keeps factor pairs and primality inside 1-100, and multiples inside 1-1000', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { n, ask, by } = item.params as Record<string, number>
        if (ask === REMAINDER) {
          expect(n, item.prompt).toBeLessThanOrEqual(1000)
          expect(by, item.prompt).toBeGreaterThanOrEqual(2)
          expect(by, item.prompt).toBeLessThanOrEqual(9)
        } else {
          expect(n, item.prompt).toBeLessThanOrEqual(100)
          expect(n, item.prompt).toBeGreaterThanOrEqual(2)
        }
      }
    }
  })

  it('uses all three framings, and only the two easiest in the easiest band', () => {
    // Naming the smallest divisor is the primality question in disguise, and it
    // is a second idea on top of "what divides this". The easiest band leaves
    // it out.
    expect(new Set(itemsAt(EASIEST).map((i) => i.params.ask))).toEqual(new Set([PAIRS, REMAINDER]))
    for (const d of [40, 65, HARDEST]) {
      expect(new Set(itemsAt(d).map((i) => i.params.ask)), `d=${d}`).toEqual(
        new Set([PAIRS, SMALLEST, REMAINDER]),
      )
    }
  })

  it('asks about primes, where the smallest divisor is the number itself', () => {
    // The framing exists to test primality numerically. If a prime never turned
    // up, the answer would always be smaller than the number and the case the
    // question was built for would never be met.
    for (const d of [40, 65, HARDEST]) {
      const smallest = itemsAt(d).filter((i) => i.params.ask === SMALLEST)
      const primes = smallest.filter((i) => isPrime(i.params.n!))
      expect(primes.length, `d=${d} never asks about a prime`).toBeGreaterThan(0)
      expect(smallest.length - primes.length, `d=${d} only asks about primes`).toBeGreaterThan(0)
      for (const item of primes) {
        expect(item.answer.canonical, item.prompt).toBe(String(item.params.n!))
      }
    }
  })

  it('makes the child work past 2 in the harder bands', () => {
    // "Is it even?" answers the smallest-divisor question for half of all
    // numbers. Higher up, every number is odd, so it never does.
    for (const d of [65, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (item.params.ask !== SMALLEST) continue
        expect(item.params.n! % 2, `d=${d} ${item.prompt}`).toBe(1)
      }
    }
  })

  it('asks about numbers that are multiples and numbers that are not', () => {
    // A question whose answer is always 0 teaches "type 0", and a question whose
    // answer is never 0 teaches that nothing is ever a multiple.
    for (const d of [EASIEST, 40, 65, HARDEST]) {
      const remainders = itemsAt(d)
        .filter((i) => i.params.ask === REMAINDER)
        .map((i) => parts(i.params.n!, i.params.by!)[1])
      expect(remainders.filter((r) => r === 0).length, `d=${d} nothing is a multiple`).toBeGreaterThan(0)
      expect(remainders.filter((r) => r > 0).length, `d=${d} everything is a multiple`).toBeGreaterThan(0)
    }
  })

  it('names counting the factors instead of the pairs', () => {
    let named = 0
    for (const d of [EASIEST, 40, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (item.params.ask !== PAIRS) continue
        const m = item.misconceptions.find((x) => x.id === 'counted-factors-not-pairs')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(2 * Number(item.answer.canonical)))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names answering 1 to a question that rules 1 out', () => {
    let named = 0
    for (const d of [40, 65, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (item.params.ask !== SMALLEST) continue
        const m = item.misconceptions.find((x) => x.id === 'answered-one')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe('1')
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('never names the number itself as a mistake when the number is prime', () => {
    // For a prime, answering the number *is* the answer. Naming it would be the
    // one thing this app must never do.
    for (const d of [40, 65, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (item.params.ask !== SMALLEST) continue
        const named = item.misconceptions.find((x) => x.signature === String(item.params.n!))
        if (isPrime(item.params.n!)) expect(named, item.prompt).toBeUndefined()
      }
    }
  })

  it('shows the factor pairs it is counting', () => {
    for (const d of [EASIEST, 40, HARDEST]) {
      for (const item of itemsAt(d, 30)) {
        if (item.params.ask !== PAIRS) continue
        const steps = item.workedSteps.join(' ')
        expect(steps, item.prompt).toContain(`1 ${TIMES} ${item.params.n}`)
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          item.answer.canonical,
        )
      }
    }
  })

  it('agrees in number when it counts pairs', () => {
    // "1 factor pairs" is the failure mode nothing else in here can see: every
    // number is right and the sentence is still wrong.
    for (let d = EASIEST; d <= HARDEST; d += 2) {
      for (const item of itemsAt(d, 40)) {
        const text = [
          item.prompt,
          ...item.workedSteps,
          ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
        ].join('\n')
        for (const m of text.matchAll(/(\d+) factor pairs\b/g)) {
          expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
        }
        for (const m of text.matchAll(/(\d+) factor pair\b/g)) {
          expect(m[1], `"${m[0]}" at d=${d}`).toBe('1')
        }
        // Only the noun. `divides` reads as a verb here — "1 divides every
        // number" is correct English and catching it would be a false alarm.
        for (const m of text.matchAll(/(\d+) factors\b/g)) {
          expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
        }
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4oa4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa4.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa4.generate(51.6, makeRng(4)).difficulty).toBe(51.6)
  })
})
