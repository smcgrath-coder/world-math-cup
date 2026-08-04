/**
 * MT.4.NF.1 — equivalent fractions.
 *
 * "Explain why a fraction a/b is equivalent to a fraction (n × a)/(n × b) by
 * using visual fraction models and use this principle to recognize and generate
 * equivalent fractions."
 *
 * Every item is the generating half of that: here is a/b, here is the new bottom
 * number, what goes on top? The one idea under test is that cutting every piece
 * into n smaller ones leaves the amount alone and multiplies the count — which
 * is why the answer is a count, a single whole number, and not a fraction.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

const RANGE: [number, number] = [5, 70]

/**
 * The four difficulty bands, easiest first.
 *
 * Two dials, and they are dials for different reasons:
 *
 *  - `mults` is the real one. 2 and 3 are multipliers a child can see without
 *    working them out; 6, 7 and 8 have to be recovered from the two denominators
 *    first, which is the step this standard is actually about.
 *  - `dens` moves more slowly on purpose. A bigger starting denominator makes
 *    the multiplication heavier without making the *principle* any harder, so it
 *    is a supporting dial rather than the main one.
 *
 * Denominators stop at 12 and multipliers at 8, which caps the new denominator
 * at 96. Past that the question stops being about equivalence and starts being
 * about multiplying two-digit numbers, which is a different standard and would
 * make this rating mean something other than what it claims.
 */
const BANDS = [
  { dens: [2, 3, 4], mults: [2, 3] },
  { dens: [2, 3, 4, 5, 6], mults: [2, 3, 4] },
  { dens: [3, 4, 5, 6, 8], mults: [3, 4, 5, 6] },
  { dens: [4, 5, 6, 8, 10, 12], mults: [5, 6, 7, 8] },
] as const

type Band = (typeof BANDS)[number]

/**
 * The band for a difficulty.
 *
 * Derived from `RANGE` so the two cannot drift apart, and clamped at both ends —
 * reading off the end of this table would hand `undefined` to `rng.pick`, which
 * throws, mid-match, on a difficulty `difficultyForSuccess` is entitled to
 * produce.
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

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/**
 * Every top number that makes a proper fraction in lowest terms over `den`.
 *
 * Built as a list and picked from, rather than drawn and redrawn until it
 * qualifies: there is no loop here to fail to terminate, and `den` is at least 2
 * so the list is never empty.
 *
 * Lowest terms matters. Starting from 2/4 would let him reach the answer by
 * reducing instead of by scaling, so the item would no longer measure the thing
 * it is rated on.
 */
function numeratorsFor(den: number): number[] {
  const out: number[] = []
  for (let n = 1; n < den; n++) if (gcd(n, den) === 1) out.push(n)
  return out
}

export const mt4nf1: ItemGenerator = {
  standardId: 'MT.4.NF.1',
  label: 'Equivalent fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = bandFor(d)
    const b = rng.pick(band.dens)
    const a = rng.pick(numeratorsFor(b))
    const mult = rng.pick(band.mults)
    const targetDen = b * mult
    const answer = a * mult

    return {
      standardId: 'MT.4.NF.1',
      difficulty: d,
      prompt: `${a}/${b} = ?/${targetDen}. What is the missing top number?`,
      // The one thing the sentence cannot do on its own: put the box where the
      // answer belongs. `6/18` is correct mathematics and the wrong answer to
      // the question asked, and an input sitting above `/18` is a better answer
      // to that than any wording is.
      promptWithSlot: `${a}/${b} = {}/${targetDen}`,
      answer: { kind: 'rational', canonical: String(answer) },
      params: { a, b, mult, targetDen },
      workedSteps: workedSteps(a, b, mult, targetDen, answer),
      misconceptions: misconceptionsFor(a, b, mult, targetDen, answer),
    }
  },
}

/** "twice" reads like English; "2 times as many" reads like a spreadsheet. */
function timesAsMany(mult: number): string {
  return mult === 2 ? 'twice as many' : `${mult} times as many`
}

function workedSteps(a: number, b: number, mult: number, targetDen: number, answer: number): string[] {
  return [
    `The bottom number went from ${b} to ${targetDen}. Ask: ${b} times what makes ${targetDen}?`,
    `${b} × ${mult} = ${targetDen}, so each piece got cut into ${mult} smaller ones.`,
    `There are ${timesAsMany(mult)} pieces now, so the top number grows the same way: ` +
      `${mult} × ${a} = ${answer}.`,
    `So ${a}/${b} = ${answer}/${targetDen} — the same amount, just cut into more pieces.`,
  ]
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 */
function misconceptionsFor(
  a: number,
  b: number,
  mult: number,
  targetDen: number,
  answer: number,
): Misconception[] {
  const gap = targetDen - b

  // Ordered by how much each one says about his thinking, because when two land
  // on the same number only the first survives.
  const candidates: { id: string; value: R; label: string; explanation: string }[] = [
    {
      // The documented classic: thinking about the two denominators as a
      // difference rather than as a scaling. Note this can never equal the
      // correct answer — a + (targetDen − b) = a × mult would need a to equal b,
      // and a/b is always a proper fraction — so there is always at least one
      // named mistake on every item.
      id: 'added-difference',
      value: new R(a + gap, 1),
      label: 'Added the same amount to the top',
      explanation:
        `The bottom number went up by ${gap}, so ${gap} went on the top as well. ` +
        `But the bottom did not have ${gap} added to it — it got multiplied by ${mult}. ` +
        `Do the same to the top: ${mult} × ${a} = ${answer}.`,
    },
    {
      id: 'added-multiplier',
      value: new R(a + mult, 1),
      label: 'Added the multiplier instead of multiplying',
      explanation:
        `You found the right multiplier: ${mult}. It just got added instead of multiplied. ` +
        `${a} + ${mult} = ${a + mult}, but ${mult} × ${a} = ${answer}.`,
    },
    {
      id: 'kept-numerator',
      value: new R(a, 1),
      label: 'Left the top number alone',
      explanation:
        `The top number cannot stay ${a}. Cutting a whole into ${targetDen} pieces makes each ` +
        `piece smaller than cutting it into ${b}, so ${a}/${targetDen} is less than ${a}/${b}. ` +
        `Both numbers have to grow together to keep the amount the same.`,
    },
    {
      id: 'answered-multiplier',
      value: new R(mult, 1),
      label: 'Wrote the multiplier itself',
      explanation:
        `${mult} is what you multiply by, not what you end up with. ` +
        `Use it on the top number: ${mult} × ${a} = ${answer}.`,
    },
    {
      // Not a misunderstanding of fractions at all, which is exactly why it is
      // worth naming: he may have had it completely right and simply answered a
      // slightly different question from the one asked.
      id: 'wrote-the-fraction',
      value: new R(a, b),
      label: 'Wrote a fraction instead of the missing number',
      explanation:
        `Careful — this one is only asking for the number that goes in the blank on top. ` +
        `That number is ${answer}, which makes the fraction ${answer}/${targetDen}.`,
    },
  ]

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake.
    if (c.value.n === answer && c.value.d === 1) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
