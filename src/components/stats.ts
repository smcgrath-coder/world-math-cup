/**
 * What the six card stats mean, what sits under each of them, and how an
 * opponent's six numbers are made.
 *
 * Pure, and separate from the two components that draw it, the same way
 * `flag.ts` is separate from `FlagPreview.tsx`: the radar and the card frame
 * both need this vocabulary, and none of it needs a DOM to be true or to be
 * tested.
 */

import { CARD_STATS, PROVISIONAL_ATTEMPTS, RATING_FLOOR } from '../store/derive'
import { DOMAIN_TO_STAT, STANDARDS_BY_ID } from '../curriculum/standards.generated'
import type { CardStat } from '../curriculum/standards.generated'
import { ALL_GENERATORS } from '../engine/items/generators'
import type { Opponent } from '../data/opponents'
import type { Card, StandardRating } from '../store/types'

export const MAX_RATING = 99

/**
 * What each stat is called on the pitch, and what it is really measuring.
 *
 * He sees the football word. The maths word is one tap away on the card, which
 * is the same view a parent needs — so the translation lives in one place and
 * both audiences read the same table.
 */
export const STAT_LABELS: Record<CardStat, { soccer: string; maths: string }> = {
  PAC: { soccer: 'Pace', maths: 'Fluency and recall speed' },
  SHO: { soccer: 'Shooting', maths: 'Geometry' },
  PAS: { soccer: 'Passing', maths: 'Operations and algebraic thinking' },
  DRI: { soccer: 'Dribbling', maths: 'Fractions' },
  DEF: { soccer: 'Defending', maths: 'Place value and big-number arithmetic' },
  PHY: { soccer: 'Physical', maths: 'Measurement and data' },
}

/**
 * The standards behind each stat, taken from the generators rather than from the
 * curriculum: a standard with no generator can never be attempted, so listing it
 * here would promise a topic the game cannot deliver.
 *
 * `FLU.MULT` belongs to no domain — PAC is fluency rather than a subject — so it
 * is placed under PAC by name. Anything else without a domain would land there
 * too, which `generators/index.test.ts` already makes impossible by requiring
 * every other id to be a real Montana code.
 */
export const STANDARDS_BY_STAT: Record<CardStat, readonly string[]> = (() => {
  const out: Record<CardStat, string[]> = { PAC: [], SHO: [], PAS: [], DRI: [], DEF: [], PHY: [] }
  for (const generator of ALL_GENERATORS) {
    const domain = STANDARDS_BY_ID[generator.standardId]?.domain
    out[domain === undefined ? 'PAC' : DOMAIN_TO_STAT[domain]].push(generator.standardId)
  }
  for (const stat of CARD_STATS) out[stat].sort()
  return out
})()

export const LABELS_BY_STANDARD: Record<string, string> = Object.fromEntries(
  ALL_GENERATORS.map((g) => [g.standardId, g.label]),
)

/** On the scale the card is drawn on, and never `NaN` — a corrupt log reaches here. */
export const clampStat = (value: number): number =>
  Number.isFinite(value) ? Math.min(MAX_RATING, Math.max(RATING_FLOOR, value)) : RATING_FLOOR

/**
 * An opponent's six stats, from the one number and the nudges on the roster.
 *
 * Pure, total and deterministic — the same side draws the same card forever, and
 * scouting Brazil twice cannot show two different Brazils.
 *
 * The nudges are re-centred on their own mean before being applied, so the six
 * stats still average to exactly the `rating` the roster states. Without that,
 * Brazil's +6/+4/−3 would quietly make Brazil a 95 on the card while the bracket
 * and the world ranking went on calling it a 94.
 */
export function opponentCard(opponent: Opponent): Card {
  const nudges = CARD_STATS.map((stat) => opponent.specialism?.[stat] ?? 0)
  const mean = nudges.reduce((sum, n) => sum + n, 0) / CARD_STATS.length
  const card = {} as Card
  CARD_STATS.forEach((stat, i) => {
    card[stat] = clampStat(opponent.rating + nudges[i]! - mean)
  })
  return card
}

/**
 * Which stats are not yet proven.
 *
 * A stat is provisional while *any* topic under it is provisional, including the
 * ones never played. `deriveCard` averages only the topics he has actually
 * attempted, so a DRI built from one fraction standard out of four is a real
 * measurement of a quarter of the domain wearing the name of all of it. Dashed
 * is the honest way to draw that, and it resolves itself as he plays.
 *
 * PAC is the exception, because it is not a domain: it is measured on how fast
 * every correct answer arrives, so what settles it is having answered at all.
 */
export function provisionalStats(ratings: Map<string, StandardRating>): CardStat[] {
  let total = 0
  for (const rating of ratings.values()) total += rating.attempts

  return CARD_STATS.filter((stat) =>
    stat === 'PAC'
      ? total < PROVISIONAL_ATTEMPTS
      : STANDARDS_BY_STAT[stat].some((id) => ratings.get(id)?.provisional ?? true),
  )
}
