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
 *
 * Five formats. This generator used to emit `5 × 2/3` and `2/3 × 5` and nothing
 * else, and Rion — ten years old, plays this — said the questions felt
 * repetitive: "the subject might change slightly, but the pattern remained."
 * Two orderings of one expression is not two questions, so:
 *
 *  - `BARE` is the product, both ways round, as before.
 *  - `REPEATED_ADDITION` writes it out: `2/3 + 2/3 + 2/3`. This is the concrete
 *    end of the standard and it is deliberately the arithmetic of `MT.4.NF.3` —
 *    the point is that the two are the same thing, which is what the worked steps
 *    say in as many words. It is banded to the bottom of the range, where that
 *    bridge is the thing being built, and it never writes out more than five lots.
 *  - `UNIT_COUNT` asks "5 × 2/3 is how many thirds?", which is component
 *    `MT.4.NF.4.a` almost word for word: understanding a/b as a multiple of 1/b.
 *  - `MISSING_FACTOR` turns it round: `? × 2/3 = 10/3`. Working back to the
 *    number of lots is where a child who has memorised "multiply the top" has
 *    nothing to fall back on.
 *  - `WORD` is `MT.4.NF.4.c`: a quantity per container, and several containers.
 *
 * Formats are banded so the two that need working backwards or counting in
 * pieces are out of reach at the bottom. Within every band the numeric dials
 * still do the work they always did: format choice is variety, not difficulty.
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

/** U+00F7 DIVISION SIGN. Display only; the sign on his worksheets. */
const DIVIDE = '÷'

const FRACTION_FIRST = 1

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: the same three numbers make `5 × 2/3 = ?` (ten thirds), "how many
 * thirds?" (ten) and `? × 2/3 = 10/3` (five).
 */
export const BARE = 0
export const REPEATED_ADDITION = 1
export const UNIT_COUNT = 2
export const MISSING_FACTOR = 3
export const WORD = 4

const RANGE: [number, number] = [10, 85]

/**
 * How many lots a written-out sum may have.
 *
 * Twelve copies of `5/12` joined by plus signs is not a question, it is a wall.
 * Two of them is the opposite problem: `1/2 + 1/2` is not visibly *repeated*
 * anything, and it is a question about `MT.4.NF.3` wearing this standard's shirt.
 * Three to five reads at a glance and is unmistakably lots-of-something.
 *
 * Enforced in the pool rather than in the band tables, so a band edited later
 * cannot reintroduce either end.
 */
const MIN_WRITTEN_LOTS = 3
const MAX_WRITTEN_LOTS = 5

interface Band {
  dens: readonly number[]
  wholes: readonly number[]
  resultRule: 'any' | 'exceedsOne' | 'improperFraction'
  formats: readonly number[]
}

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
 *
 * `formats` is not a difficulty dial. It is banded so that the concrete written
 * out sum is where it belongs — at the bottom, and only there — and so that
 * counting in pieces and working back to the number of lots arrive later.
 */
const BANDS: readonly Band[] = [
  {
    dens: [2, 3, 4],
    wholes: [2, 3],
    resultRule: 'any',
    formats: [BARE, REPEATED_ADDITION, WORD],
  },
  {
    dens: [2, 3, 4, 5, 6],
    wholes: [2, 3, 4, 5],
    resultRule: 'any',
    formats: [BARE, REPEATED_ADDITION, UNIT_COUNT, WORD],
  },
  {
    dens: [3, 4, 5, 6, 8],
    wholes: [3, 4, 5, 6, 7],
    resultRule: 'exceedsOne',
    formats: [BARE, UNIT_COUNT, MISSING_FACTOR, WORD],
  },
  {
    dens: [5, 6, 8, 9, 10, 12],
    wholes: [4, 5, 6, 7, 8, 9, 10, 12],
    resultRule: 'improperFraction',
    formats: [BARE, UNIT_COUNT, MISSING_FACTOR, WORD],
  },
]

