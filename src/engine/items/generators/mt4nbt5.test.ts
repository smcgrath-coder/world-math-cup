import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  BARE,
  GROUP_CONTEXTS,
  MISSING_FACTOR,
  PARTIAL_PRODUCT,
  ROW_CONTEXTS,
  SLOT_FIRST,
  SPLIT_FIRST,
  TEN_TIMES,
  WORD_GROUPS,
  WORD_ROWS,
  mt4nbt5,
} from './mt4nbt5'

const TIMES = '×'

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/** `count` lots of `value`, counted out one at a time. */
function timesByAdding(value: number, count: number): number {
  let total = 0
  for (let i = 0; i < count; i++) total += value
  return total
}

/**
 * Independent of the generator: the standard's own strategy, done literally.
 *
 * "Multiply ... flexibly using strategies based on place value and the
 * properties of operations." So this breaks both numbers into their places,
 * multiplies every place by every other place, shifts each piece to where it
 * belongs, and adds. The multiplication operator never appears: each digit pair
 * is counted out by repeated addition, and each shift is ten lots of what came
 * before. The generator reaches its key through `a * b` in one step; this walks
 * the distributive property the standard names and has to land on the same
 * number.
 */
function placeValueProduct(a: number, b: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  let total = 0
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      let piece = timesByAdding(x[i]!, y[j]!)
      for (let shift = 0; shift < i + j; shift++) piece = timesByAdding(piece, 10)
      total += piece
    }
  }
  return total
}

/** How many lots of `each` fit in `total`, by taking them off one at a time. */
function lotsIn(total: number, each: number): number {
  let left = total
  let lots = 0
  while (left >= each) {
    left -= each
    lots++
  }
  expect(left, `${each} does not go into ${total} exactly`).toBe(0)
  return lots
}

/** The tens part of a two-digit number, as what it is worth: 45 gives 40. */
function tensOf(n: number): number {
  return Math.floor(n / 10) * 10
}

/** The one non-zero digit of a round number: 70 gives 7, 900 gives 9. */
function digitOf(round: number): number {
  return Number(String(round).replace(/0+$/, ''))
}

/**
 * The answer to every format, from the two factors the item was built from.
 *
 * `a` and `b` are always the two numbers whose product the item is about, and
 * `format` says which number the question actually wants — which is not always
 * the product:
 *
 *  - The product formats expand the distributive property once.
 *  - `MISSING_FACTOR` expands it and then takes the shown factor back out of the
 *    product by repeated subtraction, which is a different operation reaching the
 *    hidden factor. It also asserts the division is exact, so a product and a
 *    factor that do not belong together fail rather than round.
 *  - `PARTIAL_PRODUCT` expands a different pair of numbers: one whole factor and
 *    the tens part of the other.
 */
