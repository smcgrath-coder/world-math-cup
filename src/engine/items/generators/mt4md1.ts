/**
 * MT.4.MD.1 — relative sizes of units, larger expressed as smaller.
 *
 * "Know relative sizes of units within one system of measurement and within the
 * system, express measurements of a larger unit in terms of a smaller unit."
 *
 * The standard names the direction, and the direction is the whole lesson: a
 * meter is bigger than a centimeter, so 3 meters has to come out as *more* than
 * 3 centimeters. A child who has that never writes 0.03, and a child who has
 * only "conversion means move the decimal point" writes it about half the time.
 * So every set of worked steps says which unit is bigger before it does any
 * arithmetic.
 *
 * Answer keys are unitless. `normaliseInput` strips a whitelist of measurement
 * words from the end of what he types, so `250 cm` grades the same as `250`, and
 * a key carrying its own unit could never be matched by anything.
 *
 * Quantities never go below 2, which is what lets "3 meters" always be plural.
 * The singular still appears — "1 meter is 100 centimeters" is the line the
 * whole conversion rests on — so both forms are written out in a table rather
 * than built by adding an `s`, and `foot`/`feet` is the reason that is not
 * optional.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN and U+00F7 DIVISION SIGN. Prompt text is
 * display-only — `checkAnswer` never sees it — so these cannot affect grading,
 * and they are the signs on his worksheets.
 */
const TIMES = '×'
const DIVIDE = '÷'

/**
 * A unit as it appears in a sentence.
 *
 * `article` is in the table rather than worked out from the first letter,
 * because "an hour" starts with a consonant and "a unit" starts with a vowel.
 * "A yard is bigger than a inch" is exactly the sort of line a child reads once
 * and stops trusting the rest of the explanation over.
 */
interface Unit {
  one: string
  many: string
  article: string
}

/**
 * Every unit this generator names, singular and plural.
 *
 * American spellings, because that is what is on his worksheets in Montana.
 * `normaliseInput` accepts both spellings when he types a unit after his answer,
 * so this choice cannot affect whether he is marked right.
 *
 * Exported so the test can rebuild a prompt from `params` character for
 * character, and so it can look a unit up by name on its own ladder. That shares
 * the *words* with the test, never a conversion figure — the test knows nothing
 * about how many centimeters are in a meter and has to build it from rungs.
 */
export const UNITS: readonly Unit[] = [
  { one: 'millimeter', many: 'millimeters', article: 'a' },
  { one: 'centimeter', many: 'centimeters', article: 'a' },
  { one: 'meter', many: 'meters', article: 'a' },
  { one: 'kilometer', many: 'kilometers', article: 'a' },
  { one: 'milligram', many: 'milligrams', article: 'a' },
  { one: 'gram', many: 'grams', article: 'a' },
  { one: 'kilogram', many: 'kilograms', article: 'a' },
  { one: 'milliliter', many: 'milliliters', article: 'a' },
  { one: 'liter', many: 'liters', article: 'a' },
  { one: 'second', many: 'seconds', article: 'a' },
  { one: 'minute', many: 'minutes', article: 'a' },
  { one: 'hour', many: 'hours', article: 'an' },
  { one: 'day', many: 'days', article: 'a' },
  { one: 'week', many: 'weeks', article: 'a' },
  { one: 'inch', many: 'inches', article: 'an' },
  { one: 'foot', many: 'feet', article: 'a' },
  { one: 'yard', many: 'yards', article: 'a' },
  { one: 'ounce', many: 'ounces', article: 'an' },
  { one: 'pound', many: 'pounds', article: 'a' },
  { one: 'cup', many: 'cups', article: 'a' },
  { one: 'pint', many: 'pints', article: 'a' },
  { one: 'quart', many: 'quarts', article: 'a' },
  { one: 'gallon', many: 'gallons', article: 'a' },
]

const MILLIMETER = 0
const CENTIMETER = 1
const METER = 2
const KILOMETER = 3
const MILLIGRAM = 4
const GRAM = 5
const KILOGRAM = 6
const MILLILITER = 7
const LITER = 8
const SECOND = 9
const MINUTE = 10
const HOUR = 11
const DAY = 12
const WEEK = 13
const INCH = 14
const FOOT = 15
const YARD = 16
const OUNCE = 17
const POUND = 18
const CUP = 19
const PINT = 20
const QUART = 21
const GALLON = 22

interface Conversion {
  id: string
  from: number
  to: number
  factor: number
}

/**
 * Every conversion this generator knows, always larger unit to smaller.
 *
 * A flat table on purpose. The test refuses to hold one and derives each figure
 * by walking a ladder of adjacent units instead, so `m-mm` being written 100
 * here would be caught rather than agreed with.
 */
