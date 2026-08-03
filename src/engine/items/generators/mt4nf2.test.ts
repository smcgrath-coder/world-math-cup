import { describe, expect, it } from 'vitest'
import { Rational as R } from '../../rational'
import { makeRng } from '../rng'
import { assertGeneratorSound } from '../harness'
import { mt4nf2 } from './mt4nf2'

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Independent of the generator: the standard's own first method, done in whole
 * numbers.
 *
 * "Compare two fractions ... by creating common denominators". So put both over
 * the least common denominator and compare the two top numbers as integers.
 * This touches no `Rational` method at all — in particular not `compare`, which
 * is what the generator uses, and whose body (`n1 × d2 − n2 × d1`) is exactly
 * the cross-multiplication shortcut a lazy `verify` would reach for. Expanding
 * to the LCM first is a different computation reaching the same truth.
 */
const answerFrom = (p: Record<string, number>) => {
  const { n1, d1, n2, d2 } = p as { n1: number; d1: number; n2: number; d2: number }
  const common = (d1 * d2) / gcd(d1, d2)
  const left = n1 * (common / d1)
  const right = n2 * (common / d2)
  return left > right ? `${n1}/${d1}` : `${n2}/${d2}`
}

/** Every item at `difficulty` over a fixed span of seeds. */
function itemsAt(difficulty: number, seeds = 100) {
  return Array.from({ length: seeds }, (_, s) => mt4nf2.generate(difficulty, makeRng(s)))
}

/** -1, 0 or 1 as the fraction is below, exactly on, or above one half. */
function versusHalf(n: number, d: number): number {
  return Math.sign(n * 2 - d)
}

const EASIEST = 8
const HARDEST = 78