/**
 * What one piece of a whole cut into `den` is called, singular and plural.
 *
 * Worth the table rather than building the word from the number: "one-3th" and
 * "1 fifths" are the kind of thing a child reads once and stops trusting the
 * rest of the explanation over. Every denominator any band can draw is listed;
 * "piece" is here so that adding a denominator later degrades to something
 * plain rather than to something broken. Exported so the soundness test can
 * rebuild a prompt from `params` character for character — which shares the
 * words, never the arithmetic.
 */
export const PIECE_NAMES: Record<number, readonly [string, string]> = {
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
  return count === 1 ? names[0] : names[1]
}

/**
 * Containers that hold a fraction of a unit of something, for the word format.
 *
 * The contents are all mass nouns, deliberately, because the question asks "how
 * much" every time: "how much juice" works and "how much seeds" does not. The
 * container plural is stored rather than built, and the whole number is never 1,
 * so "5 glasses" is always right and "1 glasses" cannot happen.
 */
export const CONTAINERS: readonly {
  container: string
  containers: string
  unit: string
  units: string
  stuff: string
}[] = [
  { container: 'glass', containers: 'glasses', unit: 'cup', units: 'cups', stuff: 'juice' },
  { container: 'bottle', containers: 'bottles', unit: 'liter', units: 'liters', stuff: 'water' },
  { container: 'jar', containers: 'jars', unit: 'cup', units: 'cups', stuff: 'honey' },
  { container: 'bowl', containers: 'bowls', unit: 'cup', units: 'cups', stuff: 'soup' },
  { container: 'bag', containers: 'bags', unit: 'pound', units: 'pounds', stuff: 'rice' },
  { container: 'tub', containers: 'tubs', unit: 'liter', units: 'liters', stuff: 'paint' },
  { container: 'mug', containers: 'mugs', unit: 'cup', units: 'cups', stuff: 'cocoa' },
  { container: 'box', containers: 'boxes', unit: 'pound', units: 'pounds', stuff: 'sand' },
]

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
 * The pool a band and format draw from, built once and reused.
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
const POOLS = new Map<string, Combo[]>()

