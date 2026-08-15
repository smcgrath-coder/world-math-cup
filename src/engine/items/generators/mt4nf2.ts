/**
 * MT.4.NF.2 — comparing two fractions.
 *
 * "Compare two fractions with different numerators and different denominators
 * by creating common denominators or numerators, or by comparing to a benchmark
 * fraction such as 1/2 ... Record the results of comparisons with symbols >, =,
 * or <, and justify the conclusions."
 *
 * **The recording half is deliberately not assessed, and that is now a choice
 * rather than a limit.** It used to be a limit: `AnswerSpec` could only grade a
 * number, so a `>` was unparseable and the checker would have refused to score
 * it. `AnswerSpec` grades a picked option now, and `MT.4.G.1` uses exactly that
 * to have him name an angle — so a `>` `=` `<` format is buildable. It was not
 * built, on purpose:
 *
 *  - The *comparing* is covered seven ways below, which is more formats than any
 *    other generator carries. What a symbol question would add is only which way
 *    the arrow points.
 *  - That is a notation convention rather than reasoning. A question this child
 *    gets wrong because he forgot which way the alligator faces teaches him
 *    nothing about fractions and reads as a trick, and the whole design leans
 *    away from gotchas.
 *  - `=` could never be the answer without rebuilding the pool. Every pair here
 *    is strictly ordered by construction — 7200 sampled pairs contain no equal
 *    one, and the smallest gap is a ninetieth — and `ranked` depends on that, as
 *    does the band tuning. Offering `=` as an option that is never right would be
 *    a dead third a ten-year-old finds in an afternoon.
 *
 * The judging half lives in the worked steps instead, which always show the
 * common denominator rather than only announcing the winner.
 *
 * Seven formats. This generator used to ask "which is greater" and nothing else,
 * and Rion — ten years old, plays this — said the questions felt repetitive:
 * "the subject might change slightly, but the pattern remained." One sentence
 * for a whole standard is a pattern, so:
 *
 *  - `GREATER` and `SMALLER` are the same comparison read in both directions. A
 *    child who has only ever been asked for the bigger one learns "pick the one
 *    that feels larger" and never has to say what larger means.
 *  - `CLOSER_TO_HALF` is the benchmark the standard names, used as the question
 *    instead of as a shortcut.
 *  - `CLOSER_TO_ONE` is the other benchmark. For proper fractions the answer is
 *    the greater one, and noticing *that* is the point: the worked steps count
 *    how many pieces short of a whole each one is.
 *  - `WORD_MORE` and `WORD_LESS` put the same comparison in a situation, with
 *    two amounts of the same size thing.
 *  - `COMMON_DENOMINATOR` asks for the method rather than the verdict: the
 *    smallest number both bottom numbers go into. It is the only format here a
 *    child cannot guess, and the only one still answered by typing.
 *
 * The other six are two-way choices and always were — two fractions on screen and
 * one of them wanted back — so chance has always scored 50% on them. That used to
 * be recorded here as a known validity gap, because the answer was *typed* and
 * nothing downstream could tell this question apart from one with a million
 * possible answers. They are now explicit choices, which changes none of the odds
 * and everything about what the rating knows: `guessFloor` reads 0.5, and
 * `updateRating` stops counting a coin landing the right way up as evidence.
 *
 * Note the consequence for misconceptions on the two-way formats: with two
 * fractions on screen and one of them wanted back, there is exactly one wrong
 * value a child can mean to type. So those items name exactly one mistake, and
 * which one it is depends on the shape of the pair and on which direction was
 * asked for. See `wantedTheGreater`, `wantedTheSmaller` and `notTheClosest`.
 */

import { Rational as R } from '../../rational'
import type { AnswerSpec } from '../../answer'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that — "which is greater" and "which is smaller" have opposite answers from
 * identical numbers.
 */
export const GREATER = 0
export const SMALLER = 1
export const CLOSER_TO_HALF = 2
export const CLOSER_TO_ONE = 3
export const WORD_MORE = 4
export const WORD_LESS = 5
export const COMMON_DENOMINATOR = 6

const RANGE: [number, number] = [8, 78]

/** One half, as a value. The benchmark the standard names. */
const HALF = new R(1, 2)

/**
 * How close two fractions have to be for the hardest band to accept them.
 *
 * An eighth is about the point where eyeballing stops working. 3/5 against 5/8
 * is a fortieth apart and has to be computed; 1/4 against 7/8 does not.
 */
