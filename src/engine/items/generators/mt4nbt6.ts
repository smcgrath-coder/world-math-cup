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
 * item asks for one number and the prompt says which. He meets both parts, just
 * not in the same breath, and asking for the remainder on its own turns out to
 * be the more honest question anyway: it is the part children drop.
 *
 * Every item is built the other way round from how it is solved. A quotient, a
 * divisor and a remainder are chosen first and multiplied back into a dividend,
 * so `quotient × divisor + remainder = dividend` and `0 <= remainder < divisor`
 * are true by construction rather than by a filter that has to be got right.
 * There is nothing here to redraw and nothing that can fail.
 *
 * Six formats. This generator used to ask "how many whole groups" and "what is
 * the remainder" and nothing else — two prompt shapes, the commonest 69% of
 * items — and Rion, who is ten and plays this, said the questions felt
 * repetitive: "the subject might change slightly, but the pattern remained." So:
 *
 *  - `QUOTIENT` and `REMAINDER` are the bare questions, as before.
 *  - `WORD_GROUPS` and `WORD_LEFTOVER` put the same division in a situation where
 *    the leftover is a real thing: cookies that did not fill a box. Same setup,
 *    two different questions, so the sentence has to be read rather than matched.
 *    A remainder is an abstraction until it is four cookies.
 *  - `MISSING_DIVIDEND` runs the whole thing backwards: `? ÷ 8 = 82 remainder 5`.
 *    The only way through is that the groups and the leftover together make the
 *    number you started with, which is the relationship the standard names.
 *  - `BIGGEST_FIT` asks for what the whole groups use up: "the biggest multiple
 *    of 6 that is not bigger than 187". That is the step in the middle of every
 *    division with a remainder, asked about on its own.
 *
 * Format choice is variety, not difficulty. The formats are banded only so that
 * the easiest band measures one thing and the backwards question arrives later;
 * within every band the digit count, the divisor and whether anything is left
 * over still do the work they always did.
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

const RANGE: [number, number] = [20, 92]

/**
 * The question formats, and the value of the `format` param that names each one.
 *
 * Exported because `params` has to carry enough for the soundness test to
 * recompute the answer independently, and which question was asked is part of
 * that: the same dividend and divisor make 30 (the groups), 4 (the leftover) and
 * 180 (what the groups use up).
 */
export const QUOTIENT = 0
export const REMAINDER = 1
export const WORD_GROUPS = 2
export const WORD_LEFTOVER = 3
export const MISSING_DIVIDEND = 4
export const BIGGEST_FIT = 5

interface Band {
  digits: readonly number[]
  divisors: readonly number[]
  mayDivideExactly: boolean
  formats: readonly number[]
}

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
 *  - `formats` keeps the bottom band on "how many groups", bare and in a
 *    situation. Asking what is left over is a second question on top of the
 *    division, and the easiest band should be measuring one thing. Working
 *    backwards from the answer is a step further again, so it waits for the
 *    second half of the range.
 */
