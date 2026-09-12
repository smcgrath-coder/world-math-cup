import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from '../harness'
import { makeRng } from '../rng'
import { factItem, flumult, generateFact } from './flumult'
import { canonicalOf } from '../../answer'
const TIMES = '×'

const EASIEST = 8
const HARDEST = 88

/**
 * Independent of the generator: multiplication done as counting.
 *
 * `a × b` is `a` groups of `b`, so this puts `b` down `a` times and adds. The
 * multiplication operator never appears. A generator that had its factors the
 * wrong way round would still agree with `a * b` written twice, and a table of
 * facts with one entry mistyped would agree with itself forever — neither
 * survives being counted out.
 */
function repeatedAddition(p: Record<string, number>): string {
  let total = 0
  for (let i = 0; i < p.a!; i++) total += p.b!
  return String(total)
}

/**
 * How hard a fact is, redeclared here rather than imported.
 *
 * Not used to check any answer — only to check that difficulty moves the
 * generator through the table the way it claims to. Anything times 0 or 1 is an
 * easy fact whatever it is multiplied by; otherwise the tiers are the ones
 * fourth graders actually find easy, middling and hard.
 */
function tier(n: number): number {
  if ([2, 5].includes(n)) return 0
  if ([3, 4, 6, 9].includes(n)) return 1
  return 2
}

/** A fact you get from a rule — anything times 0 or 1 — rather than from memory. */
function isRule(a: number, b: number): boolean {
  return a <= 1 || b <= 1
}

/** Real facts only; rule facts are filtered out before this is asked. */
function hardness(a: number, b: number): number {
  return tier(a) + tier(b)
}
function itemsAt(difficulty: number, seeds = 120) {
  return Array.from({ length: seeds }, (_, s) => flumult.generate(difficulty, makeRng(s)))
}

function everyItem(step = 3, seeds = 60) {
  const out = []
  for (let d = EASIEST; d <= HARDEST; d += step) out.push(...itemsAt(d, seeds))
  return out
}