const answerFrom = (p: Record<string, number>): string => {
  const a = p.a!
  const b = p.b!
  switch (p.format) {
    case BARE:
    case WORD_ROWS:
    case WORD_GROUPS:
    case TEN_TIMES:
      return String(placeValueProduct(a, b))
    case MISSING_FACTOR:
      return String(lotsIn(placeValueProduct(a, b), p.slot === SLOT_FIRST ? b : a))
    case PARTIAL_PRODUCT:
      return String(
        p.split === SPLIT_FIRST ? placeValueProduct(b, tensOf(a)) : placeValueProduct(a, tensOf(b)),
      )
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** `1 seat`, `45 seats`. Shared words, never shared arithmetic. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

/**
 * How a word problem has to read the two factors.
 *
 * The working takes the bigger number apart into its places, because that is
 * where place value lives — a 6 cannot usefully be split. So the amount in each
 * container has to be that same number, or the sentence and the working are
 * describing two different situations.
 */
function countedAs(a: number, b: number): { per: number; groups: number } {
  return a >= 10 && b >= 10
    ? { per: a, groups: b }
    : { per: Math.max(a, b), groups: Math.min(a, b) }
}

const rebuildPrompt = (p: Record<string, number>): string => {
  const a = p.a!
  const b = p.b!
  switch (p.format) {
    case BARE:
      return `${a} ${TIMES} ${b}`
    case MISSING_FACTOR:
      return p.slot === SLOT_FIRST
        ? `? ${TIMES} ${b} = ${placeValueProduct(a, b)}. What is the missing number?`
        : `${a} ${TIMES} ? = ${placeValueProduct(a, b)}. What is the missing number?`
    case TEN_TIMES: {
      const digit = digitOf(b)
      return (
        `${a} ${TIMES} ${digit} = ${placeValueProduct(a, digit)}. ` +
        `What is ${a} ${TIMES} ${b}?`
      )
    }
    case PARTIAL_PRODUCT: {
      const parted = p.split === SPLIT_FIRST ? a : b
      const whole = p.split === SPLIT_FIRST ? b : a
      return (
        `To work out ${a} ${TIMES} ${b} you can split ${parted} into ${tensOf(parted)} + ` +
        `${parted % 10}. What is ${whole} ${TIMES} ${tensOf(parted)}?`
      )
    }
    case WORD_ROWS: {
      const c = ROW_CONTEXTS[p.context!]!
      const { per, groups } = countedAs(a, b)
      return (
        `${c.subject} has ${count(groups, 'row', 'rows')} of ${c.items}, with ` +
        `${count(per, c.item, c.items)} in each row. ${c.ask}`
      )
    }
    case WORD_GROUPS: {
      const c = GROUP_CONTEXTS[p.context!]!
      const { per, groups } = countedAs(a, b)
      return (
        `Each ${c.each} ${c.verb} ${count(per, c.item, c.items)}. How many ${c.items} are in ` +
        `${count(groups, c.each, c.eachPlural)}?`
      )
    }
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** How many columns carry when `x` is multiplied by the one-digit `m`. */
function carriesIn(x: number, m: number): number {
  let carry = 0
  let count = 0
  for (const digit of digitsOf(x)) {
    const column = digit * m + carry
    carry = Math.floor(column / 10)
    if (carry > 0) count++
  }
  return count
}

/** The long number and the one-digit number, whichever way round they are written. */
function byOneParts(a: number, b: number): [number, number] {
  return a < 10 ? [b, a] : [a, b]
}

function isByTwo(a: number, b: number): boolean {
  return a >= 10 && b >= 10
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nbt5.generate(difficulty, makeRng(s)))
}

const EASIEST = 15
const HARDEST = 88

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/** The formats whose answer is the product of the two numbers in `params`. */
const PRODUCT_FORMATS = [BARE, WORD_ROWS, WORD_GROUPS, TEN_TIMES]

describe('MT.4.NBT.5 multiplying multi-digit whole numbers', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt5, answerFrom, { rebuildPrompt })
  })

  it('asks six genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard he was exactly right: there was one prompt shape, `a × b`, and it
    // was 100% of everything he ever saw.
    const items = everyItem()
    const shapes = new Map<string, number>()
    const formats = new Map<number, number>()
    for (const item of items) {
      const key = shape(item.prompt)
      shapes.set(key, (shapes.get(key) ?? 0) + 1)
      formats.set(item.params.format!, (formats.get(item.params.format!) ?? 0) + 1)
    }

    expect(shapes.size).toBeGreaterThanOrEqual(6)
    for (const [key, count] of shapes) {
      expect(
        count / items.length,
        `"${key}" is ${((count / items.length) * 100).toFixed(0)}% of items`,
      ).toBeLessThan(0.35)
    }
    // Formats, not just wordings: six sentences that were really one question
    // would pass the check above and fail the point of it.
    expect(formats.size).toBe(6)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('stays inside the two shapes the standard names', () => {
    // "a whole number of up to four digits by a one-digit whole number" and
    // "two two-digit numbers". Anything else is a different standard.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { a, b } = item.params as Record<string, number>
        if (isByTwo(a!, b!)) {
          expect(String(a).length, item.prompt).toBe(2)
          expect(String(b).length, item.prompt).toBe(2)
        } else {
          const [long, m] = byOneParts(a!, b!)
          expect(String(long).length, item.prompt).toBeLessThanOrEqual(4)
          expect(String(long).length, item.prompt).toBeGreaterThanOrEqual(2)
          expect(m, item.prompt).toBeGreaterThanOrEqual(2)
          expect(m, item.prompt).toBeLessThanOrEqual(9)
        }
      }
    }
  })

  it('never carries in the easiest band', () => {
    for (const item of itemsAt(EASIEST)) {
      const { a, b } = item.params as Record<string, number>
      expect(isByTwo(a!, b!), item.prompt).toBe(false)
      const [long, m] = byOneParts(a!, b!)
      expect(carriesIn(long, m), item.prompt).toBe(0)
    }
  })

  it('always carries in the top two bands', () => {
    for (const d of [52, 69, 71, HARDEST]) {
      for (const item of itemsAt(d)) {
        const { a, b } = item.params as Record<string, number>
        if (isByTwo(a!, b!)) continue
        const [long, m] = byOneParts(a!, b!)
        expect(carriesIn(long, m), `d=${d} ${item.prompt}`).toBeGreaterThan(0)
      }
    }
  })

  it('covers both shapes, and only offers two-digit by two-digit higher up', () => {
    expect(itemsAt(EASIEST).filter((i) => isByTwo(i.params.a!, i.params.b!))).toHaveLength(0)
    for (const d of [60, HARDEST]) {
      const items = itemsAt(d)
      expect(items.filter((i) => isByTwo(i.params.a!, i.params.b!)).length, `d=${d}`).toBeGreaterThan(0)
      expect(items.filter((i) => !isByTwo(i.params.a!, i.params.b!)).length, `d=${d}`).toBeGreaterThan(0)
    }
  })

  it('reaches four digits by the top of the range', () => {
    const wide = itemsAt(HARDEST).filter((i) => Math.max(i.params.a!, i.params.b!) >= 1000)
    expect(wide.length).toBeGreaterThan(0)
  })

  it('writes the one-digit number on both sides', () => {
    // 6 × 347 and 347 × 6 are the same question, and a child who has only ever
    // seen one order can freeze on the other.
    const byOne = itemsAt(40).filter((i) => !isByTwo(i.params.a!, i.params.b!))
    expect(byOne.filter((i) => i.params.a! < 10).length).toBeGreaterThan(0)
    expect(byOne.filter((i) => i.params.b! < 10).length).toBeGreaterThan(0)
  })

  it('keeps the missing factor and the partial product out of the easiest band', () => {
    // Working back to a factor, and working out one part of a split on purpose,
    // are both a step of reasoning on top of the multiplication.
    const easy = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easy.has(MISSING_FACTOR)).toBe(false)
    expect(easy.has(PARTIAL_PRODUCT)).toBe(false)
    expect(easy.has(BARE)).toBe(true)
  })

  it('only asks for a missing factor where the one that is missing is findable', () => {
    // `? × 21 = 672` needs 672 ÷ 21, and dividing by a two-digit number is not
    // grade 4. So the missing-factor format only ever draws the up-to-four-digits
    // by one-digit shape: either the blank is the long number, which comes back
    // by dividing by a single digit, or the blank is the single digit, which is
    // one of eight numbers and comes back by counting lots.
    const asked = everyItem().filter((i) => i.params.format === MISSING_FACTOR)
    expect(asked.length).toBeGreaterThan(0)
    for (const item of asked) {
      const { a, b } = item.params as Record<string, number>
      expect(isByTwo(a!, b!), item.prompt).toBe(false)
    }
    // Both blanks have to occur, or half the format is dead code.
    expect(asked.filter((i) => i.params.slot === SLOT_FIRST).length).toBeGreaterThan(0)
    expect(asked.filter((i) => i.params.slot !== SLOT_FIRST).length).toBeGreaterThan(0)
    expect(asked.filter((i) => Number(i.answer.canonical) < 10).length).toBeGreaterThan(0)
    expect(asked.filter((i) => Number(i.answer.canonical) >= 10).length).toBeGreaterThan(0)
  })

  it('puts the answer box inside the expression when the answer sits inside one', () => {
    for (const item of everyItem()) {
      const { a, b, format, slot } = item.params as Record<string, number>
      if (format !== MISSING_FACTOR) {
        expect(item.promptWithSlot, item.prompt).toBeUndefined()
        continue
      }
      const product = placeValueProduct(a!, b!)
      expect(item.promptWithSlot, item.prompt).toBe(
        slot === SLOT_FIRST ? `{} ${TIMES} ${b} = ${product}` : `${a} ${TIMES} {} = ${product}`,
      )
    }
  })

  it('splits a two-digit factor both ways round in a partial product', () => {
    const asked = everyItem().filter((i) => i.params.format === PARTIAL_PRODUCT)
    expect(asked.length).toBeGreaterThan(0)
    for (const item of asked) {
      const { a, b } = item.params as Record<string, number>
      // Splitting a number into tens and ones only means anything if it has both.
      expect(isByTwo(a!, b!), item.prompt).toBe(true)
      expect(a! % 10, item.prompt).toBeGreaterThan(0)
      expect(b! % 10, item.prompt).toBeGreaterThan(0)
    }
    expect(asked.filter((i) => i.params.split === SPLIT_FIRST).length).toBeGreaterThan(0)
    expect(asked.filter((i) => i.params.split !== SPLIT_FIRST).length).toBeGreaterThan(0)
  })

  it('asks a ten-times question about a round number that really is round', () => {
    const asked = everyItem().filter((i) => i.params.format === TEN_TIMES)
    expect(asked.length).toBeGreaterThan(0)
    const zeros = new Set<number>()
    for (const item of asked) {
      const { a, b } = item.params as Record<string, number>
      // One non-zero digit followed by only zeros, so "ten times 7" is the whole
      // story and the fact on the screen is a fact he already knows.
      expect(String(b), item.prompt).toMatch(/^[1-9]0+$/)
      expect(a, item.prompt).toBeLessThan(10)
      zeros.add(String(b!).length - 1)
    }
    // Both a tens and a hundreds version turn up somewhere in the range.
    expect(zeros).toEqual(new Set([1, 2]))
  })

  it('names the placeholder zero mistakes on the questions that can make them', () => {
    // The standard example: 23 × 45 done as 115 + 92 instead of 115 + 920.
    for (const d of [60, HARDEST]) {
      for (const item of itemsAt(d)) {
        const { a, b, format } = item.params as Record<string, number>
        if (!PRODUCT_FORMATS.includes(format!) || !isByTwo(a!, b!)) continue
        const m = item.misconceptions.find((x) => x.id === 'missing-placeholder-zero')
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(a! * (b! % 10) + a! * Math.floor(b! / 10)))
      }
    }
  })

  it('names stopping after the first partial product', () => {
    for (const item of itemsAt(HARDEST)) {
      const { a, b, format } = item.params as Record<string, number>
      if (!PRODUCT_FORMATS.includes(format!) || !isByTwo(a!, b!)) continue
      const m = item.misconceptions.find((x) => x.id === 'stopped-after-first-part')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(String(a! * (b! % 10)))
    }
  })

  it('names carrying without adding the carry on', () => {
    for (const d of [40, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, format } = item.params as Record<string, number>
        if (!PRODUCT_FORMATS.includes(format!) || isByTwo(a!, b!)) continue
        if (format === TEN_TIMES) continue
        const [long, mult] = byOneParts(a!, b!)
        const dropped = Number(
          digitsOf(long)
            .map((digit) => (digit * mult) % 10)
            .reverse()
            .join(''),
        )
        const m = item.misconceptions.find((x) => x.id === 'carry-never-added')
        if (dropped === long * mult) {
          expect(m, `${item.prompt} has no carry to lose`).toBeUndefined()
          continue
        }
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(dropped))
      }
    }
  })

  it('always names one wrong answer that the question can really produce', () => {
    // Every format carries at least one signature that is available whatever the
    // numbers are, so no item is ever left with nothing to say. On the formats
    // that ask for the product it is reading × as +. It is asserted by value
    // rather than by id because `4 × 28` has 4 + 28 = 32 and 8 × 4 = 32 — the
    // same number from two different mistakes, which cannot be told apart and so
    // is named once.
    for (const d of [EASIEST, 40, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, format } = item.params as Record<string, number>
        const product = placeValueProduct(a!, b!)
        let expected: number
        if (PRODUCT_FORMATS.includes(format!)) {
          expected = a! + b!
        } else if (format === MISSING_FACTOR) {
          // Writing the total down again. Multiplying the two numbers on the
          // screen is also named, but only while the result is a number somebody
          // might actually type — `45894 × 7649` runs to nine digits.
          expected = product
        } else {
          // The whole product, when only one part of it was asked for.
          expected = product
        }
        expect(
          item.misconceptions.some((m) => m.signature === String(expected)),
          `d=${d} ${item.prompt} has no signature ${expected}`,
        ).toBe(true)
        expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
      }
    }
  })

  it('spells out every place-value part in the worked steps', () => {
    for (const d of [40, HARDEST]) {
      for (const item of itemsAt(d, 30)) {
        const { a, b, format } = item.params as Record<string, number>
        if (!PRODUCT_FORMATS.includes(format!) || format === TEN_TIMES) continue
        const steps = item.workedSteps.join(' ')
        if (isByTwo(a!, b!)) {
          // The placeholder zero is the whole difficulty of this shape, so the
          // second part is always named as what it is — 23 × 40, never 23 × 4.
          expect(steps, item.prompt).toContain(`${a} ${TIMES} ${Math.floor(b! / 10) * 10}`)
        } else {
          // Every place that is worth anything gets multiplied and shown. A
          // place holding 0 contributes nothing and is left out, which is why
          // this checks the values rather than the place names.
          const [long] = byOneParts(a!, b!)
          digitsOf(long).forEach((digit, i) => {
            if (digit === 0) return
            expect(steps, item.prompt).toContain(String(digit * 10 ** i))
          })
        }
      }
    }
  })

  it('ends every working on the number the question asked for', () => {
    for (const item of everyItem()) {
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
        item.answer.canonical,
      )
    }
  })

  it('agrees in number wherever a count meets its noun', () => {
    // "1 seats" and "45 seat" are the failure mode nothing else in here can see:
    // every number is right and the sentence is still wrong.
    const words = new Map<string, string>([['row', 'rows']])
    for (const c of ROW_CONTEXTS) words.set(c.item, c.items)
    for (const c of GROUP_CONTEXTS) {
      words.set(c.item, c.items)
      words.set(c.each, c.eachPlural)
    }

    for (const item of everyItem()) {
      const text = [
        item.prompt,
        ...item.workedSteps,
        ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
      ].join('\n')
      for (const [one, many] of words) {
        for (const m of text.matchAll(new RegExp(`(\\d+) ${many}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).not.toBe('1')
        }
        for (const m of text.matchAll(new RegExp(`(\\d+) ${one}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).toBe('1')
        }
      }
    }
  })

  it('says how many are in each container using the number the working takes apart', () => {
    // The working splits the bigger number into its places, so the sentence has
    // to put that number in the container. Otherwise the child reads "45 crates
    // of 6 apples" and the working explains 6 lots of 45, which is the same
    // product and a different situation.
    const words = everyItem().filter((i) => i.params.format === WORD_GROUPS)
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) {
      const { a, b } = item.params as Record<string, number>
      const { per, groups } = countedAs(a!, b!)
      const c = GROUP_CONTEXTS[item.params.context!]!
      expect(item.prompt, item.prompt).toContain(`Each ${c.each} ${c.verb} ${per} `)
      expect(item.prompt, item.prompt).toContain(`${groups} ${c.eachPlural}?`)
      expect(item.workedSteps[0], item.prompt).toContain(`${groups} lots of ${per}`)
    }
    expect(new Set(words.map((i) => i.params.context)).size).toBe(GROUP_CONTEXTS.length)
  })

  it('only puts an amount in a container that could really hold it', () => {
    // "Each hall has 12 seats" is a question about nothing, and "each crate holds
    // 8437 apples" is a lie about crates. The amount runs from two digits to four
    // across the range, so the situation is chosen to fit the number.
    for (const item of everyItem()) {
      if (item.params.format !== WORD_GROUPS) continue
      const { per } = countedAs(item.params.a!, item.params.b!)
      const c = GROUP_CONTEXTS[item.params.context!]!
      expect(per, item.prompt).toBeGreaterThanOrEqual(c.minPer)
      expect(per, item.prompt).toBeLessThanOrEqual(c.maxPer)
    }
    // And the ranges have to cover everything the bands can draw, or the
    // fallback is quietly carrying items it was never meant to.
    for (let per = 10; per <= 9999; per++) {
      expect(
        GROUP_CONTEXTS.some((c) => per >= c.minPer && per <= c.maxPer),
        `nothing can hold ${per}`,
      ).toBe(true)
    }
  })

  it('keeps rows and columns to two two-digit numbers', () => {
    // "6 rows of 8437 chairs" is not a room anybody has been in. The array
    // framing only takes the shape whose numbers stay believable.
    const rows = everyItem().filter((i) => i.params.format === WORD_ROWS)
    expect(rows.length).toBeGreaterThan(0)
    for (const item of rows) {
      expect(isByTwo(item.params.a!, item.params.b!), item.prompt).toBe(true)
    }
    expect(new Set(rows.map((i) => i.params.context)).size).toBe(ROW_CONTEXTS.length)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt5.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt5.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt5.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt5.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt5.generate(61.3, makeRng(4)).difficulty).toBe(61.3)
  })
})
