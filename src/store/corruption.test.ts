/**
 * What happens when the saved game is not a saved game.
 *
 * `storage.test.ts` checks the validator one rule at a time. This file is the
 * other half: it throws roughly sixteen hundred broken blobs at the store and
 * asserts the two properties that actually matter afterwards — that nothing
 * crashes, and that whatever survived cannot produce a non-finite rating or one
 * below the hard floor.
 *
 * The second is the one worth having. A `NaN` difficulty produces a `NaN`
 * rating, and a `NaN` rating silently defeats the floor and poisons every stat
 * on the card. It fails quietly and it fails everywhere, which is exactly the
 * kind of bug a per-rule unit test can miss and a sweep like this cannot. So
 * every load here is followed by a full derive — ratings, card, overall, rank,
 * courage — plus one item selection, because all of that has to keep working in
 * the middle of a match.
 */

import { describe, expect, it } from 'vitest'
import type { AttemptDraft } from './storage'
import { GameStore, STORAGE_KEY, attemptIdFor, validateAttempt } from './storage'
import {
  CARD_STATS,
  RATING_FLOOR,
  deriveCard,
  deriveCourage,
  deriveOverall,
  deriveRatings,
  deriveWorldRank,
} from './derive'
import { selectItem } from '../engine/select'
import { makeRng } from '../engine/items/rng'

const T0 = 1767225600000
const good = (n: number) => ({
  id: attemptIdFor(n),
  at: T0 + n * 60000,
  standardId: 'MT.4.NF.1',
  difficulty: 40 + (n % 30),
  params: { a: n },
  given: '1/2',
  correct: n % 3 !== 0,
  latencyMs: 4000,
  context: 'training',
})

/** Every hostile value a bug or a curious parent could realistically produce. */
const JUNK: unknown[] = [
  null,
  undefined,
  NaN,
  Infinity,
  -Infinity,
  0,
  -0,
  '',
  '   ',
  'NaN',
  'Infinity',
  '1e999',
  true,
  false,
  [],
  {},
  [[[]]],
  { a: { b: { c: 1 } } },
  1e308 * 10,
  Number.MAX_SAFE_INTEGER + 1,
  -99999999,
  9.9e99,
  '{"nested":"json"}',
  new Date(),
  { toString: null },
]

/** Some of the junk cannot be stringified at all, which is rather the point. */
function label(v: unknown): string {
  try {
    return String(v)
  } catch {
    return '<unstringifiable>'
  }
}

let crashes = 0
let checked = 0
const poisoned: string[] = []

function auditWhatSurvived(label: string) {
  const state = new GameStore().getState()
  const now = T0 + 1e9
  const ratings = deriveRatings(state.attempts, now)
  for (const r of ratings.values()) {
    if (!Number.isFinite(r.rating) || r.rating < RATING_FLOOR) {
      poisoned.push(`${label}: ${r.standardId}=${r.rating}`)
    }
  }
  const card = deriveCard(ratings, state.attempts, now)
  for (const s of CARD_STATS) {
    if (!Number.isFinite(card[s])) poisoned.push(`${label}: card.${s}=${card[s]}`)
  }
  const overall = deriveOverall(card)
  if (!Number.isFinite(overall)) poisoned.push(`${label}: overall=${overall}`)
  if (!Number.isFinite(deriveWorldRank(overall))) poisoned.push(`${label}: rank`)
  deriveCourage(state.attempts)
  // And the thing that has to keep working in the middle of a match.
  const item = selectItem({ ratings, pressure: 'shot', rng: makeRng(1) })
  if (!Number.isFinite(item.difficulty)) poisoned.push(`${label}: item difficulty`)
  checked++
}

function attack(label: string, blob: string) {
  try {
    localStorage.clear()
    localStorage.setItem(STORAGE_KEY, blob)
    auditWhatSurvived(label)
    // And that the store still works after having loaded garbage.
    const store = new GameStore()
    const { id: _id, ...draft } = good(999)
    store.appendAttempt({ ...draft, context: 'match' } as AttemptDraft)
    store.importJson(store.exportJson())
  } catch (err) {
    crashes++
    console.error(`CRASH on ${label}: ${(err as Error).message}`)
  }
}

