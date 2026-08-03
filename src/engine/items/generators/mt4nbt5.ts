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
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x.
 *
 * Prompt text is display-only — `checkAnswer` never sees it — so this cannot
 * affect grading, and the only question is how it reads. A letter x sitting
 * between two numbers is one more thing to decode; the real sign is the one on
 * his worksheets.
 */
const TIMES = '×'

const BY_ONE = 'byOne'
const BY_TWO = 'byTwo'

const RANGE: [number, number] = [15, 88]

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

const BANDS: readonly (readonly Spec[])[] = [
  [{ shape: BY_ONE, digits: 2, multipliers: [2, 3, 4, 5], carry: 'none' }],
  [
    { shape: BY_ONE, digits: 2, multipliers: [2, 3, 4, 5, 6, 7, 8, 9], carry: 'any' },
    { shape: BY_ONE, digits: 3, multipliers: [2, 3, 4, 5, 6], carry: 'any' },
  ],
  [
    { shape: BY_ONE, digits: 3, multipliers: [2, 3, 4, 5, 6, 7, 8, 9], carry: 'some' },
    { shape: BY_ONE, digits: 4, multipliers: [2, 3, 4, 5, 6], carry: 'some' },
    { shape: BY_TWO, tens: [1, 2, 3], ones: [1, 2, 3, 4, 5, 6, 7, 8, 9] },
  ],
  [
    { shape: BY_ONE, digits: 4, multipliers: [3, 4, 5, 6, 7, 8, 9], carry: 'some' },
    { shape: BY_TWO, tens: [2, 3, 4, 5, 6, 7, 8, 9], ones: [2, 3, 4, 5, 6, 7, 8, 9] },
  ],
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

export const mt4nbt5: ItemGenerator = {
  standardId: 'MT.4.NBT.5',
  label: 'Multiplying big numbers',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const spec = rng.pick(BANDS[bandIndexFor(d)]!)

    const { a, b } = spec.shape === BY_ONE ? buildByOne(rng, spec) : buildByTwo(rng, spec)
    const product = a * b

    return {
      standardId: 'MT.4.NBT.5',
      difficulty: d,
      prompt: `${a} ${TIMES} ${b}`,
      // The largest product this can produce is 9999 × 9, so every value here is
      // an exact whole number nowhere near where doubles stop being exact.
      answer: { kind: 'rational', canonical: String(product) },
      params: { a, b },
      workedSteps: workedSteps(a, b, product),
      misconceptions: misconceptionsFor(a, b, product),
    }
  },
}

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

/** Two two-digit numbers, or a long number and a one-digit multiplier. */
function isByTwo(a: number, b: number): boolean {
  return a >= 10 && b >= 10
}

/** The long number and the one-digit number, whichever way round they are written. */
function byOneParts(a: number, b: number): [number, number] {
  return a < 10 ? [b, a] : [a, b]
}

function workedSteps(a: number, b: number, product: number): string[] {
  const steps = isByTwo(a, b) ? byTwoSteps(a, b) : byOneSteps(a, b)
  steps.push(`So ${a} ${TIMES} ${b} = ${product}.`)
  return steps
}

function byOneSteps(a: number, b: number): string[] {
  const [long, multiplier] = byOneParts(a, b)
  const digits = digitsOf(long)

  // Only the places that are actually there. Walking through "no tens, so that
  // part is 0" adds a line that does nothing but make the working longer, and
  // the split reads better as 300 + 5 than as 300 + 0 + 5.
  const places = digits
    .map((digit, i) => ({ i, value: digit * 10 ** i }))
    .filter((part) => part.value > 0)
    .reverse()

  const steps = [`${a} ${TIMES} ${b} means ${multiplier} lots of ${long}.`]

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

function byTwoSteps(a: number, b: number): string[] {
  const tens = Math.floor(b / 10) * 10
  const ones = b % 10

  return [
    `${a} ${TIMES} ${b} means ${b} lots of ${a}. Split ${b} into ${tens} + ${ones}.`,
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
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 */
function misconceptionsFor(a: number, b: number, product: number): Misconception[] {
  const candidates = isByTwo(a, b) ? byTwoMistakes(a, b) : byOneMistakes(a, b)

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. In the easiest band the
    // dropped carry *is* the correct answer, which is exactly right: nothing
    // carried, so losing a carry is not a thing that can have happened.
    if (c.value === product) continue
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

function byOneMistakes(a: number, b: number): Candidate[] {
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
      explanation:
        `That is ${a} and ${b} put together. This one says ${TIMES}, which means ${multiplier} ` +
        `lots of ${long} — ${long} counted out ${multiplier} times over, so the answer comes out ` +
        `far bigger.`,
    },
  ]
}

function byTwoMistakes(a: number, b: number): Candidate[] {
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
      explanation:
        `That is ${a} and ${b} put together. This one says ${TIMES}, which means ${b} lots of ` +
        `${a}, so the answer comes out far bigger.`,
    },
  ]
}
