/**
 * MT.4.NF.3 — adding and subtracting fractions with like denominators.
 *
 * "Understand a fraction a/b with a > 1 as a sum of fractions 1/b." The whole
 * standard rests on one idea: when the pieces are already the same size, only
 * the count changes. Every item here is built to put that idea under pressure
 * and nothing else.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+2212 MINUS SIGN, not the ASCII hyphen.
 *
 * Prompt text is display-only — `checkAnswer` never sees it, so this cannot
 * affect grading either way, and the only question is how it reads to a
 * ten-year-old. A hyphen is short and sits low; set next to a full-height `+`
 * it reads as a stray mark rather than as the operator the question turns on.
 * `normaliseInput` folds U+2212 back to `-` if he ever types one himself.
 */
const MINUS = '−'

const ADD = 1
const RANGE: [number, number] = [5, 80]

/**
 * The four difficulty bands, easiest first.
 *
 * Difficulty means more here than "bigger numbers", because bigger numbers are
 * not what makes this standard hard:
 *
 *  - `sumMayCross` lets a sum pass a whole one (`3/4 + 2/4`). Landing on or
 *    past 1 is the actual content of the standard and is a real step up from
 *    sums that stay inside one whole.
 *  - `firstMayBeImproper` lets subtraction start above a whole (`11/8 - 3/8`),
 *    which is the only way subtraction can reach or cross 1 at all.
 *  - `mustBeInteresting` makes the hardest band always either cross a whole or
 *    need simplifying, so the top of the range is never a bare one-step sum.
 *
 * Denominators stop at 16. The obvious candidate for the hardest band is 100,
 * and it is the wrong choice: `37/100 + 41/100` is no harder as *this* standard
 * — the numerators still just add — while `78/100 -> 39/50` demands spotting a
 * common factor of two two-digit numbers, which is a different skill from a
 * later grade. It would make the top band harder at arithmetic he has not been
 * taught and no harder at the thing being measured, and the rating would then
 * mean something other than what it claims.
 */
const BANDS = [
  { dens: [2, 3, 4], sumMayCross: false, firstMayBeImproper: false, mustBeInteresting: false },
  { dens: [4, 5, 6, 8], sumMayCross: true, firstMayBeImproper: false, mustBeInteresting: false },
  { dens: [6, 8, 10, 12], sumMayCross: true, firstMayBeImproper: true, mustBeInteresting: false },
  { dens: [8, 10, 12, 16], sumMayCross: true, firstMayBeImproper: true, mustBeInteresting: true },
] as const

type Band = (typeof BANDS)[number]

/**
 * The band for a difficulty.
 *
 * Derived from `RANGE` rather than from a hardcoded divisor so the two cannot
 * drift apart, and clamped at both ends. Reading off the end of this table
 * would hand `undefined` to `rng.pick`, which throws — mid-match, on a real
 * difficulty that `difficultyForSuccess` is entitled to produce.
 */
function bandFor(difficulty: number): Band {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  const index = Math.floor(share * BANDS.length)
  return BANDS[Math.max(0, Math.min(BANDS.length - 1, index))]!
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/** The numerators, before any judgement about whether they make a good question. */
function drawTerms(rng: Rng, band: Band, den: number, op: number): [number, number] {
  if (op === ADD) {
    const n1 = rng.int(1, den - 1)
    // Both addends stay inside one whole; only their sum is allowed past it.
    const n2 = band.sumMayCross ? rng.int(1, den - 1) : rng.int(1, den - n1)
    return [n1, n2]
  }
  const maxFirst = band.firstMayBeImproper ? den + Math.floor(den / 2) : den
  const n1 = rng.int(2, maxFirst)
  // Strictly smaller, so the answer is never negative. Negative fractions are
  // years away and a negative answer here would be a question about a topic he
  // has not met, scored against him.
  const n2 = rng.int(1, n1 - 1)
  return [n1, n2]
}

/** Does this question do something — cross a whole one, or need simplifying? */
function isInteresting(n1: number, n2: number, den: number, op: number): boolean {
  const raw = op === ADD ? n1 + n2 : n1 - n2
  return raw >= den || new R(raw, den).d !== den
}

/**
 * Redraws allowed when a band demands an interesting question. Bounded, with
 * whatever came last as the fallback: a generator that can loop forever is a
 * generator that can hang the game.
 */
const MAX_REDRAWS = 24

export const mt4nf3: ItemGenerator = {
  standardId: 'MT.4.NF.3',
  label: 'Adding and subtracting fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = bandFor(d)
    const den = rng.pick(band.dens)
    const op = rng.int(0, 1) // 0 = subtract, 1 = add

    let [n1, n2] = drawTerms(rng, band, den, op)
    if (band.mustBeInteresting) {
      for (let tries = 0; tries < MAX_REDRAWS && !isInteresting(n1, n2, den, op); tries++) {
        ;[n1, n2] = drawTerms(rng, band, den, op)
      }
    }

    const result = op === ADD ? new R(n1, den).add(new R(n2, den)) : new R(n1, den).sub(new R(n2, den))
    const raw = op === ADD ? n1 + n2 : n1 - n2
    const symbol = op === ADD ? '+' : MINUS

    return {
      standardId: 'MT.4.NF.3',
      difficulty: d,
      prompt: `${n1}/${den} ${symbol} ${n2}/${den}`,
      answer: { kind: 'rational', canonical: result.toString() },
      params: { n1, n2, den, op },
      workedSteps: workedSteps(n1, n2, den, op, raw, result),
      misconceptions: misconceptionsFor(n1, n2, den, op, raw, result),
    }
  },
}

