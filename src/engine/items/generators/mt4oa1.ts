/**
 * MT.4.OA.1 — multiplicative comparison.
 *
 * "Interpret a multiplication equation as a multiplicative comparison, and
 * represent verbal statements of multiplicative comparisons as multiplication
 * equations."
 *
 * The whole standard turns on one sentence a child has to read correctly:
 * "3 times as many" means *three lots of*, not *three more than*. So every item
 * is a verbal statement and every set of worked steps writes it out as an
 * equation, because turning the words into `3 × 4 = 12` is literally the second
 * half of the standard rather than a presentational choice.
 *
 * Two directions, and the second is the one that matters:
 *
 *  - Forward — "Maya has 4 stickers. Ravi has 3 times as many. How many does
 *    Ravi have?" One multiplication, in the order the sentence reads.
 *  - Inverse — "Ravi has 12 stickers, which is 3 times as many as Maya. How
 *    many does Maya have?" The word "times" is still there, so the pull to
 *    multiply is still there, and 36 is what a child who follows the word rather
 *    than the meaning writes down. Working back to the smaller amount is where
 *    this standard is actually taught, and a generator that only ever asked
 *    forward would rate him on the half he already has.
 *
 * Every item is built from the smaller amount and the factor and multiplied up,
 * so the larger amount is a whole number by construction and the inverse
 * direction always has an answer that comes out exactly. There is nothing to
 * redraw and nothing that can fail.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x.
 *
 * Prompt text is display-only — `checkAnswer` never sees it — so this cannot
 * affect grading, and it is the sign on his worksheets.
 */
const TIMES = '×'

/** The prompt gives the smaller amount and asks for the larger. */
const FORWARD = 1
/** The prompt gives the larger amount and asks for the smaller. */
const INVERSE = 0

const RANGE: [number, number] = [12, 82]

/**
 * The four difficulty bands, easiest first.
 *
 * Two dials, and the first is the one that carries this standard:
 *
 *  - `directions` keeps the bottom band forward-only. Working back from the
 *    larger amount is a second idea on top of the comparison itself, and the
 *    easiest band should be measuring one thing. From the second band up both
 *    appear, mixed, so he cannot settle into "this generator always multiplies".
 *  - `smalls` and `factors` grow the arithmetic. Both stop at 12 so the heaviest
 *    item is inside the multiplication facts — past that the question would be
 *    measuring two-digit multiplication, which is MT.4.NBT.5's job.
 */
