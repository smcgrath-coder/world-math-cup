/**
 * MT.4.NF.2 — comparing two fractions.
 *
 * "Compare two fractions with different numerators and different denominators
 * by creating common denominators or numerators, or by comparing to a benchmark
 * fraction such as 1/2 ... Record the results of comparisons with symbols >, =,
 * or <, and justify the conclusions."
 *
 * `AnswerSpec` only knows how to grade a number, so the recording half of the
 * standard cannot be a `>` typed into the answer box — it would be unparseable
 * and the checker would refuse to score it. Instead he types the greater
 * fraction itself, which is the same judgement expressed as a value. The
 * justifying half lives in the worked steps, which always show the common
 * denominator rather than only announcing the winner.
 *
 * Note the consequence for misconceptions: with two fractions on screen and one
 * of them wanted back, there is exactly one wrong value a child can mean to
 * type. So every item names exactly one mistake, and which one it is depends on
 * the shape of the pair. See `misconceptionFor`.
 */

import { Rational as R } from '../../rational'
import type { Item, ItemGenerator, Misconception, Rng } from '../types'

const RANGE: [number, number] = [8, 78]

/**
 * How close two fractions have to be for the hardest band to accept them.
 *
 * An eighth is about the point where eyeballing stops working. 3/5 against 5/8
 * is a fortieth apart and has to be computed; 1/4 against 7/8 does not.
 */
const CLOSE = new R(1, 8)

/**
 * The four difficulty bands, easiest first.
 *
 * The dials are all about which shortcut is available, because on this standard
 * that is what difficulty means. Bigger denominators barely matter; being
 * denied the half-benchmark matters enormously.
 *
 *  - `benchmark: 'split'` puts the two fractions on opposite sides of 1/2, so
 *    the benchmark alone settles it. That is the easiest true version of this
 *    standard and is exactly what the standard names first.
 *  - `benchmark: 'sameSide'` denies that shortcut: both above a half or both
 *    below it, so common denominators are the only way through.
 *  - `denRelation: 'multiple'` means one denominator goes into the other, so the
 *    common denominator is already on screen. `'coprime'` means it is the full
 *    product and every piece has to be rebuilt.
 *  - `close` forces the hardest band to sit within an eighth, so estimating is
 *    not enough.
 */
const BANDS = [
  { dens: [2, 3, 4, 6, 8], benchmark: 'split', denRelation: 'multiple', close: false },
  { dens: [3, 4, 5, 6, 8, 10], benchmark: 'any', denRelation: 'any', close: false },
  { dens: [4, 5, 6, 8, 9, 10, 12], benchmark: 'sameSide', denRelation: 'any', close: false },
  { dens: [5, 6, 7, 8, 9, 10, 12], benchmark: 'sameSide', denRelation: 'coprime', close: true },
] as const

type Band = (typeof BANDS)[number]

