/**
 * FLU.MULT — single-digit multiplication facts, for recall speed.
 *
 * Not a Montana standard, and deliberately so. The other eleven generators each
 * answer to a code in the curriculum; this one answers to the clock. It feeds
 * PAC, the pace stat, which is derived from how *fast* a correct answer comes
 * back rather than from whether it comes back at all — fast recall is fast
 * legs. A child who can reason his way to 7 × 8 in nine seconds and a child who
 * simply knows it are not the same player, and nothing else in the game can
 * tell them apart.
 *
 * **Single digit by single digit only, and nothing above 9.** MT.4.NBT.5 starts
 * at two-digit by one-digit, so keeping 10, 11 and 12 out of here is what makes
 * the two ratings measure different things: `12 × 8` is literally NBT.5's
 * territory ("a whole number of up to four digits by a one-digit whole
 * number"), and putting it here would leave PAC and DEF quietly measuring the
 * same skill. The elevens and twelves are worth learning; they are not worth
 * blurring the only two stats that can tell method apart from recall.
 *
 * **Banded by how hard the fact is, not by how big it is.** There are only 81
 * facts, so size is the wrong dial: 2 × 9 has a bigger product than 7 × 8 and
 * is a far easier fact, and 9 × 9 is the biggest product in the table while
 * having a trick that makes it easy. Zeros, ones, twos, fives are easy; threes,
 * fours, sixes, nines are middling; sevens and eights are where fourth graders
 * actually stall.
 *
 * The two edges of the table are where the care goes. `a × 1` answered as
 * `a + 1` and `a × 0` answered as `a` are the real mistakes and both are named.
 * But on `a × 0` almost every wrong answer worth naming collapses onto 0, which
 * is also the correct answer — and on `0 × 0` all of them do, which is why that
 * one square of the table is not drawn at all.
 */

import type { Item, ItemGenerator, Misconception, Rng } from '../types'

/**
 * U+00D7 MULTIPLICATION SIGN, not the letter x. Prompt text is display-only —
 * `checkAnswer` never sees it — so this cannot affect grading, and it is the
 * sign on his worksheets.
 */
const TIMES = '×'

const RANGE: [number, number] = [8, 88]

/** Facts a fourth grader gets from a rule rather than from memory. */
const EASY = [0, 1, 2, 5]
/** Known, but counted to rather than recalled. */
const MIDDLING = [3, 4, 6, 9]
/** Sevens and eights. Everything else is easier than these.  */
const HARD = [7, 8]

function tier(n: number): number {
  if (EASY.includes(n)) return 0
  if (MIDDLING.includes(n)) return 1
  if (HARD.includes(n)) return 2
  // Unreachable while both factors are single digits, which is what
  // `stays single digit by single digit` holds this generator to. If a 10, 11
  // or 12 ever arrives it lands above every real fact rather than silently
  // being filed alongside the sevens.
  return 3
}

/**
 * How hard a fact is.
 *
 * Anything times 0 or 1 is easy whatever it is multiplied by — `0 × 8` is a
 * rule, not a fact to recall, and banding it as hard because of the 8 would put
 * it in front of the child who least needs it. Everything else is the two
 * factors' tiers added, so a hard factor met by a middling one lands above two
 * middling ones.
 */
function hardness(a: number, b: number): number {
  if (a <= 1 || b <= 1) return 0
  return tier(a) + tier(b)
}

/**
 * The four difficulty bands, easiest first, as the range of fact hardness each
 * one draws from.
 *
 * The bands overlap by one step rather than partitioning cleanly, so a rating
 * sitting near a boundary does not flip between two disjoint sets of facts on
 * every question. The top band is the smallest — twenty facts — because the
 * genuinely hard corner of a 9 by 9 table is genuinely small, and drilling
 * exactly it is the point.
 */
const BANDS: readonly { min: number; max: number }[] = [
  { min: 0, max: 0 },
  { min: 0, max: 1 },
  { min: 1, max: 2 },
  { min: 3, max: 4 },
]

interface Fact {
  a: number
  b: number
}

/**
 * The facts a band draws from, enumerated once and reused.
 *
 * Enumerated and filtered rather than drawn and redrawn. The top band accepts
 * twenty of the eighty-one facts, so a redraw loop would spend most of its
 * budget missing and would then have to emit *something* — and the something it
 * emitted would be whichever fact it happened to hold when the budget ran out,
 * which is not a band at all. A filtered list either has an answer or visibly
 * does not.
 *
 * `0 × 0` is excluded everywhere. Every mistake worth naming on it lands on 0,
 * and so does the answer, so an item there could say nothing beyond "wrong".
 */
