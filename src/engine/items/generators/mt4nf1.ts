/**
 * MT.4.NF.1 — equivalent fractions.
 *
 * "Explain why a fraction a/b is equivalent to a fraction (n × a)/(n × b) by
 * using visual fraction models and use this principle to recognize and generate
 * equivalent fractions."
 *
 * One idea, six ways of asking about it. The idea is that cutting every piece
 * into n smaller ones leaves the amount alone and multiplies the count.
 *
 * This generator used to ask that in exactly one sentence — "3/4 = ?/12, what is
 * the missing top number?" — and Rion, who is ten and plays this, said the
 * questions felt repetitive: "the subject might change slightly, but the pattern
 * remained." He was right, and the fix is not new names in the same sentence.
 * Each format below is a different hole punched in the same equivalence, and
 * they are not interchangeable pedagogically:
 *
 *  - `MISSING_NUMERATOR` — generate upward, given the new bottom number.
 *  - `MISSING_DENOMINATOR` — the same move with the blank moved, which forces
 *    the multiplier to be recovered from the two *top* numbers instead. A child
 *    who has only ever met the first one often cannot do this.
 *  - `SCALE_FACTOR` — both fractions shown, name what was multiplied. The step
 *    the standard is really about, asked for on its own.
 *  - `HOW_MANY_PIECES` — the recognising half, spoken the way a teacher says it:
 *    "9/12 is the same amount as how many fourths?" Going *down* means dividing,
 *    which is the direction a child who has learnt the rule by pattern cannot do.
 *  - `WHICH_SAME` — pick the equivalent fraction out of three, where the two
 *    wrong ones are the two ways of doing half the job.
 *  - `WORD_SAME_CUT` — the same amount, cut two different ways, in context.
 *
 * Formats are banded, so the two that require dividing are out of reach at the
 * bottom of the range. Within every band the numeric dials still do the work
 * they always did: format choice is variety, not difficulty.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that. A test that had to guess the format from the prompt text would be
 * reading the generator's words to check the generator's arithmetic.
 */
export const MISSING_NUMERATOR = 0
export const MISSING_DENOMINATOR = 1
export const SCALE_FACTOR = 2
export const HOW_MANY_PIECES = 3
export const WHICH_SAME = 4
export const WORD_SAME_CUT = 5

/** U+00F7 DIVISION SIGN. Display only; the sign on his worksheets. */
const DIVIDE = '÷'

const RANGE: [number, number] = [5, 70]

interface Band {
  dens: readonly number[]
  mults: readonly number[]
  formats: readonly number[]
}

/**
 * The four difficulty bands, easiest first.
 *
 * Three dials, and they are dials for different reasons:
 *
 *  - `mults` is the real one. 2 and 3 are multipliers a child can see without
 *    working them out; 6, 7 and 8 have to be recovered from the two denominators
 *    first, which is the step this standard is actually about.
 *  - `dens` moves more slowly on purpose. A bigger starting denominator makes
 *    the multiplication heavier without making the *principle* any harder, so it
 *    is a supporting dial rather than the main one.
 *  - `formats` is not a difficulty dial at all — it is what stops the standard
 *    being one memorised sentence. It is banded only so that the two formats
 *    which require *dividing* (`HOW_MANY_PIECES`, `WHICH_SAME`) do not land on
 *    the lowest-rated player, and so that the concrete word version is there
 *    early, where it helps most. Every band offers at least two formats, so no
 *    band is a single pattern.
 *
 * Denominators stop at 12 and multipliers at 8, which caps the new denominator
 * at 96. Past that the question stops being about equivalence and starts being
 * about multiplying two-digit numbers, which is a different standard and would
 * make this rating mean something other than what it claims.
 *
 * `WORD_SAME_CUT` is kept out of the top band for a plainer reason: with a
 * multiplier of 8 on a denominator of 12 it would be describing a pizza cut into
 * ninety-six slices.
 */