interface Pair {
  n1: number
  d1: number
  n2: number
  d2: number
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

function gcd(a: number, b: number): number {
  return b === 0 ? a : gcd(b, a % b)
}

/** Every top number making a proper fraction in lowest terms over `den`. */
function numeratorsFor(den: number): number[] {
  const out: number[] = []
  for (let n = 1; n < den; n++) if (gcd(n, den) === 1) out.push(n)
  return out
}

/** -1, 0 or 1 as the fraction is below, exactly on, or above one half. */
function versusHalf(n: number, d: number): number {
  return Math.sign(n * 2 - d)
}

/**
 * Every structurally legal pair for a band: different denominators, different
 * numerators, both proper and in lowest terms.
 *
 * Two fractions in lowest terms over different denominators can never be equal,
 * so "never ask him to compare two equal fractions" is a consequence of this
 * list rather than a check bolted on afterwards.
 *
 * Both orders appear, so the answer is never predictable from its position.
 */
function legalPairs(dens: readonly number[]): Pair[] {
  const out: Pair[] = []
  for (const d1 of dens) {
    for (const d2 of dens) {
      if (d1 === d2) continue
      for (const n1 of numeratorsFor(d1)) {
        for (const n2 of numeratorsFor(d2)) {
          if (n1 === n2) continue
          out.push({ n1, d1, n2, d2 })
        }
      }
    }
  }
  return out
}

/** Does this pair do what the band is for? */
function suitsBand(band: Band, p: Pair): boolean {
  const sideA = versusHalf(p.n1, p.d1)
  const sideB = versusHalf(p.n2, p.d2)
  if (band.benchmark === 'split' && sideA === sideB) return false
  // A fraction sitting exactly on a half would let the benchmark settle it after
  // all, which is the one thing this band is built to prevent.
  if (band.benchmark === 'sameSide' && (sideA !== sideB || sideA === 0)) return false

  const g = gcd(p.d1, p.d2)
  if (band.denRelation === 'multiple' && p.d1 % p.d2 !== 0 && p.d2 % p.d1 !== 0) return false
  if (band.denRelation === 'coprime' && g !== 1) return false

  if (band.close) {
    const gap = new R(p.n1, p.d1).sub(new R(p.n2, p.d2))
    if (new R(Math.abs(gap.n), gap.d).compare(CLOSE) > 0) return false
  }
  return true
}

/**
 * The pool a band draws from, built once and reused.
 *
 * Enumerating and filtering rather than drawing and redrawing is deliberate.
 * There is no loop here that can fail to terminate and no fallback that quietly
 * breaks the band's promise: if a band's constraints are satisfiable at all,
 * they hold on every single item it emits. The list is a pure function of the
 * band, so caching it cannot make the generator non-deterministic.
 *
 * The `legal` fallback only fires if a band is written with constraints nothing
 * satisfies, which is a programming mistake — but the game keeps running on a
 * slightly-too-easy question rather than crashing mid-match.
 */
const POOLS = new Map<number, Pair[]>()

function poolFor(index: number): Pair[] {
  const cached = POOLS.get(index)
  if (cached) return cached
  const band = BANDS[index]!
  const legal = legalPairs(band.dens)
  const suited = legal.filter((p) => suitsBand(band, p))
  const pool = suited.length > 0 ? suited : legal
  POOLS.set(index, pool)
  return pool
}

export const mt4nf2: ItemGenerator = {
  standardId: 'MT.4.NF.2',
  label: 'Comparing fractions',
  range: RANGE,

  generate(difficulty: number, rng: Rng): Item {
    const d = clampDifficulty(difficulty)
    const { n1, d1, n2, d2 } = rng.pick(poolFor(bandIndexFor(d)))

    const first = new R(n1, d1)
    const second = new R(n2, d2)
    const firstWins = first.compare(second) > 0
    const winner = firstWins ? { n: n1, d: d1 } : { n: n2, d: d2 }
    const loser = firstWins ? { n: n2, d: d2 } : { n: n1, d: d1 }

    return {
      standardId: 'MT.4.NF.2',
      difficulty: d,
      prompt: `Which is greater: ${n1}/${d1} or ${n2}/${d2}?`,
      answer: { kind: 'rational', canonical: `${winner.n}/${winner.d}` },
      params: { n1, d1, n2, d2 },
      workedSteps: workedSteps(n1, d1, n2, d2, winner),
      misconceptions: [misconceptionFor(winner, loser)],
    }
  },
}

interface Side {
  n: number
  d: number
}

/**
 * "less than 1/2", "exactly 1/2", "more than 1/2".
 *
 * Written as the fraction rather than as the word "half" because the two get
 * mixed together out loud — "more than a half" and "more than half" are
 * different registers of the same sentence — and because 1/2 is the benchmark
 * the standard actually names.
 */
function halfPhrase(n: number, d: number): string {
  const side = versusHalf(n, d)
  if (side < 0) return 'less than 1/2'
  if (side > 0) return 'more than 1/2'
  return 'exactly 1/2'
}

function workedSteps(n1: number, d1: number, n2: number, d2: number, winner: Side): string[] {
  const steps: string[] = []
  const settled = versusHalf(n1, d1) !== versusHalf(n2, d2)

  steps.push(
    settled
      ? `Check them against 1/2 first: ${n1}/${d1} is ${halfPhrase(n1, d1)} and ` +
          `${n2}/${d2} is ${halfPhrase(n2, d2)}. That settles it on its own.`
      : `Both of these are ${halfPhrase(n1, d1)}, so that does not settle it this time.`,
  )

  const common = (d1 * d2) / gcd(d1, d2)
  const sameBottom =
    common === d1 || common === d2
      ? `${common} works for both, because ${common === d1 ? d2 : d1} goes into ${common} exactly.`
      : `${d1} and ${d2} both go into ${common}.`
  steps.push(
    `${settled ? 'Check it the long way too. ' : ''}Give them the same bottom number: ${sameBottom}`,
  )

  const left = n1 * (common / d1)
  const right = n2 * (common / d2)
  steps.push(`${rewrite(n1, d1, left, common)} and ${rewrite(n2, d2, right, common)}.`)
  steps.push(
    `Now every piece is the same size, so just count them: ` +
      `${Math.max(left, right)} is more than ${Math.min(left, right)}.`,
  )
  steps.push(`So ${winner.n}/${winner.d} is the greater one.`)

  return steps
}

/** `3/5 = 24/40`, or `5/8 is already there` when it needs no changing. */
function rewrite(n: number, d: number, scaled: number, common: number): string {
  return d === common ? `${n}/${d} is already there` : `${n}/${d} = ${scaled}/${common}`
}

/**
 * The one wrong answer there is, and the most honest reason for it.
 *
 * Two heuristics are worth naming here, and the arithmetic decides which one is
 * even possible:
 *
 *  - A child who thinks a bigger bottom number means a bigger fraction is only
 *    led astray when the smaller fraction is the one with the bigger bottom
 *    number.
 *  - A child who thinks a bigger top number means a bigger fraction is only led
 *    astray when the smaller fraction has the bigger top number — and that can
 *    only ever happen when it *also* has the bigger bottom number. (If the
 *    smaller fraction had the bigger top and the smaller bottom, it would be the
 *    larger fraction, which is a contradiction.) So the top-number mistake never
 *    arrives on its own, and claiming to have spotted it alone would be a guess.
 *
 * Hence three cases rather than two, and the middle one says plainly that both
 * numbers were bigger — the whole-number thinking that sits underneath both
 * heuristics — instead of picking one at random and sounding certain.
 *
 * Explanations are written for a ten-year-old who is already braced for bad
 * news: short sentences, no jargon, and never a word about carelessness.
 */
function misconceptionFor(winner: Side, loser: Side): Misconception {
  const signature = `${loser.n}/${loser.d}`
  const lost = `${loser.n}/${loser.d}`
  const won = `${winner.n}/${winner.d}`

  if (loser.d > winner.d && loser.n > winner.n) {
    return {
      id: 'bigger-numbers-win',
      signature,
      label: 'Went with the bigger-looking numbers',
      explanation:
        `${lost} has the bigger top number and the bigger bottom number, so it looks like the ` +
        `bigger fraction. Fractions do not work that way — the bottom number says how small ` +
        `the pieces are, so a big bottom number pulls the amount down. Put them over the same ` +
        `bottom number and ${won} comes out ahead.`,
    }
  }

  if (loser.d > winner.d) {
    return {
      id: 'bigger-denominator-wins',
      signature,
      label: 'Chose the bigger bottom number',
      explanation:
        `${loser.d} is a bigger number than ${winner.d}, but on the bottom that makes the ` +
        `fraction smaller, not bigger. Cutting a whole into ${loser.d} pieces gives smaller ` +
        `pieces than cutting it into ${winner.d}. So ${won} is the greater one.`,
    }
  }

  return {
    id: 'picked-the-smaller',
    signature,
    label: 'Picked the smaller one',
    explanation:
      `${lost} is the smaller of the two. Give both the same bottom number and the pieces come ` +
      `out the same size, so you can just count them — ${won} has more.`,
  }
}