const POOLS = new Map<number, Fact[]>()

function poolFor(index: number): Fact[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const { min, max } = BANDS[index]!
  const pool: Fact[] = []
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      if (a === 0 && b === 0) continue
      const h = hardness(a, b)
      // Both orders are kept. `7 × 8` and `8 × 7` are the same product and not
      // the same question to a child who learned his tables one row at a time.
      if (h >= min && h <= max) pool.push({ a, b })
    }
  }
  POOLS.set(index, pool)
  return pool
}

function bandIndexFor(difficulty: number): number {
  const [lo, hi] = RANGE
  const share = (difficulty - lo) / (hi - lo + 1)
  return Math.max(0, Math.min(BANDS.length - 1, Math.floor(share * BANDS.length)))
}

/** Difficulties arrive from Elo targeting as any number in 0..99, often fractional. */
function clampDifficulty(difficulty: number): number {
  return Math.min(RANGE[1], Math.max(RANGE[0], difficulty))
}

/** `4 groups`, `1 group`. */
function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`
}

export const flumult: ItemGenerator = {
  standardId: 'FLU.MULT',
  label: 'Multiplication facts',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const { a, b } = rng.pick(poolFor(bandIndexFor(d)))
    const product = a * b

    return {
      standardId: 'FLU.MULT',
      difficulty: d,
      prompt: `${a} ${TIMES} ${b}`,
      // The largest product here is 81, so every value is an exact whole number
      // nowhere near where doubles stop being exact.
      answer: { kind: 'rational', canonical: String(product) },
      params: { a, b },
      workedSteps: workedSteps(a, b, product),
      misconceptions: misconceptionsFor(a, b, product),
    }
  },
}

/**
 * How many groups are worth writing out as an addition.
 *
 * Under this, `8 + 8 + 8 = 24` is where the fact comes from and is the most
 * convincing line on the page. Over it, a row of nine numbers stops being an
 * explanation and becomes something to skip, so the working leans on a fact he
 * already has instead.
 */
const SPELL_OUT_LIMIT = 5

/**
 * The working, for after a failed tackle-back.
 *
 * A fluency item is meant to be answered from memory, so the working here is
 * not "how to do it" — it is where the fact comes from, said in a way that
 * builds the next one. Every route offered is one he can use on the fact next
 * door: count the groups, step down one group from a fact he has, or double a
 * smaller one.
 */
function workedSteps(a: number, b: number, product: number): string[] {
  const last = `So ${a} ${TIMES} ${b} = ${product}.`

  if (a === 0) {
    // Not "not even one", which on `0 × 1` puts an "one" next to the 1 being
    // multiplied and reads as though the 1 were the thing there are none of.
    return [
      `0 ${TIMES} ${b} means no groups of ${b}. There are none of them, so there is nothing at ` +
        `all to count up.`,
      last,
    ]
  }
  if (b === 0) {
    return [
      `${a} ${TIMES} 0 means ${plural(a, 'group', 'groups')} of 0, and a group of 0 has nothing in it.`,
      `Nothing, counted ${plural(a, 'time', 'times')} over, is still nothing.`,
      last,
    ]
  }
  if (a === 1) {
    return [`1 ${TIMES} ${b} means one group of ${b}, so it is just ${b} on its own.`, last]
  }
  if (b === 1) {
    return [
      `${a} ${TIMES} 1 means ${plural(a, 'group', 'groups')} of 1. Counting ` +
        `${plural(a, 'one', 'ones')} gets you to ${a}.`,
      last,
    ]
  }

  const steps = [`${a} ${TIMES} ${b} means ${a} groups of ${b}.`]

  if (a <= SPELL_OUT_LIMIT) {
    steps.push(`Count them up: ${Array(a).fill(String(b)).join(' + ')} = ${product}.`)
  } else {
    // Named as a fact he may already have, plus one more group. This is the
    // route that turns 6 × 7 into 7 × 7 rather than leaving them unrelated.
    steps.push(
      `If you know ${a - 1} ${TIMES} ${b} = ${(a - 1) * b}, this is one group of ${b} more: ` +
        `${(a - 1) * b} + ${b} = ${product}.`,
    )
  }

  // Not at 2: "double 1 group of 8" is the line above it word for word, and
  // offering the same working twice as though it were a second idea is how a
  // page teaches a child to skim past the working.
  if (a % 2 === 0 && a > 2) {
    steps.push(
      `Another way in: ${a / 2} ${TIMES} ${b} = ${(a / 2) * b}, and ${a} groups is double that — ` +
        `${(a / 2) * b} + ${(a / 2) * b} = ${product}.`,
    )
  }

  steps.push(last)
  return steps
}

interface Candidate {
  id: string
  value: number
  label: string
  explanation: string
}

/**
 * The wrong answers worth knowing by name, and the reason they happened.
 *
 * Written for a ten-year-old who is already braced for bad news: short
 * sentences, no jargon, and never a word about carelessness. Each one says what
 * he did and what it would have been the answer to, because "here is the
 * question you answered" is information and "wrong" is not.
 *
 * The zero and one rows are why this function is longer than the arithmetic
 * deserves. Adding instead of multiplying is the same mistake everywhere, but
 * on `7 × 1` it shows up as 8 and on `7 × 0` it shows up as 7, and telling a
 * child "you added" without saying what that looked like on *this* fact is not
 * worth saying at all.
 */
function misconceptionsFor(a: number, b: number, product: number): Misconception[] {
  const short = product - b
  const over = product + b

  const candidates: Candidate[] = [
    {
      id: 'added-instead',
      value: a + b,
      label: b === 0 || a === 0 ? 'Left the number alone' : 'Added instead of multiplying',
      explanation: addedInsteadExplanation(a, b, product),
    },
    {
      id: 'one-group-short',
      value: short,
      label: 'One group short',
      explanation:
        a === 1
          ? `0 is what you have before you count any groups at all. This one asks for one group ` +
            `of ${b}, which is ${b}.`
          : `${short} is ${plural(a - 1, 'group', 'groups')} of ${b}, which is one group short. ` +
            `There are ${a} of them, so add one more ${b}: ${short} + ${b} = ${product}.`,
    },
    {
      id: 'one-group-too-many',
      value: over,
      label: 'One group too many',
      explanation:
        `${over} is ${plural(a + 1, 'group', 'groups')} of ${b}, which is one group too many. ` +
        `Take one group of ${b} back off and you are left with ${product}.`,
    },
  ]

  const out: Misconception[] = []
  const seen = new Set<string>()
  for (const c of candidates) {
    // Never name a correct answer as a known mistake. This is load-bearing on
    // the edges of the table rather than a belt: on `7 × 0` two of the three
    // land on 0, which is the answer, and on `2 × 2` adding gives 4, which is
    // also the answer.
    if (c.value === product) continue
    // A negative can only come from stepping a group below zero, which is not a
    // mistake anybody makes and is not a number anybody types.
    if (c.value < 0) continue
    const signature = String(c.value)
    // Two mistakes landing on the same value cannot be told apart. Keep the
    // first, which is the one that says more about what he was thinking.
    if (seen.has(signature)) continue
    seen.add(signature)
    out.push({ id: c.id, signature, label: c.label, explanation: c.explanation })
  }
  return out
}

function addedInsteadExplanation(a: number, b: number, product: number): string {
  if (a === 0) {
    return (
      `Adding 0 leaves a number alone, but multiplying by 0 does not. 0 ${TIMES} ${b} is no ` +
      `groups of ${b} at all, and that comes to 0.`
    )
  }
  if (b === 0) {
    return (
      `Adding 0 leaves a number alone, but multiplying by 0 does not. ${a} ${TIMES} 0 is ` +
      `${plural(a, 'group', 'groups')} of nothing at all, and that comes to 0.`
    )
  }
  if (a === 1) {
    return (
      `1 + ${b} = ${1 + b}. Multiplying by 1 does not add anything on: 1 ${TIMES} ${b} is one ` +
      `group of ${b}, which is just ${b}.`
    )
  }
  if (b === 1) {
    return (
      `${a} + 1 = ${a + 1}. Multiplying by 1 does not add anything on: ${a} ${TIMES} 1 is ` +
      `${plural(a, 'group', 'groups')} of 1, which comes back to ${a}.`
    )
  }
  return (
    `${a} + ${b} = ${a + b} is the two numbers put together. The ${TIMES} sign means groups ` +
    `instead: ${a} groups of ${b}, which is ${b} counted ${a} times over — ${product}.`
  )
}