const BANDS: readonly Band[] = [
  { dens: [2, 3, 4], mults: [2, 3], formats: [MISSING_NUMERATOR, WORD_SAME_CUT] },
  {
    dens: [2, 3, 4, 5, 6],
    mults: [2, 3, 4],
    formats: [MISSING_NUMERATOR, MISSING_DENOMINATOR, SCALE_FACTOR, WORD_SAME_CUT],
  },
  {
    dens: [3, 4, 5, 6, 8],
    mults: [3, 4, 5, 6],
    formats: [
      MISSING_DENOMINATOR,
      SCALE_FACTOR,
      HOW_MANY_PIECES,
      WHICH_SAME,
      WORD_SAME_CUT,
    ],
  },
  {
    dens: [4, 5, 6, 8, 10, 12],
    mults: [5, 6, 7, 8],
    formats: [
      MISSING_NUMERATOR,
      MISSING_DENOMINATOR,
      SCALE_FACTOR,
      HOW_MANY_PIECES,
      WHICH_SAME,
    ],
  },
]

/**
 * What one piece of a whole cut into `den` is called, singular and plural.
 *
 * A table rather than a suffix stuck onto the number, because "one-3th" and
 * "1 fifths" are the kind of thing a child reads once and stops trusting the
 * rest of the explanation over. Every denominator any band can draw is listed.
 * Exported so the soundness test can rebuild a prompt from `params` character
 * for character — which shares the words, never the arithmetic.
 */
export const PIECE_NAMES: Record<number, readonly [string, string]> = {
  2: ['half', 'halves'],
  3: ['third', 'thirds'],
  4: ['fourth', 'fourths'],
  5: ['fifth', 'fifths'],
  6: ['sixth', 'sixths'],
  8: ['eighth', 'eighths'],
  10: ['tenth', 'tenths'],
  12: ['twelfth', 'twelfths'],
}

function pieceWord(den: number, count: number): string {
  const names = PIECE_NAMES[den] ?? ['piece', 'pieces']
  return count === 1 ? names[0] : names[1]
}

/**
 * A neutral, varied cast. No surnames, no ages, nobody's family, nobody's money.
 * Exported for the same reason as the tables above.
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
 * Things that get cut into equal parts, and what the parts are called.
 *
 * Only the plural is stored, because every sentence these appear in has more
 * than one of them: a denominator is at least 2 and the new one is larger
 * still. "Cut a pizza into 2 equal slices" is fine; there is no singular case
 * to get wrong.
 *
 * Everything here survives being cut into a lot of pieces. A chocolate bar was
 * tried and dropped — "cut a chocolate bar into 2 equal squares" is not a thing
 * that happens, and a child who reads one plainly wrong sentence has no way to
 * know which of the others to trust.
 */
export const THINGS: readonly { thing: string; pieces: string }[] = [
  { thing: 'pizza', pieces: 'slices' },
  { thing: 'cake', pieces: 'slices' },
  { thing: 'watermelon', pieces: 'slices' },
  { thing: 'sheet of paper', pieces: 'strips' },
  { thing: 'ribbon', pieces: 'pieces' },
  { thing: 'length of rope', pieces: 'pieces' },
]

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
 *
 * `WHICH_SAME` asks for one more thing. Its second wrong option is
 * `(a × mult)/b`, and when `a × mult` happens to equal `b` that option reads
 * `3/3` — a fraction any child can see is one whole and cross off without
 * thinking about equivalence at all, which turns three options into two. Those
 * numerators are filtered out for that format only. The filter can empty the
 * list (den 2 with a multiplier of 2), so the caller falls back to the full one
 * rather than handing `undefined` to `rng.pick`.
 */
function numeratorsFor(den: number, mult?: number, format?: number): number[] {
  const out: number[] = []
  for (let n = 1; n < den; n++) if (gcd(n, den) === 1) out.push(n)
  if (format !== WHICH_SAME || mult === undefined) return out
  const usable = out.filter((n) => n * mult !== den)
  return usable.length > 0 ? usable : out
}

