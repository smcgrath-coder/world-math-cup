/**
 * MT.4.OA.4 — factor pairs, multiples, prime and composite.
 *
 * "Find all factor pairs for a whole number in the range 1-100, recognize that a
 * whole number is a multiple of each of its factors, determine whether a given
 * whole number in the range 1-1000 is a multiple of a given one-digit number,
 * and determine whether a given whole number in the range 1-100 is prime or
 * composite."
 *
 * Four things in one sentence, and none of them is naturally a single number.
 * `AnswerSpec` grades one value, so each is asked in the form that already has a
 * numeric answer rather than by stretching the answer type:
 *
 *  - *"How many factor pairs does 24 have?"* — finding all of them is the work;
 *    saying how many is the proof that he found all of them.
 *  - *"What is the smallest number bigger than 1 that divides 51 evenly?"* —
 *    this is the prime-or-composite question, done numerically. The answer is
 *    the number itself exactly when the number is prime, so the two cases are
 *    the same question and he never has to guess which one is being asked.
 *  - *"Is 348 a multiple of 6? Give the remainder."* — 0 means yes. The
 *    remainder carries the answer and also says how far off it was, which "no"
 *    does not.
 *
 * Numbers are built from their prime factors upwards — a multiset of primes is
 * chosen and multiplied together — so the factorisation is known before the
 * number exists and every answer is read off the construction rather than
 * recovered from it. Nothing in here divides except to lay out working for the
 * child. The remainder framing is built backwards the same way, from a quotient,
 * a divisor and a remainder, so `0 <= remainder < divisor` holds by construction.
 *
 * Perfect squares are deliberately excluded from the factor-pair framing. 36 is
 * 1 × 36, 2 × 18, 3 × 12, 4 × 9 and 6 × 6, and whether that last one is a pair
 * is a fair argument for a ten-year-old to lose. Marking him wrong when he is
 * right is the worst thing this software can do, so the case is not asked.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN and U+2212 MINUS SIGN, not the letter x and not a
 * hyphen. Prompt text is display-only — `checkAnswer` never sees it — so this
 * cannot affect grading, and they are the signs on his worksheets.
 */
const TIMES = '×'
const MINUS = '−'

/** Which question this item asks. */
const REMAINDER = 0
const SMALLEST = 1
const PAIRS = 2

const RANGE: [number, number] = [15, 90]

/** Every prime up to 100, which is as far as this standard reaches. */
const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
] as const

/**
 * The four difficulty bands, easiest first.
 *
 * `asks` is the first dial: the bottom band leaves out the smallest-divisor
 * framing, because deciding a number is prime means proving a negative — you
 * have to run out of things to try — and the easiest band should be measuring
 * one thing.
 *
 * After that each framing has its own dial, because they get hard in different
 * ways. Factor pairs get hard as the number acquires more of them. The smallest
 * divisor gets hard when the number is odd, since "is it even" answers half of
 * all cases for free — so from the third band up every number is odd and he has
 * to keep going. Multiples get hard as the number grows towards the 1000 the
 * standard names.
 */
const BANDS = [
  {
    asks: [PAIRS, REMAINDER],
    pairs: { min: 6, max: 30, minPairs: 1, maxPairs: 3 },
    smallest: { min: 9, max: 50, oddOnly: false },
    remainder: { digits: [2], divisors: [2, 3, 4, 5] },
  },
  {
    asks: [PAIRS, SMALLEST, REMAINDER],
    pairs: { min: 10, max: 50, minPairs: 1, maxPairs: 5 },
    smallest: { min: 9, max: 50, oddOnly: false },
    remainder: { digits: [2, 3], divisors: [2, 3, 4, 5, 6, 7, 8, 9] },
  },
  {
    asks: [PAIRS, SMALLEST, REMAINDER],
    pairs: { min: 20, max: 80, minPairs: 3, maxPairs: 6 },
    smallest: { min: 15, max: 80, oddOnly: true },
    remainder: { digits: [3], divisors: [3, 4, 6, 7, 8, 9] },
  },
  {
    asks: [PAIRS, SMALLEST, REMAINDER],
    pairs: { min: 40, max: 100, minPairs: 4, maxPairs: 8 },
    smallest: { min: 33, max: 100, oddOnly: true },
    remainder: { digits: [3], divisors: [4, 6, 7, 8, 9] },
  },
] as const