const CLOSE = new R(1, 8)

interface Band {
  dens: readonly number[]
  benchmark: 'split' | 'any' | 'sameSide'
  denRelation: 'multiple' | 'any' | 'coprime'
  close: boolean
  formats: readonly number[]
}

/**
 * The four difficulty bands, easiest first.
 *
 * The numeric dials are all about which shortcut is available, because on this
 * standard that is what difficulty means. Bigger denominators barely matter;
 * being denied the half-benchmark matters enormously.
 *
 *  - `benchmark: 'split'` puts the two fractions on opposite sides of 1/2, so
 *    the benchmark alone settles it. That is the easiest true version of this
 *    standard and is exactly what the standard names first.
 *  - `benchmark: 'sameSide'` denies that shortcut: both above a half or both
 *    below it, so common denominators are the only way through.
 *  - `denRelation: 'multiple'` means one denominator goes into the other, so the
 *    common denominator is already on screen. `'coprime'` means it is the full
 *    product and every piece has to be rebuilt.
 *  - `close` forces the hardest band to sit within an eighth, so estimating is
 *    not enough.
 *
 * `formats` is not a difficulty dial — it is what stops the standard being one
 * memorised sentence. It is banded only so that the framings needing a step on
 * top of the comparison (the second benchmark, the method itself) are not the
 * first thing the lowest-rated player meets. Every band offers four or more, so
 * no band is a single pattern.
 */
const BANDS: readonly Band[] = [
  {
    dens: [2, 3, 4, 6, 8],
    benchmark: 'split',
    denRelation: 'multiple',
    close: false,
    formats: [GREATER, SMALLER, CLOSER_TO_HALF, WORD_MORE],
  },
  {
    dens: [3, 4, 5, 6, 8, 10],
    benchmark: 'any',
    denRelation: 'any',
    close: false,
    formats: [GREATER, SMALLER, CLOSER_TO_HALF, CLOSER_TO_ONE, WORD_MORE, WORD_LESS],
  },
  {
    dens: [4, 5, 6, 8, 9, 10, 12],
    benchmark: 'sameSide',
    denRelation: 'any',
    close: false,
    formats: [SMALLER, CLOSER_TO_HALF, CLOSER_TO_ONE, WORD_MORE, WORD_LESS, COMMON_DENOMINATOR],
  },
  {
    dens: [5, 6, 7, 8, 9, 10, 12],
    benchmark: 'sameSide',
    denRelation: 'coprime',
    close: true,
    formats: [GREATER, SMALLER, CLOSER_TO_HALF, CLOSER_TO_ONE, WORD_LESS, COMMON_DENOMINATOR],
  },
]

/**
 * A neutral, varied cast. No surnames, no ages, nobody's family, nobody's money.
 * Exported so the soundness test can rebuild a prompt from `params` character
 * for character — which shares the words, never the arithmetic.
 */
export const NAMES: readonly string[] = [
  'Maya',
  'Ravi',
  'Ana',
  'Jonah',
  'Priya',
  'Theo',
  'Nadia',
  'Omar',
  'Iris',
  'Leo',
  'Sofia',
  'Amara',
]

/**
 * Two amounts of the same thing, and the verb that goes with it.
 *
 * "Of another pizza the same size" is load-bearing rather than padding. Two
 * fractions can only be compared when they are fractions of the same whole, and
 * "Maya read 3/5 of a book and Ravi read 5/8 of a book" is a question with no
 * right answer if the books are different lengths.
 *
 * The verb is stored in the past tense and used unchanged for both children, so
 * there is no conjugation to get wrong.
 */
export const CONTEXTS: readonly { thing: string; past: string }[] = [
  { thing: 'pizza', past: 'ate' },
  { thing: 'bottle of water', past: 'drank' },
  { thing: 'chocolate bar', past: 'ate' },
  { thing: 'jug of juice', past: 'poured' },
  { thing: 'wall', past: 'painted' },
  { thing: 'book', past: 'read' },
]

interface Pair {
  n1: number
  d1: number
  n2: number
  d2: number
}

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Every top number making a proper fraction in lowest terms over `den`. */
function numeratorsFor(den: number): number[] {
  const out: number[] = []
  for (let n = 1; n < den; n++) if (gcd(n, den) === 1) out.push(n)
  return out
}

