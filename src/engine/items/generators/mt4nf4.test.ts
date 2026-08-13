import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  BARE,
  CONTAINERS,
  MISSING_FACTOR,
  PIECE_NAMES,
  REPEATED_ADDITION,
  UNIT_COUNT,
  WORD,
  mt4nf4,
} from './mt4nf4'

const FRACTION_FIRST = 1

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * The product, by the standard's own framing, done literally.
 *
 * "Apply and extend previous understandings of multiplication to multiply a
 * fraction by a whole number" — and the understanding being extended is that
 * multiplying by a whole number is repeated addition. So this adds n/den to
 * itself `whole` times and never multiplies anything at all. The generator
 * computes (whole × n)/den in one step; this arrives at the same value by the
 * route the standard describes.
 */
function productOf(p: Record<string, number>): R {
  let total = new R(0, 1)
  for (let i = 0; i < p.whole!; i++) total = total.add(new R(p.n!, p.den!))
  return total
}

/** Independent of the generator, one route per format. */
const answerFrom = (p: Record<string, number>) => {
  switch (p.format) {
    // How many den-ths the product comes to: scale the value by den, which for a
    // product of den-ths is always a whole number.
    case UNIT_COUNT:
      return productOf(p).mul(new R(p.den!, 1)).toString()
    // x × n/den = top/den, so x = top ÷ n. Recovered from the total the prompt
    // shows rather than from the whole number the generator set aside.
    case MISSING_FACTOR:
      return new R(p.top!, p.n!).toString()
    default:
      return productOf(p).toString()
  }
}

/** `2/3 + 2/3 + 2/3`, with as many terms as the whole number says. */
function repeated(n: number, den: number, whole: number): string {
  return Array.from({ length: whole }, () => `${n}/${den}`).join(' + ')
}

const rebuildPrompt = (p: Record<string, number>) => {
  const { whole, n, den, order, top } = p
  switch (p.format) {
    case REPEATED_ADDITION:
      return repeated(n!, den!, whole!)
    case UNIT_COUNT:
      return `${whole} × ${n}/${den} is how many ${PIECE_NAMES[den!]![1]}?`
    case MISSING_FACTOR: {
      const total = new R(top!, den!).toString()
      return order === FRACTION_FIRST
        ? `${n}/${den} × ? = ${total}. What is the missing number?`
        : `? × ${n}/${den} = ${total}. What is the missing number?`
    }
    case WORD: {
      const { container, containers, unit, stuff } = CONTAINERS[p.container!]!
      return (
        `Each ${container} holds ${n}/${den} of a ${unit} of ${stuff}. ` +
        `How much ${stuff} do ${whole} ${containers} hold altogether?`
      )
    }
    default:
      return order === FRACTION_FIRST ? `${n}/${den} × ${whole}` : `${whole} × ${n}/${den}`
  }
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf4.generate(difficulty, makeRng(s)))
}

const EASIEST = 10
const HARDEST = 85

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

