import { describe, expect, it } from 'vitest'
import { assertGeneratorSound } from './harness'
import { trueFalse } from '../answer'
import type { Item, ItemGenerator, Rng } from './types'

/**
 * Tests for the thing that tests everything else.
 *
 * The harness is the reason a wrong answer key is a property rather than an
 * intention, so a harness that silently stopped checking would be the worst
 * possible failure in this repo — every generator would keep passing. These
 * build deliberately broken generators and demand it notices.
 *
 * Only the choice-specific checks are covered here. The rational ones have been
 * exercised by thirteen real generators for months, and one of them has already
 * caught a wrong key at a single difficulty and seed.
 */

const STANDARD = 'FLU.MULT'

/**
 * A minimally sound choice item, which each test below then breaks.
 *
 * `n` varies the prompt because the harness also insists a generator produce
 * more than one distinct question across its seeds — a fixture that always asked
 * the same thing failed on that before reaching any of the choice checks.
 */
function goodItem(difficulty: number, n: number, over: Partial<Item> = {}): Item {
  return {
    standardId: STANDARD,
    difficulty,
    prompt: `Is ${n * 2} an even number?`,
    answer: trueFalse(true),
    workedSteps: [`${n * 2} ends in an even digit, so it is even.`],
    misconceptions: [
      {
        id: 'thinks-odd',
        signature: 'False',
        label: 'called an even number odd',
        explanation: 'Look at the last digit: 8 is even, so 8 is even.',
      },
    ],
    params: { n },
    ...over,
  }
}

const RANGE: [number, number] = [10, 12]

/**
 * The harness also probes difficulties outside the declared range — selection
 * hands out fractional values anywhere in 0..99 — and expects the generator to
 * clamp rather than echo them back. Real generators do; the fixture has to too,
 * or it fails on that before reaching any choice check.
 */
function generatorOf(build: (difficulty: number, rng: Rng) => Item): ItemGenerator {
  const clamp = (d: number) =>
    Math.min(RANGE[1], Math.max(RANGE[0], Number.isFinite(d) ? Math.round(d) : RANGE[0]))
  return {
    standardId: STANDARD,
    label: 'probe',
    range: RANGE,
    generate: (d, rng) => build(clamp(d), rng),
  }
}

/** The correct option's text, which is what `verify` returns for a choice. */
const verifyTrue = () => 'True'

describe('the harness on a sound choice generator', () => {
  it('passes', () => {
    expect(() =>
      assertGeneratorSound(generatorOf((d, rng) => goodItem(d, rng.int(1, 50))), verifyTrue),
    ).not.toThrow()
  })
})

describe('the harness on a broken choice generator', () => {
  const breaks = (over: Partial<Item>, verify = verifyTrue) => () =>
    assertGeneratorSound(
      generatorOf((d, rng) => goodItem(d, rng.int(1, 50), over)),
      verify,
    )

  it('catches two options that mean the same number', () => {
    // The catastrophic one, and the only one grading-by-index cannot see. A
    // child picking `6/1` has answered correctly and would be told he had not.
    expect(
      breaks({
        prompt: 'How many sixes are in 36 divided by 6?',
        answer: { kind: 'choice', options: ['6', '6/1'], correct: 0 },
        misconceptions: [
          { id: 'x', signature: '6/1', label: 'l', explanation: 'e' },
        ],
      }, () => '6'),
    ).toThrow(/same number/)
  })

  it('catches a decimal and a fraction that are the same value', () => {
    expect(
      breaks({
        answer: { kind: 'choice', options: ['1/2', '0.5', '3/4'], correct: 2 },
        misconceptions: [{ id: 'x', signature: '1/2', label: 'l', explanation: 'e' }],
      }, () => '3/4'),
    ).toThrow(/same number/)
  })

  it('catches a single option', () => {
    expect(
      breaks({
        answer: { kind: 'choice', options: ['True'], correct: 0 },
        misconceptions: [{ id: 'x', signature: 'True', label: 'l', explanation: 'e' }],
      }),
    ).toThrow()
  })

  it('catches a key pointing past the options', () => {
    expect(
      breaks({ answer: { kind: 'choice', options: ['True', 'False'], correct: 2 } }),
    ).toThrow()
  })

  it('catches duplicate option text', () => {
    expect(
      breaks({
        answer: { kind: 'choice', options: ['True', 'True'], correct: 0 },
        misconceptions: [{ id: 'x', signature: 'False', label: 'l', explanation: 'e' }],
      }),
    ).toThrow(/duplicate option/)
  })

  it('catches a blank option', () => {
    expect(
      breaks({
        answer: { kind: 'choice', options: ['True', '  '], correct: 0 },
        misconceptions: [{ id: 'x', signature: 'False', label: 'l', explanation: 'e' }],
      }),
    ).toThrow(/blank option/)
  })

  it('catches a distractor that is not one of the options', () => {
    // Dead code that looks like coverage: a signature no child can ever produce
    // means the misconception never fires.
    expect(
      breaks({
        misconceptions: [{ id: 'x', signature: 'Maybe', label: 'l', explanation: 'e' }],
      }),
    ).toThrow(/unparseable/)
  })

  it('catches a distractor that names the correct option', () => {
    expect(
      breaks({
        misconceptions: [{ id: 'x', signature: 'True', label: 'l', explanation: 'e' }],
      }),
    ).toThrow(/equals the correct answer/)
  })

  it('catches an independent recomputation that disagrees', () => {
    // The check the whole file exists for, on the choice path.
    expect(breaks({}, () => 'False')).toThrow(/disagrees with independent/)
  })

  it('catches a slot on a choice item', () => {
    expect(breaks({ promptWithSlot: 'Is 8 {} even?' })).toThrow(/promptWithSlot/)
  })

  it('still catches the ordinary things', () => {
    expect(breaks({ workedSteps: [] })).toThrow(/no worked steps/)
    expect(breaks({ prompt: '   ' })).toThrow(/prompt empty/)
    expect(breaks({ misconceptions: [] })).toThrow(/no misconceptions/)
  })
})