/** -1, 0 or 1 as the fraction is below, exactly on, or above one half. */
function versusHalf(n: number, d: number): number {
  return Math.sign(n * 2 - d)
}

/** How far a fraction sits from 1/2, as an exact positive amount. */
function distanceFromHalf(n: number, d: number): R {
  const gap = new R(n, d).sub(HALF)
  return new R(Math.abs(gap.n), gap.d)
}

/**
 * Every structurally legal pair for a band: different denominators, different
 * numerators, both proper and in lowest terms.
 *
 * Two fractions in lowest terms over different denominators can never be equal,
 * so "never ask him to compare two equal fractions" is a consequence of this
 * list rather than a check bolted on afterwards.
 *
 * Both orders appear, so the answer is never predictable from its position.
 */
function legalPairs(dens: readonly number[]): Pair[] {
  const out: Pair[] = []
  for (const d1 of dens) {
    for (const d2 of dens) {
      if (d1 === d2) continue
      for (const n1 of numeratorsFor(d1)) {
        for (const n2 of numeratorsFor(d2)) {
          if (n1 === n2) continue
          out.push({ n1, d1, n2, d2 })
        }
      }
    }
  }
  return out
}

/** Does this pair do what the band is for? */
function suitsBand(band: Band, p: Pair): boolean {
  const sideA = versusHalf(p.n1, p.d1)
  const sideB = versusHalf(p.n2, p.d2)
  if (band.benchmark === 'split' && sideA === sideB) return false
  // A fraction sitting exactly on a half would let the benchmark settle it after
  // all, which is the one thing this band is built to prevent.
  if (band.benchmark === 'sameSide' && (sideA !== sideB || sideA === 0)) return false

  const g = gcd(p.d1, p.d2)
  if (band.denRelation === 'multiple' && p.d1 % p.d2 !== 0 && p.d2 % p.d1 !== 0) return false
  if (band.denRelation === 'coprime' && g !== 1) return false

  if (band.close) {
    const gap = new R(p.n1, p.d1).sub(new R(p.n2, p.d2))
    if (new R(Math.abs(gap.n), gap.d).compare(CLOSE) > 0) return false
  }
  return true
}

/**
 * Does this pair make a fair question in this format?
 *
 * Only the benchmark format cares. Asking which of two fractions is closer to
 * 1/2 needs both of them to be off it — a fraction that *is* 1/2 puts the answer
 * inside the question — and needs them to be different distances away, or 1/4
 * against 3/4 would be a question with no right answer at all.
 */
function suitsFormat(format: number, p: Pair): boolean {
  if (format !== CLOSER_TO_HALF) return true
  if (versusHalf(p.n1, p.d1) === 0 || versusHalf(p.n2, p.d2) === 0) return false
  return distanceFromHalf(p.n1, p.d1).compare(distanceFromHalf(p.n2, p.d2)) !== 0
}

/**
 * The pool a band and format draw from, built once and reused.
 *
 * Enumerating and filtering rather than drawing and redrawing is deliberate.
 * There is no loop here that can fail to terminate and no fallback that quietly
 * breaks the band's promise: if a band's constraints are satisfiable at all,
 * they hold on every single item it emits. The list is a pure function of the
 * band and the format, so caching it cannot make the generator non-deterministic.
 *
 * The `legal` fallback only fires if a band is written with constraints nothing
 * satisfies, which is a programming mistake — but the game keeps running on a
 * slightly-too-easy question rather than crashing mid-match.
 */
const POOLS = new Map<string, Pair[]>()

function poolFor(index: number, format: number): Pair[] {
  const key = `${index}:${format}`
  const cached = POOLS.get(key)
  if (cached) return cached
  const band = BANDS[index]!
  const legal = legalPairs(band.dens)
  const suited = legal.filter((p) => suitsBand(band, p) && suitsFormat(format, p))
  const pool = suited.length > 0 ? suited : legal
  POOLS.set(key, pool)
  return pool
}

