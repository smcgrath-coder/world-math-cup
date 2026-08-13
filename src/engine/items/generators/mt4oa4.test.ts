import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { ROW_CONTEXTS, mt4oa4 } from './mt4oa4'

const TIMES = '×'

/** Redeclared rather than imported: a mismatch with the generator is a bug this file should catch. */
const REMAINDER = 0
const SMALLEST = 1
const PAIRS = 2
const FACTOR_COUNT = 3
const NEXT_MULTIPLE = 4
const BIGGEST_PARTNER = 5
const WORD_ROWS = 6

const EASIEST = 15
const HARDEST = 90

/** Every whole number that divides `n`, by trying all of them. */
function divisorsOf(n: number): number[] {
  const out: number[] = []
  for (let k = 1; k <= n; k++) if (n % k === 0) out.push(k)
  return out
}

/**
 * Independent of the generator: trial division over the whole range, every time.
 *
 * The generator never divides. It builds each number by multiplying prime
 * factors it chose, and reads the answer straight off that construction — the
 * count of factor pairs from expanding the factorisation, the smallest divisor
 * from the smallest prime it used, the biggest factor below `n` from dividing by
 * that prime. This does the opposite in every case: it takes the finished
 * number, knows nothing about how it was made, and walks every whole number from
 * 1 to n asking which ones go in. Two different algorithms have to agree on
 * every item at every difficulty.
 *
 * The two framings built on multiples go further and do not divide at all —
 * repeated subtraction and repeated addition.
 */