function workedSteps(
  n1: number,
  n2: number,
  den: number,
  op: number,
  raw: number,
  result: R,
): string[] {
  const symbol = op === ADD ? '+' : MINUS
  const steps = [
    `Both fractions have ${den} on the bottom, so the pieces are already the same size.`,
    `${op === ADD ? 'Add' : 'Subtract'} the top numbers: ${n1} ${symbol} ${n2} = ${raw}.`,
    `The pieces did not change size, so the bottom number stays ${den}: ${raw}/${den}.`,
  ]

  if (result.d === 1) {
    steps.push(
      `${raw}/${den} is ${raw} pieces out of ${den}, which is exactly ` +
        `${result.n === 1 ? 'one whole' : `${result.n} wholes`}: ${result.toString()}.`,
    )
  } else if (result.d !== den) {
    steps.push(
      `${raw}/${den} is the same amount as ${result.toString()}, and ${result.toString()} is the tidiest way to write it.`,
    )
  }

  return steps
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Explanations are written to be read by a ten-year-old who is already braced
 * for bad news: short sentences, no jargon, and never a word about carelessness.
 * Each one says what he actually did and what it would have been the answer to,
 * because "here is the question you answered" is information and "wrong" is not.
 */
function misconceptionsFor(
  n1: number,
  n2: number,
  den: number,
  op: number,
  raw: number,
  result: R,
): Misconception[] {
  const symbol = op === ADD ? '+' : MINUS
  const candidates: { id: string; value: R; label: string; explanation: string }[] = []

  if (op === ADD) {
    // Adding straight across, top and bottom. The single most common error in
    // fraction arithmetic. It has no subtraction twin: subtracting straight
    // across gives a denominator of den - den = 0, which is not a number, so
    // there is no wrong answer to recognise and this must not be emitted for
    // subtraction items.
    candidates.push({
      id: 'add-across',
      value: new R(n1 + n2, den * 2),
      label: 'Added the bottom numbers too',
      explanation:
        `The bottom number says how big each piece is, not how many you have. ` +
        `Both fractions already have ${den} on the bottom, so the pieces stay that size — ` +
        `only the count changes.`,
    })
  }

  // Answering with the numerator alone: the fraction gets treated as two
  // separate whole numbers and the bottom one gets left behind.
  candidates.push({
    id: 'dropped-denominator',
    value: new R(raw, 1),
    label: 'Left the bottom number off',
    explanation:
      `You counted the pieces right: ${raw}. On its own though, ${raw} means ${raw} whole ` +
      `${raw === 1 ? 'one' : 'ones'}, which is far bigger. Keep the bottom number with it: ${raw}/${den}.`,
  })

  // Reading the sign the other way. Not a misunderstanding of fractions at all,
  // which is exactly why it is worth naming: the fraction work was right.
  //
  // The subtraction case uses the absolute difference on purpose. A child who
  // subtracts when the sign said add takes the smaller number from the larger
  // whichever way round they are written — nobody answers `-1/3`, so a signed
  // signature would be a misconception that never once matches what he types.
  candidates.push({
    id: 'wrong-operation',
    value: new R(op === ADD ? Math.abs(n1 - n2) : n1 + n2, den),
    label: `${op === ADD ? 'Subtracted' : 'Added'} instead`,
    explanation:
      op === ADD
        ? `That is what is left after taking one of these away from the other. This one says ` +
          `${symbol}, so the pieces join together and the answer comes out bigger, not smaller.`
        : `That is what you get by adding them. This one says ${symbol}, so pieces get taken ` +
          `away and the answer comes out smaller, not bigger.`,
  })

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake.
    if (c.value.equals(result)) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
