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
 * having a trick that makes it easy. Twos and fives are easy; threes, fours,
 * sixes, nines are middling; sevens and eights are where fourth graders
 * actually stall.
 *
 * **Zeros and ones are rules, not facts, and are served as a rarity.** They
 * used to be the whole of the bottom band, and because Elo targeting aims a
 * little under the rating, a player rated anywhere up to about 60 here was
 * being served `0 × n` and `1 × n` for two thirds of his multiplication
 * facts — and nine tackle-backs in ten, since a scaffold aims lower still. A
 * ten-year-old entering fifth grade has those rows cold; a drill made of them
 * is not a drill, and a rung made of them leads nowhere. They stay in the two
 * lower bands at one draw in eight, as a check that the rule is still there,
 * and `generateFact` can leave them out altogether for the tackle-back.
 * * The two edges of the table are where the care goes. `a × 1` answered as
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

/** Facts a fourth grader gets from doubling or from counting in fives. */
const EASY = [2, 5]
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
 * A fact you get from a rule rather than from memory: anything times 0 or 1.
 *
 * `0 × 8` is not a thing to recall, and banding it by the 8 would put it in
 * front of the child who least needs it. These are kept out of the hardness
 * scale altogether and drawn from their own small pool, rarely.
 */
export function isRuleFact(a: number, b: number): boolean {
  return a <= 1 || b <= 1
}

/**
 * How hard a real fact is: the two factors' tiers added, so a hard factor met
 * by a middling one lands above two middling ones. Rule facts do not have a
 * hardness; ask `isRuleFact` first.
 */
function hardness(a: number, b: number): number {
  return tier(a) + tier(b)
}

/**
 * The same scale, for callers choosing between facts: 0 for `2 × 5`, 4 for
 * `7 × 8`, and below 0 for a rule fact so those always sort first and can be
 * recognised. `decompose` uses it to take the *easiest* fact out of a missed
 * question, because a scaffold is a rung and not a second test.
 */
export function factHardness(a: number, b: number): number {
  return isRuleFact(a, b) ? -1 : hardness(a, b)
}

/**
 * The four difficulty bands, easiest first, as the range of fact hardness each
 * one draws from, and whether the rule facts may appear in it at all.
 *
 * The bands overlap by one step rather than partitioning cleanly, so a rating
 * sitting near a boundary does not flip between two disjoint sets of facts on
 * every question. The bottom band is the twos and fives, on their own and
 * against the middling row — the facts a child who has just learned his tables
 * really does know. The top band is the smallest — twenty facts — because the
 * genuinely hard corner of a 9 by 9 table is genuinely small, and drilling
 * exactly it is the point.
 */
const BANDS: readonly { min: number; max: number; rules: boolean }[] = [
  { min: 0, max: 1, rules: true },
  { min: 1, max: 2, rules: true },
  { min: 2, max: 3, rules: false },
  { min: 3, max: 4, rules: false },
]

/**
 * One draw in this many is a rule fact, in the bands that allow them.
 *
 * Small enough that a match never reads as a row of zeros, large enough that
 * `7 × 0` answered as `7` — the one real mistake on that row — still gets met
 * and named now and then.
 */
const RULE_SHARE = 8

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

/** Every fact in the table bar `0 × 0`, both orders. */
function allFacts(): Fact[] {
  const out: Fact[] = []
  for (let a = 0; a <= 9; a++) {
    for (let b = 0; b <= 9; b++) {
      if (a === 0 && b === 0) continue
      // Both orders are kept. `7 × 8` and `8 × 7` are the same product and not
      // the same question to a child who learned his tables one row at a time.
      out.push({ a, b })
    }
  }
  return out
}

/** The real facts a band draws from — never a rule fact. */
function poolFor(index: number): Fact[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const { min, max } = BANDS[index]!
  const pool = allFacts().filter(({ a, b }) => {
    if (isRuleFact(a, b)) return false
    const h = hardness(a, b)
    return h >= min && h <= max
  })
  POOLS.set(index, pool)
  return pool
}

/** The times-0 and times-1 rows, both orders, without `0 × 0`. */
const RULE_POOL: readonly Fact[] = allFacts().filter(({ a, b }) => isRuleFact(a, b))

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
    return generateFact(difficulty, rng, true)
  },
}

/**
 * Draw a fact at a difficulty.
 *
 * `allowRules` is what separates practice from a tackle-back. In practice the
 * rule facts appear at `RULE_SHARE` in the lower bands. A tackle-back is the
 * rung back to a question he just missed, and `7 × 0` is not a rung to
 * anything, so `chooseScaffold` asks with `false` and is never handed one.
 *
 * The rule draw comes first and consumes one `rng` call whether or not it hits,
 * so the fact drawn for a seed with rules allowed is the same fact drawn for
 * that seed with them refused whenever the coin says no.
 */
export function generateFact(difficulty: number, rng: Rng, allowRules: boolean): Item {
  const d = clampDifficulty(difficulty)
  const band = BANDS[bandIndexFor(d)]!
  const rule = band.rules && rng.int(0, RULE_SHARE - 1) === 0
  const { a, b } = rule && allowRules ? rng.pick(RULE_POOL) : rng.pick(poolFor(bandIndexFor(d)))
  return buildFact(a, b, d)
}

/**
 * A named fact as an item, for a tackle-back decomposed from the question he
 * missed: `347 × 6` becomes `7 × 6`, chosen rather than drawn.
 *
 * Pitched by how hard the fact is, not by what he was asked, so the rating on
 * this standard moves by what he actually answered. A rule fact sits at the
 * floor; a real fact sits in the middle of the lowest band that draws it.
 *
 * Throws on anything outside the table. The callers build these from a
 * question's own digits and check them first, so a throw here is a bug and not
 * a thing to recover from quietly.
 */
export function factItem(a: number, b: number): Item {
  const inTable = (n: number) => Number.isInteger(n) && n >= 0 && n <= 9
  if (!inTable(a) || !inTable(b) || (a === 0 && b === 0)) {
    throw new RangeError(`${a} × ${b} is not a fact in the table`)
  }
  return buildFact(a, b, difficultyForFact(a, b))
}

function difficultyForFact(a: number, b: number): number {
  const [lo, hi] = RANGE
  if (isRuleFact(a, b)) return lo
  const h = hardness(a, b)
  const index = BANDS.findIndex((band) => h >= band.min && h <= band.max)
  const width = (hi - lo + 1) / BANDS.length
  return Math.round(lo + width * index + width / 2)
}

function buildFact(a: number, b: number, difficulty: number): Item {
  const product = a * b
  return {
    standardId: 'FLU.MULT',
    difficulty,
    prompt: `${a} ${TIMES} ${b}`,
    // The largest product here is 81, so every value is an exact whole number
    // nowhere near where doubles stop being exact.
    answer: { kind: 'rational', canonical: String(product) },
    params: { a, b },
    workedSteps: workedSteps(a, b, product),
    misconceptions: misconceptionsFor(a, b, product),
  }
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