describe('MT.4.NF.4 multiplying a fraction by a whole number', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf4, answerFrom, {
      // `whole` is the answer on the missing-factor format, so it cannot be
      // required in every prompt.
      promptParams: ['n', 'den'],
      rebuildPrompt,
    })
  })

  it('asks five genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and here he was
    // right: `a/b × c` and `c × a/b`, and nothing else.
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
      expect(count / items.length, `"${key}" is ${((count / items.length) * 100).toFixed(0)}% of items`)
        .toBeLessThan(0.35)
    }
    expect(formats.size).toBe(5)
    for (const [format, count] of formats) {
      expect(count / items.length, `format ${format} is too much of the diet`).toBeLessThan(0.35)
    }
  })

  it('writes the question both ways round wherever there are two ways', () => {
    // 5 × 2/3 and 2/3 × 5 are the same question, and a child who has only ever
    // seen one order can freeze on the other. The same goes for where the blank
    // sits in `? × 2/3 = 10/3`.
    for (const format of [BARE, MISSING_FACTOR]) {
      const orders = new Set(
        everyItem()
          .filter((i) => i.params.format === format)
          .map((i) => i.params.order),
      )
      expect(orders, `format ${format}`).toEqual(new Set([0, 1]))
    }
  })

  it('always multiplies a proper fraction in lowest terms by at least two', () => {
    for (const item of everyItem()) {
      const { whole, n, den } = item.params as Record<string, number>
      expect(whole, item.prompt).toBeGreaterThanOrEqual(2)
      expect(n, item.prompt).toBeLessThan(den!)
      expect(gcd(n!, den!), item.prompt).toBe(1)
    }
  })

  it('writes out between three and five lots, never two and never twelve', () => {
    // Twelve copies of `5/12` joined by plus signs is not a question, it is a
    // wall. And `1/2 + 1/2` is not visibly repeated anything — it is an
    // `MT.4.NF.3` question wearing this standard's shirt.
    const sums = everyItem().filter((i) => i.params.format === REPEATED_ADDITION)
    expect(sums.length).toBeGreaterThan(0)
    for (const item of sums) {
      expect(item.params.whole, item.prompt).toBeGreaterThanOrEqual(3)
      expect(item.params.whole, item.prompt).toBeLessThanOrEqual(5)
      expect(item.prompt.split(' + ')).toHaveLength(item.params.whole!)
    }
  })

  it('keeps the two hardest framings out of the easiest band, and the concrete one in it', () => {
    const easyFormats = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easyFormats.has(MISSING_FACTOR)).toBe(false)
    expect(easyFormats.has(UNIT_COUNT)).toBe(false)
    expect(easyFormats.has(REPEATED_ADDITION)).toBe(true)

    // And the written-out sum, which is the concrete end of this standard, is not
    // still being handed to the strongest player.
    const hardFormats = new Set(itemsAt(HARDEST, 200).map((i) => i.params.format))
    expect(hardFormats.has(REPEATED_ADDITION)).toBe(false)
    expect(hardFormats.has(MISSING_FACTOR)).toBe(true)
  })

  it('keeps the hardest band above one whole and off a whole number', () => {
    // The point of the top band is the improper product. Landing on a whole
    // number hides exactly the thing being tested — whatever the format asks
    // for on top of it.
    for (const item of itemsAt(HARDEST)) {
      const product = productOf(item.params)
      expect(product.compare(new R(1)), item.prompt).toBeGreaterThan(0)
      expect(product.isInteger(), item.prompt).toBe(false)
    }
  })

  it('sometimes lands on a whole number in the easiest band', () => {
    // 3 × 2/3 = 2 is a real and useful case, and it only exists down here.
    const wholes = itemsAt(EASIEST).filter((i) => productOf(i.params).isInteger())
    expect(wholes.length).toBeGreaterThan(0)
  })

  it('says where the answer box goes on the format with a blank in it', () => {
    for (const item of everyItem()) {
      const { n, den, order, top, format } = item.params as Record<string, number>
      if (format === MISSING_FACTOR) {
        const total = new R(top!, den!).toString()
        expect(item.promptWithSlot, item.prompt).toBe(
          order === FRACTION_FIRST ? `${n}/${den} × {} = ${total}` : `{} × ${n}/${den} = ${total}`,
        )
      } else {
        expect(item.promptWithSlot, item.prompt).toBeUndefined()
      }
    }
  })

  it('answers with a count on the two formats that ask for one', () => {
    for (const item of everyItem()) {
      const value = R.parse(item.answer.canonical)!
      if ([UNIT_COUNT, MISSING_FACTOR].includes(item.params.format!)) {
        expect(value.isInteger(), item.prompt).toBe(true)
      }
    }
  })

  it('names multiplying the bottom number as well, wherever a bottom number is being multiplied', () => {
    // The signature is worth stating out loud: multiplying top and bottom by the
    // same number lands back on the fraction he started with, every time.
    let seen = 0
    for (const item of everyItem()) {
      if (![BARE, WORD].includes(item.params.format!)) continue
      seen++
      const { whole, n, den } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'multiplied-both')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(whole! * n!, den! * whole!).toString())
      expect(m!.signature).toBe(new R(n!, den!).toString())
    }
    expect(seen).toBeGreaterThan(0)
  })

  it('names adding the bottom numbers on the written-out sum', () => {
    // On a chain of like fractions, adding straight across is the mistake, and it
    // lands exactly back on one lot: (whole × n)/(whole × den) is n/den.
    for (const item of everyItem().filter((i) => i.params.format === REPEATED_ADDITION)) {
      const { whole, n, den } = item.params as Record<string, number>
      const m = item.misconceptions.find((x) => x.id === 'add-across')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(whole! * n!, whole! * den!).toString())
    }
  })

  it('names giving the total instead of the count, on both counting formats', () => {
    for (const item of everyItem()) {
      const { whole, n, den, format } = item.params as Record<string, number>
      if (![UNIT_COUNT, MISSING_FACTOR].includes(format!)) continue
      const m = item.misconceptions.find((x) => x.id === 'answered-the-total')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(whole! * n!, den!).toString())
    }
  })

  it('never carries a multiplication misconception onto a question with no multiplying in it', () => {
    // "You multiplied the bottom number too" means nothing about
    // `2/3 + 2/3 + 2/3`, and a misconception no child could produce on the
    // question in front of him is dead weight that looks like coverage.
    for (const item of everyItem()) {
      if (item.params.format !== REPEATED_ADDITION) continue
      const ids = item.misconceptions.map((m) => m.id)
      expect(ids, item.prompt).not.toContain('multiplied-both')
      expect(ids, item.prompt).not.toContain('multiplied-denominator-only')
    }
  })

  it('never names a mistake that is the right answer', () => {
    for (const item of everyItem()) {
      expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
      const answer = R.parse(item.answer.canonical)!
      for (const m of item.misconceptions) {
        expect(R.parse(m.signature)!.equals(answer), `${m.id} on ${item.prompt}`).toBe(false)
      }
    }
  })

  it('is worth reading out loud: every worked step is a finished sentence', () => {
    for (const item of everyItem()) {
      for (const step of item.workedSteps) {
        const end = step.trim().slice(-1)
        expect(['.', '?'], `"${step}" on ${item.prompt}`).toContain(end)
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf4.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf4.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nf4.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf4.generate(63.9, makeRng(4)).difficulty).toBe(63.9)
  })
})
