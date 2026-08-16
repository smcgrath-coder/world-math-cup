import { describe, expect, it, vi } from 'vitest'
import { runSync } from './syncEngine'
import type { SyncStoreAdapter } from './syncEngine'
import { createFakeTransport } from '../test/fakeTransport'
import { attemptIdFor } from '../store/storage'
import type { KnownProfile, Link } from './link'
import type { Attempt } from '../store/types'
import type { ProfileSnapshot, SyncTransport } from './transport'

const T0 = 1_700_000_000_000
const DEFAULT_PROFILE: KnownProfile = { country: null, settings: { timersEnabled: true } }

/**
 * A real household and player, created through the transport rather than a
 * hand-picked id — `pushAttempts`/`pushProfile` against a player that was
 * never created should fail exactly as a foreign-key violation would in the
 * real database, and did, the first time this file ran: every profile test
 * failed silently because `LINK` referenced a `playerId` the fake transport
 * had never heard of, `pushProfile` threw, and `runSync`'s catch swallowed it
 * — the assertions were then reading state that had never been touched.
 */
async function linkFor(transport: SyncTransport): Promise<Link> {
  const { householdId, inviteCode } = await transport.createHousehold()
  const { playerId } = await transport.createPlayer(householdId, 'Rion')
  return { householdId, playerId, inviteCode, playerName: 'Rion' }
}

/** Built through `attemptIdFor` rather than hand-padded, so this fixture can never drift from the id shape `isLocallyMintedId` actually pattern-matches against — a mismatch here would silently make every "locally minted" attempt invisible to the push filter, exactly as it did on the first pass of this file. */
function attempt(seq: number, over: Partial<Attempt> = {}): Attempt {
  return {
    id: attemptIdFor(seq),
    at: T0 + seq * 1000,
    standardId: 'MT.4.NF.1',
    difficulty: 50,
    params: {},
    given: '1/2',
    correct: true,
    latencyMs: 4000,
    context: 'training',
    ...over,
  }
}

/**
 * A little in-memory "device": its own attempts, country, settings, and its
 * own idea of what it last knew the profile to be — three completely
 * independent pieces of state, exactly as two real devices would have.
 * Standing in for a real `GameStore` + `link.ts` pair so these tests exercise
 * the engine's decisions rather than React or localStorage.
 */
function fakeDevice(profile: KnownProfile = DEFAULT_PROFILE) {
  const state = {
    attempts: [] as Attempt[],
    country: profile.country,
    settings: profile.settings,
    knownProfile: null as KnownProfile | null,
  }

  const adapter: SyncStoreAdapter = {
    getAttempts: () => state.attempts,
    getCountry: () => state.country,
    getSettings: () => state.settings,
    getDefaultProfile: () => DEFAULT_PROFILE,
    mergeAttempts: (next) => {
      state.attempts = next as Attempt[]
    },
    applyProfile: (p) => {
      state.country = p.country
      state.settings = p.settings
    },
    getLastKnownProfile: () => state.knownProfile,
    setLastKnownProfile: (p) => {
      state.knownProfile = p
    },
  }

  return { state, adapter }
}

