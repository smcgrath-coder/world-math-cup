/**
 * One sync pass: push what only this device knows, pull what only another
 * device knows, and leave everything else untouched.
 *
 * Written entirely against `SyncTransport` (see `transport.ts`), so every
 * decision in here — what counts as "this device's own" attempts, whether a
 * profile push is safe to make, how a corrupt row is handled — is testable
 * with an in-memory fake and no network. `syncEngine.test.ts` is where that
 * happens, including the two-device convergence scenario the handoff plan
 * asks for.
 *
 * Never throws. A sync failure (offline, a flaky request, a malformed
 * response) is swallowed and simply tried again on the next opportunity —
 * see the design rule in the handoff plan: no spinner, no error, no network
 * state is ever shown to the child playing. `runSync`'s caller decides what,
 * if anything, a grown-up sees about whether it worked.
 */

import { isLocallyMintedId } from '../store/storage'
import { foldRemoteAttempts } from './attemptMerge'
import type { KnownProfile, Link } from './link'
import type { SyncTransport, ProfileSnapshot } from './transport'
import type { Attempt } from '../store/types'

export interface SyncStoreAdapter {
  getAttempts(): readonly Attempt[]
  getCountry(): unknown
  getSettings(): unknown
  /** The (country: null, settings: DEFAULT_SETTINGS)-shaped value a brand-new save starts with — supplied by the caller so this module stays ignorant of the domain's actual defaults. */
  getDefaultProfile(): KnownProfile
  mergeAttempts(next: readonly Attempt[]): void
  /** Applies a profile that won last-write-wins, having already been validated by the caller — see `syncEngine`'s doc comment on why validation happens one layer up. */
  applyProfile(profile: ProfileSnapshot): void
  /**
   * What this device last knew the profile to be, or `null` if it has never
   * synced at all. Deliberately part of the adapter rather than a direct
   * import of `link.ts` here: this engine is written entirely against
   * interfaces so it can run against an in-memory fake with no browser at
   * all, and hardcoding a `localStorage`-backed module in would break that
   * for the one piece of state that decides whether a device is allowed to
   * push — see the safety-property test in `syncEngine.test.ts`, which relies
   * on being able to give two simulated devices genuinely independent state.
   */
  getLastKnownProfile(): KnownProfile | null
  setLastKnownProfile(profile: KnownProfile): void
}

export interface RunSyncResult {
  ok: boolean
  /** Present when `ok` is false, for a grown-up's "last synced" line — never surfaced to the child. */
  error?: string
}

const sameJson = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b)

/**
 * Run one sync pass against `transport` for the player named in `link`.
 *
 * Order matters and is deliberate: attempts push before pull. Pushing first
 * means that if this same call's pull also happens to return this device's
 * own rows bounced back (it always does — `pullAttempts` returns every
 * device's rows, including this one's), they are already accounted for by
 * `foldRemoteAttempts`'s own-device handling rather than racing a pull that
 * ran before the push landed.
 */
export async function runSync(
  transport: SyncTransport,
  deviceId: string,
  link: Link,
  store: SyncStoreAdapter,
  now: () => number = Date.now,
): Promise<RunSyncResult> {
  try {
    await syncAttempts(transport, deviceId, link, store)
    await syncProfile(transport, link, store, now)
    return { ok: true }
  } catch (err) {
    return { ok: false, error: err instanceof Error ? err.message : String(err) }
  }
}

async function syncAttempts(
  transport: SyncTransport,
  deviceId: string,
  link: Link,
  store: SyncStoreAdapter,
): Promise<void> {
  // Only ever push attempts this device itself minted. An attempt already
  // carrying another device's namespace (`ipad-a000042`) must never be
  // re-pushed as if this device made it — see `isLocallyMintedId`.
  const mine = store.getAttempts().filter((a) => isLocallyMintedId(a.id))
  if (mine.length > 0) {
    await transport.pushAttempts(link.playerId, deviceId, mine)
  }

  const rows = await transport.pullAttempts(link.playerId)
  const merged = foldRemoteAttempts(store.getAttempts(), deviceId, rows)
  store.mergeAttempts(merged)
}

/**
 * The safety-critical half of sync. Read this comment before touching this
 * function.
 *
 * A device only ever *pushes* its country/settings when they genuinely differ
 * from `store.getLastKnownProfile()` — the snapshot of what this device last
 * pushed or adopted. Equal means "nothing has changed here since I last
 * talked to the backend", and in that case the device only pulls: it never
 * offers its own values as a candidate.
 *
 * That guard is not incidental tidiness — it is what stops a freshly linked,
 * never-touched device from wiping a real save. A brand-new device's country
 * is `null` and its settings are the defaults; without this check, its very
 * first sync would push exactly that as a "candidate" carrying `now()` as its
 * timestamp, which — being the newest thing to run — would beat any real
 * save's last sync under plain last-write-wins and overwrite it with an empty
 * country. The fix is that a fresh device's local state and its (equally
 * fresh, equally default) known-profile compare equal, so it has nothing to
 * push and can only ever adopt what the backend already has.
 */
async function syncProfile(
  transport: SyncTransport,
  link: Link,
  store: SyncStoreAdapter,
  now: () => number,
): Promise<void> {
  const local: KnownProfile = { country: store.getCountry(), settings: store.getSettings() }
  const lastKnown = store.getLastKnownProfile() ?? store.getDefaultProfile()

  const changedLocally = !sameJson(local, lastKnown)

  if (changedLocally) {
    const winner = await transport.pushProfile(link.playerId, { ...local, updatedAt: now() })
    store.applyProfile(winner)
    store.setLastKnownProfile({ country: winner.country, settings: winner.settings })
    return
  }

  const remote = await transport.pullProfile(link.playerId)
  if (remote === null) return // Nothing has ever been pushed for this player — nothing to adopt yet.

  store.applyProfile(remote)
  store.setLastKnownProfile({ country: remote.country, settings: remote.settings })
}
