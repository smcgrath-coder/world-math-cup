/**
 * Choosing the next question.
 *
 * Two decisions, made together: *which* standard to ask about, and *how hard*
 * to make it. The second one is the reason this file has numbers in it that
 * must not be tuned away.
 *
 * **The default target is 0.75 success, not 0.5.** That follows Math Garden's
 * validated adaptive-practice work, and it exists for one specific ten-year-old:
 * capable, but avoidant, and prone to freezing in front of anything he suspects
 * is too hard for him. A coin-flip difficulty is the worst possible calibration
 * for that child. Even a shot on goal sits at 0.62 rather than 0.30 — a match is
 * meant to be hard because of the *chain* of questions it takes to score, so
 * beating Brazil stays a real achievement while every individual moment in front
 * of him stays winnable.
 *
 * **`probeWeakest` attacks the weakest standards, not the weakest domain.** If
 * DRI reads 78 because three fraction standards are strong, but one of them sits
 * at 41, a big match should find that one and ask about it. An average that
 * hides a specific hole is both bad teaching and an exploit: without this, the
 * way to beat Brazil would be to grind the standards you are already good at.
 * Attacking the gap and teaching well turn out to be the same mechanism.
 *
 * Selection never raises the difficulty to punish. Probing a weakness changes
 * the *topic*, and the difficulty is still aimed at his rating for that topic,
 * so a gap gets attacked at a difficulty he can win.
 */

import { STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { DomainCode } from '../curriculum/standards.generated'
import { SEED_RATING } from '../store/derive'
import type { StandardRating } from '../store/types'
import { difficultyForSuccess } from './elo'
import { ALL_GENERATORS } from './items/generators'
import type { Item, ItemGenerator, Rng } from './items/types'

export type Pressure =
  | 'own_third'
  | 'midfield'
  | 'final_third'
  | 'shot'
  | 'wide'
  | 'box'
  | 'outside18'
  | 'bicycle'
  | 'training'
  | 'penalty'

/**
 * The success probability each situation aims for.
 *
 * Read the file header before changing any of these. The short version: 0.75 is
 * the default because of who is playing, and the ladder from `own_third` to
 * `bicycle` is how a match gets hard without any single question being unfair.
 * `outside18` and `bicycle` are the only bands that dip to a coin flip or below,
 * and they are the only two the player chooses for himself — the courage track
 * pays out on attempting them whether or not they go in.
 */
export const TARGET_SUCCESS: Record<Pressure, number> = {
  own_third: 0.85,
  midfield: 0.75,
  final_third: 0.68,
  shot: 0.62,
  wide: 0.85,
  box: 0.62,
  outside18: 0.5,
  bicycle: 0.38,
  training: 0.75,
  penalty: 0.8,
}

export const PRESSURES = Object.keys(TARGET_SUCCESS) as readonly Pressure[]

/** Where an unrecognised pressure lands. The same as ordinary midfield play. */
const DEFAULT_TARGET = TARGET_SUCCESS.midfield

/**
 * How many rating points halve a standard's share of ordinary practice.
 *
 * Forty points is deliberately gentle. Practice should drift toward the gaps on
 * its own, but ordinary play must not turn into a drill on his worst topic — the
 * whole spread of realistic ratings is about eighty points, so the weakest
 * standard comes up roughly four times as often as the strongest and everything
 * in between stays in rotation.
 */
export const GENTLE_HALVING = 40

/**
 * The same knob when probing for gaps, which is three times sharper.
 *
 * Sharp enough that a big match reliably finds the hole, soft enough that the
 * other standards still appear — a match that only ever asked about his worst
 * topic would read as a punishment for having a weakness.
 */
export const PROBE_HALVING = 12

/**
 * How many points of missed difficulty halve a generator's chances.
 *
 * Generator bands are narrower than the 0–99 scale (`FLU.MULT` is 8–88,
 * `MT.4.NBT.6` starts at 20), so at the ends of the scale the difficulty a
 * pressure band asks for is sometimes outside what a given generator can
 * produce. Those generators are discounted rather than excluded, and smoothly
 * rather than at a threshold.
 *
 * Excluding them outright was the obvious alternative and is wrong: the lowest
 * difficulty the division generator can produce is 20, so a hard filter would
 * mean the weakest possible player never sees division at all, which is exactly
 * backwards. A near miss barely matters; a large one all but rules a generator
 * out, and nothing is ever ruled out completely.
 */
export const MISS_HALVING = 6

/** Steps in the weighted draw. Fine enough that the weights are not quantised. */
const PICK_RESOLUTION = 1_000_000

export interface SelectOptions {
  /** As derived from the log. Standards missing from it fall back to the seed. */
  ratings: Map<string, StandardRating>
  pressure: Pressure
  rng: Rng
  /** Defaults to every generator the game has. */
  generators?: readonly ItemGenerator[]
  /** Restrict to one domain, e.g. a Training Ground session. */
  domain?: DomainCode
  /** Restrict to one standard. Wins over `domain` if both are given. */
  standardId?: string
  /** Big matches: go after the gaps rather than practising evenly. */
  probeWeakest?: boolean
  /** Standards to avoid repeating, if there is anything else to ask about. */
  recentStandardIds?: readonly string[]
}

interface Candidate {
  generator: ItemGenerator
  rating: number
  /** The difficulty the pressure band asks for. */
  wanted: number
  /** The nearest difficulty this generator can actually produce. */
  achieved: number
  /** How far `achieved` fell short of `wanted`. Zero when it is in range. */
  miss: number
}

/** A rating we can do arithmetic with. Corrupt or absent both mean "no idea yet". */
function ratingFor(ratings: Map<string, StandardRating> | undefined, standardId: string): number {
  const rating = ratings?.get(standardId)?.rating
  return typeof rating === 'number' && Number.isFinite(rating) ? rating : SEED_RATING
}

/**
 * The generators worth considering.
 *
 * Every filter here degrades rather than failing: an unknown standard, a domain
 * nothing covers, or an empty generator list all fall back to the wider pool
 * instead of throwing. A filter that cannot be satisfied is a bug somewhere
 * upstream, and the right response mid-match is to ask a reasonable question
 * anyway rather than to end the match with a stack trace.
 */
function candidatesFor(opts: SelectOptions): readonly ItemGenerator[] {
  const all =
    opts.generators !== undefined && opts.generators.length > 0 ? opts.generators : ALL_GENERATORS

  let pool = all
  if (opts.standardId !== undefined && opts.standardId !== '') {
    const pinned = all.filter((g) => g.standardId === opts.standardId)
    if (pinned.length > 0) pool = pinned
  } else if (opts.domain !== undefined) {
    const inDomain = all.filter((g) => STANDARDS_BY_ID[g.standardId]?.domain === opts.domain)
    if (inDomain.length > 0) pool = inDomain
  }

  if (opts.recentStandardIds !== undefined && opts.recentStandardIds.length > 0) {
    const recent = new Set(opts.recentStandardIds)
    const fresh = pool.filter((g) => !recent.has(g.standardId))
    // Only if something is left. Never failing to return an item beats never
    // repeating one.
    if (fresh.length > 0) pool = fresh
  }

  return pool.length > 0 ? pool : ALL_GENERATORS
}

/**
 * How much each candidate deserves to be drawn.
 *
 * Two independent factors, multiplied: how far below the pack this standard sits
 * (bias toward the gaps), and how well the generator's band lines up with the
 * difficulty the pressure asked for (bias toward a question that lands where it
 * was aimed). Both are expressed as halvings so the weights are relative — the
 * rating term is measured against the mean of the candidates, so shifting every
 * rating by the same amount changes nothing.
 */
function weightsFor(candidates: readonly Candidate[], probeWeakest: boolean): number[] {
  const halving = probeWeakest ? PROBE_HALVING : GENTLE_HALVING
  const mean = candidates.reduce((sum, c) => sum + c.rating, 0) / candidates.length

  return candidates.map((c) => {
    const weakness = 2 ** ((mean - c.rating) / halving)
    const fit = 2 ** (-c.miss / MISS_HALVING)
    const weight = weakness * fit
    return Number.isFinite(weight) && weight > 0 ? weight : Number.MIN_VALUE
  })
}

/** One draw, consuming exactly one number from `rng` whatever the weights are. */
function weightedPick<T>(items: readonly T[], weights: readonly number[], rng: Rng): T {
  const roll = rng.int(0, PICK_RESOLUTION - 1) / PICK_RESOLUTION
  let total = 0
  for (const w of weights) total += w

  if (!Number.isFinite(total) || total <= 0) return items[Math.floor(roll * items.length)] ?? items[0]!

  let cursor = roll * total
  for (let i = 0; i < items.length; i++) {
    cursor -= weights[i]!
    if (cursor < 0) return items[i]!
  }
  // Only reachable through floating-point drift at the very top of the range.
  return items[items.length - 1]!
}

const clampToRange = (value: number, [lo, hi]: [number, number]) =>
  Math.min(hi, Math.max(lo, value))

/**
 * The next question.
 *
 * Never throws for any input the game can produce. An unknown standard, a domain
 * nothing covers, an empty or corrupt ratings map and an unrecognised pressure
 * all degrade to something sensible, because the alternative is a crash in the
 * middle of a match.
 *
 * The returned item reports the difficulty it was actually built at, which is
 * not always the difficulty that was asked for: when the chosen generator's band
 * cannot reach the target, the item lands at the nearest difficulty it can
 * produce and says so. Callers logging an attempt must record `item.difficulty`
 * rather than recomputing what they intended, or the rating maths will be folding
 * a number that never happened.
 */
export function selectItem(opts: SelectOptions): Item {
  const pool = candidatesFor(opts)

  const rawTarget = TARGET_SUCCESS[opts.pressure]
  const target = typeof rawTarget === 'number' && Number.isFinite(rawTarget) ? rawTarget : DEFAULT_TARGET

  const candidates: Candidate[] = pool.map((generator) => {
    const rating = ratingFor(opts.ratings, generator.standardId)
    const wanted = difficultyForSuccess(rating, target)
    const achieved = clampToRange(wanted, generator.range)
    return { generator, rating, wanted, achieved, miss: Math.abs(achieved - wanted) }
  })

  const chosen = weightedPick(candidates, weightsFor(candidates, opts.probeWeakest === true), opts.rng)
  return chosen.generator.generate(chosen.achieved, opts.rng)
}
