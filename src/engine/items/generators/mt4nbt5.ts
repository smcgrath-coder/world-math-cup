/**
 * MT.4.NBT.5 — multiplying multi-digit whole numbers.
 *
 * "Multiply a whole number of up to four digits by a one-digit whole number,
 * multiply two two-digit numbers, flexibly using strategies based on place value
 * and the properties of operations."
 *
 * Two shapes, named separately by the standard because they are two different
 * skills. Up-to-four-digits by one digit is one pass across the places, and the
 * only thing that can go wrong between columns is the carry. Two-digit by
 * two-digit is a genuine step up: the multiplier itself has places, so there are
 * two partial products and the second one is worth ten times what it looks like.
 * That is where the placeholder zero lives, and where most of this standard's
 * lost marks live with it.
 *
 * So the worked steps never say "put down a zero". They say what the second part
 * actually is — 23 × 40, not 23 × 4 — because a rule about a zero is a rule to
 * forget, and 40 is a number he can see.
 *
 * Six formats. This generator used to emit `a × b` and nothing else at all —
 * measured with every number masked out, one prompt shape, 100% of items — and
 * Rion, who is ten and plays this, said the questions felt repetitive: "the
 * subject might change slightly, but the pattern remained." On this standard he
 * was exactly right, so:
 *
 *  - `BARE` is the product, both ways round, as before.
 *  - `MISSING_FACTOR` turns it round: `? × 6 = 852`. A child who has memorised
 *    "line them up and multiply" has nothing to line up, and the way through is
 *    the relationship between multiplication and division.
 *  - `WORD_GROUPS` is equal groups — a quantity per container and several
 *    containers, which is what multiplication is *for*.
 *  - `WORD_ROWS` is the array: rows and how many in each row. Same operation,
 *    completely different picture, and the picture is the one that makes the
 *    two-digit by two-digit split make sense.
 *  - `PARTIAL_PRODUCT` asks for one part of the split on purpose: "to work out
 *    23 × 45 you can split 45 into 40 + 5. What is 23 × 40?" This is the
 *    standard's own named strategy, asked about directly instead of assumed.
 *  - `TEN_TIMES` gives a fact and asks for it scaled: "8 × 7 = 56. What is
 *    8 × 70?" Place value doing the work, with no algorithm involved.
 *
 * Formats are banded so that the two framings needing a step of reasoning on top
 * of the multiplication arrive later, and so the known-fact framing sits low
 * where it belongs. Within every band the carry dial still does the work it
 * always did: format choice is variety, not difficulty.
 *
 * Deliberately *not* added: a rectangle's side lengths and its area. `MT.4.MD.3`
 * owns area of rectangles and asks that question already, in those words. Two
 * generators emitting the same question would split one skill across two card
 * stats and rate neither of them honestly.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x, and U+00F7 DIVISION SIGN.
 *
 * Prompt text is display-only — `checkAnswer` never sees it — so this cannot
 * affect grading, and the only question is how it reads. A letter x sitting
 * between two numbers is one more thing to decode; the real sign is the one on
 * his worksheets.
 */
const TIMES = '×'
const DIVIDE = '÷'
const MINUS = '−'

const BY_ONE = 'byOne'
const BY_TWO = 'byTwo'

const RANGE: [number, number] = [15, 88]

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: the same two factors make `23 × 45` (the product), `? × 45 = 1035` (one
 * factor) and `23 × 40` (one part of the product).
 */
export const BARE = 0
export const MISSING_FACTOR = 1
export const WORD_GROUPS = 2
export const WORD_ROWS = 3
export const PARTIAL_PRODUCT = 4
export const TEN_TIMES = 5

/** `slot`: the missing factor is the first one written. */
export const SLOT_FIRST = 1

/** `split`: the factor being taken apart is the first one written. */
export const SPLIT_FIRST = 1

/**
 * The shapes each difficulty band can draw, easiest first.
 *
 * For the one-digit multiplier, `carry` is the dial that matters, the same way
 * regrouping is the dial on MT.4.NBT.4: `21 × 4` and `27 × 4` are the same size
 * of question and not the same question.
 *
 *  - Band 0 never carries. Every place is multiplied on its own and written
 *    straight down, which is the honest first version of this standard.
 *  - Band 1 carries or does not, mixed, so the shape of the page gives nothing
 *    away.
 *  - Band 2 always carries, and introduces two-digit by two-digit with a small
 *    multiplier so the second partial product stays inside a friendly number.
 *  - Band 3 is four digits by one, or two-digit by two-digit with no 1s and no
 *    0s anywhere — every one of the four parts is then worth working out, so
 *    nothing can be got right by accident.
 *
 * A band holds a list of shapes rather than one, so the top of the range keeps
 * moving between the two halves of the standard instead of drilling one.
 */
interface ByOneSpec {
  shape: typeof BY_ONE
  /** How many digits the number being multiplied has. */
  digits: number
  multipliers: readonly number[]
  carry: 'none' | 'any' | 'some'
}

interface ByTwoSpec {
  shape: typeof BY_TWO
  /** Tens digits either number may hold. */
  tens: readonly number[]
  /** Ones digits either number may hold. Never 0, so all four parts are live. */
  ones: readonly number[]
}

type Spec = ByOneSpec | ByTwoSpec

interface Band {
  specs: readonly Spec[]
  /**
   * How many zeros the round number in a ten-times question may have, so the
   * framing scales from `8 × 70` to `8 × 700` rather than staying still.
   */
  zeros: readonly number[]
  formats: readonly number[]
}

