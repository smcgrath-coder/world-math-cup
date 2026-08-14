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
 * Most are asked in the form that already has a numeric answer; the one that is
 * genuinely a yes/no question is now asked as one, which it was not always.
 *
 * Eight formats. There used to be three, each about a third of what he saw, and
 * Rion — ten years old, plays this — said the questions felt repetitive: "the
 * subject might change slightly, but the pattern remained." So:
 *
 *  - `PAIRS`: *"how many factor pairs does 24 have?"* Finding all of them is the
 *    work; saying how many is the proof that he found all of them.
 *  - `FACTOR_COUNT`: *"how many factors does 24 have?"* One step away from the
 *    question above and a different answer, which is exactly why both are here.
 *    Confusing the two is the commonest slip on this standard, and each format
 *    names the other as a misconception — the confusion encoded rather than
 *    avoided.
 *  - `WORD_ROWS` is the same count in a situation: how many different numbers
 *    could be in each row. Rows are what factors are *for*, and asking for the
 *    row lengths rather than the arrangements sidesteps the argument about
 *    whether 3 rows of 8 and 8 rows of 3 are the same thing.
 *  - `SMALLEST`: *"what is the smallest number bigger than 1 that divides 51
 *    evenly?"* — the prime-or-composite question, done numerically. The answer is
 *    the number itself exactly when the number is prime, so the two cases are the
 *    same question and he never has to guess which one is being asked.
 *  - `BIGGEST_PARTNER`: *"what is the biggest factor of 91 that is not 91
 *    itself?"* The two ends of a factor pair move in opposite directions, so this
 *    is the smallest-factor search plus the insight that its partner is the
 *    biggest. It is the only framing here that makes a child use a pair as a
 *    *pair*.
 *  - `IS_MULTIPLE`: *"is 348 a multiple of 6?"* True or False. This used to be
 *    welded to the format below, which asked the yes/no question and then said
 *    *"give the remainder — a remainder of 0 means yes"*, because the answer box
 *    could only take a number. Rion's dad called that clunky and he was right: it
 *    made a child encode a judgement as arithmetic to suit the input. A two-option
 *    answer is right half the time by luck, which `updateRating` is told about and
 *    prices accordingly.
 *  - `REMAINDER`: *"what is the remainder when 348 is divided by 6?"* A good
 *    question on its own, now that it has stopped doing two jobs at once. The
 *    remainder says how far off it was, which "no" does not.
 *  - `NEXT_MULTIPLE`: *"what is the next multiple of 7 after 50?"* Multiples as a
 *    sequence you can move along rather than a property to test.
 *
 * Numbers are built from their prime factors upwards — a multiset of primes is
 * chosen and multiplied together — so the factorisation is known before the
 * number exists and every answer is read off the construction rather than
 * recovered from it. Nothing in here divides except to lay out working for the
 * child. The two multiple framings are built backwards the same way, from a
 * quotient, a divisor and a remainder, so `0 <= remainder < divisor` holds by
 * construction.
 *
 * Perfect squares are deliberately excluded from the counting framings. 36 is
 * 1 × 36, 2 × 18, 3 × 12, 4 × 9 and 6 × 6, and whether that last one is a pair
 * is a fair argument for a ten-year-old to lose. Marking him wrong when he is
 * right is the worst thing this software can do, so the case is not asked.
 *
 * Two more suggestions were rejected rather than built. *"How many primes are
 * there between 20 and 40?"* means testing twenty numbers for primality to
 * produce one digit — the standard asks about *a* given number, and the error
 * rate on twenty tests would measure stamina rather than understanding. And a
 * missing divisor, `187 ÷ ? = 31 remainder 1`, comes back only by dividing by a
 * two-digit number, which is a fifth-grade skill.
 */

import { FALSE_LABEL, TRUE_LABEL, trueFalse } from '../../answer'
import type { AnswerSpec } from '../../answer'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN and U+2212 MINUS SIGN, not the letter x and not a
 * hyphen. Prompt text is display-only — `checkAnswer` never sees it — so this
 * cannot affect grading, and they are the signs on his worksheets.
 */
