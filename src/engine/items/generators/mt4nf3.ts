/**
 * MT.4.NF.3 — adding and subtracting fractions with like denominators.
 *
 * "Understand a fraction a/b with a > 1 as a sum of fractions 1/b." The whole
 * standard rests on one idea: when the pieces are already the same size, only
 * the count changes. Every item here is built to put that idea under pressure
 * and nothing else.
 *
 * Five formats. This generator used to emit `3/8 + 1/8` and `3/8 − 1/8` and
 * nothing else, and Rion — ten years old, plays this — said the questions felt
 * repetitive: "the subject might change slightly, but the pattern remained." Two
 * sentences for a whole standard is a pattern, so:
 *
 *  - `BARE` is the sum or difference on its own, as before.
 *  - `MISSING_SECOND` moves the blank into the middle: `3/8 + ? = 7/8`. Component
 *    `MT.4.NF.3.a` is about understanding addition as joining and separating
 *    parts, and a child who can only work left to right has half of that.
 *  - `MISSING_FIRST` puts it at the front: `? − 3/8 = 4/8`. This one is the most
 *    valuable question in the file — the sign says take away and the answer comes
 *    from adding, so it cannot be done by pattern.
 *  - `DECOMPOSE` is `7/8 = 3/8 + ?`, which is component `MT.4.NF.3.b` almost
 *    word for word: decomposing a fraction into a sum of fractions with the same
 *    denominator.
 *  - `WORD` is the same arithmetic in a situation, which is component
 *    `MT.4.NF.3.d`.
 *
 * Formats are banded so the two inverse ones are out of reach at the bottom of
 * the range. Within every band the numeric dials still do the work they always
 * did: format choice is variety, not difficulty.
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

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: the same three numbers make `3/8 + 4/8 = ?` and `3/8 + ? = 7/8`, and
 * those have different answers.
 */
export const BARE = 0
export const MISSING_SECOND = 1
export const MISSING_FIRST = 2
export const DECOMPOSE = 3
export const WORD = 4

const RANGE: [number, number] = [5, 80]

interface Band {
  dens: readonly number[]
  sumMayCross: boolean
  firstMayBeImproper: boolean
  mustBeInteresting: boolean
  formats: readonly number[]
}

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
 *  - `formats` is not a difficulty dial. It is banded only so that the two
 *    inverse framings, which need working backwards from the total, are not the
 *    first thing the lowest-rated player meets.
 *
 * Denominators stop at 16. The obvious candidate for the hardest band is 100,
 * and it is the wrong choice: `37/100 + 41/100` is no harder as *this* standard
 * — the numerators still just add — while `78/100 -> 39/50` demands spotting a
 * common factor of two two-digit numbers, which is a different skill from a
 * later grade. It would make the top band harder at arithmetic he has not been
 * taught and no harder at the thing being measured, and the rating would then
 * mean something other than what it claims.
 */
const BANDS: readonly Band[] = [
  {
    dens: [2, 3, 4],
    sumMayCross: false,
    firstMayBeImproper: false,
    mustBeInteresting: false,
    formats: [BARE, WORD],
  },
  {
    dens: [4, 5, 6, 8],
    sumMayCross: true,
    firstMayBeImproper: false,
    mustBeInteresting: false,
    formats: [BARE, WORD, MISSING_SECOND, DECOMPOSE],
  },
  {
    dens: [6, 8, 10, 12],
    sumMayCross: true,
    firstMayBeImproper: true,
    mustBeInteresting: false,
    formats: [BARE, WORD, MISSING_SECOND, MISSING_FIRST, DECOMPOSE],
  },
  {
    dens: [8, 10, 12, 16],
    sumMayCross: true,
    firstMayBeImproper: true,
    mustBeInteresting: true,
    formats: [BARE, WORD, MISSING_SECOND, MISSING_FIRST, DECOMPOSE],
  },
]

/**
 * What one piece of a whole cut into `den` is called, plural.
 *
 * A table rather than a suffix stuck onto the number, because "8ths of a cup" is
 * the kind of thing a child reads once and stops trusting the rest of the
 * explanation over. Every denominator any band can draw is listed.
 */
const PIECE_NAMES: Record<number, string> = {
  2: 'halves',
  3: 'thirds',
  4: 'fourths',
  5: 'fifths',
  6: 'sixths',
  8: 'eighths',
  10: 'tenths',
  12: 'twelfths',
  16: 'sixteenths',
}