/** Two different children, picked as a name and an offset so they cannot match. */
function twoNames(rng: Rng): [number, number] {
  const first = rng.int(0, NAMES.length - 1)
  const offset = rng.int(1, NAMES.length - 1)
  return [first, (first + offset) % NAMES.length]
}

/** The numbers every format is built from. */
interface Core {
  /** Top number of the fraction in lowest terms. */
  a: number
  /** Bottom number of the fraction in lowest terms. */
  b: number
  /** What both were multiplied by. */
  mult: number
  /** `b × mult`. */
  targetDen: number
  /** `a × mult`. */
  scaledNum: number
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  /** Canonical answer, already in lowest terms. */
  answer: string
  /** Params this format needs beyond `a`, `b`, `mult`, `targetDen` and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nf1: ItemGenerator = {
  standardId: 'MT.4.NF.1',
  label: 'Equivalent fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = bandFor(d)
    const format = rng.pick(band.formats)
    const b = rng.pick(band.dens)
    const mult = rng.pick(band.mults)
    const a = rng.pick(numeratorsFor(b, mult, format))
    const core: Core = { a, b, mult, targetDen: b * mult, scaledNum: a * mult }

    const draft = draftFor(format, core, rng)

    return {
      standardId: 'MT.4.NF.1',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      answer: { kind: 'rational', canonical: draft.answer },
      params: { a, b, mult, targetDen: core.targetDen, format, ...draft.extra },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, core: Core, rng: Rng): Draft {
  switch (format) {
    case MISSING_DENOMINATOR:
      return missingDenominator(core)
    case SCALE_FACTOR:
      return scaleFactor(core)
    case HOW_MANY_PIECES:
      return howManyPieces(core)
    case WHICH_SAME:
      return whichSame(core, rng)
    case WORD_SAME_CUT:
      return wordSameCut(core, rng)
    default:
      return missingNumerator(core)
  }
}

/** "twice" reads like English; "2 times as many" reads like a spreadsheet. */
function timesAsMany(mult: number): string {
  return mult === 2 ? 'twice as many' : `${mult} times as many`
}

// ---------------------------------------------------------------------------
// The formats

/** `3/4 = ?/12`, answer 9. The generating direction, with the blank on top. */
function missingNumerator({ a, b, mult, targetDen, scaledNum }: Core): Draft {
  return {
    prompt: `${a}/${b} = ?/${targetDen}. What is the missing top number?`,
    // The one thing the sentence cannot do on its own: put the box where the
    // answer belongs. `9/12` is correct mathematics and the wrong answer to the
    // question asked, and an input sitting above `/12` is a better answer to
    // that than any wording is.
    promptWithSlot: `${a}/${b} = {}/${targetDen}`,
    answer: String(scaledNum),
    extra: {},
    workedSteps: [
      `The bottom number went from ${b} to ${targetDen}. Ask: ${b} times what makes ${targetDen}?`,
      `${b} × ${mult} = ${targetDen}, so each piece got cut into ${mult} smaller ones.`,
      `There are ${timesAsMany(mult)} pieces now, so the top number grows the same way: ` +
        `${mult} × ${a} = ${scaledNum}.`,
      `So ${a}/${b} = ${scaledNum}/${targetDen} — the same amount, just cut into more pieces.`,
    ],
    misconceptions: keepUsable(
      [
        // The documented classic: thinking about the two denominators as a
        // difference rather than as a scaling. Note this can never equal the
        // correct answer — a + (targetDen − b) = a × mult would need a to equal
        // b, and a/b is always a proper fraction — so there is always at least
        // one named mistake on every item of this format.
        addedDifferenceOnTop({ a, b, mult, targetDen, scaledNum }),
        {
          id: 'added-multiplier',
          value: new R(a + mult, 1),
          label: 'Added the multiplier instead of multiplying',
          explanation:
            `You found the right multiplier: ${mult}. It just got added instead of multiplied. ` +
            `${a} + ${mult} = ${a + mult}, but ${mult} × ${a} = ${scaledNum}.`,
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
            `Use it on the top number: ${mult} × ${a} = ${scaledNum}.`,
        },
        wroteTheFraction(
          a,
          b,
          `Careful — this one is only asking for the number that goes in the blank on top. ` +
            `That number is ${scaledNum}, which makes the fraction ${scaledNum}/${targetDen}.`,
        ),
      ],
      String(scaledNum),
    ),
  }
}

/** `3/4 = 9/?`, answer 12. The same move with the blank underneath. */
function missingDenominator({ a, b, mult, targetDen, scaledNum }: Core): Draft {
  const topGap = scaledNum - a
  return {
    prompt: `${a}/${b} = ${scaledNum}/?. What is the missing bottom number?`,
    promptWithSlot: `${a}/${b} = ${scaledNum}/{}`,
    answer: String(targetDen),
    extra: { scaledNum },
    workedSteps: [
      `This time the top number is the one that changed: ${a} became ${scaledNum}. ` +
        `Ask: ${a} times what makes ${scaledNum}?`,
      `${a} × ${mult} = ${scaledNum}, so every piece was cut into ${mult} smaller ones.`,
      `The bottom number says how big the pieces are, so it grows the same way: ` +
        `${mult} × ${b} = ${targetDen}.`,
      `So ${a}/${b} = ${scaledNum}/${targetDen} — the same amount, just cut into more pieces.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // The additive slip, pointing the other way. It can never be right:
          // b + a(mult − 1) = b × mult would need a to equal b, and a/b is
          // always a proper fraction. So this format always names something.
          id: 'added-difference',
          value: new R(b + topGap, 1),
          label: 'Added the same amount to the bottom',
          explanation:
            `The top number went up by ${topGap}, so ${topGap} went on the bottom as well. ` +
            `But the top did not have ${topGap} added to it — it got multiplied by ${mult}. ` +
            `Do the same to the bottom: ${mult} × ${b} = ${targetDen}.`,
        },
        {
          id: 'added-multiplier',
          value: new R(b + mult, 1),
          label: 'Added the multiplier instead of multiplying',
          explanation:
            `You found the right multiplier: ${mult}. It just got added instead of multiplied. ` +
            `${b} + ${mult} = ${b + mult}, but ${mult} × ${b} = ${targetDen}.`,
        },
        {
          id: 'kept-denominator',
          value: new R(b, 1),
          label: 'Left the bottom number alone',
          explanation:
            `The pieces have to get smaller when there are more of them. If the bottom stayed ` +
            `${b}, then ${scaledNum} of those pieces would be ${scaledNum}/${b} — a bigger ` +
            `amount than ${a}/${b}, not the same one.`,
        },
        {
          id: 'answered-multiplier',
          value: new R(mult, 1),
          label: 'Wrote the multiplier itself',
          explanation:
            `${mult} is what you multiply by, not what you end up with. ` +
            `Use it on the bottom number: ${mult} × ${b} = ${targetDen}.`,
        },
        wroteTheFraction(
          a,
          b,
          `Careful — this one is only asking for the number that goes in the blank underneath. ` +
            `That number is ${targetDen}, which makes the fraction ${scaledNum}/${targetDen}.`,
        ),
      ],
      String(targetDen),
    ),
  }
}

/** `3/4 = 9/12`, answer 3. The scaling itself, asked for by name. */
function scaleFactor({ a, b, mult, targetDen, scaledNum }: Core): Draft {
  return {
    prompt:
      `${a}/${b} = ${scaledNum}/${targetDen}. The top and the bottom were both ` +
      `multiplied by the same number. What number was it?`,
    answer: String(mult),
    extra: { scaledNum },
    workedSteps: [
      `Start with the bottom numbers: ${b} became ${targetDen}. Ask: ` +
        `${b} times what makes ${targetDen}?`,
      `${b} × ${mult} = ${targetDen}, so every piece was cut into ${mult} smaller ones.`,
      `Check it on the top: ${a} × ${mult} = ${scaledNum}. Both numbers were multiplied by ` +
        `${mult}, which is why the amount did not change.`,
      `So the number is ${mult}.`,
    ],
    misconceptions: keepUsable(
      [
        {
          id: 'answered-bottom-gap',
          value: new R(targetDen - b, 1),
          label: 'Gave how much the bottom went up by',
          explanation:
            `The bottom number did go up by ${targetDen - b}, but it grew by multiplying rather ` +
            `than by adding: ${b} × ${mult} = ${targetDen}. The number being asked for is ${mult}.`,
        },
        {
          id: 'answered-top-gap',
          value: new R(scaledNum - a, 1),
          label: 'Gave how much the top went up by',
          explanation:
            `The top number did go up by ${scaledNum - a}, but it grew by multiplying rather than ` +
            `by adding: ${a} × ${mult} = ${scaledNum}. The number being asked for is ${mult}.`,
        },
        {
          // Always available: targetDen = b × mult equals mult only if b is 1,
          // and b is at least 2 on every band.
          id: 'answered-new-bottom',
          value: new R(targetDen, 1),
          label: 'Wrote the new bottom number',
          explanation:
            `${targetDen} is the number the bottom ended up as, not what it was multiplied by. ` +
            `${b} × ${mult} = ${targetDen}, so the answer is ${mult}.`,
        },
        {
          id: 'answered-new-top',
          value: new R(scaledNum, 1),
          label: 'Wrote the new top number',
          explanation:
            `${scaledNum} is the number the top ended up as, not what it was multiplied by. ` +
            `${a} × ${mult} = ${scaledNum}, so the answer is ${mult}.`,
        },
      ],
      String(mult),
    ),
  }
}

/** "9/12 is the same amount as how many fourths?", answer 3. Reducing, out loud. */
function howManyPieces({ a, b, mult, targetDen, scaledNum }: Core): Draft {
  const one = PIECE_NAMES[b]?.[0] ?? 'piece'
  const many = PIECE_NAMES[b]?.[1] ?? 'pieces'
  return {
    prompt: `${scaledNum}/${targetDen} is the same amount as how many ${many}?`,
    answer: String(a),
    extra: { scaledNum },
    workedSteps: [
      `The whole is cut into ${targetDen} pieces here, and one ${one} is ${mult} of them, ` +
        `because ${b} × ${mult} = ${targetDen}.`,
      `So group the ${scaledNum} smaller pieces into ${many}: ` +
        `${scaledNum} ${DIVIDE} ${mult} = ${a}.`,
      `That is ${a} ${pieceWord(b, a)}, and ${a}/${b} is the same amount as ` +
        `${scaledNum}/${targetDen}.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // Always available: scaledNum = a × mult equals a only if mult is 1,
          // and mult is at least 2 on every band.
          id: 'kept-the-count',
          value: new R(scaledNum, 1),
          label: 'Counted the smaller pieces instead',
          explanation:
            `${scaledNum} is how many of the small pieces there are. The question asks how many ` +
            `${many} that comes to, and one ${one} is worth ${mult} of the small pieces: ` +
            `${scaledNum} ${DIVIDE} ${mult} = ${a}.`,
        },
        wroteTheFraction(
          a,
          b,
          `That is the right amount, written as a fraction. This one asks for the count on its ` +
            `own: ${scaledNum}/${targetDen} is ${a} ${pieceWord(b, a)}, so the answer is ${a}.`,
        ),
        {
          id: 'answered-the-scale',
          value: new R(mult, 1),
          label: 'Gave how many small pieces fit in one big one',
          explanation:
            `${mult} small pieces do make one ${one}. The question asks how many ${many} there ` +
            `are altogether: ${scaledNum} ${DIVIDE} ${mult} = ${a}.`,
        },
      ],
      String(a),
    ),
  }
}

