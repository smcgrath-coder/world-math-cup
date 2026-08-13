/**
 * MT.4.NBT.4 — adding and subtracting multi-digit whole numbers.
 *
 * "Accurately and efficiently add and subtract multi-digit whole numbers using
 * the standard algorithm."
 *
 * The standard names the algorithm, and the algorithm is entirely about what
 * happens *between* columns. That is why the difficulty dial here is not the
 * size of the numbers but whether regrouping is needed: `456 + 123` and
 * `456 + 178` look the same on the page and are not the same question at all.
 * A child who has only ever met the first one has learnt to add three pairs of
 * digits, which is not this standard.
 *
 * So every item is built column by column, with the carries and borrows chosen
 * first and the digits chosen to produce them. Nothing is drawn and redrawn
 * hoping for a carry: the band's promise holds by construction on every item it
 * emits.
 *
 * Eight formats. This generator used to emit `a + b` and `a − b` and nothing
 * else, and Rion — ten years old, plays this — said the questions felt
 * repetitive: "the subject might change slightly, but the pattern remained." Two
 * bare expressions is two patterns, so:
 *
 *  - `SUM` and `DIFFERENCE` are the bare expressions, as before.
 *  - `MISSING_ADDEND` hides one of the two parts: `4570 + ? = 9327`. The child
 *    who has learnt "when you see + you add" has nothing to fall back on, and the
 *    way through is the relationship between the two operations rather than a
 *    rule about a sign. Either part can be the hidden one.
 *  - `MISSING_MINUEND` (`? − 2530 = 489`) and `MISSING_SUBTRAHEND`
 *    (`3019 − ? = 489`) do the same to a subtraction, and they are two different
 *    questions: the first is solved by adding back what was taken away, the
 *    second by finding the gap.
 *  - `DIFFERENCE_BETWEEN` asks in words for a subtraction, in both orders. A
 *    child who reads "the difference between 478 and 9327" as an instruction to
 *    take the second from the first is reading the order rather than the
 *    quantities, and that is worth finding out about.
 *  - `WORD_TOTAL` and `WORD_DIFFERENCE` put the same two numbers in a situation
 *    and ask for either the total or the gap. Same setup, different question, so
 *    the sentence has to be read rather than pattern-matched.
 *
 * Format choice is variety, not difficulty. Within every band the regrouping
 * dial still does the work it always did; the formats are banded only so that the
 * three that need working backwards are out of reach at the bottom of the range,
 * where one thing at a time is the whole point.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+2212 MINUS SIGN, not the ASCII hyphen.
 *
 * Prompt text is display-only — `checkAnswer` never sees it, so this cannot
 * affect grading — and set next to a full-height `+` a hyphen reads as a stray
 * mark rather than as the operator the question turns on.
 */
const MINUS = '−'

const ADD = 1
const SUBTRACT = 0
const RANGE: [number, number] = [5, 78]

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: the same pair of numbers makes `4570 + 4757` (the total), `4570 + ? =
 * 9327` (one part) and "how many more" (neither).
 */
export const SUM = 0
export const DIFFERENCE = 1
export const MISSING_ADDEND = 2
export const MISSING_MINUEND = 3
export const MISSING_SUBTRAHEND = 4
export const DIFFERENCE_BETWEEN = 5
export const WORD_TOTAL = 6
export const WORD_DIFFERENCE = 7

/** `slot`: the hidden part of a missing-addend question is the first one written. */
export const SLOT_FIRST = 1

/** `order`: the smaller of the two numbers is named first. */
export const SMALLER_FIRST = 1

/** Addition formats add; every other format is built from a subtraction. */
function opFor(format: number): number {
  return format === SUM || format === MISSING_ADDEND || format === WORD_TOTAL ? ADD : SUBTRACT
}

interface Band {
  digits: readonly number[]
  minRegroups: number
  allowRegroups: boolean
  zeroChain: boolean
  formats: readonly number[]
}

/**
 * The four difficulty bands, easiest first.
 *
 * `minRegroups` and `allowRegroups` are the real dial. `digits` moves more
 * slowly on purpose: a fourth column is more of the same work, while the first
 * carry is a new idea.
 *
 *  - Band 0 never regroups at all. Every column stands on its own, which is the
 *    honest entry point and the only band where that is true.
 *  - Band 1 allows regrouping without demanding it, so he meets both kinds
 *    mixed together and cannot tell which is coming from the shape of the page.
 *  - Band 2 always regroups at least once.
 *  - Band 3 regroups at least twice, and its subtractions sometimes run a borrow
 *    through a 0 — the case that breaks more fourth graders than any other.
 *
 * Numbers stop at four digits because the standard stops there, and because a
 * fifth column measures stamina rather than place value.
 *
 * `formats` is not a difficulty dial — it is what stops the standard being two
 * memorised expressions. It is banded only so that the three questions needing a
 * step of reasoning on top of the arithmetic are not the first thing the
 * lowest-rated player meets. Every band offers four formats or more, so no band
 * is a single pattern.
 */
