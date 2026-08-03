import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nbt5 } from './mt4nbt5'

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
function placeValueProduct(p: Record<string, number>): string {
  const x = digitsOf(p.a!)
  const y = digitsOf(p.b!)
  let total = 0
  for (let i = 0; i < x.length; i++) {
    for (let j = 0; j < y.length; j++) {
      let piece = timesByAdding(x[i]!, y[j]!)
      for (let shift = 0; shift < i + j; shift++) piece = timesByAdding(piece, 10)
      total += piece
    }
  }
  return String(total)
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

describe('MT.4.NBT.5 multiplying multi-digit whole numbers', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt5, placeValueProduct, {
      promptParams: ['a', 'b'],
      rebuildPrompt: (p) => `${p.a} ${TIMES} ${p.b}`,
    })
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

  it('names leaving the placeholder zero off the second part', () => {
    // The standard example: 23 × 45 done as 115 + 92 instead of 115 + 920.
    for (const d of [60, HARDEST]) {
      for (const item of itemsAt(d)) {
        const { a, b } = item.params as Record<string, number>
        if (!isByTwo(a!, b!)) continue
        const m = item.misconceptions.find((x) => x.id === 'missing-placeholder-zero')
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(a! * (b! % 10) + a! * Math.floor(b! / 10)))
      }
    }
  })

  it('names stopping after the first partial product', () => {
    for (const item of itemsAt(HARDEST)) {
      const { a, b } = item.params as Record<string, number>
      if (!isByTwo(a!, b!)) continue
      const m = item.misconceptions.find((x) => x.id === 'stopped-after-first-part')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(String(a! * (b! % 10)))
    }
  })

  it('names multiplying tens by tens and ones by ones and nothing else', () => {
    for (const item of itemsAt(HARDEST)) {
      const { a, b } = item.params as Record<string, number>
      if (!isByTwo(a!, b!)) continue
      const m = item.misconceptions.find((x) => x.id === 'missed-the-cross-parts')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(
        String(Math.floor(a! / 10) * Math.floor(b! / 10) * 100 + (a! % 10) * (b! % 10)),
      )
    }
  })

  it('names carrying without adding the carry on', () => {
    for (const d of [40, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b } = item.params as Record<string, number>
        if (isByTwo(a!, b!)) continue
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

  it('always recognises the sum as a wrong answer', () => {
    // Reading `×` as `+` is the one mistake always available, so no item is ever
    // left with nothing to say. It is asserted by value rather than by id
    // because `4 × 28` has 4 + 28 = 32 and 8 × 4 = 32 — the same number from two
    // different mistakes, which cannot be told apart and so is named once.
    for (const d of [EASIEST, 40, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { a, b } = item.params as Record<string, number>
        expect(
          item.misconceptions.some((m) => m.signature === String(a! + b!)),
          `d=${d} ${item.prompt}`,
        ).toBe(true)
      }
    }
  })

  it('spells out every place-value part in the worked steps', () => {
    for (const d of [40, HARDEST]) {
      for (const item of itemsAt(d, 30)) {
        const steps = item.workedSteps.join(' ')
        const { a, b } = item.params as Record<string, number>
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
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          item.answer.canonical,
        )
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt5.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt5.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt5.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt5.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt5.generate(61.3, makeRng(4)).difficulty).toBe(61.3)
  })
})
