/**
 * MT.4.NF.4 — multiplying a fraction by a whole number.
 *
 * "Apply and extend previous understandings of multiplication to multiply a
 * fraction by a whole number."
 *
 * The understanding being extended is that multiplying by a whole number is
 * repeated addition, so every worked step here says "lots of" before it says
 * anything about numerators. 5 × 2/3 is five lots of two thirds, which is ten
 * thirds — the pieces never change size, only the count of them does. Get that
 * and the rule falls out; learn the rule without it and `10/15` looks just as
 * plausible as `10/3`.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x.
 *
 * Prompt text is display-only — `checkAnswer` never sees it — so this cannot
 * affect grading, and the only question is how it reads. A letter x sitting next
 * to fraction letters-and-numbers is one more thing to decode; the real sign is
 * the one on his worksheets.
 */
const TIMES = '×'

const FRACTION_FIRST = 1
const RANGE: [number, number] = [10, 85]

/**
 * The four difficulty bands, easiest first.
 *
 * `resultRule` is the dial that matters, because on this standard the size of
 * the numbers is not what makes it hard — the size of the *answer* is:
 *
 *  - `'any'` lets the answer stay inside one whole (2 × 1/4) or land exactly on
 *    one (3 × 2/3 = 2). Landing on a whole number is a genuinely useful case and
 *    it only exists in the lower bands.
 *  - `'exceedsOne'` forces the answer past a whole, which is the first real step
 *    up: the answer no longer looks like the fractions he is used to seeing.
 *  - `'improperFraction'` also forbids landing on a whole number, so the top
 *    band always ends on something like 35/12 and he has to be comfortable
 *    writing an answer bigger than one that is still a fraction.
 *
 * Denominators stop at 12 and whole numbers at 12, so the heaviest sum is
 * inside the multiplication facts. Past that the item would be measuring
 * two-digit multiplication rather than this standard.
 */
const BANDS = [
  { dens: [2, 3, 4], wholes: [2, 3], resultRule: 'any' },
  { dens: [2, 3, 4, 5, 6], wholes: [2, 3, 4, 5], resultRule: 'any' },
  { dens: [3, 4, 5, 6, 8], wholes: [3, 4, 5, 6, 7], resultRule: 'exceedsOne' },
  { dens: [5, 6, 8, 9, 10, 12], wholes: [4, 5, 6, 7, 8, 9, 10, 12], resultRule: 'improperFraction' },
] as const

type Band = (typeof BANDS)[number]

interface Combo {
  whole: number
  n: number
  den: number
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

/**
 * Every top number making a proper fraction in lowest terms over `den`.
 *
 * Lowest terms keeps the question about multiplying rather than about spotting
 * that 2/6 was 1/3 all along, which belongs to MT.4.NF.1.
 */
function numeratorsFor(den: number): number[] {
  const out: number[] = []
  for (let n = 1; n < den; n++) if (gcd(n, den) === 1) out.push(n)
  return out
}

function suitsBand(band: Band, c: Combo): boolean {
  if (band.resultRule === 'any') return true
  const top = c.whole * c.n
  if (top <= c.den) return false
  return band.resultRule === 'exceedsOne' || top % c.den !== 0
}

/**
 * The pool a band draws from, built once and reused.
 *
 * Enumerated and filtered rather than drawn and redrawn: there is no retry loop
 * to bound, and a band's promise holds on every item it emits rather than on
 * most of them. That matters here because whole numbers and denominators
 * interact — with den 5 and whole 5, *every* numerator gives a whole-number
 * answer, so a redraw loop chasing an improper answer would spin out its budget
 * and then quietly emit the thing it was avoiding.
 *
 * The `legal` fallback only fires if a band is written with constraints nothing
 * satisfies, which is a programming mistake — but the game keeps running on a
 * slightly-too-easy question rather than crashing mid-match.
 */
const POOLS = new Map<number, Combo[]>()

function poolFor(index: number): Combo[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const band = BANDS[index]!
  const legal: Combo[] = []
  for (const den of band.dens) {
    for (const whole of band.wholes) {
      for (const n of numeratorsFor(den)) legal.push({ whole, n, den })
    }
  }
  const suited = legal.filter((c) => suitsBand(band, c))
  const pool = suited.length > 0 ? suited : legal
  POOLS.set(index, pool)
  return pool
}

export const mt4nf4: ItemGenerator = {
  standardId: 'MT.4.NF.4',
  label: 'Multiplying a fraction by a whole number',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const { whole, n, den } = rng.pick(poolFor(bandIndexFor(d)))
    // Both orders, because 2/3 × 5 and 5 × 2/3 are the same question and a child
    // who has only ever seen one of them can freeze on the other.
    const order = rng.int(0, 1)

    const top = whole * n
    const result = new R(top, den)

    return {
      standardId: 'MT.4.NF.4',
      difficulty: d,
      prompt:
        order === FRACTION_FIRST
          ? `${n}/${den} ${TIMES} ${whole}`
          : `${whole} ${TIMES} ${n}/${den}`,
      answer: { kind: 'rational', canonical: result.toString() },
      params: { whole, n, den, order },
      workedSteps: workedSteps(whole, n, den, order, top, result),
      misconceptions: misconceptionsFor(whole, n, den, result),
    }
  },
}

