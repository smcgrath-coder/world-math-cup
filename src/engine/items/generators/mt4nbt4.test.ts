import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  CONTEXTS,
  DIFFERENCE,
  DIFFERENCE_BETWEEN,
  MISSING_ADDEND,
  MISSING_MINUEND,
  MISSING_SUBTRAHEND,
  SMALLER_FIRST,
  SLOT_FIRST,
  SUM,
  WORD_DIFFERENCE,
  WORD_TOTAL,
  mt4nbt4,
} from './mt4nbt4'

const ADD = 1
const MINUS = '−'

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/** Ones-first digits back to a written number, without a leading zero. */
function write(digits: number[]): string {
  const out = [...digits]
  while (out.length > 1 && out[out.length - 1] === 0) out.pop()
  return out.reverse().join('')
}

/**
 * Independent of the generator: the standard algorithm, spelled out.
 *
 * The standard says "using the standard algorithm", so these do exactly that and
 * nothing else — one column at a time on digit arrays, carrying and borrowing by
 * hand. Neither ever evaluates `a + b` or `a - b`, which is the whole point: the
 * generator gets its key from JavaScript's arithmetic, and these arrive at the
 * same number by the route a fourth grader is taught.
 */
function columnAdd(a: number, b: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  const out: number[] = []
  let carry = 0
  for (let i = 0; i < Math.max(x.length, y.length) + 1; i++) {
    const column = (x[i] ?? 0) + (y[i] ?? 0) + carry
    carry = column >= 10 ? 1 : 0
    out.push(column - carry * 10)
  }
  return Number(write(out))
}

function columnSub(a: number, b: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  const out: number[] = []
  let borrow = 0
  for (let i = 0; i < x.length; i++) {
    const column = x[i]! - (y[i] ?? 0) - borrow
    borrow = column < 0 ? 1 : 0
    out.push(column + borrow * 10)
  }
  return Number(write(out))
}

/**
 * The answer to every format, from the two numbers the item was built from.
 *
 * `a` and `b` are the two parts of the underlying fact — `a + b = total` on the
 * addition formats, `a - b = difference` on the subtraction ones — and `format`
 * says which of the three numbers the prompt hides and asks for. So the routes
 * differ by format and none of them is the generator's:
 *
 *  - The formats that ask for the result run the algorithm once.
 *  - The three missing-number formats run it twice, in opposite directions: the
 *    total is built by carrying, then the shown part is taken back off it by
 *    borrowing. That round trip is what pins the key to the numbers on screen,
 *    and `rebuildPrompt` below computes the shown total the same independent way,
 *    so an item whose blank and whose total disagree fails one check or the other.
 */