interface Side {
  n: number
  d: number
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  answer: AnswerSpec
  /** Params this format needs beyond the pair and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nf2: ItemGenerator = {
  standardId: 'MT.4.NF.2',
  label: 'Comparing fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const format = rng.pick(BANDS[index]!.formats)
    const pair = rng.pick(poolFor(index, format))

    const draft = draftFor(format, pair, rng)

    return {
      standardId: 'MT.4.NF.2',
      difficulty: d,
      prompt: draft.prompt,
      answer: draft.answer,
      params: { ...pair, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, pair: Pair, rng: Rng): Draft {
  switch (format) {
    case SMALLER:
      return whichIsSmaller(pair)
    case CLOSER_TO_HALF:
      return closerToHalf(pair)
    case CLOSER_TO_ONE:
      return closerToOne(pair)
    case WORD_MORE:
    case WORD_LESS:
      return inContext(pair, format, rng)
    case COMMON_DENOMINATOR:
      return commonDenominator(pair)
    default:
      return whichIsGreater(pair)
  }
}

/** The greater and the smaller of a pair, in that order. */
function ranked({ n1, d1, n2, d2 }: Pair): [Side, Side] {
  const firstWins = new R(n1, d1).compare(new R(n2, d2)) > 0
  return firstWins
    ? [
        { n: n1, d: d1 },
        { n: n2, d: d2 },
      ]
    : [
        { n: n2, d: d2 },
        { n: n1, d: d1 },
      ]
}

const asText = (s: Side): string => `${s.n}/${s.d}`

/**
 * The two fractions as options, in the order the prompt shows them.
 *
 * **Prompt order, never ranked order.** Listing the winner first would put the
 * answer in the same place every time, which is a pattern a ten-year-old finds
 * in an afternoon.
 *
 * These six formats were always two-way choices — two fractions on screen and one
 * of them wanted back — so chance has always scored 50% here, and this
 * generator's own header called that "a known validity gap" while the answer was
 * typed. Nothing about the guessing changes by making it a choice. What changes
 * is that `guessFloor` can now see it, so `updateRating` stops treating a coin
 * landing the right way up as evidence and the rating stops reading high.
 */
function pickBetween(pair: Pair, winner: Side): AnswerSpec {
  const options = [`${pair.n1}/${pair.d1}`, `${pair.n2}/${pair.d2}`]
  const first = winner.n === pair.n1 && winner.d === pair.d1
  return { kind: 'choice', options, correct: first ? 0 : 1 }
}

// ---------------------------------------------------------------------------
// The formats

/** "Which is greater: 3/5 or 5/8?" */
function whichIsGreater(pair: Pair): Draft {
  const [greater, smaller] = ranked(pair)
  return {
    prompt: `Which is greater: ${pair.n1}/${pair.d1} or ${pair.n2}/${pair.d2}?`,
    answer: pickBetween(pair, greater),
    extra: {},
    workedSteps: comparisonSteps(pair, greater, 'the greater one'),
    misconceptions: [wantedTheGreater(greater, smaller, `So ${asText(greater)} is the greater one.`)],
  }
}

/** "Which is smaller: 3/5 or 5/8?" */
function whichIsSmaller(pair: Pair): Draft {
  const [greater, smaller] = ranked(pair)
  return {
    prompt: `Which is smaller: ${pair.n1}/${pair.d1} or ${pair.n2}/${pair.d2}?`,
    answer: pickBetween(pair, smaller),
    extra: {},
    workedSteps: comparisonSteps(pair, smaller, 'the smaller one'),
    misconceptions: [wantedTheSmaller(greater, smaller)],
  }
}

/** "Which is closer to 1/2: 3/5 or 5/8?" — the benchmark as the question. */
function closerToHalf(pair: Pair): Draft {
  const { n1, d1, n2, d2 } = pair
  const firstGap = distanceFromHalf(n1, d1)
  const secondGap = distanceFromHalf(n2, d2)
  const firstIsCloser = firstGap.compare(secondGap) < 0
  const closer: Side = firstIsCloser ? { n: n1, d: d1 } : { n: n2, d: d2 }
  const farther: Side = firstIsCloser ? { n: n2, d: d2 } : { n: n1, d: d1 }

  // Everything, 1/2 included, over one bottom number, so the answer comes out
  // of counting pieces rather than out of subtracting fractions — which is a
  // fifth-grade skill and not what this question is measuring.
  const common = lcmOf(2, lcmOf(d1, d2))
  const half = common / 2
  const first = n1 * (common / d1)
  const second = n2 * (common / d2)
  const closerSteps = Math.min(Math.abs(first - half), Math.abs(second - half))

  const sameSide = versusHalf(n1, d1) === versusHalf(n2, d2)

  return {
    prompt: `Which is closer to 1/2: ${n1}/${d1} or ${n2}/${d2}?`,
    answer: pickBetween(pair, closer),
    extra: {},
    workedSteps: [
      `${n1}/${d1} is ${halfPhrase(n1, d1)} and ${n2}/${d2} is ${halfPhrase(n2, d2)}.`,
      sameSide
        ? `They are both on the same side of 1/2, so the closer one is the ` +
          `${versusHalf(n1, d1) > 0 ? 'smaller' : 'bigger'} of the two — but count the pieces to ` +
          `be sure.`
        : `They are on opposite sides of 1/2, so this is about how far each one is from it.`,
      `Give all three the same bottom number: ${common} works. 1/2 = ${half}/${common}, ` +
        `${rewrite(n1, d1, first, common)} and ${rewrite(n2, d2, second, common)}.`,
      `Count from the half mark: ${first}/${common} is ${pieces(Math.abs(first - half))} away ` +
        `and ${second}/${common} is ${pieces(Math.abs(second - half))} away.`,
      `So ${asText(closer)} is closer to 1/2: only ${pieces(closerSteps)} away.`,
    ],
    misconceptions: [notTheClosest(closer, farther, pair)],
  }
}

/** "Which is closer to 1 whole: 3/5 or 5/8?" — the other benchmark. */
function closerToOne(pair: Pair): Draft {
  const { n1, d1, n2, d2 } = pair
  const [greater, smaller] = ranked(pair)
  const common = lcmOf(d1, d2)
  const first = n1 * (common / d1)
  const second = n2 * (common / d2)
  const greaterPieces = Math.max(first, second)

  return {
    prompt: `Which is closer to 1 whole: ${n1}/${d1} or ${n2}/${d2}?`,
    answer: pickBetween(pair, greater),
    extra: {},
    workedSteps: [
      `Both of these are less than one whole, so whichever is bigger is also the one that has ` +
        `less of the way left to go.`,
      `Give them the same bottom number: ${sameBottomLine(d1, d2, common)}`,
      `${rewrite(n1, d1, first, common)} and ${rewrite(n2, d2, second, common)}.`,
      `A whole one is ${common}/${common}, so ${first}/${common} is ${pieces(common - first)} ` +
        `short and ${second}/${common} is ${pieces(common - second)} short.`,
      `So ${asText(greater)} is closer to 1 whole: only ${pieces(common - greaterPieces)} ` +
        `short of it.`,
    ],
    misconceptions: [
      wantedTheGreater(
        greater,
        smaller,
        `So ${asText(greater)} is the one closer to 1 whole.`,
      ),
    ],
  }
}

/** The same comparison, in a situation. Two amounts of the same size thing. */
function inContext(pair: Pair, format: number, rng: Rng): Draft {
  const { n1, d1, n2, d2 } = pair
  const [greater, smaller] = ranked(pair)
  const wantsMore = format === WORD_MORE
  const wanted = wantsMore ? greater : smaller

  const nameA = rng.int(0, NAMES.length - 1)
  const nameB = (nameA + rng.int(1, NAMES.length - 1)) % NAMES.length
  const contextIndex = rng.int(0, CONTEXTS.length - 1)
  const { thing, past } = CONTEXTS[contextIndex]!

  return {
    prompt:
      `${NAMES[nameA]} ${past} ${n1}/${d1} of a ${thing}. ${NAMES[nameB]} ${past} ` +
      `${n2}/${d2} of another ${thing} the same size. Which is the ` +
      `${wantsMore ? 'bigger' : 'smaller'} amount, ${n1}/${d1} or ${n2}/${d2}?`,
    answer: pickBetween(pair, wanted),
    extra: { nameA, nameB, context: contextIndex },
    workedSteps: comparisonSteps(
      pair,
      wanted,
      wantsMore ? 'the bigger amount' : 'the smaller amount',
    ),
    misconceptions: [
      wantsMore
        ? wantedTheGreater(greater, smaller, `So ${asText(greater)} is the bigger amount.`)
        : wantedTheSmaller(greater, smaller),
    ],
  }
}

/** The method rather than the verdict: the smallest number both bottoms go into. */
function commonDenominator(pair: Pair): Draft {
  const { n1, d1, n2, d2 } = pair
  const [greater] = ranked(pair)
  const common = lcmOf(d1, d2)
  const big = Math.max(d1, d2)
  const small = Math.min(d1, d2)
  const first = n1 * (common / d1)
  const second = n2 * (common / d2)

  const steps: string[] = [
    `A bottom number that works for both has to be a number that ${d1} and ${d2} both go into.`,
  ]

  // When one denominator already goes into the other there is nothing to count
  // up through: the list would be one number long, and "every earlier multiple
  // misses" would be a claim about multiples that do not exist.
  if (common === big) {
    steps.push(
      `${small} goes into ${big} exactly, so ${big} already works for both. Nothing smaller can, ` +
        `because ${big} has to go into it too.`,
    )
  } else {
    steps.push(
      `Count up in ${big}s: ${countUp(big, common)}. The first one ${small} also goes into is ` +
        `${common}.`,
      `That is what makes it the smallest: every earlier multiple of ${big} misses.`,
    )
  }

  steps.push(
    `From there the comparison falls out — ${rewrite(n1, d1, first, common)} and ` +
      `${rewrite(n2, d2, second, common)}, so ${asText(greater)} is the greater one.`,
  )

  const sum = d1 + d2
  // Whichever of the two does not go into the sum. At most one denominator can
  // divide the other, so one of them always fails — saying "5 does not go into
  // 13" about a pair where it does would be a plainly wrong sentence in the
  // middle of an explanation he is meant to trust.
  const stuck = sum % d1 === 0 ? d2 : d1

  return {
    prompt:
      `To compare ${n1}/${d1} and ${n2}/${d2} you can give them the same bottom number. ` +
      `What is the smallest number that both ${d1} and ${d2} go into?`,
    answer: { kind: 'rational', canonical: String(common) },
    extra: {},
    workedSteps: steps,
    misconceptions: keepUsable(
      [
        {
          // Always available: d1 + d2 is never the least common multiple of d1
          // and d2 for two different whole numbers, so this format always names
          // at least one mistake.
          id: 'added-the-bottom-numbers',
          value: new R(sum, 1),
          label: 'Added the bottom numbers',
          explanation:
            `${d1} + ${d2} = ${sum}. Adding the bottom numbers is the commonest slip there is in ` +
            `fraction work, and it does not give a number both of them go into — ${stuck} does ` +
            `not go into ${sum}. The smallest one that works is ${common}.`,
        },
        {
          // Multiplying always gives *a* common denominator, so it is only a
          // mistake when it is not the smallest one — and when the denominators
          // share no factor it *is* the smallest, and gets filtered out below.
          id: 'multiplied-the-bottom-numbers',
          value: new R(d1 * d2, 1),
          label: 'Multiplied the bottom numbers',
          explanation:
            `${d1} × ${d2} = ${d1 * d2} does work — both numbers go into it, and it is a ` +
            `perfectly good way to compare them. It is not the smallest one though: ${d1} and ` +
            `${d2} both go into ${common} as well, and ${common} keeps the numbers smaller.`,
        },
        {
          id: 'took-the-bigger-bottom-number',
          value: new R(big, 1),
          label: 'Took the bigger bottom number',
          explanation:
            `${big} is the bigger of the two bottom numbers, and sometimes that is the answer — ` +
            `but only when the other one goes into it, and ${small} does not go into ${big}. ` +
            `Keep counting up in ${big}s until you reach one it does: ${common}.`,
        },
      ],
      String(common),
    ),
  }
}

// ---------------------------------------------------------------------------
// Shared wording

/** Least common multiple, by the usual identity. */
function lcmOf(a: number, b: number): number {
  return (a * b) / gcd(a, b)
}

/**
 * `1 piece`, `3 pieces`.
 *
 * A helper rather than a bare `pieces`, because the gap between a fraction and a
 * benchmark is one piece often enough that "1 pieces away" would be the first
 * thing he reads on the item he just got wrong.
 */
function pieces(count: number): string {
  return `${count} piece${count === 1 ? '' : 's'}`
}

/** `8, 16, 24` — the multiples walked through to reach `stop`, inclusive. */
function countUp(step: number, stop: number): string {
  const out: string[] = []
  for (let value = step; value <= stop; value += step) out.push(String(value))
  return out.join(', ')
}

/**
 * "less than 1/2", "exactly 1/2", "more than 1/2".
 *
 * Written as the fraction rather than as the word "half" because the two get
 * mixed together out loud — "more than a half" and "more than half" are
 * different registers of the same sentence — and because 1/2 is the benchmark
 * the standard actually names.
 */
function halfPhrase(n: number, d: number): string {
  const side = versusHalf(n, d)
  if (side < 0) return 'less than 1/2'
  if (side > 0) return 'more than 1/2'
  return 'exactly 1/2'
}

/** `40 works, because 5 goes into 40 exactly.` */
function sameBottomLine(d1: number, d2: number, common: number): string {
  return common === d1 || common === d2
    ? `${common} works for both, because ${common === d1 ? d2 : d1} goes into ${common} exactly.`
    : `${d1} and ${d2} both go into ${common}.`
}

/** `3/5 = 24/40`, or `5/8 is already there` when it needs no changing. */
function rewrite(n: number, d: number, scaled: number, common: number): string {
  return d === common ? `${n}/${d} is already there` : `${n}/${d} = ${scaled}/${common}`
}

/**
 * The common-denominator argument, ending on whichever fraction was asked for.
 *
 * Shared by four formats because the reasoning genuinely is the same reasoning;
 * only the last line changes, and it has to change: "which is smaller" wants the
 * other end of the same sentence, and a word problem asking about the bigger
 * *amount* should not be answered in terms of the greater *fraction*.
 */
function comparisonSteps(pair: Pair, wanted: Side, tail: string): string[] {
  const { n1, d1, n2, d2 } = pair
  const steps: string[] = []
  const settled = versusHalf(n1, d1) !== versusHalf(n2, d2)

  steps.push(
    settled
      ? `Check them against 1/2 first: ${n1}/${d1} is ${halfPhrase(n1, d1)} and ` +
          `${n2}/${d2} is ${halfPhrase(n2, d2)}. That settles it on its own.`
      : `Both of these are ${halfPhrase(n1, d1)}, so that does not settle it this time.`,
  )

  const common = lcmOf(d1, d2)
  steps.push(
    `${settled ? 'Check it the long way too. ' : ''}Give them the same bottom number: ` +
      sameBottomLine(d1, d2, common),
  )

  const left = n1 * (common / d1)
  const right = n2 * (common / d2)
  steps.push(`${rewrite(n1, d1, left, common)} and ${rewrite(n2, d2, right, common)}.`)
  steps.push(
    `Now every piece is the same size, so just count them: ` +
      `${Math.max(left, right)} is more than ${Math.min(left, right)}.`,
  )
  steps.push(`So ${asText(wanted)} is ${tail}.`)

  return steps
}

// ---------------------------------------------------------------------------
// The one wrong answer there is, and the most honest reason for it

/**
 * The wrong answer when the question wanted the greater of the two.
 *
 * Two heuristics are worth naming here, and the arithmetic decides which one is
 * even possible:
 *
 *  - A child who thinks a bigger bottom number means a bigger fraction is only
 *    led astray when the smaller fraction is the one with the bigger bottom
 *    number.
 *  - A child who thinks a bigger top number means a bigger fraction is only led
 *    astray when the smaller fraction has the bigger top number — and that can
 *    only ever happen when it *also* has the bigger bottom number. (If the
 *    smaller fraction had the bigger top and the smaller bottom, it would be the
 *    larger fraction, which is a contradiction.) So the top-number mistake never
 *    arrives on its own, and claiming to have spotted it alone would be a guess.
 *
 * Hence three cases rather than two, and the middle one says plainly that both
 * numbers were bigger — the whole-number thinking that sits underneath both
 * heuristics — instead of picking one at random and sounding certain.
 *
 * Explanations are written for a ten-year-old who is already braced for bad
 * news: short sentences, no jargon, and never a word about carelessness.
 */
function wantedTheGreater(greater: Side, smaller: Side, tail: string): Misconception {
  const signature = asText(smaller)
  const lost = asText(smaller)
  const won = asText(greater)

  if (smaller.d > greater.d && smaller.n > greater.n) {
    return {
      id: 'bigger-numbers-win',
      signature,
      label: 'Went with the bigger-looking numbers',
      explanation:
        `${lost} has the bigger top number and the bigger bottom number, so it looks like the ` +
        `bigger fraction. Fractions do not work that way — the bottom number says how small ` +
        `the pieces are, so a big bottom number pulls the amount down. Put them over the same ` +
        `bottom number and ${won} comes out ahead. ${tail}`,
    }
  }

  if (smaller.d > greater.d) {
    return {
      id: 'bigger-denominator-wins',
      signature,
      label: 'Chose the bigger bottom number',
      explanation:
        `${smaller.d} is a bigger number than ${greater.d}, but on the bottom that makes the ` +
        `fraction smaller, not bigger. Cutting a whole into ${smaller.d} pieces gives smaller ` +
        `pieces than cutting it into ${greater.d}. ${tail}`,
    }
  }

  return {
    id: 'picked-the-smaller',
    signature,
    label: 'Picked the smaller one',
    explanation:
      `${lost} is the smaller of the two. Give both the same bottom number and the pieces come ` +
      `out the same size, so you can just count them — ${won} has more. ${tail}`,
  }
}

/**
 * The wrong answer when the question wanted the *smaller* of the two.
 *
 * The same whole-number thinking runs the other way here, and one case is not a
 * misunderstanding of fractions at all: a child who read "smaller" as "greater"
 * did the comparison perfectly and answered a different question. That is worth
 * saying out loud, because it is what actually happened most of the time.
 */
function wantedTheSmaller(greater: Side, smaller: Side): Misconception {
  const signature = asText(greater)
  const gave = asText(greater)
  const wanted = asText(smaller)

  if (greater.d < smaller.d && greater.n < smaller.n) {
    return {
      id: 'smaller-numbers-look-smaller',
      signature,
      label: 'Went with the smaller-looking numbers',
      explanation:
        `${gave} has the smaller top number and the smaller bottom number, so it looks like the ` +
        `smaller fraction. The bottom number works the other way round: it says how small the ` +
        `pieces are, so ${greater.d} pieces to the whole are bigger pieces than ${smaller.d}. ` +
        `Over the same bottom number, ${wanted} is the smaller amount.`,
    }
  }

  if (greater.d < smaller.d) {
    return {
      id: 'smaller-denominator-looks-smaller',
      signature,
      label: 'Chose the smaller bottom number',
      explanation:
        `${greater.d} is a smaller number than ${smaller.d}, but on the bottom a smaller number ` +
        `makes bigger pieces, so ${gave} is the bigger amount. The smaller one is ${wanted}.`,
    }
  }

  return {
    id: 'gave-the-greater',
    signature,
    label: 'Gave the bigger one',
    explanation:
      `That is the bigger of the two, and working that out is most of the job. This one asked ` +
      `for the smaller amount, which is the other one: ${wanted}.`,
  }
}

/**
 * The wrong answer on "which is closer to 1/2".
 *
 * Closer is not bigger and it is not smaller, and which of those two a child has
 * confused it with is decided by the pair: the fraction he would have to have
 * typed is either the larger of the two or the smaller, never both.
 */
function notTheClosest(closer: Side, farther: Side, pair: Pair): Misconception {
  const [greater] = ranked(pair)
  const farInText = asText(farther)
  const closeInText = asText(closer)
  const fartherIsGreater = farther.n === greater.n && farther.d === greater.d

  return fartherIsGreater
    ? {
        id: 'bigger-not-closer',
        signature: farInText,
        label: 'Picked the bigger one instead of the closer one',
        explanation:
          `${farInText} is the bigger of the two, but this question is about which one sits ` +
          `nearer to 1/2, and being bigger is not the same as being nearer. ${closeInText} is ` +
          `the one closer to 1/2.`,
      }
    : {
        id: 'smaller-not-closer',
        signature: farInText,
        label: 'Picked the smaller one instead of the closer one',
        explanation:
          `${farInText} is the smaller of the two. Being smaller does not make it nearer to ` +
          `1/2 — a fraction can be small and a long way below the halfway mark. ${closeInText} ` +
          `is the one closer to 1/2.`,
      }
}

interface Candidate {
  id: string
  value: R
  label: string
  explanation: string
}

/**
 * Drop the candidates that cannot be used, keeping the most diagnostic of any
 * that collide. Only the numeric format needs this; the two-way formats have
 * exactly one wrong value available and name it directly.
 */
function keepUsable(candidates: readonly Candidate[], answer: string): Misconception[] {
  const correct = R.parse(answer)!
  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never tell him a right answer is a known mistake.
    if (c.value.equals(correct)) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