/**
 * What one piece of a whole cut into `den` is called, singular and plural.
 *
 * Worth the table rather than building the word from the number: "one-3th" and
 * "1 fifths" are the kind of thing a child reads once and stops trusting the
 * rest of the explanation over. Every denominator any band can draw is listed;
 * "piece" is here so that adding a denominator later degrades to something
 * plain rather than to something broken.
 */
const PIECE_NAMES: Record<number, [string, string]> = {
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['fourth', 'fourths'],
  5: ['fifth', 'fifths'],
  6: ['sixth', 'sixths'],
  8: ['eighth', 'eighths'],
  9: ['ninth', 'ninths'],
  10: ['tenth', 'tenths'],
  12: ['twelfth', 'twelfths'],
}

function pieceWord(den: number, count: number): string {
  const names = PIECE_NAMES[den] ?? ['piece', 'pieces']
  return count === 1 ? names[0]! : names[1]!
}

function workedSteps(
  whole: number,
  n: number,
  den: number,
  order: number,
  top: number,
  result: R,
): string[] {
  const steps = [
    // `whole` is never 1, so "lots" is always plural here.
    //
    // When the fraction is written first, say so rather than silently flipping
    // it. Reading `1/4 × 2` and being answered about `2 × 1/4` looks like the
    // worked steps are solving a different question, and "you can swap them
    // round" is itself part of this standard.
    order === FRACTION_FIRST
      ? `${n}/${den} ${TIMES} ${whole} means ${whole} lots of ${n}/${den} — the same question ` +
        `written the other way round.`
      : `${whole} ${TIMES} ${n}/${den} means ${whole} lots of ${n}/${den}.`,
    `Each lot is ${n} ${pieceWord(den, n)}, so ${whole} lots make ` +
      `${whole} ${TIMES} ${n} = ${top} ${pieceWord(den, top)}.`,
    `The pieces never changed size, so the bottom number stays ${den}: ${top}/${den}.`,
  ]

  if (result.d === 1) {
    steps.push(
      `${top}/${den} is exactly ${result.n === 1 ? 'one whole' : `${result.n} wholes`}: ` +
        `${result.toString()}.`,
    )
    return steps
  }

  if (result.d !== den) {
    steps.push(
      `${top}/${den} is the same amount as ${result.toString()}, and ${result.toString()} is ` +
        `the tidiest way to write it.`,
    )
  }

  if (top > den) {
    steps.push(
      `${result.toString()} is more than one whole. That is meant to happen — ${whole} lots of ` +
        `${n}/${den} adds up past one.`,
    )
  }

  return steps
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 */
function misconceptionsFor(whole: number, n: number, den: number, result: R): Misconception[] {
  const candidates: { id: string; value: R; label: string; explanation: string }[] = [
    {
      // Multiplying top and bottom by the same number is exactly the equivalent
      // fractions move from MT.4.NF.1, so it always lands straight back on the
      // fraction he started with. That is the whole explanation, and it is a
      // better one than any rule: the answer cannot be right because it never
      // went anywhere.
      id: 'multiplied-both',
      value: new R(whole * n, den * whole),
      label: 'Multiplied the bottom number too',
      explanation:
        `Multiplying the top and the bottom by the same number does not change the amount — ` +
        `that lands right back on ${n}/${den}, the fraction you started with. The answer has ` +
        `to be bigger than that, because there are ${whole} of them.`,
    },
    {
      id: 'multiplied-denominator-only',
      value: new R(n, den * whole),
      label: 'Multiplied the bottom number instead of the top',
      explanation:
        `The ${whole} went onto the bottom, which cuts the pieces into smaller ones. ` +
        `Multiplying does not change how big the pieces are, only how many there are: ` +
        `${whole} ${TIMES} ${n} = ${whole * n}, still over ${den}.`,
    },
    {
      id: 'added-instead',
      value: new R(whole * den + n, den),
      label: 'Added instead of multiplying',
      explanation:
        `That is ${whole} and ${n}/${den} put together. This one says ${TIMES}, which means ` +
        `${whole} lots of ${n}/${den}. Each lot is less than one whole, so the answer has to ` +
        `land below ${whole}, not above it.`,
    },
    {
      id: 'dropped-denominator',
      value: new R(whole * n, 1),
      label: 'Left the bottom number off',
      explanation:
        `You counted the pieces right: ${whole * n}. On its own though, ${whole * n} means ` +
        `${whole * n} whole ones, which is far bigger. Keep the bottom number with it: ` +
        `${whole * n}/${den}.`,
    },
  ]

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake.
    if (c.value.equals(result)) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
