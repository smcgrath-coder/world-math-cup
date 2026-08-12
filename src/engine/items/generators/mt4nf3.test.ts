import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import {
  BARE,
  DECOMPOSE,
  MATERIALS,
  MISSING_FIRST,
  MISSING_SECOND,
  NAMES,
  WORD,
  mt4nf3,
} from './mt4nf3'

const ADD = 1

/**
 * Independent of the generator.
 *
 * The standard's whole content is that when the pieces are already the same
 * size, only the count changes — so every recomputation here works on the counts
 * as whole numbers and puts `den` back underneath at the end. That is a
 * different route from the generator's `Rational.add`, which cross-multiplies
 * (n1 × den + n2 × den) / (den × den) and then reduces.
 *
 * The three missing-term formats recompute from the total the prompt actually
 * *shows*, not from the term the generator set aside. A generator that printed
 * one total and keyed the answer to another is caught rather than agreed with.
 */
const answerFrom = (p: Record<string, number>) => {
  const { n1, n2, den, op, total } = p as Record<string, number>
  switch (p.format) {
    case MISSING_SECOND:
      // n1/den + x = total/den, or n1/den - x = total/den.
      return new R(op === ADD ? total! - n1! : n1! - total!, den!).toString()
    case MISSING_FIRST:
      // x + n2/den = total/den, or x - n2/den = total/den.
      return new R(op === ADD ? total! - n2! : total! + n2!, den!).toString()
    case DECOMPOSE:
      // total/den = n1/den + x.
      return new R(total! - n1!, den!).toString()
    default:
      return new R(op === ADD ? n1! + n2! : n1! - n2!, den!).toString()
  }
}

/** U+2212 MINUS SIGN, as the generator uses in prompts. */
const MINUS = '−'

/**
 * How an amount reads in a word problem: "3/8 of a cup", "11/8 cups", "2 cups".
 *
 * Rebuilt here rather than imported, so that the sentence structure is written
 * twice and independently. That shares the words with the generator and never
 * its arithmetic.
 */
function quantity(n: number, d: number, unit: string, units: string): string {
  if (d === 1) return `${n} ${n === 1 ? unit : units}`
  return n < d ? `${n}/${d} of a ${unit}` : `${n}/${d} ${units}`
}

const rebuildPrompt = (p: Record<string, number>) => {
  const { n1, n2, den, op, total } = p
  const sign = op === ADD ? '+' : MINUS
  switch (p.format) {
    case MISSING_SECOND:
      return `${n1}/${den} ${sign} ? = ${total}/${den}. What fraction goes in the blank?`
    case MISSING_FIRST:
      return `? ${sign} ${n2}/${den} = ${total}/${den}. What fraction goes in the blank?`
    case DECOMPOSE:
      return `${total}/${den} = ${n1}/${den} + ?. What fraction goes in the blank?`
    case WORD: {
      const name = NAMES[p.name!]
      const { material, unit, units } = MATERIALS[p.material!]!
      const first = quantity(n1!, den!, unit, units)
      const second = quantity(n2!, den!, unit, units)
      return op === ADD
        ? `${name} used ${first} of ${material} on Monday and ${second} on Tuesday. ` +
            `How much ${material} did ${name} use in total?`
        : `${name} had ${first} of ${material} and used ${second}. How much ${material} is left?`
    }
    default:
      return `${n1}/${den} ${sign} ${n2}/${den}`
  }
}

const EASIEST = 5
const HARDEST = 80

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf3.generate(difficulty, makeRng(s)))
}

/** Every item across the whole range, which is what a season of play looks like. */
function everyItem() {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += 1) out.push(...itemsAt(d, 40))
  return out
}

/** The first item at `difficulty` whose format and operation match, walking seeds. */
function firstItem(difficulty: number, format: number, op: number) {
  for (let seed = 0; seed < 600; seed++) {
    const item = mt4nf3.generate(difficulty, makeRng(seed))
    if (item.params.format === format && item.params.op === op) return item
  }
  throw new Error(`no format ${format} op ${op} item at difficulty ${difficulty}`)
}

/** A prompt with every number masked out — the measure of how repetitive it feels. */
const shape = (s: string) => s.replace(/\d+/g, '#').replace(/\s+/g, ' ').trim()

