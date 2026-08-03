import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { CONTEXTS, mt4md3 } from './mt4md3'

const TIMES = '×'

/** Redeclared rather than imported: a mismatch with the generator is a bug this file should catch. */
const PERIMETER = 0
const AREA = 1

const EASIEST = 14
const HARDEST = 86

/**
 * Independent of the generator: both formulas taken apart into what they mean.
 *
 * Area is not `w * h` here. It is a rectangle of squares, counted a row at a
 * time — `h` rows with `w` squares in each — which is where the formula comes
 * from and is the only reason it is true.
 *
 * Perimeter is not `2 * (w + h)` here. It is the four sides walked one at a
 * time and added up, which is what "the distance all the way round" means. A
 * generator that had doubled the wrong thing would agree with `2 * (w + h)`
 * written twice and disagree with this.
 */
function rectangleAnswer(p: Record<string, number>): string {
  const w = p.w!
  const h = p.h!

  if (p.ask === AREA) {
    let squares = 0
    for (let row = 0; row < h; row++) squares += w
    return String(squares)
  }

  const sides = [w, h, w, h]
  let around = 0
  for (const side of sides) around += side
  return String(around)
}

function rebuildPrompt(p: Record<string, number>): string {
  const context = CONTEXTS[p.context!]!
  const question = p.ask === AREA ? context.area : context.perimeter
  return `${context.subject} is ${p.w} ${context.units} long and ${p.h} ${context.units} wide. ${question}`
}

function itemsAt(difficulty: number, seeds = 120) {
  return Array.from({ length: seeds }, (_, s) => mt4md3.generate(difficulty, makeRng(s)))
}

describe('MT.4.MD.3 area and perimeter of rectangles', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4md3, rectangleAnswer, { promptParams: ['w', 'h'], rebuildPrompt })
  })

  it('asks for area or perimeter, one per item, and says which', () => {
    // "Give the dimensions" is not a question `AnswerSpec` can grade. Each item
    // asks for one value and the wording says which one it wants.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        expect([AREA, PERIMETER], item.prompt).toContain(item.params.ask)
        const context = CONTEXTS[item.params.context!]!
        expect(item.prompt, item.prompt).toContain(
          item.params.ask === AREA ? context.area : context.perimeter,
        )
      }
    }
  })

  it('never asks about a rectangle whose area and perimeter are the same number', () => {
    // 3 by 6 has an area of 18 and a perimeter of 18, and so does 4 by 4.
    // Confusing the two is *the* mistake on this standard and has to be
    // nameable on every item — which it cannot be when both come to the same
    // number, because then naming it would mean calling a correct answer a
    // known error. Kept out of the pool rather than handled afterwards.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { w, h } = item.params as Record<string, number>
        expect(w! * h!, item.prompt).not.toBe(2 * (w! + h!))
      }
    }
  })

  it('never writes a rectangle as wider than it is long, or as thin as a line', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const { w, h } = item.params as Record<string, number>
        expect(w, item.prompt).toBeGreaterThanOrEqual(h!)
        // Never 1, so "3 meters" is always plural and the shape is always a
        // rectangle a child can picture.
        expect(h, item.prompt).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('grows the rectangle with difficulty', () => {
    const biggest = (d: number): number => Math.max(...itemsAt(d).map((i) => i.params.w!))
    expect(biggest(EASIEST)).toBeLessThanOrEqual(9)
    expect(biggest(HARDEST)).toBeGreaterThan(20)
  })

  it('puts the rectangle in a real context, not only on a page', () => {
    // "including problems in context" is in the standard by name.
    const used = new Set<number>()
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) used.add(item.params.context!)
    }
    expect(used.size, 'only one context ever used').toBeGreaterThan(1)
    expect([...used].some((c) => CONTEXTS[c]!.subject !== 'A rectangle'), 'no worded problems').toBe(
      true,
    )
  })

  it('names giving the perimeter when the question asked for the area', () => {
    // The classic on this standard. It must be present on every area item.
    let named = 0
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.ask !== AREA) continue
        const { w, h } = item.params as Record<string, number>
        const m = item.misconceptions.find((x) => x.id === 'gave-the-perimeter')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(2 * (w! + h!)))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names giving the area when the question asked for the perimeter', () => {
    let named = 0
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.ask !== PERIMETER) continue
        const { w, h } = item.params as Record<string, number>
        const m = item.misconceptions.find((x) => x.id === 'gave-the-area')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(w! * h!))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names adding the length and the width and stopping there', () => {
    let named = 0
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        if (item.params.ask !== PERIMETER) continue
        const { w, h } = item.params as Record<string, number>
        const m = item.misconceptions.find((x) => x.id === 'added-two-sides-only')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String(w! + h!))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('shows the rows for an area and the four sides for a perimeter', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 30)) {
        const { w, h, ask } = item.params as Record<string, number>
        const steps = item.workedSteps.join(' ')
        if (ask === AREA) {
          expect(steps, item.prompt).toContain(`${w} ${TIMES} ${h} = ${w! * h!}`)
          expect(steps, item.prompt).toContain(`rows of ${w}`)
        } else {
          expect(steps, item.prompt).toContain(`${w} + ${h} + ${w} + ${h} = ${2 * (w! + h!)}`)
        }
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          item.answer.canonical,
        )
      }
    }
  })

  it('agrees in number everywhere a child reads', () => {
    const singulars = ['row', 'side', 'square']
    const plurals = ['rows', 'sides', 'squares']
    for (let d = EASIEST; d <= HARDEST; d += 2) {
      for (const item of itemsAt(d, 30)) {
        const text = [
          item.prompt,
          ...item.workedSteps,
          ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
        ].join('\n')

        for (const { units, unit } of CONTEXTS) {
          for (const m of text.matchAll(new RegExp(`(\\d+) ${unit}\\b`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).toBe('1')
          }
          for (const m of text.matchAll(new RegExp(`(\\d+) ${units}\\b`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
          }
        }
        for (const word of plurals) {
          for (const m of text.matchAll(new RegExp(`(\\d+) ${word}\\b`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
          }
        }
        // `square` is an adjective in "48 square meters" and a noun in "5
        // squares in each row". Only the noun has a plural to get wrong, so the
        // unit phrase is excluded rather than counted as a false alarm.
        const unitWords = [...new Set(CONTEXTS.map((c) => c.units))].join('|')
        for (const word of singulars) {
          for (const m of text.matchAll(new RegExp(`(\\d+) ${word}\\b(?! (${unitWords}))`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).toBe('1')
          }
        }
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4md3.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4md3.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4md3.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4md3.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4md3.generate(62.1, makeRng(4)).difficulty).toBe(62.1)
  })
})