function factorsAnswer(p: Record<string, number>): string {
  const n = p.n!

  if (p.format === PAIRS || p.format === FACTOR_COUNT || p.format === WORD_ROWS) {
    const divisors = divisorsOf(n)
    // A perfect square has a factor pair whose two numbers are the same, and
    // whether that counts as a pair is a fair argument for a ten-year-old to
    // lose. The generator must never ask about one, so an odd divisor count
    // here is a bug in the pool rather than a case to handle.
    expect(divisors.length % 2, `${n} is a perfect square and its pair count is arguable`).toBe(0)
    return String(p.format === PAIRS ? divisors.length / 2 : divisors.length)
  }

  if (p.format === SMALLEST) {
    for (let k = 2; k <= n; k++) if (n % k === 0) return String(k)
    throw new Error(`nothing divides ${n}`)
  }

  if (p.format === BIGGEST_PARTNER) {
    // Walked down from just below the number, so this finds the biggest factor
    // directly rather than by dividing by the smallest one.
    for (let k = n - 1; k >= 1; k--) if (n % k === 0) return String(k)
    throw new Error(`nothing divides ${n}`)
  }

  const by = p.by!
  expect(by, `divisor ${by} for ${n}`).toBeGreaterThanOrEqual(2)

  if (p.format === NEXT_MULTIPLE) {
    // Counting up in `by`s until the count passes `n`, which is what "the next
    // multiple after" means.
    let multiple = by
    while (multiple <= n) multiple += by
    return String(multiple)
  }

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

/** `1 chair`, `24 chairs`. Shared words, never shared arithmetic. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function rebuildPrompt(p: Record<string, number>): string {
  const n = p.n!
  switch (p.format) {
    case PAIRS:
      return `How many factor pairs does ${n} have? Count 1 ${TIMES} ${n} as one of them.`
    case FACTOR_COUNT:
      return `How many factors does ${n} have? Count 1 and ${n} as two of them.`
    case SMALLEST:
      return (
        `What is the smallest number bigger than 1 that divides ${n} evenly? ` +
        `If nothing but ${n} itself divides it, then ${n} is prime and the answer is ${n}.`
      )
    case NEXT_MULTIPLE:
      return `What is the next multiple of ${p.by} after ${n}?`
    case BIGGEST_PARTNER:
      return `What is the biggest factor of ${n} that is not ${n} itself?`
    case WORD_ROWS: {
      const c = ROW_CONTEXTS[p.context!]!
      return (
        `${count(n, c.item, c.items)} are ${c.verb} in equal rows with none left over. ` +
        `How many different numbers could be in each row? Count 1 and ${n} as two of them.`
      )
    }
    default:
      return (
        `Is ${n} a multiple of ${p.by}? Give the remainder when ${n} is divided by ${p.by} — ` +
        `a remainder of 0 means yes.`
      )
  }
}

function itemsAt(difficulty: number, seeds = 120) {
  return Array.from({ length: seeds }, (_, s) => mt4oa4.generate(difficulty, makeRng(s)))
}

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 100))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

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

  it('asks seven genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard there were three sentences, each about a third of everything he
    // saw.
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
      expect(
        count / items.length,
        `"${key}" is ${((count / items.length) * 100).toFixed(0)}% of items`,
      ).toBeLessThan(0.35)
    }
    // Formats, not just wordings: seven sentences that were really one question
    // would pass the check above and fail the point of it.
    expect(formats.size).toBe(7)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('never asks how many factor pairs a perfect square has', () => {
    // 36 is 1 × 36, 2 × 18, 3 × 12, 4 × 9, 6 × 6. Whether that last one is a
    // pair is a genuinely arguable point, and a child who decides it is not has
    // done nothing wrong. Squares are kept out of this framing entirely rather
    // than marked against him. Counting *factors* has no such argument, but it
    // draws from the same pool so that the mistake of halving the count stays a
    // whole number.
    for (const item of everyItem()) {
      if (![PAIRS, FACTOR_COUNT, WORD_ROWS].includes(item.params.format!)) continue
      const root = Math.round(Math.sqrt(item.params.n!))
      expect(root * root, item.prompt).not.toBe(item.params.n!)
    }
  })

  it('keeps factor work inside 1-100, and multiples inside 1-1000', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { n, format, by } = item.params as Record<string, number>
        if (format === REMAINDER || format === NEXT_MULTIPLE) {
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

  it('keeps the two framings that need a factor found first out of the easiest band', () => {
    // Naming the smallest divisor is the primality question in disguise, and it
    // is a second idea on top of "what divides this". The biggest factor below
    // the number needs that same search *and* its partner.
    const easy = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easy.has(SMALLEST)).toBe(false)
    expect(easy.has(BIGGEST_PARTNER)).toBe(false)
    expect(easy.has(PAIRS)).toBe(true)
    expect(easy.has(FACTOR_COUNT)).toBe(true)
    for (const d of [40, 65, HARDEST]) {
      expect(new Set(itemsAt(d, 200).map((i) => i.params.format)).size, `d=${d}`).toBe(7)
    }
  })

  it('asks about primes, where the smallest divisor is the number itself', () => {
    // The framing exists to test primality numerically. If a prime never turned
    // up, the answer would always be smaller than the number and the case the
    // question was built for would never be met.
    for (const d of [40, 65, HARDEST]) {
      const smallest = itemsAt(d).filter((i) => i.params.format === SMALLEST)
      const primes = smallest.filter((i) => isPrime(i.params.n!))
      expect(primes.length, `d=${d} never asks about a prime`).toBeGreaterThan(0)
      expect(smallest.length - primes.length, `d=${d} only asks about primes`).toBeGreaterThan(0)
      for (const item of primes) {
        expect(item.answer.canonical, item.prompt).toBe(String(item.params.n!))
      }
    }
  })

  it('never asks for the biggest factor of a prime', () => {
    // The answer would be 1, which is true and teaches nothing about factor
    // pairs — the pair is 1 × itself and there is no partner to find.
    const asked = everyItem().filter((i) => i.params.format === BIGGEST_PARTNER)
    expect(asked.length).toBeGreaterThan(0)
    for (const item of asked) {
      expect(isPrime(item.params.n!), item.prompt).toBe(false)
      expect(Number(item.answer.canonical), item.prompt).toBeGreaterThan(1)
      expect(Number(item.answer.canonical), item.prompt).toBeLessThan(item.params.n!)
    }
  })

  it('only asks for the next multiple after a number that is not one already', () => {
    // "The next multiple of 7 after 49" invites an argument about whether 49
    // counts, and a child who says 49 has read the question a way it can be
    // read. Every number asked about sits between two multiples instead.
    const asked = everyItem().filter((i) => i.params.format === NEXT_MULTIPLE)
    expect(asked.length).toBeGreaterThan(0)
    for (const item of asked) {
      const { n, by } = item.params as Record<string, number>
      const [, remainder] = parts(n!, by!)
      expect(remainder, item.prompt).toBeGreaterThan(0)
      const answer = Number(item.answer.canonical)
      expect(answer % by!, item.prompt).toBe(0)
      expect(answer, item.prompt).toBeGreaterThan(n!)
      expect(answer - by!, item.prompt).toBeLessThan(n!)
    }
  })

  it('makes the child work past 2 in the harder bands', () => {
    // "Is it even?" answers the smallest-divisor question for half of all
    // numbers. Higher up, every number is odd, so it never does.
    for (const d of [65, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (![SMALLEST, BIGGEST_PARTNER].includes(item.params.format!)) continue
        expect(item.params.n! % 2, `d=${d} ${item.prompt}`).toBe(1)
      }
    }
  })

  it('asks about numbers that are multiples and numbers that are not', () => {
    // A question whose answer is always 0 teaches "type 0", and a question whose
    // answer is never 0 teaches that nothing is ever a multiple.
    for (const d of [EASIEST, 40, 65, HARDEST]) {
      const remainders = itemsAt(d)
        .filter((i) => i.params.format === REMAINDER)
        .map((i) => parts(i.params.n!, i.params.by!)[1])
      expect(remainders.filter((r) => r === 0).length, `d=${d} nothing is a multiple`).toBeGreaterThan(0)
      expect(remainders.filter((r) => r > 0).length, `d=${d} everything is a multiple`).toBeGreaterThan(0)
    }
  })

  it('names counting the factors instead of the pairs, and halving them the other way', () => {
    // The two questions are one step apart and the confusion runs both ways, so
    // each names the other as a mistake.
    let pairs = 0
    let factors = 0
    for (const item of everyItem()) {
      const format = item.params.format!
      const answer = Number(item.answer.canonical)
      if (format === PAIRS) {
        const m = item.misconceptions.find((x) => x.id === 'counted-factors-not-pairs')
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(2 * answer))
        pairs++
      }
      if (format === FACTOR_COUNT || format === WORD_ROWS) {
        const m = item.misconceptions.find((x) => x.id === 'counted-the-pairs')
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(answer / 2))
        factors++
      }
    }
    expect(pairs).toBeGreaterThan(0)
    expect(factors).toBeGreaterThan(0)
  })

  it('names answering 1 to a question that rules 1 out', () => {
    let named = 0
    for (const d of [40, 65, HARDEST]) {
      for (const item of itemsAt(d, 60)) {
        if (item.params.format !== SMALLEST) continue
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
        if (item.params.format !== SMALLEST) continue
        const named = item.misconceptions.find((x) => x.signature === String(item.params.n!))
        if (isPrime(item.params.n!)) expect(named, item.prompt).toBeUndefined()
      }
    }
  })

  it('gives every item at least one wrong answer it could really produce', () => {
    for (const item of everyItem()) {
      expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
      for (const m of item.misconceptions) {
        expect(m.signature, item.prompt).not.toBe(item.answer.canonical)
      }
    }
  })

  it('shows the factor pairs it is counting', () => {
    for (const item of everyItem()) {
      if (![PAIRS, FACTOR_COUNT, WORD_ROWS].includes(item.params.format!)) continue
      const steps = item.workedSteps.join(' ')
      expect(steps, item.prompt).toContain(`1 ${TIMES} ${item.params.n}`)
    }
  })

  it('ends every working on the number the question asked for', () => {
    for (const item of everyItem()) {
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
        item.answer.canonical,
      )
    }
  })

  it('agrees in number when it counts pairs, factors and rows', () => {
    // "1 factor pairs" is the failure mode nothing else in here can see: every
    // number is right and the sentence is still wrong.
    for (let d = EASIEST; d <= HARDEST; d += 2) {
      for (const item of itemsAt(d, 40)) {
        const text = [
          item.prompt,
          ...item.workedSteps,
          ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
        ].join('\n')
        // Both directions at once: the noun has to be plural exactly when the
        // count is not 1. `factor` needs the lookahead because "3 factor pairs"
        // would otherwise read as a plural count of a singular "factor", and
        // `divides` is left alone on purpose — "1 divides every number" is
        // correct English and catching it would be a false alarm.
        const nouns = [/(\d+) (factor pairs?)\b/g, /(\d+) (factors?)\b(?! pair)/g, /(\d+) (row lengths?)\b/g]
        for (const noun of nouns) {
          for (const m of text.matchAll(noun)) {
            expect(m[2]!.endsWith('s'), `"${m[0]}" at d=${d}`).toBe(m[1] !== '1')
          }
        }
      }
    }
  })

  it('uses every row context, and keeps the situation with its number', () => {
    const rows = everyItem().filter((i) => i.params.format === WORD_ROWS)
    expect(rows.length).toBeGreaterThan(0)
    for (const item of rows) {
      const c = ROW_CONTEXTS[item.params.context!]!
      expect(item.prompt, item.prompt).toContain(`${item.params.n} ${c.items}`)
      expect(item.prompt, item.prompt).toContain(c.verb)
    }
    expect(new Set(rows.map((i) => i.params.context)).size).toBe(ROW_CONTEXTS.length)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4oa4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa4.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa4.generate(51.6, makeRng(4)).difficulty).toBe(51.6)
  })
})
