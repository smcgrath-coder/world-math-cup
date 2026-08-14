import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { NAMES, NOUNS, mt4oa1 } from './mt4oa1'
import { canonicalOf } from '../../answer'

const TIMES = '×'

/** Redeclared rather than imported: a mismatch with the generator is a bug this file should catch. */
const FORWARD = 1
const INVERSE = 0

const EASIEST = 12
const HARDEST = 82

/**
 * Independent of the generator: multiplicative comparison from repeated
 * addition, which is what "times as many" means before it is a multiplication.
 *
 * Nothing here multiplies and nothing here divides.
 *
 *  - Forward — the prompt gives the smaller amount and asks for the larger.
 *    `factor` lots of it, added up one lot at a time.
 *  - Inverse — the prompt gives the larger amount and asks for the smaller. The
 *    unknown is *the number that `factor` copies of make `given`*, so this
 *    searches every whole number up to `given` for one that does, by repeated
 *    addition, and insists that exactly one exists. A generator that quietly
 *    emitted a comparison that does not come out whole would fail here rather
 *    than publish an answer key nobody can reach.
 */
function comparisonAnswer(p: Record<string, number>): string {
  const given = p.given!
  const factor = p.factor!

  const lotsOf = (each: number): number => {
    let total = 0
    for (let i = 0; i < factor; i++) total += each
    return total
  }

  if (p.direction === FORWARD) return String(lotsOf(given))

  const found: number[] = []
  for (let k = 1; k <= given; k++) if (lotsOf(k) === given) found.push(k)
  expect(found.length, `${factor} lots of what makes ${given}? found ${found.join(', ')}`).toBe(1)
  return String(found[0])
}

function rebuildPrompt(p: Record<string, number>): string {
  const a = NAMES[p.nameA!]!
  const b = NAMES[p.nameB!]!
  const noun = NOUNS[p.noun!]!.many
  return p.direction === FORWARD
    ? `${a} has ${p.given} ${noun}. ${b} has ${p.factor} times as many ${noun} as ${a}. ` +
        `How many ${noun} does ${b} have?`
    : `${a} has ${p.given} ${noun}. That is ${p.factor} times as many ${noun} as ${b} has. ` +
        `How many ${noun} does ${b} have?`
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4oa1.generate(difficulty, makeRng(s)))
}

/** Every word of an item that a child ever reads. */
function allText(item: { prompt: string; workedSteps: string[]; misconceptions: { label: string; explanation: string }[] }): string {
  return [item.prompt, ...item.workedSteps, ...item.misconceptions.flatMap((m) => [m.label, m.explanation])].join(
    '\n',
  )
}

/**
 * "Ravi has 1 stickers" is the failure mode nothing else in here can see: every
 * number is right, the answer key is right, and the sentence is still wrong in a
 * way that tells a child the explanation was not written for him. Checked both
 * ways round, on every noun the generator can draw.
 */
function assertNounsAgree(text: string, where: string): void {
  for (const { one, many } of NOUNS) {
    for (const m of text.matchAll(new RegExp(`(\\d+) ${one}\\b`, 'g'))) {
      expect(m[1], `"${m[0]}" ${where}`).toBe('1')
    }
    for (const m of text.matchAll(new RegExp(`(\\d+) ${many}\\b`, 'g'))) {
      expect(m[1], `"${m[0]}" ${where}`).not.toBe('1')
    }
  }
  for (const m of text.matchAll(/(\d+) (lots|times as many)\b/g)) {
    expect(m[1], `"${m[0]}" ${where}`).not.toBe('1')
  }
  for (const m of text.matchAll(/(\d+) lot\b/g)) {
    expect(m[1], `"${m[0]}" ${where}`).toBe('1')
  }
}