/**
 * `formats` is not a difficulty dial — it is what stops the standard being one
 * memorised expression. It is banded on two grounds only:
 *
 *  - The two framings that need a step of reasoning on top of the multiplication
 *    — working back to a factor, and working out one named part of a split — are
 *    kept out of the easiest band.
 *  - `TEN_TIMES` is a known-fact question and does not get harder the way the
 *    algorithm does, so it lives in the bottom half where it is the right amount
 *    of work, and the top half leans on `PARTIAL_PRODUCT` for place value
 *    instead. Putting an easy framing at the top of the range would make the
 *    difficulty number mean less than it does.
 */
const BANDS: readonly Band[] = [
  {
    specs: [{ shape: BY_ONE, digits: 2, multipliers: [2, 3, 4, 5], carry: 'none' }],
    zeros: [1],
    formats: [BARE, WORD_GROUPS, TEN_TIMES],
  },
  {
    specs: [
      { shape: BY_ONE, digits: 2, multipliers: [2, 3, 4, 5, 6, 7, 8, 9], carry: 'any' },
      { shape: BY_ONE, digits: 3, multipliers: [2, 3, 4, 5, 6], carry: 'any' },
    ],
    zeros: [1, 2],
    formats: [BARE, WORD_GROUPS, TEN_TIMES, MISSING_FACTOR],
  },
  {
    specs: [
      { shape: BY_ONE, digits: 3, multipliers: [2, 3, 4, 5, 6, 7, 8, 9], carry: 'some' },
      { shape: BY_ONE, digits: 4, multipliers: [2, 3, 4, 5, 6], carry: 'some' },
      { shape: BY_TWO, tens: [1, 2, 3], ones: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
    ],
    zeros: [1, 2],
    formats: [BARE, WORD_GROUPS, WORD_ROWS, MISSING_FACTOR, PARTIAL_PRODUCT],
  },
  {
    specs: [
      { shape: BY_ONE, digits: 4, multipliers: [3, 4, 5, 6, 7, 8, 9], carry: 'some' },
      { shape: BY_TWO, tens: [2, 3, 4, 5, 6, 7, 8, 9], ones: [2, 3, 4, 5, 6, 7, 8, 9] },
    ],
    zeros: [1, 2],
    formats: [BARE, WORD_GROUPS, WORD_ROWS, MISSING_FACTOR, PARTIAL_PRODUCT],
  },
]

/**
 * Containers holding a quantity of something countable, for the equal-groups
 * format.
 *
 * The per-container amount is the number the working splits into places, which
 * for the one-digit shape is the long number — so these all have to be things
 * that plausibly hold hundreds or thousands. A crate really does hold hundreds of
 * apples and a truck really does carry thousands of bricks; "each box holds 8437
 * pencils" would be a question about nothing.
 *
 * Exported so the soundness test can rebuild a prompt from `params` character
 * for character — which shares the words, never the arithmetic.
 */
export const GROUP_CONTEXTS: readonly {
  each: string
  eachPlural: string
  item: string
  items: string
  /** Third person singular, for "each crate holds". */
  verb: string
  /** Plural, for "the 4 crates hold". Stored, not built: has/have, carries/carry. */
  verbPlural: string
  /**
   * The range of per-container amounts this situation can carry.
   *
   * A crate really does hold hundreds of apples and a truck really does carry
   * thousands of bricks, but "each hall has 12 seats" is a question about
   * nothing and "each crate holds 8437 apples" is a lie about crates. The
   * amount is whichever factor the working takes apart, which runs from two
   * digits to four across the range, so the situation has to be chosen to fit
   * the number rather than the other way round.
   */
  minPer: number
  maxPer: number
}[] = [
  {
    each: 'crate',
    eachPlural: 'crates',
    item: 'apple',
    items: 'apples',
    verb: 'holds',
    verbPlural: 'hold',
    minPer: 10,
    maxPer: 999,
  },
  {
    each: 'truck',
    eachPlural: 'trucks',
    item: 'brick',
    items: 'bricks',
    verb: 'carries',
    verbPlural: 'carry',
    minPer: 100,
    maxPer: 9999,
  },
  {
    each: 'field',
    eachPlural: 'fields',
    item: 'tree',
    items: 'trees',
    verb: 'has',
    verbPlural: 'have',
    minPer: 10,
    maxPer: 9999,
  },
  {
    each: 'hall',
    eachPlural: 'halls',
    item: 'seat',
    items: 'seats',
    verb: 'has',
    verbPlural: 'have',
    minPer: 100,
    maxPer: 9999,
  },
  {
    each: 'box',
    eachPlural: 'boxes',
    item: 'nail',
    items: 'nails',
    verb: 'holds',
    verbPlural: 'hold',
    minPer: 10,
    maxPer: 9999,
  },
  {
    each: 'jar',
    eachPlural: 'jars',
    item: 'bead',
    items: 'beads',
    verb: 'holds',
    verbPlural: 'hold',
    minPer: 10,
    maxPer: 9999,
  },
]

/**
 * The situations that can hold this many things, enumerated and filtered.
 *
 * The 0 fallback is a programming-error path: between them the contexts have to
 * cover every amount the bands can draw, which is 10 to 9999. The game keeps
 * running on a slightly odd sentence rather than handing an empty list to
 * `rng.pick`, which throws.
 */
function groupContextFor(rng: Rng, per: number): number {
  const suited: number[] = []
  GROUP_CONTEXTS.forEach((c, i) => {
    if (per >= c.minPer && per <= c.maxPer) suited.push(i)
  })
  return suited.length > 0 ? rng.pick(suited) : 0
}

/**
 * Places laid out in rows, for the array format.
 *
 * Only the two-digit by two-digit shape draws these, because "6 rows of 8437
 * chairs" is not a room anybody has been in. Each context supplies its own
 * closing question rather than a noun to slot in, since the natural way to ask
 * changes with the place.
 */
export const ROW_CONTEXTS: readonly {
  subject: string
  item: string
  items: string
  ask: string
}[] = [
  {
    subject: 'A theater',
    item: 'seat',
    items: 'seats',
    ask: 'How many seats does the theater have altogether?',
  },
  {
    subject: 'An orchard',
    item: 'tree',
    items: 'trees',
    ask: 'How many trees are in the orchard?',
  },
  {
    subject: 'A choir',
    item: 'singer',
    items: 'singers',
    ask: 'How many singers are in the choir?',
  },
  {
    subject: 'A vegetable garden',
    item: 'plant',
    items: 'plants',
    ask: 'How many plants are in the garden?',
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

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/** Ones-first digits back into a number. */
function numberFrom(digits: readonly number[]): number {
  let value = 0
  for (let i = digits.length - 1; i >= 0; i--) value = value * 10 + digits[i]!
  return value
}

/** `1 apple`, `347 apples`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

function popcount(mask: number): number {
  let n = 0
  for (let m = mask; m > 0; m >>= 1) n += m & 1
  return n
}

/**
 * The carry patterns a band will accept, as bitmasks over the columns.
 *
 * Enumerated and filtered rather than drawn and redrawn. The trap a retry loop
 * falls into here is real: `carry: 'none'` with a multiplier of 9 leaves only
 * the digits 0 and 1 available, so a loop hunting for a carry-free number would
 * burn its budget and then emit one that carries — the exact thing the band
 * exists to rule out. A filtered list either has an answer or visibly does not.
 */
function carryMasks(columns: number, rule: ByOneSpec['carry']): number[] {
  if (rule === 'none') return [0]
  const all: number[] = []
  for (let mask = 0; mask < 1 << columns; mask++) all.push(mask)
  if (rule === 'some') return all.filter((mask) => popcount(mask) >= 1)
  return all
}

/**
 * The digits this column is allowed to hold.
 *
 * A column carries exactly when its digit times the multiplier reaches ten, so
 * the constraint is a plain filter over the ten digits. The `all` fallback keeps
 * the game running on a slightly-too-easy question if a band is ever written
 * with constraints nothing satisfies, rather than handing an empty list to
 * `rng.pick`, which throws.
 */
function digitPool(multiplier: number, min: number, mustCarry: boolean): number[] {
  const all: number[] = []
  for (let digit = min; digit <= 9; digit++) all.push(digit)
  const suited = all.filter((digit) =>
    mustCarry ? digit * multiplier >= 10 : digit * multiplier <= 9,
  )
  return suited.length > 0 ? suited : all
}

/**
 * The smallest digit a place may hold.
 *
 * The leading place cannot be 0 because a number is not written starting with
 * one. The ones place is kept off 0 for a different reason: `20 × 2` is not
 * really this standard — it collapses to a single fact with a zero after it, the
 * worked steps shrink to one line, and "only the ones digit got multiplied"
 * becomes an answer of 0, which is not a mistake anybody makes. A 0 in the
 * *middle* is the opposite: `204 × 3` is worth meeting, so those places keep it.
 *
 * `TEN_TIMES` is the one framing where a round number is the whole point, and it
 * builds its number itself rather than going through here.
 */
function smallestDigit(place: number, digits: number): number {
  return place === 0 || place === digits - 1 ? 1 : 0
}

interface Factors {
  a: number
  b: number
}

function buildByOne(rng: Rng, spec: ByOneSpec): Factors {
  const multiplier = rng.pick(spec.multipliers)
  const mask = rng.pick(carryMasks(spec.digits, spec.carry))

  const digits: number[] = []
  for (let i = 0; i < spec.digits; i++) {
    const pool = digitPool(multiplier, smallestDigit(i, spec.digits), ((mask >> i) & 1) === 1)
    digits.push(rng.pick(pool))
  }

  const long = numberFrom(digits)
  // Both orders, because 6 × 347 and 347 × 6 are the same question and a child
  // who has only ever seen one of them can freeze on the other.
  return rng.int(0, 1) === 1 ? { a: long, b: multiplier } : { a: multiplier, b: long }
}

function buildByTwo(rng: Rng, spec: ByTwoSpec): Factors {
  return {
    a: rng.pick(spec.tens) * 10 + rng.pick(spec.ones),
    b: rng.pick(spec.tens) * 10 + rng.pick(spec.ones),
  }
}

/**
 * A one-digit fact scaled up by a power of ten: 7 becomes 70 or 700.
 *
 * Built here rather than through `buildByOne` because the round number is the
 * whole point of the framing, and because the band's carry rule has to land on
 * the *fact* — `8 × 7` carries and `2 × 3` does not, and that is what makes this
 * question harder or easier.
 */
function buildTenTimes(rng: Rng, band: Band): Factors {
  const byOne = band.specs.filter((s): s is ByOneSpec => s.shape === BY_ONE)
  const spec = byOne.length > 0 ? rng.pick(byOne) : TEN_TIMES_FALLBACK
  const multiplier = rng.pick(spec.multipliers)
  const mustCarry =
    spec.carry === 'some' ? true : spec.carry === 'none' ? false : rng.int(0, 1) === 1
  const digit = rng.pick(digitPool(multiplier, 1, mustCarry))
  return { a: multiplier, b: digit * 10 ** rng.pick(band.zeros) }
}

/**
 * Only reachable if a band offers the ten-times framing with no one-digit shape
 * to build it from, which is a programming mistake — the game keeps running on a
 * slightly-easy question rather than crashing mid-match.
 */
const TEN_TIMES_FALLBACK: ByOneSpec = {
  shape: BY_ONE,
  digits: 2,
  multipliers: [2, 3, 4, 5, 6, 7, 8, 9],
  carry: 'any',
}

/**
 * The shapes a format can be asked about.
 *
 * Rows and columns, and one part of a split, both need two two-digit numbers.
 * A missing factor needs the one-digit shape: `? × 21 = 672` comes back only by
 * dividing by 21, and dividing by a two-digit number is a fifth-grade skill.
 * With a one-digit shape, either the blank is the long number — recovered by
 * dividing by a single digit, which this grade does — or the blank is the single
 * digit, which is one of eight numbers and comes back by counting lots.
 *
 * The band tables already only offer each format where its shape exists, so the
 * fallback is a programming-error path: the game keeps running on a question of
 * the wrong shape rather than handing an empty list to `rng.pick`, which throws.
 */
function specsFor(band: Band, format: number): readonly Spec[] {
  const wanted =
    format === WORD_ROWS || format === PARTIAL_PRODUCT
      ? BY_TWO
      : format === MISSING_FACTOR
        ? BY_ONE
        : null
  if (wanted === null) return band.specs
  const suited = band.specs.filter((s) => s.shape === wanted)
  return suited.length > 0 ? suited : band.specs
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  answer: string
  /** Params this format needs beyond `a`, `b` and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nbt5: ItemGenerator = {
  standardId: 'MT.4.NBT.5',
  label: 'Multiplying big numbers',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const format = rng.pick(band.formats)

    let factors: Factors
    if (format === TEN_TIMES) {
      factors = buildTenTimes(rng, band)
    } else {
      const spec = rng.pick(specsFor(band, format))
      factors = spec.shape === BY_ONE ? buildByOne(rng, spec) : buildByTwo(rng, spec)
    }

    const draft = draftFor(format, factors.a, factors.b, rng)

    return {
      standardId: 'MT.4.NBT.5',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      // The largest product this can produce is 9999 × 9, so every value here is
      // an exact whole number nowhere near where doubles stop being exact.
      answer: { kind: 'rational', canonical: draft.answer },
      params: { a: factors.a, b: factors.b, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

/**
 * A named bare product as an item, for a tackle-back decomposed from the
 * question he missed: an area of 14 by 6 becomes `14 × 6`, chosen rather than
 * drawn, because area is a multiplication before it is anything else.
 *
 * Pitched by the shape of the sum rather than by what he was asked, so the
 * rating on this standard moves by what he actually worked out: two digits by
 * one sits in the bottom band, three by one in the second, anything longer or
 * two-digit by two-digit in the third. Never the top band, which is reserved
 * for the shapes where every part is live.
 *
 * `null` when the pair is not a product this standard asks — both factors
 * single digits is a multiplication fact, and belongs to `FLU.MULT`.
 */
export function productItem(a: number, b: number): Item | null {
  if (!Number.isInteger(a) || !Number.isInteger(b) || a < 1 || b < 1) return null
  if (a > 9999 || b > 9999) return null
  if (a <= 9 && b <= 9) return null
  if (a >= 10 && b >= 10 && (a > 99 || b > 99)) return null

  const [long] = byOneParts(a, b)
  const index = isByTwo(a, b) ? 2 : Math.min(2, String(long).length - 2)
  const [lo, hi] = RANGE
  const width = (hi - lo + 1) / BANDS.length
  const difficulty = Math.round(lo + width * index + width / 2)

  const draft = bare(a, b)
  return {
    standardId: 'MT.4.NBT.5',
    difficulty,
    prompt: draft.prompt,
    answer: { kind: 'rational', canonical: draft.answer },
    params: { a, b, format: BARE },
    workedSteps: draft.workedSteps,
    misconceptions: draft.misconceptions,
  }
}

function draftFor(format: number, a: number, b: number, rng: Rng): Draft {  switch (format) {
    case MISSING_FACTOR:
      return missingFactor(a, b, rng.int(0, 1))
    case WORD_GROUPS:
      return wordGroups(a, b, groupContextFor(rng, countedAs(a, b).per))
    case WORD_ROWS:
      return wordRows(a, b, rng.int(0, ROW_CONTEXTS.length - 1))
    case PARTIAL_PRODUCT:
      return partialProduct(a, b, rng.int(0, 1))
    case TEN_TIMES:
      return tenTimes(a, b)
    default:
      return bare(a, b)
  }
}

/** Two two-digit numbers, or a long number and a one-digit multiplier. */
function isByTwo(a: number, b: number): boolean {
  return a >= 10 && b >= 10
}

/** The long number and the one-digit number, whichever way round they are written. */
function byOneParts(a: number, b: number): [number, number] {
  return a < 10 ? [b, a] : [a, b]
}

/**
 * How the working reads the two factors: how many lots there are, and how big
 * each lot is.
 *
 * The working always takes the *bigger* number apart into its places, because
 * that is where place value lives — you cannot usefully split a 6. So a word
 * problem has to put its per-container amount on that same number, or the
 * sentence and the working describe two different situations.
 */
function countedAs(a: number, b: number): { per: number; groups: number } {
  return isByTwo(a, b)
    ? { per: a, groups: b }
    : { per: Math.max(a, b), groups: Math.min(a, b) }
}

// ---------------------------------------------------------------------------
// The formats

/** `347 × 6`, or `6 × 347`. */
function bare(a: number, b: number): Draft {
  const product = a * b
  const [long, multiplier] = byOneParts(a, b)

  return {
    prompt: `${a} ${TIMES} ${b}`,
    answer: String(product),
    extra: {},
    workedSteps: productSteps(a, b, product, null),
    misconceptions: keep(
      productMistakes(
        a,
        b,
        isByTwo(a, b)
          ? `That is ${a} and ${b} put together. This one says ${TIMES}, which means ${b} lots of ` +
              `${a}, so the answer comes out far bigger.`
          : `That is ${a} and ${b} put together. This one says ${TIMES}, which means ${multiplier} ` +
              `lots of ${long} — ${long} counted out ${multiplier} times over, so the answer comes ` +
              `out far bigger.`,
      ),
      product,
    ),
  }
}

/** `? × 6 = 852`. Working back to the factor that is not there. */
function missingFactor(a: number, b: number, slot: number): Draft {
  const product = a * b
  const shown = slot === SLOT_FIRST ? b : a
  const hidden = slot === SLOT_FIRST ? a : b

  return {
    prompt:
      slot === SLOT_FIRST
        ? `? ${TIMES} ${b} = ${product}. What is the missing number?`
        : `${a} ${TIMES} ? = ${product}. What is the missing number?`,
    promptWithSlot:
      slot === SLOT_FIRST ? `{} ${TIMES} ${b} = ${product}` : `${a} ${TIMES} {} = ${product}`,
    answer: String(hidden),
    extra: { slot },
    workedSteps: missingFactorSteps(shown, hidden, product),
    misconceptions: keep(
      [
        {
          // Always available: the product is the hidden factor multiplied by
          // something at least 2, so it is never the hidden factor itself.
          id: 'answered-the-product',
          value: product,
          label: 'Wrote the total again',
          explanation:
            `${product} is what the two numbers come to, and it is already written in the ` +
            `question. The box holds the number that gets you there: ${shown} ${TIMES} ${hidden} ` +
            `= ${product}.`,
        },
        {
          id: 'subtracted-instead',
          value: product - shown,
          label: 'Took one number away from the other',
          explanation:
            `${product} ${MINUS} ${shown} = ${product - shown}, which is what the question would ` +
            `need if it said ${MINUS}. It says ${TIMES}: ${product} has to be split into equal ` +
            `lots of ${shown}, and there are ${hidden} of them.`,
        },
        // Multiplying the two numbers on the screen, which is real — but only
        // worth naming while the result is a number somebody might type.
        // `45894 × 7649` runs to nine digits, and a misconception nobody can hit
        // is dead weight dressed up as coverage.
        ...(product * shown <= 99999
          ? [
              {
                id: 'multiplied-instead',
                value: product * shown,
                label: 'Multiplied the two numbers that were already there',
                explanation:
                  `${product} is already ${shown} lots of something — that is what the question ` +
                  `says. Multiplying it by ${shown} again gives ${product * shown}, which counts ` +
                  `every lot ${shown} times over. What is wanted is how many lots there are: ` +
                  `${product} ${DIVIDE} ${shown} = ${hidden}.`,
              },
            ]
          : []),
      ],
      hidden,
    ),
  }
}

/** A quantity per container, and several containers. */
function wordGroups(a: number, b: number, index: number): Draft {
  const c = GROUP_CONTEXTS[index]!
  const product = a * b
  const { per, groups } = countedAs(a, b)

  return {
    prompt:
      `Each ${c.each} ${c.verb} ${count(per, c.item, c.items)}. ` +
      `How many ${c.items} are in ${count(groups, c.each, c.eachPlural)}?`,
    answer: String(product),
    extra: { context: index },
    workedSteps: [
      ...productSteps(
        a,
        b,
        product,
        `There are ${count(groups, c.each, c.eachPlural)}, and each one ${c.verb} ` +
          `${count(per, c.item, c.items)}. That is ${groups} lots of ${per}.`,
      ),
      `So the ${count(groups, c.each, c.eachPlural)} ${c.verbPlural} ` +
        `${count(product, c.item, c.items)} altogether.`,
    ],
    misconceptions: keep(
      productMistakes(
        a,
        b,
        `That is the two numbers put together. Each ${c.each} ${c.verb} ` +
          `${count(per, c.item, c.items)}, and there are ${groups} of them — so the ` +
          `${count(per, c.item, c.items)} get counted ${groups} times over, which comes out far ` +
          `bigger.`,
      ),
      product,
    ),
  }
}

/** Rows, and how many in each row. The array picture of the same product. */
function wordRows(a: number, b: number, index: number): Draft {
  const c = ROW_CONTEXTS[index]!
  const product = a * b
  const { per, groups } = countedAs(a, b)

  return {
    prompt:
      `${c.subject} has ${count(groups, 'row', 'rows')} of ${c.items}, with ` +
      `${count(per, c.item, c.items)} in each row. ${c.ask}`,
    answer: String(product),
    extra: { context: index },
    workedSteps: [
      ...productSteps(
        a,
        b,
        product,
        `There ${groups === 1 ? 'is' : 'are'} ${count(groups, 'row', 'rows')}, and each row holds ` +
          `${count(per, c.item, c.items)}. That is ${groups} lots of ${per}.`,
      ),
      `So there are ${count(product, c.item, c.items)} altogether.`,
    ],
    misconceptions: keep(
      productMistakes(
        a,
        b,
        `That is the two numbers put together. Each row holds ${count(per, c.item, c.items)}, and ` +
          `there ${groups === 1 ? 'is' : 'are'} ${count(groups, 'row', 'rows')} — so the ` +
          `${count(per, c.item, c.items)} get counted ${groups} times over, which comes out far ` +
          `bigger.`,
      ),
      product,
    ),
  }
}

/** "To work out 23 × 45 you can split 45 into 40 + 5. What is 23 × 40?" */
function partialProduct(a: number, b: number, split: number): Draft {
  const parted = split === SPLIT_FIRST ? a : b
  const whole = split === SPLIT_FIRST ? b : a
  const ones = parted % 10
  const tensDigit = Math.floor(parted / 10)
  const tens = tensDigit * 10
  const answer = whole * tens

  return {
    prompt:
      `To work out ${a} ${TIMES} ${b} you can split ${parted} into ${tens} + ${ones}. ` +
      `What is ${whole} ${TIMES} ${tens}?`,
    answer: String(answer),
    extra: { split },
    workedSteps: [
      `${parted} is ${tens} + ${ones}, so ${a} ${TIMES} ${b} comes in two parts: ` +
        `${whole} ${TIMES} ${tens} and ${whole} ${TIMES} ${ones}. This question asks for the ` +
        `first part on its own.`,
      `${tens} is ${count(tensDigit, 'ten', 'tens')}, so ${whole} ${TIMES} ${tens} is ten times ` +
        `${whole} ${TIMES} ${tensDigit}.`,
      `${whole} ${TIMES} ${tensDigit} = ${whole * tensDigit}, and ten times that is ${answer}.`,
      `So ${whole} ${TIMES} ${tens} = ${answer}. The other part, ` +
        `${whole} ${TIMES} ${ones} = ${whole * ones}, is not what this question asked for.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available: the tens digit on its own is a tenth of what the
          // tens place is worth, so it can never be the same answer.
          id: 'used-the-tens-digit',
          value: whole * tensDigit,
          label: 'Multiplied by the tens digit instead of what it is worth',
          explanation:
            `${whole} ${TIMES} ${tensDigit} = ${whole * tensDigit} treats the ${tensDigit} in ` +
            `${parted} as ${count(tensDigit, 'one', 'ones')}. It is in the tens place, so it is ` +
            `worth ${tens}, and this part is ${whole} ${TIMES} ${tens} = ${answer} — ten times ` +
            `what you had.`,
        },
        {
          id: 'did-the-other-part',
          value: whole * ones,
          label: 'Worked out the other part',
          explanation:
            `${whole} ${TIMES} ${ones} = ${whole * ones} is the other part of the split, and it ` +
            `is right — it is just not the one this question asked for. The part asked for is ` +
            `${whole} ${TIMES} ${tens} = ${answer}.`,
        },
        {
          id: 'answered-the-whole-product',
          value: a * b,
          label: 'Worked out the whole thing',
          explanation:
            `${a} ${TIMES} ${b} = ${a * b} is both parts added together, and it is right. This ` +
            `question asks for one part on its own: ${whole} ${TIMES} ${tens} = ${answer}.`,
        },
      ],
      answer,
    ),
  }
}

/** "8 × 7 = 56. What is 8 × 70?" — place value doing the work. */
function tenTimes(multiplier: number, round: number): Draft {
  const digit = Number(String(round).replace(/0+$/, ''))
  const scale = round / digit
  const fact = multiplier * digit
  const answer = multiplier * round
  const scaleWord = scale === 10 ? 'ten' : 'a hundred'
  const places = scale === 10 ? 'one place' : 'two places'
  const zeros = scale === 10 ? 'a 0 turns' : 'two 0s turn'

  return {
    prompt: `${multiplier} ${TIMES} ${digit} = ${fact}. What is ${multiplier} ${TIMES} ${round}?`,
    answer: String(answer),
    extra: {},
    workedSteps: [
      `${round} is ${scaleWord} times ${digit}, so ${multiplier} ${TIMES} ${round} is ` +
        `${scaleWord} times ${multiplier} ${TIMES} ${digit}.`,
      `${multiplier} ${TIMES} ${digit} = ${fact} is given, so this is ${scaleWord} times ${fact}.`,
      `${fact} ${TIMES} ${scale} = ${answer}. Multiplying by ${scale} moves every digit ` +
        `${places} to the left, which is why ${zeros} up on the end.`,
      `So ${multiplier} ${TIMES} ${round} = ${answer}.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available: the fact is the answer divided by 10 or by 100, so
          // it is never the answer itself.
          id: 'copied-the-fact',
          value: fact,
          label: 'Gave the fact that was already there',
          explanation:
            `${fact} is ${multiplier} ${TIMES} ${digit}, which the question hands you. It asks ` +
            `for ${multiplier} ${TIMES} ${round}, and ${round} is ${scaleWord} times ${digit} — ` +
            `so the answer is ${scaleWord} times ${fact}, which is ${answer}.`,
        },
        {
          id: 'one-zero-too-many',
          value: answer * 10,
          label: 'Put one 0 too many on the end',
          explanation:
            `${answer * 10} is ten times too big. ${round} is ${scaleWord} times ${digit}, not ` +
            `ten times that again, so ${fact} grows by exactly ${places}: ${answer}.`,
        },
        {
          id: 'added-instead',
          value: multiplier + round,
          label: 'Added instead of multiplying',
          explanation:
            `That is ${multiplier} and ${round} put together. This one says ${TIMES}, which means ` +
            `${multiplier} lots of ${round}, so the answer comes out far bigger.`,
        },
      ],
      answer,
    ),
  }
}

// ---------------------------------------------------------------------------
// Worked steps

/**
 * What each place is called, ones first.
 *
 * Always with the word "place", so a digit is located rather than pointed at:
 * the 4 in 456 is the 4 in the hundreds place, never "the first 4". Where it
 * sits on the page is not a fact about the number.
 */
const PLACE = ['ones', 'tens', 'hundreds', 'thousands']

/** `Tens`, to open the step for that place. */
function heading(i: number): string {
  const name = PLACE[i] ?? 'next'
  return `${name[0]!.toUpperCase()}${name.slice(1)}`
}

/**
 * The whole working for a product, ending on the product.
 *
 * `opening` replaces the first line when the question is a word problem: a
 * situation has no `×` sign on the screen, and a working that starts by talking
 * about one is talking about something the child cannot see.
 */
function productSteps(a: number, b: number, product: number, opening: string | null): string[] {
  const steps = isByTwo(a, b) ? byTwoSteps(a, b, opening) : byOneSteps(a, b, opening)
  steps.push(`So ${a} ${TIMES} ${b} = ${product}.`)
  return steps
}

function byOneSteps(a: number, b: number, opening: string | null): string[] {
  const [long, multiplier] = byOneParts(a, b)
  const digits = digitsOf(long)

  // Only the places that are actually there. Walking through "no tens, so that
  // part is 0" adds a line that does nothing but make the working longer, and
  // the split reads better as 300 + 5 than as 300 + 0 + 5.
  const places = digits
    .map((digit, i) => ({ i, value: digit * 10 ** i }))
    .filter((part) => part.value > 0)
    .reverse()

  const steps = [opening ?? `${a} ${TIMES} ${b} means ${multiplier} lots of ${long}.`]

  if (places.length > 1) {
    steps.push(
      `Split ${long} into what each place is worth: ${places.map((p) => p.value).join(' + ')}.`,
    )
  }

  for (const part of places) {
    steps.push(`${heading(part.i)}: ${multiplier} ${TIMES} ${part.value} = ${multiplier * part.value}.`)
  }

  if (places.length > 1) {
    steps.push(
      `Add the parts: ${places.map((p) => multiplier * p.value).join(' + ')} = ` +
        `${multiplier * long}.`,
    )
  }

  return steps
}

function byTwoSteps(a: number, b: number, opening: string | null): string[] {
  const tens = Math.floor(b / 10) * 10
  const ones = b % 10

  return [
    opening ?? `${a} ${TIMES} ${b} means ${b} lots of ${a}.`,
    `Split ${b} into ${tens} + ${ones}.`,
    `First part: ${a} ${TIMES} ${ones} = ${a * ones}.`,
    // Named as 40, not as "4 and then a zero". The zero is a consequence of the
    // number, not a step to remember, and a child who knows why it is there
    // never leaves it off.
    `Second part: ${a} ${TIMES} ${tens} = ${a * tens}. That is ${a} ${TIMES} ${tens / 10} and then ` +
      `ten times bigger, because the ${tens / 10} in ${b} is in the tens place.`,
    `Add the parts: ${a * ones} + ${a * tens} = ${a * b}.`,
  ]
}

/**
 * Working back to a missing factor.
 *
 * Two shapes, because the two blanks are genuinely different problems. When the
 * blank is the long number, it comes back by taking the shown factor out of the
 * product a place-value chunk at a time — partial quotients, every line a
 * subtraction he can already do. When the blank is the single digit, there are
 * only eight numbers it could be, and counting up to the one that lands is both
 * quicker and closer to how a child actually does it.
 */
function missingFactorSteps(shown: number, hidden: number, product: number): string[] {
  const steps = [
    `${shown} and the missing number multiply together to make ${product}, so the missing number ` +
      `is how many lots of ${shown} it takes to reach ${product}` +
      // The division is only named when it is a division he can do. Writing
      // "63 ÷ 21" over a two-digit divisor points at an operation he has not met,
      // when the way through is to count lots of 21 until they reach 63.
      `${shown < 10 ? `: ${product} ${DIVIDE} ${shown}` : ''}.`,
  ]

  if (hidden < 10) {
    steps.push(
      `${shown} ${TIMES} ${hidden - 1} = ${shown * (hidden - 1)}, which is short of ${product}.`,
      // Not "makes ${shown * hidden} = ${product}": those are the same number, so
      // it came out as "makes 45894 = 45894".
      `One more lot of ${shown} reaches ${product} exactly, so the missing number is ${hidden}.`,
    )
    return steps
  }

  const chunks = digitsOf(hidden)
    .map((digit, i) => digit * 10 ** i)
    .filter((value) => value > 0)
    .reverse()

  let left = product
  for (const chunk of chunks) {
    const taken = chunk * shown
    steps.push(
      `${chunk} lots of ${shown} is ${taken}, and ${left} ${MINUS} ${taken} = ${left - taken}.`,
    )
    left -= taken
  }

  steps.push(
    `Nothing is left, so it took ` +
      `${chunks.length > 1 ? `${chunks.join(' + ')} = ${hidden}` : String(hidden)} lots of ` +
      `${shown}. The missing number is ${hidden}.`,
  )
  return steps
}

// ---------------------------------------------------------------------------
// The wrong answers worth knowing by name, and the reason they happened
//
// Written for a ten-year-old who is already braced for bad news: short
// sentences, no jargon, and never a word about carelessness. Each one says what
// he did and what it would have been the answer to, because "here is the
// question you answered" is information and "wrong" is not.

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
    // Never name a correct answer as a known mistake. In the easiest band the
    // dropped carry *is* the correct answer, which is exactly right: nothing
    // carried, so losing a carry is not a thing that can have happened.
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
 * The wrong answers worth naming on a question that asks for the product.
 *
 * `flipped` is passed in because it is the one explanation that cannot be
 * shared. A bare `23 × 45` can say "this one says ×"; a word problem has no
 * times sign anywhere on the screen, and telling a child to look at one would be
 * telling him to look for something that is not there.
 */
function productMistakes(a: number, b: number, flipped: string): Candidate[] {
  return isByTwo(a, b) ? byTwoMistakes(a, b, flipped) : byOneMistakes(a, b, flipped)
}

function byOneMistakes(a: number, b: number, flipped: string): Candidate[] {
  const [long, multiplier] = byOneParts(a, b)
  const digits = digitsOf(long)

  const firstCarry = digits.findIndex((digit) => digit * multiplier >= 10)
  const carryPlace = firstCarry < 0 ? 0 : firstCarry
  const carryDigit = digits[carryPlace] ?? 0
  const carryTotal = carryDigit * multiplier

  return [
    {
      id: 'carry-never-added',
      value: numberFrom(digits.map((digit) => (digit * multiplier) % 10)),
      label: 'The carried digits never got added on',
      explanation:
        `Every place was multiplied right. The carries just never made it into the next place. ` +
        `In the ${PLACE[carryPlace] ?? 'next'} place, ${multiplier} ${TIMES} ${carryDigit} = ` +
        `${carryTotal}, so ${carryTotal % 10} stays where it is and the ` +
        `${Math.floor(carryTotal / 10)} moves left and gets added to the next place along.`,
    },
    {
      id: 'only-the-ones-digit',
      value: (digits[0] ?? 0) * multiplier,
      label: 'Only the ones digit got multiplied',
      explanation:
        `That is ${multiplier} ${TIMES} ${digits[0] ?? 0}, the ones place on its own. The other ` +
        `places in ${long} are worth something too, and every one of them has to be multiplied ` +
        `by ${multiplier} and added in.`,
    },
    {
      id: 'added-instead',
      value: a + b,
      label: 'Added instead of multiplying',
      explanation: flipped,
    },
  ]
}

function byTwoMistakes(a: number, b: number, flipped: string): Candidate[] {
  const tensDigit = Math.floor(b / 10)
  const tens = tensDigit * 10
  const ones = b % 10

  return [
    {
      id: 'missing-placeholder-zero',
      value: a * ones + a * tensDigit,
      label: 'The second part was ten times too small',
      // Worded so it still reads when both digits are the same. `26 × 99` would
      // otherwise say "the second part came out as 26 × 9 = 234" directly after
      // "the first part is right: 26 × 9 = 234", which looks like a typo rather
      // than like the mistake it is describing.
      explanation:
        `The first part is right: ${a} ${TIMES} ${ones} = ${a * ones}. For the second part the ` +
        `${tensDigit} in ${b} got treated as ${tensDigit} ones, giving ${a * tensDigit}. It is in ` +
        `the tens place, so it is worth ${tens}, and the second part is ${a} ${TIMES} ${tens} = ` +
        `${a * tens} — ten times what you had.`,
    },
    {
      id: 'stopped-after-first-part',
      value: a * ones,
      label: 'Stopped after the first part',
      explanation:
        `${a} ${TIMES} ${ones} = ${a * ones} is the first part and it is right. There is a second ` +
        `part still to come: ${b} is ${tens} + ${ones}, so ${a} ${TIMES} ${tens} = ${a * tens} has ` +
        `to be added on as well.`,
    },
    {
      id: 'missed-the-cross-parts',
      value: Math.floor(a / 10) * tensDigit * 100 + (a % 10) * ones,
      label: 'Only tens times tens and ones times ones',
      explanation:
        `Tens times tens and ones times ones are two of the four parts, and the other two got ` +
        `left out. Every place in ${a} has to meet every place in ${b}, which is four ` +
        `multiplications, not two. The quickest way through is ${a} ${TIMES} ${ones} plus ` +
        `${a} ${TIMES} ${tens}.`,
    },
    {
      id: 'added-instead',
      value: a + b,
      label: 'Added instead of multiplying',
      explanation: flipped,
    },
  ]
}