const BANDS: readonly Band[] = [
  {
    digits: [2],
    minRegroups: 0,
    allowRegroups: false,
    zeroChain: false,
    formats: [SUM, DIFFERENCE, WORD_TOTAL, WORD_DIFFERENCE],
  },
  {
    digits: [2, 3, 3],
    minRegroups: 0,
    allowRegroups: true,
    zeroChain: false,
    formats: [SUM, DIFFERENCE, WORD_TOTAL, WORD_DIFFERENCE, DIFFERENCE_BETWEEN, MISSING_ADDEND],
  },
  {
    digits: [3, 3, 4],
    minRegroups: 1,
    allowRegroups: true,
    zeroChain: false,
    formats: [
      SUM,
      DIFFERENCE,
      WORD_TOTAL,
      WORD_DIFFERENCE,
      DIFFERENCE_BETWEEN,
      MISSING_ADDEND,
      MISSING_MINUEND,
      MISSING_SUBTRAHEND,
    ],
  },
  {
    digits: [4],
    minRegroups: 2,
    allowRegroups: true,
    zeroChain: true,
    formats: [
      SUM,
      DIFFERENCE,
      WORD_TOTAL,
      WORD_DIFFERENCE,
      DIFFERENCE_BETWEEN,
      MISSING_ADDEND,
      MISSING_MINUEND,
      MISSING_SUBTRAHEND,
    ],
  },
]

/**
 * Where the two amounts live, and how each question is asked there.
 *
 * One table for both word formats, with both questions written out, because the
 * setup is genuinely the same setup: the same tickets sold on the same two days
 * can be asked about as a total or as a gap, and having to read which is being
 * asked is most of the value. Written out rather than assembled from a noun,
 * because the natural way to ask changes with the situation — books are
 * *upstairs*, points are scored *in the first round*.
 *
 * No money and nobody's weight. Exported so the soundness test can rebuild a
 * prompt from `params` character for character — which shares the words, never
 * the arithmetic.
 */
