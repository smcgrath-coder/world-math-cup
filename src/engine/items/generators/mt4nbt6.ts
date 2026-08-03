/**
 * MT.4.NBT.6 — whole-number quotients and remainders.
 *
 * "Find whole-number quotients and remainders with up to four-digit dividends
 * and one-digit divisors, flexibly using strategies based on place value, the
 * properties of operations, and/or the relationship between multiplication and
 * division."
 *
 * The answer to a division with a remainder has two parts, and `AnswerSpec`
 * grades one number. `169 r 2` is not something the answer checker can read, and
 * a question the game cannot mark is worse than no question at all — so each
 * item asks for one part and the prompt says which. He meets both parts, just
 * not in the same breath, and asking for the remainder on its own turns out to
 * be the more honest question anyway: it is the part children drop.
 *
 * Every item is built the other way round from how it is solved. A quotient, a
 * divisor and a remainder are chosen first and multiplied back into a dividend,
 * so `quotient × divisor + remainder = dividend` and `0 <= remainder < divisor`
 * are true by construction rather than by a filter that has to be got right.
 * There is nothing here to redraw and nothing that can fail.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00F7 DIVISION SIGN.
 *
 * Prompt text is display-only — `checkAnswer` never sees it — so this cannot
 * affect grading, and it is the sign on his worksheets.
 */
const DIVIDE = '÷'
const TIMES = '×'
const MINUS = '−'

/** Which half of the answer this item wants. */
const QUOTIENT = 1
const REMAINDER = 0

const RANGE: [number, number] = [20, 92]

/**
 * The four difficulty bands, easiest first.
 *
 * Three dials, and the second is the one that carries this standard:
 *
 *  - `digits` grows the dividend from two to four, which is more places to work
 *    through rather than a new idea.
 *  - `mayDivideExactly` is the real one. Low down he meets both a division that
 *    comes out clean and one that leaves something over, mixed together, because
 *    a child who has only ever seen remainders starts inventing them and a child
 *    who has never seen one does not believe in them. Higher up there is always
 *    something left over, since by then the remainder is the point.
 *  - `asks` keeps the bottom band on "how many groups" alone. Asking what is
 *    left over is a second question on top of the division, and the easiest band
 *    should be measuring one thing.
 */