describe('MT.4.NF.3 add/subtract like denominators', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf3, answerFrom, {
      // `den` is the only number in every format's prompt: the first term is the
      // answer on one of them and the total is the answer on two others.
      promptParams: ['den'],
      rebuildPrompt,
    })
  })

  it('produces larger denominators at higher difficulty', () => {
    const easy = mt4nf3.generate(10, makeRng(1))
    const hard = mt4nf3.generate(70, makeRng(1))
    expect(hard.params.den).toBeGreaterThan(easy.params.den)
  })

  it('never produces a negative answer', () => {
    // Negative fractions are years away, and a negative answer here would be a
    // question about a topic he has not met, scored against him.
    for (const item of everyItem()) {
      expect(R.parse(item.answer.canonical)!.n, item.prompt).toBeGreaterThanOrEqual(0)
    }
  })

  it('asks five genuinely different questions, none of them the house style', () => {
    // Rion's complaint, as a test. He said the questions felt repetitive — "the
    // subject might change slightly, but the pattern remained" — and here he was
    // right: two shapes, `a/b + c/b` and `a/b − c/b`, and nothing else.
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

  it('asks both operations on every format that has two of them', () => {
    // A child who has only ever seen the missing number after a plus sign
    // freezes on `? − 3/8 = 4/8`, which is the one that needs adding.
    const seen = new Map<number, Set<number>>()
    for (const item of everyItem()) {
      const set = seen.get(item.params.format!) ?? new Set<number>()
      set.add(item.params.op!)
      seen.set(item.params.format!, set)
    }
    for (const format of [BARE, MISSING_SECOND, MISSING_FIRST, WORD]) {
      expect(seen.get(format), `format ${format}`).toEqual(new Set([0, 1]))
    }
    // Decomposition is a sum being split back up. There is no subtraction
    // version of it, and inventing one would be a different question.
    expect(seen.get(DECOMPOSE)).toEqual(new Set([ADD]))
  })

  it('keeps the two inverse formats out of the easiest band', () => {
    // Working backwards from the total is a second idea on top of the standard.
    const easyFormats = new Set(itemsAt(EASIEST, 200).map((i) => i.params.format))
    expect(easyFormats.has(MISSING_FIRST)).toBe(false)
    expect(easyFormats.has(MISSING_SECOND)).toBe(false)
    expect(easyFormats.has(BARE)).toBe(true)
    expect(easyFormats.has(WORD)).toBe(true)
  })

  it('says where the answer box goes on every format with a blank in it', () => {
    for (const item of everyItem()) {
      const { n1, n2, den, op, total, format } = item.params as Record<string, number>
      const sign = op === ADD ? '+' : MINUS
      if (format === MISSING_SECOND) {
        expect(item.promptWithSlot, item.prompt).toBe(`${n1}/${den} ${sign} {} = ${total}/${den}`)
      } else if (format === MISSING_FIRST) {
        expect(item.promptWithSlot, item.prompt).toBe(`{} ${sign} ${n2}/${den} = ${total}/${den}`)
      } else if (format === DECOMPOSE) {
        expect(item.promptWithSlot, item.prompt).toBe(`${total}/${den} = ${n1}/${den} + {}`)
      } else {
        expect(item.promptWithSlot, item.prompt).toBeUndefined()
      }
    }
  })

  it('shows a total that is really the total of the two terms', () => {
    // The blank is only answerable if the number on the other side of the equals
    // sign is the one the two terms make. This is the check that the prompt and
    // the answer key are talking about the same equation.
    for (const item of everyItem()) {
      const { n1, n2, den, op, total, format } = item.params as Record<string, number>
      if (total === undefined) {
        expect([BARE, WORD], item.prompt).toContain(format)
        continue
      }
      expect(total, item.prompt).toBe(op === ADD ? n1! + n2! : n1! - n2!)
      expect(den, item.prompt).toBeGreaterThanOrEqual(2)
    }
  })

  it('carries the add-across misconception on addition, and never on subtraction', () => {
    // Subtracting straight across gives a denominator of den - den = 0, which is
    // not a number, so there is no wrong answer to recognise. Emitting one anyway
    // would mean naming a mistake that cannot happen.
    //
    // It also has no meaning on the missing-term formats: there is nothing to add
    // straight across when the thing being asked for is one of the terms.
    let onAdditions = 0
    for (const item of everyItem()) {
      const { n1, n2, den, op, format } = item.params as Record<string, number>
      const across = item.misconceptions.find((m) => m.id === 'add-across')
      if (op === ADD && (format === BARE || format === WORD)) {
        onAdditions++
        expect(across, `no add-across on ${item.prompt}`).toBeDefined()
        expect(across!.signature).toBe(new R(n1! + n2!, den! * 2).toString())
      } else {
        expect(across, `add-across on ${item.prompt}`).toBeUndefined()
      }
    }
    expect(onAdditions).toBeGreaterThan(0)
  })

  it('names adding the two numbers on screen — except where that is the method', () => {
    // The commonest thing a child does with an equation he cannot read is add
    // whatever he can see. On three of the four missing-term framings that is
    // always a wrong answer, so those items always name it.
    //
    // On `? − 3/8 = 4/8` it is not a mistake at all: adding the two numbers on
    // screen is how the question is done. Naming it there would mean telling him
    // his right answer is a known error.
    let named = 0
    for (const item of everyItem()) {
      const { n1, n2, total, den, format, op } = item.params as Record<string, number>
      if (![MISSING_SECOND, MISSING_FIRST, DECOMPOSE].includes(format!)) continue
      const m = item.misconceptions.find((x) => x.id === 'added-what-was-shown')
      if (format === MISSING_FIRST && op !== ADD) {
        expect(m, item.prompt).toBeUndefined()
        continue
      }
      named++
      const shown = format === MISSING_FIRST ? n2! : n1!
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(shown + total!, den!).toString())
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names subtracting when the missing first term has to be added', () => {
    // `? − 3/8 = 4/8`. The sign says take away, so a child takes away, and 1/8
    // is what he gets. The answer is 7/8, and it comes from adding.
    let seen = 0
    for (const item of everyItem()) {
      const { n2, total, den, format, op } = item.params as Record<string, number>
      if (format !== MISSING_FIRST || op === ADD) continue
      seen++
      const m = item.misconceptions.find((x) => x.id === 'subtracted-instead')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature).toBe(new R(Math.abs(total! - n2!), den!).toString())
    }
    expect(seen).toBeGreaterThan(0)
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

  it('never writes a word problem about a whole number of cups as a fraction', () => {
    // "8/8 cups of flour" is true and nobody says it. Every amount a word
    // problem prints is either less than one whole — "3/8 of a cup" — or plainly
    // more than one — "11/8 cups".
    const words = everyItem().filter((i) => i.params.format === WORD)
    expect(words.length).toBeGreaterThan(0)
    for (const item of words) {
      expect(item.params.n1, item.prompt).not.toBe(item.params.den)
      expect(item.params.n2, item.prompt).not.toBe(item.params.den)
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    // `difficultyForSuccess` returns anything in 0..99, fractional. Throwing
    // here would crash a match for the lowest-rated player.
    expect(mt4nf3.generate(0, makeRng(4)).difficulty).toBe(5)
    expect(mt4nf3.generate(99, makeRng(4)).difficulty).toBe(80)
    expect(mt4nf3.generate(37.4, makeRng(4)).difficulty).toBe(37.4)
  })

  it('makes the hardest band cross a whole one or need simplifying', () => {
    for (const item of itemsAt(HARDEST)) {
      const { n1, n2, den, op } = item.params as Record<string, number>
      const raw = op === ADD ? n1! + n2! : n1! - n2!
      const crosses = raw >= den!
      const simplifies = new R(raw, den!).d !== den
      expect(crosses || simplifies, `${item.prompt} is neither`).toBe(true)
    }
  })

  it('keeps the easiest band inside one whole', () => {
    for (const item of itemsAt(EASIEST)) {
      const { n1, n2, den, op } = item.params as Record<string, number>
      const raw = op === ADD ? n1! + n2! : n1! - n2!
      expect(new R(raw, den!).compare(new R(1)), item.prompt).toBeLessThanOrEqual(0)
    }
  })

  it('is worth reading out loud: every worked step is a finished sentence', () => {
    // Cheap proxy for the thing that actually matters, which is that these are
    // sentences. Every wording bug in this file was caught by reading them out;
    // this at least stops a fragment being pasted in. Some steps ask a question
    // — "3 plus what makes 7?" — which is why both endings count.
    for (const item of everyItem()) {
      for (const step of item.workedSteps) {
        const end = step.trim().slice(-1)
        expect(['.', '?'], `"${step}" on ${item.prompt}`).toContain(end)
      }
    }
  })

  it('reads the missing-first subtraction the way it has to be solved', () => {
    const item = firstItem(60, MISSING_FIRST, 0)
    const { n1, n2, total, den } = item.params as Record<string, number>
    expect(item.prompt).toContain(`? ${MINUS} ${n2}/${den} = ${total}/${den}`)
    // Adding back is the whole insight, so it has to be in the steps in words.
    expect(item.workedSteps.join(' ')).toContain(`${total} + ${n2} = ${n1}`)
  })
})