const CONVERSIONS: readonly Conversion[] = [
  { id: 'cm-mm', from: CENTIMETER, to: MILLIMETER, factor: 10 },
  { id: 'm-cm', from: METER, to: CENTIMETER, factor: 100 },
  { id: 'm-mm', from: METER, to: MILLIMETER, factor: 1000 },
  { id: 'km-m', from: KILOMETER, to: METER, factor: 1000 },
  { id: 'g-mg', from: GRAM, to: MILLIGRAM, factor: 1000 },
  { id: 'kg-g', from: KILOGRAM, to: GRAM, factor: 1000 },
  { id: 'l-ml', from: LITER, to: MILLILITER, factor: 1000 },
  { id: 'min-s', from: MINUTE, to: SECOND, factor: 60 },
  { id: 'hr-min', from: HOUR, to: MINUTE, factor: 60 },
  { id: 'day-hr', from: DAY, to: HOUR, factor: 24 },
  { id: 'week-day', from: WEEK, to: DAY, factor: 7 },
  { id: 'ft-in', from: FOOT, to: INCH, factor: 12 },
  { id: 'yd-ft', from: YARD, to: FOOT, factor: 3 },
  { id: 'yd-in', from: YARD, to: INCH, factor: 36 },
  { id: 'lb-oz', from: POUND, to: OUNCE, factor: 16 },
  { id: 'pt-c', from: PINT, to: CUP, factor: 2 },
  { id: 'qt-pt', from: QUART, to: PINT, factor: 2 },
  { id: 'qt-c', from: QUART, to: CUP, factor: 4 },
  { id: 'gal-qt', from: GALLON, to: QUART, factor: 4 },
  { id: 'gal-pt', from: GALLON, to: PINT, factor: 8 },
  { id: 'gal-c', from: GALLON, to: CUP, factor: 16 },
]

const RANGE: [number, number] = [10, 80]

/**
 * The four difficulty bands, easiest first.
 *
 * The dial is which conversions are in reach, and it is not really about the
 * size of the numbers:
 *
 *  - The bottom band is powers of ten only. Those are the ones where the
 *    arithmetic is a place-value shift, so the item is measuring whether he
 *    knows the *direction* and nothing else.
 *  - The second adds the small whole factors — 2, 3, 4, 7, 12 — where the
 *    conversion has to be remembered rather than derived from the prefix.
 *  - The third adds 16, 24 and 60, where the multiplication is real work.
 *  - The top band leans on the two-step customary conversions, 36 and 16, and
 *    lets the quantity reach 25.
 */
const BANDS = [
  {
    conversions: ['cm-mm', 'm-cm', 'km-m', 'kg-g', 'l-ml'],
    quantities: [2, 3, 4, 5, 6, 7, 8, 9],
  },
  {
    conversions: ['m-cm', 'km-m', 'kg-g', 'l-ml', 'ft-in', 'yd-ft', 'qt-pt', 'pt-c', 'gal-qt', 'week-day'],
    quantities: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    conversions: ['m-mm', 'g-mg', 'min-s', 'hr-min', 'day-hr', 'lb-oz', 'qt-c', 'ft-in', 'gal-pt', 'week-day'],
    quantities: [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12],
  },
  {
    conversions: ['yd-in', 'gal-c', 'lb-oz', 'hr-min', 'min-s', 'day-hr', 'm-mm', 'g-mg', 'l-ml'],
    quantities: [5, 6, 7, 8, 9, 10, 11, 12, 15, 18, 20, 24, 25],
  },
] as const

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
 * The pool a band draws from, built once and reused.
 *
 * Enumerated by id rather than by index, so reordering `CONVERSIONS` cannot
 * silently move a band onto a different conversion. A band naming an id that
 * does not exist would produce a short pool rather than an `undefined` running
 * loose through the arithmetic, so it is caught here.
 */
const POOLS = new Map<number, Conversion[]>()

function poolFor(index: number): Conversion[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const wanted = BANDS[index]!.conversions
  const pool = CONVERSIONS.filter((c) => wanted.includes(c.id as (typeof wanted)[number]))
  if (pool.length !== wanted.length) throw new Error(`band ${index} names an unknown conversion`)
  POOLS.set(index, pool)
  return pool
}

/** `A`, `An` — the article at the start of a sentence. */
function capitalised(article: string): string {
  return `${article[0]!.toUpperCase()}${article.slice(1)}`
}

/** `3 meters`, `1 meter`, `1 foot`, `2 feet`. */
function amount(n: number, unit: Unit): string {
  return `${n} ${n === 1 ? unit.one : unit.many}`
}

/** `3 zeros`, `1 zero`. */
function zeros(n: number): string {
  return `${n} zero${n === 1 ? '' : 's'}`
}

const POWERS_OF_TEN = [10, 100, 1000]

