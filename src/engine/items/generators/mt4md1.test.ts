import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { UNITS, mt4md1 } from './mt4md1'
import { canonicalOf } from '../../answer'
import type { Item } from '../types'

const TIMES = '×'
const EASIEST = 10
const HARDEST = 80

/**
 * Independent of the generator: the ladder of units, one rung at a time.
 *
 * The generator holds a flat table saying a metre is a hundred centimetres.
 * This holds no such table. It holds the rungs — a centimetre is ten
 * millimetres, a decimetre is ten centimetres, a metre is ten decimetres — and
 * walks between two units multiplying rung by rung, so a metre comes out as a
 * hundred centimetres because ten tens is a hundred, which is the actual reason.
 * The intermediate rungs are units the generator never mentions, which is the
 * point: the two sides do not share a single conversion figure.
 *
 * Every multiplication in here is repeated addition, so no factor is ever
 * asserted, only built.
 */
const CHAINS: { units: string[]; steps: number[] }[] = [
  {
    units: ['kilometer', 'hectometer', 'decameter', 'meter', 'decimeter', 'centimeter', 'millimeter'],
    steps: [10, 10, 10, 10, 10, 10],
  },
  {
    units: ['kilogram', 'hectogram', 'decagram', 'gram', 'decigram', 'centigram', 'milligram'],
    steps: [10, 10, 10, 10, 10, 10],
  },
  {
    units: ['kiloliter', 'hectoliter', 'decaliter', 'liter', 'deciliter', 'centiliter', 'milliliter'],
    steps: [10, 10, 10, 10, 10, 10],
  },
  { units: ['week', 'day', 'hour', 'minute', 'second'], steps: [7, 24, 60, 60] },
  { units: ['yard', 'foot', 'inch'], steps: [3, 12] },
  { units: ['pound', 'ounce'], steps: [16] },
  { units: ['gallon', 'quart', 'pint', 'cup'], steps: [4, 2, 2] },
]

/** `value` taken `by` times, by adding it up. Nothing here multiplies. */
function taken(value: number, by: number): number {
  let total = 0
  for (let i = 0; i < by; i++) total += value
  return total
}

function factorBetween(from: string, to: string): number {
  for (const chain of CHAINS) {
    const a = chain.units.indexOf(from)
    const b = chain.units.indexOf(to)
    if (a === -1 || b === -1 || b <= a) continue
    let factor = 1
    for (let i = a; i < b; i++) factor = taken(factor, chain.steps[i]!)
    return factor
  }
  throw new Error(`no chain runs from ${from} down to ${to}`)
}

function conversionAnswer(p: Record<string, number>): string {
  const from = UNITS[p.from!]!
  const to = UNITS[p.to!]!
  // A chain only ever runs from a larger unit down to a smaller one, so a
  // conversion pointing the wrong way has no route and throws rather than
  // quietly agreeing.
  const factor = factorBetween(from.one, to.one)
  return String(taken(factor, p.quantity!))
}

function amount(n: number, unit: { one: string; many: string }): string {
  return `${n} ${n === 1 ? unit.one : unit.many}`
}

function rebuildPrompt(p: Record<string, number>): string {
  return `How many ${UNITS[p.to!]!.many} are in ${amount(p.quantity!, UNITS[p.from!]!)}?`
}

function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4md1.generate(difficulty, makeRng(s)))
}

function allText(item: {
  prompt: string
  workedSteps: string[]
  misconceptions: { label: string; explanation: string }[]
}): string {
  return [
    item.prompt,
    ...item.workedSteps,
    ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
  ].join('\n')
}

