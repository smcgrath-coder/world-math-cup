/**
 * The fact inside a missed question.
 *
 * The design has always said the tackle-back is "a scaffolded sub-skill
 * question decomposed from what he just missed". What shipped first was a
 * random draw from the standard underneath, aimed at a 95% success rate — and
 * because a scaffold aims well under the rating, that draw landed in the very
 * bottom of the multiplication table: a miss on `347 × 6` was followed by
 * `7 × 0`. A rung to nowhere, and the one part of the match he noticed as
 * too easy.
 *
 * This module does what the design said. A long multiplication comes apart at
 * one of the facts inside it (`347 × 6` -> `7 × 6`); a division comes apart at
 * the fact between the divisor and a digit of the quotient (`97 ÷ 4` ->
 * `4 × 4`); a multiple question the same way; a factor question at one of its
 * factor pairs; an area at the multiplication it is; a fraction times a whole
 * at two of the lots added. Every number in the scaffold is a number from the
 * question he missed, or a digit of one, which is what makes it a
 * decomposition rather than a different question.
 *
 * **Never a rule fact.** Digits of 0 and 1 are skipped when the fact is being
 * chosen, because `7 × 0` and `1 × 6` are not rungs to anything. Where a
 * question has nothing but rule digits inside it (`11 × 5`) this says so with
 * `null`, and `chooseScaffold` falls back to a real fact drawn from the table.
 *
 * **The easiest fact inside, not any fact inside.** `347 × 8` holds `3 × 8`,
 * `4 × 8` and `7 × 8`, and a child who has just missed the long sum is not
 * helped by being handed the hardest square in the table on a clock. A
 * scaffold aims at a 90–95% success rate everywhere else in this game because
 * it is the rung back to the question and not a second test; choosing the
 * easiest real fact is how a decomposition keeps that promise. Ties are drawn
 * evenly, so `3 × 6` and `4 × 6` both get asked over time.
 *
 * Reads `params` only. That is the generators' published contract — the
 * soundness harness recomputes every answer from them — so a decomposition
 * built on them is as trustworthy as the key itself, and it never has to know
 * how a generator worded anything.
 */

import { factHardness, factItem, isRuleFact } from './generators/flumult'
import { factorBetween } from './generators/mt4md1'
import { productItem } from './generators/mt4nbt5'
import { sumItem } from './generators/mt4nf3'
import type { Item, Rng } from './types'

/**
 * Where each standard comes apart to. `MT.4.MD.3` lands on the facts when the
 * rectangle is a table fact and on `MT.4.NBT.5` when it is not, because area
 * is a multiplication before it is anything else and that multiplication is
 * whatever size the rectangle makes it.
 *
 * `match.test.ts` checks every entry here is a generatable standard, and that
 * nothing decomposes to itself.
 */
export const DECOMPOSES_TO: Record<string, readonly string[]> = {
  'MT.4.NBT.5': ['FLU.MULT'],
  'MT.4.NBT.6': ['FLU.MULT'],
  'MT.4.OA.1': ['FLU.MULT'],
  'MT.4.OA.4': ['FLU.MULT'],
  'MT.4.MD.1': ['FLU.MULT'],
  'MT.4.MD.3': ['FLU.MULT', 'MT.4.NBT.5'],
  'MT.4.NF.4': ['MT.4.NF.3'],
}

/** The sub-question a missed item comes apart into, or `null` if it has none. */
export function decompose(item: Item, rng: Rng): Item | null {
  const p = item.params
  switch (item.standardId) {
    case 'MT.4.NBT.5':
      return factInside(p.a, p.b, rng)
    case 'MT.4.NBT.6':
      return factInDivision(p.dividend, p.divisor, rng)
    case 'MT.4.OA.1':
      return timesAsMany(p.given, p.factor, p.direction, rng)
    case 'MT.4.OA.4':
      return p.by !== undefined && p.by > 0 ? factInDivision(p.n, p.by, rng) : factorPair(p.n, rng)
    case 'MT.4.MD.1':
      return factInside(p.quantity, factorBetween(p.from ?? -1, p.to ?? -1), rng)
    case 'MT.4.MD.3':
      return area(p.w, p.h, p.ask, rng)
    case 'MT.4.NF.4':
      return twoLots(p.n, p.den)
    default:
      return null
  }
}

