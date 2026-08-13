import { describe, expect, it } from 'vitest'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  BIGGEST_FIT,
  CONTEXTS,
  MISSING_DIVIDEND,
  QUOTIENT,
  REMAINDER,
  WORD_GROUPS,
  WORD_LEFTOVER,
  mt4nbt6,
} from './mt4nbt6'

const DIVIDE = '÷'

/**
 * Independent of the generator: division from its own definition.
 *
 * The generator builds a dividend from a quotient and a remainder it chose. This
 * takes the dividend and the divisor back apart by repeated subtraction — take
 * the divisor away until you cannot any more, which is what "how many whole
 * groups, and what is left over" means — and then asserts the pair of invariants
 * that define the answer at all:
 *
 *   quotient × divisor + remainder === dividend,  and  0 <= remainder < divisor
 *
 * Those two together are stronger than recomputing a division: a quotient one
 * too small satisfies the first and fails the second, and a remainder borrowed
 * from the wrong place fails the first. Nothing here divides.
 */
function parts(dividend: number, divisor: number): [number, number] {
  let remainder = dividend
  let quotient = 0
  while (remainder >= divisor) {
    remainder -= divisor
    quotient++
  }
  const where = `${dividend} ${DIVIDE} ${divisor}`
  expect(quotient * divisor + remainder, `${where} does not rebuild from its parts`).toBe(dividend)
  expect(remainder, `${where} has a negative remainder`).toBeGreaterThanOrEqual(0)
  expect(remainder, `${where} has a remainder at least as big as the divisor`).toBeLessThan(divisor)
  return [quotient, remainder]
}

/**
 * The answer to every format, from the dividend and the divisor.
 *
 * Four of the six are one of the two halves of the division, taken apart here by
 * repeated subtraction. The other two are worth spelling out:
 *
 *  - `BIGGEST_FIT` wants what the whole groups use up, reached as the dividend
 *    with the leftover taken off — not as a quotient multiplied back, which is
 *    the route the generator takes.
 *  - `MISSING_DIVIDEND` shows the quotient and the remainder and hides the
 *    dividend, so the dividend *is* the key and there is nothing to recompute it
 *    from. What pins it is `rebuildPrompt` below: it derives the quotient and the
 *    remainder from `params` by repeated subtraction and demands the prompt show
 *    exactly those, so an item whose blank and whose shown parts disagree fails
 *    that check. `rebuilds the dividend from the parts it shows` closes the loop
 *    from the other side, by repeated addition.
 */