/** "Which of these is the same amount as 9/12: 3/4, 3/12, or 9/4?", answer 3/4. */
function whichSame({ a, b, mult, targetDen, scaledNum }: Core, rng: Rng): Draft {
  const correct = `${a}/${b}`
  const topOnly = `${a}/${targetDen}`
  const bottomOnly = `${scaledNum}/${b}`
  // Where the right answer sits. Fixed at one position it would be a question
  // about position rather than about fractions.
  const slot = rng.int(0, 2)
  const options = [topOnly, bottomOnly]
  options.splice(slot, 0, correct)

  return {
    prompt:
      `Which of these is the same amount as ${scaledNum}/${targetDen}: ` +
      `${options[0]}, ${options[1]}, or ${options[2]}?`,
    answer: correct,
    extra: { scaledNum, slot },
    workedSteps: [
      `To find the same amount written with smaller numbers, divide the top and the bottom by ` +
        `the same thing. Both ${scaledNum} and ${targetDen} divide by ${mult}.`,
      `${scaledNum} ${DIVIDE} ${mult} = ${a} and ${targetDen} ${DIVIDE} ${mult} = ${b}, ` +
        `so ${scaledNum}/${targetDen} = ${a}/${b}.`,
      `The other two only did half the job: ${topOnly} divided the top and left the bottom, and ` +
        `${bottomOnly} divided the bottom and left the top. Either way the amount changes.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // Both of these are always genuinely wrong: dividing one number of a
          // fraction and not the other cannot leave the amount alone. So this
          // format always names two mistakes, one per wrong option.
          id: 'divided-the-top-only',
          value: new R(a, targetDen),
          label: 'Divided the top and left the bottom',
          explanation:
            `${topOnly} kept pieces of the same size — ${targetDen} to the whole — and took ` +
            `fewer of them, so it is a smaller amount than ${scaledNum}/${targetDen}. ` +
            `Both numbers have to be divided by ${mult}: ${a}/${b}.`,
        },
        {
          id: 'divided-the-bottom-only',
          value: new R(scaledNum, b),
          label: 'Divided the bottom and left the top',
          explanation:
            `${bottomOnly} made every piece bigger — only ${b} to the whole — while still ` +
            `taking ${scaledNum} of them, so it is a much larger amount. Divide both numbers ` +
            `by ${mult}: ${scaledNum} ${DIVIDE} ${mult} = ${a} and ${targetDen} ${DIVIDE} ` +
            `${mult} = ${b}, which gives ${a}/${b}.`,
        },
      ],
      correct,
    ),
  }
}

/** The same amount, cut two different ways, in context. Answer `a × mult`. */
function wordSameCut({ a, b, mult, targetDen, scaledNum }: Core, rng: Rng): Draft {
  const [nameA, nameB] = twoNames(rng)
  const first = NAMES[nameA]!
  const second = NAMES[nameB]!
  const thingIndex = rng.int(0, THINGS.length - 1)
  const { thing, pieces } = THINGS[thingIndex]!

  return {
    prompt:
      `${first} cut a ${thing} into ${b} equal ${pieces} and took ${a} of them. ` +
      `${second} cut an identical ${thing} into ${targetDen} equal ${pieces}. ` +
      `How many of the smaller ${pieces} does ${second} need to take to have the ` +
      `same amount as ${first}?`,
    answer: String(scaledNum),
    extra: { nameA, nameB, thing: thingIndex },
    workedSteps: [
      `${second} cut an identical ${thing} into more ${pieces}, so each of those ${pieces} is ` +
        `smaller.`,
      `${b} × ${mult} = ${targetDen}, so every one of the bigger ${pieces} is worth ` +
        `${mult} of the smaller ones.`,
      `${first} took ${a}, so ${second} needs ${mult} × ${a} = ${scaledNum} of the smaller ` +
        `${pieces}.`,
      `${a}/${b} and ${scaledNum}/${targetDen} are the same amount — the same ${thing}, cut two ` +
        `different ways.`,
    ],
    misconceptions: keepUsable(
      [
        {
          // Always available: a can never equal a × mult, since mult is at
          // least 2 on every band.
          id: 'same-count',
          value: new R(a, 1),
          label: 'Took the same number of pieces',
          explanation:
            `${a} of the smaller ${pieces} is less than ${a} of the bigger ones — that is what ` +
            `cutting the ${thing} into more ${pieces} does. Each of the bigger ones is worth ` +
            `${mult} of the smaller: ${mult} × ${a} = ${scaledNum}.`,
        },
        addedDifferenceOnTop({ a, b, mult, targetDen, scaledNum }),
        {
          id: 'added-multiplier',
          value: new R(a + mult, 1),
          label: 'Added the multiplier instead of multiplying',
          explanation:
            `Every piece was cut into ${mult} smaller ones, so the count gets multiplied by ` +
            `${mult} rather than increased by it: ${mult} × ${a} = ${scaledNum}.`,
        },
        {
          id: 'answered-all-the-pieces',
          value: new R(targetDen, 1),
          label: 'Gave the whole number of pieces',
          explanation:
            `${targetDen} is how many ${pieces} the whole ${thing} was cut into. ` +
            `${second} only needs enough of them to match ${a} of the bigger ${pieces}, ` +
            `which is ${mult} × ${a} = ${scaledNum}.`,
        },
      ],
      String(scaledNum),
    ),
  }
}

// ---------------------------------------------------------------------------
// Shared misconceptions and the filter

interface Candidate {
  id: string
  value: R
  label: string
  explanation: string
}

/**
 * The additive slip on a question whose answer is a count of new pieces.
 *
 * Shared by `MISSING_NUMERATOR` and `WORD_SAME_CUT` because it is the same
 * mistake in both: the bottom number went up by so much, so the top went up by
 * the same. It can never be the right answer — a + (targetDen − b) = a × mult
 * would need a to equal b — so both formats always name at least this one.
 */
function addedDifferenceOnTop({ a, b, mult, targetDen, scaledNum }: Core): Candidate {
  const gap = targetDen - b
  return {
    id: 'added-difference',
    value: new R(a + gap, 1),
    label: 'Added the same amount to the top',
    explanation:
      `The bottom number went up by ${gap}, so ${gap} went on the top as well. ` +
      `But the bottom did not have ${gap} added to it — it got multiplied by ${mult}. ` +
      `Do the same to the top: ${mult} × ${a} = ${scaledNum}.`,
  }
}

/**
 * Answering with the fraction when the question wanted one number out of it.
 *
 * Not a misunderstanding of fractions at all, which is exactly why it is worth
 * naming: he may have had it completely right and answered a slightly different
 * question from the one asked. Only offered on formats that show a fraction and
 * ask for one of its numbers — on "what was it multiplied by?" nobody types a
 * fraction, and a misconception no child would ever type is dead weight.
 */
function wroteTheFraction(a: number, b: number, explanation: string): Candidate {
  return {
    id: 'wrote-the-fraction',
    value: new R(a, b),
    label: 'Wrote a fraction instead of the missing number',
    explanation,
  }
}

/**
 * Drop the candidates that cannot be used, keeping the most diagnostic of any
 * that collide.
 *
 * Ordered by how much each one says about his thinking, because when two land on
 * the same number only the first survives.
 */
function keepUsable(candidates: readonly Candidate[], answer: string): Misconception[] {
  // Compared as a value rather than as a string, so that a signature which is
  // the right amount written another way is still refused.
  const correct = R.parse(answer)!
  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    const signature = c.value.toString()
    // Never tell him a right answer is a known mistake.
    if (c.value.equals(correct)) continue
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}