describe('MT.4.NF.2 comparing two fractions', () => {
  it('is sound across its full range', () => {
    assertGeneratorSound(mt4nf2, answerFrom, {
      promptParams: ['n1', 'd1', 'n2', 'd2'],
      rebuildPrompt: (p) => `Which is greater: ${p.n1}/${p.d1} or ${p.n2}/${p.d2}?`,
    })
  })

  it('never asks him to compare two fractions that are equal', () => {
    // The prompt promises one of them is greater. If they were equal there
    // would be no right answer at all, and he would be marked wrong whatever
    // he typed.
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 60)) {
        const { n1, d1, n2, d2 } = item.params as Record<string, number>
        expect(new R(n1!, d1!).equals(new R(n2!, d2!)), item.prompt).toBe(false)
      }
    }
  })

  it('always uses different numerators and different denominators', () => {
    // The standard asks for exactly this. Matching either number turns the
    // question into a one-glance comparison and stops testing the standard.
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 60)) {
        const { n1, d1, n2, d2 } = item.params as Record<string, number>
        expect(n1, item.prompt).not.toBe(n2)
        expect(d1, item.prompt).not.toBe(d2)
      }
    }
  })

  it('shows both fractions proper and in lowest terms', () => {
    // He is asked to type one of the two back. If a displayed fraction were not
    // in lowest terms, copying it exactly would trip the "unreduced" nudge on
    // an answer the question told him to give.
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 60)) {
        const { n1, d1, n2, d2 } = item.params as Record<string, number>
        expect(gcd(n1!, d1!), item.prompt).toBe(1)
        expect(gcd(n2!, d2!), item.prompt).toBe(1)
        expect(n1, item.prompt).toBeLessThan(d1!)
        expect(n2, item.prompt).toBeLessThan(d2!)
      }
    }
  })

  it('answers with one of the two fractions on screen', () => {
    for (const item of itemsAt(45)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect([`${n1}/${d1}`, `${n2}/${d2}`], item.prompt).toContain(item.answer.canonical)
    }
  })

  it('lets the half benchmark settle every question in the easiest band', () => {
    // Band one exists to reward "is it more or less than a half?", so the two
    // fractions always land on opposite sides of it.
    for (const item of itemsAt(EASIEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(versusHalf(n1!, d1!), item.prompt).not.toBe(versusHalf(n2!, d2!))
    }
  })

  it('keeps the easiest band on denominators that go into each other', () => {
    for (const item of itemsAt(EASIEST)) {
      const { d1, d2 } = item.params as Record<string, number>
      expect(d1! % d2! === 0 || d2! % d1! === 0, item.prompt).toBe(true)
    }
  })

  it('denies the half benchmark in the hardest band', () => {
    // Both above a half, or both below it, so the shortcut cannot decide and
    // he has to actually make common denominators.
    for (const item of itemsAt(HARDEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(versusHalf(n1!, d1!), item.prompt).toBe(versusHalf(n2!, d2!))
      expect(versusHalf(n1!, d1!), item.prompt).not.toBe(0)
    }
  })

  it('makes the hardest band share no factor and stay close together', () => {
    for (const item of itemsAt(HARDEST)) {
      const { n1, d1, n2, d2 } = item.params as Record<string, number>
      expect(gcd(d1!, d2!), item.prompt).toBe(1)
      const gap = new R(n1!, d1!).sub(new R(n2!, d2!))
      expect(Math.abs(gap.toNumber()), item.prompt).toBeLessThanOrEqual(1 / 8)
    }
  })

  it('names the smaller fraction as the one wrong answer there is', () => {
    // With two fractions on screen and one of them wanted back, there is
    // exactly one wrong value a child can mean to type. Naming two mistakes
    // would mean two names for the same answer, which is a coin flip dressed
    // up as a diagnosis.
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 40)) {
        const { n1, d1, n2, d2 } = item.params as Record<string, number>
        const correct = answerFrom(item.params)
        const loser = correct === `${n1}/${d1}` ? `${n2}/${d2}` : `${n1}/${d1}`
        expect(item.misconceptions, item.prompt).toHaveLength(1)
        expect(item.misconceptions[0]!.signature, item.prompt).toBe(loser)
      }
    }
  })

  it('blames the bottom number only when the bottom number is the trap', () => {
    // "Bigger bottom number means bigger fraction" is only a live explanation
    // when the smaller fraction is the one with the bigger denominator.
    let denominatorTraps = 0
    let noTrap = 0
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 40)) {
        const { n1, d1, d2 } = item.params as Record<string, number>
        const correct = answerFrom(item.params)
        const loserIsFirst = correct !== `${n1}/${d1}`
        const loserDen = loserIsFirst ? d1! : d2!
        const winnerDen = loserIsFirst ? d2! : d1!
        const id = item.misconceptions[0]!.id

        if (loserDen > winnerDen) {
          denominatorTraps++
          expect(['bigger-denominator-wins', 'bigger-numbers-win'], item.prompt).toContain(id)
        } else {
          noTrap++
          expect(id, item.prompt).toBe('picked-the-smaller')
        }
      }
    }
    // Both shapes have to actually occur, or one of these branches is dead code
    // that the test is quietly certifying.
    expect(denominatorTraps).toBeGreaterThan(0)
    expect(noTrap).toBeGreaterThan(0)
  })

  it('calls it whole-number thinking only when both of the losing numbers are bigger', () => {
    let seen = 0
    for (let d = EASIEST; d <= HARDEST; d += 5) {
      for (const item of itemsAt(d, 40)) {
        const { n1, d1, n2, d2 } = item.params as Record<string, number>
        const correct = answerFrom(item.params)
        const loserIsFirst = correct !== `${n1}/${d1}`
        const loser = loserIsFirst ? [n1!, d1!] : [n2!, d2!]
        const winner = loserIsFirst ? [n2!, d2!] : [n1!, d1!]
        const bothBigger = loser[0]! > winner[0]! && loser[1]! > winner[1]!
        if (item.misconceptions[0]!.id === 'bigger-numbers-win') {
          seen++
          expect(bothBigger, item.prompt).toBe(true)
        } else {
          expect(bothBigger, item.prompt).toBe(false)
        }
      }
    }
    expect(seen, 'whole-number thinking never came up').toBeGreaterThan(0)
  })

  it('clamps difficulties outside its range instead of throwing', () => {
    expect(mt4nf2.generate(0, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf2.generate(99, makeRng(4)).difficulty).toBe(HARDEST)
    expect(mt4nf2.generate(-8, makeRng(4)).difficulty).toBe(EASIEST)
    expect(mt4nf2.generate(52.3, makeRng(4)).difficulty).toBe(52.3)
  })
})