const TIMES = '×'
const MINUS = '−'

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: 24 has 4 factor pairs, 8 factors and a biggest factor of 12.
 */
export const REMAINDER = 0
export const SMALLEST = 1
export const PAIRS = 2
export const FACTOR_COUNT = 3
export const NEXT_MULTIPLE = 4
export const BIGGEST_PARTNER = 5
export const WORD_ROWS = 6
/**
 * `IS_MULTIPLE`: *"is 348 a multiple of 6?"* — True or False.
 *
 * This is what `REMAINDER` used to be pretending to be. It asked the yes/no
 * question and then, because the answer box could only take a number, told him
 * *"give the remainder — a remainder of 0 means yes"*. Rion's dad called that
 * clunky and he was right: it made a child encode a judgement as arithmetic to
 * suit the input.
 *
 * Now the two are separate questions, and both are better for it. This one asks
 * what it means. `REMAINDER` asks for the remainder and nothing else, which is a
 * good question on its own once it has stopped doing two jobs.
 */
export const IS_MULTIPLE = 7

const RANGE: [number, number] = [15, 90]

/** Every prime up to 100, which is as far as this standard reaches. */
const PRIMES = [
  2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47, 53, 59, 61, 67, 71, 73, 79, 83, 89, 97,
] as const

/**
 * Situations where equal rows are the point, for the word framing.
 *
 * Rows are what factors are for, and a child who has laid out 24 tiles knows
 * something about 24 that no amount of "list the factors" teaches. Exported so
 * the soundness test can rebuild a prompt from `params` character for character —
 * which shares the words, never the arithmetic.
 */
export const ROW_CONTEXTS: readonly { item: string; items: string; verb: string }[] = [
  { item: 'chair', items: 'chairs', verb: 'set out' },
  { item: 'seedling', items: 'seedlings', verb: 'planted' },
  { item: 'tile', items: 'tiles', verb: 'laid' },
  { item: 'photo', items: 'photos', verb: 'arranged' },
]

interface Band {
  formats: readonly number[]
  pairs: { min: number; max: number; minPairs: number; maxPairs: number }
  smallest: { min: number; max: number; oddOnly: boolean }
  remainder: { digits: readonly number[]; divisors: readonly number[] }
}

/**
 * The four difficulty bands, easiest first.
 *
 * `formats` is the first dial: the bottom band leaves out the two framings that
 * need a factor to be hunted down before anything else can happen, because
 * deciding a number is prime means proving a negative — you have to run out of
 * things to try — and the easiest band should be measuring one thing.
 *
 * After that each framing has its own dial, because they get hard in different
 * ways. Counting factors gets hard as the number acquires more of them. The
 * smallest divisor gets hard when the number is odd, since "is it even" answers
 * half of all cases for free — so from the third band up every number is odd and
 * he has to keep going. Multiples get hard as the number grows towards the 1000
 * the standard names.
 */
