import { describe, expect, it } from 'vitest'
import { foldRemoteAttempts, localIdFor } from './attemptMerge'
import type { RemoteRow } from './attemptMerge'
import { attemptIdFor } from '../store/storage'
import type { Attempt } from '../store/types'

const T0 = 1_700_000_000_000

/** Built through `attemptIdFor`, the actual counter this app uses — not a hand-padded lookalike — so two devices genuinely collide the exact way they would in production. */
function attempt(seq: number, over: Partial<Attempt> = {}): Attempt {
  return {
    id: attemptIdFor(seq),
    at: T0 + seq * 1000,
    standardId: 'MT.4.NF.1',
    difficulty: 50,
    params: {},
    given: '1',
    correct: true,
    latencyMs: 4000,
    context: 'training',
    ...over,
  }
}

const from = (deviceId: string, ...attempts: Attempt[]): RemoteRow[] =>
  attempts.map((a) => ({ deviceId, attempt: a }))

/** The content that identifies an attempt, independent of whatever id it ends up with locally. */
const fingerprint = (a: Attempt) => `${a.standardId}|${a.at}|${a.given}|${a.correct}`

describe('localIdFor', () => {
  it('leaves an attempt bare when it is this device’s own', () => {
    const row = from('laptop', attempt(42))[0]!
    expect(localIdFor('laptop', row)).toBe(attemptIdFor(42))
  })

  it('namespaces an attempt from any other device', () => {
    const row = from('ipad', attempt(42))[0]!
    expect(localIdFor('laptop', row)).toBe(`ipad-${attemptIdFor(42)}`)
  })
})

describe('foldRemoteAttempts', () => {
  it('appends nothing and returns the same reference when there is nothing new', () => {
    const existing = [attempt(1)]
    const result = foldRemoteAttempts(existing, 'laptop', [])
    expect(result).toBe(existing)
  })

  it('is a no-op — same reference — when every row is already present', () => {
    const existing = [attempt(1), attempt(2)]
    const rows = from('laptop', attempt(1), attempt(2))
    expect(foldRemoteAttempts(existing, 'laptop', rows)).toBe(existing)
  })

  it('adopts this device’s own attempts back under their existing bare id', () => {
    // The common case: we push our own attempts, then later pull the whole
    // table back (including our own rows) and must not duplicate ourselves.
    const existing: Attempt[] = []
    const result = foldRemoteAttempts(existing, 'laptop', from('laptop', attempt(1), attempt(2)))
    expect(result.map((a) => a.id)).toEqual([attemptIdFor(1), attemptIdFor(2)])
  })

  it('namespaces attempts arriving from another device', () => {
    const result = foldRemoteAttempts([], 'laptop', from('ipad', attempt(1)))
    expect(result[0]!.id).toBe(`ipad-${attemptIdFor(1)}`)
  })

  it('drops a row that fails validation, exactly as a corrupt local write would', () => {
    const bad = attempt(1, { difficulty: Number.NaN })
    const result = foldRemoteAttempts([], 'laptop', from('ipad', bad))
    expect(result).toEqual([])
  })

  it('drops one bad row without losing the good ones beside it', () => {
    const rows = from('ipad', attempt(1, { difficulty: Number.NaN }), attempt(2))
    const result = foldRemoteAttempts([], 'laptop', rows)
    expect(result).toHaveLength(1)
    expect(result[0]!.id).toBe(`ipad-${attemptIdFor(2)}`)
  })

  it('THE LANDMINE: two devices independently mint the same sequential id for different attempts, and both survive', () => {
    // Laptop and iPad both start a fresh session and both count from 1 — this
    // is not a contrived edge case, it is what happens every single time a
    // second device starts playing.
    const laptopLog = [
      attempt(1, { standardId: 'MT.4.NF.1', given: '3/4' }),
      attempt(2, { standardId: 'MT.4.OA.4', given: '12' }),
    ]
    const ipadLog = [
      attempt(1, { standardId: 'MT.4.G.1', given: 'Acute' }),
      attempt(2, { standardId: 'MT.4.NBT.5', given: '900' }),
    ]

    // Laptop pulls the whole cloud table, which now contains both devices'
    // rows (its own bounce back, iPad's arrive fresh).
    const cloud = [...from('laptop', ...laptopLog), ...from('ipad', ...ipadLog)]
    const laptopMerged = foldRemoteAttempts(laptopLog, 'laptop', cloud)

    // Four distinct attempts, four distinct ids — nothing collided, nothing
    // silently overwrote anything else.
    expect(laptopMerged).toHaveLength(4)
    expect(new Set(laptopMerged.map((a) => a.id)).size).toBe(4)

    // And every original attempt's content survived the trip.
    const laptopFingerprints = new Set(laptopMerged.map(fingerprint))
    for (const a of [...laptopLog, ...ipadLog]) {
      expect(laptopFingerprints.has(fingerprint(a)), fingerprint(a)).toBe(true)
    }
  })

  it('is idempotent: folding the same rows again changes nothing', () => {
    const rows = from('ipad', attempt(1), attempt(2), attempt(3))
    const once = foldRemoteAttempts([], 'laptop', rows)
    const twice = foldRemoteAttempts(once, 'laptop', rows)
    expect(twice).toBe(once)
    expect(twice).toHaveLength(3)
  })

  it('is idempotent across many repeated syncs of a growing cloud table', () => {
    let local: readonly Attempt[] = []
    let cloud: RemoteRow[] = []
    for (let i = 1; i <= 20; i++) {
      cloud = [...cloud, ...from(i % 2 === 0 ? 'ipad' : 'laptop', attempt(i))]
      local = foldRemoteAttempts(local, 'laptop', cloud)
      // Re-running against the same cloud snapshot must never grow the log.
      const again = foldRemoteAttempts(local, 'laptop', cloud)
      expect(again).toBe(local)
    }
    expect(local).toHaveLength(20)
  })

  it('is order-independent: the final content is the same whichever order rows arrive in', () => {
    const rows = from('ipad', attempt(1), attempt(2), attempt(3), attempt(4), attempt(5))
    const forwards = foldRemoteAttempts([], 'laptop', rows)
    const backwards = foldRemoteAttempts([], 'laptop', [...rows].reverse())

    const idsOf = (as: readonly Attempt[]) => new Set(as.map((a) => a.id))
    expect(idsOf(forwards)).toEqual(idsOf(backwards))
  })

  it('loses nothing across a three-way merge, in either merge order', () => {
    // A merges B's history, then C's. B merges C's, then A's. Both must end
    // up holding the full union of all three devices' work.
    const a = [attempt(1, { given: 'a1' })]
    const b = [attempt(1, { given: 'b1' }), attempt(2, { given: 'b2' })]
    const c = [attempt(1, { given: 'c1' })]

    const allRows = [...from('A', ...a), ...from('B', ...b), ...from('C', ...c)]

    const aFinal = foldRemoteAttempts(foldRemoteAttempts(a, 'A', from('B', ...b)), 'A', from('C', ...c))
    const bFinal = foldRemoteAttempts(foldRemoteAttempts(b, 'B', from('C', ...c)), 'B', from('A', ...a))

    const wantedFingerprints = new Set(allRows.map((r) => fingerprint(r.attempt)))
    expect(new Set(aFinal.map(fingerprint))).toEqual(wantedFingerprints)
    expect(new Set(bFinal.map(fingerprint))).toEqual(wantedFingerprints)
    expect(aFinal).toHaveLength(4)
    expect(bFinal).toHaveLength(4)
  })
})