const BANDS = [
  { smalls: [2, 3, 4, 5], factors: [2, 3, 4], directions: [FORWARD] },
  { smalls: [2, 3, 4, 5, 6, 7, 8, 9], factors: [2, 3, 4, 5], directions: [FORWARD, INVERSE] },
  {
    smalls: [3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
    factors: [3, 4, 5, 6, 7, 8],
    directions: [FORWARD, INVERSE],
  },
  {
    smalls: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    factors: [4, 5, 6, 7, 8, 9, 10, 11, 12],
    directions: [FORWARD, INVERSE],
  },
] as const

type Band = (typeof BANDS)[number]

/**
 * A neutral, varied cast. No surnames, no ages, nobody's family, nobody's money.
 *
 * Exported so the test can rebuild a prompt from `params` character for
 * character. That shares the *words* with the test, never the arithmetic — the
 * answer key is still recomputed from nothing but the numbers.
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
  'Marcus',
  'Zara',
  'Felix',
  'Amara',
  'Diego',
]

/**
 * Things worth collecting, singular and plural.
 *
 * A table rather than a plural built by adding `s`, because "1 stickers" and
 * "12 dominos" are the kind of thing a child reads once and stops trusting the
 * rest of the explanation over. Nothing here is money, nobody's weight and
 * nobody's family.
 */
export const NOUNS: readonly { one: string; many: string }[] = [
  { one: 'sticker', many: 'stickers' },
  { one: 'marble', many: 'marbles' },
  { one: 'trading card', many: 'trading cards' },
  { one: 'seashell', many: 'seashells' },
  { one: 'acorn', many: 'acorns' },
  { one: 'stamp', many: 'stamps' },
  { one: 'button', many: 'buttons' },
  { one: 'pencil', many: 'pencils' },
  { one: 'library book', many: 'library books' },
  { one: 'paper crane', many: 'paper cranes' },
  { one: 'bottle cap', many: 'bottle caps' },
  { one: 'domino', many: 'dominoes' },
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

interface Combo {
  small: number
  factor: number
}

/**
 * The pool a band draws from, built once and reused.
 *
 * Enumerated rather than drawn and redrawn. There is no constraint here that a
 * redraw loop could exhaust, but there is also no reason to write one: every
 * pair a band lists is a legal item, so the pool *is* the band.
 */
const POOLS = new Map<number, Combo[]>()

function poolFor(index: number): Combo[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const band: Band = BANDS[index]!
  const pool: Combo[] = []
  for (const small of band.smalls) for (const factor of band.factors) pool.push({ small, factor })
  POOLS.set(index, pool)
  return pool
}

/**
 * Two different children.
 *
 * Picked as a name and an offset rather than two names and a redraw, so they
 * cannot come out the same and there is no loop to bound.
 */
function twoNames(rng: Rng): [number, number] {
  const a = rng.int(0, NAMES.length - 1)
  const offset = rng.int(1, NAMES.length - 1)
  return [a, (a + offset) % NAMES.length]
}

/** `4 stickers`, `1 sticker`. */
function count(n: number, noun: { one: string; many: string }): string {
  return `${n} ${n === 1 ? noun.one : noun.many}`
}

/**
 * `4 lots`, `1 lot`.
 *
 * A helper rather than a bare `lots`, because splitting a large comparison into
 * "ten lots and another one lot" puts a 1 in front of the word on any item with
 * a factor of eleven — and a child who reads one sentence that is plainly wrong
 * has no way to know which of the others to trust.
 */
function lots(n: number): string {
  return `${n} lot${n === 1 ? '' : 's'}`
}

export const mt4oa1: ItemGenerator = {
  standardId: 'MT.4.OA.1',
  label: 'Times as many',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const { small, factor } = rng.pick(poolFor(bandIndexFor(d)))
    const direction = rng.pick(band.directions)
    const [nameA, nameB] = twoNames(rng)
    const nounIndex = rng.int(0, NOUNS.length - 1)

    const noun = NOUNS[nounIndex]!
    const a = NAMES[nameA]!
    const b = NAMES[nameB]!
    const large = small * factor

    // What the prompt states, and therefore all a test is given to work from:
    // the smaller amount going forwards, the larger amount going back. The
    // answer is deliberately not in here.
    const given = direction === FORWARD ? small : large
    const wanted = direction === FORWARD ? large : small

    return {
      standardId: 'MT.4.OA.1',
      difficulty: d,
      prompt:
        direction === FORWARD
          ? `${a} has ${count(given, noun)}. ${b} has ${factor} times as many ${noun.many} as ` +
            `${a}. How many ${noun.many} does ${b} have?`
          : `${a} has ${count(given, noun)}. That is ${factor} times as many ${noun.many} as ` +
            `${b} has. How many ${noun.many} does ${b} have?`,
      // Whole numbers under 150 throughout, so the key is exact.
      answer: { kind: 'rational', canonical: String(wanted) },
      params: { given, factor, direction, nameA, nameB, noun: nounIndex },
      workedSteps: workedSteps(a, b, small, factor, direction, noun),
      misconceptions: misconceptionsFor(a, b, small, factor, direction, noun),
    }
  },
}

/**
 * How many terms of repeated addition are worth writing out in full.
 *
 * Under this, `4 + 4 + 4 = 12` shows exactly what "times as many" means and is
 * the most convincing line on the page. Over it, a row of twelve numbers stops
 * being an explanation and becomes something to skip, so the same idea is shown
 * by splitting the lots instead.
 */
const SPELL_OUT_LIMIT = 6

function repeatedAddition(each: number, howMany: number): string {
  return Array(howMany).fill(String(each)).join(' + ')
}

/**
 * Why `factor` lots of `small` come to what they come to, as a clause that can
 * be read straight after "because".
 *
 * Three shapes, and which one appears is a judgement about what a ten-year-old
 * will actually read. Up to six lots, the addition written out in full is the
 * most convincing line available — it *is* what "times as many" means. Ten is
 * worth naming as a place-value shift rather than nine additions. Everything
 * else splits into a friendly chunk and the rest, which is the distributive
 * property doing real work rather than being announced.
 */
function lotsMakeUp(small: number, factor: number): string {
  const large = small * factor
  if (factor <= SPELL_OUT_LIMIT) return `${repeatedAddition(small, factor)} = ${large}`
  if (factor === 10) return `${small} with a zero on the end makes ${large}`
  const first = factor > 10 ? 10 : 5
  const rest = factor - first
  return (
    `${lots(first)} of ${small} is ${first * small}, and another ${lots(rest)} is ${rest * small}: ` +
    `${first * small} + ${rest * small} = ${large}`
  )
}

function workedSteps(
  a: string,
  b: string,
  small: number,
  factor: number,
  direction: number,
  noun: { one: string; many: string },
): string[] {
  const large = small * factor

  if (direction === FORWARD) {
    return [
      `"${factor} times as many" means ${lots(factor)} of what ${a} has — not ${factor} more ` +
        `than ${a} has.`,
      `${a} has ${count(small, noun)}, so ${b} has ${lots(factor)} of ${small} — ` +
        `${lotsMakeUp(small, factor)}.`,
      `Written as an equation, that is ${factor} ${TIMES} ${small} = ${large}.`,
      `So ${b} has ${count(large, noun)}.`,
    ]
  }

  return [
    `${a} has ${count(large, noun)}, and that is ${lots(factor)} of what ${b} has. So ${b} has ` +
      `the smaller amount, and ${lots(factor)} of it make ${large}.`,
    `The equation is ${factor} ${TIMES} ? = ${large}.`,
    `Split ${large} into ${lots(factor)} that are all the same size. Each lot is ${small}, ` +
      `because ${lotsMakeUp(small, factor)}.`,
    `Written out, that is ${factor} ${TIMES} ${small} = ${large}. So ${b} has ` +
      `${count(small, noun)}.`,
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
function misconceptionsFor(
  a: string,
  b: string,
  small: number,
  factor: number,
  direction: number,
  noun: { one: string; many: string },
): Misconception[] {
  const large = small * factor
  const correct = direction === FORWARD ? large : small
  const candidates =
    direction === FORWARD
      ? forwardMistakes(a, b, small, factor, noun)
      : inverseMistakes(a, b, small, factor, noun)

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. With 2 and "2 times as
    // many", adding and multiplying both land on 4, and calling that an error
    // would be telling him a right answer is wrong.
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

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

function forwardMistakes(
  a: string,
  b: string,
  small: number,
  factor: number,
  noun: { one: string; many: string },
): Candidate[] {
  const large = small * factor
  return [
    {
      id: 'added-the-comparison',
      value: small + factor,
      label: 'Read "times as many" as "more than"',
      explanation:
        `${small} + ${factor} = ${small + factor} would be the answer to "${factor} more than ` +
        `${a}". This one says ${factor} times as many, which is ${lots(factor)} of ${small}: ` +
        `${factor} ${TIMES} ${small} = ${large}.`,
    },
    {
      id: 'counted-the-first-lot-twice',
      value: large + small,
      label: `Counted ${a}'s own ${noun.many} as well`,
      explanation:
        `${large + small} would be ${lots(factor + 1)} of ${small}. ${b} has ${lots(factor)} of ` +
        `what ${a} has, and ${a}'s own ${count(small, noun)} are not counted on top of that: ` +
        `${factor} ${TIMES} ${small} = ${large}.`,
    },
  ]
}

function inverseMistakes(
  a: string,
  b: string,
  small: number,
  factor: number,
  noun: { one: string; many: string },
): Candidate[] {
  const large = small * factor
  return [
    {
      id: 'multiplied-instead-of-undoing',
      value: large * factor,
      label: 'Multiplied when the comparison had to be undone',
      explanation:
        `The word "times" is in the question, so multiplying feels right — but ${large} is ` +
        `already the bigger amount. ${a} has ${factor} times as many as ${b}, so ${b} has the ` +
        `smaller number. ${factor} ${TIMES} ? = ${large}, and ? is ${small}.`,
    },
    {
      id: 'subtracted-the-comparison',
      value: large - factor,
      label: 'Took the comparison away instead of splitting into lots',
      explanation:
        `Taking ${factor} away from ${large} gives ${large - factor}. "Times as many" is about ` +
        `lots, not about taking away: ${lots(factor)} of ${count(small, noun)} make ${large}, so ` +
        `${b} has ${count(small, noun)}.`,
    },
  ]
}