type Band = (typeof BANDS)[number]

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/**
 * A number together with the primes it was built from, ascending, with repeats.
 *
 * Holding the factorisation rather than the number alone is what lets every
 * answer here be read off the construction. The smallest divisor is the first
 * entry; the divisors are what the entries multiply out to; and a perfect square
 * is exactly one where every prime appears an even number of times.
 */
interface Factored {
  n: number
  primes: number[]
}

/**
 * Every whole number from 2 to `limit`, each with its factorisation, built by
 * multiplying primes upwards.
 *
 * Recursion over the primes in ascending order reaches each number exactly once,
 * because a number's prime factorisation is unique. Nothing here divides or
 * tests divisibility — the numbers arrive already taken apart.
 */
function allFactored(limit: number): Factored[] {
  const out: Factored[] = []
  const walk = (start: number, n: number, primes: number[]): void => {
    if (primes.length > 0) out.push({ n, primes: [...primes] })
    for (let i = start; i < PRIMES.length; i++) {
      const p = PRIMES[i]!
      if (n * p > limit) break
      primes.push(p)
      walk(i, n * p, primes)
      primes.pop()
    }
  }
  walk(0, 1, [])
  return out
}

const FACTORED = allFactored(100)

/** `[prime, how many times it appears]`, ascending. */
function exponents(primes: readonly number[]): [number, number][] {
  const out: [number, number][] = []
  for (const p of primes) {
    const last = out[out.length - 1]
    if (last && last[0] === p) last[1]++
    else out.push([p, 1])
  }
  return out
}

/**
 * Every divisor, by multiplying the factorisation out.
 *
 * Deliberately not trial division. The test does it that way, and two routes to
 * the same list is the whole point — a list built by expanding the primes and a
 * list built by dividing every candidate agree only if both are right.
 */
function divisorsOf(primes: readonly number[]): number[] {
  let divisors = [1]
  for (const [p, e] of exponents(primes)) {
    const next: number[] = []
    let power = 1
    for (let k = 0; k <= e; k++) {
      for (const d of divisors) next.push(d * power)
      power *= p
    }
    divisors = next
  }
  return divisors.sort((a, b) => a - b)
}

/** A number is a square exactly when every prime in it appears an even number of times. */
function isSquare(primes: readonly number[]): boolean {
  return exponents(primes).every(([, e]) => e % 2 === 0)
}

/**
 * The pools a band draws from, built once and reused.
 *
 * Enumerated and filtered rather than drawn and redrawn. The constraints here
 * are tight — "not a square, between 40 and 100, with at least four factor
 * pairs" leaves a couple of dozen numbers out of a hundred — and a redraw loop
 * against odds like that can exhaust its budget and then emit exactly the square
 * it was told to avoid. A pool cannot.
 *
 * The `legal` fallback only fires if a band is written with constraints nothing
 * satisfies, which is a programming mistake — but the game keeps running on a
 * slightly-wrong question rather than crashing mid-match.
 */
const POOLS = new Map<string, Factored[]>()

function poolFor(index: number, ask: number): Factored[] {
  const key = `${index}:${ask}`
  const cached = POOLS.get(key)
  if (cached) return cached
  const band: Band = BANDS[index]!

  let legal: Factored[]
  let suited: Factored[]

  if (ask === PAIRS) {
    const { min, max, minPairs, maxPairs } = band.pairs
    legal = FACTORED.filter((f) => f.n >= min && f.n <= max && !isSquare(f.primes))
    suited = legal.filter((f) => {
      const pairs = divisorsOf(f.primes).length / 2
      return pairs >= minPairs && pairs <= maxPairs
    })
  } else {
    const { min, max, oddOnly } = band.smallest
    legal = FACTORED.filter((f) => f.n >= min && f.n <= max)
    suited = oddOnly ? legal.filter((f) => f.primes[0] !== 2) : legal
  }

  const pool = suited.length > 0 ? suited : legal
  POOLS.set(key, pool)
  return pool
}

/** The smallest and largest number with exactly `digits` digits. */
function digitRange(digits: number): [number, number] {
  return [10 ** (digits - 1), 10 ** digits - 1]
}

