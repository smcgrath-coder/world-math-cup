import { describe, expect, it } from 'vitest'
import { STANDARDS_BY_STAT, opponentCard, provisionalStats } from './stats'
import { CARD_STATS, RATED_STANDARD_IDS, deriveOverall } from '../store/derive'
import { OPPONENTS, OPPONENTS_BY_ID } from '../data/opponents'
import type { StandardRating } from '../store/types'

const brazil = OPPONENTS_BY_ID.brazil!

function ratings(named: Record<string, [rating: number, attempts: number]> = {}): Map<string, StandardRating> {
  const out = new Map<string, StandardRating>()
  for (const id of RATED_STANDARD_IDS) {
    const [rating, attempts] = named[id] ?? [50, 0]
    out.set(id, {
      standardId: id,
      rating,
      ratingClean: rating,
      attempts,
      lastSeenAt: attempts > 0 ? 1_000 : null,
      provisional: attempts < 5,
    })
  }
  return out
}

/** Everything the game can generate, played until it is settled. */
const allProven = (): Map<string, StandardRating> =>
  ratings(Object.fromEntries(RATED_STANDARD_IDS.map((id) => [id, [60, 20] as [number, number]])))

describe('STANDARDS_BY_STAT', () => {
  it('places every standard the game can generate under exactly one stat', () => {
    const placed = CARD_STATS.flatMap((stat) => [...STANDARDS_BY_STAT[stat]])
    expect(new Set(placed).size).toBe(placed.length)
    expect(placed.sort()).toEqual([...RATED_STANDARD_IDS].sort())
  })

  it('puts fractions under dribbling and fluency under pace', () => {
    expect(STANDARDS_BY_STAT.DRI).toEqual([
      'MT.4.NF.1',
      'MT.4.NF.2',
      'MT.4.NF.3',
      'MT.4.NF.4',
    ])
    // PAC is speed rather than a subject, so the one non-Montana id lives here.
    expect(STANDARDS_BY_STAT.PAC).toEqual(['FLU.MULT'])
  })
})

describe('opponentCard', () => {
  it('is deterministic', () => {
    expect(opponentCard(brazil)).toEqual(opponentCard(brazil))
    for (const opponent of OPPONENTS) {
      expect(opponentCard(opponent)).toEqual(opponentCard({ ...opponent }))
    }
  })

  it('averages to the rating the roster states', () => {
    // Otherwise Brazil is a 95 on its own card and a 94 everywhere else in the
    // game, and the bracket stops agreeing with the scouting screen.
    for (const opponent of OPPONENTS) {
      expect(deriveOverall(opponentCard(opponent))).toBeCloseTo(opponent.rating, 6)
    }
  })

  it('leans the six stats the way the specialism says', () => {
    const card = opponentCard(brazil)
    // Brazil dribbles and shoots; Brazil does not defend.
    expect(card.DRI).toBeGreaterThan(card.SHO)
    expect(card.SHO).toBeGreaterThan(card.PAC)
    expect(card.DEF).toBeLessThan(card.PAC)
  })

  it('gives a side with no specialism a flat card', () => {
    const qatar = OPPONENTS_BY_ID.qatar!
    for (const stat of CARD_STATS) expect(opponentCard(qatar)[stat]).toBeCloseTo(qatar.rating, 6)
  })

  it('keeps every stat on the scale the player is measured on', () => {
    for (const opponent of OPPONENTS) {
      for (const stat of CARD_STATS) {
        expect(opponentCard(opponent)[stat]).toBeGreaterThanOrEqual(20)
        expect(opponentCard(opponent)[stat]).toBeLessThanOrEqual(99)
      }
    }
  })
})

describe('provisionalStats', () => {
  it('starts with nothing proven', () => {
    expect(provisionalStats(ratings())).toEqual([...CARD_STATS])
  })

  it('settles a stat only once every topic under it has been seen enough', () => {
    // Twenty attempts at equivalent fractions say nothing about multiplying
    // them, and a confident DRI built on one of the four would be a claim the
    // log cannot support.
    const one = provisionalStats(ratings({ 'MT.4.NF.1': [72, 20] }))
    expect(one).toContain('DRI')

    const all = provisionalStats(
      ratings({
        'MT.4.NF.1': [72, 20],
        'MT.4.NF.2': [64, 12],
        'MT.4.NF.3': [58, 9],
        'MT.4.NF.4': [51, 7],
      }),
    )
    expect(all).not.toContain('DRI')
    expect(all).toContain('SHO')
  })

  it('settles pace on having played at all, since pace is not a topic', () => {
    // Five attempts anywhere is enough for a speed measurement to mean
    // something; there is no domain for it to be incomplete in.
    expect(provisionalStats(ratings({ 'MT.4.G.1': [50, 4] }))).toContain('PAC')
    expect(provisionalStats(ratings({ 'MT.4.G.1': [50, 5] }))).not.toContain('PAC')
  })

  it('leaves nothing dashed once the whole card is settled', () => {
    expect(provisionalStats(allProven())).toEqual([])
  })
})