describe('MT.4.MD.1 units within one system', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4md1, conversionAnswer, { promptParams: ['quantity'], rebuildPrompt })
  })

  it('always goes from a larger unit to a smaller one', () => {
    // The standard says "express measurements of a larger unit in terms of a
    // smaller unit", and it is also the direction that makes sense at this age:
    // the answer stays a whole number.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        expect(Number(canonicalOf(item.answer)), item.prompt).toBeGreaterThan(item.params.quantity!)
      }
    }
  })

  it('keeps every answer a whole number, and unitless', () => {
    // Units are stripped from what he types by `normaliseInput`, so the key
    // itself must carry none — a key of "300 cm" could never be matched.
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        expect(canonicalOf(item.answer), item.prompt).toMatch(/^\d+$/)
      }
    }
  })

  it('never asks about a single unit, so the plural is always right', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        expect(item.params.quantity, item.prompt).toBeGreaterThanOrEqual(2)
      }
    }
  })

  it('covers length, mass, volume and time', () => {
    const attribute = (unit: string): string => {
      if (['millimeter', 'centimeter', 'meter', 'kilometer', 'inch', 'foot', 'yard'].includes(unit)) return 'length'
      if (['milligram', 'gram', 'kilogram', 'ounce', 'pound'].includes(unit)) return 'mass'
      if (['milliliter', 'liter', 'cup', 'pint', 'quart', 'gallon'].includes(unit)) return 'volume'
      return 'time'
    }
    const seen = new Set<string>()
    for (let d = EASIEST; d <= HARDEST; d += 1) {
      for (const item of itemsAt(d, 20)) seen.add(attribute(UNITS[item.params.from!]!.one))
    }
    expect(seen).toEqual(new Set(['length', 'mass', 'volume', 'time']))
  })

  it('uses both measurement systems', () => {
    const customary = ['inch', 'foot', 'yard', 'ounce', 'pound', 'cup', 'pint', 'quart', 'gallon']
    const froms = new Set<string>()
    for (let d = EASIEST; d <= HARDEST; d += 1) {
      for (const item of itemsAt(d, 20)) froms.add(UNITS[item.params.from!]!.one)
    }
    expect([...froms].some((u) => customary.includes(u)), 'no customary units').toBe(true)
    expect([...froms].some((u) => !customary.includes(u)), 'no metric or time units').toBe(true)
  })

  it('starts on the powers of ten and reaches the awkward factors later', () => {
    const factorOf = (item: Item): number =>
      Number(canonicalOf(item.answer)) / item.params.quantity!

    for (const item of itemsAt(EASIEST)) {
      expect([10, 100, 1000], item.prompt).toContain(factorOf(item))
    }
    const hard = new Set(itemsAt(HARDEST).map(factorOf))
    expect([...hard].some((f) => ![10, 100, 1000].includes(f)), 'top band is all powers of ten').toBe(
      true,
    )
  })

  it('names slipping a power of ten', () => {
    // The commonest conversion error there is: the method is right and the
    // place value slipped.
    let named = 0
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const quantity = item.params.quantity!
        const factor = Number(canonicalOf(item.answer)) / quantity
        if (![100, 1000].includes(factor)) continue
        const m = item.misconceptions.find((x) => x.id === 'one-power-short')
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        expect(m!.signature, item.prompt).toBe(String((quantity * factor) / 10))
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names going the wrong way and dividing', () => {
    let named = 0
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 40)) {
        const m = item.misconceptions.find((x) => x.id === 'divided-instead-of-multiplying')
        // Only skipped when dividing happens to land on the right answer, which
        // it never can here — the factor is always more than 1.
        expect(m, `d=${d} ${item.prompt}`).toBeDefined()
        named++
      }
    }
    expect(named).toBeGreaterThan(0)
  })

  it('says how big one of the larger units is, in the worked steps', () => {
    for (let d = EASIEST; d <= HARDEST; d += 3) {
      for (const item of itemsAt(d, 30)) {
        const from = UNITS[item.params.from!]!
        const to = UNITS[item.params.to!]!
        const factor = Number(canonicalOf(item.answer)) / item.params.quantity!
        const steps = item.workedSteps.join(' ')
        expect(steps, item.prompt).toContain(`1 ${from.one} is ${amount(factor, to)}`)
        expect(steps, item.prompt).toContain(
          `${item.params.quantity} ${TIMES} ${factor} = ${canonicalOf(item.answer)}`,
        )
        expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toContain(
          canonicalOf(item.answer),
        )
      }
    }
  })

  it('agrees in number everywhere a child reads', () => {
    // "1 feet" and "3 foot" are the failure mode nothing else in here can see:
    // every number is right and the sentence is still wrong.
    for (let d = EASIEST; d <= HARDEST; d += 2) {
      for (const item of itemsAt(d, 30)) {
        const text = allText(item)
        for (const { one, many } of UNITS) {
          for (const m of text.matchAll(new RegExp(`(\\d+) ${one}\\b`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).toBe('1')
          }
          for (const m of text.matchAll(new RegExp(`(\\d+) ${many}\\b`, 'g'))) {
            expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
          }
        }
        for (const m of text.matchAll(/(\d+) (lots|zeros|places)\b/g)) {
          expect(m[1], `"${m[0]}" at d=${d}`).not.toBe('1')
        }
        for (const m of text.matchAll(/(\d+) (lot|zero|place)\b/g)) {
          expect(m[1], `"${m[0]}" at d=${d}`).toBe('1')
        }
        // "A yard is bigger than a inch". `an hour` starts with a consonant and
        // `a unit` starts with a vowel, so this cannot be checked by looking at
        // the first letter — the table has to be right.
        for (const { one, article } of UNITS) {
          const wrong = article === 'a' ? 'an' : 'a'
          expect(text, `"${wrong} ${one}" at d=${d}`).not.toMatch(new RegExp(`\\b${wrong} ${one}\\b`, 'i'))
        }
      }
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4md1.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4md1.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4md1.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4md1.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4md1.generate(45.3, makeRng(4)).difficulty).toBe(45.3)
  })
})