export const mt4md1: ItemGenerator = {
  standardId: 'MT.4.MD.1',
  label: 'Converting to smaller units',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const conversion = rng.pick(poolFor(index))
    const quantity = rng.pick(BANDS[index]!.quantities)

    const from = UNITS[conversion.from]!
    const to = UNITS[conversion.to]!
    const total = quantity * conversion.factor

    return {
      standardId: 'MT.4.MD.1',
      difficulty: d,
      prompt: `How many ${to.many} are in ${amount(quantity, from)}?`,
      // Unitless, and a whole number: `quantity` and `factor` are both whole and
      // the conversion only ever goes to a smaller unit, so the product is
      // exact with nothing to round.
      answer: { kind: 'rational', canonical: String(total) },
      // The factor is deliberately left out. A test handed it would be checking
      // the generator's table against itself, and it has to build the figure
      // from the units on its own.
      params: { quantity, from: conversion.from, to: conversion.to },
      workedSteps: workedSteps(quantity, conversion.factor, from, to),
      misconceptions: misconceptionsFor(quantity, conversion.factor, from, to),
    }
  },
}

function workedSteps(quantity: number, factor: number, from: Unit, to: Unit): string[] {
  const total = quantity * factor

  const steps = [
    `1 ${from.one} is ${amount(factor, to)}.`,
    `${capitalised(from.article)} ${from.one} is bigger than ${to.article} ${to.one}, so it ` +
      `takes more than ${quantity} ${to.many} to make ${amount(quantity, from)}. The number has ` +
      `to grow, not shrink.`,
    `${amount(quantity, from)} is ${quantity} lots of ${factor}: ${quantity} ${TIMES} ${factor} = ${total}.`,
  ]

  const power = POWERS_OF_TEN.indexOf(factor)
  if (power >= 0) {
    steps.push(
      `Multiplying a whole number by ${factor} just puts ${power === 0 ? 'a zero' : zeros(power + 1)} ` +
        `on the end: ${quantity} becomes ${total}.`,
    )
  }

  steps.push(`So ${amount(quantity, from)} is ${amount(total, to)}.`)
  return steps
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * The two families are different mistakes and get different names. On a power of
 * ten the method was right and the place value slipped, which is worth saying
 * out loud because it is nearly right. On the other factors the commonest slip
 * is reaching for ten anyway, because most conversions a child has met so far
 * were ten — and that one is about remembering the unit, not about arithmetic.
 */
function misconceptionsFor(
  quantity: number,
  factor: number,
  from: Unit,
  to: Unit,
): Misconception[] {
  const total = quantity * factor
  const candidates: { id: string; value: R; label: string; explanation: string }[] = []

  if (POWERS_OF_TEN.includes(factor)) {
    if (factor >= 100) {
      candidates.push({
        id: 'one-power-short',
        value: new R(total / 10),
        label: 'One power of ten short',
        explanation:
          `${total / 10} is what ${amount(quantity, from)} would come to if 1 ${from.one} were ` +
          `${factor / 10} ${to.many}. It is ${amount(factor, to)}, so ` +
          `${quantity} ${TIMES} ${factor} = ${total}. The method was right — a zero went missing.`,
      })
    }
    candidates.push({
      id: 'one-power-too-many',
      value: new R(total * 10),
      label: 'One power of ten too many',
      explanation:
        `${total * 10} is ten times too big. 1 ${from.one} is ${amount(factor, to)}, not ` +
        `${factor * 10}, so ${amount(quantity, from)} is ${quantity} ${TIMES} ${factor} = ${total}.`,
    })
  } else {
    candidates.push({
      id: 'guessed-ten',
      value: new R(quantity * 10),
      label: 'Multiplied by 10 instead of the real conversion',
      explanation:
        `Most of the conversions you have met so far were tens, so reaching for 10 makes sense — ` +
        `but this one is not a ten. 1 ${from.one} is ${amount(factor, to)}, so it is ` +
        `${quantity} ${TIMES} ${factor} = ${total}.`,
    })
    candidates.push({
      id: 'added-the-conversion',
      value: new R(quantity + factor),
      label: 'Added the conversion instead of multiplying',
      explanation:
        `${quantity} + ${factor} = ${quantity + factor} puts the two numbers side by side, but ` +
        `each of those ${quantity} ${from.many} is worth ${amount(factor, to)} all by itself. ` +
        `That is ${quantity} lots of ${factor}: ${quantity} ${TIMES} ${factor} = ${total}.`,
    })
  }

  candidates.push({
    id: 'divided-instead-of-multiplying',
    value: new R(quantity, factor),
    label: 'Divided, which goes the wrong way',
    explanation:
      `${quantity} ${DIVIDE} ${factor} is what you would do going the other way, turning ` +
      `${to.many} into ${from.many}. This one starts with the bigger unit, so the answer has to ` +
      `be bigger than ${quantity}, not smaller: ${quantity} ${TIMES} ${factor} = ${total}.`,
  })

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. Adding lands on the right
    // answer for 2 pints in cups, and calling that an error would be telling him
    // a right answer is wrong.
    if (c.value.equals(new R(total))) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