function poolFor(index: number, format: number): Combo[] {
  const key = `${index}:${format}`
  const cached = POOLS.get(key)
  if (cached) return cached
  const band = BANDS[index]!
  const legal: Combo[] = []
  for (const den of band.dens) {
    for (const whole of band.wholes) {
      for (const n of numeratorsFor(den)) legal.push({ whole, n, den })
    }
  }
  const suited = legal.filter(
    (c) =>
      suitsBand(band, c) &&
      (format !== REPEATED_ADDITION ||
        (c.whole >= MIN_WRITTEN_LOTS && c.whole <= MAX_WRITTEN_LOTS)),
  )
  const pool = suited.length > 0 ? suited : legal
  POOLS.set(key, pool)
  return pool
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  /** Canonical answer, already in lowest terms. */
  answer: string
  /** Params this format needs beyond the combo, `order` and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nf4: ItemGenerator = {
  standardId: 'MT.4.NF.4',
  label: 'Multiplying a fraction by a whole number',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const format = rng.pick(BANDS[index]!.formats)
    const combo = rng.pick(poolFor(index, format))
    // Both orders, because 2/3 × 5 and 5 × 2/3 are the same question and a child
    // who has only ever seen one of them can freeze on the other. The formats
    // with nothing to reorder record 0 and ignore it.
    const order = format === BARE || format === MISSING_FACTOR ? rng.int(0, 1) : 0

    const draft = draftFor(format, combo, order, rng)

    return {
      standardId: 'MT.4.NF.4',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      answer: { kind: 'rational', canonical: draft.answer },
      params: { ...combo, order, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, combo: Combo, order: number, rng: Rng): Draft {
  switch (format) {
    case REPEATED_ADDITION:
      return writtenOut(combo)
    case UNIT_COUNT:
      return unitCount(combo)
    case MISSING_FACTOR:
      return missingFactor(combo, order)
    case WORD:
      return inContext(combo, rng)
    default:
      return bare(combo, order)
  }
}

// ---------------------------------------------------------------------------
// The formats

/** `5 × 2/3`, or `2/3 × 5`. */
function bare({ whole, n, den }: Combo, order: number): Draft {
  const top = whole * n
  const result = new R(top, den)

  return {
    prompt: order === FRACTION_FIRST ? `${n}/${den} ${TIMES} ${whole}` : `${whole} ${TIMES} ${n}/${den}`,
    answer: result.toString(),
    extra: {},
    workedSteps: [
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
      ...tidySteps(whole, n, den, top, result),
    ],
    misconceptions: keepUsable(
      productMistakes(
        whole,
        n,
        den,
        top,
        `That is ${whole} and ${n}/${den} put together. This one says ${TIMES}, which means ` +
          `${whole} lots of ${n}/${den}. Each lot is less than one whole, so the answer has to ` +
          `land below ${whole}, not above it.`,
      ),
      result,
    ),
  }
}

/** `2/3 + 2/3 + 2/3`. The same product, written out as the addition it is. */
function writtenOut({ whole, n, den }: Combo): Draft {
  const top = whole * n
  const result = new R(top, den)
  const terms = Array.from({ length: whole }, () => `${n}/${den}`)

  return {
    prompt: terms.join(' + '),
    answer: result.toString(),
    extra: {},
    workedSteps: [
      `Every one of these has ${den} on the bottom, so the pieces are already the same size and ` +
        `only the count changes.`,
      `Add the top numbers: ${Array.from({ length: whole }, () => String(n)).join(' + ')} = ` +
        `${top}. The bottom number stays ${den}: ${top}/${den}.`,
      `There are ${whole} lots of ${n}/${den} here, so this is the same question as ` +
        `${whole} ${TIMES} ${n}/${den}. Multiplying by a whole number is adding that many lots.`,
      ...tidySteps(whole, n, den, top, result),
    ],
    misconceptions: keepUsable(
      [
        {
          // Adding straight across a chain of like fractions: the top numbers add
          // to whole × n and the bottom ones to whole × den, which cancels
          // straight back to one lot. It can never be right, because that would
          // need only one lot to be there.
          id: 'add-across',
          value: new R(top, den * whole),
          label: 'Added the bottom numbers too',
          explanation:
            `The bottom numbers got added as well, which lands right back on ${n}/${den} — one ` +
            `lot, not ${whole}. The bottom number says how big each piece is, and the pieces did ` +
            `not change: ${top} of them, still ${pieceWord(den, top)}.`,
        },
        {
          id: 'one-lot-short',
          value: new R(top - n, den),
          label: 'Added one lot too few',
          explanation:
            `That is ${whole - 1} lots of ${n}/${den}, and there are ${whole} of them here. One ` +
            `more lot makes ${top} ${pieceWord(den, top)}: ${top}/${den}.`,
        },
        droppedDenominator(top, den),
      ],
      result,
    ),
  }
}

/** "5 × 2/3 is how many thirds?" — a/b as a multiple of 1/b, asked outright. */
function unitCount({ whole, n, den }: Combo): Draft {
  const top = whole * n
  const result = new R(top, den)
  const many = pieceWord(den, 2)

  return {
    prompt: `${whole} ${TIMES} ${n}/${den} is how many ${many}?`,
    answer: String(top),
    extra: {},
    workedSteps: [
      `${whole} ${TIMES} ${n}/${den} means ${whole} lots of ${n}/${den}.`,
      `Each lot is ${n} ${pieceWord(den, n)}, so ${whole} lots make ` +
        `${whole} ${TIMES} ${n} = ${top} ${pieceWord(den, top)}.`,
      `Written as a fraction that is ${top}/${den}${
        result.d === den ? '' : `, which tidies up to ${result.toString()}`
      }. This question asks for the count of ${many}, which is ${top}.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // Always available: top/den equals the whole number top only if den is
          // 1, and den is at least 2 on every band.
          id: 'answered-the-total',
          value: result,
          label: 'Gave the amount instead of the count',
          explanation:
            `${result.toString()} is the right amount, and this question is asking how many ` +
            `${many} that is. The two are the same thing counted differently: ${top}/${den} is ` +
            `${top} ${pieceWord(den, top)}, so the count is ${top}.`,
        },
        {
          id: 'multiplied-the-denominator',
          value: new R(whole * den, 1),
          label: 'Multiplied the bottom number instead of the top',
          explanation:
            `${whole} ${TIMES} ${den} = ${whole * den} multiplies how big the pieces are, and ` +
            `they never change. What multiplies is how many there are in each lot: ` +
            `${whole} ${TIMES} ${n} = ${top}.`,
        },
        {
          id: 'kept-the-count',
          value: new R(n, 1),
          label: 'Counted one lot only',
          explanation:
            `${n} ${pieceWord(den, n)} is one lot. There are ${whole} lots here, so there are ` +
            `${whole} ${TIMES} ${n} = ${top} of them altogether.`,
        },
      ],
      new R(top, 1),
    ),
  }
}

/** `? × 2/3 = 10/3`. Working back to how many lots there were. */
function missingFactor({ whole, n, den }: Combo, order: number): Draft {
  const top = whole * n
  const result = new R(top, den)
  const total = result.toString()
  const many = pieceWord(den, 2)

  return {
    prompt:
      order === FRACTION_FIRST
        ? `${n}/${den} ${TIMES} ? = ${total}. What is the missing number?`
        : `? ${TIMES} ${n}/${den} = ${total}. What is the missing number?`,
    promptWithSlot:
      order === FRACTION_FIRST
        ? `${n}/${den} ${TIMES} {} = ${total}`
        : `{} ${TIMES} ${n}/${den} = ${total}`,
    answer: String(whole),
    extra: { top },
    workedSteps: [
      `Each lot is ${n}/${den} and the whole thing comes to ${total}. The question is how many ` +
        `lots that takes.`,
      `Count everything in ${many}: ${total} is ${top} ${pieceWord(den, top)}, and each lot is ` +
        `${n} of them.`,
      `${top} ${DIVIDE} ${n} = ${whole}, so there are ${whole} lots: ` +
        `${whole} ${TIMES} ${n}/${den} = ${total}.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // Always available: the total equals the whole number `whole` only if
          // n equals den, and n is always less than den.
          id: 'answered-the-total',
          value: result,
          label: 'Wrote the total again',
          explanation:
            `${total} is the amount the whole thing comes to, and it is already written down. ` +
            `The missing number is how many lots of ${n}/${den} it takes to get there, which is ` +
            `${whole}.`,
        },
        {
          // Also always available: the total minus one lot is n(whole − 1)/den,
          // and with n smaller than den that is always less than `whole`.
          id: 'read-it-as-adding',
          value: new R(top - n, den),
          label: 'Read it as an addition',
          explanation:
            `That is what you get by taking ${n}/${den} away from ${total}, which is what the ` +
            `question would need if it said +. It says ${TIMES}, so ${n}/${den} is one lot and ` +
            `the answer is how many lots there are: ${top} ${DIVIDE} ${n} = ${whole}.`,
        },
        {
          id: 'answered-the-piece-count',
          value: new R(top, 1),
          label: 'Counted the pieces instead of the lots',
          explanation:
            `${top} is how many ${many} there are altogether. Each lot holds ${n} of them, so ` +
            `the number of lots is ${top} ${DIVIDE} ${n} = ${whole}.`,
        },
      ],
      new R(whole, 1),
    ),
  }
}