const BANDS: readonly Band[] = [
  {
    formats: [PAIRS, FACTOR_COUNT, WORD_ROWS, REMAINDER, NEXT_MULTIPLE, IS_MULTIPLE],
    pairs: { min: 6, max: 30, minPairs: 1, maxPairs: 3 },
    smallest: { min: 9, max: 50, oddOnly: false },
    remainder: { digits: [2], divisors: [2, 3, 4, 5] },
  },
  {
    formats: [PAIRS, FACTOR_COUNT, WORD_ROWS, REMAINDER, NEXT_MULTIPLE, IS_MULTIPLE, SMALLEST, BIGGEST_PARTNER],
    pairs: { min: 10, max: 50, minPairs: 1, maxPairs: 5 },
    smallest: { min: 9, max: 50, oddOnly: false },
    remainder: { digits: [2, 3], divisors: [2, 3, 4, 5, 6, 7, 8, 9] },
  },
  {
    formats: [PAIRS, FACTOR_COUNT, WORD_ROWS, REMAINDER, NEXT_MULTIPLE, IS_MULTIPLE, SMALLEST, BIGGEST_PARTNER],
    pairs: { min: 20, max: 80, minPairs: 3, maxPairs: 6 },
    smallest: { min: 15, max: 80, oddOnly: true },
    remainder: { digits: [3], divisors: [3, 4, 6, 7, 8, 9] },
  },
  {
    formats: [PAIRS, FACTOR_COUNT, WORD_ROWS, REMAINDER, NEXT_MULTIPLE, IS_MULTIPLE, SMALLEST, BIGGEST_PARTNER],
    pairs: { min: 40, max: 100, minPairs: 4, maxPairs: 8 },
    smallest: { min: 33, max: 100, oddOnly: true },
    remainder: { digits: [3], divisors: [4, 6, 7, 8, 9] },
  },
]

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
 * entry; the divisors are what the entries multiply out to; a perfect square is
 * exactly one where every prime appears an even number of times; and a prime is
 * exactly one with a single entry.
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

/** Which pool a format draws from. */
const COUNTING = 'counting'
const FACTOR_HUNT = 'factorHunt'
const COMPOSITE = 'composite'

type PoolKind = typeof COUNTING | typeof FACTOR_HUNT | typeof COMPOSITE