const answerFrom = (p: Record<string, number>): string => {
  const a = p.a!
  const b = p.b!
  switch (p.format) {
    case SUM:
    case WORD_TOTAL:
      return String(columnAdd(a, b))
    case DIFFERENCE:
    case WORD_DIFFERENCE:
    case DIFFERENCE_BETWEEN:
      return String(columnSub(a, b))
    case MISSING_ADDEND: {
      const total = columnAdd(a, b)
      // The blank holds whichever part is not on screen, recovered by taking the
      // part that is on screen back off the total.
      return String(p.slot === SLOT_FIRST ? columnSub(total, b) : columnSub(total, a))
    }
    case MISSING_MINUEND:
      // `? - b = difference`, so the blank is the number the subtraction started
      // from: put the part that was taken away back on.
      return String(columnAdd(columnSub(a, b), b))
    case MISSING_SUBTRAHEND:
      // `a - ? = difference`, so the blank is the gap between what was left and
      // what there was to start with.
      return String(columnSub(a, columnSub(a, b)))
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** `1 ticket`, `4570 tickets`. Shared words, never shared arithmetic. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const rebuildPrompt = (p: Record<string, number>): string => {
  const a = p.a!
  const b = p.b!
  switch (p.format) {
    case SUM:
      return `${a} + ${b}`
    case DIFFERENCE:
      return `${a} ${MINUS} ${b}`
    case MISSING_ADDEND:
      return p.slot === SLOT_FIRST
        ? `? + ${b} = ${columnAdd(a, b)}. What is the missing number?`
        : `${a} + ? = ${columnAdd(a, b)}. What is the missing number?`
    case MISSING_MINUEND:
      return `? ${MINUS} ${b} = ${columnSub(a, b)}. What is the missing number?`
    case MISSING_SUBTRAHEND:
      return `${a} ${MINUS} ? = ${columnSub(a, b)}. What is the missing number?`
    case DIFFERENCE_BETWEEN:
      return p.order === SMALLER_FIRST
        ? `What is the difference between ${b} and ${a}?`
        : `What is the difference between ${a} and ${b}?`
    case WORD_TOTAL:
    case WORD_DIFFERENCE: {
      const c = CONTEXTS[p.context!]!
      return (
        `${c.subject} ${c.verb} ${count(a, c.thing, c.things)} ${c.firstWhen} and ` +
        `${count(b, c.thing, c.things)} ${c.secondWhen}. ` +
        `${p.format === WORD_TOTAL ? c.total : c.difference}`
      )
    }
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** How many columns actually carry, or actually borrow. */
function regroupCount(a: number, b: number, op: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  let carry = 0
  let count = 0
  for (let i = 0; i < Math.max(x.length, y.length); i++) {
    const column = op === ADD ? (x[i] ?? 0) + (y[i] ?? 0) + carry : (x[i] ?? 0) - (y[i] ?? 0) - carry
    carry = op === ADD ? (column >= 10 ? 1 : 0) : column < 0 ? 1 : 0
    count += carry
  }
  return count
}

/**
 * The place of a 0 in the top number that a borrow has to travel through, or
 * -1 if there is none. Place 0 is the ones.
 */
function zeroChainPlace(a: number, b: number): number {
  const x = digitsOf(a)
  const y = digitsOf(b)
  let borrow = 0
  for (let i = 0; i < x.length; i++) {
    const before = borrow
    const column = x[i]! - (y[i] ?? 0) - borrow
    borrow = column < 0 ? 1 : 0
    if (x[i] === 0 && before === 1 && borrow === 1) return i
  }
  return -1
}

/** Each column done as "bigger digit take away smaller digit". */
function noBorrowValue(a: number, b: number): string {
  const x = digitsOf(a)
  const y = digitsOf(b)
  return write(x.map((xi, i) => Math.abs(xi - (y[i] ?? 0))))
}

/**
 * The borrow got through the zero but the digit above it never went down by
 * one, so the answer is one whole unit of that place too big.
 */
function chainSlipValue(a: number, b: number): string {
  return String(a - b + 10 ** (zeroChainPlace(a, b) + 1))
}

/** Every column added, but no carry ever moved. */
function droppedCarryValue(a: number, b: number): string {
  const x = digitsOf(a)
  const y = digitsOf(b)
  const width = Math.max(x.length, y.length)
  const out: number[] = []
  for (let i = 0; i < width; i++) out.push(((x[i] ?? 0) + (y[i] ?? 0)) % 10)
  return write(out)
}

/** Every column added and the whole two-digit total written into the column. */
function bothDigitsValue(a: number, b: number): string {
  const x = digitsOf(a)
  const y = digitsOf(b)
  const width = Math.max(x.length, y.length)
  const columns: string[] = []
  for (let i = 0; i < width; i++) columns.push(String((x[i] ?? 0) + (y[i] ?? 0)))
  return columns.reverse().join('')
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nbt4.generate(difficulty, makeRng(s)))
}

const EASIEST = 5
const HARDEST = 78

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/** The formats whose answer is the result of the operation, rather than a part of it. */
const RESULT_FORMATS = [SUM, DIFFERENCE, DIFFERENCE_BETWEEN, WORD_TOTAL, WORD_DIFFERENCE]

/** The formats that hide one number inside a written expression. */
const SLOT_FORMATS = [MISSING_ADDEND, MISSING_MINUEND, MISSING_SUBTRAHEND]

describe('MT.4.NBT.4 adding and subtracting multi-digit whole numbers', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt4, answerFrom, { rebuildPrompt })
  })

  it('asks both additions and subtractions', () => {
    const ops = new Set(itemsAt(45).map((i) => i.params.op))
    expect(ops).toEqual(new Set([0, 1]))
  })

  it('asks eight genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard he was right: there were two prompt shapes, `a + b` and `a − b`,
    // and the commonest was 55% of everything he saw.
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
    // Formats, not just wordings: eight sentences that were really one question
    // would pass the check above and fail the point of it.
    expect(formats.size).toBe(8)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('puts the answer box inside the expression when the answer sits inside one', () => {
    // `4570 + ? = 9327` with the box after it reads as a second question. The
    // box belongs where the blank is.
    for (const item of everyItem()) {
      const { a, b, format } = item.params as Record<string, number>
      if (!SLOT_FORMATS.includes(format!)) {
        expect(item.promptWithSlot, item.prompt).toBeUndefined()
        continue
      }
      const expected =
        format === MISSING_ADDEND
          ? item.params.slot === SLOT_FIRST
            ? `{} + ${b} = ${columnAdd(a!, b!)}`
            : `${a} + {} = ${columnAdd(a!, b!)}`
          : format === MISSING_MINUEND
            ? `{} ${MINUS} ${b} = ${columnSub(a!, b!)}`
            : `${a} ${MINUS} {} = ${columnSub(a!, b!)}`
      expect(item.promptWithSlot, item.prompt).toBe(expected)
    }
  })

  it('keeps the missing-number formats out of the easiest band', () => {
    // Working back to a missing part is the addition or subtraction plus a step
    // on top of it, and the easiest band should be measuring one thing.
    const easy = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    for (const format of SLOT_FORMATS) expect(easy.has(format), `format ${format}`).toBe(false)
    expect(easy.has(SUM)).toBe(true)
    expect(easy.has(DIFFERENCE)).toBe(true)
    expect(easy.has(WORD_TOTAL)).toBe(true)
  })

  it('never takes the bigger number from the smaller one', () => {
    // A negative answer is a topic he has not met, scored against him.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.op === ADD) continue
        expect(item.params.a, item.prompt).toBeGreaterThan(item.params.b!)
      }
    }
  })

  it('never needs regrouping in the easiest band', () => {
    // `456 + 123` is a different question from `456 + 178`, and the gap between
    // them is most of what difficulty means on this standard.
    for (const item of itemsAt(EASIEST)) {
      const { a, b, op } = item.params as Record<string, number>
      expect(regroupCount(a!, b!, op!), item.prompt).toBe(0)
    }
  })

  it('always needs regrouping in the top two bands', () => {
    for (const d of [42, 60, 61, HARDEST]) {
      for (const item of itemsAt(d)) {
        const { a, b, op } = item.params as Record<string, number>
        expect(regroupCount(a!, b!, op!), `d=${d} ${item.prompt}`).toBeGreaterThanOrEqual(
          d >= 61 ? 2 : 1,
        )
      }
    }
  })

  it('sometimes borrows across a zero at the top of the range, and sometimes does not', () => {
    const subs = itemsAt(HARDEST).filter((i) => i.params.op !== ADD)
    expect(subs.length).toBeGreaterThan(0)
    const chained = subs.filter((i) => zeroChainPlace(i.params.a!, i.params.b!) >= 0)
    expect(chained.length).toBeGreaterThan(0)
    expect(chained.length).toBeLessThan(subs.length)
  })

  it('keeps the number of digits inside what each band promises', () => {
    const widest: Record<number, number> = { [EASIEST]: 2, 30: 3, 50: 4, [HARDEST]: 4 }
    for (const [d, max] of Object.entries(widest)) {
      for (const item of itemsAt(Number(d), 40)) {
        expect(String(item.params.a).length, `d=${d} ${item.prompt}`).toBeLessThanOrEqual(max)
        expect(String(item.params.b).length, `d=${d} ${item.prompt}`).toBeLessThanOrEqual(max)
      }
    }
  })

  it('sometimes gives the second number fewer digits than the first', () => {
    // `456 + 78` is its own small skill: the ones have to be lined up under the
    // ones instead of the left-hand edges being matched up.
    const shorter = itemsAt(45).filter(
      (i) => String(i.params.b).length < String(i.params.a).length,
    )
    expect(shorter.length).toBeGreaterThan(0)
  })

  it('keeps both amounts in a word problem at two digits or more', () => {
    // "A stadium sold 4570 tickets on Friday and 7 tickets on Saturday" is not a
    // question anybody would ask, and it makes the second amount decorative.
    const words = everyItem().filter((i) =>
      [WORD_TOTAL, WORD_DIFFERENCE].includes(i.params.format!),
    )
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) {
      expect(item.params.a, item.prompt).toBeGreaterThanOrEqual(10)
      expect(item.params.b, item.prompt).toBeGreaterThanOrEqual(10)
    }
  })

  it('agrees in number wherever a count meets its noun', () => {
    // "1 tickets" and "4570 ticket" are the failure mode nothing else in here can
    // see: every number is right and the sentence is still wrong. A difference
    // really can come out as 1 — 100 − 99 — so the singular case is live.
    const words = new Map<string, string>()
    for (const c of CONTEXTS) words.set(c.thing, c.things)

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

  it('names taking the smaller digit from the bigger one in every column', () => {
    // The single most common multi-digit subtraction error. Worked by hand from
    // the standard example: 502 − 178 done this way gives 476, not 324.
    expect(noBorrowValue(502, 178)).toBe('476')

    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, format } = item.params as Record<string, number>
        if (![DIFFERENCE, DIFFERENCE_BETWEEN, WORD_DIFFERENCE].includes(format!)) continue
        const m = item.misconceptions.find((x) => x.id === 'no-borrow')
        if (noBorrowValue(a!, b!) === String(a! - b!)) {
          expect(m, `${item.prompt} has nothing to get wrong here`).toBeUndefined()
          continue
        }
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(noBorrowValue(a!, b!))
      }
    }
  })

  it('names losing a step in a borrow chain', () => {
    // 502 − 178 is 324. A child who takes the borrow through the 0 but forgets
    // to drop the 5 to a 4 gets 424 — a whole hundred too many.
    expect(chainSlipValue(502, 178)).toBe('424')

    for (const item of itemsAt(HARDEST)) {
      const { a, b, format } = item.params as Record<string, number>
      if (![DIFFERENCE, DIFFERENCE_BETWEEN, WORD_DIFFERENCE].includes(format!)) continue
      const m = item.misconceptions.find((x) => x.id === 'borrow-chain-slip')
      if (zeroChainPlace(a!, b!) < 0) {
        expect(m, item.prompt).toBeUndefined()
        continue
      }
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(chainSlipValue(a!, b!))
    }
  })

  it('names dropping the carry', () => {
    expect(droppedCarryValue(456, 178)).toBe('524')

    for (const item of itemsAt(HARDEST)) {
      const { a, b, format } = item.params as Record<string, number>
      if (![SUM, WORD_TOTAL].includes(format!)) continue
      const m = item.misconceptions.find((x) => x.id === 'dropped-the-carry')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(droppedCarryValue(a!, b!))
    }
  })

  it('names writing the whole two-digit column total, on small enough sums', () => {
    expect(bothDigitsValue(47, 38)).toBe('715')

    for (const item of itemsAt(30)) {
      const { a, b, format } = item.params as Record<string, number>
      if (![SUM, WORD_TOTAL].includes(format!)) continue
      const m = item.misconceptions.find((x) => x.id === 'wrote-both-digits')
      if (bothDigitsValue(a!, b!) === String(a! + b!)) {
        expect(m, `${item.prompt} has nothing to get wrong here`).toBeUndefined()
        continue
      }
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(bothDigitsValue(a!, b!))
    }
  })

  it('always names reading the question as the opposite operation', () => {
    // Every format has one mistake that is available whatever the numbers are, so
    // no item can ever be left with nothing to say about a wrong answer. Which
    // one it is depends on what the question shows: on a bare sum it is taking
    // one number from the other, and on `4570 + ? = 9327` it is adding the two
    // numbers that are on the screen.
    for (const d of [EASIEST, 30, 50, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, format, slot } = item.params as Record<string, number>
        const total = columnAdd(a!, b!)
        const difference = columnSub(a!, b!)
        let expected: number
        switch (format) {
          case SUM:
          case WORD_TOTAL:
            expected = Math.abs(a! - b!)
            break
          case DIFFERENCE:
          case WORD_DIFFERENCE:
          case DIFFERENCE_BETWEEN:
            expected = a! + b!
            break
          case MISSING_ADDEND:
            expected = total + (slot === SLOT_FIRST ? b! : a!)
            break
          case MISSING_MINUEND:
            expected = Math.abs(difference - b!)
            break
          default:
            expected = a! + difference
        }
        expect(
          item.misconceptions.some((m) => m.signature === String(expected)),
          `d=${d} ${item.prompt} has no signature ${expected}`,
        ).toBe(true)
      }
    }
  })

  it('never answers a missing-number question with a number the prompt already shows', () => {
    // The blank is the one number that is not on the screen. If the key were one
    // of the shown numbers the question would answer itself.
    for (const item of everyItem()) {
      if (!SLOT_FORMATS.includes(item.params.format!)) continue
      const shown = (item.prompt.match(/\d+/g) ?? []).filter((n) => n === item.answer.canonical)
      expect(shown, item.prompt).toHaveLength(0)
    }
  })

  it('walks one place at a time in the worked steps', () => {
    for (const item of itemsAt(HARDEST, 20)) {
      const steps = item.workedSteps.join(' ')
      expect(steps, item.prompt).toContain('ones')
      expect(steps, item.prompt).toContain('tens')
      // The last step always states the finished answer, so he can check himself.
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
        item.answer.canonical,
      )
    }
  })

  it('walks every place of both numbers it is working with', () => {
    // Caught a real bug: `? − 5949 = 631` is solved by adding 5949 back on to
    // 631, and the working walked only the places of the 631 — so it finished
    // with "nothing is left to add in the thousands place" while the 5949 plainly
    // had a 5 sitting there. Every number is right in that sentence and the
    // sentence is false, which nothing else in this file could see.
    // Five places, because a total can be one column wider than either of the
    // numbers that made it: `9584 + 6470` is 16054, and the working has to walk
    // that ten thousands column when the total is what gets taken apart.
    const headings = ['Ones:', 'Tens:', 'Hundreds:', 'Thousands:', 'Ten thousands:']
    for (const item of everyItem()) {
      const { a, b, format, slot } = item.params as Record<string, number>
      const total = columnAdd(a!, b!)
      const difference = columnSub(a!, b!)

      // The two numbers the working actually lines up in columns, which is not
      // always the two the item was built from.
      let walked: [number, number]
      switch (format) {
        case MISSING_ADDEND:
          walked = [total, slot === SLOT_FIRST ? b! : a!]
          break
        case MISSING_MINUEND:
          walked = [difference, b!]
          break
        case MISSING_SUBTRAHEND:
          walked = [a!, difference]
          break
        default:
          walked = [a!, b!]
      }

      const width = Math.max(...walked.map((n) => String(n).length))
      for (let i = 0; i < width; i++) {
        expect(
          item.workedSteps.some((step) => step.startsWith(headings[i]!)),
          `${item.prompt} never reaches the ${headings[i]} column`,
        ).toBe(true)
      }
    }
  })

  it('never lets a two-digit number appear in a column without saying where it came from', () => {
    // Caught a real bug: on `580 − 111` the ones column read "Ones: 10 − 1 = 9"
    // and nothing said where the 10 came from. The top digit was a 0 and no
    // borrow had arrived at it yet, so the sentence explaining the borrow was
    // skipped. A 10 appearing out of nowhere is exactly how the standard
    // algorithm turns into moves to memorise.
    for (const item of everyItem()) {
      for (const step of item.workedSteps) {
        if (!/^(Ones|Tens|Hundreds|Thousands|Ten thousands): /.test(step)) continue
        const columns = [...step.matchAll(/(\d+) − \d+ = \d+/g)]
        for (const column of columns) {
          if (Number(column[1]) < 10) continue
          expect(
            step.includes('take 1') || step.includes('lent 1'),
            `"${step}" in ${item.prompt}`,
          ).toBe(true)
        }
      }
    }
  })

  it('shows the check the other way round on every missing-number question', () => {
    // The point of `4570 + ? = 9327` is that addition and subtraction undo each
    // other. The working has to end by putting the answer back into the
    // question, or it is just a subtraction with extra words.
    for (const item of everyItem().filter((i) => SLOT_FORMATS.includes(i.params.format!))) {
      const { a, b, format } = item.params as Record<string, number>
      const last = item.workedSteps[item.workedSteps.length - 1]!
      const restated =
        format === MISSING_ADDEND
          ? `${a} + ${b} = ${columnAdd(a!, b!)}`
          : `${a} ${MINUS} ${b} = ${columnSub(a!, b!)}`
      expect(last, item.prompt).toContain(restated)
    }
  })

  it('names both amounts of a word problem, and the same context throughout', () => {
    const words = everyItem().filter((i) => [WORD_TOTAL, WORD_DIFFERENCE].includes(i.params.format!))
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) {
      const c = CONTEXTS[item.params.context!]!
      expect(item.prompt, item.prompt).toContain(c.subject)
      expect(item.prompt, item.prompt).toContain(c.things)
      expect(new Set(RESULT_FORMATS).has(item.params.format!)).toBe(true)
    }
    // Every context has to actually turn up, or the table is decoration.
    expect(new Set(words.map((i) => i.params.context)).size).toBe(CONTEXTS.length)
  })

  it('asks the difference both ways round', () => {
    // "The difference between 478 and 9327" is the same question as "between
    // 9327 and 478", and a child who has only met the bigger-first version can
    // read the other one as an instruction to subtract in the order given.
    const asked = everyItem().filter((i) => i.params.format === DIFFERENCE_BETWEEN)
    expect(asked.filter((i) => i.params.order === SMALLER_FIRST).length).toBeGreaterThan(0)
    expect(asked.filter((i) => i.params.order !== SMALLER_FIRST).length).toBeGreaterThan(0)
  })

  it('hides the first part as often as the second in a missing addend', () => {
    const asked = everyItem().filter((i) => i.params.format === MISSING_ADDEND)
    expect(asked.filter((i) => i.params.slot === SLOT_FIRST).length).toBeGreaterThan(0)
    expect(asked.filter((i) => i.params.slot !== SLOT_FIRST).length).toBeGreaterThan(0)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt4.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt4.generate(52.4, makeRng(4)).difficulty).toBe(52.4)
  })
})