const BANDS: readonly Band[] = [
  {
    digits: [2],
    divisors: [2, 3, 4, 5],
    mayDivideExactly: true,
    formats: [QUOTIENT, WORD_GROUPS],
  },
  {
    digits: [2, 3],
    divisors: [2, 3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: true,
    formats: [QUOTIENT, REMAINDER, WORD_GROUPS, WORD_LEFTOVER, BIGGEST_FIT],
  },
  {
    digits: [3],
    divisors: [2, 3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: false,
    formats: [QUOTIENT, REMAINDER, WORD_GROUPS, WORD_LEFTOVER, BIGGEST_FIT, MISSING_DIVIDEND],
  },
  {
    digits: [3, 4, 4],
    divisors: [3, 4, 5, 6, 7, 8, 9],
    mayDivideExactly: false,
    formats: [QUOTIENT, REMAINDER, WORD_GROUPS, WORD_LEFTOVER, BIGGEST_FIT, MISSING_DIVIDEND],
  },
]

/**
 * Situations where a leftover is a real thing you could point at.
 *
 * That is the whole reason these exist. "What is the remainder?" is a question
 * about notation; "how many cookies are left over?" is a question about cookies,
 * and a child who can answer the second one understands the first. Each context
 * carries both questions written out, because the natural way to ask changes with
 * the situation — boxes get *filled*, rows are *complete*.
 *
 * Exported so the soundness test can rebuild a prompt from `params` character
 * for character — which shares the words, never the arithmetic.
 */
export const CONTEXTS: readonly {
  item: string
  items: string
  group: string
  groups: string
  /** Reads after the count: "184 cookies are packed into boxes of 6". */
  verb: string
  askGroups: string
  askLeftover: string
}[] = [
  {
    item: 'cookie',
    items: 'cookies',
    group: 'box',
    groups: 'boxes',
    verb: 'packed into',
    askGroups: 'How many boxes can be filled completely?',
    askLeftover: 'How many cookies are left over?',
  },
  {
    item: 'pencil',
    items: 'pencils',
    group: 'pack',
    groups: 'packs',
    verb: 'bundled into',
    askGroups: 'How many full packs are there?',
    askLeftover: 'How many pencils are left over?',
  },
  {
    item: 'apple',
    items: 'apples',
    group: 'basket',
    groups: 'baskets',
    verb: 'sorted into',
    askGroups: 'How many baskets can be filled completely?',
    askLeftover: 'How many apples are left over?',
  },
  {
    item: 'chair',
    items: 'chairs',
    group: 'row',
    groups: 'rows',
    verb: 'set out in',
    askGroups: 'How many complete rows are there?',
    askLeftover: 'How many chairs are left over?',
  },
  {
    item: 'marble',
    items: 'marbles',
    group: 'jar',
    groups: 'jars',
    verb: 'shared out into',
    askGroups: 'How many jars can be filled completely?',
    askLeftover: 'How many marbles are left over?',
  },
  {
    item: 'egg',
    items: 'eggs',
    group: 'carton',
    groups: 'cartons',
    verb: 'packed into',
    askGroups: 'How many cartons can be filled completely?',
    askLeftover: 'How many eggs are left over?',
  },
]

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

/** `1 cookie`, `184 cookies`. */
function count(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
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
 *
 * `needsLeftover` is the hidden-dividend format asking for something the band
 * might not otherwise promise. `? ÷ 8 = 82 remainder 0` is a strange question to
 * ask, and it is also the one shape where both of that format's named mistakes
 * land on the correct answer — which would leave the item with nothing at all to
 * say about a wrong answer.
 */
function build(rng: Rng, band: Band, digits: number, needsLeftover: boolean): Division {
  const divisor = rng.pick(band.divisors)
  const remainder =
    band.mayDivideExactly && !needsLeftover ? rng.int(0, divisor - 1) : rng.int(1, divisor - 1)

  const [lo, hi] = digitRange(digits)
  const lowest = Math.ceil(lo / divisor)
  // `Math.max` only matters if a band is ever written with a digit range too
  // narrow to hold a single quotient, which would otherwise reach `rng.int` as
  // an empty range and throw mid-match.
  const highest = Math.max(lowest, Math.floor((hi - remainder) / divisor))
  const quotient = rng.int(lowest, highest)

  return { dividend: quotient * divisor + remainder, divisor, quotient, remainder }
}

/** What a format decides, before the common parts are wrapped around it. */
interface Draft {
  prompt: string
  promptWithSlot?: string
  answer: string
  /** Params this format needs beyond the dividend, the divisor and `format`. */
  extra: Record<string, number>
  workedSteps: string[]
  misconceptions: Misconception[]
}

export const mt4nbt6: ItemGenerator = {
  standardId: 'MT.4.NBT.6',
  label: 'Dividing with remainders',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const band = BANDS[bandIndexFor(d)]!
    const format = rng.pick(band.formats)
    const division = build(rng, band, rng.pick(band.digits), format === MISSING_DIVIDEND)

    const draft = draftFor(format, division, rng)

    return {
      standardId: 'MT.4.NBT.6',
      difficulty: d,
      prompt: draft.prompt,
      ...(draft.promptWithSlot === undefined ? {} : { promptWithSlot: draft.promptWithSlot }),
      // Whole numbers under ten thousand throughout, so the key is exact.
      answer: { kind: 'rational', canonical: draft.answer },
      // Only the two numbers the division is made of. The quotient and the
      // remainder are deliberately left out: a test handed those would be
      // checking the generator's arithmetic against itself, and it has to take
      // the dividend and the divisor apart on its own.
      params: {
        dividend: division.dividend,
        divisor: division.divisor,
        format,
        ...draft.extra,
      },
      workedSteps: draft.workedSteps,
      misconceptions: draft.misconceptions,
    }
  },
}

function draftFor(format: number, division: Division, rng: Rng): Draft {
  switch (format) {
    case REMAINDER:
      return bareRemainder(division)
    case WORD_GROUPS:
      return wordGroups(division, rng.int(0, CONTEXTS.length - 1))
    case WORD_LEFTOVER:
      return wordLeftover(division, rng.int(0, CONTEXTS.length - 1))
    case MISSING_DIVIDEND:
      return missingDividend(division)
    case BIGGEST_FIT:
      return biggestFit(division)
    default:
      return bareQuotient(division)
  }
}

// ---------------------------------------------------------------------------
// The formats

/** `184 ÷ 6. How many whole groups of 6?` */
function bareQuotient(division: Division): Draft {
  const { dividend, divisor, quotient } = division
  return {
    prompt: `${dividend} ${DIVIDE} ${divisor}. How many whole groups of ${divisor}?`,
    answer: String(quotient),
    extra: {},
    workedSteps: [
      ...divisionSteps(division),
      `The question asked how many whole groups, so the answer is ${quotient}.`,
    ],
    misconceptions: keep(quotientMistakes(division), quotient),
  }
}

/** `184 ÷ 6. What is the remainder?` */
function bareRemainder(division: Division): Draft {
  const { dividend, divisor, remainder } = division
  return {
    prompt: `${dividend} ${DIVIDE} ${divisor}. What is the remainder?`,
    answer: String(remainder),
    extra: {},
    workedSteps: [
      ...divisionSteps(division),
      `The question asked for the remainder, so the answer is ${remainder}.`,
    ],
    misconceptions: keep(remainderMistakes(division), remainder),
  }
}

/** The same division, with the groups being something you could point at. */
function wordGroups(division: Division, index: number): Draft {
  const c = CONTEXTS[index]!
  const { dividend, divisor, quotient, remainder } = division

  return {
    prompt: `${setup(c, dividend, divisor)} ${c.askGroups}`,
    answer: String(quotient),
    extra: { context: index },
    workedSteps: [
      ...divisionSteps(division, `Each ${c.group} takes ${count(divisor, c.item, c.items)}, so ` +
        `this asks how many whole ${divisor}s fit inside ${dividend}.`),
      remainder === 0
        ? `Every ${c.item} went into a full ${c.group}, so ${count(quotient, c.group, c.groups)} ` +
          `${quotient === 1 ? 'gets' : 'get'} filled.`
        : `${count(quotient, c.group, c.groups)} ${quotient === 1 ? 'gets' : 'get'} filled, and ` +
          `the ${count(remainder, c.item, c.items)} left over ${remainder === 1 ? 'is' : 'are'} ` +
          `not enough for another one. The answer is ${quotient}.`,
    ],
    misconceptions: keep(quotientMistakes(division), quotient),
  }
}

/** The same situation, asking for the leftover instead. */
function wordLeftover(division: Division, index: number): Draft {
  const c = CONTEXTS[index]!
  const { dividend, divisor, quotient, remainder } = division

  return {
    prompt: `${setup(c, dividend, divisor)} ${c.askLeftover}`,
    answer: String(remainder),
    extra: { context: index },
    workedSteps: [
      ...divisionSteps(division, `Each ${c.group} takes ${count(divisor, c.item, c.items)}, so ` +
        `this asks how many whole ${divisor}s fit inside ${dividend} and what is left when they ` +
        `will not fit any more.`),
      remainder === 0
        ? `The ${count(quotient, c.group, c.groups)} used every ${c.item}, so nothing is left ` +
          `over. The answer is 0.`
        : `${count(quotient, c.group, c.groups)} ${quotient === 1 ? 'holds' : 'hold'} ` +
          `${count(quotient * divisor, c.item, c.items)}, and ` +
          `${count(remainder, c.item, c.items)} ${remainder === 1 ? 'is' : 'are'} left over. ` +
          `The answer is ${remainder}.`,
    ],
    misconceptions: keep(remainderMistakes(division), remainder),
  }
}

/** The sentence that sets the situation up. Shared by both word formats. */
function setup(c: (typeof CONTEXTS)[number], dividend: number, divisor: number): string {
  return `${count(dividend, c.item, c.items)} are ${c.verb} ${c.groups} of ${divisor}.`
}

/** `? ÷ 8 = 82 remainder 5`. The whole division run backwards. */
function missingDividend(division: Division): Draft {
  const { dividend, divisor, quotient, remainder } = division
  const used = quotient * divisor

  return {
    prompt:
      `? ${DIVIDE} ${divisor} = ${quotient} remainder ${remainder}. What is the missing number?`,
    promptWithSlot: `{} ${DIVIDE} ${divisor} = ${quotient} remainder ${remainder}`,
    answer: String(dividend),
    extra: {},
    workedSteps: [
      `${groups(quotient)} of ${divisor} were made out of the missing number, and ${remainder} ` +
        `was left over.`,
      `The groups used up ${quotient} ${TIMES} ${divisor} = ${used}.`,
      `The ${remainder} left over was never in a group, so it goes back on as well: ` +
        `${used} + ${remainder} = ${dividend}.`,
      `Check it: ${dividend} ${DIVIDE} ${divisor} = ${quotient} remainder ${remainder}.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available, because this format never draws a remainder of 0:
          // the groups on their own are short of the dividend by exactly the
          // leftover.
          id: 'forgot-the-remainder',
          value: used,
          label: 'Left the leftover off',
          explanation:
            `${quotient} ${TIMES} ${divisor} = ${used} is what the whole groups used up, and it ` +
            `is right. The ${remainder} left over was part of the number too — it just never made ` +
            `it into a group — so it goes back on: ${used} + ${remainder} = ${dividend}.`,
        },
        {
          id: 'added-before-multiplying',
          value: (quotient + remainder) * divisor,
          label: 'Put the leftover into the groups',
          explanation:
            `That is ${quotient} + ${remainder} = ${quotient + remainder}, all multiplied by ` +
            `${divisor}. It counts the ${remainder} left over as ${remainder} more ` +
            `${remainder === 1 ? 'group' : 'groups'} of ${divisor}, and a leftover is smaller than ` +
            `${divisor} so it cannot make even one. Multiply the groups ` +
            `first, then add the leftover: ${used} + ${remainder} = ${dividend}.`,
        },
      ],
      dividend,
    ),
  }
}

/** "What is the biggest multiple of 6 that is not bigger than 187?" */
function biggestFit(division: Division): Draft {
  const { dividend, divisor, quotient, remainder } = division
  const used = quotient * divisor

  return {
    prompt: `What is the biggest multiple of ${divisor} that is not bigger than ${dividend}?`,
    answer: String(used),
    extra: {},
    workedSteps: [
      `A multiple of ${divisor} is a number you land on counting up in ${divisor}s. The question ` +
        `asks for the last one before ${dividend} is passed.`,
      ...divisionSteps(
        division,
        `Counting up in ${divisor}s is the same as making groups of ${divisor}, so work out how ` +
          `many whole groups of ${divisor} fit inside ${dividend}: the multiple wanted is exactly ` +
          `those groups added up.`,
      ),
      remainder === 0
        ? `Nothing was left over, so ${dividend} is itself a multiple of ${divisor} and it is the ` +
          `answer: ${used}.`
        : `${groups(quotient)} of ${divisor} use up ${quotient} ${TIMES} ${divisor} = ${used}, ` +
          `which is ${remainder} short of ${dividend}. The next multiple up is ${used + divisor}, ` +
          `which goes past ${dividend}, so the answer is ${used}.`,
    ],
    misconceptions: keep(
      [
        {
          // Always available: the count of groups is the answer divided by a
          // divisor of at least 2, so it can never be the answer itself.
          id: 'answered-the-count',
          value: quotient,
          label: 'Gave how many groups instead of how much they come to',
          explanation:
            `${quotient} is how many whole ${divisor}s fit inside ${dividend}, and working that ` +
            `out is most of the job. The question asks how much those ${divisor}s come to ` +
            `altogether: ${quotient} ${TIMES} ${divisor} = ${used}.`,
        },
        {
          id: 'went-one-too-far',
          value: used + divisor,
          label: 'Went one multiple too far',
          explanation:
            `${used + divisor} is a multiple of ${divisor}, but it is bigger than ${dividend}, and ` +
            `the question asks for one that is not. Step back one: ${used}.`,
        },
        {
          id: 'answered-the-number-itself',
          value: dividend,
          label: 'Gave the number in the question',
          explanation:
            `${dividend} is the number not to go past, and it is not a multiple of ${divisor} ` +
            `itself — counting up in ${divisor}s steps from ${used} straight to ` +
            `${used + divisor}. The last one before ${dividend} is ${used}.`,
        },
      ],
      used,
    ),
  }
}

// ---------------------------------------------------------------------------
// Worked steps

/**
 * Working through by place-value chunks, taking off a hundred groups at a time,
 * then tens, then ones.
 *
 * This is partial quotients rather than long division on purpose. It is the
 * strategy "based on place value" that the standard names first, every line of
 * it is a subtraction he can already do, and — unlike long division — a child
 * who loses his place can see from the numbers where he was.
 *
 * `opening` replaces the first line when the question is a word problem: a
 * situation has no `÷` sign on the screen, and a working that starts by talking
 * about one is talking about something the child cannot see.
 */
function divisionSteps(division: Division, opening?: string): string[] {
  const { dividend, divisor, quotient, remainder } = division

  const chunks = digitsOf(quotient)
    .map((digit, i) => digit * 10 ** i)
    .filter((value) => value > 0)
    .reverse()

  const steps = [
    opening ??
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

  return steps
}

// ---------------------------------------------------------------------------
// The wrong answers worth knowing by name, and the reason they happened
//
// Written for a ten-year-old who is already braced for bad news: short
// sentences, no jargon, and never a word about carelessness. Each one says what
// he did and what it would have been the answer to, because "here is the
// question you answered" is information and "wrong" is not.
//
// With two parts to the answer and one of them asked for, the first mistake to
// name is always the other part. Answering the quotient when the remainder was
// wanted is not a division error at all — the division was right — and saying so
// is the difference between a note that helps and a note that stings.

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

function keep(candidates: readonly Candidate[], correct: number): Misconception[] {
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
        `A remainder has to be smaller than ${divisor}, and ${remainder + divisor} is not. That ` +
        `means one more whole group of ${divisor} could still have been taken out. Take it out ` +
        `and ${remainder} is what is really left.`,
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