interface Multiple {
  n: number
  by: number
  quotient: number
  remainder: number
}

/**
 * Build a divisibility question backwards from its answer.
 *
 * Choosing the remainder first is what makes `0 <= remainder < divisor` true by
 * construction, and choosing outright whether this one is a multiple is what
 * keeps the two cases evenly matched. Left to `rng.int(0, divisor - 1)`, a
 * divisor of 9 would come out a multiple one time in nine, and a question
 * answered "no" eight times out of nine teaches him to answer "no".
 */
function buildMultiple(rng: Rng, band: Band): Multiple {
  const by = rng.pick(band.remainder.divisors)
  const isMultiple = rng.int(0, 1) === 1
  const remainder = isMultiple ? 0 : rng.int(1, by - 1)

  const [lo, hi] = digitRange(rng.pick(band.remainder.digits))
  const lowest = Math.ceil(lo / by)
  // `Math.max` only matters if a band is ever written with a digit range too
  // narrow to hold a single quotient, which would otherwise reach `rng.int` as
  // an empty range and throw mid-match.
  const highest = Math.max(lowest, Math.floor((hi - remainder) / by))
  const quotient = rng.int(lowest, highest)

  return { n: quotient * by + remainder, by, quotient, remainder }
}

export const mt4oa4: ItemGenerator = {
  standardId: 'MT.4.OA.4',
  label: 'Factors, multiples, prime and composite',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const band = BANDS[index]!
    const ask = rng.pick(band.asks)

    if (ask === REMAINDER) {
      const multiple = buildMultiple(rng, band)
      return {
        standardId: 'MT.4.OA.4',
        difficulty: d,
        prompt:
          `Is ${multiple.n} a multiple of ${multiple.by}? Give the remainder when ${multiple.n} ` +
          `is divided by ${multiple.by} — a remainder of 0 means yes.`,
        answer: { kind: 'rational', canonical: String(multiple.remainder) },
        // Only what the question shows. The quotient and the remainder are
        // deliberately left out: a test handed those would be checking the
        // generator's arithmetic against itself.
        params: { n: multiple.n, ask, by: multiple.by },
        workedSteps: multipleSteps(multiple),
        misconceptions: multipleMistakes(multiple),
      }
    }

    const factored = rng.pick(poolFor(index, ask))
    const divisors = divisorsOf(factored.primes)
    const smallest = factored.primes[0]!

    if (ask === PAIRS) {
      const pairs = divisors.length / 2
      return {
        standardId: 'MT.4.OA.4',
        difficulty: d,
        prompt: `How many factor pairs does ${factored.n} have? Count 1 ${TIMES} ${factored.n} as one of them.`,
        answer: { kind: 'rational', canonical: String(pairs) },
        // `by` is unused by this framing, but every item carries the same keys
        // so that replay and the attempts log never have to ask which shape a
        // row is before reading it.
        params: { n: factored.n, ask, by: 0 },
        workedSteps: pairSteps(factored.n, divisors, pairs),
        misconceptions: pairMistakes(factored.n, divisors, pairs),
      }
    }

    return {
      standardId: 'MT.4.OA.4',
      difficulty: d,
      prompt:
        `What is the smallest number bigger than 1 that divides ${factored.n} evenly? ` +
        `If nothing but ${factored.n} itself divides it, then ${factored.n} is prime and the ` +
        `answer is ${factored.n}.`,
      answer: { kind: 'rational', canonical: String(smallest) },
      params: { n: factored.n, ask, by: 0 },
      workedSteps: smallestSteps(factored.n, smallest),
      misconceptions: smallestMistakes(factored.n, smallest),
    }
  },
}

/** `4 factor pairs`, `1 factor pair`. */
function pairCount(n: number): string {
  return `${n} factor pair${n === 1 ? '' : 's'}`
}