export const CONTEXTS: readonly {
  subject: string
  verb: string
  thing: string
  things: string
  firstWhen: string
  secondWhen: string
  /** The question when the two amounts are joined together. */
  total: string
  /** The question when the gap between them is wanted. */
  difference: string
}[] = [
  {
    subject: 'A ticket office',
    verb: 'sold',
    thing: 'ticket',
    things: 'tickets',
    firstWhen: 'on Friday',
    secondWhen: 'on Saturday',
    total: 'How many tickets did it sell over the two days?',
    difference: 'How many more tickets did it sell on Friday than on Saturday?',
  },
  {
    subject: 'A library',
    verb: 'counted',
    thing: 'book',
    things: 'books',
    firstWhen: 'upstairs',
    secondWhen: 'downstairs',
    total: 'How many books does the library have altogether?',
    difference: 'How many more books are upstairs than downstairs?',
  },
  {
    subject: 'A school',
    verb: 'collected',
    thing: 'bottle',
    things: 'bottles',
    firstWhen: 'in September',
    secondWhen: 'in October',
    total: 'How many bottles did it collect over the two months?',
    difference: 'How many more bottles did it collect in September than in October?',
  },
  {
    subject: 'A cycling route',
    verb: 'covers',
    thing: 'meter',
    things: 'meters',
    firstWhen: 'uphill',
    secondWhen: 'downhill',
    total: 'How long is the whole route in meters?',
    difference: 'How many more meters of the route are uphill than downhill?',
  },
  {
    subject: 'A quiz team',
    verb: 'scored',
    thing: 'point',
    things: 'points',
    firstWhen: 'in the first round',
    secondWhen: 'in the second round',
    total: 'How many points did the team score over the two rounds?',
    difference: 'How many more points did the team score in the first round than in the second?',
  },
  {
    subject: 'A stamp collector',
    verb: 'has',
    thing: 'stamp',
    things: 'stamps',
    firstWhen: 'in one album',
    secondWhen: 'in another album',
    total: 'How many stamps are in the two albums?',
    difference: 'How many more stamps are in the first album than in the second?',
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

/** Ones-first digits back into a number. */
function numberFrom(digits: readonly number[]): number {
  let value = 0
  for (let i = digits.length - 1; i >= 0; i--) value = value * 10 + digits[i]!
  return value
}

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/** `1 ticket`, `4570 tickets`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * Every digit pair a column could hold, filtered down to the ones this column is
 * allowed.
 *
 * A hundred candidates enumerated and filtered, rather than a draw-and-redraw
 * loop. That matters more here than it looks: a column asked for a carry when
 * its bottom digit is forced to 0 has *no* satisfying pair, and a retry loop
 * would spin out its budget and then quietly emit a column that does not carry —
 * exactly the thing the band was built to guarantee. Enumerating makes an
 * unsatisfiable column impossible to miss instead of silently wrong.
 */
function columnPairs(allowed: (top: number, bottom: number) => boolean): [number, number][] {
  const out: [number, number][] = []
  for (let top = 0; top <= 9; top++) {
    for (let bottom = 0; bottom <= 9; bottom++) if (allowed(top, bottom)) out.push([top, bottom])
  }
  return out
}

function popcount(mask: number): number {
  let n = 0
  for (let m = mask; m > 0; m >>= 1) n += m & 1
  return n
}

/**
 * The regrouping patterns a band will accept, as bitmasks over the columns that
 * are allowed to regroup at all.
 *
 * `required` is capped at `columns` so this list can never come back empty — an
 * empty pool would reach `rng.pick`, which throws, mid-match.
 */
function maskPool(columns: number, band: Band, forced: number): number[] {
  if (!band.allowRegroups) return [0]
  const required = Math.min(band.minRegroups, columns)
  const all: number[] = []
  for (let mask = 0; mask < 1 << columns; mask++) all.push(mask)
  return all.filter((mask) => popcount(mask) >= required && (mask & forced) === forced)
}

/**
 * The fewest digits the second number may have.
 *
 * A word problem needs both amounts to be worth mentioning: "sold 4570 tickets
 * on Friday and 7 tickets on Saturday" is not a question anybody would ask, and
 * it makes the second amount decorative. Everywhere else a short second number
 * is a feature, not a problem.
 */
function minSecondDigits(format: number): number {
  return format === WORD_TOTAL || format === WORD_DIFFERENCE ? 2 : 1
}

/**
 * How many digits the second number gets.
 *
 * Usually the same as the first, sometimes one fewer, because `456 + 78` is its
 * own small skill: the ones have to be lined up under the ones rather than the
 * left-hand edges matched up, and that is where a whole column of value goes
 * missing. Shorter is only offered when it still leaves room for the regrouping
 * the band promised, and when the format can carry it.
 */
function secondLengths(op: number, digits: number, band: Band, fewest: number): number[] {
  const candidates = [digits, digits, digits, digits - 1]
  const ok = candidates.filter(
    (n) => n >= fewest && regroupableColumns(op, digits, n) >= band.minRegroups,
  )
  return ok.length > 0 ? ok : [digits]
}

/**
 * The columns that may carry or borrow.
 *
 * Addition may carry out of the leading column — that is just an extra digit on
 * the answer. Subtraction may not borrow out of it: that would mean taking the
 * bigger number from the smaller one, and a negative answer is a topic he has
 * not met being scored against him. So the leading column is excluded whenever
 * both numbers reach it.
 */
function regroupableColumns(op: number, digits: number, bDigits: number): number {
  if (op === ADD) return bDigits
  return bDigits === digits ? digits - 1 : bDigits
}

interface Pair {
  a: number
  b: number
}

function buildSum(rng: Rng, band: Band, digits: number, bDigits: number): Pair {
  const mask = rng.pick(maskPool(bDigits, band, 0))
  const top: number[] = []
  const bottom: number[] = []

  for (let i = 0; i < digits; i++) {
    const isLeadingA = i === digits - 1
    const isLeadingB = i === bDigits - 1
    const hasBottom = i < bDigits
    const mustCarry = ((mask >> i) & 1) === 1

    const [t, b] = rng.pick(
      columnPairs((t, b) => {
        if (isLeadingA && t < 1) return false
        if (isLeadingB && b < 1) return false
        if (!hasBottom) return b === 0
        // A column with a carry set is over ten whatever arrives from the right,
        // and a column without one is under ten as long as nothing arrives — and
        // nothing can, because when the mask is empty no column carries at all.
        return mustCarry ? t + b >= 10 : t + b <= 9
      }),
    )
    top.push(t)
    if (hasBottom) bottom.push(b)
  }

  return { a: numberFrom(top), b: numberFrom(bottom) }
}

/**
 * The place of the 0 a borrow will be dragged through, or -1 for no chain.
 *
 * A borrow arriving at a 0 has nothing to take, so it has to go one place
 * further left first. Forcing the column to its right to borrow, and the column
 * itself to hold a 0, makes that happen by construction.
 */
function chainPlace(rng: Rng, band: Band, digits: number, columns: number): number {
  if (!band.zeroChain) return -1
  const places: number[] = []
  for (let p = 1; p <= digits - 2; p++) if (p < columns) places.push(p)
  if (places.length === 0) return -1
  // Half the subtractions in this band, not all of them. A zero in the middle
  // every single time would be a tell, and he would start looking for it rather
  // than reading the number.
  return rng.int(0, 1) === 1 ? rng.pick(places) : -1
}

function buildDifference(rng: Rng, band: Band, digits: number, bDigits: number): Pair {
  const columns = regroupableColumns(SUBTRACT, digits, bDigits)
  const chain = chainPlace(rng, band, digits, columns)
  const forced = chain < 0 ? 0 : (1 << chain) | (1 << (chain - 1))
  const mask = rng.pick(maskPool(columns, band, forced))

  const top: number[] = []
  const bottom: number[] = []

  for (let i = 0; i < digits; i++) {
    const isLeadingA = i === digits - 1
    const isLeadingB = i === bDigits - 1
    const hasBottom = i < bDigits
    const mustBorrow = ((mask >> i) & 1) === 1

    const [t, b] = rng.pick(
      columnPairs((t, b) => {
        if (isLeadingA && t < 1) return false
        if (isLeadingB && b < 1) return false
        if (!hasBottom) return b === 0
        if (i === chain && t !== 0) return false
        if (mustBorrow) return t < b
        // The leading column is never in the mask, so a strict `>` here is what
        // keeps the whole answer positive: even if a borrow arrives from the
        // right, `t - b - 1` is still at least zero.
        return isLeadingA && bDigits === digits ? t > b : t >= b
      }),
    )
    top.push(t)
    if (hasBottom) bottom.push(b)
  }

  return { a: numberFrom(top), b: numberFrom(bottom) }
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  answer: string
  /** Params this format needs beyond `a`, `b`, `op` and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nbt4: ItemGenerator = {
  standardId: 'MT.4.NBT.4',
  label: 'Adding and subtracting big numbers',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const format = rng.pick(band.formats)
    const op = opFor(format)
    const digits = rng.pick(band.digits)
    const bDigits = rng.pick(secondLengths(op, digits, band, minSecondDigits(format)))

    const { a, b } =
      op === ADD ? buildSum(rng, band, digits, bDigits) : buildDifference(rng, band, digits, bDigits)

    const draft = draftFor(format, a, b, rng)

    return {
      standardId: 'MT.4.NBT.4',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      // Every value here is a whole number well under a million, so this is
      // exact — no float ever touches the key.
      answer: { kind: 'rational', canonical: draft.answer },
      params: { a, b, op, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, a: number, b: number, rng: Rng): Draft {
  switch (format) {
    case DIFFERENCE:
      return bareDifference(a, b)
    case MISSING_ADDEND:
      return missingAddend(a, b, rng.int(0, 1))
    case MISSING_MINUEND:
      return missingMinuend(a, b)
    case MISSING_SUBTRAHEND:
      return missingSubtrahend(a, b)
    case DIFFERENCE_BETWEEN:
      return differenceBetween(a, b, rng.int(0, 1))
    case WORD_TOTAL:
      return wordTotal(a, b, rng.int(0, CONTEXTS.length - 1))
    case WORD_DIFFERENCE:
      return wordDifference(a, b, rng.int(0, CONTEXTS.length - 1))
    default:
      return bareSum(a, b)
  }
}

// ---------------------------------------------------------------------------
// The formats

/** `4570 + 4757`. */
function bareSum(a: number, b: number): Draft {
  const total = a + b
  return {
    prompt: `${a} + ${b}`,
    answer: String(total),
    extra: {},
    workedSteps: [
      `Line them up so the ones sit under the ones, then work from the ones leftwards.`,
      ...additionSteps(a, b),
      `So ${a} + ${b} = ${total}.`,
    ],
    misconceptions: keep(
      additionMistakes(
        a,
        b,
        `That is what is left after taking one of these away from the other. This one says +, so ` +
          `the two amounts join together and the answer comes out bigger than ${Math.max(a, b)}, ` +
          `not smaller.`,
      ),
      total,
    ),
  }
}

/** `9327 − 4570`. */
function bareDifference(a: number, b: number): Draft {
  const result = a - b
  return {
    prompt: `${a} ${MINUS} ${b}`,
    answer: String(result),
    extra: {},
    workedSteps: [
      `Line them up so the ones sit under the ones, with ${a} on top, then work from the ones ` +
        `leftwards.`,
      ...subtractionSteps(a, b),
      ...frontZeroNote(a, result),
      `So ${a} ${MINUS} ${b} = ${result}.`,
    ],
    misconceptions: keep(
      subtractionMistakes(
        a,
        b,
        `That is the two numbers put together. This one says ${MINUS}, so ${b} is taken away from ` +
          `${a} and the answer has to come out smaller than ${a}.`,
      ),
      result,
    ),
  }
}

/**
 * `4570 + ? = 9327`, or `? + 4757 = 9327`.
 *
 * Both parts get to be the hidden one. They are the same arithmetic, and they do
 * not feel the same on the page: a blank at the front has to be read as a
 * question about the whole line rather than about the number next to it.
 */
function missingAddend(a: number, b: number, slot: number): Draft {
  const total = a + b
  const shown = slot === SLOT_FIRST ? b : a
  const hidden = slot === SLOT_FIRST ? a : b

  return {
    prompt:
      slot === SLOT_FIRST
        ? `? + ${b} = ${total}. What is the missing number?`
        : `${a} + ? = ${total}. What is the missing number?`,
    promptWithSlot:
      slot === SLOT_FIRST ? `{} + ${b} = ${total}` : `${a} + {} = ${total}`,
    answer: String(hidden),
    extra: { slot },
    workedSteps: [
      `Two parts add up to ${total}, and one of them is ${shown}. The missing part is the rest of ` +
        `${total}, so take ${shown} off it.`,
      `Line them up so the ones sit under the ones, with ${total} on top, then work from the ones ` +
        `leftwards.`,
      ...subtractionSteps(total, shown),
      ...frontZeroNote(total, hidden),
      // Addition and subtraction undoing each other is the whole point of the
      // format, so the working ends by putting the answer back into the question
      // as it was written rather than announcing a number.
      `Check it the other way round: ${a} + ${b} = ${total}.`,
    ],
    misconceptions: keep(missingAddendMistakes(shown, hidden, total), hidden),
  }
}

/** `? − 2530 = 489`. Adding back what was taken away. */
function missingMinuend(a: number, b: number): Draft {
  const difference = a - b

  return {
    prompt: `? ${MINUS} ${b} = ${difference}. What is the missing number?`,
    promptWithSlot: `{} ${MINUS} ${b} = ${difference}`,
    answer: String(a),
    extra: {},
    workedSteps: [
      `Something had ${b} taken off it and ${difference} was left. Putting the ${b} back on gets ` +
        `to the number it started as.`,
      `Line them up so the ones sit under the ones, then work from the ones leftwards.`,
      ...additionSteps(difference, b),
      `Check it the other way round: ${a} ${MINUS} ${b} = ${difference}.`,
    ],
    misconceptions: keep(missingMinuendMistakes(a, b, difference), a),
  }
}

/** `3019 − ? = 489`. Finding the gap between what is left and what there was. */
function missingSubtrahend(a: number, b: number): Draft {
  const difference = a - b

  return {
    prompt: `${a} ${MINUS} ? = ${difference}. What is the missing number?`,
    promptWithSlot: `${a} ${MINUS} {} = ${difference}`,
    answer: String(b),
    extra: {},
    workedSteps: [
      `${a} had something taken off it and ${difference} was left. The part that went is the gap ` +
        `between ${difference} and ${a}.`,
      `Line them up so the ones sit under the ones, with ${a} on top, then work from the ones ` +
        `leftwards.`,
      ...subtractionSteps(a, difference),
      ...frontZeroNote(a, b),
      `Check it the other way round: ${a} ${MINUS} ${b} = ${difference}.`,
    ],
    misconceptions: keep(missingSubtrahendMistakes(a, b, difference), b),
  }
}

/** "What is the difference between 478 and 9327?" — the subtraction, in words. */
function differenceBetween(a: number, b: number, order: number): Draft {
  const result = a - b
  const first = order === SMALLER_FIRST ? b : a
  const second = order === SMALLER_FIRST ? a : b

  return {
    prompt: `What is the difference between ${first} and ${second}?`,
    answer: String(result),
    extra: { order },
    workedSteps: [
      `The difference between two numbers is how far apart they are. ${a} is the bigger of the ` +
        `two, so the difference is ${a} ${MINUS} ${b} — the smaller one comes off the bigger one ` +
        `whichever way round the question names them.`,
      `Line them up so the ones sit under the ones, with ${a} on top, then work from the ones ` +
        `leftwards.`,
      ...subtractionSteps(a, b),
      ...frontZeroNote(a, result),
      `So the difference between ${first} and ${second} is ${result}.`,
    ],
    misconceptions: keep(
      subtractionMistakes(
        a,
        b,
        `That is the two numbers put together. A difference is how far apart they are, which is ` +
          `what is left when the smaller one comes off the bigger one: ${a} ${MINUS} ${b}.`,
      ),
      result,
    ),
  }
}

/** Two amounts in a situation, joined together. */
function wordTotal(a: number, b: number, index: number): Draft {
  const c = CONTEXTS[index]!
  const total = a + b

  return {
    prompt: `${setup(c, a, b)} ${c.total}`,
    answer: String(total),
    extra: { context: index },
    workedSteps: [
      `Both amounts are ${c.things}, and the question asks for them put together, so this is ` +
        `${a} + ${b}.`,
      `Line them up so the ones sit under the ones, then work from the ones leftwards.`,
      ...additionSteps(a, b),
      `So the two amounts come to ${count(total, c.thing, c.things)} altogether.`,
    ],
    misconceptions: keep(
      additionMistakes(
        a,
        b,
        `That is how far apart the two amounts are. This question asks for them put together, ` +
          `which has to come out bigger than either one on its own.`,
      ),
      total,
    ),
  }
}

/** The same two amounts, with the gap between them wanted instead. */
function wordDifference(a: number, b: number, index: number): Draft {
  const c = CONTEXTS[index]!
  const result = a - b

  return {
    prompt: `${setup(c, a, b)} ${c.difference}`,
    answer: String(result),
    extra: { context: index },
    workedSteps: [
      `"How many more" asks how far apart the two amounts are, so take the smaller one off the ` +
        `bigger one: ${a} ${MINUS} ${b}.`,
      `Line them up so the ones sit under the ones, with ${a} on top, then work from the ones ` +
        `leftwards.`,
      ...subtractionSteps(a, b),
      ...frontZeroNote(a, result),
      `So the difference is ${count(result, c.thing, c.things)}.`,
    ],
    misconceptions: keep(
      subtractionMistakes(
        a,
        b,
        `That is the two amounts put together. This question asks how far apart they are, and ` +
          `that gap is what is left when the smaller amount comes off the bigger one — so it can ` +
          `never be more than the bigger amount.`,
      ),
      result,
    ),
  }
}

/** The sentence that gives the two amounts. Shared by both word formats. */
function setup(c: (typeof CONTEXTS)[number], a: number, b: number): string {
  return (
    `${c.subject} ${c.verb} ${count(a, c.thing, c.things)} ${c.firstWhen} and ` +
    `${count(b, c.thing, c.things)} ${c.secondWhen}.`
  )
}

// ---------------------------------------------------------------------------
// Worked steps

/**
 * What each place is called, ones first.
 *
 * Worth the table rather than a formula, because place-value language is where
 * an explanation quietly stops being true: "the 4 in 456" has to be read as
 * "the 4 in the hundreds place", never "the first 4". A digit's position on the
 * page is not a fact about the number; its place is.
 *
 * `PLACE` names the column and always says the word "place", so a digit is
 * always located rather than pointed at. `UNIT` names one of whatever that
 * column counts, which is the thing that actually gets carried and borrowed —
 * you carry one ten, not one.
 *
 * Five entries covers everything reachable: four-digit numbers, plus the extra
 * column an addition can carry into.
 */
const PLACE = ['ones', 'tens', 'hundreds', 'thousands', 'ten thousands']
const UNIT = ['one', 'ten', 'hundred', 'thousand', 'ten thousand']

/** `the tens place`, for naming where a digit sits. */
function place(i: number): string {
  return `${PLACE[i] ?? 'next'} place`
}

/** `Tens`, to open the step for that column. */
function heading(i: number): string {
  const name = PLACE[i] ?? 'next'
  return `${name[0]!.toUpperCase()}${name.slice(1)}`
}

/** `ten`, for the one unit that gets carried or borrowed into place `i`. */
function unitName(i: number): string {
  return UNIT[i] ?? 'unit'
}

/**
 * The note a subtraction needs when its front places empty out.
 *
 * 3019 − 2530 works out to 0489 column by column. Without this the last two
 * steps look like they disagree with each other, which is the sort of thing that
 * makes a child stop trusting the rest of the explanation.
 */
function frontZeroNote(top: number, result: number): string[] {
  return String(result).length < String(top).length
    ? [`The front of the answer came out 0, and a number is not written starting with 0.`]
    : []
}

/**
 * The addition, column by column.
 *
 * Symmetric in its two arguments on purpose. Most callers hand it the longer
 * number first, but `? − 5949 = 631` is solved by adding 5949 back on to 631,
 * and there the *bottom* number is the longer one. Walking only the first
 * number's places used to end that sum with "nothing is left to add in the
 * thousands place" while 5949 plainly had a 5 sitting there — a flatly false
 * sentence in the middle of an explanation he is meant to trust.
 */
function additionSteps(a: number, b: number): string[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const width = Math.max(top.length, bottom.length)
  const steps: string[] = []
  let carry = 0

  for (let i = 0; i < width; i++) {
    const hasTop = i < top.length
    const hasBottom = i < bottom.length
    const t = top[i] ?? 0
    const bd = bottom[i] ?? 0
    const total = t + bd + carry
    const carried = carry
    carry = total >= 10 ? 1 : 0

    let line: string
    if (!hasBottom) {
      line =
        carried === 1
          ? `${heading(i)}: there is nothing under the ${t}, but the 1 you carried makes ${total}.`
          : `${heading(i)}: there is nothing under the ${t}, so it stays ${t}.`
    } else if (!hasTop) {
      line =
        carried === 1
          ? `${heading(i)}: there is nothing above the ${bd}, but the 1 you carried makes ${total}.`
          : `${heading(i)}: there is nothing above the ${bd}, so it stays ${bd}.`
    } else if (carried === 1) {
      line = `${heading(i)}: ${t} + ${bd} = ${t + bd}, and the 1 you carried makes ${total}.`
    } else {
      line = `${heading(i)}: ${t} + ${bd} = ${total}.`
    }

    if (carry === 1) {
      line +=
        ` That is past 9, so write the ${total - 10} in the ${place(i)} and carry 1 into ` +
        `the ${place(i + 1)}.`
    }
    steps.push(line)
  }

  if (carry === 1) {
    steps.push(
      `Nothing is left to add in the ${place(width)}, so the 1 you carried goes there ` +
        `on its own.`,
    )
  }
  return steps
}

function subtractionSteps(a: number, b: number): string[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const steps: string[] = []
  let borrow = 0

  for (let i = 0; i < top.length; i++) {
    const t = top[i]!
    const hasBottom = i < bottom.length
    const bd = bottom[i] ?? 0
    const lent = borrow
    const left = t - lent
    const borrowing = left < bd
    const used = borrowing ? left + 10 : left
    borrow = borrowing ? 1 : 0

    // Say what the digit is worth *now*, after any lending, before saying what
    // is taken from it. Skipping that is where the standard algorithm stops
    // making sense and starts being a set of moves to remember.
    //
    // A 0 gets its own sentence because it is the one digit that cannot lend
    // what it was asked for. It has to be filled from the left first, and only
    // then can it hand 1 on — which is why the 9 appears from nowhere if nobody
    // says this part out loud.
    const opening =
      lent === 1
        ? t === 0
          ? `${heading(i)}: the 0 in the ${place(i)} has nothing to lend, so take 1 ` +
            `${unitName(i + 1)} from the ${place(i + 1)} first — that makes it 10, and lending 1 ` +
            `to the ${place(i - 1)} leaves 9.`
          : `${heading(i)}: the ${t} in the ${place(i)} lent 1 to the ${place(i - 1)}, so it is ` +
            `now ${left}.`
        : `${heading(i)}:`

    if (!hasBottom) {
      steps.push(
        lent === 1
          ? `${opening} There is nothing under it, so it stays ${used}.`
          : `${opening} there is nothing under the ${t}, so it stays ${t}.`,
      )
      continue
    }

    // A 0 that was lent from is already covered by its own opening above, which
    // explains the borrow as part of explaining the 0, so it must not be
    // explained twice. A 0 that nothing was taken from still needs it: without
    // that sentence the step reads "Ones: 10 − 1 = 9" and the 10 arrives from
    // nowhere, which is the whole thing this working exists to prevent.
    const alreadyExplained = t === 0 && lent === 1
    steps.push(
      borrowing && !alreadyExplained
        ? `${opening} ${left} is smaller than ${bd}, so take 1 ${unitName(i + 1)} from the ` +
            `${place(i + 1)}. That makes ${used}, and ${used} ${MINUS} ${bd} = ${used - bd}.`
        : `${opening} ${used} ${MINUS} ${bd} = ${used - bd}.`,
    )
  }

  return steps
}

// ---------------------------------------------------------------------------
// The wrong answers worth knowing by name, and the reason they happened
//
// Written for a ten-year-old who is already braced for bad news: short
// sentences, no jargon, and never a word about carelessness. Each one says what
// he did and what it would have been the answer to, because "here is the
// question you answered" is information and "wrong" is not.
//
// Every place is named as a place — the hundreds, the tens — and never by
// position on the page. "The first 4" is not a thing that exists in arithmetic.

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
    // Never name a correct answer as a known mistake. On the no-regrouping band
    // most of these *are* the correct answer, which is exactly right: there was
    // no carry to drop, so dropping one is not a thing that can have happened.
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

/** Every column added, but no carry ever moved. */
function droppedCarryValue(a: number, b: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  const out: number[] = []
  for (let i = 0; i < Math.max(x.length, y.length); i++) out.push(((x[i] ?? 0) + (y[i] ?? 0)) % 10)
  return numberFrom(out)
}

/** Every column done as the bigger digit take away the smaller one. */
function noBorrowValue(top: number, bottom: number): number {
  const x = digitsOf(top)
  const y = digitsOf(bottom)
  return numberFrom(x.map((digit, i) => Math.abs(digit - (y[i] ?? 0))))
}

/**
 * `flipped` is passed in because it is the one explanation that cannot be
 * shared. A bare `4570 + 4757` can say "this one says +"; a word problem has no
 * plus sign anywhere on the screen, and telling a child to look at one would be
 * telling him to look for something that is not there.
 */
function additionMistakes(a: number, b: number, flipped: string): Candidate[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const width = Math.max(top.length, bottom.length)
  const totals: number[] = []
  for (let i = 0; i < width; i++) totals.push((top[i] ?? 0) + (bottom[i] ?? 0))

  const firstCarry = totals.findIndex((t) => t >= 10)
  const carryPlace = firstCarry < 0 ? 0 : firstCarry
  const carryTotal = totals[carryPlace] ?? 0

  const out: Candidate[] = [
    {
      id: 'dropped-the-carry',
      value: droppedCarryValue(a, b),
      label: 'The carried 1s never moved',
      explanation:
        `Every column was added right. The carried 1s just never made it into the next place. ` +
        `In the ${place(carryPlace)}, ${top[carryPlace] ?? 0} + ${bottom[carryPlace] ?? 0} = ` +
        `${carryTotal}, and only the ${carryTotal % 10} can stay in the ${place(carryPlace)} — ` +
        `the 1 is a whole ${unitName(carryPlace + 1)}, so it moves into the ` +
        `${place(carryPlace + 1)} and gets added there.`,
    },
  ]

  // Writing the whole column total into the column. Real, and unmistakable on
  // two- and three-digit sums; on four-digit ones it would run to nine digits,
  // which is not a number anyone types, so naming it there would only sit in
  // the way of a mistake he might really make.
  if (width <= 3) {
    out.push({
      id: 'wrote-both-digits',
      value: Number(totals.map(String).reverse().join('')),
      label: 'Wrote the whole column total',
      explanation:
        `In the ${place(carryPlace)}, ${top[carryPlace] ?? 0} + ${bottom[carryPlace] ?? 0} = ` +
        `${carryTotal}, and all of ${carryTotal} got written down. Only one digit fits in a ` +
        `place. The ${carryTotal % 10} stays in the ${place(carryPlace)} and the 1 goes into ` +
        `the ${place(carryPlace + 1)}, because it is one whole ${unitName(carryPlace + 1)}.`,
    })
  }

  out.push({
    id: 'subtracted-instead',
    value: Math.abs(a - b),
    label: 'Took one away instead of adding',
    explanation: flipped,
  })

  return out
}

function subtractionMistakes(a: number, b: number, flipped: string): Candidate[] {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const flippedColumn = top.findIndex((t, i) => t < (bottom[i] ?? 0))
  const flipPlace = flippedColumn < 0 ? 0 : flippedColumn

  const out: Candidate[] = [
    {
      id: 'no-borrow',
      value: noBorrowValue(a, b),
      label: 'Took the smaller digit from the bigger one every time',
      explanation:
        `In the ${place(flipPlace)} the column says ${top[flipPlace] ?? 0} ${MINUS} ` +
        `${bottom[flipPlace] ?? 0}, and it got turned round to ${bottom[flipPlace] ?? 0} ${MINUS} ` +
        `${top[flipPlace] ?? 0} instead. A column is always the top digit take away the bottom ` +
        `one, whichever is bigger. When the top one is too small, borrow 1 ` +
        `${unitName(flipPlace + 1)} from the ${place(flipPlace + 1)} and do ` +
        `${(top[flipPlace] ?? 0) + 10} ${MINUS} ${bottom[flipPlace] ?? 0} instead.`,
    },
  ]

  const chain = borrowChainPlace(a, b)
  if (chain >= 0) {
    out.push({
      id: 'borrow-chain-slip',
      value: borrowChainSlip(a, b, chain),
      label: 'The borrow got through the 0, but the place it came from stayed put',
      explanation:
        `The ${place(chain)} holds a 0, so it had nothing to lend and had to take 1 ` +
        `${unitName(chain + 1)} from the ${place(chain + 1)} first. That part happened. What got ` +
        `missed is that the ${place(chain + 1)} is then one smaller: the ${top[chain + 1]} drops ` +
        `to ${top[chain + 1]! - 1}. Borrowing always costs the place it came from.`,
    })
  }

  out.push({
    id: 'added-instead',
    value: a + b,
    label: 'Added instead of taking away',
    explanation: flipped,
  })

  return out
}

/**
 * `4570 + ? = 9327`, with `shown` on the screen and `hidden` in the box.
 *
 * The always-available one is adding the two numbers that *are* on the screen —
 * `shown + total` is bigger than the total, and the hidden part is smaller than
 * it, so the two can never collide.
 */
function missingAddendMistakes(shown: number, hidden: number, total: number): Candidate[] {
  return [
    {
      id: 'added-the-two-shown',
      value: shown + total,
      label: 'Added the two numbers that were already there',
      explanation:
        `${shown} + ${total} = ${shown + total}, which is bigger than ${total}. The box is one of ` +
        `the two parts that make ${total}, so it has to be smaller than ${total}, not bigger. ` +
        `What goes in it is the rest of ${total} once ${shown} is taken off: ${total} ${MINUS} ` +
        `${shown} = ${hidden}.`,
    },
    {
      id: 'no-borrow',
      value: noBorrowValue(total, shown),
      label: 'Took the smaller digit from the bigger one every time',
      explanation:
        `Taking ${shown} off ${total} is the right move. In the columns where the top digit is ` +
        `too small, though, the two digits got swapped round instead of a 1 being borrowed from ` +
        `the place to the left. Column by column it is always the top digit take away the bottom ` +
        `one: ${total} ${MINUS} ${shown} = ${hidden}.`,
    },
    {
      id: 'gave-the-total',
      value: total,
      label: 'Wrote the total again',
      explanation:
        `${total} is what the two parts come to, and it is already written in the question. The ` +
        `box holds the part that is missing, which is ${total} ${MINUS} ${shown} = ${hidden}.`,
    },
  ]
}

/**
 * `? − 2530 = 489`.
 *
 * The always-available one is taking the two shown numbers apart. The answer is
 * their sum, and with a subtrahend of at least 1 a sum and a difference can
 * never be the same number.
 */
function missingMinuendMistakes(a: number, b: number, difference: number): Candidate[] {
  return [
    {
      id: 'subtracted-the-two-shown',
      value: Math.abs(difference - b),
      label: 'Took the two numbers on the screen apart',
      explanation:
        `The ${MINUS} sign says what happened to the missing number, not what to do with the two ` +
        `numbers you can see. Something had ${b} taken off it and ${difference} was left, so the ` +
        `${b} goes back on: ${difference} + ${b} = ${a}.`,
    },
    {
      id: 'dropped-the-carry',
      value: droppedCarryValue(difference, b),
      label: 'The carried 1s never moved',
      explanation:
        `Adding the ${b} back on is the right move. The carried 1s never made it into the next ` +
        `place along, though. A column that comes to 10 or more leaves one digit behind and sends ` +
        `1 into the place to the left: ${difference} + ${b} = ${a}.`,
    },
  ]
}

/**
 * `3019 − ? = 489`.
 *
 * The always-available one is adding the two shown numbers. The answer is their
 * difference, and adding cannot land on that unless one of them is 0.
 */
function missingSubtrahendMistakes(a: number, b: number, difference: number): Candidate[] {
  return [
    {
      id: 'added-the-two-shown',
      value: a + difference,
      label: 'Added the two numbers that were already there',
      explanation:
        `${a} + ${difference} = ${a + difference}, which is more than ${a}. The box holds the ` +
        `part that came *off* ${a}, so it cannot be bigger than ${a}. It is the gap between ` +
        `${difference} and ${a}: ${a} ${MINUS} ${difference} = ${b}.`,
    },
    {
      id: 'no-borrow',
      value: noBorrowValue(a, difference),
      label: 'Took the smaller digit from the bigger one every time',
      explanation:
        `Taking ${difference} off ${a} is the right move. In the columns where the top digit is ` +
        `too small, though, the two digits got swapped round instead of a 1 being borrowed from ` +
        `the place to the left: ${a} ${MINUS} ${difference} = ${b}.`,
    },
  ]
}

/**
 * The place of a 0 in the top number that a borrow is dragged through, or -1.
 *
 * Found by running the standard algorithm and watching for a column that both
 * received a borrow and had to pass one on while holding a 0 — which is the only
 * shape where the chain exists.
 */
function borrowChainPlace(a: number, b: number): number {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  let borrow = 0
  for (let i = 0; i < top.length; i++) {
    const arriving = borrow
    borrow = top[i]! - (bottom[i] ?? 0) - borrow < 0 ? 1 : 0
    if (top[i] === 0 && arriving === 1 && borrow === 1) return i
  }
  return -1
}

/**
 * The standard algorithm run with one step left out: the place above the 0 never
 * goes down by one, even though it is what the 0 borrowed from.
 *
 * Simulated rather than shortcut, so that what this returns is literally the
 * number a child gets by doing exactly that.
 */
function borrowChainSlip(a: number, b: number, chain: number): number {
  const top = digitsOf(a)
  const bottom = digitsOf(b)
  const out: number[] = []
  let borrow = 0

  for (let i = 0; i < top.length; i++) {
    // The slipped step: this column is the one the 0 took from, and it carries on
    // as though it had given nothing away.
    let column = i === chain + 1 ? top[i]! - (bottom[i] ?? 0) : top[i]! - (bottom[i] ?? 0) - borrow
    borrow = column < 0 ? 1 : 0
    if (borrow === 1) column += 10
    out.push(column)
  }
  return numberFrom(out)
}
