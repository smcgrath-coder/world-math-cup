import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nbt4 } from './mt4nbt4'

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
 * The standard says "using the standard algorithm", so this does exactly that
 * and nothing else — one column at a time on digit arrays, carrying and
 * borrowing by hand. It never evaluates `a + b` or `a - b`, which is the whole
 * point: the generator gets its key from JavaScript's arithmetic, and this
 * arrives at the same number by the route a fourth grader is taught.
 */
function standardAlgorithm(p: Record<string, number>): string {
  const x = digitsOf(p.a!)
  const y = digitsOf(p.b!)
  const width = Math.max(x.length, y.length) + 1
  const out: number[] = []
  let carry = 0

  for (let i = 0; i < width; i++) {
    const xi = x[i] ?? 0
    const yi = y[i] ?? 0
    if (p.op === ADD) {
      const column = xi + yi + carry
      carry = column >= 10 ? 1 : 0
      out.push(column - carry * 10)
    } else {
      const column = xi - yi - carry
      carry = column < 0 ? 1 : 0
      out.push(column + carry * 10)
    }
  }
  return write(out)
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

describe('MT.4.NBT.4 adding and subtracting multi-digit whole numbers', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt4, standardAlgorithm, {
      promptParams: ['a', 'b'],
      rebuildPrompt: (p) => (p.op === ADD ? `${p.a} + ${p.b}` : `${p.a} ${MINUS} ${p.b}`),
    })
  })

  it('asks both additions and subtractions', () => {
    const ops = new Set(itemsAt(45).map((i) => i.params.op))
    expect(ops).toEqual(new Set([0, 1]))
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

  it('names taking the smaller digit from the bigger one in every column', () => {
    // The single most common multi-digit subtraction error. Worked by hand from
    // the standard example: 502 − 178 done this way gives 476, not 324.
    expect(noBorrowValue(502, 178)).toBe('476')

    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, op } = item.params as Record<string, number>
        if (op === ADD) continue
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
      const { a, b, op } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'borrow-chain-slip')
      if (op === ADD || zeroChainPlace(a!, b!) < 0) {
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
      const { a, b, op } = item.params as Record<string, number>
      if (op !== ADD) continue
      const m = item.misconceptions.find((x) => x.id === 'dropped-the-carry')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(droppedCarryValue(a!, b!))
    }
  })

  it('names writing the whole two-digit column total, on small enough sums', () => {
    expect(bothDigitsValue(47, 38)).toBe('715')

    for (const item of itemsAt(30)) {
      const { a, b, op } = item.params as Record<string, number>
      if (op !== ADD) continue
      const m = item.misconceptions.find((x) => x.id === 'wrote-both-digits')
      if (bothDigitsValue(a!, b!) === String(a! + b!)) {
        expect(m, `${item.prompt} has nothing to get wrong here`).toBeUndefined()
        continue
      }
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(bothDigitsValue(a!, b!))
    }
  })

  it('always names the sign being read the other way round', () => {
    // The one mistake that is always available, so no item can ever be left
    // with nothing to say about a wrong answer.
    for (const d of [EASIEST, 30, 50, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b, op } = item.params as Record<string, number>
        const id = op === ADD ? 'subtracted-instead' : 'added-instead'
        const m = item.misconceptions.find((x) => x.id === id)
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature).toBe(String(op === ADD ? Math.abs(a! - b!) : a! + b!))
      }
    }
  })

  it('walks one place at a time in the worked steps', () => {
    for (const item of itemsAt(HARDEST, 20)) {
      const steps = item.workedSteps.join(' ')
      expect(steps, item.prompt).toContain('ones')
      expect(steps, item.prompt).toContain('tens')
      // The last step always states the finished sum, so he can check himself.
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
        item.answer.canonical,
      )
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt4.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt4.generate(52.4, makeRng(4)).difficulty).toBe(52.4)
  })
})