describe('FLU.MULT multiplication facts', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(flumult, repeatedAddition, {
      promptParams: ['a', 'b'],
      rebuildPrompt: (p) => `${p.a} ${TIMES} ${p.b}`,
    })
  })

  it('stays single digit by single digit, so it never becomes MT.4.NBT.5', () => {
    // The whole reason this generator exists separately is that PAC measures
    // recall and DEF measures method. MT.4.NBT.5 starts at two-digit by
    // one-digit; the moment a 10, 11 or 12 appeared here the two ratings would
    // be measuring the same thing and PAC would stop meaning "knows it by
    // heart".
    for (const item of everyItem()) {
      expect(item.params.a, item.prompt).toBeGreaterThanOrEqual(0)
      expect(item.params.a, item.prompt).toBeLessThanOrEqual(9)
      expect(item.params.b, item.prompt).toBeGreaterThanOrEqual(0)
      expect(item.params.b, item.prompt).toBeLessThanOrEqual(9)
    }
  })

  it('never asks 0 × 0', () => {
    // The one fact in the table where every mistake worth naming lands on 0,
    // which is also the answer. An item there could only ever say "wrong" with
    // nothing to add, so it is filtered out of the pool instead.
    for (const item of everyItem(1, 80)) {
      expect(item.params.a === 0 && item.params.b === 0, item.prompt).toBe(false)
    }
  })

  it('bands by how hard the fact is, not by how big the numbers are', () => {
    // 2 × 9 is a bigger sum than 7 × 8 and a much easier fact. With only 81
    // facts in the whole pool, sorting them by size would put the ones he
    // already knows at the top of the difficulty range.
    const realFactsAt = (d: number) => itemsAt(d).filter((i) => !isRule(i.params.a!, i.params.b!))
    const hardestAt = (d: number) => Math.max(...realFactsAt(d).map((i) => hardness(i.params.a!, i.params.b!)))
    const easiestAt = (d: number) => Math.min(...realFactsAt(d).map((i) => hardness(i.params.a!, i.params.b!)))

    // The bottom band is the twos and fives, on their own and against the
    // middling row — never a seven or an eight.
    expect(hardestAt(EASIEST)).toBeLessThanOrEqual(1)
    expect(easiestAt(HARDEST)).toBeGreaterThanOrEqual(3)
  })

  it('keeps the zero and one facts rare, and out of the top half entirely', () => {
    // Measured before this change: for a player rated 40–60 on this standard,
    // roughly two thirds of the facts served in a match were `0 × n` or
    // `1 × n`, and nine in ten tackle-backs were. A ten-year-old entering fifth
    // grade knows those rows cold; a drill made of them is not a drill. They
    // stay in as an occasional check that the rule is still there, at a share
    // small enough that he cannot settle into it.
    for (const d of [EASIEST, 20, 28]) {
      const items = itemsAt(d, 800)
      const rules = items.filter((i) => isRule(i.params.a!, i.params.b!)).length
      expect(rules / items.length, `share of rule facts at d=${d}`).toBeGreaterThan(0.03)
      expect(rules / items.length, `share of rule facts at d=${d}`).toBeLessThan(0.2)
    }
    for (const d of [50, 60, 70, HARDEST]) {
      for (const item of itemsAt(d, 300)) {
        expect(isRule(item.params.a!, item.params.b!), item.prompt).toBe(false)
      }
    }
  })

  it('can be asked for a real fact only, for a tackle-back', () => {
    // A scaffold is the rung back to the question he missed. `7 × 0` is not a
    // rung to anything, so the tackle-back path asks for the table without its
    // rule rows and must never be handed one.
    for (let d = EASIEST; d <= HARDEST; d += 4) {
      for (let seed = 0; seed < 150; seed++) {
        const item = generateFact(d, makeRng(seed), false)
        expect(isRule(item.params.a!, item.params.b!), item.prompt).toBe(false)
        expect(item.difficulty).toBe(d)
      }
    }
  })

  it('builds a named fact as an item that is sound and pitched where it belongs', () => {
    // The decomposed tackle-back asks the fact from *inside* the question he
    // missed — `347 × 6` becomes `7 × 6` — so the fact is chosen and not drawn.
    for (let a = 0; a <= 9; a++) {
      for (let b = 0; b <= 9; b++) {
        if (a === 0 && b === 0) continue
        const item = factItem(a, b)
        expect(item.prompt).toBe(`${a} ${TIMES} ${b}`)
        expect(item.params).toEqual({ a, b })
        expect(canonicalOf(item.answer)).toBe(repeatedAddition({ a, b }))
        expect(item.standardId).toBe('FLU.MULT')
        expect(item.difficulty).toBeGreaterThanOrEqual(EASIEST)
        expect(item.difficulty).toBeLessThanOrEqual(HARDEST)
        expect(item.misconceptions.length).toBeGreaterThan(0)
        expect(item.workedSteps.length).toBeGreaterThan(0)
      }
    }
    // Pitched by how hard the fact is, so the rating moves by what he actually
    // answered rather than by a label: a seven-times fact sits well above a
    // two-times one.
    expect(factItem(7, 8).difficulty).toBeGreaterThan(factItem(2, 3).difficulty)
    expect(factItem(2, 3).difficulty).toBeGreaterThan(factItem(0, 4).difficulty)
    // And byte-identical to what the generator would emit for the same fact.
    const drawn = flumult.generate(HARDEST, makeRng(3))
    const built = factItem(drawn.params.a!, drawn.params.b!)
    expect({ ...built, difficulty: 0 }).toEqual({ ...drawn, difficulty: 0 })
  })

  it('refuses to build a fact that is not in the table', () => {
    expect(() => factItem(0, 0)).toThrow()
    expect(() => factItem(10, 3)).toThrow()
    expect(() => factItem(3, -1)).toThrow()
    expect(() => factItem(2.5, 3)).toThrow()
  })
  it('drills the facts that are actually hard at the top of the range', () => {
    const facts = new Set(itemsAt(HARDEST, 300).map((i) => `${i.params.a}x${i.params.b}`))
    for (const fact of ['7x8', '8x7', '7x7', '8x8', '6x7', '9x8']) {
      expect(facts.has(fact), `${fact} never drawn at the top of the range`).toBe(true)
    }
    // 9 × 9 = 81 is the biggest product in the whole table and it is not up
    // here, which is the clearest sign that the banding is by fact and not by
    // size: nines have a trick and sevens and eights do not.
    for (const fact of ['2x5', '1x9', '0x4', '9x9']) {
      expect(facts.has(fact), `${fact} is not a hard fact`).toBe(false)
    }
  })

  it('teaches the zero and one facts rather than skipping them', () => {
    const facts = new Set(itemsAt(EASIEST, 300).map((i) => `${i.params.a}x${i.params.b}`))
    expect([...facts].some((f) => f.startsWith('0x') || f.endsWith('x0'))).toBe(true)
    expect([...facts].some((f) => f.startsWith('1x') || f.endsWith('x1'))).toBe(true)
  })

  it('names adding instead of multiplying on the one-times facts', () => {
    // `a × 1` answered as `a + 1` is the real error on this row, and the one
    // that quietly stays wrong for years because the answers look so close.
    let named = 0
    for (const item of everyItem(1, 80)) {
      const { a, b } = item.params as Record<string, number>
      if (b !== 1 || a! < 1) continue
      const m = item.misconceptions.find((x) => x.id === 'added-instead')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(String(a! + 1))
      named++
    }
    expect(named).toBeGreaterThan(0)
  })

  it('names leaving the number alone on the times-zero facts', () => {
    // `7 × 0` answered as `7`. Adding 0 does leave a number alone, which is
    // exactly why this one happens.
    let named = 0
    for (const item of everyItem(1, 80)) {
      const { a, b } = item.params as Record<string, number>
      if (b !== 0 || a! < 1) continue
      const m = item.misconceptions.find((x) => x.id === 'added-instead')
      expect(m, item.prompt).toBeDefined()
      expect(m!.signature, item.prompt).toBe(String(a))
      named++
    }
    expect(named).toBeGreaterThan(0)
  })

  it('never names a mistake that is the right answer, on any fact in the table', () => {
    // Swept rather than sampled. On `a × 0` almost every candidate mistake
    // collapses onto 0, and 0 is the answer; on `2 × 2` adding gives 4, which
    // is also the answer. Both are single squares of an 81-square table, which
    // is exactly the kind of thing a sampled sweep walks past.
    for (const item of everyItem(1, 80)) {
      expect(item.misconceptions.length, item.prompt).toBeGreaterThan(0)
      for (const m of item.misconceptions) {
        expect(m.signature, `${m.id} on "${item.prompt}"`).not.toBe(canonicalOf(item.answer))
        expect(Number(m.signature), `${m.id} on "${item.prompt}"`).toBeGreaterThanOrEqual(0)
      }
    }
  })

  it('agrees in number everywhere a child reads', () => {
    const nouns = [
      ['group', 'groups'],
      ['one', 'ones'],
      ['time', 'times'],
    ]
    for (const item of everyItem(2, 40)) {
      const text = [
        item.prompt,
        ...item.workedSteps,
        ...item.misconceptions.flatMap((m) => [m.label, m.explanation]),
      ].join('\n')

      for (const [one, many] of nouns) {
        for (const m of text.matchAll(new RegExp(`(\\d+) ${many}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).not.toBe('1')
        }
        for (const m of text.matchAll(new RegExp(`(\\d+) ${one}\\b`, 'g'))) {
          expect(m[1], `"${m[0]}" in ${item.prompt}`).toBe('1')
        }
      }
    }
  })

  it('never writes a group count of nought or a negative one', () => {
    // "0 groups of 7, one group short" and "-1 groups" are both things a
    // template can produce on the edge facts without anything else noticing.
    for (const item of everyItem(1, 60)) {
      const text = [...item.workedSteps, ...item.misconceptions.map((m) => m.explanation)].join('\n')
      expect(text, item.prompt).not.toMatch(/\b0 groups?\b/)
      expect(text, item.prompt).not.toMatch(/-\d+ groups?\b/)
    }
  })

  it('finishes the working with the fact written out in full', () => {
    for (const item of everyItem(2, 40)) {
      const { a, b } = item.params as Record<string, number>
      expect(item.workedSteps[item.workedSteps.length - 1], item.prompt).toBe(
        `So ${a} ${TIMES} ${b} = ${canonicalOf(item.answer)}.`,
      )
    }
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(flumult.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(flumult.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(flumult.generate(-40, makeRng(4)).difficulty).toBe(EASIEST)
    expect(flumult.generate(1000, makeRng(4)).difficulty).toBe(HARDEST)
    expect(flumult.generate(47.3, makeRng(4)).difficulty).toBe(47.3)
  })
})