/**
 * A neutral, varied cast. No surnames, no ages, nobody's family, nobody's money.
 * Exported so the soundness test can rebuild a prompt from `params` character
 * for character — which shares the words, never the arithmetic.
 */
export const NAMES: readonly string[] = [
  'Maya',
  'Ravi',
  'Ana',
  'Jonah',
  'Priya',
  'Theo',
  'Nadia',
  'Omar',
  'Iris',
  'Leo',
  'Sofia',
  'Amara',
]

/**
 * Things measured out in cups, meters and pounds, and the unit each takes.
 *
 * All mass nouns, deliberately. "How much flour is left" works and "how much
 * seeds is left" does not, and the frame these sit in asks "how much" every
 * time. Nothing here is money, nobody's weight and nobody's food intake.
 */
export const MATERIALS: readonly { material: string; unit: string; units: string }[] = [
  { material: 'flour', unit: 'cup', units: 'cups' },
  { material: 'sugar', unit: 'cup', units: 'cups' },
  { material: 'milk', unit: 'cup', units: 'cups' },
  { material: 'paint', unit: 'liter', units: 'liters' },
  { material: 'water', unit: 'liter', units: 'liters' },
  { material: 'ribbon', unit: 'meter', units: 'meters' },
  { material: 'string', unit: 'meter', units: 'meters' },
  { material: 'rice', unit: 'pound', units: 'pounds' },
]

/**
 * The band for a difficulty.
 *
 * Derived from `RANGE` rather than from a hardcoded divisor so the two cannot
 * drift apart, and clamped at both ends. Reading off the end of this table
 * would hand `undefined` to `rng.pick`, which throws — mid-match, on a real
 * difficulty that `difficultyForSuccess` is entitled to produce.
 */
function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/** The two counts an item is built from, over a shared denominator. */
interface Terms {
  n1: number
  n2: number
  den: number
}

/** Does this question do something — cross a whole one, or need simplifying? */
function isInteresting({ n1, n2, den }: Terms, op: number): boolean {
  const raw = op === ADD ? n1 + n2 : n1 - n2
  return raw >= den || new R(raw, den).d !== den
}

/**
 * Every legal set of terms for a band and operation, and only the ones this
 * format can actually print.
 *
 * Enumerated and filtered rather than drawn and redrawn. The previous version
 * drew numerators and then redrew up to twenty-four times when the band demanded
 * an interesting question, with "whatever came last" as the fallback — which
 * means that on the combinations where interesting questions are rare it would
 * spend its budget and then emit exactly the dull sum it was told to avoid. A
 * list cannot do that: if a band's promise is satisfiable at all, it holds on
 * every single item.
 *
 * The `WORD` filter is about wording rather than arithmetic. A word problem
 * prints its amounts as "3/8 of a cup" or "11/8 cups", and a numerator equal to
 * the denominator would print "8/8 cups" — true, and something nobody has ever
 * said out loud.
 */
function termsFor(band: Band, op: number, format: number): Terms[] {
  const out: Terms[] = []
  for (const den of band.dens) {
    if (op === ADD) {
      for (let n1 = 1; n1 < den; n1++) {
        // Both addends stay inside one whole; only their sum is allowed past it.
        const most = band.sumMayCross ? den - 1 : den - n1
        for (let n2 = 1; n2 <= most; n2++) out.push({ n1, n2, den })
      }
    } else {
      const maxFirst = band.firstMayBeImproper ? den + Math.floor(den / 2) : den
      for (let n1 = 2; n1 <= maxFirst; n1++) {
        // Strictly smaller, so the answer is never negative. Negative fractions
        // are years away and a negative answer here would be a question about a
        // topic he has not met, scored against him.
        for (let n2 = 1; n2 < n1; n2++) out.push({ n1, n2, den })
      }
    }
  }

  const suited = out.filter((t) => {
    if (band.mustBeInteresting && !isInteresting(t, op)) return false
    if (format === WORD && (t.n1 === t.den || t.n2 === t.den)) return false
    return true
  })
  return suited.length > 0 ? suited : out
}

/**
 * The pool a band, operation and format draw from, built once and reused.
 *
 * A pure function of its three inputs, so caching cannot make the generator
 * non-deterministic.
 */
const POOLS = new Map<string, Terms[]>()