const answerFrom = (p: Record<string, number>): string => {
  const [quotient, remainder] = parts(p.dividend!, p.divisor!)
  switch (p.format) {
    case QUOTIENT:
    case WORD_GROUPS:
      return String(quotient)
    case REMAINDER:
    case WORD_LEFTOVER:
      return String(remainder)
    case BIGGEST_FIT:
      return String(p.dividend! - remainder)
    case MISSING_DIVIDEND:
      return String(p.dividend)
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

/** `1 cookie`, `184 cookies`. Shared words, never shared arithmetic. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

const rebuildPrompt = (p: Record<string, number>): string => {
  const dividend = p.dividend!
  const divisor = p.divisor!
  const [quotient, remainder] = parts(dividend, divisor)
  switch (p.format) {
    case QUOTIENT:
      return `${dividend} ${DIVIDE} ${divisor}. How many whole groups of ${divisor}?`
    case REMAINDER:
      return `${dividend} ${DIVIDE} ${divisor}. What is the remainder?`
    case BIGGEST_FIT:
      return `What is the biggest multiple of ${divisor} that is not bigger than ${dividend}?`
    case MISSING_DIVIDEND:
      return (
        `? ${DIVIDE} ${divisor} = ${quotient} remainder ${remainder}. What is the missing number?`
      )
    case WORD_GROUPS:
    case WORD_LEFTOVER: {
      const c = CONTEXTS[p.context!]!
      return (
        `${count(dividend, c.item, c.items)} are ${c.verb} ${c.groups} of ${divisor}. ` +
        `${p.format === WORD_GROUPS ? c.askGroups : c.askLeftover}`
      )
    }
    default:
      throw new Error(`unknown format ${p.format}`)
  }
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nbt6.generate(difficulty, makeRng(s)))
}

const EASIEST = 20
const HARDEST = 92

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

/** The formats whose answer is how many whole groups there are. */
const GROUP_FORMATS = [QUOTIENT, WORD_GROUPS]

/** The formats whose answer is what is left over. */
const LEFTOVER_FORMATS = [REMAINDER, WORD_LEFTOVER]

describe('MT.4.NBT.6 whole-number quotients and remainders', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nbt6, answerFrom, { promptParams: ['divisor'], rebuildPrompt })
  })

  it('asks six genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and on this
    // standard he was right: two prompt shapes, and the commonest was 69% of
    // everything he saw.
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

  it('stays inside four-digit dividends and one-digit divisors', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { dividend, divisor } = item.params as Record<string, number>
        expect(String(dividend).length, item.prompt).toBeLessThanOrEqual(4)
        expect(String(dividend).length, item.prompt).toBeGreaterThanOrEqual(2)
        expect(divisor, item.prompt).toBeGreaterThanOrEqual(2)
        expect(divisor, item.prompt).toBeLessThanOrEqual(9)
      }
    }
  })

  it('asks for one part at a time, and says which', () => {
    // `AnswerSpec` grades a single number, so `169 r 2` is not something the
    // checker can read. Each item asks for one number and the prompt says
    // plainly which one it wants.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 30)) {
        const [quotient, remainder] = parts(item.params.dividend!, item.params.divisor!)
        const format = item.params.format!
        if (GROUP_FORMATS.includes(format)) {
          expect(item.answer.canonical, item.prompt).toBe(String(quotient))
        } else if (LEFTOVER_FORMATS.includes(format)) {
          expect(item.answer.canonical, item.prompt).toBe(String(remainder))
        }
      }
    }
  })

  it('only asks how many groups in the easiest band, and every framing higher up', () => {
    // Asking what is left over is a second question on top of the division, and
    // the easiest band should be measuring one thing. Working backwards from the
    // answer is a step further again.
    const easy = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easy).toEqual(new Set(GROUP_FORMATS))
    for (const d of [45, 60, HARDEST]) {
      const seen = new Set(itemsAt(d, 200).map((i) => i.params.format))
      expect(seen.has(QUOTIENT), `d=${d}`).toBe(true)
      expect(seen.has(REMAINDER), `d=${d}`).toBe(true)
      expect(seen.has(BIGGEST_FIT), `d=${d}`).toBe(true)
    }
    expect(new Set(itemsAt(HARDEST, 200).map((i) => i.params.format)).size).toBe(6)
    expect(new Set(itemsAt(45, 200).map((i) => i.params.format)).has(MISSING_DIVIDEND)).toBe(false)
  })

  it('lets him meet both a clean division and a leftover low down', () => {
    for (const d of [EASIEST, 45]) {
      const remainders = itemsAt(d).map((i) => parts(i.params.dividend!, i.params.divisor!)[1])
      expect(remainders.filter((r) => r === 0).length, `d=${d} never divides exactly`).toBeGreaterThan(0)
      expect(remainders.filter((r) => r > 0).length, `d=${d} always divides exactly`).toBeGreaterThan(0)
    }
  })

  it('always leaves something over in the top two bands', () => {
    // Higher up, the remainder is the point of the question.
    for (const d of [57, 74, 75, HARDEST]) {
      for (const item of itemsAt(d)) {
        const [, remainder] = parts(item.params.dividend!, item.params.divisor!)
        expect(remainder, `d=${d} ${item.prompt}`).toBeGreaterThan(0)
      }
    }
  })

  it('never hides a dividend behind a remainder of 0', () => {
    // `? ÷ 8 = 82 remainder 0` is a strange question, and it is also the one
    // shape where both of this format's named mistakes collapse onto the correct
    // answer — leaving an item with nothing to say about a wrong answer at all.
    // So the format forces a leftover whatever the band would allow.
    const hidden = everyItem().filter((i) => i.params.format === MISSING_DIVIDEND)
    expect(hidden.length).toBeGreaterThan(0)
    for (const item of hidden) {
      const [, remainder] = parts(item.params.dividend!, item.params.divisor!)
      expect(remainder, item.prompt).toBeGreaterThan(0)
      expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
    }
  })

  it('rebuilds the dividend from the parts it shows', () => {
    // The other side of the loop that `rebuildPrompt` starts: the answer to a
    // hidden dividend has to be what you get by adding the divisor up quotient
    // times and putting the leftover back on. Repeated addition, not the
    // multiplication the generator used.
    for (const item of everyItem()) {
      if (item.params.format !== MISSING_DIVIDEND) continue
      const { dividend, divisor } = item.params as Record<string, number>
      const [quotient, remainder] = parts(dividend!, divisor!)
      let built = remainder
      for (let i = 0; i < quotient; i++) built += divisor!
      expect(String(built), item.prompt).toBe(item.answer.canonical)
      expect(item.promptWithSlot, item.prompt).toBe(
        `{} ${DIVIDE} ${divisor} = ${quotient} remainder ${remainder}`,
      )
    }
  })

  it('answers the biggest-multiple question with what the whole groups use up', () => {
    for (const item of everyItem()) {
      if (item.params.format !== BIGGEST_FIT) continue
      const { dividend, divisor } = item.params as Record<string, number>
      const [, remainder] = parts(dividend!, divisor!)
      const answer = Number(item.answer.canonical)
      // A multiple of the divisor, no bigger than the dividend, and the next one
      // up would overshoot. Those three together pin it without dividing.
      expect(answer % divisor!, item.prompt).toBe(0)
      expect(answer, item.prompt).toBeLessThanOrEqual(dividend!)
      expect(answer + divisor!, item.prompt).toBeGreaterThan(dividend!)
      expect(answer, item.prompt).toBe(dividend! - remainder)
    }
  })

  it('puts the answer box inside the expression only where the answer sits inside one', () => {
    for (const item of everyItem()) {
      if (item.params.format === MISSING_DIVIDEND) continue
      expect(item.promptWithSlot, item.prompt).toBeUndefined()
    }
  })

  it('reaches four-digit dividends at the top of the range', () => {
    expect(itemsAt(HARDEST).filter((i) => i.params.dividend! >= 1000).length).toBeGreaterThan(0)
  })

  it('names answering the other part of the answer', () => {
    let named = 0
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const [quotient, remainder] = parts(item.params.dividend!, item.params.divisor!)
        const format = item.params.format!
        const asksGroups = GROUP_FORMATS.includes(format)
        if (!asksGroups && !LEFTOVER_FORMATS.includes(format)) continue
        const id = asksGroups ? 'answered-the-remainder' : 'answered-the-quotient'
        const other = asksGroups ? remainder : quotient
        const wanted = asksGroups ? quotient : remainder
        const m = item.misconceptions.find((x) => x.id === id)

        if (other === wanted || (asksGroups && remainder === 0)) {
          // Two reasons this is not a mistake worth naming. 20 ÷ 9 is 2
          // remainder 2, so whichever part he was asked for the other one is the
          // same number and there is nothing to tell apart — naming it would
          // mean calling a correct answer a known error. And on a clean
          // division, "gave the leftover instead" would be an answer of 0 to
          // "how many groups", which nobody types.
          expect(m, `d=${d} ${item.prompt}`).toBeUndefined()
          continue
        }
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(other))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names stopping before the last whole group', () => {
    // The remainder came out as big as the divisor or bigger, which always means
    // one more group could still have been made. It shows up in the quotient as
    // one too few and in the remainder as one divisor too many.
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        const { dividend, divisor, format } = item.params as Record<string, number>
        const [quotient, remainder] = parts(dividend!, divisor!)
        const asksGroups = GROUP_FORMATS.includes(format!)
        if (!asksGroups && !LEFTOVER_FORMATS.includes(format!)) continue
        const m = item.misconceptions.find((x) => x.id === 'stopped-too-early')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(
          String(asksGroups ? quotient - 1 : remainder + divisor!),
        )
      }
    }
  })

  it('names saying nothing was left over, but only when something was', () => {
    for (const d of [45, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        if (!LEFTOVER_FORMATS.includes(item.params.format!)) continue
        const [, remainder] = parts(item.params.dividend!, item.params.divisor!)
        const m = item.misconceptions.find((x) => x.id === 'dropped-the-remainder')
        if (remainder === 0) {
          // 0 is the right answer here. Naming it as a mistake would tell him a
          // correct answer is a known error, which is the one thing this app
          // must never do.
          expect(m, item.prompt).toBeUndefined()
          continue
        }
        expect(m, item.prompt).toBeDefined()
        expect(m!.signature, item.prompt).toBe('0')
      }
    }
  })

  it('checks itself by multiplying back, in the worked steps', () => {
    // "the relationship between multiplication and division" is in the standard
    // by name, and it is also how he can tell on his own whether he is right.
    for (const d of [EASIEST, 45, 60, HARDEST]) {
      for (const item of itemsAt(d, 20)) {
        const { dividend, divisor } = item.params as Record<string, number>
        const [quotient] = parts(dividend!, divisor!)
        const steps = item.workedSteps.join(' ')
        expect(steps, item.prompt).toContain(`${quotient} × ${divisor} = ${quotient * divisor!}`)
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          item.answer.canonical,
        )
      }
    }
  })

  it('agrees in number wherever a count meets its noun', () => {
    // "1 cookies are left over" is the failure mode nothing else in here can
    // see: every number is right and the sentence is still wrong. A leftover of
    // 1 is common, so the singular case is not hypothetical.
    // "more whole group" is in here as its own phrase because "as 1 more whole
    // groups" slips straight past a check that only looks for a digit directly
    // in front of the noun.
    const words = new Map<string, string>([
      ['whole group', 'whole groups'],
      ['more whole group', 'more whole groups'],
      ['more group', 'more groups'],
      ['group', 'groups'],
    ])
    for (const c of CONTEXTS) {
      words.set(c.item, c.items)
      words.set(c.group, c.groups)
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

  it('uses every word context, and keeps the situation and the numbers together', () => {
    const words = everyItem().filter((i) =>
      [WORD_GROUPS, WORD_LEFTOVER].includes(i.params.format!),
    )
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) {
      const c = CONTEXTS[item.params.context!]!
      expect(item.prompt, item.prompt).toContain(c.items)
      expect(item.prompt, item.prompt).toContain(`${c.groups} of ${item.params.divisor}`)
    }
    expect(new Set(words.map((i) => i.params.context)).size).toBe(CONTEXTS.length)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nbt6.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt6.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt6.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nbt6.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nbt6.generate(66.8, makeRng(4)).difficulty).toBe(66.8)
  })
})