describe('adversarial corruption', () => {
  it('survives every field of every attempt being replaced by junk', () => {
    const fields = [
      'id',
      'at',
      'standardId',
      'difficulty',
      'params',
      'given',
      'correct',
      'latencyMs',
      'context',
      'shot',
      'misconceptionId',
      'matchId',
    ]
    for (const field of fields) {
      for (const junk of JUNK) {
        const attempts = [good(1), { ...good(2), [field]: junk }, good(3)]
        attack(
          `${field}=${label(junk)}`,
          JSON.stringify({ version: 1, seq: 4, country: null, attempts }),
        )
      }
    }
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })

  it('survives every top-level field being junk', () => {
    for (const field of ['version', 'country', 'attempts', 'settings', 'seq']) {
      for (const junk of JUNK) {
        attack(
          `top.${field}=${label(junk)}`,
          JSON.stringify({
            version: 1,
            seq: 4,
            country: null,
            attempts: [good(1)],
            [field]: junk,
          }),
        )
      }
    }
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })

  it('survives a write truncated at every possible byte', () => {
    const full = JSON.stringify({
      version: 1,
      seq: 5,
      country: null,
      settings: { timersEnabled: true },
      attempts: [good(1), good(2), good(3), good(4)],
    })
    for (let cut = 0; cut <= full.length; cut++) attack(`truncated@${cut}`, full.slice(0, cut))
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })

  it('survives random byte corruption of a valid blob', () => {
    const full = JSON.stringify({
      version: 1,
      seq: 5,
      country: null,
      attempts: [good(1), good(2), good(3), good(4)],
    })
    let s = 12345
    const rand = () => {
      s = (s * 1664525 + 1013904223) % 4294967296
      return s / 4294967296
    }
    const alphabet = '0123456789abcdef{}[]",:.-eE'
    for (let trial = 0; trial < 400; trial++) {
      const chars = full.split('')
      const hits = 1 + Math.floor(rand() * 5)
      for (let h = 0; h < hits; h++) {
        chars[Math.floor(rand() * chars.length)] = alphabet[Math.floor(rand() * alphabet.length)]!
      }
      attack(`bitflip#${trial}`, chars.join(''))
    }
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })

  it('refuses a prototype-pollution payload', () => {
    attack(
      'proto',
      '{"version":1,"attempts":[{"__proto__":{"polluted":true},"id":"a000000000001","at":1,"standardId":"MT.4.NF.1","difficulty":5,"params":{"__proto__":{"x":1}},"given":"1","correct":true,"latencyMs":5,"context":"training"}]}',
    )
    expect(({} as Record<string, unknown>).polluted).toBeUndefined()
    expect((Object.prototype as unknown as Record<string, unknown>).polluted).toBeUndefined()

    const a = validateAttempt(
      JSON.parse(
        '{"__proto__":{"p":1},"id":"x","at":1,"standardId":"s","difficulty":1,"params":{},"given":"","correct":true,"latencyMs":1,"context":"training"}',
      ),
    )
    expect(Object.getPrototypeOf(a!)).toBe(Object.prototype)
    expect(crashes).toBe(0)
  })

  it('survives duplicate ids, wild timestamps and a huge log', () => {
    const wild = [
      { ...good(1), at: -8640000000000 },
      { ...good(1) },
      { ...good(1) },
      { ...good(2), at: 8640000000000000 },
      { ...good(3), difficulty: -500 },
      { ...good(4), difficulty: 1e6 },
      { ...good(5), latencyMs: -1 },
      { ...good(6), standardId: 'NOT.REAL' },
    ]
    attack('wild', JSON.stringify({ version: 1, attempts: wild }))

    const many = Array.from({ length: 5000 }, (_, i) => good(i + 1))
    attack('huge', JSON.stringify({ version: 1, attempts: many }))
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })

  it('reports what it checked', () => {
    console.log(`fuzz: ${checked} corrupt blobs loaded, ${crashes} crashes, ${poisoned.length} poisoned`)
    expect(crashes).toBe(0)
    expect(poisoned).toEqual([])
  })
})