describe('runSync — attempts', () => {
  it('converges two devices that played interleaved, disjoint sessions', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)

    const laptop = fakeDevice()
    laptop.state.attempts = [attempt(1, { given: '3/4' }), attempt(2, { given: '5/6' })]
    await runSync(transport, 'laptop', link, laptop.adapter)

    const ipad = fakeDevice()
    ipad.state.attempts = [attempt(1, { given: '7/8' }), attempt(2, { given: '9/10' })]
    await runSync(transport, 'ipad', link, ipad.adapter)

    // iPad's own sync already pulled the laptop's rows (they landed in the
    // backend first). Laptop still needs one more sync to learn about iPad.
    await runSync(transport, 'laptop', link, laptop.adapter)

    expect(laptop.state.attempts).toHaveLength(4)
    expect(ipad.state.attempts).toHaveLength(4)

    const given = (as: readonly Attempt[]) => new Set(as.map((a) => a.given))
    expect(given(laptop.state.attempts)).toEqual(new Set(['3/4', '5/6', '7/8', '9/10']))
    expect(given(ipad.state.attempts)).toEqual(given(laptop.state.attempts))
  })

  it('does not duplicate on repeated syncs once both sides have converged', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)
    const laptop = fakeDevice()
    laptop.state.attempts = [attempt(1)]
    await runSync(transport, 'laptop', link, laptop.adapter)
    await runSync(transport, 'laptop', link, laptop.adapter)
    await runSync(transport, 'laptop', link, laptop.adapter)

    expect(laptop.state.attempts).toHaveLength(1)
  })

  it('never re-pushes an attempt pulled in from another device under this device’s own id', async () => {
    // If this guard failed, the namespaced id would get pushed by the laptop as
    // if the laptop had minted it — corrupting its origin and, on the next
    // pull, either duplicating it under a THIRD id or colliding with the real
    // ipad device the moment it syncs again.
    const transport = createFakeTransport()
    const link = await linkFor(transport)
    const pushAttempts = vi.spyOn(transport, 'pushAttempts')

    const ipad = fakeDevice()
    ipad.state.attempts = [attempt(1)]
    await runSync(transport, 'ipad', link, ipad.adapter)

    const laptop = fakeDevice()
    await runSync(transport, 'laptop', link, laptop.adapter) // pulls ipad-a000001 in
    expect(laptop.state.attempts.map((a) => a.id)).toEqual([`ipad-${attemptIdFor(1)}`])

    pushAttempts.mockClear()
    await runSync(transport, 'laptop', link, laptop.adapter) // must push nothing
    expect(pushAttempts).not.toHaveBeenCalled()
  })

  it('drops a corrupt row from the backend without losing the good ones beside it', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)

    const ipad = fakeDevice()
    // One well-formed attempt, one with a NaN difficulty — the shape a
    // truncated write or a hand-edited row could produce.
    ipad.state.attempts = [attempt(1), attempt(2, { difficulty: Number.NaN })]
    await runSync(transport, 'ipad', link, ipad.adapter)

    const laptop = fakeDevice()
    await runSync(transport, 'laptop', link, laptop.adapter)

    expect(laptop.state.attempts).toHaveLength(1)
    expect(laptop.state.attempts[0]!.id).toBe(`ipad-${attemptIdFor(1)}`)
  })
})