/** A quantity per container, and several containers. */
function inContext({ whole, n, den }: Combo, rng: Rng): Draft {
  const top = whole * n
  const result = new R(top, den)
  const index = rng.int(0, CONTAINERS.length - 1)
  const { container, containers, unit, units, stuff } = CONTAINERS[index]!

  return {
    prompt:
      `Each ${container} holds ${n}/${den} of a ${unit} of ${stuff}. ` +
      `How much ${stuff} do ${whole} ${containers} hold altogether?`,
    answer: result.toString(),
    extra: { container: index },
    workedSteps: [
      `There are ${whole} ${containers}, and each one holds ${n}/${den} of a ${unit}. That is ` +
        `${whole} lots of ${n}/${den}.`,
      `Each lot is ${n} ${pieceWord(den, n)}, so ${whole} lots make ` +
        `${whole} ${TIMES} ${n} = ${top} ${pieceWord(den, top)}.`,
      `The pieces never changed size, so the bottom number stays ${den}: ${top}/${den}.`,
      ...tidySteps(whole, n, den, top, result),
      `So the ${whole} ${containers} hold ${quantity(result.n, result.d, unit, units)} of ` +
        `${stuff} altogether.`,
    ],
    misconceptions: keepUsable(
      productMistakes(
        whole,
        n,
        den,
        top,
        `That is ${whole} whole ${unit}s with ${n}/${den} added on top. Each ${container} holds ` +
          `less than a whole ${unit} though, so ${whole} of them come to less than ${whole} ` +
          `${units}, not more.`,
      ),
      result,
    ),
  }
}