function pairSteps(n: number, divisors: number[], pairs: number): string[] {
  const written = divisors
    .slice(0, pairs)
    .map((small) => `${small} ${TIMES} ${n / small}`)
    .join(', ')
  const largestSmall = divisors[pairs - 1]!

  const opening =
    `A factor pair is two numbers that multiply together to make ${n}. Start at 1 and work up, ` +
    `and each one you find brings its partner with it.`

  // A prime gets its own ending. "Past 1 the pairs start repeating" is true of
  // 19 and still reads as though 2 or 3 might have worked, which is the one
  // thing the sentence must not suggest on the numbers where nothing does.
  if (pairs === 1) {
    return [
      opening,
      `${written}.`,
      `Nothing between 1 and ${n} divides ${n}, so 1 ${TIMES} ${n} is the only pair there is: ` +
        `${pairCount(1)}.`,
      `A number whose only factor pair is 1 times itself is a prime number, so ${n} is prime.`,
    ]
  }

  return [
    opening,
    `${written}.`,
    `Past ${largestSmall} the small number would be bigger than its partner and the pairs would ` +
      `start repeating, so that is all of them: ${pairCount(pairs)}.`,
  ]
}

/** Why `p` does not divide `n`, as a clause that reads after "because". */
function whyNotDivisible(p: number, n: number): string {
  if (p === 2) return `${n} is an odd number`
  if (p === 3) {
    const sum = String(n)
      .split('')
      .reduce((total, digit) => total + Number(digit), 0)
    return `the digits of ${n} add up to ${sum}, which is not in the 3 times table`
  }
  if (p === 5) return `${n} does not end in 0 or 5`
  const below = Math.floor(n / p)
  return `${p} ${TIMES} ${below} = ${p * below} and ${p} ${TIMES} ${below + 1} = ${p * (below + 1)}, and ${n} sits between them`
}

function smallestSteps(n: number, smallest: number): string[] {
  // Only primes are worth trying: if 4 divided the number then 2 already would
  // have, so a composite can never be the *first* thing that works. And only
  // primes up to the square root are worth trying, because past that the
  // partner would already have turned up.
  const tried = PRIMES.filter((p) => p < smallest && p * p <= n)

  const steps = [
    `Work up from 2 and find the first number that divides ${n} with nothing left over. Only ` +
      `prime numbers are worth trying: anything 4 divides, 2 divides as well, so 4 could never ` +
      `be the first one to work.`,
    ...tried.map((p) => `${p} does not divide ${n}, because ${whyNotDivisible(p, n)}.`),
  ]

  if (smallest === n) {
    const next = PRIMES.find((p) => p * p > n) ?? smallest
    steps.push(
      `The next prime to try is ${next}, and ${next} ${TIMES} ${next} = ${next * next}, which is ` +
        `already past ${n}. Once that happens there is nothing left to find, because any factor ` +
        `bigger than that would need a partner smaller than the ones already tried.`,
      `So nothing but 1 and ${n} divides ${n}. ${n} is a prime number, and the answer is ${n}.`,
    )
    return steps
  }

  steps.push(
    `${smallest} does divide ${n}: ${smallest} ${TIMES} ${n / smallest} = ${n}. That is the ` +
      `first one that works, so the answer is ${smallest}.`,
    `${n} has a factor other than 1 and itself, so ${n} is composite rather than prime.`,
  )
  return steps
}