const BANDS = [
  { digits: [2], divisors: [2, 3, 4, 5], mayDivideExactly: true, asks: [QUOTIENT] },
  {
    digits: [2, 3],
    divisors: [2, 3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: true,
    asks: [QUOTIENT, REMAINDER],
  },
  {
    digits: [3],
    divisors: [2, 3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: false,
    asks: [QUOTIENT, REMAINDER],
  },
  {
    digits: [3, 4, 4],
    divisors: [3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: false,
    asks: [QUOTIENT, REMAINDER],
  },
] as const

type Band = (typeof BANDS)[number]

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/** The smallest and largest number with exactly `digits` digits. */
function digitRange(digits: number): [number, number] {
  return [10 ** (digits - 1), 10 ** digits - 1]
}

/** The digits of `n`, ones first. */
function digitsOf(n: number): number[] {
  return String(n).split('').reverse().map(Number)
}

/**
 * `4 groups`, `1 group`.
 *
 * Worth a helper rather than a template, because "1 groups of 2 is 2" turns up
 * in the middle of the working on any quotient ending in 1 — and a child who
 * reads one sentence that is plainly wrong has no way to know which of the
 * others to trust.
 */
function groups(count: number): string {
  return `${count} group${count === 1 ? '' : 's'}`
}

interface Division {
  dividend: number
  divisor: number
  quotient: number
  remainder: number
}

/**
 * Build a division backwards from its answer.
 *
 * Choosing the remainder first is what makes `0 <= remainder < divisor` true by
 * construction. Choosing the quotient inside a range worked out from the digit
 * band is what keeps the dividend the right size without a single redraw. A
 * loop that picked dividends and hoped for a remainder in a band that forbids
 * clean division would, with a divisor of 2, throw away half its attempts and
 * could still come back with the thing it was told not to produce.
 */
function build(rng: Rng, band: Band, digits: number): Division {
  const divisor = rng.pick(band.divisors)
  const remainder = band.mayDivideExactly ? rng.int(0, divisor - 1) : rng.int(1, divisor - 1)

  const [lo, hi] = digitRange(digits)
  const lowest = Math.ceil(lo / divisor)
  // `Math.max` only matters if a band is ever written with a digit range too
  // narrow to hold a single quotient, which would otherwise reach `rng.int` as
  // an empty range and throw mid-match.
  const highest = Math.max(lowest, Math.floor((hi - remainder) / divisor))
  const quotient = rng.int(lowest, highest)

  return { dividend: quotient * divisor + remainder, divisor, quotient, remainder }
}

export const mt4nbt6: ItemGenerator = {
  standardId: 'MT.4.NBT.6',
  label: 'Dividing with remainders',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const division = build(rng, band, rng.pick(band.digits))
    const ask = rng.pick(band.asks)

    const { dividend, divisor, quotient, remainder } = division
    const wanted = ask === QUOTIENT ? quotient : remainder

    return {
      standardId: 'MT.4.NBT.6',
      difficulty: d,
      prompt:
        ask === QUOTIENT
          ? `${dividend} ${DIVIDE} ${divisor}. How many whole groups of ${divisor}?`
          : `${dividend} ${DIVIDE} ${divisor}. What is the remainder?`,
      // Whole numbers under ten thousand throughout, so the key is exact.
      answer: { kind: 'rational', canonical: String(wanted) },
      // Only what the question shows. The quotient and the remainder are
      // deliberately left out: a test handed those would be checking the
      // generator's arithmetic against itself, and it has to take the dividend
      // and the divisor apart on its own.
      params: { dividend, divisor, ask },
      workedSteps: workedSteps(division, ask),
      misconceptions: misconceptionsFor(division, ask),
    }
  },
}

/**
 * Working through by place-value chunks, taking off a hundred groups at a time,
 * then tens, then ones.
 *
 * This is partial quotients rather than long division on purpose. It is the
 * strategy "based on place value" that the standard names first, every line of
 * it is a subtraction he can already do, and — unlike long division — a child
 * who loses his place can see from the numbers where he was.
 */
function workedSteps(division: Division, ask: number): string[] {
  const { dividend, divisor, quotient, remainder } = division

  const chunks = digitsOf(quotient)
    .map((digit, i) => digit * 10 ** i)
    .filter((value) => value > 0)
    .reverse()

  const steps = [
    `${dividend} ${DIVIDE} ${divisor} asks how many whole groups of ${divisor} fit inside ` +
      `${dividend}, and what is left over when they will not fit any more.`,
  ]

  let left = dividend
  let sofar = 0
  for (const chunk of chunks) {
    const taken = chunk * divisor
    sofar += chunk
    steps.push(
      `${groups(chunk)} of ${divisor} is ${taken}, and ${left} ${MINUS} ${taken} = ` +
        `${left - taken}.` +
        (chunks.length > 1 ? ` That is ${groups(sofar)} so far.` : ''),
    )
    left -= taken
  }

  steps.push(
    remainder === 0
      ? `Nothing is left, so ${divisor} goes into ${dividend} exactly. The remainder is 0.`
      : `${remainder} is smaller than ${divisor}, so it cannot make another whole group. ` +
          `That ${remainder} is the remainder.`,
  )

  // The relationship between multiplication and division, which the standard
  // names and which is also how he can tell on his own whether he is right.
  steps.push(
    remainder === 0
      ? `Check it: ${quotient} ${TIMES} ${divisor} = ${dividend}.`
      : `Check it: ${quotient} ${TIMES} ${divisor} = ${quotient * divisor}, and ` +
          `${quotient * divisor} + ${remainder} = ${dividend}.`,
  )

  steps.push(
    ask === QUOTIENT
      ? `The question asked how many whole groups, so the answer is ${quotient}.`
      : `The question asked for the remainder, so the answer is ${remainder}.`,
  )

  return steps
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * With two parts to the answer and one of them asked for, the first mistake to
 * name is always the other part. Answering the quotient when the remainder was
 * wanted is not a division error at all — the division was right — and saying so
 * is the difference between a note that helps and a note that stings.
 */
function misconceptionsFor(division: Division, ask: number): Misconception[] {
  const candidates = ask === QUOTIENT ? quotientMistakes(division) : remainderMistakes(division)
  const correct = ask === QUOTIENT ? division.quotient : division.remainder

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. When a division comes out
    // clean, "you left the remainder off" *is* the right answer, and it must
    // not be named.
    if (c.value === correct) continue
    const signature = String(c.value)
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

function quotientMistakes({ dividend, divisor, quotient, remainder }: Division): Candidate[] {
  const out: Candidate[] = []

  // Only worth naming when there is a leftover to have given instead. On a
  // clean division this would be an answer of 0 to "how many groups", which is
  // not a mistake anybody makes, attached to a note saying 0 is right.
  if (remainder > 0) {
    out.push({
      id: 'answered-the-remainder',
      value: remainder,
      label: 'Gave the leftover instead of the number of groups',
      explanation:
        `${remainder} is what is left over at the end, and it is right — but this question asked ` +
        `how many whole groups of ${divisor} there are. That is ${quotient}. Both numbers are ` +
        `part of the answer to ${dividend} ${DIVIDE} ${divisor}; the question picks which one it ` +
        `wants.`,
    })
  }

  out.push(
    {
      id: 'stopped-too-early',
      value: quotient - 1,
      label: 'Stopped one group short',
      explanation:
        `${groups(quotient - 1)} uses up ${(quotient - 1) * divisor}, which leaves ` +
        `${dividend - (quotient - 1) * divisor} over. That is still ${divisor} or more, so one ` +
        `more whole group of ${divisor} can still be made. Keep going until what is left is ` +
        `smaller than ${divisor}.`,
    },
    {
      id: 'one-group-too-many',
      value: quotient + 1,
      label: 'Counted one group too many',
      explanation:
        `${groups(quotient + 1)} would need ${(quotient + 1) * divisor}, and there is only ` +
        `${dividend}. The last group cannot be filled. ${groups(quotient)} uses ` +
        `${quotient * divisor}` +
        (remainder > 0
          ? `, and the ${remainder} left over is not enough for another one.`
          : `, which is all of it — there is nothing left for another one.`),
    },
  )

  return out
}

function remainderMistakes({ dividend, divisor, quotient, remainder }: Division): Candidate[] {
  return [
    {
      id: 'answered-the-quotient',
      value: quotient,
      label: 'Gave the number of groups instead of the leftover',
      explanation:
        `${quotient} is how many whole groups of ${divisor} there are, and it is right — but this ` +
        `question asked what is left over once those groups are made. ` +
        `${quotient} ${TIMES} ${divisor} = ${quotient * divisor}, and ${dividend} ${MINUS} ` +
        `${quotient * divisor} = ${remainder}.`,
    },
    {
      id: 'stopped-too-early',
      value: remainder + divisor,
      label: 'Left a remainder as big as the divisor',
      explanation:
        `A remainder has to be smaller than ${divisor}. ${remainder + divisor} is ` +
        `${divisor} or more, which means one more whole group of ${divisor} could still have been ` +
        `taken out. Take it out and ${remainder} is what is really left.`,
    },
    {
      id: 'dropped-the-remainder',
      value: 0,
      label: 'Said there was nothing left over',
      explanation:
        `${divisor} does not go into ${dividend} exactly. ${groups(quotient)} of ${divisor} is ` +
        `${quotient * divisor}, which is ${remainder} short of ${dividend}, so ${remainder} is ` +
        `left over. A remainder of 0 only happens when it divides exactly.`,
    },
  ]
}