function poolKindFor(format: number): PoolKind {
  if (format === PAIRS || format === FACTOR_COUNT || format === WORD_ROWS) return COUNTING
  return format === BIGGEST_PARTNER ? COMPOSITE : FACTOR_HUNT
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

function poolFor(index: number, kind: PoolKind): Factored[] {
  const key = `${index}:${kind}`
  const cached = POOLS.get(key)
  if (cached) return cached
  const band: Band = BANDS[index]!

  let legal: Factored[]
  let suited: Factored[]

  if (kind === COUNTING) {
    const { min, max, minPairs, maxPairs } = band.pairs
    legal = FACTORED.filter((f) => f.n >= min && f.n <= max && !isSquare(f.primes))
    suited = legal.filter((f) => {
      const pairs = divisorsOf(f.primes).length / 2
      return pairs >= minPairs && pairs <= maxPairs
    })
  } else {
    const { min, max, oddOnly } = band.smallest
    legal = FACTORED.filter((f) => f.n >= min && f.n <= max)
    if (oddOnly) legal = legal.filter((f) => f.primes[0] !== 2)
    // A prime has no factor between 1 and itself, so "the biggest factor apart
    // from itself" would be 1 — true, and nothing to do with factor pairs.
    suited = kind === COMPOSITE ? legal.filter((f) => f.primes.length > 1) : legal
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
 *
 * `needsRemainder` is the next-multiple framing asking for a number that is not
 * already a multiple. "The next multiple of 7 after 49" invites an argument about
 * whether 49 counts, and a child who answers 49 has read the question a way it
 * can be read.
 */
function buildMultiple(rng: Rng, band: Band, needsRemainder: boolean): Multiple {
  const by = rng.pick(band.remainder.divisors)
  const isMultiple = needsRemainder ? false : rng.int(0, 1) === 1
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

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  answer: AnswerSpec
  /** The number the question is about, which every format shows. */
  n: number
  /** The one-digit number a multiple framing is about, or 0. */
  by: number
  /** Params this format needs beyond `n`, `by` and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4oa4: ItemGenerator = {
  standardId: 'MT.4.OA.4',
  label: 'Factors, multiples, prime and composite',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const band = BANDS[index]!
    const format = rng.pick(band.formats)
    const draft = draftFor(format, index, band, rng)

    return {
      standardId: 'MT.4.OA.4',
      difficulty: d,
      prompt: draft.prompt,
      answer: draft.answer,
      // Only what the question shows. The quotient and the remainder are
      // deliberately left out: a test handed those would be checking the
      // generator's arithmetic against itself. `by` is 0 on the framings that
      // have no one-digit number in them, so that replay and the attempts log
      // never have to ask which shape a row is before reading it.
      params: { n: draft.n, format, by: draft.by, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, index: number, band: Band, rng: Rng): Draft {
  if (format === REMAINDER) return multipleRemainder(buildMultiple(rng, band, false))
  // `needsRemainder: false` already coin-flips between a multiple and a
  // non-multiple, so True and False come up about equally. Passing `true` here
  // would force a remainder every time and make False the answer to roughly five
  // questions in six -- a child who spots that has learned the generator rather
  // than the mathematics.
  if (format === IS_MULTIPLE) return isMultiple(buildMultiple(rng, band, false))
  if (format === NEXT_MULTIPLE) return nextMultiple(buildMultiple(rng, band, true))

  const factored = rng.pick(poolFor(index, poolKindFor(format)))
  const divisors = divisorsOf(factored.primes)

  switch (format) {
    case FACTOR_COUNT:
      return factorCount(factored.n, divisors)
    case WORD_ROWS:
      return wordRows(factored.n, divisors, rng.int(0, ROW_CONTEXTS.length - 1))
    case BIGGEST_PARTNER:
      return biggestPartner(factored.n, factored.primes[0]!)
    case SMALLEST:
      return smallestDivisor(factored.n, factored.primes[0]!)
    default:
      return factorPairs(factored.n, divisors)
  }
}

// ---------------------------------------------------------------------------
// The formats

/** "How many factor pairs does 24 have?" */
function factorPairs(n: number, divisors: number[]): Draft {
  const pairs = divisors.length / 2
  return {
    prompt: `How many factor pairs does ${n} have? Count 1 ${TIMES} ${n} as one of them.`,
    answer: { kind: 'rational', canonical: String(pairs) },
    n,
    by: 0,
    extra: {},
    workedSteps: pairSteps(n, divisors, pairs),
    misconceptions: keep(
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
          label: `Left out 1 ${TIMES} ${n}`,
          explanation:
            `1 ${TIMES} ${n} = ${n}, so it is a factor pair like any other and it counts. Leaving ` +
            `it out gives ${pairs - 1} instead of ${pairs}. Every number has that pair, even a ` +
            `prime — for a prime it is the only one.`,
        },
      ],
      pairs,
    ),
  }
}

/** "How many factors does 24 have?" — one step from the question above, and a different answer. */
function factorCount(n: number, divisors: number[]): Draft {
  const pairs = divisors.length / 2
  return {
    prompt: `How many factors does ${n} have? Count 1 and ${n} as two of them.`,
    answer: { kind: 'rational', canonical: String(divisors.length) },
    n,
    by: 0,
    extra: {},
    workedSteps: [
      `A factor of ${n} is a number that divides ${n} with nothing left over. Start at 1 and work ` +
        `up, and each one you find brings its partner with it.`,
      `${writtenPairs(n, divisors, pairs)}.`,
      `Written out in order, the factors are ${divisors.join(', ')}.`,
      `Each pair holds two of them, so ${pairCount(pairs)} ${pairs === 1 ? 'makes' : 'make'} ` +
        `${divisors.length} factors.`,
    ],
    misconceptions: keep(factorCountMistakes(n, divisors), divisors.length),
  }
}

/** The same count, in rows. */
function wordRows(n: number, divisors: number[], index: number): Draft {
  const c = ROW_CONTEXTS[index]!
  const pairs = divisors.length / 2

  return {
    prompt:
      `${count(n, c.item, c.items)} are ${c.verb} in equal rows with none left over. ` +
      `How many different numbers could be in each row? Count 1 and ${n} as two of them.`,
    answer: { kind: 'rational', canonical: String(divisors.length) },
    n,
    by: 0,
    extra: { context: index },
    workedSteps: [
      `Every row holds the same number and nothing is left over, so the number in a row has to ` +
        `divide ${n} exactly — it has to be a factor of ${n}.`,
      `Start at 1 and work up. Each number that works brings its partner with it, because that is ` +
        `how many rows there would be: ${writtenPairs(n, divisors, pairs)}.`,
      `Written out in order, the numbers that could be in a row are ${divisors.join(', ')}.`,
      `That is ${count(divisors.length, 'row length', 'row lengths')} that work.`,
    ],
    misconceptions: keep(rowMistakes(n, divisors, c.items), divisors.length),
  }
}

/** "What is the smallest number bigger than 1 that divides 51 evenly?" */
function smallestDivisor(n: number, smallest: number): Draft {
  return {
    prompt:
      `What is the smallest number bigger than 1 that divides ${n} evenly? ` +
      `If nothing but ${n} itself divides it, then ${n} is prime and the answer is ${n}.`,
    answer: { kind: 'rational', canonical: String(smallest) },
    n,
    by: 0,
    extra: {},
    workedSteps: smallestSteps(n, smallest),
    misconceptions: smallestMistakes(n, smallest),
  }
}

/** "What is the biggest factor of 91 that is not 91 itself?" — a factor pair used as a pair. */
function biggestPartner(n: number, smallest: number): Draft {
  const partner = n / smallest
  const tried = PRIMES.filter((p) => p < smallest && p * p <= n)

  return {
    prompt: `What is the biggest factor of ${n} that is not ${n} itself?`,
    answer: { kind: 'rational', canonical: String(partner) },
    n,
    by: 0,
    extra: {},
    workedSteps: [
      `Factors come in pairs that multiply to make ${n}, and the two ends of a pair pull opposite ` +
        `ways — a small factor has a big partner. So the biggest factor below ${n} is the partner ` +
        `of the smallest factor above 1.`,
      `Work up from 2 to find that smallest factor. Only prime numbers are worth trying: anything ` +
        `4 divides, 2 divides as well.`,
      ...tried.map((p) => `${p} does not divide ${n}, because ${whyNotDivisible(p, n)}.`),
      `${smallest} does divide ${n}: ${smallest} ${TIMES} ${partner} = ${n}.`,
      `Nothing between ${partner} and ${n} can divide ${n} — it would need a partner smaller than ` +
        `${smallest}, and there is none. So the biggest factor of ${n} apart from itself is ` +
        `${partner}.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available: the partner of the smallest factor is at least 2,
          // because a number whose only factors are 1 and itself is prime and
          // this framing never draws one.
          id: 'answered-one',
          value: 1,
          label: 'Answered 1, the smallest factor instead of the biggest',
          explanation:
            `1 is a factor of ${n}, and of every number — but it is the smallest one there is. ` +
            `This question asks for the biggest one apart from ${n} itself, which is the other end ` +
            `of the pair 1 ${TIMES} ${n} works down to: ${partner}.`,
        },
        {
          id: 'answered-the-number-itself',
          value: n,
          label: 'Answered the number itself, which the question ruled out',
          explanation:
            `${n} is its own biggest factor, so it would be the answer if the question let it — ` +
            `that is why it says not ${n} itself. The next one down is ${partner}: ` +
            `${smallest} ${TIMES} ${partner} = ${n}.`,
        },
        {
          id: 'answered-the-smallest',
          value: smallest,
          label: 'Gave the small end of the pair',
          explanation:
            `${smallest} is the smallest factor of ${n} above 1, and finding it is most of the ` +
            `job — it is the other end of the very pair this question is about. Its partner is ` +
            `the big end: ${smallest} ${TIMES} ${partner} = ${n}, so the answer is ${partner}.`,
        },
      ],
      partner,
    ),
  }
}

/** "What is the remainder when 348 is divided by 6?" */
function multipleRemainder(multiple: Multiple): Draft {
  return {
    // No longer asks the yes/no question first. It used to open with "is 348 a
    // multiple of 6?" and then ask for the remainder as a way of answering it,
    // which meant every child had to hold two questions to answer one.
    prompt: `What is the remainder when ${multiple.n} is divided by ${multiple.by}?`,
    answer: { kind: 'rational', canonical: String(multiple.remainder) },
    n: multiple.n,
    by: multiple.by,
    extra: {},
    workedSteps: multipleSteps(multiple),
    misconceptions: multipleMistakes(multiple),
  }
}

/**
 * "Is 348 a multiple of 6?" — True or False.
 *
 * The one wrong option gets a real explanation rather than filler. Which
 * explanation depends on the direction: saying False about a multiple means the
 * division was thought to leave something over, and saying True about a
 * non-multiple means the remainder was missed. Both are worth naming, and both
 * end at the same division either way.
 */
function isMultiple(multiple: Multiple): Draft {
  const { n, by, quotient, remainder } = multiple
  const isTrue = remainder === 0

  return {
    prompt: `Is ${n} a multiple of ${by}?`,
    answer: trueFalse(isTrue),
    n,
    by,
    extra: {},
    // The shared steps end on the remainder, which is the answer to the
    // *remainder* question and not to this one. A working has to finish on the
    // thing that was asked, so this one says the verdict out loud.
    workedSteps: [
      ...multipleSteps(multiple),
      isTrue ? `So ${n} is a multiple of ${by}.` : `So ${n} is not a multiple of ${by}.`,
    ],
    misconceptions: [
      {
        id: isTrue ? 'thought-it-left-a-remainder' : 'missed-the-remainder',
        signature: isTrue ? FALSE_LABEL : TRUE_LABEL,
        label: isTrue ? 'Said no to a multiple' : 'Said yes to a non-multiple',
        explanation: isTrue
          ? `${by} ${TIMES} ${quotient} = ${n} exactly, with nothing left over. A multiple of ` +
            `${by} is any number you land on counting up in ${by}s, and counting up in ` +
            `${by}s does land on ${n}.`
          : `Counting up in ${by}s you land on ${by} ${TIMES} ${quotient} = ${quotient * by}, ` +
            `and the next one is past ${n}. ${n} ${MINUS} ${quotient * by} = ${remainder} left ` +
            `over, so ${n} is not one of the numbers you land on.`,
      },
    ],
  }
}

/** "What is the next multiple of 7 after 50?" — multiples as a sequence, not a test. */
function nextMultiple({ n, by, quotient, remainder }: Multiple): Draft {
  const below = quotient * by
  const next = below + by

  return {
    prompt: `What is the next multiple of ${by} after ${n}?`,
    answer: { kind: 'rational', canonical: String(next) },
    n,
    by,
    extra: {},
    workedSteps: [
      `The multiples of ${by} are the numbers you land on counting up in ${by}s: ${by}, ` +
        `${by * 2}, ${by * 3}, and so on.`,
      `${n} is not one of them. The biggest multiple of ${by} that does not go past ${n} is ` +
        `${by} ${TIMES} ${quotient} = ${below}, and ${n} ${MINUS} ${below} = ${remainder}.`,
      `The next one along is one more ${by}: ${by} ${TIMES} ${quotient + 1} = ${next}.`,
      `So counting up in ${by}s, the first one past ${n} is ${next}.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available: this framing never draws a number that is already a
          // multiple, so the multiple below and the multiple above are different
          // numbers.
          id: 'stopped-at-the-one-before',
          value: below,
          label: 'Gave the multiple just before instead of just after',
          explanation:
            `${below} is a multiple of ${by} — ${by} ${TIMES} ${quotient} — and it is the one ` +
            `just below ${n}, not the one just past it. The question asks for the first one after ${n}, ` +
            `which is one more ` +
            `${by}: ${next}.`,
        },
        {
          id: 'counted-on-from-the-number',
          value: n + by,
          label: `Added ${by} to the number in the question`,
          explanation:
            `${n} + ${by} = ${n + by}. Counting on in ${by}s only lands on multiples of ${by} if ` +
            `you start from one, and ${n} is not one — it is ${remainder} past ${below}. Count on ` +
            `from ${below} instead: ${below} + ${by} = ${next}.`,
        },
      ],
      next,
    ),
  }
}