function multipleSteps({ n, by, quotient, remainder }: Multiple): string[] {
  const reached = quotient * by

  if (remainder === 0) {
    return [
      `A multiple of ${by} is a number you land on counting up in ${by}s: ${by}, ${by * 2}, ` +
        `${by * 3}, and so on.`,
      `Counting up in ${by}s lands exactly on ${n}: ${by} ${TIMES} ${quotient} = ${n}.`,
      `Nothing is left over, so ${n} is a multiple of ${by} and the remainder is 0.`,
    ]
  }

  return [
    `A multiple of ${by} is a number you land on counting up in ${by}s: ${by}, ${by * 2}, ` +
      `${by * 3}, and so on.`,
    `The biggest multiple of ${by} that does not go past ${n} is ${by} ${TIMES} ${quotient} = ${reached}.`,
    `${n} ${MINUS} ${reached} = ${remainder}, and ${remainder} is smaller than ${by}, so no more ` +
      `whole ${by}s will fit.`,
    `Counting in ${by}s steps straight over ${n}, so ${n} is not a multiple of ${by}. The ` +
      `remainder is ${remainder}.`,
  ]
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 */
interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

function keep(candidates: Candidate[], correct: number): Misconception[] {
  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. For a prime, "you just
    // said the number itself" *is* the right answer, and it must not be named.
    if (c.value === correct) continue
    const signature = String(c.value)
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}

function pairMistakes(n: number, divisors: number[], pairs: number): Misconception[] {
  const smallestPair = `1 ${TIMES} ${n}`
  return keep(
    [
      {
        id: 'counted-factors-not-pairs',
        value: divisors.length,
        label: 'Counted the factors instead of the pairs',
        explanation:
          `${n} does have ${divisors.length} factors — ${divisors.join(', ')} — and every one of ` +
          `them is right. They come in twos though, and this question asked how many pairs: ` +
          `${divisors.length} factors make ${pairCount(pairs)}.`,
      },
      {
        id: 'left-out-one-and-itself',
        value: pairs - 1,
        label: `Left out ${smallestPair}`,
        explanation:
          `${smallestPair} = ${n}, so it is a factor pair like any other and it counts. Leaving ` +
          `it out gives ${pairs - 1} instead of ${pairs}. Every number has that pair, even a ` +
          `prime — for a prime it is the only one.`,
      },
    ],
    pairs,
  )
}

function smallestMistakes(n: number, smallest: number): Misconception[] {
  const candidates: Candidate[] = [
    {
      id: 'answered-one',
      value: 1,
      label: 'Answered 1, which the question ruled out',
      explanation:
        `1 divides every number, so if it counted here the answer would be 1 every single time ` +
        `and the question would not be worth asking. That is why it says bigger than 1. The ` +
        `first one after that is ${smallest}.`,
    },
  ]

  if (n % 2 === 1) {
    candidates.push({
      id: 'assumed-even',
      value: 2,
      label: 'Started with 2 on an odd number',
      explanation:
        `2 is the right place to start looking, but ${n} is odd, so 2 does not go into it — ` +
        `counting up in 2s steps straight over ${n}. ` +
        (smallest === n
          ? `Nor does 3, or 5, or 7, or anything else below ${n}. That is exactly what makes ` +
            `${n} prime, and it is why the answer is ${n} itself.`
          : `Keep going — 3, then 5, then 7 — and ${smallest} is the first that works.`),
    })
  }

  candidates.push({
    id: 'answered-the-number-itself',
    value: n,
    label: 'Answered the number itself',
    explanation:
      `${n} does divide ${n}, so that is not a silly answer — but it is not the smallest. ` +
      `${smallest} ${TIMES} ${n / smallest} = ${n}, and ${smallest} comes first. Answering ${n} ` +
      `would have been right if nothing smaller worked, which is what makes a number prime.`,
  })

  return keep(candidates, smallest)
}

function multipleMistakes({ n, by, quotient, remainder }: Multiple): Misconception[] {
  const candidates: Candidate[] = [
    {
      id: 'answered-the-quotient',
      value: quotient,
      label: 'Gave how many times it goes, not what was left',
      explanation:
        `There are ${quotient} whole ${by}s inside ${n}, and that count is right — but this ` +
        `question asked what is left over once they are all taken out. ` +
        `${by} ${TIMES} ${quotient} = ${quotient * by}, and ${n} ${MINUS} ${quotient * by} = ` +
        `${remainder}.`,
    },
    {
      id: 'remainder-as-big-as-the-divisor',
      value: remainder + by,
      label: 'Left a remainder that another whole group still fits into',
      explanation:
        `A remainder has to be smaller than ${by}, and ${remainder + by} is not. That means one ` +
        `more whole ${by} could still have been taken out — take it out and ${remainder} is what ` +
        `is really left.`,
    },
  ]

  if (remainder > 0) {
    candidates.push({
      id: 'said-it-was-a-multiple',
      value: 0,
      label: 'Said it was a multiple when it was not',
      explanation:
        `A remainder of 0 would mean counting up in ${by}s lands exactly on ${n}. It does not: ` +
        `${by} ${TIMES} ${quotient} = ${quotient * by} and the next one is ${(quotient + 1) * by}, ` +
        `so ${n} is stepped over. ${remainder} is left, and ${n} is not a multiple of ${by}.`,
    })
  }

  return keep(candidates, remainder)
}
