import { describe, expect, it } from 'vitest'
import { OPPONENTS, OPPONENTS_BY_ID, WORLD_CUP_FIELD } from './opponents'

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