/** The digits of a whole number that are facts rather than rules: 2 to 9. */
function factDigits(n: number | undefined): number[] {
  if (n === undefined || !Number.isInteger(n) || n < 0) return []
  const out: number[] = []
  for (const ch of String(n)) {
    const d = Number(ch)
    if (d >= 2 && !out.includes(d)) out.push(d)
  }
  return out
}

/**
 * A fact from inside `x × y`: a fact digit of one against a fact digit of the
 * other, the easiest such pair, drawn evenly among ties. `347 × 6` offers
 * `3 × 6`, `4 × 6` and `7 × 6` and asks one of the first two; `23 × 45` offers
 * four and asks `2 × 5`. The order is kept — the long number's digit is
 * written first when the long number was — so the fact reads the way the
 * question did.
 */
function factInside(x: number | undefined, y: number | undefined, rng: Rng): Item | null {
  const pairs: [number, number][] = []
  for (const a of factDigits(x)) for (const b of factDigits(y)) pairs.push([a, b])
  return easiestOf(pairs, rng)
}

/** The easiest of some facts, drawn evenly among ties; `null` when there are none. */
function easiestOf(pairs: readonly [number, number][], rng: Rng): Item | null {
  if (pairs.length === 0) return null
  const easiest = Math.min(...pairs.map(([a, b]) => factHardness(a, b)))
  const [a, b] = rng.pick(pairs.filter(([a, b]) => factHardness(a, b) === easiest))
  return factItem(a, b)
}

/**
 * The fact between the divisor and a digit of the whole-number quotient.
 * `97 ÷ 4` is 24 remainder 1, and the facts a child works through to get there
 * are `4 × 2` and `4 × 4`. The divisor is written first, as the times table
 * he counted up in.
 */
function factInDivision(dividend: number | undefined, divisor: number | undefined, rng: Rng): Item | null {
  if (dividend === undefined || divisor === undefined || divisor < 2 || divisor > 9) return null
  if (!Number.isInteger(dividend) || dividend < 0) return null
  return factInside(divisor, Math.floor(dividend / divisor), rng)
}

/**
 * `MT.4.OA.1` states either the smaller amount (forwards: multiply) or the
 * larger (backwards: divide). Either way the fact underneath is the smaller
 * amount times the factor.
 */
function timesAsMany(
  given: number | undefined,
  factor: number | undefined,
  direction: number | undefined,
  rng: Rng,
): Item | null {
  if (given === undefined || factor === undefined || factor < 1) return null
  const small = direction === 1 ? given : given / factor
  if (!Number.isInteger(small)) return null
  return factInside(small, factor, rng)
}

/**
 * The easiest factor pair of `n` with both factors in the table. `24` offers
 * `3 × 8` and `4 × 6` and asks `4 × 6`; a prime offers nothing, which is the
 * honest answer — there is no fact inside a prime to ask.
 */
function factorPair(n: number | undefined, rng: Rng): Item | null {
  if (n === undefined || !Number.isInteger(n) || n < 4) return null
  const pairs: [number, number][] = []
  for (let a = 2; a <= 9; a++) {
    if (n % a !== 0) continue
    const b = n / a
    if (b >= 2 && b <= 9) pairs.push([a, b])
  }
  return easiestOf(pairs, rng)
}

/**
 * An area is the multiplication `w × h` and nothing else. A table fact when
 * both sides are single digits, a long multiplication otherwise. A perimeter
 * is an addition, and nothing underneath this standard asks one.
 */
function area(w: number | undefined, h: number | undefined, ask: number | undefined, rng: Rng): Item | null {
  if (ask !== 1 || w === undefined || h === undefined) return null
  if (!Number.isInteger(w) || !Number.isInteger(h) || w < 1 || h < 1) return null
  if (w <= 9 && h <= 9) {
    if (isRuleFact(w, h)) return factInside(w, h, rng)
    return factItem(w, h)
  }
  return productItem(w, h)
}

/**
 * A fraction times a whole number is that fraction added to itself, and two of
 * the lots is the first rung of that. `3/4 × 3` -> `3/4 + 3/4`.
 */
function twoLots(n: number | undefined, den: number | undefined): Item | null {
  if (n === undefined || den === undefined) return null
  return sumItem(n, n, den)
}