function poolFor(index: number, op: number, format: number): Terms[] {
  const key = `${index}:${op}:${format}`
  const cached = POOLS.get(key)
  if (cached) return cached
  const pool = termsFor(BANDS[index]!, op, format)
  POOLS.set(key, pool)
  return pool
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  /** Canonical answer, already in lowest terms. */
  answer: string
  /** Params this format needs beyond the terms, the operation and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nf3: ItemGenerator = {
  standardId: 'MT.4.NF.3',
  label: 'Adding and subtracting fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const index = bandIndexFor(d)
    const format = rng.pick(BANDS[index]!.formats)
    // Decomposition is a total being split back into its parts. There is no
    // subtraction version of it to draw.
    const op = format === DECOMPOSE ? ADD : rng.int(0, 1)
    const terms = rng.pick(poolFor(index, op, format))

    const draft = draftFor(format, terms, op, rng)

    return {
      standardId: 'MT.4.NF.3',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      answer: { kind: 'rational', canonical: draft.answer },
      params: { ...terms, op, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, terms: Terms, op: number, rng: Rng): Draft {
  switch (format) {
    case MISSING_SECOND:
      return missingSecond(terms, op)
    case MISSING_FIRST:
      return missingFirst(terms, op)
    case DECOMPOSE:
      return decompose(terms)
    case WORD:
      return inContext(terms, op, rng)
    default:
      return bare(terms, op)
  }
}

/** The count the two terms make, before anything is reduced. */
function totalOf({ n1, n2 }: Terms, op: number): number {
  return op === ADD ? n1 + n2 : n1 - n2
}

// ---------------------------------------------------------------------------
// The formats

/** `3/8 + 1/8`. */
function bare(terms: Terms, op: number): Draft {
  const { n1, n2, den } = terms
  const raw = totalOf(terms, op)
  const result = op === ADD ? new R(n1, den).add(new R(n2, den)) : new R(n1, den).sub(new R(n2, den))
  const symbol = op === ADD ? '+' : MINUS

  return {
    prompt: `${n1}/${den} ${symbol} ${n2}/${den}`,
    answer: result.toString(),
    extra: {},
    workedSteps: [
      `Both fractions have ${den} on the bottom, so the pieces are already the same size.`,
      `${op === ADD ? 'Add' : 'Subtract'} the top numbers: ${n1} ${symbol} ${n2} = ${raw}.`,
      `The pieces did not change size, so the bottom number stays ${den}: ${raw}/${den}.`,
      ...tidyStep(raw, den, result),
    ],
    misconceptions: keepUsable(
      [
        ...(op === ADD ? [addAcross(n1, n2, den)] : []),
        droppedDenominator(raw, den),
        {
          // Reading the sign the other way. Not a misunderstanding of fractions
          // at all, which is exactly why it is worth naming: the fraction work
          // was right.
          //
          // The subtraction case uses the absolute difference on purpose. A child
          // who subtracts when the sign said add takes the smaller number from
          // the larger whichever way round they are written — nobody answers
          // `-1/3`, so a signed signature would be a misconception that never
          // once matches what he types.
          id: 'wrong-operation',
          value: new R(op === ADD ? Math.abs(n1 - n2) : n1 + n2, den),
          label: `${op === ADD ? 'Subtracted' : 'Added'} instead`,
          explanation:
            op === ADD
              ? `That is what is left after taking one of these away from the other. This one says ` +
                `${symbol}, so the pieces join together and the answer comes out bigger, not smaller.`
              : `That is what you get by adding them. This one says ${symbol}, so pieces get taken ` +
                `away and the answer comes out smaller, not bigger.`,
        },
      ],
      result,
    ),
  }
}

/** `3/8 + ? = 7/8`, or `7/8 − ? = 3/8`. The blank in the middle. */
function missingSecond(terms: Terms, op: number): Draft {
  const { n1, n2, den } = terms
  const total = totalOf(terms, op)
  const result = new R(n2, den)
  const symbol = op === ADD ? '+' : MINUS

  return {
    prompt: `${n1}/${den} ${symbol} ? = ${total}/${den}. What fraction goes in the blank?`,
    promptWithSlot: `${n1}/${den} ${symbol} {} = ${total}/${den}`,
    answer: result.toString(),
    extra: { total },
    workedSteps: [
      `Every fraction here has ${den} on the bottom, so the pieces are all the same size and ` +
        `only the count changes.`,
      op === ADD
        ? `You have ${pieces(n1)} and you need ${total}. Ask: ${n1} plus what makes ${total}?`
        : `You start with ${pieces(n1)} and end up with ${total}. Ask: what has to come off ` +
          `${n1} to leave ${total}?`,
      `${op === ADD ? `${total} ${MINUS} ${n1}` : `${n1} ${MINUS} ${total}`} = ${n2}, so the ` +
        `missing fraction is ${n2}/${den}.`,
      ...wholeNote(total, den),
      ...tidyStep(n2, den, result),
    ],
    misconceptions: keepUsable(
      [
        addedWhatWasShown(
          n1,
          total,
          den,
          op === ADD ? `${total} ${MINUS} ${n1} = ${n2}` : `${n1} ${MINUS} ${total} = ${n2}`,
        ),
        answeredTheTotal(total, den),
        droppedDenominator(n2, den),
      ],
      result,
    ),
  }
}

/** `? + 3/8 = 7/8`, or `? − 3/8 = 4/8`. The blank at the front. */
function missingFirst(terms: Terms, op: number): Draft {
  const { n1, n2, den } = terms
  const total = totalOf(terms, op)
  const result = new R(n1, den)
  const symbol = op === ADD ? '+' : MINUS

  return {
    prompt: `? ${symbol} ${n2}/${den} = ${total}/${den}. What fraction goes in the blank?`,
    promptWithSlot: `{} ${symbol} ${n2}/${den} = ${total}/${den}`,
    answer: result.toString(),
    extra: { total },
    workedSteps: [
      `Every fraction here has ${den} on the bottom, so the pieces are all the same size and ` +
        `only the count changes.`,
      op === ADD
        ? `Altogether there are ${total} pieces. The part you can see is ${n2} of them. ` +
          `Ask: what plus ${n2} makes ${total}?`
        : `Work backwards. After ${pieces(n2)} came off, ${there(total)} left — so the blank had ` +
          `both lots in it.`,
      op === ADD
        ? `${total} ${MINUS} ${n2} = ${n1}, so the missing fraction is ${n1}/${den}.`
        : `${total} + ${n2} = ${n1}, so the missing fraction is ${n1}/${den}.`,
      ...wholeNote(total, den),
      ...tidyStep(n1, den, result),
    ],
    misconceptions: keepUsable(
      [
        // `added-what-was-shown` is deliberately absent when the operation is
        // subtraction: adding the two numbers on screen is not a mistake there,
        // it is the method. Offering it would mean naming the right answer as a
        // known error, which is the one thing this file must never do.
        ...(op === ADD
          ? []
          : [
              {
                // The sign says take away, so he takes away. It can never be
                // right — |total − n2| = total + n2 would need one of them to be
                // zero — so this format always names at least this.
                id: 'subtracted-instead',
                value: new R(Math.abs(total - n2), den),
                label: 'Took away instead of adding back',
                explanation:
                  `The ${MINUS} sign is there, so taking away feels like the thing to do. But the ` +
                  `blank is what was there before ${n2}/${den} came off it, and ${pieces(n2)} ` +
                  `${n2 === 1 ? 'has' : 'have'} to go back on: ${total} + ${n2} = ${n1}.`,
              },
            ]),
        ...(op === ADD ? [addedWhatWasShown(n2, total, den, `${total} ${MINUS} ${n2} = ${n1}`)] : []),
        answeredTheTotal(total, den),
        droppedDenominator(n1, den),
      ],
      result,
    ),
  }
}

/** `7/8 = 3/8 + ?`. One total, split back into its two parts. */
function decompose(terms: Terms): Draft {
  const { n1, n2, den } = terms
  const total = totalOf(terms, ADD)
  const result = new R(n2, den)

  return {
    prompt: `${total}/${den} = ${n1}/${den} + ?. What fraction goes in the blank?`,
    promptWithSlot: `${total}/${den} = ${n1}/${den} + {}`,
    answer: result.toString(),
    extra: { total },
    workedSteps: [
      `${total}/${den} is ${total} pieces, each one 1/${den}. Splitting it into two parts does ` +
        `not change how big the pieces are.`,
      `The first part is ${n1} of those ${total} pieces. Ask: ${n1} plus what makes ${total}?`,
      `${total} ${MINUS} ${n1} = ${n2}, so the other part is ${n2}/${den}.`,
      ...wholeNote(total, den),
      ...tidyStep(n2, den, result),
    ],
    misconceptions: keepUsable(
      [
        addedWhatWasShown(n1, total, den, `${total} ${MINUS} ${n1} = ${n2}`),
        answeredTheTotal(total, den),
        droppedDenominator(n2, den),
      ],
      result,
    ),
  }
}

/** The same arithmetic in a situation. */
function inContext(terms: Terms, op: number, rng: Rng): Draft {
  const { n1, n2, den } = terms
  const raw = totalOf(terms, op)
  const result = op === ADD ? new R(n1, den).add(new R(n2, den)) : new R(n1, den).sub(new R(n2, den))

  const name = rng.int(0, NAMES.length - 1)
  const materialIndex = rng.int(0, MATERIALS.length - 1)
  const { material, unit, units } = MATERIALS[materialIndex]!
  const who = NAMES[name]!
  const first = quantity(n1, den, unit, units)
  const second = quantity(n2, den, unit, units)
  const pieces = PIECE_NAMES[den] ?? 'pieces'

  return {
    prompt:
      op === ADD
        ? `${who} used ${first} of ${material} on Monday and ${second} on Tuesday. ` +
          `How much ${material} did ${who} use in total?`
        : `${who} had ${first} of ${material} and used ${second}. How much ${material} is left?`,
    answer: result.toString(),
    extra: { name, material: materialIndex },
    workedSteps: [
      `Both amounts are counted in ${pieces} of a ${unit}, so the pieces are the same size and ` +
        `only the count changes.`,
      op === ADD
        ? `Add the counts: ${n1} + ${n2} = ${raw}, which is ${raw}/${den}.`
        : `Take the counts away: ${n1} ${MINUS} ${n2} = ${raw}, which is ${raw}/${den}.`,
      ...tidyStep(raw, den, result),
      op === ADD
        ? `So ${who} used ${quantity(result.n, result.d, unit, units)} of ${material} in total.`
        : `That leaves ${quantity(result.n, result.d, unit, units)} of ${material}.`,
    ],
    misconceptions: keepUsable(
      [
        ...(op === ADD
          ? [
              {
                id: 'add-across',
                value: new R(n1 + n2, den * 2),
                label: 'Added the bottom numbers too',
                explanation:
                  `The bottom number says how big each piece is, not how many there are. Both ` +
                  `amounts are already in ${pieces} of a ${unit}, so the pieces stay that size — ` +
                  `only the count changes: ${n1} + ${n2} = ${raw}.`,
              },
            ]
          : []),
        droppedDenominator(raw, den),
        {
          id: 'wrong-operation',
          value: new R(op === ADD ? Math.abs(n1 - n2) : n1 + n2, den),
          label: `${op === ADD ? 'Subtracted' : 'Added'} instead`,
          explanation:
            op === ADD
              ? `That is the difference between the two amounts. Both lots got used though, so ` +
                `they join together and the total is bigger than either one.`
              : `That is the two amounts put together. Some of it got used up here, so the answer ` +
                `has to be smaller than what ${who} started with.`,
        },
      ],
      result,
    ),
  }
}

// ---------------------------------------------------------------------------
// Shared wording

/**
 * `1 piece`, `3 pieces`.
 *
 * A helper rather than a bare `pieces`, because a missing term of one piece is
 * common and "1 pieces" is the first thing he would read on the item he just got
 * wrong.
 */
function pieces(count: number): string {
  return `${count} piece${count === 1 ? '' : 's'}`
}

/** `there is 1 piece`, `there are 3 pieces` — the verb has to agree too. */
function there(count: number): string {
  return `there ${count === 1 ? 'is' : 'are'} ${pieces(count)}`
}

/**
 * How an amount reads in a word problem.
 *
 * "3/8 of a cup" while it is less than one, "11/8 cups" once it is more, and
 * "2 cups" or "1 cup" when it comes out whole. A table of cases rather than a
 * plural stuck on the end, because "1 cups" and "3/8 cups" are both wrong in
 * ways a child notices.
 */
function quantity(n: number, d: number, unit: string, units: string): string {
  if (d === 1) return `${n} ${n === 1 ? unit : units}`
  return n < d ? `${n}/${d} of a ${unit}` : `${n}/${d} ${units}`
}

/** The step that tidies `raw/den` up, when there is anything to tidy. */
function tidyStep(raw: number, den: number, result: R): string[] {
  if (result.d === 1) {
    return [
      `${raw}/${den} is ${raw} pieces out of ${den}, which is exactly ` +
        `${result.n === 1 ? 'one whole' : `${result.n} wholes`}: ${result.toString()}.`,
    ]
  }
  if (result.d !== den) {
    return [
      `${raw}/${den} is the same amount as ${result.toString()}, and ${result.toString()} is the ` +
        `tidiest way to write it.`,
    ]
  }
  return []
}

/**
 * A note about the total, for the formats that print one.
 *
 * `8/8` and `12/8` are both perfectly fair things to have on the right of the
 * equals sign, and both are worth a word: one of them is a whole one written as
 * a fraction, and the other has gone past a whole. Saying so is the difference
 * between an equation that looks strange and one that makes sense.
 */
function wholeNote(total: number, den: number): string[] {
  // `${den}ths` would read "8ths", which is why the piece names are a table.
  if (total === den) {
    return [
      `${total}/${den} on the other side is one whole, written as ${PIECE_NAMES[den] ?? 'pieces'}.`,
    ]
  }
  if (total > den) return [`${total}/${den} is more than one whole, which is allowed.`]
  return []
}

interface Candidate {
  id: string
  value: R
  label: string
  explanation: string
}

/**
 * Adding straight across, top and bottom. The single most common error in
 * fraction arithmetic.
 *
 * It has no subtraction twin: subtracting straight across gives a denominator of
 * den − den = 0, which is not a number, so there is no wrong answer to recognise
 * and it must not be emitted for subtraction. It also means nothing on the
 * missing-term formats, where there is no pair of fractions to add across in the
 * first place.
 */
function addAcross(n1: number, n2: number, den: number): Candidate {
  return {
    id: 'add-across',
    value: new R(n1 + n2, den * 2),
    label: 'Added the bottom numbers too',
    explanation:
      `The bottom number says how big each piece is, not how many you have. ` +
      `Both fractions already have ${den} on the bottom, so the pieces stay that size — ` +
      `only the count changes.`,
  }
}

/**
 * Answering with the numerator alone: the fraction gets treated as two separate
 * whole numbers and the bottom one gets left behind.
 *
 * Never the right answer, because `count/den` with `den` at least 2 is never the
 * whole number `count`.
 */
function droppedDenominator(count: number, den: number): Candidate {
  return {
    id: 'dropped-denominator',
    value: new R(count, 1),
    label: 'Left the bottom number off',
    explanation:
      `You counted the pieces right: ${count}. On its own though, ${count} means ${count} whole ` +
      `${count === 1 ? 'one' : 'ones'}, which is far bigger. Keep the bottom number with it: ` +
      `${count}/${den}.`,
  }
}

/**
 * Adding the two numbers that are on the screen.
 *
 * The commonest thing a child does with an equation he cannot read is add
 * whatever he can see. On three of the four missing-term combinations that lands
 * somewhere wrong, and always wrong: it would need the hidden term to equal
 * `shown + total`, and the hidden term is smaller than the total on both of the
 * addition framings and smaller than the first term on `a/b − ? = c/b`.
 *
 * The fourth combination is `? − a/b = c/b`, where adding the two numbers on
 * screen is exactly how the question is done. This must not be offered there.
 */
function addedWhatWasShown(shown: number, total: number, den: number, fix: string): Candidate {
  return {
    id: 'added-what-was-shown',
    value: new R(shown + total, den),
    label: 'Added the two numbers on the screen',
    explanation:
      `${shown} + ${total} = ${shown + total} adds up the two fractions you can see. But ` +
      `${total}/${den} is not another part to pile on — it is what the whole equation comes to. ` +
      `Take one away from the other instead: ${fix}.`,
  }
}

/** Copying the number on the other side of the equals sign. */
function answeredTheTotal(total: number, den: number): Candidate {
  return {
    id: 'answered-the-total',
    value: new R(total, den),
    label: 'Wrote the total again',
    explanation:
      `${total}/${den} is the amount the whole equation comes to, and it is already written down. ` +
      `The blank is the part that is missing on its own.`,
  }
}

/**
 * Drop the candidates that cannot be used, keeping the most diagnostic of any
 * that collide.
 *
 * Ordered by how much each one says about his thinking, because when two land on
 * the same value only the first survives.
 */
function keepUsable(candidates: readonly Candidate[], answer: R): Misconception[] {
  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never tell him a right answer is a known mistake.
    if (c.value.equals(answer)) continue
    const signature = c.value.toString()
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