describe('MT.4.OA.1 multiplicative comparison', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4oa1, comparisonAnswer, {
      promptParams: ['given', 'factor'],
      rebuildPrompt,
    })
  })

  it('asks the forward direction only in the easiest band', () => {
    // Finding the larger amount is one step. Working back from it is the step
    // children lose, and the easiest band should measure one thing.
    expect(new Set(itemsAt(EASIEST).map((i) => i.params.direction))).toEqual(new Set([FORWARD]))
  })

  it('asks the inverse direction higher up, which is the one that is hard', () => {
    for (const d of [40, 60, HARDEST]) {
      expect(new Set(itemsAt(d).map((i) => i.params.direction)), `d=${d}`).toEqual(
        new Set([FORWARD, INVERSE]),
      )
    }
  })

  it('never gives the two children the same name', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        expect(item.params.nameA, item.prompt).not.toBe(item.params.nameB)
      }
    }
  })

  it('keeps the comparison inside the multiplication facts', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { given, factor, direction } = item.params as Record<string, number>
        const smaller = direction === FORWARD ? given! : Number(canonicalOf(item.answer))
        const larger = direction === FORWARD ? Number(canonicalOf(item.answer)) : given!
        expect(factor, item.prompt).toBeGreaterThanOrEqual(2)
        expect(factor, item.prompt).toBeLessThanOrEqual(12)
        expect(smaller, item.prompt).toBeGreaterThanOrEqual(2)
        expect(smaller, item.prompt).toBeLessThanOrEqual(12)
        expect(larger, item.prompt).toBeLessThanOrEqual(144)
      }
    }
  })

  it('writes the comparison out as a multiplication equation', () => {
    // "represent verbal statements of multiplicative comparisons as
    // multiplication equations" is half the standard, so the equation has to
    // appear somewhere he can see it.
    for (const d of [EASIEST, 40, 60, HARDEST]) {
      for (const item of itemsAt(d, 30)) {
        const { given, factor, direction } = item.params as Record<string, number>
        const smaller = direction === FORWARD ? given! : Number(canonicalOf(item.answer))
        const larger = direction === FORWARD ? Number(canonicalOf(item.answer)) : given!
        expect(item.workedSteps.join(' '), item.prompt).toContain(
          `${factor} ${TIMES} ${smaller} = ${larger}`,
        )
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          canonicalOf(item.answer),
        )
      }
    }
  })

  it('names multiplying when the comparison had to be undone', () => {
    // "Ravi has 12, which is 3 times as many as Maya" answered as 36. The
    // commonest error on the inverse direction by a distance: the words say
    // "times", so the child multiplies.
    let named = 0
    for (const d of [40, 60, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.direction !== INVERSE) continue
        const m = item.misconceptions.find((x) => x.id === 'multiplied-instead-of-undoing')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(item.params.given! * item.params.factor!))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names reading "times as many" as "more than"', () => {
    let named = 0
    for (const d of [EASIEST, 40, HARDEST]) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.direction !== FORWARD) continue
        const { given, factor } = item.params as Record<string, number>
        const m = item.misconceptions.find((x) => x.id === 'added-the-comparison')
        if (given! + factor! === Number(canonicalOf(item.answer))) {
          // 2 stickers and "2 times as many" is the one case where adding and
          // multiplying land on the same 4. Naming it would tell him a correct
          // answer is a known mistake, which is the one thing this app must
          // never do.
          expect(m, item.prompt).toBeUndefined()
          continue
        }
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(given! + factor!))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('agrees in number everywhere a child reads', () => {
    for (let d = EASIEST; d <= HARDEST; d += 2) {
      for (const item of itemsAt(d, 40)) {
        assertNounsAgree(allText(item), `at d=${d} in "${item.prompt}"`)
      }
    }
  })

  it('draws on more than one name and more than one thing to count', () => {
    const items = itemsAt(40)
    expect(new Set(items.map((i) => i.params.nameA)).size).toBeGreaterThan(1)
    expect(new Set(items.map((i) => i.params.noun)).size).toBeGreaterThan(1)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4oa1.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa1.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa1.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4oa1.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4oa1.generate(55.4, makeRng(4)).difficulty).toBe(55.4)
  })
})