// ---------------------------------------------------------------------------
// Shared wording

/** `4 factor pairs`, `1 factor pair`. */
function pairCount(n: number): string {
  return `${n} factor pair${n === 1 ? '' : 's'}`
}

/** `1 chair`, `24 chairs`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/** `1 × 24, 2 × 12, 3 × 8, 4 × 6` — every pair written out, small end first. */
function writtenPairs(n: number, divisors: number[], pairs: number): string {
  return divisors
    .slice(0, pairs)
    .map((small) => `${small} ${TIMES} ${n / small}`)
    .join(', ')
}

function pairSteps(n: number, divisors: number[], pairs: number): string[] {
  const written = writtenPairs(n, divisors, pairs)
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

  // The verdict comes before the answer, not after it. The last worked step is
  // the last thing he reads after getting one wrong, and it should be the number
  // he was asked for rather than a sentence about vocabulary.
  steps.push(
    `${smallest} does divide ${n}: ${smallest} ${TIMES} ${n / smallest} = ${n}. So ${n} has a ` +
      `factor other than 1 and itself, which makes it composite rather than prime.`,
    `${smallest} is the first one that works, so the answer is ${smallest}.`,
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

function keep(candidates: readonly Candidate[], correct: number): Misconception[] {
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

/**
 * Counting factors and counting pairs are one step apart, and the confusion runs
 * both ways — so each of the two framings names the other. Halving the count is
 * always available here: a number has at least two factors, so half of them is
 * always fewer than all of them.
 */
function factorCountMistakes(n: number, divisors: number[]): Candidate[] {
  const pairs = divisors.length / 2
  return [
    {
      id: 'counted-the-pairs',
      value: pairs,
      label: 'Counted the pairs instead of the factors',
      explanation:
        `${n} does have ${pairCount(pairs)} — ${writtenPairs(n, divisors, pairs)} — and finding ` +
        `them is the work. This question asked how many factors there are, one at a time, and each ` +
        `pair holds ` +
        `two of them, so there are twice as many: ${divisors.length}.`,
    },
    {
      id: 'left-out-one-and-itself',
      value: divisors.length - 2,
      label: `Left out 1 and ${n}`,
      explanation:
        `1 and ${n} are both factors of ${n}, because 1 ${TIMES} ${n} = ${n}. Leaving them both ` +
        `out gives ${divisors.length - 2} instead of ${divisors.length}. Every number has that ` +
        `pair, even a prime — for a prime it is the only one.`,
    },
  ]
}

/** The same two mistakes, in a situation where the factors are row lengths. */
function rowMistakes(n: number, divisors: number[], items: string): Candidate[] {
  const pairs = divisors.length / 2
  return [
    {
      id: 'counted-the-pairs',
      value: pairs,
      label: 'Counted the pairs instead of the row lengths',
      explanation:
        `${n} has ${pairCount(pairs)}: ${writtenPairs(n, divisors, pairs)}. Finding them is the ` +
        `work. Each pair gives two different row lengths though — ` +
        `${divisors[0]} ${TIMES} ${n / divisors[0]!} means a row of ${divisors[0]} works and a ` +
        `row of ${n / divisors[0]!} works too — so there are ${divisors.length}.`,
    },
    {
      id: 'left-out-one-and-itself',
      value: divisors.length - 2,
      label: `Left out rows of 1 and a single row of ${n}`,
      explanation:
        `A row with just 1 in it works, and one row with all ${n} ${items} in it works too — ` +
        `nothing is left over either way, so both count. Leaving them out gives ` +
        `${divisors.length - 2} instead of ${divisors.length}.`,
    },
  ]
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