// ---------------------------------------------------------------------------
// Shared wording

/**
 * How an amount reads with its unit.
 *
 * "3/8 of a cup" while it is less than one, "10/3 cups" once it is more, and
 * "2 cups" or "1 cup" when it comes out whole. A table of cases rather than a
 * plural stuck on the end, because "1 cups" and "3/8 cups" are both wrong in
 * ways a child notices.
 */
function quantity(n: number, d: number, unit: string, units: string): string {
  if (d === 1) return `${n} ${n === 1 ? unit : units}`
  return n < d ? `${n}/${d} of a ${unit}` : `${n}/${d} ${units}`
}

/** The steps that tidy `top/den` up and say what it means, when there is anything to say. */
function tidySteps(whole: number, n: number, den: number, top: number, result: R): string[] {
  const steps: string[] = []

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

interface Candidate {
  id: string
  value: R
  label: string
  explanation: string
}

/**
 * Answering with the numerator alone: the fraction gets treated as two separate
 * whole numbers and the bottom one gets left behind.
 */
function droppedDenominator(top: number, den: number): Candidate {
  return {
    id: 'dropped-denominator',
    value: new R(top, 1),
    label: 'Left the bottom number off',
    explanation:
      `You counted the pieces right: ${top}. On its own though, ${top} means ${top} whole ones, ` +
      `which is far bigger. Keep the bottom number with it: ${top}/${den}.`,
  }
}

/**
 * The wrong answers worth knowing by name on a question that asks for the
 * product.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * `addedInstead` is passed in because it is the one explanation that cannot be
 * shared. A bare `5 × 2/3` can say "this one says ×"; a word problem has no
 * times sign anywhere on the screen, and telling a child to look at one would be
 * telling him to look for something that is not there.
 */
function productMistakes(
  whole: number,
  n: number,
  den: number,
  top: number,
  addedInstead: string,
): Candidate[] {
  return [
    {
      // Multiplying top and bottom by the same number is exactly the equivalent
      // fractions move from MT.4.NF.1, so it always lands straight back on the
      // fraction he started with. That is the whole explanation, and it is a
      // better one than any rule: the answer cannot be right because it never
      // went anywhere.
      id: 'multiplied-both',
      value: new R(top, den * whole),
      label: 'Multiplied the bottom number too',
      explanation:
        `Multiplying the top and the bottom by the same number does not change the amount — ` +
        `that lands right back on ${n}/${den}, one lot on its own. The answer has to be bigger ` +
        `than that, because there are ${whole} of them.`,
    },
    {
      id: 'multiplied-denominator-only',
      value: new R(n, den * whole),
      label: 'Multiplied the bottom number instead of the top',
      explanation:
        `The ${whole} went onto the bottom, which cuts the pieces into smaller ones. Having more ` +
        `lots does not change how big the pieces are, only how many there are: ` +
        `${whole} ${TIMES} ${n} = ${top}, still over ${den}.`,
    },
    {
      id: 'added-instead',
      value: new R(whole * den + n, den),
      label: 'Added instead of multiplying',
      explanation: addedInstead,
    },
    droppedDenominator(top, den),
  ]
}

/**
 * Drop the candidates that cannot be used, keeping the most diagnostic of any
 * that collide.
 */
function keepUsable(candidates: readonly Candidate[], answer: R): Misconception[] {
  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never tell him a right answer is a known mistake.
    if (c.value.equals(answer)) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
