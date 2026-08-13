import { describe, expect, it } from 'vitest'
import { OPPONENTS, OPPONENTS_BY_ID, WORLD_CUP_FIELD } from './opponents'
// Imported rather than read off disk: this project has no node types, on
// purpose, because nothing under src/ should be able to reach the filesystem.
import promptPack from '../../docs/art/nano-banana-prompt-pack.md?raw'

describe('opponent roster', () => {
  it('fields exactly the 48 teams that qualified for 2026', () => {
    expect(WORLD_CUP_FIELD).toHaveLength(48)
  })

  it('gives every team a unique id and name', () => {
    expect(new Set(OPPONENTS.map((o) => o.id)).size).toBe(OPPONENTS.length)
    expect(new Set(OPPONENTS.map((o) => o.name)).size).toBe(OPPONENTS.length)
    expect(Object.keys(OPPONENTS_BY_ID)).toHaveLength(OPPONENTS.length)
  })

  it('wears the correct number of stars', () => {
    // World Cup titles through 2026. Rion will notice immediately if these are
    // wrong, and the stars double as the difficulty signal.
    const titles: Record<string, number> = {
      brazil: 5,
      germany: 4,
      italy: 4,
      argentina: 3,
      france: 2,
      uruguay: 2,
      spain: 2, // won in 2026, over Argentina
      england: 1,
    }
    for (const o of OPPONENTS) {
      expect(o.stars, `${o.name} stars`).toBe(titles[o.id] ?? 0)
    }
  })

  it('makes Spain the final boss, and keeps the table in FIFA order', () => {
    // Spain won the 2026 tournament and lead the ranking, so they are the
    // strongest side in the game. Deliberately not Brazil: this file used to
    // treat the five stars above Brazil's crest as the difficulty warning, and
    // after that tournament they are not. Stars are titles won; the rating is
    // form today.
    const strongest = [...OPPONENTS].sort((a, b) => b.rating - a.rating)[0]!
    expect(strongest.id).toBe('spain')
    expect(strongest.tier).toBe(1)

    // Ratings are derived from the published rank by
    // scripts/rerank-opponents.mjs, so the file order and the strength order
    // must agree. If they drift, the script was not re-run.
    const ratings = OPPONENTS.map((o) => o.rating)
    expect(ratings).toEqual([...ratings].sort((a, b) => b - a))
  })

  it('keeps Italy out of the World Cup field but in the game', () => {
    const italy = OPPONENTS_BY_ID.italy!
    expect(italy.inWorldCup).toBe(false)
    expect(italy.stars).toBe(4)
    expect(OPPONENTS.some((o) => o.id === 'italy')).toBe(true)
  })

  it('rates every team on the same 0-99 scale as the player', () => {
    for (const o of OPPONENTS) {
      expect(o.rating, `${o.name} rating`).toBeGreaterThanOrEqual(0)
      expect(o.rating, `${o.name} rating`).toBeLessThanOrEqual(99)
    }
  })

  it('orders the tiers by strength', () => {
    for (const o of OPPONENTS) {
      const floor = { 1: 82, 2: 72, 3: 60, 4: 0 }[o.tier]
      expect(o.rating, `${o.name} is tier ${o.tier} but rated ${o.rating}`).toBeGreaterThanOrEqual(floor)
    }
  })

  it('gives every team a two-colour kit in hex', () => {
    for (const o of OPPONENTS) {
      expect(o.kit).toHaveLength(2)
      for (const c of o.kit) expect(c, `${o.name} kit`).toMatch(/^#[0-9A-F]{6}$/i)
    }
  })

  it('keeps specialisms small enough not to swamp the rating', () => {
    for (const o of OPPONENTS) {
      for (const [stat, delta] of Object.entries(o.specialism ?? {})) {
        expect(Math.abs(delta), `${o.name} ${stat}`).toBeLessThanOrEqual(8)
      }
    }
  })

  it('offers enough opposition to keep friendlies varied for months', () => {
    // With only a handful of opponents he exhausts the roster in a week.
    expect(OPPONENTS.length).toBe(57)
    expect(OPPONENTS.filter((o) => !o.inWorldCup)).toHaveLength(9)
  })
})

describe('the art prompt pack', () => {
  /**
   * The roster is regenerated from the published FIFA ranking every few months,
   * and when it is, the eight teams worth commissioning captain art for change.
   * Nothing else would notice: the pack is a document, the art is made by hand,
   * and a stale list costs a batch of drawings of the wrong countries.
   */
  it('asks for a captain for exactly the teams in tier 1', () => {
    const pack = promptPack
    const asked = [...pack.matchAll(/captain-([a-z]+)\.png/g)].map((m) => m[1]).sort()
    const tierOne = OPPONENTS.filter((o) => o.tier === 1)
      .map((o) => o.id)
      .sort()

    expect(asked).toEqual(tierOne)
  })

  it('names the hardest team as the final boss, so the art matches the climb', () => {
    const pack = promptPack
    const hardest = [...OPPONENTS].sort((a, b) => b.rating - a.rating)[0]
    const boss = /\|\s*([A-Za-z ]+?)\s*\(\d+★\)\s*—\s*\*\*final boss\*\*/.exec(pack)

    expect(boss?.[1]).toBe(hardest.name)
  })
})