describe('runSync — profile (country/settings)', () => {
  it('THE SAFETY PROPERTY: a freshly linked device with no local edits never overwrites a real save', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)
    const realCountry = { name: 'Rionia', flag: {}, kit: ['#000', '#fff'], stars: 2 }

    // The laptop has a real, months-old save and syncs it up.
    const laptop = fakeDevice()
    laptop.state.country = realCountry
    laptop.state.settings = { timersEnabled: false }
    await runSync(transport, 'laptop', link, laptop.adapter)

    // A brand-new iPad links to the SAME player. It has never touched
    // country or settings — both are still exactly the defaults, and it has
    // never synced before (`knownProfile` starts `null`).
    const ipad = fakeDevice() // starts at DEFAULT_PROFILE, same as a fresh save
    const pushProfile = vi.spyOn(transport, 'pushProfile')

    await runSync(transport, 'ipad', link, ipad.adapter)

    // It must not have pushed its defaults — there was nothing of its own to offer.
    expect(pushProfile).not.toHaveBeenCalled()
    // And it must have adopted the real save instead of leaving its own blank state.
    expect(ipad.state.country).toEqual(realCountry)
    expect(ipad.state.settings).toEqual({ timersEnabled: false })
  })

  it('pushes a genuine local edit', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)

    const laptop = fakeDevice()
    laptop.state.settings = { timersEnabled: false }
    const pushProfile = vi.spyOn(transport, 'pushProfile')
    await runSync(transport, 'laptop', link, laptop.adapter)

    expect(pushProfile).toHaveBeenCalledTimes(1)

    const ipad = fakeDevice()
    await runSync(transport, 'ipad', link, ipad.adapter)
    expect(ipad.state.settings).toEqual({ timersEnabled: false })
  })

  it('does not push again once its own edit has been adopted as the known state', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)

    const laptop = fakeDevice()
    laptop.state.settings = { timersEnabled: false }
    await runSync(transport, 'laptop', link, laptop.adapter)

    const pushProfile = vi.spyOn(transport, 'pushProfile')
    await runSync(transport, 'laptop', link, laptop.adapter)
    await runSync(transport, 'laptop', link, laptop.adapter)
    expect(pushProfile).not.toHaveBeenCalled()
  })

  it('the later push wins, and the earlier device adopts it on its next sync', async () => {
    const transport = createFakeTransport()
    const link = await linkFor(transport)
    let clock = T0

    const laptop = fakeDevice()
    laptop.state.settings = { timersEnabled: false }
    await runSync(transport, 'laptop', link, laptop.adapter, () => clock++)

    const ipad = fakeDevice()
    ipad.state.settings = { timersEnabled: true, soundEnabled: false }
    clock += 1000 // strictly later than the laptop's push
    await runSync(transport, 'ipad', link, ipad.adapter, () => clock++)

    // iPad's edit is authoritative now.
    expect(ipad.state.settings).toEqual({ timersEnabled: true, soundEnabled: false })

    // Laptop syncs again with no new local edit of its own — it must adopt
    // iPad's version rather than keep insisting on its own older one.
    await runSync(transport, 'laptop', link, laptop.adapter, () => clock++)
    expect(laptop.state.settings).toEqual({ timersEnabled: true, soundEnabled: false })
  })

  it('an earlier-timestamped push loses gracefully and adopts the winner instead', async () => {
    // Not just "the loser doesn't corrupt the backend" — the loser's own
    // local state must update to the winner too, so both devices actually
    // agree after this sync rather than one silently disagreeing until its
    // next opportunity.
    const transport = createFakeTransport()
    const link = await linkFor(transport)
    let clock = T0

    const ipad = fakeDevice()
    // Not `{ timersEnabled: true }` — that is byte-identical to
    // `DEFAULT_PROFILE.settings`, so the engine would correctly see "no
    // change from what I last knew" and never push at all, which is exactly
    // the bug this file's first pass had: with nothing pushed, there was
    // nothing for the laptop's push to lose against, and the test passed for
    // the wrong reason. `soundEnabled` makes this a genuine, detectable edit.
    ipad.state.settings = { timersEnabled: true, soundEnabled: false }
    clock += 1000
    await runSync(transport, 'ipad', link, ipad.adapter, () => clock++) // sets the bar high

    const laptop = fakeDevice()
    laptop.state.settings = { timersEnabled: false }
    // Force the laptop to believe an earlier clock, so its push loses.
    await runSync(transport, 'laptop', link, laptop.adapter, () => T0)

    expect(laptop.state.settings).toEqual({ timersEnabled: true, soundEnabled: false })
  })
})

describe('runSync — failure handling', () => {
  it('reports failure rather than throwing, and touches neither attempts nor profile', async () => {
    const failing: SyncTransport = {
      createHousehold: () => Promise.reject(new Error('offline')),
      joinHousehold: () => Promise.reject(new Error('offline')),
      listPlayers: () => Promise.reject(new Error('offline')),
      createPlayer: () => Promise.reject(new Error('offline')),
      pullProfile: () => Promise.reject(new Error('offline')),
      pushProfile: (_id: string, c: ProfileSnapshot) => Promise.resolve(c),
      pushAttempts: () => Promise.reject(new Error('offline')),
      pullAttempts: () => Promise.reject(new Error('offline')),
    }

    // No transport.createHousehold/createPlayer round trip here — every
    // method on `failing` rejects, so any real household/player id would do.
    const link: Link = { householdId: 'h1', playerId: 'p1', inviteCode: 'ABC123', playerName: 'Rion' }
    const device = fakeDevice()
    device.state.attempts = [attempt(1)]
    const before = device.state.attempts

    const result = await runSync(failing, 'laptop', link, device.adapter)

    expect(result.ok).toBe(false)
    expect(result.error).toContain('offline')
    expect(device.state.attempts).toBe(before) // untouched, not partially merged
  })
})
